/**
 * The template engine is a process-wide singleton, so the user a render runs as must come from
 * the render, never from whichever caller last configured the engine or first built its
 * extensions. Each test configures the engine as one user and renders as others.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const { mockGetAllRegistrations } = vi.hoisted(() => ({
    mockGetAllRegistrations: vi.fn().mockReturnValue([]),
}));
vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                GetAllRegistrations: mockGetAllRegistrations,
                CreateInstance: vi.fn(),
            },
        },
    },
    RegisterClass: () => (target: Function) => target,
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
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

// ============================================================================
// Import under test
// ============================================================================
import { TemplateEngineServer } from '../TemplateEngine';
import { TemplateExtensionBase, NunjucksCallback } from '../extensions/TemplateExtensionBase';
import type { UserInfo } from '@memberjunction/core';

interface WhoAmIParser { nextToken(): { value: string }; parseSignature(a: null, b: boolean): object; advanceAfterBlockEnd(name: string): void }
interface WhoAmINodes { CallExtensionAsync: new (ext: object, prop: string, args: object) => object }

/** `{% whoami "x" %}` renders the ID of the user the extension acts for, after a delay so renders interleave. */
class WhoAmIExtension extends TemplateExtensionBase {
    constructor(contextUser: UserInfo) {
        super(contextUser);
        this.Tags = ['whoami'];
    }
    public parse(parser: WhoAmIParser, nodes: WhoAmINodes) {
        const tok = parser.nextToken();
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        return new nodes.CallExtensionAsync(this, 'run', args);
    }
    public run(_context: object, _args: object, callBack: NunjucksCallback) {
        setTimeout(() => callBack(null, this.ContextUser?.ID ?? 'none'), 5);
    }
}

const FIRST = { ID: 'first-user', Name: 'First' } as unknown as UserInfo;
const ALICE = { ID: 'alice', Name: 'Alice' } as unknown as UserInfo;
const BOB = { ID: 'bob', Name: 'Bob' } as unknown as UserInfo;

const TEMPLATE = { ID: 'tmpl-1', Name: 'WhoAmI', ValidateTemplateInput: () => ({ Success: true, Errors: [] }), GetParametersForContent: () => [] };
const CONTENT = { ID: 'content-1', TemplateText: 'user={% whoami "x" %}' };

describe('TemplateEngineServer — the render user reaches extensions per render', () => {
    let engine: TemplateEngineServer;

    beforeEach(async () => {
        mockGetAllRegistrations.mockReturnValue([{ Key: 'WhoAmI', SubClass: WhoAmIExtension }]);
        engine = new (TemplateEngineServer as unknown as new () => TemplateEngineServer)();
        await engine.Config(false, FIRST); // extensions are built here, with the first caller's user
    });

    function render(user?: UserInfo, autoescape?: boolean) {
        return engine.RenderTemplate(TEMPLATE as never, CONTENT as never, {}, true, true, { ContextUser: user, autoescape });
    }

    it('two concurrent renders with different users each see their own user in the extension', async () => {
        const [a, b] = await Promise.all([render(ALICE), render(BOB)]);
        expect(a.Message).toBeUndefined();
        expect(a.Output).toBe('user=alice');
        expect(b.Output).toBe('user=bob');
    });

    it('applies the render user in the raw (no-autoescape) environment too', async () => {
        const [a, b] = await Promise.all([render(ALICE, false), render(BOB, false)]);
        expect(a.Output).toBe('user=alice');
        expect(b.Output).toBe('user=bob');
    });

    it('REGRESSION: without a render user, extensions act for no user, not whoever last configured the engine', async () => {
        await engine.Config(false, BOB);
        const result = await engine.RenderTemplate(TEMPLATE as never, CONTENT as never, {}, true, true);
        expect(result.Output).toBe('user=none');
    });

    it('REGRESSION: without a render user, extensions do not fall back to the user they were built with', async () => {
        const result = await engine.RenderTemplateSimple('user={% whoami "x" %}', {});
        expect(result.Output).toBe('user=none');
    });

    it('a render user set for one render does not leak into the next render', async () => {
        await render(ALICE);
        await engine.Config(false, BOB);
        const result = await engine.RenderTemplate(TEMPLATE as never, CONTENT as never, {}, true, true);
        expect(result.Output).toBe('user=none');
    });

    it('a nested render with no user of its own keeps the outer render user', async () => {
        const { RunAsTemplateRenderUser } = await import('../TemplateRenderUser');
        const result = await RunAsTemplateRenderUser(ALICE, () => engine.RenderTemplateSimple('user={% whoami "x" %}', {}));
        expect(result.Output).toBe('user=alice');
    });

    it('applies the render user to RenderTemplateSimple', async () => {
        const [a, b] = await Promise.all([
            engine.RenderTemplateSimple('user={% whoami "x" %}', {}, { ContextUser: ALICE }),
            engine.RenderTemplateSimple('user={% whoami "x" %}', {}, { ContextUser: BOB }),
        ]);
        expect(a.Message).toBeUndefined();
        expect(a.Output).toBe('user=alice');
        expect(b.Output).toBe('user=bob');
    });
});
