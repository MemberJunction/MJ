# W1 + W3 — LIVE end-to-end verification against MJAPI (2026-06-25)

**Status: PASSED.** The guest-session mint + auth-middleware validation were exercised against a
**running MJAPI** (`http://localhost:4000`), not just unit tests. This supersedes the earlier
"Auth0-gated / blocked" framing — see the correction below.

## Correction: the widget path never depended on Auth0

Earlier in the session I labelled the live widget acceptance "Auth0-gated." **That was wrong** — I
assumed it without trying to boot MJAPI. The widget guest flow is **self-contained**: it mints + validates
**magic-link RS256 self-signed JWTs** (MJ's own `MagicLinkKeyManager` + the `magic-link` auth provider,
registered idempotently by the widget's `ensureWidgetSigning`). Auth0/Azure is only for normal interactive
MJ login, which the guest path bypasses entirely.

The **real** prerequisites turned out to be:
1. **Feature flag** — `widget.enabled` (and `magicLink.enabled`, to register the shared signing provider)
   are off by default in `mj.config.cjs`. Enabling them is all the widget needs.
2. **DB app login** — after the SQL container restart, the **read-only pool** login `MJ_Connect`
   (`DB_READ_ONLY_USERNAME` in `packages/MJAPI/.env`) had a drifted password, so MJAPI's bootstrap failed
   with `Login failed for user 'MJ_Connect'`. Fixed with `ALTER LOGIN [MJ_Connect] WITH PASSWORD …` (as `sa`)
   to match the env value. (Unrelated to the widget; it blocked the whole server from booting.)

MJAPI then booted cleanly: `Ready http://localhost:4000/`, 357 entities, `Auth: azure, magic-link`.

## Results (all live curl against MJAPI)

| Test | Result |
|---|---|
| `GET /magic-link/jwks.json` | **200** (signing keyset published) |
| `POST /widget/session` — seeded key `pk_test_example_support_widget`, `Origin: http://localhost:4200` | **200** — RS256 JWT minted; response `{ widgetId, applicationId, pinnedAgentId (Sage), modality: "Both" }`. Token claims: `email=anonymous@magic-link.local`, `mj_role=Widget Guest`, `mj_anon=true`, `mj_widget_id=5CA6FA5E…`, `mj_magic_link=true`. |
| `POST /widget/session` — `Origin: https://evil.example.com` | **403** `origin_not_allowed` (allowlist enforced live) |
| `POST /widget/session` — `widgetKey: pk_does_not_exist` | **403** `not_found` (enumeration-resistant) |
| `POST /widget/session` — no `widgetKey` | **400** |
| `query { CurrentUser }` **without** token | **401** `Authentication failed` |
| `query { CurrentUser { ID Email Name Type } }` **with** guest token | **200** → `ID=273910DF-28F1-45C1-A8F8-6E9AD8E5F008`, `Email=anonymous@magic-link.local`, `Name=Anonymous` |

The last row is the exact **W1 acceptance**: the minted JWT is accepted by the existing unified auth
middleware and resolves to the **constrained shared Anonymous principal**. Combined with the W2 spike
(that principal reads `MJ: Conversations`, is denied `MJ: AI Models`) the full chain — mint → validate →
constrained guest with only the pinned agent + scoped role reachable — is verified end-to-end, live.

## What this does NOT yet cover (still genuinely gated)

- **A real guest agent turn** (text/voice) requires the **Anthropic key + a live agent run** through
  `ConversationsRuntime` driven by the browser widget; the GraphQL/runtime wiring (`RuntimeWidgetTransport`)
  is in place but a full turn wasn't driven here. The runtime path is the same one Explorer uses.
- **The browser bundle in a real page** (`blank-host.html`) needs the bundle served + a real browser; the
  mint/validate backbone it depends on is now proven.

## Reproduce

1. `mj.config.cjs`: set `magicLink.enabled: true` and add `widget: { enabled: true, audience: 'mj-magic-link' }`.
2. Ensure the `MJ_Connect` login password matches `packages/MJAPI/.env`'s `DB_READ_ONLY_PASSWORD`.
3. `cd packages/MJAPI && npm run start` → wait for `Ready`.
4. Run the curls above. (Both temp config edits were reverted after this test; the DB login fix persists.)
