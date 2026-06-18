# Roadmap

## Now

| Item | Goal | Evidence |
|---|---|---|
| Reviewer-first README | Explain what Tinklepaw is, how to run it, and what to inspect first | README PR |
| Collaboration workflow | Add issue templates, PR template, and contributing guide | [PR #7](https://github.com/INIRU/Tinklepaw/pull/7) |
| Data architecture docs | Document Supabase schema, ERD, migrations, security, and observability | `docs/data/**`, `docs/adr/**` PR |

## Next

| Item | Goal | Evidence |
|---|---|---|
| Architecture overview | Make web, bot, Minecraft, Supabase, and deployment boundaries explicit | `docs/architecture.md` |
| Verification visibility | Make typecheck, tests, build, CI, and smoke checks easy to find | README and CI docs |
| Portfolio case study | Convert the engineering story into a public-safe summary | `docs/case-studies/` or README section |

## Later

| Item | Goal | Evidence |
|---|---|---|
| Re-score for GitHub pinning | Decide whether Tinklepaw is ready as a pinned flagship repo | Pinned repo scorecard |
| Roadmap refresh | Update priorities after the first docs and verification PRs land | Roadmap issue/PR |

## Non-Goals

- Do not publish private working state or raw process logs as project
  documentation.
- Do not rewrite production database migrations as part of docs-only work.
- Do not change pinned repositories before the repo is re-scored.

## Decision Log

| Date | Decision | Link |
|---|---|---|
| 2026-06-18 | Prepare collaboration templates before opening larger implementation PRs | [PR #7](https://github.com/INIRU/Tinklepaw/pull/7) |
