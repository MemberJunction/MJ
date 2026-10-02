---
"@memberjunction/cli": minor
"@memberjunction/installer": minor
---

Enhance agent-first tooling across MemberJunction with machine-readable diagnostics, hardened secret redaction, and native CLI execution trace auditing:

- **Machine-Readable Diagnostics (`mj doctor --format json`)**: Added canonical format flag and `--scope [install|runtime|ai|metadata|agent]` filtering to `mj doctor`. When JSON format is requested, suppress all terminal formatting and output structured diagnostics adhering to the `Diagnostics.toJSON()` schema, exiting non-zero on failure.
- **Diagnostic Codes & Subsystem Probes**: Added stable machine-readable check codes, scopes, contextual evidence, and actionable remediation descriptors. Added checks for `MJ_BASE_ENCRYPTION_KEY` and AI provider credentials (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`).
- **Hardened Secret Redaction**: Extended credential pattern matching in `ReportGenerator` across sensitive environment variable names (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, etc.) and high-entropy token shapes (`sk-...`, `Bearer ...`, `ghp_...`, JWTs) across file snapshots, markdown reports, and container service logs.
- **Native CLI Trace Auditing**: Updated `citizen-builder/scripts/query-run-history.sh` to delegate to native `mj ai audit agent-run`, supporting `--format json`, step-by-step inspections, error audits, and agent name filtering.
- **Citizen Agent Builder Documentation & Skills**: Detailed the complete 11-step agent engineering loop in `citizen-builder/AGENTS.md` and `README.md`, updated skill templates (`test-agent`, `package-agent`) to use native JSON auditing, and bundled updated template assets into `@memberjunction/cli`.
