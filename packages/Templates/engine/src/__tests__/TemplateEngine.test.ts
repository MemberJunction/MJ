import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    UserInfo: class {},
    EntityInfo: class {},
    BaseEngine: class {
        static getInstance<T>(this: new () => T): T { return new this(); }
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
    ValidationErrorInfo: class { constructor(public Source: string, public Message: string) {} },
    ValidationResult: class { Success = false; Errors: Array<{ Message: string }> = []; },
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
        /** The loader hands nunjucks `template.Get` as the source; a stub so the double has one to hand. */
        Get(_fieldName: string): unknown { return undefined; }

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
        TemplateContentID: string | null = null;
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
    TemplateEngineBase: class TemplateEngineBaseDouble {
        // TemplateEngineServer now composes this via `TemplateEngineBase.Instance` (cached singleton).
        private static _inst?: TemplateEngineBaseDouble;
        static get Instance(): TemplateEngineBaseDouble { return (TemplateEngineBaseDouble._inst ||= new TemplateEngineBaseDouble()); }
        static getInstance(): TemplateEngineBaseDouble { return TemplateEngineBaseDouble.Instance; }
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

        FindTemplateByID(id: string) {
            return this._Metadata.Templates.find((t: Record<string, unknown>) => t.ID === id);
        }
    },
}));

// ============================================================================
// Import under test
// ============================================================================
import { TemplateEngineServer, TemplateEntityLoader } from '../TemplateEngine';
import { TemplateEmbedExtension } from '../extensions/TemplateEmbed.extension';
import { EntityInfo, LogError, UserInfo, ValidationErrorInfo, ValidationResult } from '@memberjunction/core';
import { MJTemplateContentEntity, MJTemplateEntityExtended, MJTemplateParamEntity } from '@memberjunction/core-entities';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';

/** A template of the mocked entity class (typed as the real one); its input validation always passes. */
function makeTemplate(id: string): MJTemplateEntityExtended {
    const template = new MJTemplateEntityExtended(new EntityInfo());
    template.ID = id;
    return template;
}

/** A content row of the mocked entity class (typed as the real one). */
function makeContent(id: string, templateText: string): MJTemplateContentEntity {
    const content = new MJTemplateContentEntity(new EntityInfo());
    content.ID = id;
    content.TemplateText = templateText;
    return content;
}

/** A parameter row of the mocked entity class (typed as the real one). */
function makeParam(name: string, type: MJTemplateParamEntity['Type'], defaultValue: string | null, templateContentID: string | null = null): MJTemplateParamEntity {
    const param = new MJTemplateParamEntity(new EntityInfo());
    param.Name = name;
    param.Type = type;
    param.DefaultValue = defaultValue;
    param.TemplateContentID = templateContentID;
    return param;
}

/** A failed input validation carrying the given messages. */
function failedValidation(...messages: string[]): ValidationResult {
    const result = new ValidationResult();
    result.Success = false;
    result.Errors = messages.map((message) => new ValidationErrorInfo('data', message, undefined));
    return result;
}

/** The engine is a singleton with a protected constructor; each test builds a fresh one through this subclass. */
class TestTemplateEngineServer extends TemplateEngineServer {
    public constructor() {
        super();
    }
}

interface EmbedParser { nextToken(): { value: string }; parseSignature(a: null, b: boolean): object; advanceAfterBlockEnd(name: string): void }
interface EmbedNodes { CallExtensionAsync: new (ext: object, prop: string, args: object) => object }

/** Stand-in for TemplateEmbedExtension: the same tag and the same parse. */
class EmbedExtensionStandIn {
    public tags = ['template'];
    public parse(parser: EmbedParser, nodes: EmbedNodes) {
        const tok = parser.nextToken();
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        return new nodes.CallExtensionAsync(this, 'run', args);
    }
}

/** An extension the variable analysis does not know: the embed's parse under another tag. */
class CustomExtensionStandIn extends EmbedExtensionStandIn {
    public tags = ['custom'];
}

describe('TemplateEntityLoader', () => {
    let loader: TemplateEntityLoader;

    beforeEach(() => {
        loader = new TemplateEntityLoader();
    });

    it('should have async flag set to true', () => {
        expect(loader.async).toBe(true);
    });

    describe('AddTemplate', () => {
        it('should store template by ID', () => {
            const template = makeTemplate('tmpl-1');
            loader.AddTemplate('tmpl-1', template);

            // Verify by calling getSource
            const callback = vi.fn();
            loader.getSource('tmpl-1', callback);
            // The template uses Number(name) which would be NaN for 'tmpl-1',
            // so let's test with numeric IDs
        });

        it('should retrieve template via getSource with numeric ID', () => {
            const template = makeTemplate('42');
            loader.AddTemplate('42', template);

            const callback = vi.fn();
            loader.getSource('42', callback);

            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    src: template.Get,
                    noCache: true,
                })
            );
        });

        it('should not call callback if template is not found', () => {
            const callback = vi.fn();
            loader.getSource('999', callback);

            expect(callback).not.toHaveBeenCalled();
        });
    });
});

describe('TemplateEngineServer', () => {
    let engine: TestTemplateEngineServer;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = new TestTemplateEngineServer();
        // Call SetupNunjucks to initialize the nunjucks environment
        engine.SetupNunjucks();
    });

    describe('Instance', () => {
        it('should return an instance', () => {
            const instance = TemplateEngineServer.Instance;
            expect(instance).toBeDefined();
        });
    });

    describe('SetupNunjucks', () => {
        it('should initialize nunjucks environment and loader', () => {
            engine.SetupNunjucks();
            // Verify the engine can render simple templates after setup
            expect(engine).toBeDefined();
        });
    });

    describe('ClearTemplateCache', () => {
        it('should clear the template cache', () => {
            engine.ClearTemplateCache();
            // No error thrown means success; verify it works after clearing
            expect(() => engine.ClearTemplateCache()).not.toThrow();
        });
    });

    describe('RenderTemplateSimple', () => {
        it('should render a simple template with variables', async () => {
            const result = await engine.RenderTemplateSimple(
                'Hello {{ name }}!',
                { name: 'World' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Hello World!');
        });

        it('should render template with no variables', async () => {
            const result = await engine.RenderTemplateSimple(
                'Static content',
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Static content');
        });

        it('should handle template syntax errors gracefully', async () => {
            const result = await engine.RenderTemplateSimple(
                '{% invalid syntax %}',
                {}
            );

            expect(result.Success).toBe(false);
            expect(result.Output).toBeNull();
            expect(result.Message).toBeDefined();
        });

        it('should render template with conditionals', async () => {
            const template = '{% if show %}Visible{% else %}Hidden{% endif %}';

            const resultShow = await engine.RenderTemplateSimple(template, { show: true });
            expect(resultShow.Output).toBe('Visible');

            const resultHide = await engine.RenderTemplateSimple(template, { show: false });
            expect(resultHide.Output).toBe('Hidden');
        });

        it('should render template with loops', async () => {
            const template = '{% for item in items %}{{ item }},{% endfor %}';
            const result = await engine.RenderTemplateSimple(template, { items: ['a', 'b', 'c'] });

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('a,b,c,');
        });

        it('should handle nested object access', async () => {
            const template = '{{ user.name }} - {{ user.address.city }}';
            const result = await engine.RenderTemplateSimple(template, {
                user: { name: 'Alice', address: { city: 'NYC' } },
            });

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Alice - NYC');
        });

        it('should handle undefined variables gracefully', async () => {
            const result = await engine.RenderTemplateSimple(
                'Value: {{ undefinedVar }}',
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Value: ');
        });

        it('should auto-escape HTML by default', async () => {
            const result = await engine.RenderTemplateSimple(
                '{{ content }}',
                { content: '<script>alert("xss")</script>' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).not.toContain('<script>');
            expect(result.Output).toContain('&lt;script&gt;');
        });

        it('should support safe filter to bypass escaping', async () => {
            const result = await engine.RenderTemplateSimple(
                '{{ content | safe }}',
                { content: '<b>Bold</b>' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('<b>Bold</b>');
        });

        it('should support built-in filters', async () => {
            const result = await engine.RenderTemplateSimple(
                '{{ name | upper }}',
                { name: 'hello' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('HELLO');
        });
    });

    describe('RenderTemplateSimple autoescape control', () => {
        it('should NOT HTML-escape when autoescape is false (email subject-line case)', async () => {
            const result = await engine.RenderTemplateSimple(
                '{{ company }}',
                { company: 'Acme & Co' },
                { autoescape: false }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Acme & Co');
        });

        it('should still HTML-escape when autoescape is explicitly true', async () => {
            const result = await engine.RenderTemplateSimple(
                '{{ company }}',
                { company: 'Acme & Co' },
                { autoescape: true }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Acme &amp; Co');
        });

        it('should HTML-escape by default when no options are passed (unchanged behavior)', async () => {
            const result = await engine.RenderTemplateSimple(
                '{{ company }}',
                { company: 'Acme & Co' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Acme &amp; Co');
        });

        it('should support custom filters (json/jsoninline/jsonparse) in no-autoescape mode', async () => {
            const jsonInline = await engine.RenderTemplateSimple(
                '{{ data | jsoninline }}',
                { data: { a: 1, b: 2 } },
                { autoescape: false }
            );
            expect(jsonInline.Success).toBe(true);
            expect(jsonInline.Output).toBe('{"a":1,"b":2}');

            const json = await engine.RenderTemplateSimple(
                '{{ data | json }}',
                { data: { key: 'value' } },
                { autoescape: false }
            );
            expect(json.Success).toBe(true);
            expect(json.Output).toContain('"key"');
            expect(json.Output).toContain('"value"');

            const parsed = await engine.RenderTemplateSimple(
                '{% set obj = jsonStr | jsonparse %}{{ obj.name }}',
                { jsonStr: '{"name":"Alice"}' },
                { autoescape: false }
            );
            expect(parsed.Success).toBe(true);
            expect(parsed.Output).toBe('Alice');
        });

        it('should reuse the lazily-created no-autoescape environment across calls', async () => {
            const first = await engine.RenderTemplateSimple('{{ v }}', { v: 'A & B' }, { autoescape: false });
            const second = await engine.RenderTemplateSimple('{{ v }}', { v: 'C & D' }, { autoescape: false });

            expect(first.Output).toBe('A & B');
            expect(second.Output).toBe('C & D');
        });
    });

    describe('Custom Filters', () => {
        it('should provide json filter for object serialization', async () => {
            const result = await engine.RenderTemplateSimple(
                '{{ data | json | safe }}',
                { data: { key: 'value' } }
            );

            expect(result.Success).toBe(true);
            // json filter with indent=2
            expect(result.Output).toContain('"key"');
            expect(result.Output).toContain('"value"');
        });

        it('should provide jsoninline filter for compact output', async () => {
            const result = await engine.RenderTemplateSimple(
                '{{ data | jsoninline | safe }}',
                { data: { a: 1, b: 2 } }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toContain('{"a":1,"b":2}');
        });

        it('should provide jsonparse filter to parse JSON strings', async () => {
            const template = '{% set obj = jsonStr | jsonparse %}{{ obj.name }}';
            const result = await engine.RenderTemplateSimple(
                template,
                { jsonStr: '{"name":"Alice"}' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Alice');
        });

        it('should handle jsonparse with invalid JSON gracefully', async () => {
            const template = '{{ badJson | jsonparse }}';
            const result = await engine.RenderTemplateSimple(
                template,
                { badJson: 'not-json' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('not-json'); // Returns original string
        });

        it('should handle json filter with circular reference', async () => {
            // The json filter catches errors and returns an error message
            const circular: Record<string, unknown> = {};
            circular.self = circular;

            const result = await engine.RenderTemplateSimple(
                '{{ data | json }}',
                { data: circular }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toContain('[Error serializing to JSON');
        });
    });

    describe('RenderTemplate', () => {
        it('should return failure when templateContent is null', async () => {
            const templateEntity = makeTemplate('t-1');
            templateEntity.Name = 'Test';

            const result = await engine.RenderTemplate(templateEntity, null, {});

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('templateContent variable is required');
        });

        it('should return failure when TemplateText is empty', async () => {
            const templateEntity = makeTemplate('t-1');
            const templateContent = makeContent('tc-1', '');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                {}
            );

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('TemplateText variable is required');
        });

        it('should return failure when validation fails', async () => {
            const templateEntity = makeTemplate('t-1');
            vi.spyOn(templateEntity, 'ValidateTemplateInput').mockReturnValue(
                failedValidation('Missing required field: name', 'Invalid type for age'),
            );
            const templateContent = makeContent('tc-1', 'Hello {{ name }}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                {}
            );

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Missing required field: name');
            expect(result.Message).toContain('Invalid type for age');
        });

        it('should skip validation when SkipValidation is true but log warnings by default', async () => {
            const templateEntity = makeTemplate('t-1');
            templateEntity.Name = 'TestTemplate';
            const validate = vi.spyOn(templateEntity, 'ValidateTemplateInput');
            const templateContent = makeContent('tc-1', 'Hello {{ name }}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                { name: 'World' },
                true // SkipValidation
            );

            expect(result.Success).toBe(true);
            // With SkipValidation=true and SuppressWarnings defaulting to false,
            // ValidateTemplateInput IS called for non-fatal warning logging
            expect(validate).toHaveBeenCalled();
        });

        it('should suppress warnings when both SkipValidation and SuppressWarnings are true', async () => {
            const templateEntity = makeTemplate('t-1');
            templateEntity.Name = 'TestTemplate';
            const validate = vi.spyOn(templateEntity, 'ValidateTemplateInput');
            const templateContent = makeContent('tc-1', 'Hello {{ name }}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                { name: 'World' },
                true, // SkipValidation
                true  // SuppressWarnings
            );

            expect(result.Success).toBe(true);
            expect(validate).not.toHaveBeenCalled();
        });

        it('should render template with provided data', async () => {
            const templateEntity = makeTemplate('t-1');
            const templateContent = makeContent('tc-1', 'Dear {{ name }}, welcome!');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                { name: 'Alice' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Dear Alice, welcome!');
        });

        it('should catch rendering errors', async () => {
            const templateEntity = makeTemplate('t-1');
            const templateContent = makeContent('tc-err', '{% if %}missing condition{% endif %}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                {}
            );

            expect(result.Success).toBe(false);
            expect(result.Output).toBeNull();
        });

        it('should use template caching', async () => {
            const templateEntity = makeTemplate('t-1');
            const templateContent = makeContent('cached-tc', '{{ x }}');

            // First render
            const result1 = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                { x: 'first' }
            );
            expect(result1.Output).toBe('first');

            // Second render with same content ID should use cache
            const result2 = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                { x: 'second' }
            );
            expect(result2.Output).toBe('second');
        });

        it('recompiles a cached template when its content text changes', async () => {
            const templateEntity = makeTemplate('t-1');
            const first = await engine.RenderTemplate(templateEntity, makeContent('tc-9', 'A {{ x }}'), { x: 1 });
            const second = await engine.RenderTemplate(templateEntity, makeContent('tc-9', 'B {{ x }}'), { x: 1 });
            expect(first.Output).toBe('A 1');
            expect(second.Output).toBe('B 1');
        });

        it('renders raw when autoescape is false, and still escapes by default', async () => {
            const templateEntity = makeTemplate('t-1');
            const content = makeContent('tc-amp', 'Job Title: {{ record.CurrentJobTitle }}');
            const data = { record: { CurrentJobTitle: 'Affineur & Owner' } };
            const raw = await engine.RenderTemplate(templateEntity, content, data, true, true, { autoescape: false });
            const escaped = await engine.RenderTemplate(templateEntity, content, data, true, true);
            expect(raw.Output).toBe('Job Title: Affineur & Owner');
            expect(escaped.Output).toBe('Job Title: Affineur &amp; Owner');
        });

        it('registers the template extensions on the raw environment too', async () => {
            class ProbeExtension { public static Created = 0; public tags = ['probeext']; constructor() { ProbeExtension.Created++; } public parse(): void { /* never invoked */ } }
            const templateEntity = makeTemplate('t-2');
            // a raw render before the extension is registered, so a raw environment that survived the rebuild would lack it
            await engine.RenderTemplate(templateEntity, makeContent('tc-pre', 'x'), {}, true, true, { autoescape: false });
            mockGetAllRegistrations.mockReturnValue([{ Key: 'probeext', SubClass: ProbeExtension }]);
            engine.SetupNunjucks(); // drops the raw environment, so the next raw render builds it
            const before = ProbeExtension.Created;
            await engine.RenderTemplate(templateEntity, makeContent('tc-ext', 'x'), {}, true, true, { autoescape: false });
            expect(ProbeExtension.Created).toBe(before + 1);
            mockGetAllRegistrations.mockReturnValue([]);
        });

        it('runs the raw environment\'s extensions as the user the escaping environment\'s extensions run as', async () => {
            const usersSeen: UserInfo[] = [];
            class UserProbeExtension { public tags = ['userprobe']; constructor(user: UserInfo) { usersSeen.push(user); } public parse(): void { /* never invoked */ } }
            mockGetAllRegistrations.mockReturnValue([{ Key: 'userprobe', SubClass: UserProbeExtension }]);
            const firstUser = new UserInfo();
            const laterUser = new UserInfo();
            await engine.Config(false, firstUser); // builds the escaping environment's extensions for firstUser
            await engine.Config(false, laterUser); // a later caller's user becomes the context user

            await engine.RenderTemplate(makeTemplate('t-3'), makeContent('tc-user', 'x'), {}, true, true, { autoescape: false });

            expect(usersSeen).toHaveLength(2);
            expect(usersSeen[0]).toBe(firstUser);
            expect(usersSeen[1]).toBe(firstUser);
            mockGetAllRegistrations.mockReturnValue([]);
        });
    });

    describe('mergeDefaultValues', () => {
        it('should apply default values for missing parameters', async () => {
            const templateEntity = makeTemplate('t-1');
            templateEntity.Params = [
                makeParam('greeting', 'Scalar', 'Hello'),
                makeParam('title', 'Scalar', 'Mr.'),
            ];
            const templateContent = makeContent('tc-defaults', '{{ greeting }} {{ title }} {{ name }}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                { name: 'Smith' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Hello Mr. Smith');
        });

        it('should not override provided values with defaults', async () => {
            const templateEntity = makeTemplate('t-1');
            templateEntity.Params = [
                makeParam('greeting', 'Scalar', 'Hello'),
            ];
            const templateContent = makeContent('tc-no-override', '{{ greeting }}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                { greeting: 'Hi' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Hi');
        });

        it('should parse JSON default values for complex types', async () => {
            const templateEntity = makeTemplate('t-1');
            templateEntity.Params = [
                makeParam('config', 'Object', '{"color":"red"}'),
            ];
            const templateContent = makeContent('tc-json-default', '{{ config.color }}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('red');
        });

        it('should handle non-JSON default values for complex types', async () => {
            const templateEntity = makeTemplate('t-1');
            templateEntity.Params = [
                makeParam('data', 'Array', 'not-json'),
            ];
            const templateContent = makeContent('tc-nonjson', '{{ data }}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('not-json');
        });

        it('should skip defaults when value is null or undefined', async () => {
            const templateEntity = makeTemplate('t-1');
            templateEntity.Params = [
                makeParam('nullDefault', 'Scalar', null),
                makeParam('undefDefault', 'Scalar', null),
            ];
            const templateContent = makeContent('tc-nulls', '[{{ nullDefault }}][{{ undefDefault }}]');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('[][]');
        });

        it('should handle content-specific params overriding global params', async () => {
            const contentId = 'tc-precedence';
            const templateEntity = makeTemplate('t-1');
            templateEntity.Params = [
                makeParam('val', 'Scalar', 'global'), // global param
                makeParam('val', 'Scalar', 'content-specific', contentId), // content-specific
            ];
            const templateContent = makeContent(contentId, '{{ val }}');

            const result = await engine.RenderTemplate(
                templateEntity,
                templateContent,
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('content-specific');
        });
    });

    describe('getNunjucksTemplate (caching behavior)', () => {
        it('should cache templates by contentId', async () => {
            // Render same template twice with same content ID
            const templateEntity = makeTemplate('t-1');
            const tc = makeContent('cache-id', '{{ x }}');

            await engine.RenderTemplate(templateEntity, tc, { x: 'a' });
            await engine.RenderTemplate(templateEntity, tc, { x: 'b' });

            // Both should succeed (cache is being used)
            const result = await engine.RenderTemplate(templateEntity, tc, { x: 'c' });
            expect(result.Success).toBe(true);
            expect(result.Output).toBe('c');
        });
    });

    describe('FindTemplateByID', () => {
        it('looks the template up by ID in the template metadata cache', () => {
            const byID = vi.spyOn(TemplateEngineBase.Instance, 'FindTemplateByID');

            engine.FindTemplateByID('template-id');

            expect(byID).toHaveBeenCalledWith('template-id');
        });
    });

    describe('AddTemplate', () => {
        it('should delegate to the template loader', () => {
            const templateEntity = makeTemplate('tmpl-1');
            templateEntity.Name = 'Test';

            // Should not throw
            expect(() => engine.AddTemplate(templateEntity)).not.toThrow();
        });
    });

    describe('GetReferencedVariables', () => {
        const childTemplate = { Name: 'Child', Content: [{ TemplateText: '{{ childVar }}' }] };

        /** Configures the engine with the given extension registrations. */
        async function configureWith(registrations: Array<{ SubClass: new (...args: never[]) => object; Key: string }>): Promise<void> {
            mockGetAllRegistrations.mockReturnValueOnce(registrations);
            await engine.Config(false, { ID: 'test-user', Name: 'Test' } as never);
        }

        beforeEach(() => {
            engine.Templates.push(childTemplate as never);
        });

        afterEach(() => {
            engine.Templates.splice(engine.Templates.indexOf(childTemplate as never), 1);
        });

        it('should parse tags of registered extensions and follow embedded templates found by name', async () => {
            await configureWith([{ SubClass: EmbedExtensionStandIn, Key: 'TemplateEmbed' }]);

            const result = engine.GetReferencedVariables('{% template "Child" %}{{ a }}');

            expect(result.Complete).toBe(true);
            expect(result.Names.has('a')).toBe(true);
            expect(result.Names.has('childVar')).toBe(true);
        });

        it('should return the cached result for the same text until ClearTemplateCache', async () => {
            await configureWith([{ SubClass: EmbedExtensionStandIn, Key: 'TemplateEmbed' }]);
            const text = '{% template "Child" %}';

            const first = engine.GetReferencedVariables(text);
            expect(engine.GetReferencedVariables(text)).toBe(first);

            engine.ClearTemplateCache();
            const afterClear = engine.GetReferencedVariables(text);
            expect(afterClear).not.toBe(first);
            expect(afterClear.Names.has('childVar')).toBe(true);
        });

        it('should return a frozen result', async () => {
            await configureWith([{ SubClass: EmbedExtensionStandIn, Key: 'TemplateEmbed' }]);

            expect(Object.isFrozen(engine.GetReferencedVariables('{{ a }}'))).toBe(true);
        });

        it('should be incomplete for a tag from a registered extension the analysis does not know', async () => {
            await configureWith([{ SubClass: CustomExtensionStandIn, Key: 'Custom' }]);

            const result = engine.GetReferencedVariables('{% custom "x" %}');

            expect(result.Complete).toBe(false);
            expect(result.Reason).toContain('{% custom %}');
        });

        it('should be incomplete when no registered extension handles a custom tag', async () => {
            await configureWith([]);

            const result = engine.GetReferencedVariables('{% template "Child" %}');

            expect(result.Complete).toBe(false);
        });

        it('should give the same answer before and after the first Config()', async () => {
            mockGetAllRegistrations.mockReturnValueOnce([{ SubClass: EmbedExtensionStandIn, Key: 'TemplateEmbed' }]);
            const text = '{% template "Child" %}{{ a }}';

            const before = engine.GetReferencedVariables(text);
            await engine.Config(false, { ID: 'test-user', Name: 'Test' } as never);
            const after = engine.GetReferencedVariables(text);

            expect(before.Complete).toBe(true);
            expect(after.Complete).toBe(true);
            expect([...before.Names].sort()).toEqual([...after.Names].sort());
            expect(before.Names.has('childVar')).toBe(true);
        });

        it('should not cache a result for text that does not parse', async () => {
            await configureWith([]);
            const text = '{% template "Child" %}'; // no registered extension handles the tag

            const first = engine.GetReferencedVariables(text);

            expect(first.Complete).toBe(false);
            expect(first.Reason).toContain('could not be parsed');
            expect(engine.GetReferencedVariables(text)).not.toBe(first);
        });

        it('should not cache a result when a template it pulls in does not parse', async () => {
            await configureWith([{ SubClass: EmbedExtensionStandIn, Key: 'TemplateEmbed' }]);
            const broken = { Name: 'Broken', Content: [{ TemplateText: '{% if %}' }] };
            engine.Templates.push(broken as never);
            try {
                const text = '{% template "Broken" %}{{ a }}';

                const first = engine.GetReferencedVariables(text);

                expect(first.Complete).toBe(false);
                expect(engine.GetReferencedVariables(text)).not.toBe(first);
            } finally {
                engine.Templates.splice(engine.Templates.indexOf(broken as never), 1);
            }
        });

        it('should cache an incomplete result that is not a parse failure', async () => {
            await configureWith([{ SubClass: EmbedExtensionStandIn, Key: 'TemplateEmbed' }]);
            const text = '{% template "Missing" %}';

            const first = engine.GetReferencedVariables(text);

            expect(first.Complete).toBe(false);
            expect(first.Reason).toContain('was not found');
            expect(engine.GetReferencedVariables(text)).toBe(first);
        });

        it('should follow a {% template %} tag parsed by the real TemplateEmbedExtension', async () => {
            await configureWith([{ SubClass: TemplateEmbedExtension, Key: 'TemplateEmbed' }]);

            const result = engine.GetReferencedVariables('{% template "Child", type="HTML" %}');

            expect(result.Complete).toBe(true);
            expect(result.Names.has('childVar')).toBe(true);
        });
    });
});
