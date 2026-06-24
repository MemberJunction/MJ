/**
 * @fileoverview Pure (Angular-free) model + serialization for the field-rules builder: the flattened
 * {@link RuleDraft} the UI edits, and the lossless mapping to/from the engine's {@link FieldRuleSet}.
 * Kept separate from the component so it's unit-testable without a TestBed and reusable elsewhere.
 * @module @memberjunction/ng-entity-action-ux
 */
import type { FieldRule, FieldRuleSet, FieldRuleValueSource } from '@memberjunction/global';

/** The source kinds the visual builder edits directly (entityDocument is authored as JSON for now). */
export type BuilderSourceKind = 'static' | 'field' | 'formula' | 'lookup' | 'prompt';

/** The editable, flattened form of one rule (one screen row). */
export interface RuleDraft {
    TargetField: string;
    SourceKind: BuilderSourceKind;
    StaticValue: string;
    SourceField: string;
    Formula: string;
    LookupEntity: string;
    LookupMatchField: string;
    LookupMatchValueField: string;
    LookupReturnField: string;
    PromptID: string | null;
    Condition: string;
}

/** A fresh, empty draft (static source, no target). */
export function blankRuleDraft(): RuleDraft {
    return {
        TargetField: '', SourceKind: 'static', StaticValue: '', SourceField: '', Formula: '',
        LookupEntity: '', LookupMatchField: '', LookupMatchValueField: '', LookupReturnField: '',
        PromptID: null, Condition: '',
    };
}

/** Maps a draft to the engine's discriminated {@link FieldRuleValueSource}. */
export function draftToSource(d: RuleDraft): FieldRuleValueSource {
    switch (d.SourceKind) {
        case 'field':
            return { Kind: 'field', Field: d.SourceField };
        case 'formula':
            return { Kind: 'formula', Expression: d.Formula };
        case 'lookup':
            return {
                Kind: 'lookup',
                Lookup: {
                    Entity: d.LookupEntity,
                    MatchField: d.LookupMatchField,
                    MatchValue: { Kind: 'field', Field: d.LookupMatchValueField },
                    ReturnField: d.LookupReturnField,
                },
            };
        case 'prompt':
            return { Kind: 'prompt', Prompt: { PromptID: d.PromptID ?? '' } };
        case 'static':
        default:
            return { Kind: 'static', Value: d.StaticValue };
    }
}

/** Builds a {@link FieldRuleSet} from drafts, dropping any with no target field. */
export function draftsToRuleSet(drafts: RuleDraft[]): FieldRuleSet {
    return {
        Rules: drafts
            .filter((d) => d.TargetField)
            .map((d): FieldRule => ({
                TargetField: d.TargetField,
                Source: draftToSource(d),
                ...(d.Condition ? { Condition: d.Condition } : {}),
            })),
    };
}

/** Inflates an engine rule back into an editable draft (inverse of {@link draftToSource}). */
export function ruleToDraft(rule: FieldRule): RuleDraft {
    const d = blankRuleDraft();
    d.TargetField = rule.TargetField;
    d.Condition = rule.Condition ?? '';
    const s = rule.Source;
    // entityDocument has no first-class builder UI yet — surface it as a (read-only-ish) static slot.
    d.SourceKind = s.Kind === 'entityDocument' ? 'static' : s.Kind;
    switch (s.Kind) {
        case 'static':
            d.StaticValue = s.Value == null ? '' : String(s.Value);
            break;
        case 'field':
            d.SourceField = s.Field;
            break;
        case 'formula':
            d.Formula = s.Expression;
            break;
        case 'lookup':
            d.LookupEntity = s.Lookup.Entity;
            d.LookupMatchField = s.Lookup.MatchField;
            d.LookupReturnField = s.Lookup.ReturnField;
            if (s.Lookup.MatchValue.Kind === 'field') d.LookupMatchValueField = s.Lookup.MatchValue.Field;
            break;
        case 'prompt':
            d.PromptID = s.Prompt.PromptID;
            break;
    }
    return d;
}
