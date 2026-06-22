---
"@memberjunction/installer": patch
---

fix(installer): scaffold a `.gitignore` that ignores `.env` so generated projects can't leak secrets

The configure phase writes a real `.env` (DB credentials, API keys) but emitted no `.gitignore`, so a freshly scaffolded project could commit secrets to a public repo via `git init && git add .`. The phase now guarantees a `.gitignore` ignoring `.env`/`.env.*` (keeping `.env.example`). Idempotent — appends only the missing entries to an existing `.gitignore`, never rewriting user lines.
