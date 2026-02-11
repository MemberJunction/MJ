import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the dependencies since we can't actually instantiate entity classes
// in unit tests without a full MJ infrastructure
vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {
        Get(fieldName: string) { return ''; }
        Set(fieldName: string, value: unknown) {}
        get Dirty() { return false; }
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
    AIModelEntity: class AIModelEntity {
        Name: string = '';
        APIName: string = '';
    },
    AIModelVendorEntity: class AIModelVendorEntity {},
    AIPromptEntity: class AIPromptEntity {
        TemplateID: string = '';
        ResultSelectorPromptID: string | null = null;
        ID: string | null = null;
        Get(fieldName: string) { return ''; }
        Set(fieldName: string, value: unknown) {}
        get Dirty() { return false; }
    },
    TemplateParamEntity: class TemplateParamEntity {
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

// Import after mocking
import { AIModelEntityExtended } from '../AIModelExtended';

describe('AIModelEntityExtended', () => {
    describe('APINameOrName', () => {
        it('should return APIName when it exists', () => {
            const model = new AIModelEntityExtended();
            model.APIName = 'gpt-4o';
            model.Name = 'GPT-4o';

            expect(model.APINameOrName).toBe('gpt-4o');
        });

        it('should return Name when APIName is empty', () => {
            const model = new AIModelEntityExtended();
            model.APIName = '';
            model.Name = 'GPT-4o';

            expect(model.APINameOrName).toBe('GPT-4o');
        });

        it('should return Name when APIName is null/undefined', () => {
            const model = new AIModelEntityExtended();
            (model as Record<string, unknown>).APIName = null;
            model.Name = 'My Model';

            expect(model.APINameOrName).toBe('My Model');
        });
    });

    describe('ModelVendors', () => {
        it('should start with empty array', () => {
            const model = new AIModelEntityExtended();

            expect(model.ModelVendors).toEqual([]);
        });

        it('should be a readonly getter', () => {
            const model = new AIModelEntityExtended();
            const vendors = model.ModelVendors;

            expect(Array.isArray(vendors)).toBe(true);
        });
    });
});
