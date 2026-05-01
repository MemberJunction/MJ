/**
 * Tests for the Tag Pipeline Configuration extras on the custom ContentSource form.
 *
 * The form's typed accessors (Mode / Threshold / Budget) round-trip through the
 * `ConfigurationObject` typed JSON accessor on the entity. We mock the entity
 * with a stand-in object that records its current Configuration so each setter
 * can be observed end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
    Component: () => (target: Function) => target,
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (t: unknown) => t,
}));

vi.mock('@memberjunction/ng-base-forms', () => ({
    BaseFormComponent: class {
        public EditMode = true;
        public formContext = {};
    },
}));

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('../../generated/Entities/MJContentSource/mjcontentsource.form.component', () => ({
    MJContentSourceFormComponent: class {
        public EditMode = true;
        public formContext = {};
    },
}));

import { MJContentSourceFormComponentExtended } from '../custom/ContentSources/content-source-form.component';

interface TestableConfig {
    TagTaxonomyMode?: string;
    TagRootID?: string | null;
    TagMatchThreshold?: number;
    SuggestThreshold?: number;
    ShareTaxonomyWithLLM?: boolean;
    EnableVectorization?: boolean;
    MaxNewTagsPerRun?: number;
    MaxNewTagsPerItem?: number;
    MaxTokensPerRun?: number;
    MaxCostPerRun?: number;
    SourceSpecificConfiguration?: Record<string, unknown>;
}

function makeForm(initial?: TestableConfig): MJContentSourceFormComponentExtended {
    const form = new MJContentSourceFormComponentExtended();
    let cfg: TestableConfig = { ...(initial ?? {}) };
    let contentSourceType = '';
    (form as unknown as { record: unknown }).record = {
        get ConfigurationObject() { return cfg; },
        set ConfigurationObject(value: TestableConfig) { cfg = value; },
        get ContentSourceType() { return contentSourceType; },
        set ContentSourceType(v: string) { contentSourceType = v; },
        EmbeddingModelID: 'embed-model-1',
    };
    return form;
}

describe('MJContentSourceFormComponentExtended', () => {

    describe('IsEntitySourceType', () => {
        it('returns false when no record is loaded', () => {
            const f = new MJContentSourceFormComponentExtended();
            (f as unknown as { record: unknown }).record = null;
            expect(f.IsEntitySourceType).toBe(false);
        });
        it('returns true when ContentSourceType is "Entity" (case-insensitive)', () => {
            const f = makeForm();
            (f.record as unknown as { ContentSourceType: string }).ContentSourceType = 'entity';
            expect(f.IsEntitySourceType).toBe(true);
            (f.record as unknown as { ContentSourceType: string }).ContentSourceType = 'Entity';
            expect(f.IsEntitySourceType).toBe(true);
        });
        it('returns false for non-entity sources', () => {
            const f = makeForm();
            (f.record as unknown as { ContentSourceType: string }).ContentSourceType = 'HubSpot';
            expect(f.IsEntitySourceType).toBe(false);
        });
    });

    describe('Taxonomy mode', () => {
        it('defaults to auto-grow when nothing in config', () => {
            const f = makeForm();
            expect(f.CurrentMode).toBe('auto-grow');
        });
        it('reads the mode set in config', () => {
            const f = makeForm({ TagTaxonomyMode: 'constrained' });
            expect(f.CurrentMode).toBe('constrained');
        });
        it('SetMode persists through ConfigurationObject', () => {
            const f = makeForm();
            f.SetMode('free-flow');
            expect(f.CurrentMode).toBe('free-flow');
        });
    });

    describe('Thresholds', () => {
        it('defaults MatchThreshold to 0.85', () => {
            const f = makeForm();
            expect(f.MatchThresholdValue).toBe(0.85);
        });
        it('clamps MatchThreshold setter to [0, 1]', () => {
            const f = makeForm();
            f.MatchThresholdValue = 1.5;
            expect(f.MatchThresholdValue).toBe(1);
            f.MatchThresholdValue = -0.5;
            expect(f.MatchThresholdValue).toBe(0);
        });
        it('pulls SuggestThreshold below MatchThreshold when MatchThreshold drops', () => {
            const f = makeForm({ TagMatchThreshold: 0.85, SuggestThreshold: 0.80 });
            f.MatchThresholdValue = 0.70;
            // SuggestThreshold should drop to <= 0.70 (auto-pinned 0.05 below)
            expect(f.SuggestThresholdValue).toBeLessThanOrEqual(0.70);
        });
        it('clamps SuggestThreshold to <= MatchThreshold', () => {
            const f = makeForm({ TagMatchThreshold: 0.80 });
            f.SuggestThresholdValue = 0.95;
            expect(f.SuggestThresholdValue).toBeLessThanOrEqual(0.80);
        });
        it('flags validation message when SuggestThreshold >= MatchThreshold', () => {
            const f = makeForm();
            // Force an invalid pair via the JSON object directly to bypass setter clamping
            f.setConfig({ TagMatchThreshold: 0.80, SuggestThreshold: 0.90 });
            expect(f.ThresholdValidationMessage).toMatch(/lower than/);
        });
        it('returns null validation message when SuggestThreshold < MatchThreshold', () => {
            const f = makeForm();
            f.setConfig({ TagMatchThreshold: 0.85, SuggestThreshold: 0.70 });
            expect(f.ThresholdValidationMessage).toBeNull();
        });
    });

    describe('Boolean toggles', () => {
        it('ShareTaxonomyWithLLM defaults to true', () => {
            const f = makeForm();
            expect(f.ShareTaxonomyValue).toBe(true);
        });
        it('ShareTaxonomyWithLLM is honored when explicitly false', () => {
            const f = makeForm({ ShareTaxonomyWithLLM: false });
            expect(f.ShareTaxonomyValue).toBe(false);
        });
        it('EnableVectorization defaults to true', () => {
            const f = makeForm();
            expect(f.EnableVectorizationValue).toBe(true);
        });
    });

    describe('Budget setters', () => {
        it('return null when unset', () => {
            const f = makeForm();
            expect(f.MaxNewTagsPerRunValue).toBeNull();
            expect(f.MaxCostPerRunValue).toBeNull();
        });
        it('persist numeric values through Configuration', () => {
            const f = makeForm();
            f.MaxNewTagsPerRunValue = 50;
            f.MaxCostPerRunValue = 12.5;
            expect(f.MaxNewTagsPerRunValue).toBe(50);
            expect(f.MaxCostPerRunValue).toBe(12.5);
        });
        it('strip the field when blank string is supplied (ngModel quirk)', () => {
            const f = makeForm({ MaxNewTagsPerRun: 50 });
            f.MaxNewTagsPerRunValue = '' as never;
            expect(f.MaxNewTagsPerRunValue).toBeNull();
        });
        it('strip the field when null is supplied', () => {
            const f = makeForm({ MaxTokensPerRun: 1000 });
            f.MaxTokensPerRunValue = null;
            expect(f.MaxTokensPerRunValue).toBeNull();
        });
        it('coerce string numbers from form inputs', () => {
            const f = makeForm();
            f.MaxNewTagsPerItemValue = '7' as never;
            expect(f.MaxNewTagsPerItemValue).toBe(7);
        });
        it('reject NaN gracefully', () => {
            const f = makeForm();
            f.MaxNewTagsPerRunValue = 'abc' as never;
            expect(f.MaxNewTagsPerRunValue).toBeNull();
        });
    });

    describe('Tag root + Configuration round-trip', () => {
        it('writes TagRootID through the typed accessor', () => {
            const f = makeForm();
            f.TagRootIDValue = 'root-123';
            expect(f.TagRootIDValue).toBe('root-123');
            expect(f.Config.TagRootID).toBe('root-123');
        });
        it('preserves SourceSpecificConfiguration when other knobs change', () => {
            const f = makeForm({
                TagTaxonomyMode: 'auto-grow',
                SourceSpecificConfiguration: { workspaceId: 'abc' }
            });
            f.SetMode('free-flow');
            expect(f.Config.SourceSpecificConfiguration).toEqual({ workspaceId: 'abc' });
            expect(f.Config.TagTaxonomyMode).toBe('free-flow');
        });
    });
});
