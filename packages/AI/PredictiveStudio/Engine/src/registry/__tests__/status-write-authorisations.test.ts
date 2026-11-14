/** `StatusWriteAuthorisations` (Task M3.2): the gate's authorisation of one status save, taken once by the status guard. */
import { describe, expect, it } from 'vitest';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { Actor } from '@memberjunction/predictive-studio-core';

import { GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { StatusWriteAuthorisations } from '../status-write-authorisations';

async function NewModel(): Promise<MJMLModelEntity> {
  return new GateTestStore().Provider().GetEntityObject<MJMLModelEntity>('MJ: ML Models', GateWorld.User);
}

const human: Actor = { kind: 'human', userId: '6A1D2E3F-0000-4000-8000-0000000000B1' };
const job: Actor = { kind: 'scheduled-job', scheduledJobRunId: '6A1D2E3F-0000-4000-8000-0000000000B2' };

describe('StatusWriteAuthorisations', () => {
  it('authorised → taken once, with its initiator → absent', async () => {
    const model = await NewModel();
    StatusWriteAuthorisations.Instance.Authorise(model, { From: 'Validated', To: 'Published', Initiator: human });
    expect(StatusWriteAuthorisations.Instance.Take(model)).toEqual({ From: 'Validated', To: 'Published', Initiator: human });
    expect(StatusWriteAuthorisations.Instance.Take(model)).toBeNull();
  });
  it('a second Authorise replaces the first, initiator included', async () => {
    const model = await NewModel();
    StatusWriteAuthorisations.Instance.Authorise(model, { From: 'Published', To: 'Unevaluated', Initiator: human });
    StatusWriteAuthorisations.Instance.Authorise(model, { From: 'Published', To: 'Unevaluated', Initiator: job });
    expect(StatusWriteAuthorisations.Instance.Take(model)).toEqual({ From: 'Published', To: 'Unevaluated', Initiator: job });
  });
  it('is keyed by the instance: another entity of the same row is not authorised; Revoke drops it', async () => {
    const [a, b] = [await NewModel(), await NewModel()];
    StatusWriteAuthorisations.Instance.Authorise(a, { From: 'Draft', To: 'Validated', Initiator: human });
    expect(StatusWriteAuthorisations.Instance.Take(b)).toBeNull();
    StatusWriteAuthorisations.Instance.Revoke(a);
    expect(StatusWriteAuthorisations.Instance.Take(a)).toBeNull();
  });
  it('is one process-wide instance', () => {
    expect(StatusWriteAuthorisations.Instance).toBe(StatusWriteAuthorisations.Instance);
  });
});
