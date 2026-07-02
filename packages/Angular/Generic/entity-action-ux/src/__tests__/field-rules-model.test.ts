/**
 * Unit tests for the pure field-rules builder model + serialization. No Angular / TestBed — these are the
 * stateless functions the builder component delegates to, so they carry the correctness-critical logic.
 */
import { describe, it, expect } from 'vitest';
import type { FieldRule, FieldRuleSet } from '@memberjunction/global';
import { blankRuleDraft, draftToSource, draftsToRuleSet, ruleToDraft, type RuleDraft } from '../lib/field-rules-model';

const draft = (over: Partial<RuleDraft>): RuleDraft => ({ ...blankRuleDraft(), ...over });

describe('draftToSource', () => {
    it('maps a static source', () => {
        expect(draftToSource(draft({ SourceKind: 'static', StaticValue: 'Inactive' }))).toEqual({ Kind: 'static', Value: 'Inactive' });
    });
    it('maps a field source', () => {
        expect(draftToSource(draft({ SourceKind: 'field', SourceField: 'FirstName' }))).toEqual({ Kind: 'field', Field: 'FirstName' });
    });
    it('maps a formula source', () => {
        expect(draftToSource(draft({ SourceKind: 'formula', Formula: "a + b" }))).toEqual({ Kind: 'formula', Expression: 'a + b' });
    });
    it('maps a lookup source (match value is a field ref)', () => {
        const s = draftToSource(draft({ SourceKind: 'lookup', LookupEntity: 'Accounts', LookupMatchField: 'Code', LookupMatchValueField: 'AccountCode', LookupReturnField: 'Name' }));
        expect(s).toEqual({ Kind: 'lookup', Lookup: { Entity: 'Accounts', MatchField: 'Code', MatchValue: { Kind: 'field', Field: 'AccountCode' }, ReturnField: 'Name' } });
    });
    it('maps a prompt source (empty id → empty string, never null)', () => {
        expect(draftToSource(draft({ SourceKind: 'prompt', PromptID: 'P1' }))).toEqual({ Kind: 'prompt', Prompt: { PromptID: 'P1' } });
        expect(draftToSource(draft({ SourceKind: 'prompt', PromptID: null }))).toEqual({ Kind: 'prompt', Prompt: { PromptID: '' } });
    });
});

describe('draftsToRuleSet', () => {
    it('drops drafts with no target field', () => {
        const set = draftsToRuleSet([draft({ TargetField: '', StaticValue: 'x' }), draft({ TargetField: 'Status', StaticValue: 'Inactive' })]);
        expect(set.Rules).toHaveLength(1);
        expect(set.Rules[0].TargetField).toBe('Status');
    });
    it('includes Condition only when present', () => {
        const set = draftsToRuleSet([
            draft({ TargetField: 'A', StaticValue: '1' }),
            draft({ TargetField: 'B', StaticValue: '2', Condition: "fields.X === 'y'" }),
        ]);
        expect('Condition' in set.Rules[0]).toBe(false);
        expect(set.Rules[1].Condition).toBe("fields.X === 'y'");
    });
});

describe('ruleToDraft (inverse of draftToSource)', () => {
    const roundTrip = (rule: FieldRule): FieldRule => draftsToRuleSet([ruleToDraft(rule)]).Rules[0];

    it('round-trips a static rule', () => {
        const rule: FieldRule = { TargetField: 'Status', Source: { Kind: 'static', Value: 'Inactive' } };
        expect(roundTrip(rule)).toEqual(rule);
    });
    it('round-trips a field rule with a condition', () => {
        const rule: FieldRule = { TargetField: 'FullName', Source: { Kind: 'field', Field: 'Name' }, Condition: 'fields.Active' };
        expect(roundTrip(rule)).toEqual(rule);
    });
    it('round-trips a lookup rule', () => {
        const rule: FieldRule = { TargetField: 'AccountName', Source: { Kind: 'lookup', Lookup: { Entity: 'Accounts', MatchField: 'Code', MatchValue: { Kind: 'field', Field: 'AccountCode' }, ReturnField: 'Name' } } };
        expect(roundTrip(rule)).toEqual(rule);
    });
    it('round-trips a prompt rule', () => {
        const rule: FieldRule = { TargetField: 'Summary', Source: { Kind: 'prompt', Prompt: { PromptID: 'PROMPT-1' } } };
        expect(roundTrip(rule)).toEqual(rule);
    });
    it('coerces a non-string static value to its string form in the draft', () => {
        const d = ruleToDraft({ TargetField: 'Count', Source: { Kind: 'static', Value: 42 } });
        expect(d.StaticValue).toBe('42');
    });
    it('surfaces an entityDocument source as a static slot (no builder UI yet)', () => {
        const d = ruleToDraft({ TargetField: 'Doc', Source: { Kind: 'entityDocument', EntityDocument: { EntityDocumentID: 'D1' } } });
        expect(d.SourceKind).toBe('static');
    });
});

describe('blankRuleDraft', () => {
    it('is a static, target-less draft', () => {
        const d = blankRuleDraft();
        expect(d.SourceKind).toBe('static');
        expect(d.TargetField).toBe('');
        expect(d.PromptID).toBeNull();
    });
    it('produces an empty rule set (filtered out — no target)', () => {
        const set: FieldRuleSet = draftsToRuleSet([blankRuleDraft()]);
        expect(set.Rules).toHaveLength(0);
    });
});
