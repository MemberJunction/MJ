# MCP Multi-Version Support

**Goal**: upgrade `@memberjunction/ai-mcp-server` and `@memberjunction/ai-mcp-client` to speak the
[MCP 2026-07-28 revision](https://blog.modelcontextprotocol.io/posts/2026-07-28/) **alongside** the
2025-era revisions, with the era/version selectable by config — server-side per deployment, client-side
per external server row — and structured so a future revision is a dependency bump rather than a rewrite.

Status: **plan / not started**
Branch: `claude/mcp-multi-version-support-h0sh0h`
Target: **6.0**

---

## 0. Key decisions remaining

Seven open calls, each one gating a phase below. Nothing here blocks *writing* the code — they all
change what we ship or what we break, so they want an answer before the corresponding phase merges.
Ordered by how early they bind.

| # | Decision | Options | Recommendation | Gates |
|---|---|---|---|---|
| **D1** | **Legacy serving model** — do we keep our sessionful `streamableTransports` map behind `isLegacyRequest()`, or hand 2025-era traffic to the SDK's per-request stateless fallback? | `sessionful` / `stateless` | Ship `sessionful` as the default so the upgrade is a behavioral no-op; document `stateless`; flip the default in the next minor. | Phase 2 |
| **D2** | **`/mcp/sse` lifetime** — legacy HTTP+SSE is deprecated by the spec and has no v2 server transport. How long do we carry it? | one minor w/ warning / immediate removal / indefinite | One minor release behind `protocol.legacy.sse.enabled` (default `true`) with a deprecation warning on connect, then default `false`. This is the *only* reason `@modelcontextprotocol/sdk@^1` stays installed. | Phase 3 |
| **D3** | **`WebSocket` transport** — v2 ships no `WebSocketClientTransport`, and `'WebSocket'` is a live value in `MCPTransportType` and the DB CHECK constraint. | deprecate / port ~80 lines locally | Deprecate — it was never in the MCP spec's transport set. **Needs a data check first**: is any `MJ: MCP Servers` row actually using it? If yes, port. | Phase 5 |
| **D4** | **Default era posture for new deployments** — does a fresh install answer `both` or `modern` only? | `both` / `modern` | `both` for 6.0. Revisit once the ecosystem's client mix is known. | Phase 0 |
| **D5** | **Per-request auth cost** — statelessness means every modern request re-authenticates. `TokenValidator` + `GetAPIKeyEngine` are cached, but this is unmeasured. | measure then decide | Benchmark before Phase 2 merges; if the cached path is not cheap enough, add a short-TTL validated-token cache keyed on the token hash. | Phase 2 |
| **D6** | **CIMD adoption** — DCR is deprecated in favor of Client ID Metadata Documents but remains functional. | now / follow-up | Follow-up after 6.0. Note the deprecation in the OAuth proxy README so integrators are not surprised. | Phase 6 |
| **D7** | **Extensions scope for 6.0** — MRTR, Tasks, and `subscriptions/listen` are all opt-in and all genuinely useful to us (mid-call confirmation on `Delete_*` tools; `Run_Agent` as a task; cross-instance `tools/list_changed`). | in 6.0 / follow-up | Follow-up. Phases 0–6 + 8 are the 6.0 scope; Phase 7 lands after. | Phase 7 |

Two of these have a factual answer we can just go get rather than debate — **D3** (query the
`MCPServer` table for `TransportType = 'WebSocket'`) and **D5** (benchmark the auth path). Doing that
first collapses the list to five judgment calls.

---

## 1. What changed in the spec

The 2026-07-28 revision is the largest break since MCP shipped. The parts that touch us:

| Change | Impact on MJ |
|---|---|
| **Stateless core** — `initialize`/`initialized` handshake and `Mcp-Session-Id` removed. Each request carries protocol version, client identity, and capabilities in reserved `_meta` keys. | Server: our two session maps (`transports`, `streamableTransports`) become legacy-only. Client: nothing to hold open. |
| **`server/discover`** replaces `initialize` for capability discovery. | Client must probe; server must answer both. |
| **Header-based routing** — `Mcp-Method` and `Mcp-Name` are mandatory on Streamable HTTP POSTs. | Our Express auth middleware can gate/meter on headers *before* body parse. |
| **MRTR** (Multi Round-Trip Requests) — server returns `resultType: "input_required"`, client retries with `inputResponses`. Replaces server-initiated sampling/elicitation over open streams. | New capability for us; nothing breaks by not using it. |
| **Cacheable lists** — `tools/list`, `prompts/list`, `resources/list`, `resources/read` return `ttlMs` + `cacheScope`. | Client gets free round-trip savings; server should emit hints for our largely-static tool set. |
| **Extensions framework** — Tasks moved out of core into `io.modelcontextprotocol/tasks`; change notifications consolidate into `subscriptions/listen`. | Opt-in. |
| **Auth hardening** — RFC 9207 `iss` required and validated; `application_type` in DCR; client credentials bound to issuer; DCR deprecated in favor of CIMD. | Real gaps in both our OAuth client and our OAuth proxy — see §5. |
| **Deprecated (12-month window)** — Roots, Sampling, Logging, legacy HTTP+SSE transport, DCR. | Our `/mcp/sse` + `/mcp/messages` endpoints are on a clock. |

## 2. Where we are today

Both packages depend on `@modelcontextprotocol/sdk@^1.26.0` — the monolithic v1 line, which tops out
at 1.30.0 and implements the 2025-era spec only.

**Neither package contains a single protocol-version reference.** `grep` for `2025-06-18`,
`LATEST_PROTOCOL_VERSION`, `MCP-Protocol-Version`, `protocolVersion` across `packages/AI/MCPClient`
and `packages/AI/MCPServer` returns nothing. We inherit whatever the SDK defaults to, and we have no
switch to change it. That is the gap this plan closes.

Concretely:

**Server** (`packages/AI/MCPServer/src/Server.ts`, 3449 lines)
- `McpServer` + `SSEServerTransport` (`/mcp/sse` + `/mcp/messages`, `Server.ts:1205`/`:1279`) and
  `StreamableHTTPServerTransport` (`/mcp`, `Server.ts:1358`), both sessionful, keyed off
  `mcp-session-id`.
- A fresh `McpServer` is constructed **per session** and `registerAllTools(server, sessionContext, systemUser)`
  registers user-scoped tools on it (`Server.ts:749`). This shape is a direct match for the v2 factory
  model — see §4.
- `(server as any).registerTool(...)` at `Server.ts:771` — an `any` cast we should retire.
- Config in `src/config.ts` is Zod-validated `mcpServerSettings` from `mj.config.cjs`; there is no
  `protocol` section.

**Client** (`packages/AI/MCPClient/src/MCPClientManager.ts`, 2217 lines)
- `new Client({name, version})` → `client.connect(transport)` → `client.getServerCapabilities()`
  (`MCPClientManager.ts:285-294`). No version options passed anywhere.
- Four transports: `StreamableHTTP`, `SSE`, `Stdio`, `WebSocket` (`MCPClientManager.ts:1826-1841`).
- `MCPServerCapabilities` in `src/types.ts:370` models the 2025 `initialize` result shape only.
- Per-server config comes from the `MJ: MCP Servers` entity — which has no protocol columns.

**Consumers** (unchanged by this work, but they define the blast radius):
`packages/MJServer/src/resolvers/MCPResolver.ts`, `packages/Actions/CoreActions/src/custom/mcp/*.action.ts`,
and the generated `MJMCPServer` / `MJMCPToolFavorite` Explorer forms.

## 3. The SDK does most of the multi-version work for us

`@modelcontextprotocol/sdk` v1 is superseded by a split v2 (`2.0.0`, stable):
`@modelcontextprotocol/core`, `/server`, `/client`, plus `/express` and `/node` adapters.

**One dependency covers both eras.** v2's core carries
`SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07']`
for the legacy ladder *and* implements 2026-07-28 as the modern era, with `ProtocolEra = 'legacy' | 'modern'`
threaded through both sides. We do not need to keep v1 installed for backwards compatibility.

**The server-side switch already exists** —
`createMcpHandler(factory, { legacy: 'stateless' | 'reject', responseMode, bus, keepAliveMs, maxSubscriptions })`:
- `legacy: 'stateless'` (default) answers 2025-era traffic from the same factory over a per-request
  stateless transport; GET/DELETE session ops return `405`.
- `legacy: 'reject'` is modern-only strict.
- `isLegacyRequest(request)` lets us route legacy traffic to our *existing* sessionful wiring instead,
  which is how we preserve today's behavior byte-for-byte during the transition.

**The client-side switch already exists** — `ClientOptions.versionNegotiation`:
```ts
type VersionNegotiationMode = 'legacy' | 'auto' | { pin: string };   // default: 'legacy'
interface VersionNegotiationOptions {
  mode?: VersionNegotiationMode;
  probe?: { timeoutMs?: number; /* + retry policy */ };
}
```
plus `ConnectOptions.prior` (cached era verdict, zero round trips) and
`CacheableRequestOptions.cacheMode: 'use' | 'refresh' | 'bypass'` on the cacheable verbs.

**Two facts that de-risk the migration:**

1. **`McpServerFactory` maps 1:1 onto our existing shape.** It is
   `(ctx: { era: 'legacy'|'modern'; authInfo?: AuthInfo; requestInfo?: Request }) => McpServer | Server`.
   Our `registerAllTools(server, sessionContext, systemUser)` becomes the factory body. The tool layer —
   all seven `load*Tools` functions and the custom-provider hook — does not move.
2. **No Zod migration.** v2 uses Standard Schema, and the repo's `zod@^3.25.0` already ships `~standard`
   (plus a `zod/v4` subpath). Our existing `z.object()` tool schemas are accepted as-is. v2 also exports
   `fromJsonSchema()`, which is a better fit than Zod for the dynamically-built entity/action tools.

**Two things v2 does not carry:**
- **No `SSEServerTransport`.** The deprecated HTTP+SSE server transport is gone. Our `/mcp/sse` +
  `/mcp/messages` endpoints have no v2 equivalent.
- **No `WebSocketClientTransport`.** Our `'WebSocket'` value in `MCPTransportType` and in the DB CHECK
  constraint has no v2 backing.

Both are addressed in Phase 3 and Phase 5 below, and both are open decisions — see D2 and D3 in §0.

---

## 4. Plan

### Phase 0 — Config surface (do this first; it defines everything downstream)

**0a. Server config** — new `protocol` section in `mcpServerInfoSchema` (`packages/AI/MCPServer/src/config.ts`):

```js
// mj.config.cjs → mcpServerSettings.protocol
protocol: {
  eras: 'both',                  // 'both' | 'modern' | 'legacy'
  modern: {
    enabled: true,
    responseMode: 'auto',        // 'auto' | 'sse' | 'json'
    keepAliveMs: 15000,
    maxSubscriptions: 1024,
    extensions: { tasks: false } // io.modelcontextprotocol/tasks
  },
  legacy: {
    mode: 'sessionful',          // 'sessionful' | 'stateless' | 'off'
    sse: { enabled: true }       // /mcp/sse + /mcp/messages
  }
}
```

`legacy.mode: 'sessionful'` keeps our current `streamableTransports` map behind `isLegacyRequest()`;
`'stateless'` delegates to the SDK's per-request fallback; `'off'` maps to `createMcpHandler`'s
`legacy: 'reject'`.

**Defaults must reproduce today's behavior exactly** (`eras: 'both'`, `legacy.mode: 'sessionful'`,
`legacy.sse.enabled: true`) so the upgrade is a no-op for existing deployments. Flipping the defaults
toward modern-only is a separate, announced release.

**0b. Client config** — per-server, because we consume many external servers at different revisions.
New nullable columns on `${mj_core_schema}.MCPServer` (entity `MJ: MCP Servers`):

| Column | Type | Notes |
|---|---|---|
| `ProtocolNegotiationMode` | `nvarchar(20) NOT NULL DEFAULT 'Auto'` | CHECK `IN ('Auto','Legacy','Pinned')` |
| `PinnedProtocolVersion` | `nvarchar(20) NULL` | e.g. `'2026-07-28'`. **No CHECK constraint** — see §6. |
| `ProtocolProbeTimeoutMs` | `int NULL` | falls back to request timeout |
| `ListCacheMode` | `nvarchar(20) NOT NULL DEFAULT 'Use'` | CHECK `IN ('Use','Refresh','Bypass')` |
| `NegotiatedProtocolVersion` | `nvarchar(20) NULL` | observed, written on connect |
| `NegotiatedEra` | `nvarchar(10) NULL` | `'legacy'`/`'modern'`, written on connect |

Plus a `mcpClientSettings.protocol` block in `mj.config.cjs` supplying process-wide fallbacks for rows
that leave the columns null.

Migration goes in `migrations/v5/` and follows `migrations/CLAUDE.md` — including the ordering rule:
**`mj sync push` before `mj codegen`**, and never hand-edit `entity_subclasses.ts`. `MCPServerConfig`
in `packages/AI/MCPClient/src/types.ts` picks the new fields up only after CodeGen runs; per
`.claude/rules/typescript-style.md` we do not write code against them before that.

### Phase 1 — Dependencies

- `packages/AI/MCPServer`: drop `@modelcontextprotocol/sdk`, add `@modelcontextprotocol/server@^2`,
  `@modelcontextprotocol/node@^2`, `@modelcontextprotocol/express@^2`.
- `packages/AI/MCPClient`: drop `@modelcontextprotocol/sdk`, add `@modelcontextprotocol/client@^2`.
- Run `npm install` at the **repo root** (workspace rule). v2 pulls its own `zod@^4`; our `^3.25.0` stays.
- If `/mcp/sse` must survive past the v2 cutover (§4.3), `@modelcontextprotocol/sdk@^1.30` stays
  installed in MCPServer *only* for `SSEServerTransport`. Different package names, so v1 and v2 coexist
  cleanly.

### Phase 2 — Server: dual-era `/mcp`

1. Extract the existing per-session body of `app.all('/mcp')` into
   `createMcpServerForSession(ctx: McpRequestContext): Promise<McpServer>` — it authenticates from
   `ctx.authInfo` / `ctx.requestInfo`, builds `MCPSessionContext`, and calls the untouched
   `registerAllTools`.
2. Build the modern handler once at startup:
   `const handler = createMcpHandler(createMcpServerForSession, { legacy: <from config>, responseMode, keepAliveMs, maxSubscriptions })`.
3. Bridge to Express 5 with `toNodeHandler()` from `@modelcontextprotocol/node`, passing
   `{ authInfo, parsedBody: req.body }`.
4. When `legacy.mode === 'sessionful'`, front the handler with `isLegacyRequest(toWebRequest(req))`
   and route true → the current `streamableTransports` path, false → the modern handler. When
   `'stateless'`, skip the fork and let `createMcpHandler`'s own fallback serve it.
5. Move authentication ahead of the fork so it runs once for both eras. Now that `Mcp-Method` and
   `Mcp-Name` are mandatory headers, coarse authorization and rate limiting can key off them without
   parsing the body — worth doing while we are in here.
6. Replace `(server as any).registerTool` (`Server.ts:771`) with the properly-typed v2 signature.
7. Emit `CacheHint` (`ttlMs` / `cacheScope`) on `tools/list`. Our tool set is fixed per session, so a
   generous TTL is safe and removes a round trip per client.

**Deliverable**: `/mcp` answers 2026-07-28 and every 2025-era revision; behavior with default config is
indistinguishable from today's.

### Phase 3 — Server: legacy SSE decision

The spec deprecated HTTP+SSE with a 12-month window and v2 dropped the server transport. Recommendation:
**keep `/mcp/sse` + `/mcp/messages` on the v1 SDK for one minor release**, behind
`protocol.legacy.sse.enabled` (default `true`), log a deprecation warning on connect, and default it to
`false` in the following minor. This is the only reason v1 stays in the dependency tree, and it gives
existing clients a migration window rather than a hard break.

### Phase 4 — Client: multi-version consumption

1. `MCPClientManager.connect()` (`MCPClientManager.ts:285`) passes `versionNegotiation` built from the
   server row: `Auto → { mode: 'auto', probe: { timeoutMs } }`, `Legacy → { mode: 'legacy' }`,
   `Pinned → { mode: { pin: PinnedProtocolVersion } }`.
2. Validate `PinnedProtocolVersion` at connect time against the SDK's `SUPPORTED_PROTOCOL_VERSIONS` +
   the modern revision, and fail with a clear error naming the supported set — no hardcoded list in MJ.
3. After connect, persist `NegotiatedProtocolVersion` / `NegotiatedEra` on the server row (same pattern
   as the existing `LastSyncAt` write) and surface them on `MCPTestConnectionResult` and in the
   `MCPResolver` connection-status payload, so operators can see what actually got negotiated.
4. Cache the era verdict per connection and reuse it via `ConnectOptions.prior` on reconnect — one
   fewer probe per reconnect. Invalidate on any auth change.
5. Widen `MCPServerCapabilities` (`types.ts:370`) to cover the modern `DiscoverResult` shape, keeping
   the 2025 fields for legacy connections. Add a discriminating `era` field.
6. Thread `ListCacheMode` into `listTools()` / `syncTools()` as `cacheMode`.
7. Add `'auto'` as a `MCPTransportType` value that lets the SDK pick, so new server rows do not have to
   guess Streamable-vs-SSE.

### Phase 5 — Client: `WebSocket` transport deprecation

v2 has no `WebSocketClientTransport`. Options, in order of preference:
1. **Deprecate.** Mark `'WebSocket'` deprecated in `MCPTransportType`, keep the DB CHECK value, and
   throw a clear "not supported on MCP ≥ 2.0; use StreamableHTTP" at `createTransport()`. Cheapest, and
   WebSocket was never in the spec's transport set.
2. Port the v1 transport into MCPClient as a local `Transport` implementation (~80 lines) if any
   deployment actually depends on it.

Pick (1) unless a customer row is found using it. Either way this needs an explicit call before Phase 4
ships, since it is a user-visible capability removal.

### Phase 6 — Auth hardening (independent of the version work; ship together)

Real gaps found in the audit:

- **RFC 9207 `iss` validation** — `packages/AI/MCPClient/src/oauth/OAuthManager.ts` never validates an
  `iss` parameter on the authorization callback before redeeming the code. This is the
  authorization-server mix-up defense the new spec **requires**. Add validation against the discovered
  metadata issuer; reject on mismatch or absence when the AS advertises `authorization_response_iss_parameter_supported`.
- **`application_type` in DCR** — `packages/AI/MCPClient/src/oauth/ClientRegistration.ts` does not send
  it; `packages/AI/MCPServer/src/auth/ClientRegistry.ts` does not read it. Required for `localhost`
  redirects on desktop/CLI clients.
- **Issuer binding** — key stored client registrations by issuer so credentials cannot be replayed
  against a different AS. `ClientRegistration.ts` already filters by `IssuerURL` on load; make the bind
  explicit and enforced on use, not just on lookup.
- **CIMD** — DCR is deprecated but functional. Track as a follow-up; note it in the OAuth proxy README
  rather than building it now.

### Phase 7 — New capabilities (opt-in, after the above lands)

- **MRTR** — `inputRequired()` / `inputResponse()` on the server for mid-call confirmation on
  destructive entity tools (`Delete_*`) and for collecting missing action parameters. Currently these
  either fail or guess.
- **Tasks extension** — long-running `Run_Agent` / `Run_Action` calls map naturally onto
  `tasks/get` + `tasks/update`, replacing the current diagnostic-tool polling.
- **`subscriptions/listen`** — wire `ServerEventBus` to MJ's existing pub/sub so `tools/list_changed`
  works across MJAPI instances (see `guides/CACHING_AND_PUBSUB_GUIDE.md`).

### Phase 8 — Verification

- Unit tests per `.claude/rules/testing.md`: new `config-schemas.test.ts` cases for the `protocol`
  block; a `versionNegotiation`-mapping test in MCPClient; era-routing tests for the `isLegacyRequest`
  fork. Existing suites in both packages must stay green.
- Integration: a new deterministic bundle exercising **legacy client → MJ server** and
  **modern client → MJ server** against the same endpoint, plus MJ client → a pinned-legacy external
  server. Run headless via `npm run test:integration`.
- Round-trip check with a real third-party client on each era (Claude Code on modern, an SDK-v1 client
  on legacy).

---

## 5. Design principle: version-agnostic by construction

The requirement is not "support two versions" but "support future versions with config switches". Three
rules make that hold:

1. **No protocol version literal in MJ source.** Read `SUPPORTED_PROTOCOL_VERSIONS` /
   `LATEST_PROTOCOL_VERSION` from the SDK. Versions appear in MJ only as *data* — a config string or a
   DB column value.
2. **No CHECK constraint on `PinnedProtocolVersion`.** MJ convention is to CHECK-constrain value lists,
   but the set of protocol revisions is open and grows outside our release cycle; a CHECK would force a
   migration per spec revision. The *mode* columns (`Auto`/`Legacy`/`Pinned`, `Use`/`Refresh`/`Bypass`)
   are closed sets and do get CHECK constraints. Version strings are validated at runtime against the
   SDK. This is a deliberate, documented exception to the value-list rule in `migrations/CLAUDE.md`.
3. **Era is a routing concern, not a business-logic concern.** The seven `load*Tools` functions and the
   custom-provider hook never see an era. Adding a revision touches the handler wiring and the config
   schema only.

Under these rules, adopting the next revision is: bump the SDK, add the version string to config or a
server row, run the integration bundle.

## 6. Sequencing and sizing

| Phase | Depends on | Rough size |
|---|---|---|
| 0 — config schema + migration | — | M (migration + CodeGen cycle) |
| 1 — dependency swap | 0 | S |
| 2 — server dual-era `/mcp` | 1 | **L** — the bulk of the work |
| 3 — legacy SSE decision | 2 | S |
| 4 — client multi-version | 0, 1 | M |
| 5 — WebSocket deprecation | 4 | S (needs a product call) |
| 6 — auth hardening | 1 | M |
| 7 — MRTR / tasks / subscriptions | 2, 4 | L (defer to a follow-up) |
| 8 — tests | all | M |

Phases 0–6 + 8 are one release. Phase 7 is a follow-up.

## 7. Open questions

See **§0 — Key decisions remaining** at the top. D1–D7 are the live list; this section is kept as an
anchor for inbound links.

## 8. References

- [The 2026-07-28 Specification](https://blog.modelcontextprotocol.io/posts/2026-07-28/) — announcement
- [Key Changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog) — spec changelog
- [Beta SDKs for the 2026-07-28 Spec](https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/)
- [TypeScript SDK v2 migration guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/)
