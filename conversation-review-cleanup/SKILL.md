---
name: conversation-review-cleanup
description: Generate concise Codex conversation retrospectives and cleanup manifests from local Codex thread history. Use when the user asks to review recent or unsummarized Codex conversations, identify work patterns and blockers, produce two Markdown outputs, archive or mark summarized sessions, or prepare an aggressive manual deletion list without deleting the current control thread.
---

# Conversation Review Cleanup

## Overview

This skill turns noisy Codex session history into a compact operating review plus a cleanup-ready deletion note. It is optimized for repeated weekly automations where the user wants pattern recognition, blocker visibility, and decisive session hygiene rather than a long transcript summary.

## When To Use

Use this skill when the user asks for any of the following:

- A weekly or periodic Codex conversation review.
- A review of all unsummarized conversations, regardless of age.
- A fixed Markdown template for work-pattern retrospectives.
- A separate session cleanup or deletion instruction file.
- More aggressive cleanup of unreadable, stale, or already-summarized sessions.

Do not use this skill to permanently delete sessions without a user-approved deletion path. The default output is a deletion recommendation file, not an irreversible action.

## Workflow

1. Identify the current control thread and exclude it from all summary, archive, rename, and deletion actions.
2. Load the user's requested scope:
   - Default: recent sessions from the last 7 days.
   - If the user says "all unsummarized" or "time does not matter", include every session that is not already marked summarized.
3. Read each candidate's current state, title, recent turns, and available summaries.
4. Record unreadable, missing, permission-denied, or incomplete sessions explicitly in both outputs.
5. Produce exactly two Markdown files:
   - A review file using `references/output-templates.md`.
   - A session cleanup file using `references/deletion-policy.md`.
6. After the files are written, perform only the approved post-processing:
   - Archive and mark successfully summarized sessions with a summarized marker such as `已总结`.
   - Do not archive or rename the current control thread.
   - Do not create a permanent deletion automation.
7. In the final response, expose only the two Markdown files unless the user asks for implementation details.

## Output Rules

Keep the outputs short enough to read:

- Review file target length: 70-100 lines.
- Cleanup file target length: 40-70 lines.
- Tables should have at most 6 rows. Collapse the rest into counts or grouped bullets.
- Do not include a TL;DR, abstract, or "one-screen summary" section.
- The review file must contain blocker analysis. Treat blockers as first-class evidence, not a footnote.
- Prefer pattern-level conclusions over chronological recaps.
- Write in Chinese by default unless the user asks otherwise.

## Cleanup Policy

Apply a more aggressive cleanup posture than ordinary archival:

- Recommend deletion for summarized sessions that no longer need follow-up.
- Recommend deletion for unreadable, missing, orphaned, or index-only sessions after documenting the failure reason.
- Keep sessions with active work, unfinished implementation, PRDs, skills, AGENTS files, automations, business-sensitive handoffs, merge requests, or explicit user-preserve signals.
- When uncertain, keep the session but state the uncertainty.
- Never delete the current control thread.

See `references/deletion-policy.md` for the exact decision grid.

## Helper Script

When local Codex files are available, use `scripts/generate_review.js` to create an inventory-backed draft:

```bash
node conversation-review-cleanup/scripts/generate_review.js \
  --codex-home "$CODEX_HOME" \
  --out ./review-output \
  --days 7 \
  --current-thread "<current-thread-id>"
```

For an all-unsummarized pass:

```bash
node conversation-review-cleanup/scripts/generate_review.js \
  --codex-home "$CODEX_HOME" \
  --out ./review-output \
  --all-unsummarized \
  --current-thread "<current-thread-id>"
```

The script is intentionally conservative: it writes Markdown drafts and session inventory only. Use Codex thread tools or app automation tools for archive, title, or deletion actions when available and approved.

## Quality Checklist

Before finishing:

- The current control thread is excluded.
- Every included thread is either summarized or listed as failed with a reason.
- The review emphasizes themes, decision patterns, dependencies, blockers, risks, and next experiments.
- The cleanup file clearly separates delete, keep, and failed/unreadable sessions.
- The final answer links only the two produced files and briefly notes any post-processing that could not be completed.
