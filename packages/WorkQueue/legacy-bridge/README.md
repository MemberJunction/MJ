# @memberjunction/work-queue-legacy-bridge

Routes legacy `@memberjunction/queue` task types onto the durable work queue, per queue type, opt-in.

`@memberjunction/queue` does **not** depend on the work queue. It exposes a seam (`LegacyQueueRouterRegistry`);
importing this package registers the router and the `MJQueue.LegacyQueueDriver` work-queue handler. Only server
bootstraps import it, so CodeGen, MetadataSync and the CLI — which load the data providers, and through them the
queue package — never load the work-queue engine.

| Piece | Role |
| --- | --- |
| `WorkQueueLegacyRouter` | Publishes `{ queueTypeName, data, options, userID }` to the Active topic `mjqueue.<queue type slug>`; declines (the task runs in-process) when the topic is missing, not Active, has no Active/Paused subscription, the data is not plain JSON, or the publish is rejected |
| `LegacyQueueDriverHandler` (`MJQueue.LegacyQueueDriver`) | Runs the task through the `QueueBase` driver registered for the queue type, as the enqueuing user |
| `LegacyQueueTopicName(name)` | The topic name for a queue type; names differing only in case or punctuation share a topic |

Failure handling: a driver `success: false` is retried with the subscription's backoff; unrecognised task data, an
unknown entity or a missing driver dead-letters immediately; a record that does not load is retried until the last
attempt and then completed with a warning. Legacy drivers cannot be cancelled mid-run — size the subscription's
`LeaseSeconds` for the longest task.

See `packages/MJQueue/README.md` for the operator steps.
