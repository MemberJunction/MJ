import type { TopicBinding } from '../transport';
import { AssertEqual, AssertLength, AssertMatch, AssertTrue } from './assertions';
import type { ConformanceCase, ConformanceHarness } from './ConformanceHarness';
import { Keyed, Numbers, WithScenario } from './ConformanceScenario';

const PARTITIONED_TOPIC: Partial<TopicBinding> = { IsFifo: true };

const always = (): string | null => null;
const whenOrdered = (harness: ConformanceHarness): string | null =>
    harness.Capabilities.SupportsOrdered ? null : 'Transport does not support Ordered subscriptions';

const C01: ConformanceCase = {
    Id: 'C01',
    Title: 'fans a message out to every subscription',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}], ['b', {}]], async (s) => {
            const [result] = await s.Publish([{ Attributes: { n: '1' } }]);
            AssertEqual(result.Status, 'Accepted', 'publish status');
            const a = await s.Receive('a');
            const b = await s.Receive('b');
            AssertEqual(a.map((delivery) => delivery.Message.MessageID), [result.MessageID], 'subscription a');
            AssertEqual(b.map((delivery) => delivery.Message.MessageID), [result.MessageID], 'subscription b');
            AssertEqual(a[0].Attempt, 1, 'first attempt');
        }),
};

const C02: ConformanceCase = {
    Id: 'C02',
    Title: 'settles subscriptions independently',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}], ['b', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [a] = await s.Receive('a');
            const [b] = await s.Receive('b');
            AssertMatch(await s.Consumer('a').Complete(a), { Kind: 'Settled', Status: 'Completed' }, 'complete a');
            AssertMatch(await s.Consumer('b').DeadLetter(b, 'Poison', 'bad data'), { Kind: 'Settled', Status: 'DeadLettered' }, 'dead-letter b');
            AssertLength(await s.Receive('a'), 0, 'redelivery to a');
            const aDead = await s.Operator.ListDeadLetters(s.Subscription('a'), null, 100);
            const bDead = await s.Operator.ListDeadLetters(s.Subscription('b'), null, 100);
            AssertLength(aDead?.Items ?? [], 0, 'dead letters of a');
            AssertEqual((bDead?.Items ?? []).map((item) => item.Reason), ['Poison'], 'dead letters of b');
        }),
};

const C03: ConformanceCase = {
    Id: 'C03',
    Title: 'selects deliveries with attribute filters',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['clicks', { Filter: { logic: 'and', filters: [{ field: 'eventType', operator: 'eq', value: 'click' }] } }]], async (s) => {
            await s.Publish([{ Attributes: { eventType: 'open', n: '1' } }, { Attributes: { eventType: 'click', n: '2' } }]);
            AssertEqual(Numbers(await s.Receive('clicks')), ['2'], 'filtered deliveries');
        }),
};

const C04: ConformanceCase = {
    Id: 'C04',
    Title: 'does not redeliver a completed delivery',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            await s.Consumer('a').Complete(delivery);
            AssertLength(await s.Receive('a'), 0, 'redelivery');
        }),
};

const C05: ConformanceCase = {
    Id: 'C05',
    Title: 'hides a retried delivery for its delay, then redelivers it',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            AssertMatch(await s.Consumer('a').Retry(delivery, 2, 'busy'), { Kind: 'Settled', Status: 'Pending' }, 'retry');
            AssertLength(await s.Receive('a'), 0, 'receive during backoff');
            await harness.AdvanceTime(2500);
            const [again] = await s.Receive('a');
            AssertEqual(again?.Message.MessageID, delivery.Message.MessageID, 'redelivered message');
            AssertEqual(again?.Attempt, 2, 'attempt');
        }),
};

const C06: ConformanceCase = {
    Id: 'C06',
    Title: 'redelivers after an expired lease and counts the attempt',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            await s.Receive('a');
            await harness.AdvanceTime(6000);
            const [again] = await s.Receive('a');
            AssertEqual(again?.Attempt, 2, 'attempt');
        }),
};

const C07: ConformanceCase = {
    Id: 'C07',
    Title: 'fences out a stale lease token',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [first] = await s.Receive('a');
            await harness.AdvanceTime(6000);
            const [second] = await s.Receive('a');
            AssertMatch(await s.Consumer('a').Complete(first), { Kind: 'LeaseLost' }, 'stale complete');
            AssertMatch(await s.Consumer('a').Complete(second), { Kind: 'Settled', Status: 'Completed' }, 'current complete');
        }),
};

const C08: ConformanceCase = {
    Id: 'C08',
    Title: 'keeps a delivery leased after ExtendLease',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            await harness.AdvanceTime(4000);
            AssertEqual(await s.Consumer('a').ExtendLease(delivery, 5), 'Held', 'extend');
            await harness.AdvanceTime(3000);
            AssertLength(await s.Receive('a'), 0, 'receive while extended');
            AssertMatch(await s.Consumer('a').Complete(delivery), { Kind: 'Settled', Status: 'Completed' }, 'complete');
        }),
};

const C09: ConformanceCase = {
    Id: 'C09',
    Title: 'reports Lost when extending a lost lease',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [first] = await s.Receive('a');
            await harness.AdvanceTime(6000);
            await s.Receive('a');
            AssertEqual(await s.Consumer('a').ExtendLease(first, 5), 'Lost', 'extend stale lease');
        }),
};

const C10: ConformanceCase = {
    Id: 'C10',
    Title: 'lists a dead letter with its reason',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            await s.Consumer('a').DeadLetter(delivery, 'Poison', 'stack trace');
            AssertLength(await s.Receive('a'), 0, 'redelivery');
            const page = await s.Operator.ListDeadLetters(s.Subscription('a'), null, 100);
            AssertEqual((page?.Items ?? []).map((item) => [item.Reason, item.Message.MessageID]), [['Poison', delivery.Message.MessageID]], 'dead letters');
        }),
};

const C11: ConformanceCase = {
    Id: 'C11',
    Title: 'Exclusive: runs one delivery per key at a time',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const first = await s.Receive('a');
            AssertLength(first, 1, 'first receive');
            await s.Consumer('a').Complete(first[0]);
            AssertLength(await s.Receive('a'), 1, 'second receive');
        }),
};

const C12: ConformanceCase = {
    Id: 'C12',
    Title: 'Exclusive: runs different keys concurrently',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive' }]], async (s) => {
            await s.Publish([Keyed('1', 'k1'), Keyed('2', 'k2')]);
            AssertEqual(Numbers(await s.Receive('a')), ['1', '2'], 'concurrent keys');
        }),
};

const C13: ConformanceCase = {
    Id: 'C13',
    Title: 'Exclusive: a dead letter does not block its key',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [first] = await s.Receive('a');
            await s.Consumer('a').DeadLetter(first, 'Poison', null);
            AssertLength(await s.Receive('a'), 1, 'receive after dead letter');
        }),
};

const C14: ConformanceCase = {
    Id: 'C14',
    Title: 'Ordered: delivers only the head of each key',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const first = await s.Receive('a');
            AssertEqual(Numbers(first), ['1'], 'head');
            await s.Consumer('a').Complete(first[0]);
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next');
        }),
};

const C15: ConformanceCase = {
    Id: 'C15',
    Title: 'Ordered: a head in retry backoff holds its key',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Consumer('a').Retry(head, 2, 'busy');
            AssertLength(await s.Receive('a'), 0, 'receive during head backoff');
            await harness.AdvanceTime(2500);
            const again = await s.Receive('a');
            AssertEqual(Numbers(again), ['1'], 'head redelivered');
            AssertEqual(again[0]?.Attempt, 2, 'attempt');
        }),
};

const C16: ConformanceCase = {
    Id: 'C16',
    Title: 'Ordered: a dead letter blocks its key until replayed',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Consumer('a').DeadLetter(head, 'Poison', null);
            AssertLength(await s.Receive('a'), 0, 'receive behind dead letter');
            if (harness.Capabilities.ListPartitions) {
                const blocked = await s.Operator.ListPartitions(s.Subscription('a'), 'Blocked', null, 10);
                AssertEqual((blocked?.Items ?? []).map((item) => item.PartitionKey), ['k'], 'blocked keys');
            }
            const id = await s.DeadLetterID('a', head.Message.MessageID);
            AssertEqual(await s.Operator.Replay(s.Subscription('a'), id, null, 'fixed upstream'), { Supported: true, Changed: true }, 'replay');
            const replayed = await s.Receive('a');
            AssertEqual(Numbers(replayed), ['1'], 'replayed head');
            AssertTrue(replayed[0]?.IsReplay === true, 'IsReplay');
            AssertEqual(replayed[0]?.Attempt, 1, 'replay attempt');
            await s.Consumer('a').Complete(replayed[0]);
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next after replay');
        }),
};

const C17: ConformanceCase = {
    Id: 'C17',
    Title: 'Ordered: discarding the dead letter unblocks the key',
    Gate: whenOrdered,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Ordered' }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Consumer('a').DeadLetter(head, 'Poison', null);
            const id = await s.DeadLetterID('a', head.Message.MessageID);
            AssertEqual(await s.Operator.Discard(s.Subscription('a'), id, 'bad batch', null), { Supported: true, Changed: true }, 'discard');
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next after discard');
        }),
};

const C18: ConformanceCase = {
    Id: 'C18',
    Title: 'discards a pending delivery',
    Gate: (harness) => (harness.Capabilities.CancelPending ? null : 'Transport cannot cancel pending deliveries'),
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            await s.Consumer('a').Release(delivery);
            AssertEqual(await s.Operator.Discard(s.Subscription('a'), delivery.DeliveryID, 'cancelled', null), { Supported: true, Changed: true }, 'discard');
            AssertLength(await s.Receive('a'), 0, 'receive after discard');
        }),
};

const whenDetectsDuplicates = (harness: ConformanceHarness): string | null =>
    harness.Capabilities.DetectsMessageIDDuplicates ? null : 'Transport does not detect MessageID duplicates';

const C19: ConformanceCase = {
    Id: 'C19',
    Title: 'reports a republished MessageID as Duplicate',
    Gate: whenDetectsDuplicates,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            const messageID = crypto.randomUUID();
            await s.Publish([{ MessageID: messageID, Attributes: { n: '1', kind: 'x' }, Payload: { a: 1, b: 2 } }]);
            // Same envelope with its keys in another order: the comparison is canonical (spec 03 §2.1).
            const [again] = await s.Publish([{ MessageID: messageID, Attributes: { kind: 'x', n: '1' }, Payload: { b: 2, a: 1 } }]);
            AssertEqual(again.Status, 'Duplicate', 'republish status');
            AssertLength(await s.Receive('a'), 1, 'deliveries');
        }),
};

const C20: ConformanceCase = {
    Id: 'C20',
    Title: 'rejects a reused MessageID with a different envelope',
    Gate: whenDetectsDuplicates,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            const messageID = crypto.randomUUID();
            await s.Publish([{ MessageID: messageID, Attributes: { n: '1' } }]);
            const [conflict] = await s.Publish([{ MessageID: messageID, Attributes: { n: '2' } }]);
            AssertEqual(conflict.Status, 'Rejected', 'conflict status');
            AssertEqual(conflict.Error?.Code, 'MessageIDConflict', 'conflict code');
            AssertEqual(Numbers(await s.Receive('a')), ['1'], 'only the first publish is delivered');
        }),
};

const C21: ConformanceCase = {
    Id: 'C21',
    Title: 'redelivers a released delivery',
    Gate: always,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            AssertMatch(await s.Consumer('a').Release(delivery), { Kind: 'Settled' }, 'release');
            const [again] = await s.Receive('a');
            AssertEqual(again?.Attempt, harness.Traits.ReleaseConsumesAttempt ? 2 : 1, 'attempt');
        }),
};

const C22: ConformanceCase = {
    Id: 'C22',
    Title: 'dead-letters a lease that expires on the final attempt',
    Gate: (harness) => (harness.Traits.ExpiredLeaseDeadLetters ? null : 'Transport does not dead-letter expired leases itself'),
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { MaxAttempts: 1, LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            await s.Receive('a');
            await harness.AdvanceTime(6000);
            AssertLength(await s.Receive('a'), 0, 'receive after final lease expiry');
            const page = await s.Operator.ListDeadLetters(s.Subscription('a'), null, 100);
            AssertEqual((page?.Items ?? []).map((item) => item.Reason), ['LeaseExpired'], 'dead-letter reasons');
        }),
};

const C23: ConformanceCase = {
    Id: 'C23',
    Title: 'counts completions in the last hour',
    Gate: (harness) => (harness.Capabilities.CompletedCounts ? null : 'Transport does not count completions'),
    Run: (harness) =>
        WithScenario(harness, {}, [['a', {}]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }, { Attributes: { n: '2' } }]);
            const [delivery] = await s.Receive('a', 1);
            await s.Consumer('a').Complete(delivery);
            AssertMatch(await s.Operator.GetStats(s.Subscription('a')), { Pending: 1, InFlight: 0, CompletedLastHour: 1 }, 'stats');
        }),
};

const whenCancelInFlight = (harness: ConformanceHarness): string | null =>
    harness.Capabilities.CancelInFlight ? null : 'Transport cannot cancel in-flight deliveries';

const C24: ConformanceCase = {
    Id: 'C24',
    Title: 'cancelling in flight reports Cancelled, fences every settle, and acknowledges as Discarded',
    Gate: whenCancelInFlight,
    Run: (harness) =>
        WithScenario(harness, {}, [['a', { LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([{ Attributes: { n: '1' } }]);
            const [delivery] = await s.Receive('a');
            AssertEqual(
                await s.Operator.Discard(s.Subscription('a'), delivery.DeliveryID, 'operator cancelled', null),
                { Supported: true, Changed: true, CancelRequested: true },
                'cancel in flight',
            );
            // The token is not rotated: the holder is told why, and only AcknowledgeCancel still succeeds.
            AssertEqual(await s.Consumer('a').ExtendLease(delivery, 5), 'Cancelled', 'heartbeat after cancel');
            AssertMatch(await s.Consumer('a').Complete(delivery), { Kind: 'LeaseLost' }, 'complete after cancel');
            AssertMatch(await s.Consumer('a').Retry(delivery, 1, 'x'), { Kind: 'LeaseLost' }, 'retry after cancel');
            AssertMatch(await s.Consumer('a').AcknowledgeCancel(delivery), { Kind: 'Settled', Status: 'Discarded' }, 'acknowledge');
            AssertMatch(await s.Consumer('a').AcknowledgeCancel(delivery), { Kind: 'LeaseLost' }, 'second acknowledge');
            await harness.AdvanceTime(6000);
            AssertLength(await s.Receive('a'), 0, 'cancelled work is not redelivered');
            AssertMatch(await s.Operator.GetStats(s.Subscription('a')), { Pending: 0, InFlight: 0, DeadLettered: 0 }, 'stats after cancel');
        }),
};

const C25: ConformanceCase = {
    Id: 'C25',
    Title: 'a cancelled key frees as soon as the holder acknowledges, not at lease expiry',
    Gate: whenCancelInFlight,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive', LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Operator.Discard(s.Subscription('a'), head.DeliveryID, 'operator cancelled', null);
            // Still in flight: the next item must not start while the old handler is winding down.
            AssertLength(await s.Receive('a'), 0, 'key busy until the holder acknowledges');
            AssertMatch(await s.Consumer('a').AcknowledgeCancel(head), { Kind: 'Settled', Status: 'Discarded' }, 'acknowledge');
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next item right after the acknowledgement');
        }),
};

const C26: ConformanceCase = {
    Id: 'C26',
    Title: 'a cancelled delivery whose holder is dead is discarded when its lease expires',
    Gate: whenCancelInFlight,
    Run: (harness) =>
        WithScenario(harness, PARTITIONED_TOPIC, [['a', { PartitionMode: 'Exclusive', LeaseSeconds: 5 }]], async (s) => {
            await s.Publish([Keyed('1'), Keyed('2')]);
            const [head] = await s.Receive('a');
            await s.Operator.Discard(s.Subscription('a'), head.DeliveryID, 'operator cancelled', null);
            await harness.AdvanceTime(6000);
            // No acknowledgement ever arrives; ExpireLeases discards the row instead of retrying it.
            AssertEqual(Numbers(await s.Receive('a')), ['2'], 'next item after the cancelled lease expired');
            AssertMatch(await s.Operator.GetStats(s.Subscription('a')), { Pending: 0, DeadLettered: 0 }, 'cancelled work was not retried');
        }),
};

/** The transport conformance cases (spec 02 §6), in execution order. */
export const CONFORMANCE_CASES: readonly ConformanceCase[] = [
    C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, C11, C12, C13,
    C14, C15, C16, C17, C18, C19, C20, C21, C22, C23, C24, C25, C26,
];
