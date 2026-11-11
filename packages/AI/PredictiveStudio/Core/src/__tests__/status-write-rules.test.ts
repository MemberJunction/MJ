/**
 * The status-write rules over persisted statuses (§6.2a, D4-02): one case per row of §5.1's lifecycle table, one per
 * refusal reason and one per allow reason of the PreSave guard.
 */
import { describe, it, expect } from 'vitest';
import { StatusWriteRules, type PersistedModelStatus } from '../registry-contracts';

const ALL: readonly PersistedModelStatus[] = ['Draft', 'Validated', 'Published', 'Archived', 'KeepBaseline', 'Unevaluated'];

function gateWrite(from: PersistedModelStatus, to: PersistedModelStatus): ReturnType<typeof StatusWriteRules.DecideStatusWrite> {
  return StatusWriteRules.DecideStatusWrite(to, { Kind: 'row', Status: from }, { From: from, To: to }, false);
}

describe('StatusWriteRules.IsAuthorisedTransition — the §5.1 lifecycle table', () => {
  it('row Draft → Validated: authorised, and the gate may write it', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('Draft', 'Validated')).toBe(true);
    expect(gateWrite('Draft', 'Validated')).toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
  it('row Draft → KeepBaseline: authorised, and the gate may write it', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('Draft', 'KeepBaseline')).toBe(true);
    expect(gateWrite('Draft', 'KeepBaseline')).toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
  it('row Validated → Published: authorised, and the gate may write it', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('Validated', 'Published')).toBe(true);
    expect(gateWrite('Validated', 'Published')).toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
  it('row KeepBaseline → Published: authorised, and the gate may write it', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('KeepBaseline', 'Published')).toBe(true);
    expect(gateWrite('KeepBaseline', 'Published')).toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
  it('row Validated, KeepBaseline, Unevaluated → Archived: each authorised, and the gate may write it', () => {
    for (const from of ['Validated', 'KeepBaseline', 'Unevaluated'] as const) {
      expect(StatusWriteRules.IsAuthorisedTransition(from, 'Archived')).toBe(true);
      expect(gateWrite(from, 'Archived')).toEqual({ Allow: true, Reason: 'gate-authorised' });
    }
  });
  it('row Published → Unevaluated: authorised, and the gate may write it', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('Published', 'Unevaluated')).toBe(true);
    expect(gateWrite('Published', 'Unevaluated')).toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
  it('row Published → Archived: authorised, and the gate may write it', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('Published', 'Archived')).toBe(true);
    expect(gateWrite('Published', 'Archived')).toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
  it('row Archived → Published (rollback): authorised, and the gate may write it', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('Archived', 'Published')).toBe(true);
    expect(gateWrite('Archived', 'Published')).toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
  it('authorises exactly the ten transitions of the table and no other pair', () => {
    const authorised = ALL.flatMap((from) => ALL.filter((to) => StatusWriteRules.IsAuthorisedTransition(from, to)).map((to) => `${from}→${to}`));
    expect(authorised.sort()).toEqual([
      'Archived→Published', 'Draft→KeepBaseline', 'Draft→Validated', 'KeepBaseline→Archived', 'KeepBaseline→Published',
      'Published→Archived', 'Published→Unevaluated', 'Unevaluated→Archived', 'Validated→Archived', 'Validated→Published',
    ]);
  });
  it('Unevaluated can never reach Published, and Draft can never be published directly', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('Unevaluated', 'Published')).toBe(false);
    expect(StatusWriteRules.IsAuthorisedTransition('Draft', 'Published')).toBe(false);
  });
});

describe('StatusWriteRules.DecideStatusWrite — allow reasons', () => {
  it('create-as-draft', () => {
    expect(StatusWriteRules.DecideStatusWrite('Draft', { Kind: 'create' }, null, false)).toEqual({ Allow: true, Reason: 'create-as-draft' });
  });
  it('status-unchanged (KeepBaseline saved with another column changed)', () => {
    expect(StatusWriteRules.DecideStatusWrite('KeepBaseline', { Kind: 'row', Status: 'KeepBaseline' }, null, false)).toEqual({ Allow: true, Reason: 'status-unchanged' });
  });
  it('DecideStatusWrite: gate-authorised transition into KeepBaseline allowed', () => {
    expect(StatusWriteRules.DecideStatusWrite('KeepBaseline', { Kind: 'row', Status: 'Draft' }, { From: 'Draft', To: 'KeepBaseline' }, false))
      .toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
});

describe('StatusWriteRules.DecideStatusWrite — refusal reasons', () => {
  it('create-not-draft: a create as KeepBaseline', () => {
    expect(StatusWriteRules.DecideStatusWrite('KeepBaseline', { Kind: 'create' }, null, false)).toEqual({ Allow: false, Reason: 'create-not-draft' });
  });
  it('stored-row-unreadable: fails closed even with a gate authorisation', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'unreadable' }, { From: 'Validated', To: 'Published' }, false))
      .toEqual({ Allow: false, Reason: 'stored-row-unreadable' });
  });
  it('deferred-in-transaction-group: a non-gate save inside a TransactionGroup', () => {
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', { Kind: 'row', Status: 'Unevaluated' }, null, true))
      .toEqual({ Allow: false, Reason: 'deferred-in-transaction-group' });
  });
  it('status-changed-outside-gate: KeepBaseline written to Published with no authorisation', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'row', Status: 'KeepBaseline' }, null, false))
      .toEqual({ Allow: false, Reason: 'status-changed-outside-gate' });
  });
  it('gate-transition-mismatch: the authorisation names another target than the incoming status', () => {
    expect(StatusWriteRules.DecideStatusWrite('Archived', { Kind: 'row', Status: 'Validated' }, { From: 'Validated', To: 'Published' }, false))
      .toEqual({ Allow: false, Reason: 'gate-transition-mismatch' });
  });
  it('DecideStatusWrite: an authorisation outside the lifecycle table is refused (Unevaluated → Published)', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'row', Status: 'Unevaluated' }, { From: 'Unevaluated', To: 'Published' }, false))
      .toEqual({ Allow: false, Reason: 'gate-transition-mismatch' });
  });
});

describe('StatusWriteRules.StatusByState', () => {
  it('maps the four contract lifecycle states onto their persisted statuses', () => {
    expect(StatusWriteRules.StatusByState).toEqual({ draft: 'Draft', validated: 'Validated', published: 'Published', archived: 'Archived' });
  });
});
