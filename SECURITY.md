# Security Policy

## Supported Versions

| Version | Supported |
|---|---:|
| main | yes |

## Reporting A Vulnerability

Do not open a public issue with exploit details. Use GitHub's private
vulnerability reporting flow when available, or contact the maintainer through
the documented private channel.

## Data And Secret Policy

- Do not commit `.env*`, API keys, OAuth secrets, service-role keys, database
  credentials, signing secrets, or private project references.
- Do not commit raw production data, private user records, private logs, or
  unfiltered screenshots.
- Do not publish private working notes, internal ledgers, or raw process logs
  by default.
- Public examples must use fake or sanitized data.

## Security Review Checklist

- [ ] Auth and authorization boundaries are documented.
- [ ] Secrets are server-only and excluded from public artifacts.
- [ ] Data access rules are documented.
- [ ] Dependency/security issues are reviewed before release.
- [ ] Error messages and logs do not expose sensitive data.
