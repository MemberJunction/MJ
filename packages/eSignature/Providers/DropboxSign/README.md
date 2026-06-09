[← Back to eSignature Overview](../../README.md) · [Core Primitive](../../Base/README.md)

# @memberjunction/esignature-dropboxsign

The **Dropbox Sign** (formerly **HelloSign**) driver for the MemberJunction eSignature subsystem. It implements the [`BaseSignatureProvider`](../../Base/README.md#the-provider-contract-basesignatureprovider) contract against the Dropbox Sign REST API `v3`, using HTTP Basic authentication with your API key.

```bash
npm install @memberjunction/esignature-dropboxsign
```

> You don't call this package directly. You configure a Dropbox Sign **Signature Account** and use the [`SignatureEngine`](../../Base/README.md#the-engines) (or the [no-code Actions](../../Base/README.md#using-the-actions-no-code)). The engine resolves and drives this provider for you.

---

## At a glance

| | |
|---|---|
| **Driver key** | `DropboxSign` |
| **Registration** | `@RegisterClass(BaseSignatureProvider, 'DropboxSign')` |
| **Authentication** | HTTP Basic (API key as username, empty password) |
| **API** | Dropbox Sign REST API `v3` (`api.hellosign.com/v3`) |
| **Webhooks** | HMAC-SHA256 verified |

### Supported operations

| Operation | Supported |
|---|:---:|
| Create envelope | ✅ |
| Get status | ✅ |
| Download signed | ✅ |
| Void | ✅ |
| Parse webhook event | ✅ |
| Verify webhook signature | ✅ |
| Templates | — |
| Embedded signing | — |

---

## Configuration

These values live in the account's **Credential** (encrypted via the [Credential Engine](../../../Credentials)) — never in code or environment variables.

| Key | Required | Default | Description |
|---|:---:|---|---|
| `apiKey` | ✅ | — | Dropbox Sign API key, sent via HTTP Basic auth. |
| `restBase` | — | `https://api.hellosign.com/v3` | REST API base. |
| `testMode` | — | `false` | When `true`, requests are flagged as non-billable **test** requests. Great for development. |
| `connectHmacKey` | — | *(falls back to `apiKey`)* | HMAC secret for verifying webhooks. Dropbox Sign signs callbacks with the account API key by default, so this is optional. |

### Test mode

Dropbox Sign supports a first-class **test mode** that creates non-billable signature requests — ideal for development and CI. Set `testMode: true` on the account configuration and every request the driver sends is marked `test_mode=1`. Flip it off for production.

### One-time setup

1. In Dropbox Sign, generate an **API key** (Settings → API).
2. In MemberJunction:
   - The **Dropbox Sign** Signature Provider row is already seeded.
   - Create a **Credential** holding `apiKey` (and `testMode` if developing).
   - Create a **Signature Account** pointing at that credential.
3. (Production) Configure a Dropbox Sign callback URL pointing at `POST {your-server}/esignature/webhook/DropboxSign`.

---

## Status mapping

Dropbox Sign's native signature-request statuses map onto MemberJunction's [normalized lifecycle](../../Base/README.md#status):

| Dropbox Sign status | MJ `EnvelopeStatus` |
|---|---|
| `awaiting_signature` | `Sent` |
| `on_hold` | `Delivered` |
| `signed` | `Signed` |
| `declined` | `Declined` |
| `error` | `Unknown` |

---

## Webhooks

Dropbox Sign pushes events to `POST /esignature/webhook/DropboxSign`. Each callback carries an `event_hash` computed as an HMAC-SHA256 over `<event_time><event_type>` keyed with your API key (or an explicit `connectHmacKey`). The driver recomputes and compares it before trusting the event. See the [webhook flow](../../Base/README.md#inbound-webhooks).

---

## Testing

```bash
cd packages/eSignature/Providers/DropboxSign && npm run test
```

---

## Related

| | |
|---|---|
| [eSignature overview](../../README.md) | The whole subsystem. |
| [Core primitive](../../Base/README.md) | The contract, engine, and data model this driver plugs into. |
| [DocuSign driver](../DocuSign/README.md) · [PandaDoc driver](../PandaDoc/README.md) | Sibling providers. |
