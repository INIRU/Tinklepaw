# Contributing

Tinklepaw is maintained as a portfolio and collaboration-ready engineering
project. Contributions should be small, reviewable, and backed by verification
evidence.

## Local Workflow

1. Pick or create an issue with goal, scope, acceptance criteria, and
   verification plan.
2. Create a focused branch.
3. Keep changes small enough to review in one sitting.
4. Update docs with code when behavior, setup, architecture, data, or
   verification changes.
5. Run verification before opening or updating a PR.

## Branch And PR Expectations

- Link the issue or task.
- Explain the problem and chosen approach.
- List changed areas.
- Include verification command output.
- Add screenshots for visible UI changes.
- Record known risks, limitations, and follow-ups.

## Documentation Expectations

Update the smallest relevant docs:

- `README.md` for setup, commands, demo, or user-facing behavior.
- `docs/architecture.md` for system shape or module boundaries.
- `docs/data/**` for schema, migrations, RLS/security, data flow, indexes,
  seeds, or observability.
- `docs/adr/**` for high-cost decisions.
- `CHANGELOG.md` for visible changes.
- `ROADMAP.md` for scoped future work.

## Review Checklist

- [ ] Requirement and acceptance criteria are clear.
- [ ] Implementation matches the stated scope.
- [ ] Tests/build/QA evidence is attached.
- [ ] Docs are updated or a no-update reason is stated.
- [ ] Security, privacy, and secret handling are considered.
- [ ] Private working notes, internal ledgers, and raw process logs are not
      published.
