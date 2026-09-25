# @memberjunction/work-queue-samples

Sample handlers for trying the MemberJunction durable work queue end to end without writing code first. The
package ships one handler, `HelloWorldHandler`, registered under the HandlerKey `samples.hello`. It is inert
unless a subscription names that key.

## Try it in ten minutes

1. **Seed the sample topology** (one topic, three subscriptions — one per partition mode) into your development
   database. It lives under `metadata-optional/`, so it is never part of a normal `mj sync push`:

   ```bash
   mj sync push --dir=metadata-optional/work-queue-samples
   ```

   You get topic `samples.hello` (external publishing allowed) and subscriptions `samples.hello-log` (`None`),
   `samples.hello-exclusive` (`Exclusive`) and `samples.hello-ordered` (`Ordered`), all on `HandlerKey = samples.hello`.

2. **Publish** a message from your machine (MJ-code path, no API key needed):

   ```bash
   mj queue publish --topic samples.hello --payload '{"name":"Paul"}'
   mj queue stats
   ```

   Every publish fans out to all three subscriptions, so `stats` shows Pending = 1 on each.

3. **Run the work.** Either as a one-shot container job from the CLI:

   ```bash
   mj queue work --subscription samples.hello-log --once
   ```

   or inside MJAPI, by enabling the host in `mj.config.cjs` (`workQueue: { enabled: true, systemUserEmail: '<an existing user>' }`)
   and restarting it. The handler logs `Hello, Paul!` with the delivery details.

4. **Exercise the queue's behaviours** from the same topic — the payload fields drive them:

   | Payload | What you see |
   | --- | --- |
   | `{"sleepMs": 60000}` | The delivery stays `InFlight` for a minute. `mj queue discard --subscription samples.hello-log --delivery <id> --reason "cancel"` stops it early: the handler's Signal aborts with `Cancelled` and the row is `Discarded` |
   | `{"fail": "fatal"}` | Dead-letters immediately. `mj queue dead-letters --subscription samples.hello-log`, then `mj queue replay …` |
   | `{"fail": "transient"}` | Retries with backoff (2 s, 4 s, …) until `MaxAttempts` (3), then dead-letters |
   | `{"failUntilAttempt": 2}` | Fails attempt 1 on purpose and succeeds on attempt 2: a retry that recovers |
   | `--partition-key k1 --count 3` | On `samples.hello-exclusive` the three run one at a time; on `samples.hello-ordered` they run in publish order, and a `fail: "fatal"` head blocks the key until `mj queue replay` (`mj queue partitions --subscription samples.hello-ordered --condition Blocked`) |
   | `--dedup-key evt-1` twice | The second publish reports `Duplicate` naming the first message |

5. **Publish from outside MJ** through the REST endpoint (enable `WorkQueueServerExtension` in `mj.config.cjs`
   `serverExtensions` and use an API key with the `workqueue:publish` scope):

   ```bash
   curl -X POST http://localhost:4000/work-queue/topics/samples.hello/messages \
     -H "x-api-key: mj_sk_…" -H "Content-Type: application/json" \
     -d '{"messages":[{"payload":{"name":"REST"}}]}'
   ```

6. **Remove the samples** when done: delete the three subscriptions and the topic through Explorer or
   `mj sync` (their deliveries and messages are driver-owned rows; the retention sweeper purges settled ones, and
   pending ones can be discarded with `mj queue discard`).

## Moving the sample to another transport

The handler and the CLI commands are transport-neutral. To run the same demo on a cloud transport once one is
installed, point `samples.hello`'s `TransportID` at that transport's row and re-run the steps above; nothing in
this package changes.

## Writing your own handler

Copy `HelloWorldHandler`: extend `BaseWorkHandler<TPayload>` from `@memberjunction/work-queue-engine`, decorate
with `@RegisterClass(BaseWorkHandler, '<your.key>')`, and make sure the package is in the host's class manifest
(`mj codegen manifest`) so the ClassFactory can resolve the key. The engine README's "Writing a handler" section
and the consumer guide (`plans/work-queue-1/10-consumer-guide.md`) cover idempotency, long-running work and the
abort reasons.
