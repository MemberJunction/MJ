/**
 * The status-write rules over persisted statuses (§6.2a, D4-02): one case per row of §5.1's lifecycle table, one per
 * refusal reason and one per allow reason of the PreSave guard.
 */
import { describe, it, expect } from 'vitest';
import { StatusWriteRules, type PersistedModelStatus } from '../registry-contracts';

const ALL: readonly PersistedModelStatus[] = ['Draft', 'Validated', 'Published', 'Archived', 'KeepBaseline', 'Unevaluated'];

/**
 * §5.1's lifecycle table as data (plan `PR-4-honest-serving.md` §5.1, "Status values and the extended state machine"),
 * one entry per row in the table's order: the row's From statuses and its To status. The `ALLOWED_TRANSITIONS`
 * conformance case requires `StatusWriteRules` to authorise exactly these pairs.
 */
const ALLOWED_TRANSITIONS: readonly { readonly From: readonly PersistedModelStatus[]; readonly To: PersistedModelStatus }[] = [
  { From: ['Draft'], To: 'Validated' },
  { From: ['Draft'], To: 'KeepBaseline' },
  { From: ['Validated'], To: 'Published' },
  { From: ['KeepBaseline'], To: 'Published' },
  { From: ['Validated', 'KeepBaseline', 'Unevaluated'], To: 'Archived' },
  { From: ['Published'], To: 'Unevaluated' },
  { From: ['Published'], To: 'Archived' },
  { From: ['Archived'], To: 'Published' },
];

function gateWrite(from: PersistedModelStatus, to: PersistedModelStatus): ReturnType<typeof StatusWriteRules.DecideStatusWrite> {
  return StatusWriteRules.DecideStatusWrite(to, { Kind: 'row', Status: from, ServingWhileUnevaluated: false }, { From: from, To: to }, false, false);
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
  it('ALLOWED_TRANSITIONS conformance: §5.1\'s lifecycle table, row by row, is exactly the set StatusWriteRules authorises', () => {
    const table = ALLOWED_TRANSITIONS.flatMap((row) => row.From.map((from) => `${from}→${row.To}`)).sort();
    const authorised = ALL.flatMap((from) => ALL.filter((to) => StatusWriteRules.IsAuthorisedTransition(from, to)).map((to) => `${from}→${to}`)).sort();
    expect(new Set(table).size).toBe(table.length);
    expect(authorised).toEqual(table);
  });
  it('Unevaluated can never reach Published, and Draft can never be published directly', () => {
    expect(StatusWriteRules.IsAuthorisedTransition('Unevaluated', 'Published')).toBe(false);
    expect(StatusWriteRules.IsAuthorisedTransition('Draft', 'Published')).toBe(false);
  });
});

describe('StatusWriteRules.DecideStatusWrite — allow reasons', () => {
  it('create-as-draft', () => {
    expect(StatusWriteRules.DecideStatusWrite('Draft', { Kind: 'create' }, null, false, false)).toEqual({ Allow: true, Reason: 'create-as-draft' });
  });
  it('status-unchanged (KeepBaseline saved with another column changed)', () => {
    expect(StatusWriteRules.DecideStatusWrite('KeepBaseline', { Kind: 'row', Status: 'KeepBaseline', ServingWhileUnevaluated: false }, null, false, false)).toEqual({ Allow: true, Reason: 'status-unchanged' });
  });
  it('DecideStatusWrite: gate-authorised transition into KeepBaseline allowed', () => {
    expect(StatusWriteRules.DecideStatusWrite('KeepBaseline', { Kind: 'row', Status: 'Draft', ServingWhileUnevaluated: false }, { From: 'Draft', To: 'KeepBaseline' }, false, false))
      .toEqual({ Allow: true, Reason: 'gate-authorised' });
  });
});

describe('StatusWriteRules.DecideStatusWrite — refusal reasons', () => {
  it('create-not-draft: a create as KeepBaseline', () => {
    expect(StatusWriteRules.DecideStatusWrite('KeepBaseline', { Kind: 'create' }, null, false, false)).toEqual({ Allow: false, Reason: 'create-not-draft' });
  });
  it('stored-row-unreadable: fails closed even with a gate authorisation', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'unreadable' }, { From: 'Validated', To: 'Published' }, false, false))
      .toEqual({ Allow: false, Reason: 'stored-row-unreadable' });
  });
  it('deferred-in-transaction-group: a non-gate save inside a TransactionGroup', () => {
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', { Kind: 'row', Status: 'Unevaluated', ServingWhileUnevaluated: false }, null, true, false))
      .toEqual({ Allow: false, Reason: 'deferred-in-transaction-group' });
  });
  it('status-changed-outside-gate: KeepBaseline written to Published with no authorisation', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'row', Status: 'KeepBaseline', ServingWhileUnevaluated: false }, null, false, false))
      .toEqual({ Allow: false, Reason: 'status-changed-outside-gate' });
  });
  it('gate-transition-mismatch: the authorisation names another target than the incoming status', () => {
    expect(StatusWriteRules.DecideStatusWrite('Archived', { Kind: 'row', Status: 'Validated', ServingWhileUnevaluated: false }, { From: 'Validated', To: 'Published' }, false, false))
      .toEqual({ Allow: false, Reason: 'gate-transition-mismatch' });
  });
  it('DecideStatusWrite: an authorisation outside the lifecycle table is refused (Unevaluated → Published)', () => {
    expect(StatusWriteRules.DecideStatusWrite('Published', { Kind: 'row', Status: 'Unevaluated', ServingWhileUnevaluated: false }, { From: 'Unevaluated', To: 'Published' }, false, false))
      .toEqual({ Allow: false, Reason: 'gate-transition-mismatch' });
  });
});

describe('StatusWriteRules.DecideStatusWrite — serving-flag-set-outside-migration (D4-61)', () => {
  it('refuses a persisted ServingWhileUnevaluated 0 → 1, with or without a gate authorisation', () => {
    const demoted = { Kind: 'row', Status: 'Unevaluated', ServingWhileUnevaluated: false } as const;
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', demoted, null, false, true)).toEqual({ Allow: false, Reason: 'serving-flag-set-outside-migration' });
    expect(StatusWriteRules.DecideStatusWrite('Archived', demoted, { From: 'Unevaluated', To: 'Archived' }, false, true))
      .toEqual({ Allow: false, Reason: 'serving-flag-set-outside-migration' });
  });
  it('refuses a create with the flag set, even as Draft', () => {
    expect(StatusWriteRules.DecideStatusWrite('Draft', { Kind: 'create' }, null, false, true)).toEqual({ Allow: false, Reason: 'serving-flag-set-outside-migration' });
  });
  it('allows a flag that stays set', () => {
    const serving = { Kind: 'row', Status: 'Unevaluated', ServingWhileUnevaluated: true } as const;
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', serving, null, false, true)).toEqual({ Allow: true, Reason: 'status-unchanged' });
  });
  it('refuses clearing the flag (1 → 0) outside an authorised transition: with no authorisation, or one that does not carry the change', () => {
    const serving = { Kind: 'row', Status: 'Unevaluated', ServingWhileUnevaluated: true } as const;
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', serving, null, false, false)).toEqual({ Allow: false, Reason: 'serving-flag-set-outside-migration' });
    expect(StatusWriteRules.DecideStatusWrite('Archived', serving, { From: 'Unevaluated', To: 'Archived' }, false, false))
      .toEqual({ Allow: false, Reason: 'serving-flag-set-outside-migration' });
  });
  it('allows clearing the flag (1 → 0) only inside an authorised lifecycle transition whose authorisation carries it', () => {
    const serving = { Kind: 'row', Status: 'Unevaluated', ServingWhileUnevaluated: true } as const;
    expect(StatusWriteRules.DecideStatusWrite('Archived', serving, { From: 'Unevaluated', To: 'Archived', ServingWhileUnevaluated: false }, false, false))
      .toEqual({ Allow: true, Reason: 'gate-authorised' });
    const servingPublished = { Kind: 'row', Status: 'Published', ServingWhileUnevaluated: true } as const;
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', servingPublished, { From: 'Published', To: 'Unevaluated', ServingWhileUnevaluated: false }, false, false))
      .toEqual({ Allow: true, Reason: 'gate-authorised' });
    // An authorisation that carries the change but names no lifecycle transition (status unchanged) is not one.
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', serving, { From: 'Unevaluated', To: 'Unevaluated', ServingWhileUnevaluated: false }, false, false))
      .toEqual({ Allow: false, Reason: 'serving-flag-set-outside-migration' });
  });
  it('setting the flag (0 → 1) is refused even with an authorised transition', () => {
    const demoted = { Kind: 'row', Status: 'Published', ServingWhileUnevaluated: false } as const;
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', demoted, { From: 'Published', To: 'Unevaluated' }, false, true))
      .toEqual({ Allow: false, Reason: 'serving-flag-set-outside-migration' });
  });
  it('an unreadable row with the flag set is stored-row-unreadable (fail closed)', () => {
    expect(StatusWriteRules.DecideStatusWrite('Unevaluated', { Kind: 'unreadable' }, null, false, true)).toEqual({ Allow: false, Reason: 'stored-row-unreadable' });
  });
});

describe('StatusWriteRules.StatusByState', () => {
  it('maps the four contract lifecycle states onto their persisted statuses', () => {
    expect(StatusWriteRules.StatusByState).toEqual({ draft: 'Draft', validated: 'Validated', published: 'Published', archived: 'Archived' });
  });
});
