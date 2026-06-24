# Contributing

Thanks for improving `conversation-review-cleanup`.

## Principles

- Keep the skill output short and decision-oriented.
- Treat blockers as first-class evidence.
- Preserve the current control thread.
- Prefer visible Markdown records over hidden state.
- Do not add scripts that permanently delete user data by default.

## Development

Validate the skill structure:

```bash
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py conversation-review-cleanup
```

Run the helper script:

```bash
node conversation-review-cleanup/scripts/generate_review.js --help
```

Use synthetic fixtures for tests. Do not commit private Codex sessions, real customer names, access tokens, repository secrets, or local machine paths that reveal sensitive context.

## Pull Requests

Please include:

- What behavior changed.
- Before/after examples if the output template changed.
- Safety implications if cleanup heuristics changed.
- Any known limitations.
