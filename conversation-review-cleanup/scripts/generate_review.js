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
  const title = String(firstValue(record, ["title", "name", "summary", "first_user_message"]));
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

function buildReviewMarkdown(sessions, diagnostics, args) {
  const scope = args.allUnsummarized ? "全部未总结会话" : `最近 ${args.days} 天会话`;
  const failed = sessions.filter((session) => session.parseError);

  return `# Codex 对话工作模式复盘（${dateStamp()}）

## 高度总结

本文件由 conversation-review-cleanup 生成草稿，范围为${scope}。当前识别到 ${sessions.length} 个候选会话，需由 Codex 读取近期状态和 turn 摘要后补全模式判断。

请把这里替换为 4-6 个短段落：说明本轮主要工作主题、决策模式、交付节奏、信息依赖方式，以及真正拖慢推进的因素。不要写流水账。

## 工作模式画像

- 推进方式：待根据会话内容归纳。
- 依赖方式：待识别用户输入、工具能力、外部仓库、自动化记忆之间的依赖。
- 决策方式：待识别是先试跑、先设计、还是边清理边固化规则。
- 验证方式：待识别是否有文件验证、脚本验证、手动确认或工具后处理。
- 收尾方式：待记录归档、改名、删除说明和剩余风险。

## 卡点

- 卡点 1：
  触发场景：待补充。
  影响：待补充。
  下次识别信号：待补充。
  建议动作：待补充。
- 卡点 2：
  触发场景：待补充。
  影响：待补充。
  下次识别信号：待补充。
  建议动作：待补充。
- 卡点 3：
  触发场景：待补充。
  影响：待补充。
  下次识别信号：待补充。
  建议动作：待补充。

## 固化风险

- 风险：待补充。
  表现：待补充。
  可能后果：待补充。
  预防动作：待补充。

## 改进建议

1. 动作：待补充。
   适用场景：待补充。
   成功标准：待补充。
2. 动作：待补充。
   适用场景：待补充。
   成功标准：待补充。
3. 动作：待补充。
   适用场景：待补充。
   成功标准：待补充。

## 阶段 OKR

Objective：待补充。

Key Results：

1. KR：待补充。
2. KR：待补充。
3. KR：待补充。

本周可执行步骤：

1. 待补充。
2. 待补充。
3. 待补充。

## 已处理对话清单

| 会话 | ID | 最近更新时间 | 处理结果 |
|---|---|---|---|
${tableRows(sessions)}

${failed.length ? `无法处理会话数：${failed.length}` : "无法处理会话数：0"}

诊断信息：
${diagnostics.length ? diagnostics.map((item) => `- ${item}`).join("\n") : "- 无"}
`;
}

function buildCleanupMarkdown(sessions, diagnostics, args) {
  const summarized = sessions.filter((session) => session.markedSummarized);
  const unreadable = sessions.filter((session) => session.parseError);
  const active = sessions.filter((session) => !session.markedSummarized && !session.parseError);

  return `# Codex 会话删除说明（${dateStamp()}）

## 删除小结

本文件由 conversation-review-cleanup 生成草稿。当前候选会话 ${sessions.length} 个，其中已带总结标记 ${summarized.length} 个，读取异常 ${unreadable.length} 个，仍需人工或 Codex 判断 ${active.length} 个。

删除策略偏积极：已总结且无后续价值的会话建议删除；缺失、读取失败、索引残留类会话在记录原因后建议清理；包含未完成任务、关键资产、自动化规则、PRD、Skill 或明确保留信号的会话建议保留。

## 建议手动删除

| 会话 | 原因 | 删除信心 | 备注 |
|---|---|---|---|
${summarized.length ? summarized.slice(0, 6).map((session) => `| ${(session.title || session.id).replace(/\|/g, "/").slice(0, 80)} | 已总结，待确认无继续跟进价值 | 中 | ${formatDate(session.updatedAt)} |`).join("\n") : "| 暂无 | - | - | - |"}

## 建议保留

| 会话 | 保留原因 | 后续动作 |
|---|---|---|
${active.length ? active.slice(0, 6).map((session) => `| ${(session.title || session.id).replace(/\|/g, "/").slice(0, 80)} | 尚未总结或可能仍有上下文价值 | 读取后决定归档/标记/删除 |`).join("\n") : "| 暂无 | - | - |"}

## 无法处理但建议清理

| 会话 | 问题 | 建议 |
|---|---|---|
${unreadable.length ? unreadable.slice(0, 6).map((session) => `| ${(session.title || session.id).replace(/\|/g, "/").slice(0, 80)} | ${session.parseError.replace(/\|/g, "/")} | 记录后删除 |`).join("\n") : "| 暂无 | - | - |"}

## 已执行后处理

- 已归档：脚本未执行归档。
- 已加“已总结”标记：脚本未执行改名。
- 未处理及原因：脚本只生成草稿，不直接改动会话。

## 不执行的动作

- 不永久删除当前控制线程：${args.currentThread || "未提供 current-thread 参数"}。
- 不创建自动永久删除任务。
- 不删除未被记录到本说明里的会话。

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
  const reviewPath = path.join(args.out, `${args.prefix}_conversation_review_${stamp}.md`);
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
