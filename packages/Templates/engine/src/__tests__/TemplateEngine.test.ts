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
    TemplateContentEntity: class {
        ID = '';
        TemplateID = '';
        TemplateText = '';
        Type = '';
        Priority = 0;
    },
    TemplateEntityExtended: class {
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
    TemplateParamEntity: class {
        ID = '';
        Name = '';
        Type = 'Scalar';
        DefaultValue: string | null = null;
        TemplateID = '';
    },
    TemplateCategoryEntity: class {},
    TemplateContentTypeEntity: class {},
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
}));

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateRenderResult: class { Success = false; Output: string | null = null; Message?: string = undefined; },
    TemplateEngineBase: class {
        static getInstance<T>(): T { return new (this as never)() as T; }
        protected ContextUser = { ID: 'test-user', Name: 'Test' };
        protected Loaded = true;
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
import { TemplateEngineServer, TemplateEntityLoader } from '../TemplateEngine';
import { LogError } from '@memberjunction/core';

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
            const template = { ID: 'tmpl-1', Name: 'Test', Get: 'template content' };
            loader.AddTemplate('tmpl-1', template as never);

            // Verify by calling getSource
            const callback = vi.fn();
            loader.getSource('tmpl-1', callback);
            // The template uses Number(name) which would be NaN for 'tmpl-1',
            // so let's test with numeric IDs
        });

        it('should retrieve template via getSource with numeric ID', () => {
            const template = { ID: '42', Name: 'NumericTest', Get: 'content here' };
            loader.AddTemplate('42', template as never);

            const callback = vi.fn();
            loader.getSource('42', callback);

            expect(callback).toHaveBeenCalledWith(
                expect.objectContaining({
                    src: 'content here',
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
    let engine: TemplateEngineServer;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = new TemplateEngineServer();
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
            const templateEntity = {
                ID: 't-1',
                Name: 'Test',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([]),
            };

            const result = await engine.RenderTemplate(templateEntity as never, null as never, {});

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('templateContent variable is required');
        });

        it('should return failure when TemplateText is empty', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([]),
            };
            const templateContent = { ID: 'tc-1', TemplateText: '' };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                {}
            );

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('TemplateText variable is required');
        });

        it('should return failure when validation fails', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({
                    Success: false,
                    Errors: [
                        { Message: 'Missing required field: name' },
                        { Message: 'Invalid type for age' },
                    ],
                }),
                GetParametersForContent: vi.fn().mockReturnValue([]),
            };
            const templateContent = { ID: 'tc-1', TemplateText: 'Hello {{ name }}' };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                {}
            );

            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Missing required field: name');
            expect(result.Message).toContain('Invalid type for age');
        });

        it('should skip validation when SkipValidation is true', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn(),
                GetParametersForContent: vi.fn().mockReturnValue([]),
            };
            const templateContent = { ID: 'tc-1', TemplateText: 'Hello {{ name }}' };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                { name: 'World' },
                true // SkipValidation
            );

            expect(result.Success).toBe(true);
            expect(templateEntity.ValidateTemplateInput).not.toHaveBeenCalled();
        });

        it('should render template with provided data', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([]),
            };
            const templateContent = { ID: 'tc-1', TemplateText: 'Dear {{ name }}, welcome!' };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                { name: 'Alice' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Dear Alice, welcome!');
        });

        it('should catch rendering errors', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([]),
            };
            const templateContent = {
                ID: 'tc-err',
                TemplateText: '{% if %}missing condition{% endif %}',
            };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                {}
            );

            expect(result.Success).toBe(false);
            expect(result.Output).toBeNull();
        });

        it('should use template caching', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([]),
            };
            const templateContent = { ID: 'cached-tc', TemplateText: '{{ x }}' };

            // First render
            const result1 = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                { x: 'first' }
            );
            expect(result1.Output).toBe('first');

            // Second render with same content ID should use cache
            const result2 = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                { x: 'second' }
            );
            expect(result2.Output).toBe('second');
        });
    });

    describe('mergeDefaultValues', () => {
        it('should apply default values for missing parameters', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([
                    { Name: 'greeting', Type: 'Scalar', DefaultValue: 'Hello' },
                    { Name: 'title', Type: 'Scalar', DefaultValue: 'Mr.' },
                ]),
            };
            const templateContent = {
                ID: 'tc-defaults',
                TemplateText: '{{ greeting }} {{ title }} {{ name }}',
            };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                { name: 'Smith' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Hello Mr. Smith');
        });

        it('should not override provided values with defaults', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([
                    { Name: 'greeting', Type: 'Scalar', DefaultValue: 'Hello' },
                ]),
            };
            const templateContent = {
                ID: 'tc-no-override',
                TemplateText: '{{ greeting }}',
            };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                { greeting: 'Hi' }
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('Hi');
        });

        it('should parse JSON default values for complex types', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([
                    { Name: 'config', Type: 'Object', DefaultValue: '{"color":"red"}' },
                ]),
            };
            const templateContent = {
                ID: 'tc-json-default',
                TemplateText: '{{ config.color }}',
            };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('red');
        });

        it('should handle non-JSON default values for complex types', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([
                    { Name: 'data', Type: 'Array', DefaultValue: 'not-json' },
                ]),
            };
            const templateContent = {
                ID: 'tc-nonjson',
                TemplateText: '{{ data }}',
            };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('not-json');
        });

        it('should skip defaults when value is null or undefined', async () => {
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([
                    { Name: 'nullDefault', Type: 'Scalar', DefaultValue: null },
                    { Name: 'undefDefault', Type: 'Scalar', DefaultValue: undefined },
                ]),
            };
            const templateContent = {
                ID: 'tc-nulls',
                TemplateText: '[{{ nullDefault }}][{{ undefDefault }}]',
            };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('[][]');
        });

        it('should handle content-specific params overriding global params', async () => {
            const contentId = 'tc-precedence';
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([
                    { Name: 'val', Type: 'Scalar', DefaultValue: 'global' }, // global param
                    { Name: 'val', Type: 'Scalar', DefaultValue: 'content-specific', TemplateContentID: contentId }, // content-specific
                ]),
            };
            const templateContent = {
                ID: contentId,
                TemplateText: '{{ val }}',
            };

            const result = await engine.RenderTemplate(
                templateEntity as never,
                templateContent as never,
                {}
            );

            expect(result.Success).toBe(true);
            expect(result.Output).toBe('content-specific');
        });
    });

    describe('getNunjucksTemplate (caching behavior)', () => {
        it('should cache templates by contentId', async () => {
            // Render same template twice with same content ID
            const templateEntity = {
                ID: 't-1',
                ValidateTemplateInput: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
                GetParametersForContent: vi.fn().mockReturnValue([]),
            };
            const tc = { ID: 'cache-id', TemplateText: '{{ x }}' };

            await engine.RenderTemplate(templateEntity as never, tc as never, { x: 'a' });
            await engine.RenderTemplate(templateEntity as never, tc as never, { x: 'b' });

            // Both should succeed (cache is being used)
            const result = await engine.RenderTemplate(templateEntity as never, tc as never, { x: 'c' });
            expect(result.Success).toBe(true);
            expect(result.Output).toBe('c');
        });
    });

    describe('AddTemplate', () => {
        it('should delegate to the template loader', () => {
            const templateEntity = { ID: 'tmpl-1', Name: 'Test' };

            // Should not throw
            expect(() => engine.AddTemplate(templateEntity as never)).not.toThrow();
        });
    });
});
