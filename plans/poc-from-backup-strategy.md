# MemberJunction Legacy Backup POC Pathway

**Status:** Draft v1.0
**Owner:** Amith Nagarajan
**Last Updated:** May 12, 2026
**Audience:** MJ delivery team, Claude Code agents, sales engineering

---

## 1. Purpose

This document defines the standard process for spinning up a MemberJunction (MJ) Proof of Concept (POC) from a client's **legacy database backup**. It is one of two POC pathways supported by the MJ delivery team:

1. **Integrations Engine POC** — when the client's source system exposes APIs and one of our existing connectors (or a quickly built new one) can sync data into a fresh MJ environment. *This pathway is well documented elsewhere and is generally low-friction.*
2. **Legacy Backup POC (this document)** — when the client provides a database backup (typically because their legacy system has no usable API, or a backup is simply the fastest path to value). The backup is restored, MJ is installed on top, and the client gets immediate hands-on access to the platform's full feature set against their own data.

### Why this pathway exists

For many clients, especially in the association/nonprofit space, the legacy system is the system of record and an API integration is weeks or months away. A backup-based POC lets us demonstrate MJ's full value — agent framework, Skip analytics, Query Builder, Data Explorer, geocoding, clustering, all of it — in **days**, against their own data. Even if half the legacy schema is unusable, the half that works is more than enough to drive a "we need to do this for real" conversation.

### What this is NOT

- This is **not** a production deployment path. We never install MJ on top of a client's production system.
- This is **not** a permanent solution. The POC has a defined lifecycle (see Section 9).
- This is **not** a substitute for proper ETL or API integration in the eventual real project.

---

## 2. Core Principles

1. **Speed over perfection.** The goal is to get the client hands-on with MJ against their own data as quickly as possible. A POC with two-thirds of the schema working is a win.
2. **Tolerance over rigor.** Legacy databases are messy. Our tooling should log warnings and proceed, not die. Humans review the warnings, not every broken view.
3. **Document everything that's stripped, skipped, or warned.** The client should always know exactly what's missing and why.
4. **Default to proceed; escalate on material variance.** If preflight discovers >20% of objects in a warning/error state, pause for human approval. Otherwise, keep moving.
5. **Hand over the keys.** After the demo, the client gets 30 days of direct access. This is non-negotiable to building trust.

---

## 3. Assumptions & Constraints

| Area | Assumption |
|---|---|
| **Hosting** | All POC environments are spun up on **MJC (MemberJunction Central)**. No client-managed infrastructure. |
| **Database scope** | The legacy data lives in a **single database**. Multi-database deployments are not supported in cloud-managed instances (Azure SQL, RDS) used by MJC. |
| **Database platforms** | SQL Server (deployed as Azure SQL) and PostgreSQL (deployed as RDS) are the supported targets. |
| **Backup formats** | **SQL Server:** `.bacpac` preferred; `.bak` accepted and converted by our team. **Postgres:** standard backup formats accepted directly. |
| **PII** | **Clients are welcome (but not required) to strip PII or other sensitive data before sending the backup.** We handle whatever they send under the security practices in Section 7. See Section 4.1. |
| **POC duration** | ~30 days of client-accessible runtime after demo handoff. |
| **Data scale** | No hard cap, but very large databases may need scoping conversations before restore. |

---

## 4. Standard Process Flow

```
[Client backup arrives]
        ↓
[Step 0: PII conversation & client prep]
        ↓
[Step 1: Format conversion (if needed)]
        ↓
[Step 2: Restore to MJC environment]
        ↓
[Step 3: DBAutoDoc preflight]
        ↓
[Step 4: Review preflight output; threshold check]
        ↓
[Step 5: MJ migrate + install (tolerant mode)]
        ↓
[Step 6: Codegen (consuming additionalSchemaInfo.json)]
        ↓
[Step 7: Validation & smoke test]
        ↓
[Step 8: Demo to client]
        ↓
[Step 9: Hand over the keys (30-day window)]
        ↓
[Step 10: Transition to real project or sunset]
```

### 4.1 Step 0 — Pre-backup client conversation

Before the client sends anything, the account/sales team should walk them through:

- **PII stripping (optional, client's call):** We suggest to clients that if they have PII or other sensitive data they'd prefer not to share, they're welcome to strip or anonymize it before sending the backup. Common candidates include member names, emails, phone numbers, payment data, donor records, SSNs, and employee records. Our team can advise on which tables/columns are typically safe to scrub without breaking schema relationships if asked. **This is a suggestion, not a requirement** — many clients are comfortable sending full data, and we handle whatever they provide under the security practices defined in Section 7.
- **Backup format expectations:** SQL Server `.bacpac` is the fast path; `.bak` works but requires our conversion step.
- **What we're going to do with it:** Mount it on MJC, install MJ on top, demo it, then give them access for ~30 days. After that, the environment is sunset or transitioned to a real project.
- **Scope:** Single database, single schema-of-record. If they have multiple source systems, we pick one for the POC.

### 4.2 Step 1 — Format conversion

**SQL Server:** If client provided a `.bak` file, convert to `.bacpac` for Azure SQL deployment. Document the conversion as potentially lossy (some SQL Server features don't survive `.bacpac` round-tripping); for POC purposes this is acceptable.

**Postgres:** Standard backup → RDS restore. No conversion needed.

### 4.3 Step 2 — Restore to MJC environment

Provision a fresh MJC environment for the POC. The MJC operations team handles this; no client infrastructure involvement.

### 4.4 Step 3 — DBAutoDoc preflight

Run DBAutoDoc against the restored database **before** MJ migrate/install. DBAutoDoc produces:

- A structured **JSON schema** describing all discovered objects.
- Human-readable **HTML and Markdown** documentation.
- A **SQL file** with `sp_addextendedproperty` (SQL Server) or `COMMENT ON` (Postgres) statements that annotate the database with discovered metadata.
- **`additionalSchemaInfo.json`** — the critical file for the next phase. This contains organic keys, soft keys, and other metadata that Codegen consumes natively.

DBAutoDoc also surfaces problem areas: broken views, cross-database references, orphaned objects, tables with no primary keys, etc. These are logged for review in Step 4.

### 4.5 Step 4 — Review preflight output; threshold check

Before proceeding, review DBAutoDoc's findings:

- **Default behavior: proceed.** Log all warnings, note what will be skipped or treated as soft-key, and continue to migration.
- **Escalation threshold: >20% of objects in a warning/error state** → pause for human approval. In most cases the human will say "proceed anyway" because the goal is a POC, not a perfect migration, but the pause exists so we don't blindly march into a situation where 80% of the schema is unusable.
- Tables with no primary keys and no inferable soft key → flagged as **skipped for POC**. Document them. The client can be told these can be brought in during the real project once we understand them better.

### 4.6 Step 5 — MJ migrate + install (tolerant mode)

Run the MJ migration and install. This step requires the software changes described in Section 5 — specifically, `sp_RecompileAllViews` and similar operations must **log broken objects and continue**, not die on the first failure. Migration can run in parallel with DBAutoDoc if needed for time, but the recommended order is preflight-first so any abort decisions happen before we commit to migration.

### 4.7 Step 6 — Codegen

Run Codegen pointed at the migrated database. Codegen consumes `additionalSchemaInfo.json` natively, applying soft keys and organic key metadata as it generates MJ entities and views. Codegen should also be tolerant of objects DBAutoDoc flagged as problematic — skip and log, don't die.

### 4.8 Step 7 — Validation & smoke test

Before the demo, the delivery team validates:

- MJ admin UI loads and authenticates.
- Entity list reflects the expected core tables from the legacy database.
- A handful of representative entities can be browsed, filtered, and queried.
- Skip can run a basic analytic query against at least one substantial table.
- Query Builder produces a working query.
- The agent framework responds to a basic prompt.

This is a **smoke test, not exhaustive QA.** If the core feature set demonstrates well against the data, we're ready.

### 4.9 Step 8 — Demo

Live demo to the client. The delivery team walks through MJ's capabilities **against the client's own data**, which is where the magic happens. Include:

- Entity browsing and filtering
- Skip-driven analytics on something meaningful (memberships, events, donations, whatever is most resonant for that client)
- A live agent interaction
- Query Builder
- A geospatial or clustering example if data supports it

Be transparent about what was stripped, skipped, or warned — the documentation from DBAutoDoc supports this conversation.

### 4.10 Step 9 — Hand over the keys

After the demo, give the client direct access for ~30 days. Provide:

- Login credentials and access instructions
- A "what to try first" quickstart (top 5–10 things to explore)
- A support touch point (Slack channel, email, scheduled check-ins)
- Clear expectations: this environment is not production, data won't persist past the POC window, support is best-effort

### 4.11 Step 10 — Transition or sunset

At the end of the 30-day window:

- **If the client moves forward with a real project:** Spin up a fresh production-style environment and begin proper ETL or integrations engine work. The POC environment can be preserved as a reference for a short period if useful, but the real project starts clean. Preserve `additionalSchemaInfo.json` and DBAutoDoc outputs — they're valuable to the real project team.
- **If the client passes:** Archive the documentation and DBAutoDoc outputs, then tear down the MJC environment.

---

## 5. Required Software Changes

| Component | Change | Priority |
|---|---|---|
| `sp_RecompileAllViews` | Replace fail-fast behavior with log-and-continue. Emit clear console warnings listing each broken view with the underlying error. | **High** — blocks current POCs |
| Migration scripts (broader) | Audit all migration steps for similar fail-fast patterns where tolerance is appropriate. Convert to log-and-continue with warning-level output. | **High** |
| Codegen | Ensure Codegen logs and skips problematic objects (broken views, orphaned references, cross-database refs) rather than failing the run. | **High** |
| DBAutoDoc | Confirm `additionalSchemaInfo.json` output schema covers everything Codegen needs for soft-key and organic-key handling in legacy schemas. Add any missing fields if discovered. | **Medium** |
| Preflight orchestration | A wrapper script (or slash command) that runs DBAutoDoc, evaluates the threshold, and either proceeds or pauses for human approval. | **Medium** |
| Documentation surface | Console output and a structured report file (JSON + Markdown) that lists everything stripped, skipped, or warned. Shared with the client. | **Medium** |

**Note on tolerance philosophy:** The principle is that *if a broken object is never referenced at runtime, it shouldn't kill the install*. Logging gives admins visibility to fix what matters; dying gives them a debugging session.

---

## 6. Decision Points & Human Approval

| Decision | Default | Escalate when |
|---|---|---|
| Proceed with migration after preflight? | Yes | >20% of objects in warning/error state |
| Include tables with no PK and no inferable soft key? | Skip and document | Never auto-include; only include if explicitly approved |
| Cross-database references in views? | Skip and document | Always log; only attempt resolution if client confirms the referenced DB will be supplied |
| Backup conversion lossiness acceptable? | Yes, for POC | If client expresses concerns about specific lost features, surface |
| PII present in backup? | Handle per security practices (Section 7) regardless of whether stripped | If we discover obvious PII the client may not have intended to share, raise immediately |

---

## 7. Security Practices

The legacy backup POC pathway necessarily involves handling client data — often production data from the system of record. Even though clients may strip PII before sending, **we treat every backup as if it contains sensitive data** and apply the practices below consistently.

### 7.1 Backup transfer

- **Use encrypted transfer channels only.** Acceptable mechanisms: SFTP with key-based auth, S3 with signed URLs and short expirations, Azure Blob with SAS tokens, or a secure file-sharing service approved by Blue Cypress. Plain email attachments are not acceptable for backups of any meaningful size or sensitivity.
- **Log who transferred what, when, and to where.** A simple intake ticket per POC capturing client name, date received, file hash, and recipient is sufficient.

### 7.2 Local handling of temporary files

When backup files are downloaded to a delivery engineer's local machine (for example, to perform `.bak` → `.bacpac` conversion before uploading to MJC):

- **Hard-delete temporary files immediately after use.** Empty trash. On macOS, use `rm -P` or `srm` for secure overwrite where available; on Windows, use `sdelete` or equivalent. The file should not sit in Downloads, Trash, or any cloud-synced folder after the POC migration step completes.
- **Never store backups in cloud-synced folders.** No Dropbox, no iCloud Drive, no OneDrive, no Google Drive auto-sync directories. If the working directory is on a synced volume, move the file out before working with it.
- **Encrypt at rest if work spans more than a single session.** Use macFUSE + Cryptomator (already standard for the team) or an equivalent encrypted volume. Plaintext backups should not persist on disk overnight.
- **No backups on personal devices.** Work happens on Blue Cypress-managed equipment only.

### 7.3 MJC POC environment

- **Provision each POC in a fresh, isolated environment.** No data co-mingling across clients or POCs.
- **Access controls:** Only the assigned delivery team and the client's designated users have access. No shared admin accounts.
- **Authentication:** Use the standard MJC SSO/auth flow. No exceptions for "quick" POCs.
- **Network restrictions:** Default to public access for the MJC web UI (clients need to reach it) but ensure database endpoints are not publicly addressable.
- **Audit logging:** MJC's standard audit logging applies. Confirm it's enabled before handover.

### 7.4 Credential handling

- **No client credentials in chat, email, tickets, or repos.** Use a secret manager (1Password team vault, Azure Key Vault, AWS Secrets Manager, or equivalent) for any credentials related to the POC.
- **Rotate any credentials we generate at the end of the POC.** Don't reuse POC admin passwords for any other purpose.
- **Service accounts for automation only.** Slash command and agent automation use dedicated service accounts with scoped permissions, not personal credentials.

### 7.5 Client access window

- **Time-box the client's access.** ~30 days from demo, then access is revoked unless the engagement converts to a real project.
- **No credential sharing on the client side.** We give the client primary admin credentials; they manage user additions inside MJC themselves.
- **Make data-loss expectations clear at handover.** The client should know that data in the POC environment is not backed up for long-term retention and will be destroyed at sunset.

### 7.6 Sunset & data destruction

When a POC concludes (either transitions to real project or client passes):

- **Securely destroy the MJC environment.** Database, application instance, and any associated storage. MJC ops follows the standard teardown checklist.
- **Securely destroy any remaining local copies of the backup.** Verify with each team member who touched the backup that their local copy is gone.
- **Retain only documentation, not data.** DBAutoDoc outputs (schema descriptions, `additionalSchemaInfo.json`) may be retained if useful for a real-project handoff, but only after confirming they contain no embedded data samples or PII.
- **Document the sunset.** Update the POC intake ticket with sunset date and confirmation that data has been destroyed.

### 7.7 Incident handling

If at any point during a POC we encounter unexpected exposure — a backup ending up somewhere it shouldn't, credentials leaking, or signs of unauthorized access — escalate immediately to the Blue Cypress security lead and the engagement owner. **Don't try to quietly clean up; document and escalate.**

---

## 8. Roles & Responsibilities

| Role | Responsibilities |
|---|---|
| **Sales / Account team** | Pre-backup client conversation (Section 4.1), PII disclosure, scope-setting |
| **MJC operations** | Environment provisioning, backup restore, conversion if needed |
| **Delivery engineer** | DBAutoDoc run, preflight review, MJ migrate/install, Codegen, smoke test |
| **Demo lead** | Live demo, client handoff, 30-day support touchpoints |
| **Claude Code / agents** | Can execute the documented steps semi-autonomously via slash command (see Section 8) |

---

## 9. Automation via Claude Code

A slash command — provisionally `/mj-legacy-poc` — should be built to orchestrate this entire flow for Claude Code and other agents. The slash command should reference this document and execute the following:

1. Accept inputs: backup file path/URL, target MJC environment ID, client name, optional notes
2. Detect backup format; convert if needed
3. Trigger restore to MJC environment
4. Run DBAutoDoc; capture all outputs
5. Evaluate threshold; pause for human approval if exceeded
6. Run MJ migrate + install in tolerant mode
7. Run Codegen consuming `additionalSchemaInfo.json`
8. Run automated smoke tests
9. Produce a final status report (Markdown + JSON) covering: tables loaded, tables skipped, views warned, soft keys applied, demo-ready status

The slash command should be **idempotent and resumable** — if any step fails, the agent should be able to pick up from the last good state rather than restarting from scratch.

---

## 10. POC Lifecycle Summary

| Phase | Duration | Owner |
|---|---|---|
| Pre-backup conversation | 1–3 days | Sales / Account |
| Backup transfer + restore | 1 day | MJC ops |
| Preflight + migrate + install + Codegen | 1–2 days | Delivery |
| Smoke test + demo prep | 1 day | Delivery |
| Demo | ~1 hour | Demo lead |
| **Client hands-on access** | **~30 days** | **Client (with our support)** |
| Sunset or transition | 1 day | Delivery / Ops |

**Target total time from backup-in-hand to demo: 3–5 business days.**

---

## 11. Open Questions / Future Work

- **Automated PII detection:** Should we offer an optional pre-restore scan that flags likely PII columns for the client as an informational courtesy? Stripping remains the client's option, but a "here's what we found" report could be a useful value-add. Adds complexity; weigh against demand.
- **Multi-database POCs:** If a client's data is spread across multiple databases, is there a defined path? Currently scope is one DB; we may need a documented "pick one" or "merge before restore" approach.
- **POC-to-real-project metadata continuity:** Formalize the handoff of `additionalSchemaInfo.json` and DBAutoDoc outputs into the real project workflow, including any human curation that happened during the POC.
- **Cost/sizing guidance:** Add guidance on MJC environment sizing relative to backup size and table counts, so ops can right-size from the start.
- **Telemetry:** Capture metrics across POCs — how often we hit the 20% threshold, which legacy systems generate the most issues, average time-to-demo, conversion rate to real project. Feeds back into improving this process.

---

## 12. Revision History

| Version | Date | Notes |
|---|---|---|
| 1.0 | May 12, 2026 | Initial draft based on team conversation. Captures core flow, software changes needed, automation strategy, and client handling. |
| 1.1 | May 12, 2026 | Added Section 7 (Security Practices) covering backup transfer, local file handling with hard-delete requirements, MJC environment controls, credential handling, client access window, sunset/data destruction, and incident handling. Reframed PII guidance from "client's responsibility" to "client's option" — we suggest but don't require PII stripping, and we apply consistent security practices regardless. |