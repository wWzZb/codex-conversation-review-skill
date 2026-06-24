#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

function usage() {
  console.log(`Usage:
  generate_review.js [options]

Options:
  --codex-home <path>       Codex home directory. Defaults to CODEX_HOME or ~/.codex.
  --out <path>              Output directory. Defaults to current directory.
  --days <number>           Include sessions updated in the last N days. Defaults to 7.
  --all-unsummarized        Ignore date and include sessions not marked summarized.
  --current-thread <id>     Exclude the current control thread.
  --prefix <name>           Filename prefix. Defaults to codex.
  --help                    Show this help.

This script writes two Markdown drafts. It does not archive, rename, or delete sessions.`);
}

function parseArgs(argv) {
  const args = {
    codexHome: process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
    out: process.cwd(),
    days: 7,
    allUnsummarized: false,
    currentThread: "",
    prefix: "codex",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--codex-home") {
      args.codexHome = next();
    } else if (arg === "--out") {
      args.out = next();
    } else if (arg === "--days") {
      args.days = Number(next());
      if (!Number.isFinite(args.days) || args.days < 0) {
        throw new Error("--days must be a non-negative number");
      }
    } else if (arg === "--all-unsummarized") {
      args.allUnsummarized = true;
    } else if (arg === "--current-thread") {
      args.currentThread = next();
    } else if (arg === "--prefix") {
      args.prefix = next().replace(/[^a-zA-Z0-9_-]/g, "_") || "codex";
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

function readJsonLines(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { __parseError: error.message, __line: index + 1, __raw: line.slice(0, 200) };
      }
    });
}

function maybeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstValue(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return "";
}

function normalizeRecord(record, source) {
  const id = String(firstValue(record, ["id", "thread_id", "threadId", "session_id", "sessionId", "conversation_id"]));
  const title = String(firstValue(record, ["title", "thread_name", "threadName", "name", "summary", "first_user_message"]));
  const updated = firstValue(record, ["updated_at", "updatedAt", "last_updated_at", "lastModified", "mtime", "created_at", "createdAt"]);
  const created = firstValue(record, ["created_at", "createdAt", "started_at", "startedAt"]);
  const sessionPath = String(firstValue(record, ["path", "file", "session_path", "sessionPath", "jsonl_path"]));
  const archived = Boolean(firstValue(record, ["archived", "is_archived", "isArchived"]));
  const markedSummarized = /已总结|summari[sz]ed/i.test(title);

  return {
    id,
    title: title || "(untitled)",
    updatedAt: maybeDate(updated),
    createdAt: maybeDate(created),
    sessionPath,
    archived,
    markedSummarized,
    source,
    raw: record,
    parseError: record.__parseError || "",
  };
}

function findIndexFiles(codexHome) {
  const candidates = [
    "session_index.jsonl",
    "sessions/session_index.jsonl",
    "thread_index.jsonl",
    "codex/session_index.jsonl",
  ].map((item) => path.join(codexHome, item));
  return candidates.filter((file) => fs.existsSync(file));
}

function walkJsonl(dir, maxFiles = 4000) {
  const result = [];
  const stack = [dir];

  while (stack.length && result.length < maxFiles) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "cache", "plugins"].includes(entry.name)) stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        result.push(full);
        if (result.length >= maxFiles) break;
      }
    }
  }

  return result;
}

function loadSessions(codexHome) {
  const diagnostics = [];
  const records = [];
  const indexFiles = findIndexFiles(codexHome);

  if (indexFiles.length) {
    for (const file of indexFiles) {
      try {
        for (const record of readJsonLines(file)) {
          records.push(normalizeRecord(record, file));
        }
      } catch (error) {
        diagnostics.push(`Failed to read ${file}: ${error.message}`);
      }
    }
  } else {
    diagnostics.push(`No session index file found under ${codexHome}; falling back to JSONL scan.`);
    const sessionRoot = path.join(codexHome, "sessions");
    const files = fs.existsSync(sessionRoot) ? walkJsonl(sessionRoot) : [];
    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        records.push({
          id: path.basename(file, ".jsonl"),
          title: path.basename(file),
          updatedAt: stat.mtime,
          createdAt: stat.birthtime,
          sessionPath: file,
          archived: false,
          markedSummarized: /已总结|summari[sz]ed/i.test(file),
          source: "jsonl-scan",
          raw: {},
          parseError: "",
        });
      } catch (error) {
        diagnostics.push(`Failed to inspect ${file}: ${error.message}`);
      }
    }
  }

  const byId = new Map();
  for (const record of records) {
    const key = record.id || `${record.title}:${record.source}`;
    if (!byId.has(key)) byId.set(key, record);
  }

  return { sessions: [...byId.values()], diagnostics };
}

function selectSessions(sessions, args) {
  const cutoff = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
  return sessions
    .filter((session) => session.id !== args.currentThread)
    .filter((session) => {
      if (args.allUnsummarized) return !session.markedSummarized;
      return session.updatedAt && session.updatedAt >= cutoff;
    })
    .sort((a, b) => {
      const left = a.updatedAt ? a.updatedAt.getTime() : 0;
      const right = b.updatedAt ? b.updatedAt.getTime() : 0;
      return right - left;
    });
}

function dateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return date ? date.toISOString().replace("T", " ").slice(0, 16) : "unknown";
}

function tableRows(sessions, limit = 6) {
  if (!sessions.length) return "| 无 | - | - | - |";
  return sessions.slice(0, limit).map((session) => {
    const name = (session.title || session.id || "(untitled)").replace(/\|/g, "/").slice(0, 80);
    const result = session.parseError ? `无法解析：${session.parseError}` : "待总结 / 待后处理";
    const updated = formatDate(session.updatedAt);
    const id = (session.id || "-").replace(/\|/g, "/").slice(0, 64);
    return `| ${name} | ${id} | ${updated} | ${result} |`;
  }).join("\n");
}

function taskRows(sessions, limit = 6) {
  if (!sessions.length) return "| 无 | - | - |";
  return sessions.slice(0, limit).map((session) => {
    const name = (session.title || session.id || "(untitled)").replace(/\|/g, "/").slice(0, 80);
    const result = session.parseError ? `无法解析：${session.parseError}` : "待读取线程摘要后补全";
    return `| ${name} | ${result} | 待判断 |`;
  }).join("\n");
}

function buildReviewMarkdown(sessions, diagnostics, args) {
  const scope = args.allUnsummarized ? "全部未总结会话" : `最近 ${args.days} 天会话`;
  const failed = sessions.filter((session) => session.parseError);

  return `# Codex 未标记任务复盘（${dateStamp()}）

## 这次看到了什么

本文件由 conversation-review-cleanup 生成草稿，范围为${scope}。当前识别到 ${sessions.length} 个候选会话，需由 Codex 读取近期状态和 turn 摘要后补全任务判断。

一句话结论：
请把这里替换为最重要的判断，不超过 2 句话。

本轮会话主要分成几类：
- 类型 A：数量，代表会话，说明它为什么重要。
- 类型 B：数量，代表会话，说明它为什么重要。
- 类型 C：数量，代表会话，说明它为什么重要。

## 已经完成的事

| 任务 | 结果 | 是否还要跟进 |
|---|---|---|
${taskRows(sessions)}

补充说明：
这里只写那些表格放不下、但会影响判断的内容。

## 还没收口的事

| 任务 | 卡在哪里 | 下一步 |
|---|---|---|
| 待判断 | 需要读取线程摘要后确认 | 明确动作 |

如果没有未完成任务，写：本轮没有发现需要继续推进的未完成任务。

## 值得保留的资产

这些会话不只是聊天记录，后续可能还会用到：

| 资产 | 为什么保留 | 位置 / 线索 |
|---|---|---|
| 待判断 | Skill / 自动化 / PRD / 代码改动等长期价值 | 会话名或文件路径 |

## 可以清理的会话

| 会话 | 建议 | 原因 |
|---|---|---|
| 待判断 | 删除 / 归档保留 | 读取后决定 |

清理判断：
- 已总结、无后续价值：建议删除。
- 包含 Skill、自动化、PRD、业务决策、未完成工作：建议保留。
- 读不到或索引残留：记录原因后建议清理。

## 这次暴露的问题

只写 1-3 个真正影响效率的问题。

1. 问题：待补充。
   影响：待补充。
   下次怎么避免：待补充。

## 下次直接照做

1. 待补充。
2. 待补充。
3. 待补充。

## 处理记录

- 已总结：待执行。
- 已归档：待执行。
- 已加“已总结”标记：待执行。
- 建议删除：待判断。
- 建议保留：待判断。
- 无法处理：${failed.length}。

诊断信息：
${diagnostics.length ? diagnostics.map((item) => `- ${item}`).join("\n") : "- 无"}
`;
}

function buildCleanupMarkdown(sessions, diagnostics, args) {
  const summarized = sessions.filter((session) => session.markedSummarized);
  const unreadable = sessions.filter((session) => session.parseError);
  const active = sessions.filter((session) => !session.markedSummarized && !session.parseError);

  return `# Codex 会话清理清单（${dateStamp()}）

## 本次范围

- 检查范围：${args.allUnsummarized ? "全部未总结会话" : `最近 ${args.days} 天会话`}
- 排除线程：${args.currentThread || "未提供 current-thread 参数"}
- 实际处理：${sessions.length}
- 无法读取：${unreadable.length}

## 建议删除

| 会话 | 删除原因 | 信心 |
|---|---|---|
${summarized.length ? summarized.slice(0, 6).map((session) => `| ${(session.title || session.id).replace(/\|/g, "/").slice(0, 80)} | 已总结，待确认无继续跟进价值 | 中 |`).join("\n") : "| 暂无 | - | - |"}

## 建议保留

| 会话 | 保留原因 | 后续动作 |
|---|---|---|
${active.length ? active.slice(0, 6).map((session) => `| ${(session.title || session.id).replace(/\|/g, "/").slice(0, 80)} | 尚未总结或可能仍有上下文价值 | 读取后决定归档/标记/删除 |`).join("\n") : "| 暂无 | - | - |"}

## 已执行

- 已归档：脚本未执行归档。
- 已改名：脚本未执行改名。
- 已标记：脚本未执行标记。
- 未执行：脚本只生成草稿，不直接改动会话。

## 风险提醒

- 无法读取 / 解析异常：${unreadable.length}。
- 脚本只做索引草稿，最终删除/保留必须由 Codex 读取线程摘要后判断。
- 删除信心不足的会话应先保留为归档状态，等待用户确认。
- 不永久删除当前控制线程，不创建自动永久删除任务。

诊断信息：
${diagnostics.length ? diagnostics.map((item) => `- ${item}`).join("\n") : "- 无"}
`;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }

  const { sessions, diagnostics } = loadSessions(args.codexHome);
  const selected = selectSessions(sessions, args);
  fs.mkdirSync(args.out, { recursive: true });

  const stamp = dateStamp();
  const reviewPath = path.join(args.out, `${args.prefix}_task_review_${stamp}.md`);
  const cleanupPath = path.join(args.out, `${args.prefix}_session_cleanup_${stamp}.md`);

  fs.writeFileSync(reviewPath, buildReviewMarkdown(selected, diagnostics, args));
  fs.writeFileSync(cleanupPath, buildCleanupMarkdown(selected, diagnostics, args));

  console.log(JSON.stringify({
    reviewPath,
    cleanupPath,
    selectedSessions: selected.length,
    diagnostics,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
