---
"@memberjunction/feature-pipelines": minor
"@memberjunction/feature-pipelines-engine": minor
"@memberjunction/actions-apollo": minor
"@memberjunction/actions-base": minor
"@memberjunction/actions-bizapps-accounting": minor
"@memberjunction/actions-bizapps-crm": minor
"@memberjunction/actions-bizapps-formbuilders": minor
"@memberjunction/actions-bizapps-lms": minor
"@memberjunction/actions-bizapps-social": minor
"@memberjunction/actions": minor
"@memberjunction/communication-types": minor
"@memberjunction/notifications": minor
"@memberjunction/communication-ms-graph": minor
"@memberjunction/cli": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/storage": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/work-queue-aws": minor
"@memberjunction/work-queue-engine": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/task-graph": minor
"@memberjunction/ng-task-graph-editor": minor
"@memberjunction/ng-ai-test-harness": minor
---

Actions, scheduling, notifications and work-queue fixes (minor because HubSpot and LearnWorlds actions gain a `CompanyIntegrationID` param in metadata).

- Business Central posts to the connection's `ExternalSystemID` only, reads its Credential through `CredentialEngine`, and takes `AuthorityHost` from the Credential within an Entra ID allow list. A connection that kept its company only on the Credential must now set `ExternalSystemID`. QuickBooks `GetGLEntries` filters by `DocumentNumber`.
- Dropbox `ListObjects` returns every page and `SearchFiles` pages with a real cursor (`FileSearchOptions.pageToken`); Apollo retries a 429 with `Retry-After` up to 120 s.
- MS Graph `ForwardMessage` reads the mailbox from `ContextData.Email`; received messages carry `Direction` and `BCCRecipients`.
- Notification email/SMS go through `NOTIFICATION_EMAIL_PROVIDER` / `NOTIFICATION_SMS_PROVIDER` or `notifications.emailProvider` / `smsProvider` in `mj.config.cjs`; malformed `SecondaryScopes` rows are skipped and refused at save; uncached recipients get their roles read.
- Engine-made action outcomes record `INPUT_VALIDATION_FAILED`, `PREVENTED_BY_FILTER`, `TIMEOUT` or `ABORTED`; Twitter delete checks ownership; Twitter and Instagram schedule actions return `NOT_SUPPORTED`; CRM, FormBuilders and LMS resolve their connection through `ResolveCompanyIntegration`.
- The scheduler reloads jobs written without a cache event; scheduled actions receive `Context.ScheduledJobRunID` and `Context.Heartbeat`; Feature Pipelines refuse lookup settings on a non-FK target. The Record Set Processing guide now uses the PascalCase option names (`Source`, `Processor`, `ContextUser`, `BatchSize`, `MaxConcurrency`, `TriggeredBy`, `DryRun`, `Scope`).
- `mj queue work` mints a provider per delivery above `--concurrency 1` and sweeps/reconciles when long-running; new `mj queue sweep`; SQS dead-letter copies carry `mj_source_message_id`.
- Workflow breakpoints can be remembered per user and workflow: steps carry a stable `Configuration.stepId`, `taskGraphDebug.breakpointStepIDs` seeds them on a Debug run, and the debugger's step menu offers Remember / Stop Remembering where the host stores them (the AI test harness does).
