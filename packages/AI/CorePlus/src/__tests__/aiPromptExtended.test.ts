import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('@memberjunction/core', async (importOriginal) => {
    // Real ValidationResult / EntityInfo; only BaseEntity is replaced (the generated MJAIPromptEntity is mocked below).
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        BaseEntity: class BaseEntity {
            ContextCurrentUser = null;
            Fields = [];
            Get(fieldName: string) { return ''; }
            Set(fieldName: string, value: unknown) {}
            get Dirty() { return false; }
            async LoadFromData(data: unknown) { return true; }
            async InnerLoad(key: unknown) { return true; }
        },
    };
});

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
    compareStringsByLine: () => ({}),
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

/** A cached Template Content row: the fields the read-through reads. */
interface ContentRow { ID: string; TemplateID: string; TemplateText: string; Priority: number; __mj_UpdatedAt: Date }

const { cachedTemplates, TemplateDouble } = vi.hoisted(() => {
    /** A cached template; GetHighestPriorityContent stands in for the shared selection (tested in MJCoreEntities). */
    class TemplateDouble {
        constructor(public ID: string, public Content: ContentRow[]) {}
        GetHighestPriorityContent(): ContentRow | undefined {
            return [...this.Content].sort((a, b) => a.Priority - b.Priority)[0];
        }
    }
    return { cachedTemplates: [] as TemplateDouble[], TemplateDouble };
});

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
            Templates: cachedTemplates,
            TemplateContents: [],
            TemplateParams: [],
            /** The engine's O(1) rendered-content lookup, answered from the cached template doubles. */
            FindRenderedContent: (templateID: string) => cachedTemplates.find((t) => t.ID === templateID)?.GetHighestPriorityContent(),
        }
    }
}));

import { MJAIPromptEntityExtended } from '../MJAIPromptEntityExtended';
import { EntityInfo, ValidationResult } from '@memberjunction/core';

/** A minimal `MJ: AI Prompts` definition, so the prompt is constructed the way the entity requires. */
const PROMPT_ENTITY = new EntityInfo({
    ID: 'entity-ai-prompts', Name: 'MJ: AI Prompts', SchemaName: '__mj', BaseTable: 'AIPrompt', BaseView: 'vwAIPrompts',
    Fields: ['ID', 'Name', 'TemplateID', 'ResultSelectorPromptID'].map((name, index) => ({
        ID: `entity-ai-prompts-${name}`, EntityID: 'entity-ai-prompts', Sequence: index + 1, Name: name, Entity: 'MJ: AI Prompts',
        Type: name.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar', IsPrimaryKey: name === 'ID',
    })),
});

/** Exposes what the server subclass does after saving the text into a content row. */
class SavingPrompt extends MJAIPromptEntityExtended {
    public MarkSaved(row: ContentRow): void {
        this.RecordTemplateTextSource(row);
        this._originalTemplateText = this.TemplateText;
    }
}

function row(id: string, text: string, updatedAt: string, priority = 1): ContentRow {
    return { ID: id, TemplateID: 'T1', TemplateText: text, Priority: priority, __mj_UpdatedAt: new Date(updatedAt) };
}

/** Replaces the cached template the way a template-engine reload does: new row objects. */
function reloadCache(...rows: ContentRow[]): void {
    cachedTemplates.length = 0;
    cachedTemplates.push(new TemplateDouble('T1', rows));
}

describe('MJAIPromptEntityExtended', () => {
    let prompt: MJAIPromptEntityExtended;

    beforeEach(() => {
        prompt = new MJAIPromptEntityExtended(PROMPT_ENTITY);
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
            const result = new ValidationResult();

            prompt.ValidateResultSelectorPromptIDNotEqualID(result);

            expect(result.Errors).toHaveLength(0);
        });

        it('should add error when IDs are the same and not null', () => {
            prompt.ID = 'same-id';
            prompt.ResultSelectorPromptID = 'same-id';
            const result = new ValidationResult();

            prompt.ValidateResultSelectorPromptIDNotEqualID(result);

            expect(result.Errors).toHaveLength(1);
        });

        it('should not add error for an unsaved record (no ID yet) with no result selector', () => {
            prompt.ID = '';
            prompt.ResultSelectorPromptID = null;
            const result = new ValidationResult();

            prompt.ValidateResultSelectorPromptIDNotEqualID(result);

            expect(result.Errors).toHaveLength(0);
        });
    });

    describe('TemplateText reads through to the current Template Content', () => {
        beforeEach(() => { cachedTemplates.length = 0; });

        it('returns the edited content after the template engine refreshes, without reloading the prompt', () => {
            reloadCache(row('C1', 'v1 {{record.CurrentJobTitle}}', '2026-01-01'));
            prompt.TemplateID = 'T1';
            expect(prompt.TemplateText).toBe('v1 {{record.CurrentJobTitle}}');
            reloadCache(row('C1', 'v2 {{record.CurrentJobTitle}}', '2026-01-02'));
            expect(prompt.TemplateText).toBe('v2 {{record.CurrentJobTitle}}');
            expect(prompt.TemplateTextDirty).toBe(false);
        });

        it('keeps an unsaved local edit', () => {
            reloadCache(row('C1', 'v1', '2026-01-01'));
            prompt.TemplateID = 'T1';
            prompt.TemplateText = 'local edit';
            reloadCache(row('C1', 'v2', '2026-01-02'));
            expect(prompt.TemplateText).toBe('local edit');
        });

        it('keeps a just-saved text while the cache still holds the older row, then adopts a later version', () => {
            const saving = new SavingPrompt(PROMPT_ENTITY);
            reloadCache(row('C1', 'v1', '2026-01-01'));
            saving.TemplateID = 'T1';
            expect(saving.TemplateText).toBe('v1');

            saving.TemplateText = 'v2 saved here';
            saving.MarkSaved(row('C1', 'v2 saved here', '2026-01-02')); // the reload has not landed yet
            expect(saving.TemplateText).toBe('v2 saved here');
            expect(saving.TemplateTextDirty).toBe(false);

            reloadCache(row('C1', 'v3 from another server', '2026-01-03'));
            expect(saving.TemplateText).toBe('v3 from another server');
        });

        it('reads the content the prompt runner renders (highest priority), not the oldest row', () => {
            reloadCache(row('OLD', 'oldest, priority 2', '2026-01-01', 2), row('NEW', 'rendered, priority 1', '2026-01-05', 1));
            prompt.TemplateID = 'T1';
            expect(prompt.TemplateText).toBe('rendered, priority 1');
        });
    });
});
