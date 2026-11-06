/**
 * An `{% AIPrompt %}` tag hands its reply to Nunjucks through a callback, and Nunjucks renders the
 * rest of the template inside that callback. Whatever goes wrong there, or in the tag's own
 * parameters, must end the render with a failed result rather than leave it waiting forever.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    UserInfo: class {},
    BaseEngine: class {
        static getInstance<T>(): T { return new (this as never)() as T; }
        protected ContextUser = { ID: 'test-user', Name: 'Test' };
        protected Loaded = true;
        async Config() {}
        async Load() {}
        protected async AdditionalLoading() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;
    },
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    ValidationErrorInfo: class { Message = ''; },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTemplateContentEntity: class {
        ID = '';
        TemplateID = '';
        TemplateText = '';
        Type = '';
        Priority = 0;
    },
    MJTemplateEntityExtended: class {
        ID = '';
        Name = '';
        Content: Array<Record<string, unknown>> = [];
        Params: Array<Record<string, unknown>> = [];

        ValidateTemplateInput(_data: unknown, _contentId?: string) {
            return { Success: true, Errors: [] };
        }
        GetParametersForContent(_contentId: string) {
            return this.Params;
        }
        GetHighestPriorityContent(_type?: string) {
            return this.Content.length > 0 ? this.Content[0] : null;
        }
        GetContentByType(type: string) {
            return this.Content.filter((c: Record<string, unknown>) => c.Type === type);
        }
    },
    MJTemplateParamEntity: class {
        ID = '';
        Name = '';
        Type = 'Scalar';
        DefaultValue: string | null = null;
        TemplateID = '';
    },
    MJTemplateCategoryEntity: class {},
    MJTemplateContentTypeEntity: class {},
}));

const { mockGetAllRegistrations, mockCreateInstance } = vi.hoisted(() => ({
    mockGetAllRegistrations: vi.fn().mockReturnValue([]),
    mockCreateInstance: vi.fn(),
}));
vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                GetAllRegistrations: mockGetAllRegistrations,
                CreateInstance: mockCreateInstance,
            },
        },
    },
    RegisterClass: () => (target: Function) => target,
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
    SafeJSONParse: (s: string) => JSON.parse(s),
    // TemplateEngineServer now composes the base via BaseSingleton instead of extending it.
    BaseSingleton: class BaseSingletonMock<T> {
        protected constructor() {}
        protected static getInstance<U>(this: new () => U): U {
            return new this();
        }
    },
}));

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateRenderResult: class { Success = false; Output: string | null = null; Message?: string = undefined; },
    TemplateEngineBase: class {
        // TemplateEngineServer now composes this via `TemplateEngineBase.Instance` (cached singleton).
        private static _inst: unknown;
        static get Instance() { return (this._inst ??= new (this as never)()); }
        static getInstance<T>(): T { return (this as unknown as { Instance: T }).Instance; }
        public ContextUser = { ID: 'test-user', Name: 'Test' };
        public Loaded = true;
        async Config() {}
        async Load() {}
        protected async AdditionalLoading() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;

        private _Metadata = {
            Templates: [],
            TemplateContents: [],
            TemplateParams: [],
            TemplateContentTypes: [],
            TemplateCategories: [],
        };

        get Templates() { return this._Metadata.Templates; }
        get TemplateContents() { return this._Metadata.TemplateContents; }
        get TemplateParams() { return this._Metadata.TemplateParams; }
        get TemplateContentTypes() { return this._Metadata.TemplateContentTypes; }
        get TemplateCategories() { return this._Metadata.TemplateCategories; }

        FindTemplate(name: string) {
            return this._Metadata.Templates.find(
                (t: Record<string, unknown>) => (t.Name as string).trim().toLowerCase() === name.trim().toLowerCase()
            );
        }
    },
}));

const GPT = { Name: 'gpt-4', APIName: 'gpt-4', DriverClass: 'OpenAILLM', APINameOrName: 'gpt-4' };

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Models: [{ Name: 'gpt-4', APIName: 'gpt-4', DriverClass: 'OpenAILLM', APINameOrName: 'gpt-4' }],
            GetHighestPowerModel: vi.fn().mockResolvedValue(null),
        },
    },
}));

vi.mock('@memberjunction/ai', () => ({
    BaseLLM: class {},
    GetAIAPIKey: vi.fn().mockReturnValue('test-api-key'),
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIModelEntityExtended: class {},
}));

// ============================================================================
// Import under test
// ============================================================================
import { TemplateEngineServer } from '../TemplateEngine';
import { AIPromptExtension } from '../extensions/AIPrompt.extension';
import type { UserInfo } from '@memberjunction/core';
import type { TemplateRenderResult } from '@memberjunction/templates-base-types';

const ALICE = { ID: 'alice', Name: 'Alice' } as unknown as UserInfo;
const HUNG = 'HUNG';

/** The render's result, or {@link HUNG} when it has not settled within a short wait. */
function settleOrHang(render: Promise<TemplateRenderResult>): Promise<TemplateRenderResult | typeof HUNG> {
    return Promise.race([render, new Promise<typeof HUNG>((resolve) => setTimeout(() => resolve(HUNG), 300))]);
}

describe('TemplateEngineServer — a render with an {% AIPrompt %} tag always settles', () => {
    let engine: TemplateEngineServer;

    beforeEach(async () => {
        mockGetAllRegistrations.mockReturnValue([{ Key: 'AIPrompt', SubClass: AIPromptExtension }]);
        mockCreateInstance.mockReturnValue({
            ChatCompletion: vi.fn().mockResolvedValue({ success: true, data: { choices: [{ message: { content: 'Hi Ada' } }] } }),
        });
        engine = new (TemplateEngineServer as unknown as new () => TemplateEngineServer)();
        await engine.Config(false, ALICE);
    });

    it('renders the reply into the output', async () => {
        const result = await settleOrHang(
            engine.RenderTemplateSimple(`{% AIPrompt AIModel="${GPT.Name}" %}Greet Ada{% endAIPrompt %}!`, {}, { ContextUser: ALICE })
        );

        expect(result).not.toBe(HUNG);
        expect((result as TemplateRenderResult).Output).toBe('Hi Ada!');
    });

    it('fails the render when the template errors after the tag', async () => {
        const result = await settleOrHang(
            engine.RenderTemplateSimple(`{% AIPrompt AIModel="${GPT.Name}" %}Greet Ada{% endAIPrompt %} {{ undefinedFn() }}`, {}, { ContextUser: ALICE })
        );

        expect(result).not.toBe(HUNG);
        expect((result as TemplateRenderResult).Success).toBe(false);
        expect((result as TemplateRenderResult).Message).toMatch(/undefinedFn/);
    });

    it('fails the render with a clear message when AIModel is not a string', async () => {
        const result = await settleOrHang(
            engine.RenderTemplateSimple('{% AIPrompt AIModel=42 %}Greet Ada{% endAIPrompt %}', {}, { ContextUser: ALICE })
        );

        expect(result).not.toBe(HUNG);
        expect((result as TemplateRenderResult).Success).toBe(false);
        expect((result as TemplateRenderResult).Message).toMatch(/AIModel.*must be a string.*number/);
    });
});
