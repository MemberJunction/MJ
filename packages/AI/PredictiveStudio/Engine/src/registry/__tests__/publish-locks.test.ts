/** `PublishLocks` (Task M3.2, D4-91): a lock wait that runs out reports its attempts and the provider's last message. */
import { describe, expect, it } from 'vitest';

import { FakeClock, GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { PUBLISH_LOCK_QUERIES, PublishLocks } from '../publish-locks';

describe('PublishLocks', () => {
  it('reports the attempts and the last error of a wait that ran out', async () => {
    const store = new GateTestStore();
    store.LockFailures = 1_000;
    const attempt = await PublishLocks.Acquire(PUBLISH_LOCK_QUERIES.LockPipeline, { PipelineID: 'P' }, { ContextUser: GateWorld.User, Provider: store.Provider() }, new FakeClock());
    expect(attempt).toMatchObject({ Acquired: false, Attempts: 12 });
    expect(attempt.Acquired === false && attempt.LastError).toContain('Lock request time out period exceeded');
  });
});
