---
"@memberjunction/redis-provider": patch
---

Named-channel pub/sub on `RedisLocalStorageProvider` is now usable by applications that need cross-replica messaging, so they no longer have to open their own Redis connections (#4726).

- **`PublishMessageAndWait(channel, payload)`** resolves to the number of subscribers that received the message, and rejects when pub/sub is disabled or Redis rejects the publish. `PublishMessage` stays fire-and-forget.
- **`IsPubSubEnabled`** tells a caller whether the channel methods are live. With pub/sub off they do nothing, which was previously indistinguishable from a working subscription.
- **Unsubscribing the last handler on a channel now unsubscribes it in Redis.** Before, the subscription stayed for the life of the process.
- **A failed `StartListening` no longer breaks every later subscription.** The subscriber was kept after a failed start, so later calls treated it as running, and it had no message listener, so their handlers never fired. It is now closed and the next call starts a fresh one. Concurrent callers share one start-up.
- **Async handlers** are accepted (`ChannelMessageHandler`). A rejected promise is logged and contained like a thrown error, and handler failures are logged even with `enableLogging: false`.
- **`__pubsub__` is refused as a channel name.** A message there would be read as a cache change by every server.
