# @memberjunction/communication-expo-push

Expo push-notification provider for the MemberJunction Communication framework. Sends mobile push notifications to [Expo push tokens](https://docs.expo.dev/push-notifications/overview/) through the same communication engine used for email and SMS.

## What it does

Registers an `ExpoPushProvider` (via `@RegisterClass(BaseCommunicationProvider, 'Expo Push')`) that the communication engine discovers by provider name. It sends a single HTTPS `POST` to the Expo Push API (`https://exp.host/--/api/v2/push/send`) — no Expo SDK is required (it uses the global `fetch`).

## Message mapping

| Framework `ProcessedMessage`            | Expo payload |
|-----------------------------------------|--------------|
| `To`                                    | `to` (the Expo push token) |
| `ProcessedSubject` (fallback `Subject`) | `title` |
| `ProcessedBody` (fallback `Body`)       | `body` |
| `ContextData.pushData` / `.data`        | `data` |

The provider inspects the Expo response ticket: an `ok` ticket yields `Success: true`; an `error` ticket (or a top-level request error / non-OK HTTP status) yields `Success: false` with the Expo error surfaced in `MessageResult.Error`.

## Configuration

Both are optional and read via environment variables (or per-request credentials):

- `EXPO_ACCESS_TOKEN` — optional Expo access token sent as a `Bearer` token for higher rate limits. The provider degrades gracefully (still sends) without it.
- `EXPO_PUSH_API_URL` — override the Expo endpoint (defaults to the public Expo Push service).

Per-request override:

```typescript
await provider.SendSingleMessage(message, { accessToken: 'expo-token-xyz' });
```

## Supported operations

`SendSingleMessage` only. Push is a send-only channel, so `GetMessages`, `ForwardMessage`, `ReplyToMessage`, and `CreateDraft` return a "not supported" result.
