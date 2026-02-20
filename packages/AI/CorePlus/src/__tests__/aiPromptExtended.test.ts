import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {
        ContextCurrentUser: null;
        Fields: [];
        Get(fieldName: string) { return ''; }
        Set(fieldName: string, value: unknown) {}
        get Dirty() { return false; }
        async LoadFromData(data: unknown) { return true; }
        async InnerLoad(key: unknown) { return true; }
    },
    CompositeKey: class CompositeKey {},
    ValidationErrorInfo: class ValidationErrorInfo {
        constructor(public FieldName: string, public Message: string, public Value: unknown, public Type: string) {}
    },
    ValidationErrorType: { Failure: 'Failure' },
    ValidationResult: class ValidationResult { Errors: unknown[] = []; }
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    compareStringsByLine: () => ({})
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJAIPromptEntity: class MJAIPromptEntity {
        TemplateID: string = '';
        ResultSelectorPromptID: string | null = null;
        ID: string | null = null;
        Get(fieldName: string) { return ''; }
        Set(fieldName: string, value: unknown) {}
        get Dirty() { return false; }
        async LoadFromData(data: unknown) { return true; }
        async InnerLoad(key: unknown) { return true; }
        ValidateResultSelectorPromptIDNotEqualID(result: { Errors: unknown[] }) {
            if (this.ResultSelectorPromptID != null && this.ResultSelectorPromptID === this.ID) {
                result.Errors.push({ FieldName: 'ResultSelectorPromptID', Message: 'Cannot equal ID', Value: this.ResultSelectorPromptID, Type: 'Failure' });
            }
        }
    },
    MJTemplateParamEntity: class MJTemplateParamEntity {
        TemplateID: string = '';
        Name: string = '';
    }
}));

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
            TemplateContents: [],
            TemplateParams: []
        }
    }
}));

import { MJAIPromptEntityExtended } from '../MJAIPromptEntityExtended';

describe('MJAIPromptEntityExtended', () => {
    let prompt: MJAIPromptEntityExtended;

    beforeEach(() => {
        prompt = new MJAIPromptEntityExtended();
    });

    describe('TemplateText virtual property', () => {
        it('should default to empty string', () => {
            expect(prompt.TemplateText).toBe('');
        });

        it('should set and get template text', () => {
            prompt.TemplateText = 'Hello {{name}}';

            expect(prompt.TemplateText).toBe('Hello {{name}}');
        });
    });

    describe('TemplateTextDirty', () => {
        it('should be false when template text has not changed', () => {
            expect(prompt.TemplateTextDirty).toBe(false);
        });

        it('should be true when template text has changed', () => {
            prompt.TemplateText = 'New text';

            expect(prompt.TemplateTextDirty).toBe(true);
        });
    });

    describe('Set method', () => {
        it('should route TemplateText to virtual property', () => {
            prompt.Set('TemplateText', 'Routed value');

            expect(prompt.TemplateText).toBe('Routed value');
        });

        it('should handle case-insensitive TemplateText field name', () => {
            prompt.Set('templatetext', 'lowercase route');

            expect(prompt.TemplateText).toBe('lowercase route');
        });

        it('should handle TemplateText with spaces in field name', () => {
            prompt.Set(' TemplateText ', 'trimmed route');

            expect(prompt.TemplateText).toBe('trimmed route');
        });
    });

    describe('Dirty override', () => {
        it('should be dirty when TemplateText changes', () => {
            prompt.TemplateText = 'Changed';

            expect(prompt.Dirty).toBe(true);
        });

        it('should not be dirty initially', () => {
            expect(prompt.Dirty).toBe(false);
        });
    });

    describe('TemplateParams', () => {
        it('should return empty array when not loaded', () => {
            expect(prompt.TemplateParams).toEqual([]);
        });
    });

    describe('ValidateResultSelectorPromptIDNotEqualID', () => {
        it('should not add error when IDs are different', () => {
            prompt.ID = 'id-1';
            prompt.ResultSelectorPromptID = 'id-2';
            const result = { Errors: [] as unknown[] };

            prompt.ValidateResultSelectorPromptIDNotEqualID(result);

            expect(result.Errors).toHaveLength(0);
        });

        it('should add error when IDs are the same and not null', () => {
            prompt.ID = 'same-id';
            prompt.ResultSelectorPromptID = 'same-id';
            const result = { Errors: [] as unknown[] };

            prompt.ValidateResultSelectorPromptIDNotEqualID(result);

            expect(result.Errors).toHaveLength(1);
        });

        it('should not add error when both IDs are null (new record)', () => {
            prompt.ID = null;
            prompt.ResultSelectorPromptID = null;
            const result = { Errors: [] as unknown[] };

            prompt.ValidateResultSelectorPromptIDNotEqualID(result);

            expect(result.Errors).toHaveLength(0);
        });
    });
});
