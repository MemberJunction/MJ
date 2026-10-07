# @memberjunction/work-queue-server

REST publish endpoint for the MemberJunction work queue, delivered as an MJServer Server Extension. Operators
use Remote Operations and `mj queue`; this package only accepts publishes from producers outside MJ.

## Enable

```javascript
// mj.config.cjs
serverExtensions: [
  { Enabled: true, DriverClass: 'WorkQueueServerExtension', RootPath: '/work-queue', Phase: 'post-auth',
    Settings: { MaxBatch: 100, BodyLimit: '30mb' } },
],
```

The extension mounts after MJ's unified authentication and needs `workQueue.systemUserEmail` set (it configures the
engine as that user). A topic accepts REST publishes only when `AllowExternalPublish = 1`. `MaxBatch` defaults to 100
(its maximum) and `BodyLimit` to `30mb`. The extension is registered in `@memberjunction/server-bootstrap`'s class
manifest; `GET /health/extensions` reports it, together with the host's subscription states.

## Publish

REST publishing is **API-key only**. A browser or JWT session is refused with 403 even when the user is an
administrator; interactive callers publish through MJ code instead. The key needs the `workqueue:publish` scope; the
check is the same one GraphQL resolvers use (`full_access` keys pass, the key's acting context applies). The `MJAPI`
API application must allow the scope, which the shipped `metadata/api-application-scopes` does.

```bash
curl -X POST https://api.example.com/work-queue/topics/email.events/messages \
  -H "x-api-key: mj_sk_…" -H "Content-Type: application/json" \
  -d '{"messages":[{"messageId":"…","partitionKey":"subscriber@example.com","attributes":{"eventType":"click"},"payload":{"url":"https://…"},"deduplicationKey":"sg:evt-123"}]}'
```

Request fields are camelCase. Result **values** are the contract's PascalCase strings:

```json
{ "results": [ { "messageId": "…", "status": "Accepted" },
               { "messageId": "…", "status": "Rejected", "error": { "code": "PayloadTooLarge", "message": "…", "retryable": false } } ] }
```

| Status | When |
| --- | --- |
| 202 | The batch was processed — inspect each `results[i].status`: `Accepted`, `Duplicate`, or `Rejected` with `error.code` and `error.retryable` |
| 400 | Invalid topic name, body is not valid JSON, body could not be read, or body shape invalid (1–`MaxBatch` messages, known camelCase fields only) |
| 401 | Not authenticated (MJ's unified authentication answers this before the extension runs) |
| 403 | No API key, the key lacks `workqueue:publish`, or the topic is `TopicNotExternallyPublishable` |
| 404 | Unknown topic |
| 413 | Body larger than `BodyLimit` |
| 500 | Unexpected failure (logged) |

Authentication and the scope check run **before** the body is read, so an unauthorized caller cannot make the server
parse a 30 MB body.

Producers retrying after a timeout **must reuse their `messageId`s**. Treat `Duplicate` as success; retry only
items whose `error.retryable` is true (`DeduplicationPending` is one: another publish holds that key's reservation).

## In this package

| Export | Role |
| --- | --- |
| `WorkQueueServerExtension` | The `BaseServerExtension` (`@RegisterClass` key `WorkQueueServerExtension`): mounts the router, reports health, shuts down cleanly |
| `CreateWorkQueuePublishRouter` | The Express router, given `WorkQueuePublishDependencies` — reusable behind any middleware that sets `req.userPayload` |
| `HandleWorkQueuePublish` | The transport-free handler: authentication, scope check, body parsing, publish, status mapping |
| `APIKeyScopeAuthorizer` | Scope check through `GetAPIKeyEngine().Authorize` as the system user |
| `ParseServerSettings`, `ParsePublishBody`, `IsValidTopicName` | Settings validation and the REST body ↔ contract mapping over `@memberjunction/work-queue-core`'s helpers |
