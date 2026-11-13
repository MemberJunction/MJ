/**
 * `StoredRowReads` (Task M3.6): every registry read of a stored row goes past the RunView cache, whatever the caller's
 * parameters say.
 */
import { describe, expect, it } from 'vitest';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { StoredRowReads } from '../stored-row-reads';

describe('StoredRowReads.Run', () => {
  it('sets BypassCache on every read, even when the caller asked for the cache', async () => {
    const store = new GateTestStore();
    store.Insert('MJ: ML Models', { ID: 'M1', PipelineID: GateWorld.PipelineID, Version: 1 });
    const ctx = { ContextUser: GateWorld.User, Provider: store.Provider() };
    const plain = await StoredRowReads.Run<{ ID: string }>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='M1'`, Fields: ['ID'], ResultType: 'simple' }, ctx);
    const asked = await StoredRowReads.Run<{ ID: string }>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='M1'`, Fields: ['ID'], ResultType: 'simple', BypassCache: false }, ctx);
    expect([plain.Success, plain.Results.map((r) => r.ID), asked.Results.map((r) => r.ID)]).toEqual([true, ['M1'], ['M1']]);
    expect(store.ViewReads).toEqual([{ EntityName: 'MJ: ML Models', BypassCache: true }, { EntityName: 'MJ: ML Models', BypassCache: true }]);
  });
});
