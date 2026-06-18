# ADR: Supabase Schema As The Shared Data Contract

Status: proposed

Date: 2026-06-18

## Context

Tinklepaw spans multiple runtime surfaces:

- web dashboard;
- Discord bot;
- launcher;
- Minecraft integration;
- shared core packages;
- Supabase migrations and schema files.

The public repository already contains a substantial Supabase model, including
identity, points, gacha, inventory, Discord runtime state, stock/economy,
analytics, and Minecraft market/job data.

Without explicit data architecture docs, reviewers must infer the shared data
contract from SQL files and runtime code.

## Decision

Treat the Supabase schema and migrations as the shared data contract for
Tinklepaw's app surfaces.

Public documentation should maintain:

- `docs/data/README.md`;
- `docs/data/schema.md`;
- `docs/data/erd.md`;
- `docs/data/migrations.md`;
- `docs/data/security.md`;
- `docs/data/observability.md`.

Runtime/source/schema changes still belong in separate implementation PRs. This
ADR only records the documentation and collaboration boundary.

## Consequences

Positive:

- Reviewers can understand the domain model before reading runtime code.
- Future schema changes have a documented place for relationship, migration,
  and security notes.
- Portfolio reviewers can see database design, not only UI/source code.

Tradeoffs:

- Docs can drift if schema-changing PRs do not update `docs/data/**`.
- Some security/RLS details cannot be proven from public source alone and must
  stay labeled as unknown until maintainers verify them.
- Mermaid ERD is intentionally a review diagram, not a generated schema dump.

## Follow-Ups

- Link `docs/data/README.md` from the main README and architecture docs.
- Require future database PRs to update relevant `docs/data/**` files.
- Add local Supabase reset or migration verification output when the target repo
  is ready for runtime validation.
- Keep private project refs, service-role keys, production data, private
  working notes, internal ledgers, and raw process logs out of public docs.
