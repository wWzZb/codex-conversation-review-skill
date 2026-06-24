# Codex Conversation Review Skill

Turn a crowded Codex thread history into two useful files: a readable task review and a cleanup-ready session checklist.

This project packages a reusable Codex skill named `conversation-review-cleanup`. It was designed for weekly automation, but it also works for one-off reviews of every unsummarized session.

## What It Does

- Reviews recent or unsummarized Codex conversations.
- Identifies completed work, unfinished tasks, retained assets, cleanup candidates, exposed problems, and next actions.
- Produces a reader-first Markdown task review.
- Produces a separate session cleanup checklist with delete/keep/executed/risk groups.
- Scans both the session index and orphaned archived JSONL files so older archived conversations are not silently missed.
- Uses an aggressive cleanup posture while protecting the current control thread and unfinished work.
- Includes a small zero-dependency Node.js helper for inventory-backed draft generation.

## Install

Copy the skill folder into your Codex skills directory:

```bash
cp -R conversation-review-cleanup ~/.codex/skills/
```

Then ask Codex to use the skill:

```text
Use the conversation-review-cleanup skill to review all unsummarized Codex sessions.
Generate only the review Markdown file and the cleanup Markdown file.
Exclude the current control thread.
```

## Helper Script

The helper script writes draft Markdown files from local Codex session metadata. It does not archive, rename, or delete sessions.

```bash
node conversation-review-cleanup/scripts/generate_review.js \
  --codex-home "$HOME/.codex" \
  --out ./review-output \
  --days 7
```

For all unsummarized sessions:

```bash
node conversation-review-cleanup/scripts/generate_review.js \
  --codex-home "$HOME/.codex" \
  --out ./review-output \
  --all-unsummarized
```

## Output Files

The skill exposes only two user-facing files:

- `codex_task_review_YYYY-MM-DD.md`
- `codex_session_cleanup_YYYY-MM-DD.md`

The review file answers: what happened, what is done, what remains open, what should be kept, what can be cleaned, and what to do next. The cleanup file is intentionally plain: scope, delete list, keep list, executed actions, and risks.

## Contributing

Good contribution areas:

- Better parsers for different Codex session index formats.
- Stronger deletion-confidence heuristics.
- More concise Chinese and English output templates.
- Safer integrations with thread archive/title tools.
- Test fixtures that do not expose private conversation content.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Safety

This project is intentionally conservative about irreversible operations. It can recommend deletion, but it does not create a permanent deletion automation and the helper script does not delete local session data.

## License

MIT
