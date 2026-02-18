import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    UserInfo: class {},
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target,
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTemplateContentEntity: class {
        ID = '';
        TemplateText = '';
        Type = '';
        Priority = 0;
    },
    TemplateEntityExtended: class {
        ID = '';
        Name = '';
        Content: Array<Record<string, unknown>> = [];
        GetContentByType(type: string) {
            return this.Content.filter((c: Record<string, unknown>) => c.Type === type);
        }
        GetHighestPriorityContent() {
            if (this.Content.length === 0) return null;
            return [...this.Content].sort(
                (a, b) => (b.Priority as number) - (a.Priority as number)
            )[0];
        }
    },
}));

// Mock the TemplateEngineServer
const { mockRenderTemplateSimple, mockFindTemplate } = vi.hoisted(() => ({
    mockRenderTemplateSimple: vi.fn(),
    mockFindTemplate: vi.fn(),
}));
vi.mock('../TemplateEngine', () => ({
    TemplateEngineServer: {
        Instance: {
            FindTemplate: mockFindTemplate,
            RenderTemplateSimple: mockRenderTemplateSimple,
        },
    },
}));

import { TemplateEmbedExtension } from '../extensions/TemplateEmbed.extension';
import { LogError } from '@memberjunction/core';

describe('TemplateEmbedExtension', () => {
    let extension: TemplateEmbedExtension;
    const contextUser = { ID: 'user-1', Name: 'Test' };

    beforeEach(() => {
        vi.clearAllMocks();
        extension = new TemplateEmbedExtension(contextUser as never);
    });

    describe('constructor', () => {
        it('should set tags to ["template"]', () => {
            expect(extension.tags).toEqual(['template']);
        });
    });

    describe('parse', () => {
        it('should call parser methods and return CallExtensionAsync node', () => {
            const tok = { value: 'template' };
            const parsedParams = {};
            const callExtNode = { type: 'CallExtensionAsync' };

            const parser = {
                nextToken: vi.fn().mockReturnValue(tok),
                parseSignature: vi.fn().mockReturnValue(parsedParams),
                advanceAfterBlockEnd: vi.fn(),
            };
            const nodes = {
                CallExtensionAsync: vi.fn(function () { return callExtNode; }),
            };
            const lexer = {};

            const result = extension.parse(parser, nodes, lexer);

            expect(parser.nextToken).toHaveBeenCalled();
            expect(parser.parseSignature).toHaveBeenCalledWith(null, true);
            expect(parser.advanceAfterBlockEnd).toHaveBeenCalledWith('template');
            expect(nodes.CallExtensionAsync).toHaveBeenCalledWith(
                extension, 'run', parsedParams
            );
            expect(result).toBe(callExtNode);
        });
    });

    describe('run', () => {
        it('should call callback with error when template name is empty', () => {
            const context = { ctx: {} };
            const body = ''; // empty template name
            const callback = vi.fn();

            extension.run(context, body, callback);

            expect(callback).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should call callback with error when template is not found', () => {
            mockFindTemplate.mockReturnValue(null);

            const context = { ctx: {} };
            const body = 'NonExistentTemplate';
            const callback = vi.fn();

            extension.run(context, body, callback);

            expect(callback).toHaveBeenCalledWith(expect.any(Error));
            expect(LogError).toHaveBeenCalled();
        });

        it('should detect circular template references', () => {
            const targetTemplate = {
                Name: 'CircularTemplate',
                Content: [{ Type: 'HTML', Priority: 1, TemplateText: 'content' }],
                GetContentByType: vi.fn().mockReturnValue([{ Type: 'HTML', Priority: 1 }]),
                GetHighestPriorityContent: vi.fn().mockReturnValue({ Type: 'HTML', Priority: 1, TemplateText: 'content' }),
            };
            mockFindTemplate.mockReturnValue(targetTemplate);

            const context = {
                ctx: {
                    _mjRenderContext: {
                        templateStack: ['CircularTemplate'], // Already in the stack!
                        currentContentType: 'HTML',
                    },
                },
            };
            const body = 'CircularTemplate';
            const callback = vi.fn();

            extension.run(context, body, callback);

            expect(callback).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should render embedded template successfully', async () => {
            const targetTemplate = {
                Name: 'HeaderTemplate',
                Content: [{ Type: 'HTML', Priority: 1, TemplateText: '<h1>Header</h1>' }],
                GetContentByType: vi.fn().mockReturnValue([
                    { Type: 'HTML', Priority: 1, TemplateText: '<h1>Header</h1>' },
                ]),
                GetHighestPriorityContent: vi.fn().mockReturnValue(
                    { Type: 'HTML', Priority: 1, TemplateText: '<h1>Header</h1>' }
                ),
            };
            mockFindTemplate.mockReturnValue(targetTemplate);
            mockRenderTemplateSimple.mockResolvedValue({
                Success: true,
                Output: '<h1>Header</h1>',
            });

            const context = { ctx: {} };
            const body = 'HeaderTemplate';
            const callback = vi.fn();

            extension.run(context, body, callback);

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(callback).toHaveBeenCalledWith(null, '<h1>Header</h1>');
        });

        it('should initialize render context if not present', async () => {
            const targetTemplate = {
                Name: 'TestTemplate',
                Content: [{ Type: 'Text', Priority: 1, TemplateText: 'text' }],
                GetContentByType: vi.fn().mockReturnValue([
                    { Type: 'Text', Priority: 1, TemplateText: 'text' },
                ]),
                GetHighestPriorityContent: vi.fn().mockReturnValue(
                    { Type: 'Text', Priority: 1, TemplateText: 'text' }
                ),
            };
            mockFindTemplate.mockReturnValue(targetTemplate);
            mockRenderTemplateSimple.mockResolvedValue({ Success: true, Output: 'text' });

            const context = { ctx: {} };
            const body = 'TestTemplate';
            const callback = vi.fn();

            extension.run(context, body, callback);

            // Verify context was initialized
            expect(context.ctx).toHaveProperty('_mjRenderContext');
        });

        it('should pop template from stack after successful render', async () => {
            const targetTemplate = {
                Name: 'PopTest',
                Content: [{ Type: 'HTML', Priority: 1, TemplateText: 'test' }],
                GetContentByType: vi.fn().mockReturnValue([
                    { Type: 'HTML', Priority: 1, TemplateText: 'test' },
                ]),
                GetHighestPriorityContent: vi.fn().mockReturnValue(
                    { Type: 'HTML', Priority: 1, TemplateText: 'test' }
                ),
            };
            mockFindTemplate.mockReturnValue(targetTemplate);
            mockRenderTemplateSimple.mockResolvedValue({ Success: true, Output: 'test' });

            const renderContext = {
                templateStack: [],
                currentContentType: 'HTML',
            };
            const context = { ctx: { _mjRenderContext: renderContext } };
            const callback = vi.fn();

            extension.run(context, 'PopTest', callback);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(renderContext.templateStack).toEqual([]);
        });

        it('should pop template from stack on render failure', async () => {
            const targetTemplate = {
                Name: 'FailTest',
                Content: [{ Type: 'HTML', Priority: 1, TemplateText: 'test' }],
                GetContentByType: vi.fn().mockReturnValue([
                    { Type: 'HTML', Priority: 1, TemplateText: 'test' },
                ]),
                GetHighestPriorityContent: vi.fn().mockReturnValue(
                    { Type: 'HTML', Priority: 1, TemplateText: 'test' }
                ),
            };
            mockFindTemplate.mockReturnValue(targetTemplate);
            mockRenderTemplateSimple.mockResolvedValue({
                Success: false,
                Message: 'Render failed',
            });

            const renderContext = {
                templateStack: [],
                currentContentType: 'HTML',
            };
            const context = { ctx: { _mjRenderContext: renderContext } };
            const callback = vi.fn();

            extension.run(context, 'FailTest', callback);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(renderContext.templateStack).toEqual([]);
            expect(callback).toHaveBeenCalledWith(expect.any(Error));
        });

        it('should parse template with type parameter', async () => {
            const targetTemplate = {
                Name: 'TypedTemplate',
                Content: [
                    { Type: 'HTML', Priority: 1, TemplateText: '<b>HTML</b>' },
                    { Type: 'Text', Priority: 1, TemplateText: 'Text version' },
                ],
                GetContentByType: vi.fn().mockImplementation((type: string) => {
                    return targetTemplate.Content.filter(c => c.Type === type);
                }),
                GetHighestPriorityContent: vi.fn().mockReturnValue(
                    { Type: 'HTML', Priority: 1, TemplateText: '<b>HTML</b>' }
                ),
            };
            mockFindTemplate.mockReturnValue(targetTemplate);
            mockRenderTemplateSimple.mockResolvedValue({ Success: true, Output: 'Text version' });

            const context = { ctx: {} };
            const body = 'TypedTemplate,type=Text';
            const callback = vi.fn();

            extension.run(context, body, callback);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(callback).toHaveBeenCalledWith(null, 'Text version');
        });
    });

    describe('resolveContentType (via run)', () => {
        it('should fall back to highest priority content when no type match', async () => {
            const targetTemplate = {
                Name: 'FallbackTest',
                Content: [{ Type: 'Special', Priority: 1, TemplateText: 'special' }],
                GetContentByType: vi.fn().mockReturnValue([]),
                GetHighestPriorityContent: vi.fn().mockReturnValue(
                    { Type: 'Special', Priority: 1, TemplateText: 'special' }
                ),
            };
            mockFindTemplate.mockReturnValue(targetTemplate);
            mockRenderTemplateSimple.mockResolvedValue({ Success: true, Output: 'special' });

            const renderContext = { templateStack: [], currentContentType: 'NonExistent' };
            const context = { ctx: { _mjRenderContext: renderContext } };
            const callback = vi.fn();

            extension.run(context, 'FallbackTest', callback);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(callback).toHaveBeenCalledWith(null, 'special');
        });
    });
});
