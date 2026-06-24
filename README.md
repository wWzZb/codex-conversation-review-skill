# Codex Conversation Review Skill

Turn a crowded Codex thread history into two useful files: a concise work-pattern retrospective and a cleanup-ready deletion note.

This project packages a reusable Codex skill named `conversation-review-cleanup`. It was designed for weekly automation, but it also works for one-off reviews of every unsummarized session.

## What It Does

- Reviews recent or unsummarized Codex conversations.
- Identifies work themes, decision patterns, blockers, repeated risks, and next actions.
- Produces a fixed Markdown review file.
- Produces a separate session cleanup file with delete/keep/unreadable groups.
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

- `codex_conversation_review_YYYY-MM-DD.md`
- `codex_session_cleanup_YYYY-MM-DD.md`

The review file focuses on themes, blockers, risks, and the next operating experiment. The cleanup file focuses on what to delete, what to keep, what failed to read, and why.

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
