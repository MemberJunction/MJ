# Diagnostic Bundles Guide

This guide covers the **MemberJunction Diagnostic Bundles** subsystem end-to-end:
1. How client and server diagnostic capture works (`Snapshot`, `Record`, and `Watch` modes)
2. How `.mjdiag` archives are scrubbed, verified, and encrypted (`MJDB` v1 envelope)
3. How to configure an MJ instance to **submit** diagnostic bundles (or download them locally)
4. How to set up any MJAPI instance as a **receiving server** (`/diagnostics/intake/v1`), including **MJStorage Quarantine-then-Promote locations**, **Malware Scanning** (AWS GuardDuty, Azure Defender, ClamAV/Webhook, and structural verification), and **Collector Key Custody** (`MJ: Credentials`)
5. How to inspect, re-scrub, and export bundles with the `mj diag` CLI

---

## 1. Architecture Overview

```mermaid
flowchart LR
    subgraph Client["Browser (@memberjunction/ng-diagnostics)"]
        CLog["RegisterLoggerSink + Console"]
        CSpan["TelemetryManager Spans"]
        CBuf["In-Memory Ring Buffers + Breadcrumbs"]
    end

    subgraph Server["Customer MJAPI (@memberjunction/diagnostics-server)"]
        ALS["AsyncLocalStorage Context"]
        SLog["Logger Sink + Deduplicated Console Tap"]
        SSql["ISqlObserver (Normalized SQL)"]
        SApollo["Apollo Span Plugin"]
        Chunks[("MJ: Diagnostic Session Chunks")]
        Assembler["Bundle Assembler + Scrubber + Findings"]
    end

    subgraph Archive[".mjdiag Archive & MJDB Envelope"]
        Zip["Zero-Dep STORED/DEFLATE ZIP (.mjdiag)"]
        Env["MJDB v1 (X25519 + HKDF-SHA256 + AES-256-GCM)"]
    end

    subgraph Receiver["Receiving MJAPI (/diagnostics/intake/v1)"]
        PreCheck["MJDB Header & KeyID Pre-Check"]
        QStore[("MJStorage: Quarantine Bucket")]
        Decrypt["AEAD Decrypt + VerifyBundleArchive"]
        AV["IDiagnosticMalwareScanner"]
        VStore[("MJStorage: Verified Bucket")]
    end

    CLog --> Assembler
    CSpan --> Assembler
    CBuf --> Assembler
    ALS --> SLog & SSql & SApollo
    SLog & SSql & SApollo --> Chunks --> Assembler
    Assembler --> Zip --> Env
    Env --> PreCheck --> QStore --> Decrypt --> AV --> VStore
```

### Packages

| Package | Layer | Responsibility |
| --- | --- | --- |
| [`@memberjunction/diagnostics`](../packages/Diagnostics/Core/README.md) | L0 (Isomorphic, zero external runtime deps) | Ring buffers, `.mjdiag` ZIP reader/writer, `VerifyBundleArchive`, two-stage `DiagnosticScrubber`, X25519/AES-256-GCM/Ed25519 `MJDB` envelope crypto, automated findings engine, Perfetto & OTLP exporters, `BaseDiagnosticContributor`. |
| [`@memberjunction/diagnostics-server`](../packages/Diagnostics/Server/README.md) | Server (`MJAPI`) | `DiagnosticSessionManager`, `AsyncLocalStorage` request/session context, 3-stage `DiagnosticsServerMiddleware`, `ISqlObserver` hook, chunk persistence, `.mjdiag` assembly, single-use HMAC download tokens, outbound MJC transport, standard `/diagnostics/intake/v1` receiver, malware scanners, Remote Operations, and retention purge job driver. |
| [`@memberjunction/ng-diagnostics`](../packages/Angular/Generic/diagnostics/README.md) | Angular Generic (`widgets` layer) | `MJDiagnosticsService` (runs listeners inside `NgZone.runOutsideAngular()`), `<mj-diagnostic-recording-banner>`, `<mj-diagnostic-report-problem-dialog>`, and `<mj-diagnostic-bundle-viewer>`. |

---

## 2. Two-Stage Scrubbing Model

Diagnostic logs and telemetry spans rarely contain raw PII, and aggressive regex redaction of emails/phones/UUIDs destroys the exact record IDs and stack traces engineers need to debug issues. MemberJunction therefore uses a **two-stage scrubbing model** in `DiagnosticScrubber`:

1. **Stage 1 — Credential & Secret Scrubber (always on)**:
   - Strips high-confidence credentials across all logs, span attributes, GraphQL variables, SQL text, and HAR headers. The rules run in this order:
     - PEM private keys (`-----BEGIN ... PRIVATE KEY-----`) and JWTs (`eyJ...`)
     - `Bearer ...` tokens and `Basic ...` credentials (a base64 token that has a digit, `+`, `/` or `=`)
     - Cloud & AI provider keys (`sk-...`, `AKIA...`, `AIza...`, `ghp_...`, `xoxb-...`)
     - URI credentials: `postgres://user:pass@host/db` becomes `postgres://[REDACTED_CREDENTIALS]@host/db`. The scheme, host, port and path stay. The user is redacted too, because it can be an email address.
     - Unquoted connection-string secrets (`Server=...;Password=...;`) and URL query secrets (for example AWS signed-URL parameters `X-Amz-Credential`, `X-Amz-Signature`, `X-Amz-Security-Token`)
     - JSON `"name":"value"` pairs (plain, then escaped `\"name\":\"value\"`), then `name=value` pairs, then `name: value` pairs (header lines, YAML, log text), each when the name is sensitive
   - **Sensitive names.** A key, header or `name:`/`name=` name is sensitive when its normalized form (lower case, without `-`, `_`, `.` or spaces) contains `password`, `passwd`, `pwd`, `secret`, `token`, `apikey`, `privatekey`, `accesskey`, `accountkey`, `signingkey`, `encryptionkey`, `masterkey`, `sharedkey`, `credential`, `signature`, `connectionstring` or `connstr`. These exact names are sensitive too: `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `sig`, `pass`. A header is also sensitive when its name ends in `-token`, `-key`, `-secret`, `-signature` or `-credential(s)`.
   - **Names that keep their value:**
     - names that end in `Id`/`ID` after a lower-case letter or a digit (`apiKeyId`, `keyID`), or after a separator `_`, `-`, `.` or space (`API_KEY_ID`). An all-caps name such as `AUTH_TOKEN_VALID` is redacted.
     - names that end in `Type`, `Version` or `Policy`;
     - token-usage names (`tokenCount`, `maxTokens`, `promptTokens`, `TokensUsed`, `tokenUsage`, `tokenizer`, ...);
     - only when the value is a number: names that end in `Count` or `Length`, and the name `tokens`. In an object this means a JS number. In text it means plain number text.
     - Boolean object values (`true`/`false` of type boolean). The text `true`/`false` under a sensitive name is redacted like any other value.
   - **How much is redacted:**
     - `name: value`: an unquoted value is redacted to the end of the line, and a quoted value up to its closing quote. A leading auth scheme (`Basic`, `Bearer`, `Digest`, ...) stays.
     - `name=value` (query strings, form bodies, env lines, connection strings): the next value is redacted. That is a quoted value up to its closing quote (or the line end), or a bare value up to `&`, `;`, `,`, `)`, a quote or whitespace.
     - JSON in a string: the string value is redacted.
     - Objects: the value of a sensitive key becomes `[REDACTED_KEY]`.
2. **Stage 2 — Literal & Payload Scrubber (profile `Standard`)**:
   - SQL (`serverSql[].sql`): string literals, hex literals and standalone numbers become `?`. An unterminated `'` literal and all text after it become `?`. Every value of `IN (...)` and `BETWEEN ... AND ...` is replaced. SQL longer than 64 KB is cut at 64 KB and ends with `/* [SQL_TRUNCATED: N more characters] */`. Stage 1 runs on the whole string first.
   - Showplan XML (`serverSql[].executionPlanXml`): only the values of `StatementText`, `ScalarString`, `ConstValue`, `ParameterCompiledValue` and `ParameterRuntimeValue` are normalized, so row and cost numbers stay.
   - Client and server log messages: from the first upper-case statement keyword (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `EXEC`, `EXECUTE`) the text is handled as SQL. Before that keyword, only filter literals change (values after comparison operators and `LIKE`, `IN (...)` lists and `BETWEEN` ranges), so prose such as "can't" stays.
   - Client telemetry params: the strings of `ExtraFilter`, `Filter`, `Filters`, `OrderBy`, `OrderBys`, `SQL` and `WhereClause` are normalized. The strings of `AfterKey`, `AfterKeys` and `UserSearchString` become `?`.
   - Other free text keeps its literals: `serverSql[].errorMessage`, span `errorMessage`, and log `errorStack`/`data`.

**Default.** Stage 1 runs on every bundle. On the server, Stage 2 is off by default: a session or bundle keeps SQL and filter literals (`ScrubLiterals = false`, scrubber profile `FullRaw`). Turn Stage 2 on per session or bundle with `ScrubLiterals = true`, or for the whole instance with `Diagnostics.RequireLiteralScrubbing = true`, which forces `ScrubLiterals = true` in `Diagnostics.StartSession` and `Diagnostics.BuildBundle`. The Explorer dialog and `MJDiagnosticsService` use `Standard` by default. When `Diagnostics.RequireLiteralScrubbing` is on, the browser builds every bundle with `Standard` and the dialog disables `FullRaw`. A bundle sent to an external collector must be built with `ScrubLiterals = true` unless `Diagnostics.External.AllowUnscrubbedSend` is `true` (see [Sending to a Collector](#sending-to-a-collector-enrolment-and-signed-requests)).

### Suppressing Capture in Sensitive Code Paths

Wrap secret-rotation or vault operations in `WithoutDiagnosticCapture` so no SQL events, logs, or spans are recorded for that async tree. On the server the suppression applies only to the current async context; other requests that run at the same time are still captured:

```typescript
import { WithoutDiagnosticCapture, RunDetached } from '@memberjunction/diagnostics-server';

await WithoutDiagnosticCapture(async () => {
  await rotateMasterKeys();
});

// Preserve diagnostic session correlation across detached fire-and-forget callbacks:
RunDetached(() => {
  void backgroundSync();
});
```

---

## 3. Submission Side: Capturing, Downloading & Sending Bundles

### Explorer UX Entry Points (`@memberjunction/ng-explorer-core` + `@memberjunction/ng-diagnostics`)

Users and administrators can launch diagnostic capture or download a `.mjdiag` bundle from three places in the Explorer UI:

1. **About Dialog (`About MemberJunction` → `Diagnostics`)**:
   - Inside `AboutDialogComponent`'s collapsible **Diagnostics** accordion section, click **"Diagnostic Bundle..."** right next to **"Copy diagnostics"** to open `<mj-diagnostic-report-problem-dialog>`.
2. **User Avatar Menu (Top-Right Header)**:
   - Open the user profile menu and click **"Diagnostic Bundle"** (in the `system` section right above `About MemberJunction`).
   - When the user starts a live recording session and closes the dialog to reproduce an issue, `<mj-diagnostic-recording-banner>` stays pinned in the shell with a **Stop & Package** button. It stops the recording, builds the snapshot for that session, and reopens the dialog with the result. The banner renders inside the shell container (anything placed after it is clipped by the shell's `overflow: hidden`). When the server did not start a session for the user, the banner shows a **client-only** tag and the dialog explains why; the resulting bundle then holds browser data only.
3. **Stuck-Loading Screen (Pre-Reset Capture)**:
   - `ShellComponent.ngOnInit()` initializes `MJDiagnosticsService` immediately at boot, and the browser captures into memory from then on. If startup stalls and the *"Taking longer than expected"* reset panel appears, a **"Download Diagnostic Bundle"** button is shown right next to **"Reset"** so the user can download the startup `.mjdiag` flight-recorder snapshot *before* `ResetApplication()` clears IndexedDB and caches. The snapshot holds what the browser captured in memory since boot. If the server later reports capture as off, those buffers are cleared (unless a recording runs).

### Browser Capture Switch

- `MJDiagnosticsService.Initialize()` starts the log, telemetry and click/error listeners at once. They write only to the in-memory ring buffers. Nothing is stored in IndexedDB.
- After sign-in, the app calls `LoadServerStatus()` (Explorer's `ShellComponent` does this in `InitializeShell()`). It reads `Diagnostics.GetMySessionStatus`:
  - `CaptureEnabled` is `true`: capture continues.
  - `CaptureEnabled` is `false` or missing: the listeners stop. The buffers are cleared when no recording runs; a running recording keeps its entries. A later `Initialize()` does not restart capture while this status is known.
  - The status cannot be read: nothing changes, and capture continues in memory for a local download.
- A bundle build waits at most 3 seconds for a pending status read. When the status does not arrive in time, the build uses the requested scrubbing profile, unless a status that is already known requires literal scrubbing.
- Nothing is uploaded from these buffers on its own. Only a user's Submit to Support or a server trigger (see below) uploads them.
- A live recording that the user starts still runs when capture is off. The server then refuses `StartSession`, so the recording is client-only.
- `ResetApplication()` and `GraphQLDataProvider.ClearClientCache()` delete the `MJ_Diagnostics` IndexedDB database if an earlier build left one.
- The `mjVersion` in a client bundle's environment is `PACKAGE_VERSION` from `@memberjunction/graphql-dataprovider`.

### Capture Modes & Submission Flows

- **Snapshot** (**Download Client Snapshot** in the dialog, or **Stop & Package** on the banner): packages the browser's ring buffers (`client/logs.ndjson`, `client/waterfall.ndjson`, `client/telemetry.ndjson`) immediately, without a session. A client snapshot never contains `server/traces.ndjson`, `server/sql.ndjson` or `server/logs.ndjson`; those files are empty placeholders required by the archive layout. Server data comes only from a server-built bundle (**Submit to Support**, or `Diagnostics.BuildBundle` for a session).
  - `client/telemetry.ndjson` fills while a live recording runs: the service turns `TelemetryManager` on for the recording and restores the prior setting on stop. Outside a recording the file is empty unless the application enables telemetry itself.
  - `requestBytes` / `responseBytes` in `client/waterfall.ndjson` are approximate JSON text lengths (query plus variables; response data). They are measured only while a diagnostic observer is registered or telemetry is on, and are 0 otherwise.
  - A live recording without `Diagnostics: Run Sessions` (or self-service recording, `Diagnostics.SelfServiceRecording`) is **client-only**: it runs under a local `rec-…` ID that is never sent to the server, so no server session exists and no server data is captured for it.
- **Breadcrumbs (`repro.json`)**: from `MJDiagnosticsService.Initialize()` on, the browser keeps the user's last 100 steps in a ring buffer. Every bundle, client or server built, carries them in `repro.json` → `breadcrumbs`.
  - A click is read in the capture phase and names the control it hit as `tag#id[role=..][type=..][name=..][data-testid=..][data-test-id=..]`, for example `button#save` or `input[type=email][name=email]`. No text content, `aria-label`, `title`, placeholder or class name is recorded, and a field's value is never read. An identifier (`id`, `role`, `type`, `name`, `data-testid`, `data-test-id`) is kept only when it is a plain identifier (a letter, then letters, digits, `_`, `:`, `.` or `-`), is 60 characters or fewer, and does not contain the element's text (case is ignored). Any other value is left out, so `tr#row-alice@example.com` is recorded as `tr`.
  - An uncaught error or an unhandled promise rejection is recorded with its message.
  - Route steps come from the app, because the generic service does not read the router. Explorer's `ShellComponent` calls `RecordRouteBreadcrumb(url)` on each `NavigationEnd`. The step keeps the path and leaves out the query string and fragment. Another app adds its own steps with `RecordBreadcrumb(...)`.
  - Submit to Support and the trigger upload send the steps in `Repro.breadcrumbs`. `Diagnostics.UploadClientCapture` stores them as `Client` `Timeline` chunks, and `Diagnostics.BuildBundle` reads them back into `repro.json`. They go through the same scrubber as the rest of the bundle. `mj diag timeline` shows them as `breadcrumb` rows.
- **Record**: Starts a live session (`MJ: Diagnostic Sessions`). The browser attaches `X-MJ-Diagnostic-Session: <sessionId>` on GraphQL requests (`GraphQLDataProvider.Instance.SetActiveDiagnosticSessionId(sessionId)`). Client buffers stay in memory only, so a page reload loses entries that were not uploaded.
- **One-Click "Submit to Support" (`MJDiagnosticsService.SubmitBundleToSupport()`)**:
  - Directly from `<mj-diagnostic-report-problem-dialog>`, clicking **"Submit to Support"** executes:
    1. `Diagnostics.UploadClientCapture` — uploads the client flight-recorder buffers to the server. An upload to a session that already holds client data sends only the entries recorded since the last upload to it, so the bundle holds each entry once. The upload saves the session's buffered chunks from every source, so server entries still waiting for the 1 MB background save are kept.
    2. `Diagnostics.BuildBundle` — the Submit note goes in `ClientBundleData.repro.userComment` and lands in `repro.json`. The build reads only the text fields of `ClientBundleData.repro` (`url`, `route`, `userComment`, `userNotes`, `ReproductionSteps`); it ignores everything else, so a client cannot add entries to a server-built bundle. The build merges client and server chunks, runs the 9 automated diagnostic rules, and verifies the `.mjdiag` archive. It reads every chunk of the session. It first saves the buffers still in memory, then reads every row saved to `MJ: Diagnostic Session Chunks` (the query names the binary `Data` column, which `RunView` otherwise leaves out), then adds the chunks that are still in memory because a save failed. Saved chunks are ordered by writer (`HostInstanceLabel`), then by save time, then by `Sequence`. When a chunk cannot be read in full (the read fails, `Data` is missing, it does not decompress, an entry is not JSON, it holds fewer entries than its `EntryCount`, or its `ContentKind` has no bundle file), the build fails with that reason and marks the bundle `Failed`. It never builds a bundle that holds part of a session, so Submit to Support stops and shows the reason.
    3. `Diagnostics.SendBundle` — encrypts the `.mjdiag` archive with `MJDB` v1 hybrid encryption (`X25519` + `AES-256-GCM` with header AAD) and sends it, displaying the returned `diagref_...` Support Reference ID in the dialog. The server picks one path (see [Sending to a Collector](#sending-to-a-collector-enrolment-and-signed-requests)):
       - `Diagnostics.External.CollectorUrl` is set → send to that collector. The installation must be enrolled; otherwise the send fails with "This installation is not enrolled with the collector". The bundle must be built with literal scrubbing (`ScrubLiterals = true`), unless `Diagnostics.External.AllowUnscrubbedSend` is `true`. Otherwise the send fails before the bundle row changes, and the bundle stays `Ready`. The dialog shows the server's message.
       - No collector URL and local intake enabled (`Diagnostics.Intake.Enabled` and its key loaded) → hand the bundle to this server's own `DiagnosticIntakeService` in process.
       - Neither → the send fails with a message that names both settings. A fresh server with default settings takes this path.
  - After the send, the dialog shows the findings count and a **Download Bundle (.mjdiag)** button. The `DownloadUrl` that `BuildBundle` returns is the public absolute URL (`ApiRoute(..., { absolute: true })`, so `MJAPI_PUBLIC_URL`) with a 60-second single-use token, so the button does not reuse it: each click runs `Diagnostics.GetBundlePreview` with `MintDownloadToken` for a fresh link and opens it in a hidden frame, which downloads the server-built archive without leaving the page.
  - While the packaging dialog stays open after **Stop & Package**, every Submit uploads into and builds from the stopped recording's server session. The session is released when the dialog closes; a Submit after that starts a short "Client capture" session that holds browser data only.
- **Server-Initiated "Watch Sessions" + Automatic Browser Flush (`X-MJ-Diagnostic-Trigger`)**:
  - An administrator or automated rule can arm a server-side Watch Session (`Diagnostics.StartSession`) scoped by `Users` (`UserID`, `BrowserSessionID`, `APIKeyID`) or `Operations` (GraphQL operation name, error-only, or `minDurationMs` latency threshold).
  - `Diagnostics.UploadClientCapture` accepts uploads to a `BrowserSession`-scoped session from any caller who presents that browser session ID, so treat the browser session ID as a capability and do not share or log it.
  - When `DiagnosticsServerMiddleware` matches an incoming browser request to an active Watch Session, it sets `X-MJ-Diagnostic-Trigger: <sessionId>` on the HTTP response.
  - `MJDiagnosticsService.HandleServerTriggerHeader(sessionId)` in the browser detects this header and uploads client entries via `Diagnostics.UploadClientCapture` without requiring any user interaction:
    - The first trigger for a Watch Session marks every entry already in the buffers as held by that session, so entries captured before the trigger are never sent to it.
    - It starts a recording under the Watch Session only when no recording runs. An active user recording keeps its own session and header.
    - Later trigger headers for the same session upload the entries captured since the last upload, at most once every 30 seconds. Entries captured just before the Watch Session ends can stay unsent if no further response carries the header.
    - Sessions that this service started, or that a Submit created, are ignored.

### Remote Operations

The operations are metadata-registered under the `Diagnostics` category. Every operation except `Diagnostics.GetMySessionStatus` checks a `Diagnostics: *` authorization (table below). Every operation except `Diagnostics.GetMySessionStatus` and `Diagnostics.UploadClientCapture` has a `diagnostics:*` API scope (`diagnostics:manage`, `diagnostics:read` for `GetBundlePreview`, `diagnostics:send` for `SendBundle`).

**Who has access.** A user passes a diagnostics check when the user is an Owner (`Type = 'Owner'`) or holds the named `Diagnostics: *` authorization, directly or through a parent authorization. The roles Developer and Administrator do not grant access on their own. When the authorization record is missing or metadata is not loaded, the check fails. Inactive users and magic-link or scope-limited principals always fail.

| Operation | Authorization |
| --- | --- |
| `Diagnostics.StartSession` | `Diagnostics: Run Sessions`, or self-service recording for the user's own session (`Diagnostics.SelfServiceRecording`) |
| `Diagnostics.StopSession` | `Diagnostics: Run Sessions`, or the user's own self-service session |
| `Diagnostics.GetMySessionStatus` | Any active, signed-in user. Returns `CaptureEnabled` and `RequireLiteralScrubbing` from the instance settings. |
| `Diagnostics.UploadClientCapture` | `Diagnostics: Run Sessions`, a session that targets the caller, the caller's own self-service session, or self-service recording when no session is named |
| `Diagnostics.BuildBundle` | `Diagnostics: Run Sessions`, or the user's own self-service session |
| `Diagnostics.GetBundlePreview` | `Diagnostics: Run Sessions` or access to its session for a local bundle; `Diagnostics: Manage Intake` for a received bundle. With `MintDownloadToken` it returns a link with a 60-second, single-use, user-bound HMAC-SHA256 token for `GET /diagnostics/bundles/:bundleId/download?token=...`. |
| `Diagnostics.SendBundle` | `Diagnostics: Send Externally` |
| `Diagnostics.IssueSenderRegistrationCode` | `Diagnostics: Manage Intake` |
| `Diagnostics.EnrolSender` | `Diagnostics: Manage Intake` |
| `Diagnostics.RevokeSender` | `Diagnostics: Manage Intake` (see §4 Step 4) |
| `Diagnostics.ReactivateSender` | `Diagnostics: Manage Intake` (see §4 Step 4) |

The server telemetry queries (`GetServerTelemetry*` in MJServer's `TelemetryResolver`) need Owner privileges or `Diagnostics: Run Sessions`.

**Download link.** The route checks the token (signature, bundle ID, expiry, unused) before it looks for the bytes, and answers 403 when the check fails. When the bytes are not in memory, it answers 410 and the token stays usable. The token is used up only when the route sends the bytes, so of two requests with one token only one gets them.

### Server Capture and Memory

- **Capture hooks.** The log sink, SQL observer and console tap are installed only while `Diagnostics.Capture.Enabled` is on and this process holds at least one session. With capture off or no session, SQL queries carry no capture cost. The hooks are synced when the middleware loads the settings, when a session starts or ends, and every 30 seconds while a session is held.
- **`MaxBytes`.** A session's `MaxBytes` counts the serialized (UTF-8 JSON) bytes of its captured entries, server and client, buffered or saved. It is not the compressed size in the database. An entry that would pass the cap is dropped, and one warning is logged. `Diagnostics.StartSession` clamps `MaxBytes` to 1 byte up to 50 MB (52,428,800), and to 10 MB (10,485,760) for a self-service session. No value gives the cap.
- **Saves.** Server buffers are saved to `MJ: Diagnostic Session Chunks` when a session's buffers reach 1 MB (a background save), on Stop, upload and build, and when a session expires (as the system user). Without a system user, the unsaved entries of an expired session are dropped and one error line is logged.
- **Failed saves.** When a chunk save fails, that chunk and all later chunks stay in memory and the next save tries them first. A background save waits 30 seconds after a failure. Kept chunks still count toward `MaxBytes`. When this process no longer holds the session, its kept chunks are dropped 15 minutes later, with one error line.
- **Restart.** After a restart, a live session's saved byte counts are read back from its chunks, so `MaxBytes` still holds.
- **Built bundles.** A built bundle stays in server memory until it has not been used for 2 hours (a prune timer runs every 10 minutes, so an idle bundle is dropped within about 10 minutes after that), or until the total of built bundles passes 256 MB (least recently used first). A retention purge of the bundle row also removes it. After that, rebuild the bundle; the download answers 410.

### Submission Instance Configuration (`MJ: Instance Configurations`)

The server reads these settings through `DiagnosticsSettings` (`@memberjunction/diagnostics-server`). A missing row uses the default.

| Configuration Key | Default | Description |
| --- | --- | --- |
| `Diagnostics.Capture.Enabled` | `true` | When `false`, `Diagnostics.StartSession` refuses, the middleware does not attach requests to sessions, and the server capture hooks are removed. After sign-in the browser also stops capture and clears its buffers, unless a recording runs. |
| `Diagnostics.SelfServiceRecording` | `false` | When `true`, a user without `Diagnostics: Run Sessions` may start a session scoped to their own user ID only. |
| `Diagnostics.RequireLiteralScrubbing` | `false` | Forces `ScrubLiterals = true` (Stage 2) on every session and bundle. |
| `Diagnostics.MaxSessionMinutes` | `60` | Upper limit for a session's `DurationMinutes`. |
| `Diagnostics.RetentionDays` | `14` | Days before the retention job purges local sessions and bundles. |
| `Diagnostics.External.Enabled` | `false` | Allows `Diagnostics.SendBundle` to send to an external collector. Sending to the in-process intake is not external. |
| `Diagnostics.External.Destinations` | `[]` | JSON array of allowed destinations (`MJC`, `CustomerCollector`, `StorageAccount`). An empty list allows all. |
| `Diagnostics.External.AllowUnscrubbedSend` | `false` | When `false`, `Diagnostics.SendBundle` to a collector (`Diagnostics.External.CollectorUrl` set) refuses a bundle built without literal scrubbing. When `true`, unscrubbed bundles may be sent. The in-process intake path and local download do not read this setting. |
| `Diagnostics.External.CollectorUrl` | `''` | Public API URL of the collector MJAPI (its `MJAPI_PUBLIC_URL`, for example `https://support.example.com/api`). The only collector URL `SendBundle` uses; the request cannot override it. |
| `Diagnostics.External.SenderCredentialID` | `''` | `MJ: Credentials` row that holds this installation's Ed25519 sender key. Written by `Diagnostics.EnrolSender`. |
| `Diagnostics.External.SenderKeyID` | `''` | Key ID the collector knows the sender key by. Written by `Diagnostics.EnrolSender`. |
| `Diagnostics.External.CollectorPublicKeyBase64` | `''` | Collector X25519 public key (SPKI base64) recorded at enrolment. A different key that the pinned signing key signed is accepted and logged once as a key rotation. |
| `Diagnostics.External.CollectorSigningPublicKeyBase64` | `''` | Collector Ed25519 signing key (SPKI base64) pinned at enrolment. The collector's X25519 key must carry a signature from this key. A re-enrolment whose response carries a different signing key fails; to switch collectors, an administrator clears this setting first. |
| `Diagnostics.InstallID` | `''` | Stable ID of this installation. Generated (UUID) and saved at enrolment; `DiagnosticSessionManager.InstallID` reads it. A server that never enrols uses a per-process ID, which is enough for in-process local intake. |

### Sending to a Collector: Enrolment and Signed Requests

**Collector audience.** The sender and the collector compute the same intake URL, which is also the signed `aud`:
`TrimTrailingSlashes(Diagnostics.External.CollectorUrl) + '/diagnostics/intake/v1'` (not added twice when the URL already ends with it). On the collector this is `ApiRoute('/diagnostics/intake/v1', { absolute: true })` with trailing slashes removed, so `Diagnostics.External.CollectorUrl` must equal the collector's public API URL.

**Collector URL rules.** `Diagnostics.External.CollectorUrl` must use `https:` (plain `http:` is accepted only for `localhost`, `127.0.0.1` and `[::1]`). Redirects from the collector are never followed: a 3xx answer fails the step.

**Enrolment (once per installation, and again to rotate the key).** Enrolment is trust-on-first-use: the collector keys returned by `/enroll` are pinned without other proof, so the first contact must be over TLS to the right host.
1. The collector administrator issues a registration code (`Diagnostics.IssueSenderRegistrationCode`, see §4).
2. On the sending server, set `Diagnostics.External.CollectorUrl`, then run the remote operation `Diagnostics.EnrolSender` with `{ RegistrationCode }` (authorization `Diagnostics: Manage Intake`). There is no `mj diag enroll` CLI command: `@memberjunction/cli` does not depend on `@memberjunction/diagnostics-server`, so the remote operation is the enrolment path. Code can call `EnrolSender()` from `@memberjunction/diagnostics-server`.
3. `EnrolSender` reads or creates `Diagnostics.InstallID`, generates an Ed25519 key pair with the key ID `<first 8 chars of the install ID>-<yyyymm>-<4 hex>`, and posts `{ installId, registrationCode, keyId, publicKeyBase64, proof }` to `<aud>/enroll`. `proof` is the Ed25519 signature over `mjdiag-enrol-v1:<installId>:<keyId>:<registrationCode>:<aud>`.
4. When a signing key is already pinned in `Diagnostics.External.CollectorSigningPublicKeyBase64` and the response carries a different one, enrolment fails with an error that names that setting. Nothing is stored. To switch collectors, an administrator clears the setting first.
5. When the collector accepts, the server stores the private key in `MJ: Credentials` (credential type `Diagnostics Sender Key`, values `{ keyId, publicKey, privateKey }`) and saves `Diagnostics.External.SenderCredentialID`, `SenderKeyID`, `CollectorPublicKeyBase64` and `CollectorSigningPublicKeyBase64`.

**Every send.**
- Each request to the collector (`GET /public-key`, `POST /bundles`, `PUT` payload, `POST /complete`) carries `Authorization: MJDiag-Ed25519 keyId="…",installId="…",aud="…",ts="…",nonce="…",sig="…"`. `sig` is the Ed25519 signature over `mjdiag-http-v1:<METHOD>:<path>:<aud>:<installId>:<ts>:<nonce>:<bodySha256>`, where `path` is the full URL path of the request (no query string, base path included), `ts` is unix seconds, `nonce` a fresh UUID and `bodySha256` the hex SHA-256 of the exact bytes sent (of the empty string for `GET`).
- The collector's X25519 key must carry a valid signature from the pinned `CollectorSigningPublicKeyBase64`; otherwise nothing is encrypted or uploaded.
- The envelope is signed with the same sender key (`senderKeyId` = the stored key ID), so the collector can bind the envelope to the HTTP identity.
- The `uploadUrl` the collector returns must be on the collector URL's origin (a relative URL resolves against the intake URL); otherwise the send stops before the upload.
- No API key (`MJ_API_KEY` or any other) is read or sent on this path.

---

## 4. Setting Up a Receiving MJAPI Server (`/diagnostics/intake/v1`)

Any MemberJunction server (`MJAPI`) can act as a secure diagnostic bundle receiver — whether for **MemberJunction Central (MJC)** or an enterprise's own internal support hub.

### Step 1: Generate Collector Keys & Store in `MJ: Credentials`

Generate an X25519 encryption keypair and an Ed25519 signing keypair using the CLI:

```bash
npx mj diag keygen --key-id mjc-intake-2026-01 --signing
```

1. Store both key pairs in one `MJ: Credentials` row of type `Diagnostics Intake Key` (encrypted at rest via `@memberjunction/encryption`). The values are JSON with five fields: `keyId`, `publicKey` (X25519 SPKI base64), `privateKey` (X25519 PKCS#8 base64), `signingPublicKey` (Ed25519 SPKI base64) and `signingPrivateKey` (Ed25519 PKCS#8 base64).
2. Record the `MJ: Credentials` row ID in the `Diagnostics.Intake.KeyPairCredentialID` instance configuration setting. At startup the server loads the credential and enables intake only when `Diagnostics.Intake.Enabled` is `true`, all five values are present, and each public key is the one derived from its private key. Otherwise intake stays disabled and the server logs one error. Startup never generates a key pair.
3. `GET /diagnostics/intake/v1/public-key` returns the X25519 public key with its Ed25519 signature (`SignRecipientPublicKey`). It never serves an unsigned key: without a signing key it answers 503. Senders pin `signingPublicKey` at enrolment (below) and refuse any public key it did not sign.

### Step 2: Set Up `MJStorage` Locations (Quarantine-then-Promote)

To ensure unverified or infected bytes never mingle with trusted support artifacts, configure **two separate storage locations** (`MJ: File Storage Providers`). When `Diagnostics.Intake.StorageProviderID` is empty, intake keeps payloads in memory only. When `Diagnostics.Intake.QuarantineStorageProviderID` is empty, quarantine uses the verified provider.

1. **Quarantine Storage Provider** (`Diagnostics.Intake.QuarantineStorageProviderID`):
   - Dedicated S3 bucket, Azure Blob container, or GCS bucket with **no public read access**, **no execution permissions**, and a **24-hour object lifecycle expiration rule**.
   - Incoming encrypted uploads are staged at:
     ```text
     quarantine/<referenceId>.mjdiag.enc
     ```
2. **Verified Storage Provider** (`Diagnostics.Intake.StorageProviderID`):
   - Long-term support bucket accessible to support engineers.
   - Only after a bundle passes **all four verification gates** (MJDB header pre-check → AEAD AES-256-GCM decryption → `VerifyBundleArchive` ZIP/manifest verification → Malware Scan verdict `Clean`) are the decrypted `.mjdiag` bytes promoted to:
     ```text
     verified/<YYYY-MM-DD>/<referenceId>.mjdiag
     ```
   - The quarantine object is immediately deleted upon promotion or rejection.
   - With `Diagnostics.Intake.DecryptOnIngest = false` the still-encrypted envelope is promoted instead, to `verified/<YYYY-MM-DD>/<referenceId>.mjdiag.enc`.
3. **Received bundle rows**: each upload saves a `MJ: Diagnostic Bundles` row with `Direction = 'Received'`, `Status = 'Receiving'`, `SenderInstallID` (the authenticated install), `SenderMJVersion`, `ContactInfo`, `ExternalReferenceID` (the reference ID) and `ExpiresAt` (from `Diagnostics.Intake.RetentionDays`). On complete the row becomes `Ready` (with `SizeBytes`, `SHA256` of the stored bytes, an `MJ: Files` row in `FileID` when the verified storage provider is set, and `ManifestJSON`/`FindingsJSON` when decrypted) or `Failed` with the reason. The retention job purges these rows and their files.

### Step 3: Configure Malware Scanning (`IDiagnosticMalwareScanner`)

No instance setting selects the scanner. Startup uses `StructuralOnlyMalwareScanner` (Option C). To use another scanner, call `DiagnosticIntakeService.Instance.Configure({ malwareScanner })` from server code after startup:

#### Option A: Cloud-Native Object Tagging (`CloudObjectTag`) — Recommended for AWS / Azure / GCP
When the Quarantine bucket is backed by **AWS S3 with GuardDuty Malware Protection**, **Azure Blob Storage with Microsoft Defender for Storage**, or **GCP Cloud Storage**, the cloud provider automatically scans every object written to the quarantine bucket and writes the verdict to the object's tags/metadata.
- `CloudObjectTagMalwareScanner` polls the quarantine object's tags until a verdict appears:
  - **AWS GuardDuty**: `GuardDutyMalwareScanStatus = 'NO_THREATS_FOUND'` → `Clean`; `'THREATS_FOUND'` → `Infected` (quarantine purged immediately).
  - **Azure Defender**: `Malware Scanning scan result = 'No threats found'` → `Clean`; `'Malicious'` → `Infected`.
  - **Custom Tag**: `mj-malware-scan-status = 'clean' | 'infected'`.

#### Option B: ClamAV / HTTP Webhook (`ClamAVWebhook`)
For self-hosted, Docker, or Kubernetes deployments running a ClamAV REST sidecar (e.g., `clamav-rest` or an internal scanning microservice):
- `ClamAvWebhookMalwareScanner` streams the archive bytes via `POST` (`application/octet-stream`) to your scanner endpoint and requires `{ "clean": true }` before promoting the bundle.

#### Option C: Cryptographic + Structural Verification (`None` / `StructuralOnlyMalwareScanner`)
Even when no external antivirus daemon is configured, the intake pipeline **always** enforces:
1. **`MJDB` v1 Magic Header & Key ID Pre-Check** before writing to quarantine (`InspectEncryptedBundleEnvelope`) — rejects random junk uploads immediately at the HTTP edge.
2. **X25519 + HKDF-SHA256 + AES-256-GCM AEAD Decryption** with the whole envelope prefix bound as AAD: the `MJDB` magic bytes, the version byte, the header length and the header JSON (`version`, `algorithm`, `recipientKeyId`, `ephemeralPublicKeyBase64`, `hkdfSaltBase64`, `ivBase64`, `createdAt`, and when present `senderEnvironmentId`, `senderKeyId`, `senderSignatureBase64` and `manifestSha256`) — proves the payload was encrypted specifically for this collector and was not tampered with in transit.
3. **`VerifyBundleArchive` Structural Verification**:
   - Rejects non-ZIP files, path-traversal entries (`..`, a leading `/` or a backslash), symbolic links, duplicate entries, more than 128 entries, compression-ratio zip bombs (`> 25:1` per entry), and oversized archives (`> 100 MB` uncompressed). Inflation stops at each entry's declared uncompressed size.
   - Requires each local file header to repeat the central directory's file name, compression method, CRC-32, compressed size and uncompressed size (`CORRUPT_ZIP_STRUCTURE`).
   - Verifies that every entry is on the `.mjdiag` allow-list (`manifest.json`, `README.txt`, `environment.json`, `repro.json`, `findings.json`, `client/logs.ndjson`, `client/waterfall.ndjson`, `client/telemetry.ndjson`, `server/traces.ndjson`, `server/sql.ndjson`, `server/logs.ndjson`, `server/health.json`, `server/plans/<name>.sqlplan.xml`, `contrib/<key>.json`, `contributors/<key>.json`, `client/screenshot.<ext>`), is listed in `manifest.json` (otherwise `UNLISTED_ENTRY`; only `manifest.json` itself may be unlisted), and matches the SHA-256 digest recorded there. A malformed manifest descriptor gives `INVALID_MANIFEST_SCHEMA`.
4. **Envelope checks** in `DecryptDiagnosticBundle`: a header that is not an object, or that has a non-string `senderEnvironmentId`, `senderKeyId`, `senderSignatureBase64` or `manifestSha256`, gives `INVALID_HEADER_FIELDS`. When the header carries `manifestSha256`, it must equal the SHA-256 hex of the whole decrypted `.mjdiag` archive (letter case is ignored), or the result is `MANIFEST_SHA256_MISMATCH`.

### Step 4: Register Senders (enrolment, signed requests, revocation)

Only registered installations can submit. A sender is a `MJ: Diagnostic Sender Registrations` row (`InstallID`, `Name`, `Status` `Pending` | `Active` | `Revoked`, `KeyID`, `PublicKeyBase64`, `MaxBundlesPerDay`, `LastSeenAt`). Code can also register a key in memory with `DiagnosticIntakeService.Instance.RegisterSenderPublicKey(installId, keyId, publicKeyBase64)` (no row; for a self-hosted hub or tests). Nothing else grants access; no API key (`MJ_API_KEY` or any other) is read.

**Direct writes to registration rows.** The server entity class guards every save that diagnostics-server code does not make itself:
- Create, update and delete need `Diagnostics: Manage Intake`.
- A new row must have `Status = 'Pending'` and empty `KeyID`, `PublicKeyBase64`, `RegistrationCodeHash`, `RegistrationCodeExpiresAt`, `EnrolledAt`, `RevokedAt` and `LastSeenAt`.
- An update must not change `InstallID`, `Status`, `KeyAlgorithm`, `KeyID`, `PublicKeyBase64`, `RegistrationCodeHash`, `RegistrationCodeExpiresAt`, `EnrolledAt`, `RevokedAt` or `LastSeenAt`. Other fields, such as `Name` and `MaxBundlesPerDay`, can be edited.
- A `ReplayOnly` save is refused.

So an edit of `Status` on the Explorer form is refused. Use the toolbar buttons or the operations below to change the status.

**Enrolment.**
1. Create a registration row with the sender's `InstallID` and a `Name` (status `Pending`).
2. Run `Diagnostics.IssueSenderRegistrationCode` with `{ RegistrationID }` (authorization `Diagnostics: Manage Intake`). It returns `{ Code, ExpiresAt }`: 32 random bytes as base64url, valid for 24 hours. Only the SHA-256 hash is stored; give the plain code to the sender's administrator once.
3. The sender runs `Diagnostics.EnrolSender` (§3), which posts `{ installId, registrationCode, keyId, publicKeyBase64, proof }` to `POST /diagnostics/intake/v1/enroll`. That route needs no signature. Failed enrolments count against the IP failure limit (below).
4. The collector loads the row by `InstallID`, requires an unexpired code hash, compares the code hash in constant time, and verifies `proof` (Ed25519 over `mjdiag-enrol-v1:<installId>:<keyId>:<registrationCode>:<aud>`) with `publicKeyBase64`. It then saves `KeyID`, `PublicKeyBase64`, `Status = 'Active'`, `EnrolledAt`, and clears the code. Each code works once: the collector checks and uses the code under a lock for that registration, after it reloads the row from the database. When a database fault stops the registration lookup, reload or save, `POST /enroll` answers 503 with a generic body. The failure is not cached and is not counted against the IP; the sender can retry. The response is `{ installId, keyId, collectorPublicKeyBase64, collectorSigningPublicKeyBase64 }`. Any failure answers 400 or 401 with a generic message; the reason is in the server log.

**Signed requests.** `POST /bundles`, `PUT /bundles/:referenceId/payload` and `POST /bundles/:referenceId/complete` require `Authorization: MJDiag-Ed25519 keyId="…",installId="…",aud="…",ts="…",nonce="…",sig="…"`. The collector:
- finds the `Active` registration for `installId` and requires `keyId` to equal its `KeyID`;
- rejects `|now − ts| > 300 s`;
- requires `aud` to equal its audience, `TrimTrailingSlashes(ApiRoute('/diagnostics/intake/v1', { absolute: true }))`. So `MJAPI_PUBLIC_URL` must be the URL senders put in `Diagnostics.External.CollectorUrl`;
- verifies `sig` over `mjdiag-http-v1:<METHOD>:<path>:<aud>:<installId>:<ts>:<nonce>:<bodySha256>`. The signed path is the public URL's path: the collector verifies the path of its audience URL followed by the route subpath (for example `/api/diagnostics/intake/v1/bundles` for `MJAPI_PUBLIC_URL=https://x/api`), without the query string, so a proxy that strips a path prefix does not break signatures. `bodySha256` is the hex SHA-256 of the raw body;
- refuses a repeated `(installId, nonce)`.

Any failure answers 401 with a generic message, and the reason is logged. When the registration lookup itself fails (a database fault), the request gets 503 with a generic body instead; it is not counted against the IP, and the sender can retry. The header and registration are checked before the body is read, and a payload body is never read past its declared `sizeBytes` (413). Rate limits:

| Limit | Applies to | Default |
|-------|-----------|---------|
| IP failure limit | Failed attempts before the signature check (missing or malformed header, unknown or non-Active install, key ID mismatch), failed signature checks (bad `sig`, skewed `ts`, wrong `aud`, replayed nonce) and failed enrolments, counted per client IP. When an IP is over the limit, every request from it gets 429 before any sender lookup or signature check, signed requests included. A successful signed request is not counted. | 60 per minute (`Configure` option `maxFailedAttemptsPerMinute`) |
| Sender limit | Verified requests on the bundle routes, counted per install ID. | 30 per minute (`Configure` option `maxRequestsPerMinute`) |
| Open intakes | Intakes of one install that are not completed (created, or uploaded and waiting for complete). `POST /bundles` beyond the limit gets 429. An intake whose 10-minute upload window has passed without an upload is removed. An uploaded intake not completed within 10 minutes after the upload window is rejected and removed (quarantine object deleted, row `Failed`); a complete that arrives after the deadline gets 410 `COMPLETE_EXPIRED`, or 422 `MISSING_PAYLOAD` once the sweep has already removed the record. | 5 (`Configure` option `maxOpenIntakesPerSender`) |
| Records in memory | Intake records kept in memory. When full, the oldest completed record is removed; when none is completed, `POST /bundles` gets 429. A completed record keeps no encrypted payload, and keeps the decrypted bytes only when no storage provider is set. | 200 (`Configure` option `maxRecordsInMemory`) |
| Daily quota | See below. | `MaxBundlesPerDay` |

The four `Configure` limit options must be positive integers; any other value throws.

An install ID that has no registration row is remembered for 60 seconds (at most 1,000 IDs), so repeated requests for it do no database lookup. A lookup that fails is not remembered. Enrolment through this process, or `RegisterSenderPublicKey`, clears the entry for that install.

The counters are per process, and each holds at most 10,000 keys (the oldest are dropped first). A collector behind a reverse proxy or load balancer must set Express `trust proxy` (for example in a middleware's `ConfigureExpressApp`) so that `req.ip` is the client address. Otherwise all clients share the proxy's IP and one failure budget.

`POST /bundles` and the payload upload refuse (429) a sender that already has `MaxBundlesPerDay` bundles from the last 24 hours (0 means no limit). The count is the sender's `Received` bundle rows plus its open intakes that have no bundle row yet. `POST /bundles` reserves its slot before the first database read, so concurrent creates in one process cannot pass the limit.

**Binding.** The intake record keeps the authenticated `(installId, keyId)`. A body `installId` that differs answers 400, and payload or complete from another sender answers 403. On complete the envelope must carry a valid sender signature by the same key (`senderKeyId` equal to the authenticated `keyId`), or the bundle is rejected. A successful complete updates only the registration's `LastSeenAt`, on a freshly loaded row, and not when the row is no longer `Active`. The `uploadUrl` returned by `POST /bundles` is the public absolute URL (`ApiRoute(…, { absolute: true })`).

**Revocation and rotation.**
- To revoke a sender, run `Diagnostics.RevokeSender` with `{ RegistrationID }` (authorization `Diagnostics: Manage Intake`). It sets `Status = 'Revoked'` and `RevokedAt`, clears any outstanding registration code, and returns `{ RegistrationID, InstallID, Status, RevokedAt }`. Every request from that install then answers 401.
- To undo a revocation with the same key, run `Diagnostics.ReactivateSender` with `{ RegistrationID }` (authorization `Diagnostics: Manage Intake`). It works only on a `Revoked` row that has an enrolled `KeyID` and `PublicKeyBase64`. It sets `Status = 'Active'` and clears `RevokedAt`.
- In Explorer, open the record in `MJ: Diagnostic Sender Registrations`. The form toolbar shows **Revoke** on an Active or Pending registration, after a confirmation dialog, and **Reactivate** on a Revoked registration that has an enrolled key. The buttons call the operations above and need `Diagnostics: Manage Intake`. After a success the form reloads the record; a refusal shows the server's error.
- To rotate a key, issue a new registration code; the sender enrols again with a new key, and the row's `KeyID` and `PublicKeyBase64` are replaced. Issuing a code also re-enables a revoked sender: an enrolment with that code sets the row back to `Active`.

**Replay store.** The nonce cache is in memory, per process. It keeps each nonce for 602 s (the ±300 s skew window plus 2 s, because the skew check compares whole seconds), removes expired entries, and refuses new nonces when it is full. A collector that runs more than one MJAPI instance needs a shared store (for example Redis `SET NX EX`), or a nonce replayed to another instance is accepted.

### Step 5: Intake Configuration Reference (`MJ: Instance Configurations`)

| Configuration Key | Default | Description |
| --- | --- | --- |
| `Diagnostics.Intake.Enabled` | `false` | Enables `/diagnostics/intake/v1/*` routes on this MJAPI instance. Intake also needs a receiver key (below). |
| `Diagnostics.Intake.KeyPairCredentialID` | `''` | `MJ: Credentials` ID (type `Diagnostics Intake Key`) holding `keyId`, `publicKey`, `privateKey`, `signingPublicKey` and `signingPrivateKey`. Intake stays disabled while it is empty, incomplete, or a public key does not match its private key. |
| `Diagnostics.Intake.StorageProviderID` | `''` | `MJ: File Storage Providers` ID for promoted, verified `.mjdiag` bundles. |
| `Diagnostics.Intake.QuarantineStorageProviderID` | `''` | Optional `MJ: File Storage Providers` ID for staging unverified encrypted uploads. |
| `Diagnostics.Intake.DecryptOnIngest` | `true` | `true`: intake decrypts, verifies the archive, runs the malware scan, and saves the manifest and findings. `false`: intake checks the envelope header, the sender signature and the declared hash, then stores the envelope still encrypted. No malware scan runs, and `ManifestJSON`/`FindingsJSON` stay empty; decrypt offline with the private key. |
| `Diagnostics.Intake.RetentionDays` | `30` | Days to keep received bundles. |
| `Diagnostics.Intake.OnBundleReceivedActionID` | `''` | Optional `MJ: Actions` ID run after a bundle passes verification. It runs as the system user with the inputs `ReferenceID`, `BundleID`, `SenderInstallID`, `SenderMJVersion`, `Summary`, `Contact`, `FindingsCount` and `VerifiedStoragePath`. |

---

## 5. CLI Reference (`mj diag`)

```bash
# 1. Verify and inspect a bundle (plain .mjdiag or encrypted MJDB envelope)
npx mj diag inspect ./bundle.mjdiag
npx mj diag inspect ./bundle.mjdiag.enc --private-key-file ./collector.key --json
MJ_DIAG_PRIVATE_KEY=<base64-pkcs8> npx mj diag inspect ./bundle.mjdiag.enc

# 2. List slow spans and SQL queries (>= 250ms)
npx mj diag slow ./bundle.mjdiag --threshold 250

# 3. View chronological merged timeline of client spans, server spans, SQL queries and breadcrumbs
npx mj diag timeline ./bundle.mjdiag --limit 100

# 4. Re-scrub an existing bundle with the Standard profile (literal scrubbing) before sharing externally
npx mj diag scrub ./bundle.mjdiag --profile Standard -o ./bundle.scrubbed.mjdiag

# 5. Export traces to Perfetto (https://ui.perfetto.dev) or OpenTelemetry OTLP JSON
npx mj diag export ./bundle.mjdiag --perfetto -o ./trace.perfetto.json
npx mj diag export ./bundle.mjdiag --otlp -o ./trace.otlp.json

# 6. Generate collector X25519 + Ed25519 keypairs for an intake server
npx mj diag keygen --key-id mjc-intake-2026-01 --signing
```

**Private key for an encrypted bundle.** `inspect`, `scrub`, `export`, `slow` and `timeline` read a `.mjdiag.enc` envelope with the recipient's X25519 private key (PKCS#8 base64). They take the key from the first of these that is set:
1. `--private-key <base64>`. The value is visible to other processes (for example in `ps`) and stays in shell history, so use one of the other two options.
2. `--private-key-file <path>`. The file is read as UTF-8 and trimmed. A file that cannot be read, or is empty, is an error.
3. The environment variable `MJ_DIAG_PRIVATE_KEY`. An empty value counts as not set.

`mj diag scrub` writes a new `redactionSummary` for its own scrub run: `credentialsScrubbedCount` from this run, `sqlLiteralsNormalizedCount` as the number of SQL events when the profile is `Standard` (else 0), and `customPatternsAppliedCount` 0.

---

## 6. Known Limits

- **Per-process stores.** The intake nonce replay cache and the bundle download-token nonce store are in memory, per process. With more than one MJAPI instance, a nonce or token used on one instance is not known to the others.
- **Cross-process races.** Registration codes and the `MaxBundlesPerDay` quota are protected by locks inside one collector process only. Two collector processes can accept one registration code at the same moment; only the last key is stored, and the other sender's later requests get 401. Several collector processes can together pass `MaxBundlesPerDay`.
- **Unknown-install cache.** The 60-second cache of install IDs with no registration is per process. On a collector with more than one instance, an install refused on one instance can stay refused there for up to 60 seconds after it enrols on another.
- **Restart.** Server chunks that are kept in memory after a failed save are lost when the process restarts.
- **Console tap.** When another library replaces a `console.*` method without calling the method it replaced, capture stops for that method.
- **Duplicate chunk on retry.** When a chunk `Save()` commits and then throws, the chunk stays in memory and the next save writes it again, so the bundle can hold a duplicate chunk row. A duplicate is preferred over a lost chunk.
- **Record data in identifiers.** A click-breadcrumb identifier that holds a slug of record data with other separators (for example `contact-alice-smith` on a button with the text "Alice Smith") is kept. Do not put record data in element IDs or test IDs.
- **Over-redaction.** Stage 1 leans toward hiding data. A log line such as `Authorization: Diagnostics: Manage denied` loses its tail, and a sensitive-named SQL column value (`WHERE PasswordHash = '...'`) is redacted in `FullRaw` too.
- **Literal scrubbing gaps.** PostgreSQL `E'...'` and `$$...$$` literals are not normalized. In the `Standard` profile, `serverSql[].errorMessage`, span `errorMessage`, and log `errorStack`/`data` keep their literals.
