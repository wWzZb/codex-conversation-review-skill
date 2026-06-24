# Deletion Policy

This skill uses an aggressive but documented cleanup policy. The goal is to reduce sidebar noise while preserving sessions that still carry future work, source-of-truth decisions, or user intent.

## Always Exclude

- The current control thread that is producing the review.
- Any session the user explicitly says to keep.
- Any session that contains active work still waiting for implementation, testing, review, or handoff.

## Recommend Delete

- Sessions already summarized, archived, and not needed for follow-up.
- One-off troubleshooting sessions whose result has been captured elsewhere.
- Duplicate attempts where a later session contains the successful path.
- Unreadable, missing, permission-denied, orphaned, or index-only sessions after the failure is recorded.
- Empty or near-empty sessions with no durable decision.

## Recommend Keep

- PRD, design, product strategy, or requirements sessions.
- Skill, automation, AGENTS, workflow, or repository setup sessions that define reusable operating behavior.
- Business-sensitive handoff sessions, customer/project-specific context, or merge-request work.
- Sessions with unresolved decisions or explicit next actions.
- Sessions where deletion confidence is medium or low.

## Confidence Labels

- High: The session is summarized or failed-to-read, has no pending action, and has no durable asset value.
- Medium: The session appears finished, but the title or partial content hints at possible future reference.
- Low: The session may contain strategy, source-of-truth decisions, unfinished code, or user preference history.

## Required Record

Before recommending or performing cleanup, record:

- Session title or stable identifier.
- Reason for delete or keep.
- Failure reason for unreadable sessions.
- Whether archive/title post-processing succeeded.
- Whether deletion is only recommended or actually executed.

## Safety Boundaries

- Do not silently skip failed sessions.
- Do not create a permanent deletion automation.
- Do not claim deletion happened unless the action was actually performed.
- Prefer user-visible Markdown records over hidden state.
