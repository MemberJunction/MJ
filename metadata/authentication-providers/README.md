# Authentication Providers

Seed rows for `MJ: Authentication Providers` — the metadata catalog that makes MJ's auth
providers pluggable. A row names a `DriverClass` that is resolved at runtime via
`MJGlobal.ClassFactory.CreateInstance(BaseAuthProvider, DriverClass, config)`, exactly as
File Storage Providers (`ServerDriverKey`) and AI Remote Browser Providers (`DriverClass`) work.

## What ships, and what you fill in

Every seeded row is **`Status: Inactive`** with its connection fields left null. That split is
deliberate:

- **Shipped (universal):** `Name`, `DriverClass`, `DisplayName`, `Icon`, `Sequence`,
  `ClientVisible` — what the provider *is* and how it presents. Identical in every install.
- **Yours (per-deployment):** `Issuer`, `Audience`, `JWKSUri`, `ClientID`, `Domain`, `Scopes`,
  and the two configuration blobs. These are your tenant's coordinates; MJ cannot ship them.

So the catalog arrives knowing every provider MJ supports, and an administrator activates one by
filling in their own values and setting `Status` to `Active`.

**Nothing activates by accident.** With every row `Inactive`, `AuthProviderEngine` registers none
of them, the public catalog endpoint returns an empty list, and the browser falls back to the
compiled `AUTH_TYPE` — so installing this metadata changes no behavior until someone opts in.
Activating a row with no `Issuer`/`JWKSUri` would fail its own `validateConfig()` and be skipped
with an error rather than breaking other providers, but the intended path is: fill in, then activate.

## The two configuration blobs

`AdditionalConfiguration` is **server-only and never published**. `ClientConfiguration` is
**published verbatim** to the unauthenticated `GET /auth/providers` endpoint that the browser reads
before login. Treat every value in `ClientConfiguration` as world-readable; anything sensitive
belongs in `AdditionalConfiguration`, or — for real secrets — behind `CredentialID`, which points at
an encrypted `MJ: Credentials` record.

None of the seeded providers needs a credential: they all validate tokens against a public JWKS,
and `ClientID` is public by design. `CredentialID` exists for the uncommon server-initiated case
(confidential-client OAuth, management APIs, SCIM).

## The login picker

The picker renders only when **2 or more** `Active` + `ClientVisible` providers exist — one option
is not a choice. With a single active provider the login screen behaves exactly as it always has.
`Sequence` controls ordering; `IsDefault` pre-selects one and is the provider used directly when
it is the only visible one.

## Deliberately NOT seeded

Two providers MJ ships are absent from this folder on purpose. Both are registered by code that
already owns their configuration, so a catalog row would be misleading — it would imply they are
configurable here when they are not.

| Provider | Why it is not a catalog row |
|---|---|
| `magic-link` | Registered by `registerMagicLinkAuthProvider()` from `configInfo.magicLink`, and its issuer is MJ's own runtime public URL — a value metadata cannot know. It is also not a button: a magic-link session is detected from a token already in the browser, so it would never belong in the picker. |
| `host-identity` | Realtime-widget host assertions are verified against a **static per-`WidgetInstance` public key** (`WidgetInstance.HostPublicKey`), not a JWKS endpoint. Trust material is per-widget and resolved directly by the widget mint, so there is nothing deployment-wide to configure. |

## Adding your own provider

No core changes are needed:

1. Ship a server class decorated `@RegisterClass(BaseAuthProvider, 'my-idp')` in a package covered
   by a class-registration manifest.
2. For interactive login, ship the browser counterpart `@RegisterClass(MJAuthBase, 'my-idp')`. If it
   does not read the conventional `MY_IDP_CLIENTID` / `MY_IDP_DOMAIN` keys, give it a static
   `environmentFromCatalog(info)` to map the row itself.
3. Add a row here (or through the Admin UI) with `DriverClass: "my-idp"`.
