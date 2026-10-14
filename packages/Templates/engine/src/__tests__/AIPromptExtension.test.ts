import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    UserInfo: class {},
    EntityInfo: class {},
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: vi.fn(),
            },
        },
    },
    RegisterClass: () => (target: Function) => target,
    SafeJSONParse: vi.fn((s: string) => { try { return JSON.parse(s); } catch { return null; } }),
}));

vi.mock('@memberjunction/aiengine', () => {
    const mockModels: Array<Record<string, unknown>> = [];
    return {
        AIEngine: {
            Instance: {
                Config: vi.fn().mockResolvedValue(undefined),
                Models: mockModels,
                GetHighestPowerModel: vi.fn().mockResolvedValue(null),
            },
        },
    };
});

vi.mock('@memberjunction/ai', () => ({
    BaseLLM: class {
        ChatCompletion = vi.fn();
    },
    GetAIAPIKey: vi.fn().mockReturnValue('test-api-key'),
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIModelEntityExtended: class {
        Name = '';
        APIName = '';
        DriverClass = '';
        APINameOrName = '';
        PowerRank = 0;
        Vendor = '';
        AIModelType = '';
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTemplateContentEntity: class {},
    MJTemplateEntityExtended: class {},
}));

import { AIPromptExtension, AIPromptConfig } from '../extensions/AIPrompt.extension';
import { AIEngine } from '@memberjunction/aiengine';
import { MJGlobal } from '@memberjunction/global';
import { LogError, UserInfo, EntityInfo } from '@memberjunction/core';
import { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import type { NunjucksCallback } from '../extensions/TemplateExtensionBase';

/** A model row for the mocked AI engine: an entity instance (the entity class is mocked) carrying the given fields. */
const aiModel = (fields: Record<string, string | number>): MJAIModelEntityExtended => Object.assign(new MJAIModelEntityExtended(new EntityInfo()), fields);

/** Exposes the extension's protected members to the tests. */
class ExposedAIPromptExtension extends AIPromptExtension {
    public get VendorName(): string { return this.DefaultAIVendorName; }
    public FindModel(vendorName: string, contextUser: UserInfo): Promise<MJAIModelEntityExtended> { return this.GetAIModel(vendorName, contextUser); }
}

describe('AIPromptExtension', () => {
    let extension: ExposedAIPromptExtension;
    const contextUser = Object.assign(new UserInfo(), { ID: 'user-1', Name: 'Test' });

    beforeEach(() => {
        vi.clearAllMocks();
        extension = new ExposedAIPromptExtension(contextUser);
    });

    describe('constructor', () => {
        it('should set tags to ["AIPrompt"]', () => {
            expect(extension.tags).toEqual(['AIPrompt']);
        });

        it('should set context user', () => {
            expect(extension.ContextUser).toBe(contextUser);
        });
    });

    describe('parse', () => {
        it('should parse the tag and return CallExtensionAsync node', () => {
            const tok = { value: 'AIPrompt' };
            const parsedParams = {};
            const bodyContent = {};
            const callExtNode = { type: 'CallExtensionAsync' };

            const parser = {
                nextToken: vi.fn().mockReturnValue(tok),
                parseSignature: vi.fn().mockReturnValue(parsedParams),
                advanceAfterBlockEnd: vi.fn(),
                parseUntilBlocks: vi.fn().mockReturnValue(bodyContent),
                skipSymbol: vi.fn().mockReturnValue(false),
                skip: vi.fn(),
            };
            const nodes = {
                CallExtensionAsync: vi.fn(function () { return callExtNode; }),
            };
            const lexer = {
                TOKEN_BLOCK_END: 'end',
            };

            const result = extension.parse(parser, nodes, lexer);

            expect(parser.nextToken).toHaveBeenCalled();
            expect(parser.parseSignature).toHaveBeenCalledWith(null, true);
            expect(parser.advanceAfterBlockEnd).toHaveBeenCalledWith('AIPrompt');
            expect(parser.parseUntilBlocks).toHaveBeenCalledWith('error', 'endAIPrompt');
            expect(nodes.CallExtensionAsync).toHaveBeenCalledWith(
                extension, 'run', parsedParams, [bodyContent]
            );
            expect(result).toBe(callExtNode);
        });

        it('should handle error block when present', () => {
            const tok = { value: 'AIPrompt' };
            const parser = {
                nextToken: vi.fn().mockReturnValue(tok),
                parseSignature: vi.fn().mockReturnValue({}),
                advanceAfterBlockEnd: vi.fn(),
                parseUntilBlocks: vi.fn().mockReturnValue({}),
                skipSymbol: vi.fn().mockReturnValue(true), // has error block
                skip: vi.fn(),
            };
            const nodes = {
                CallExtensionAsync: vi.fn(function () { return {}; }),
            };
            const lexer = { TOKEN_BLOCK_END: 'end' };

            extension.parse(parser, nodes, lexer);

            expect(parser.skipSymbol).toHaveBeenCalledWith('error');
            expect(parser.skip).toHaveBeenCalledWith('end');
            // parseUntilBlocks called twice: once for body, once for error
            expect(parser.parseUntilBlocks).toHaveBeenCalledTimes(2);
        });
    });

    describe('run', () => {
        it('should process AI prompt with specified model', async () => {
            const mockLLM = {
                ChatCompletion: vi.fn().mockResolvedValue({
                    success: true,
                    data: {
                        choices: [{ message: { content: 'AI response' } }],
                    },
                }),
            };

            vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue(mockLLM);

            // Set up a model in AIEngine
            const testModel = aiModel({
                Name: 'gpt-4',
                APIName: 'gpt-4',
                DriverClass: 'OpenAILLM',
                APINameOrName: 'gpt-4',
            });
            AIEngine.Instance.Models.length = 0;
            AIEngine.Instance.Models.push(testModel);

            const context = {};
            const params = { AIModel: 'gpt-4', AllowFormatting: false };
            const body = () => 'Generate a greeting for Alice';
            const callback = vi.fn();

            extension.run(context, params, body, callback);

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(callback).toHaveBeenCalledWith(null, 'AI response');
            expect(mockLLM.ChatCompletion).toHaveBeenCalled();
        });

        it('should call callback with error when specified model is not found', async () => {
            AIEngine.Instance.Models.length = 0;

            const context = {};
            const params = { AIModel: 'nonexistent-model' };
            const body = () => 'Some prompt';
            const callback = vi.fn();

            extension.run(context, params, body, callback);

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(callback).toHaveBeenCalled();
            expect(LogError).toHaveBeenCalled();
        });

        it('should use highest power model when AIModel not specified', async () => {
            const fallbackModel = aiModel({
                Name: 'Groq-LLaMA',
                APIName: 'llama-3.1',
                DriverClass: 'GroqLLM',
                APINameOrName: 'llama-3.1',
            });

            vi.mocked(AIEngine.Instance.GetHighestPowerModel).mockResolvedValue(fallbackModel);

            const mockLLM = {
                ChatCompletion: vi.fn().mockResolvedValue({
                    success: true,
                    data: {
                        choices: [{ message: { content: 'Groq response' } }],
                    },
                }),
            };
            vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue(mockLLM);

            const context = {};
            const params = {}; // No AIModel specified
            const body = () => 'Generate text';
            const callback = vi.fn();

            extension.run(context, params, body, callback);

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(AIEngine.Instance.GetHighestPowerModel).toHaveBeenCalledWith(
                'Groq', 'llm', contextUser
            );
            expect(callback).toHaveBeenCalledWith(null, 'Groq response');
        });

        it('should parse AllowFormatting from string', async () => {
            const mockLLM = {
                ChatCompletion: vi.fn().mockResolvedValue({
                    success: true,
                    data: {
                        choices: [{ message: { content: 'Response' } }],
                    },
                }),
            };
            vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue(mockLLM);

            const testModel = aiModel({
                Name: 'test-model',
                APIName: 'test-model',
                DriverClass: 'TestLLM',
                APINameOrName: 'test-model',
            });
            AIEngine.Instance.Models.length = 0;
            AIEngine.Instance.Models.push(testModel);

            const context = {};
            const params = { AIModel: 'test-model', AllowFormatting: 'true' };
            const body = () => 'Prompt';
            const callback = vi.fn();

            extension.run(context, params, body, callback);

            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify the system prompt does NOT include formatting restriction
            const chatCall = mockLLM.ChatCompletion.mock.calls[0][0];
            const systemMessage = chatCall.messages[0].content;
            expect(systemMessage).not.toContain('Do not use markdown');
        });

        it('should include formatting restriction when AllowFormatting is false', async () => {
            const mockLLM = {
                ChatCompletion: vi.fn().mockResolvedValue({
                    success: true,
                    data: {
                        choices: [{ message: { content: 'Response' } }],
                    },
                }),
            };
            vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue(mockLLM);

            const testModel = aiModel({
                Name: 'test-model',
                APIName: 'test',
                DriverClass: 'TestLLM',
                APINameOrName: 'test',
            });
            AIEngine.Instance.Models.length = 0;
            AIEngine.Instance.Models.push(testModel);

            const context = {};
            const params = { aimodel: 'test-model', allowformatting: 'false' };
            const body = () => 'Prompt';
            const callback = vi.fn();

            extension.run(context, params, body, callback);

            await new Promise(resolve => setTimeout(resolve, 100));

            const chatCall = mockLLM.ChatCompletion.mock.calls[0][0];
            const systemMessage = chatCall.messages[0].content;
            expect(systemMessage).toContain('Do not use markdown');
        });

        it('should unescape HTML entities in AI response', async () => {
            const mockLLM = {
                ChatCompletion: vi.fn().mockResolvedValue({
                    success: true,
                    data: {
                        choices: [{ message: { content: '&lt;b&gt;Bold&lt;/b&gt; &amp; more' } }],
                    },
                }),
            };
            vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue(mockLLM);

            const testModel = aiModel({
                Name: 'test-model',
                APIName: 'test',
                DriverClass: 'TestLLM',
                APINameOrName: 'test',
            });
            AIEngine.Instance.Models.length = 0;
            AIEngine.Instance.Models.push(testModel);

            const context = {};
            const params = { AIModel: 'test-model' };
            const body = () => 'Prompt';
            const callback = vi.fn();

            extension.run(context, params, body, callback);

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(callback).toHaveBeenCalledWith(null, '<b>Bold</b> & more');
        });

        it('should handle case-insensitive parameter keys', async () => {
            const mockLLM = {
                ChatCompletion: vi.fn().mockResolvedValue({
                    success: true,
                    data: { choices: [{ message: { content: 'ok' } }] },
                }),
            };
            vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue(mockLLM);

            const testModel = aiModel({
                Name: 'mymodel',
                APIName: 'mymodel',
                DriverClass: 'TestLLM',
                APINameOrName: 'mymodel',
            });
            AIEngine.Instance.Models.length = 0;
            AIEngine.Instance.Models.push(testModel);

            const context = {};
            // Using mixed case with spaces in key names
            const params = { 'AI Model': 'mymodel', 'Allow Formatting': 'yes' };
            const body = () => 'Prompt';
            const callback = vi.fn();

            extension.run(context, params, body, callback);

            await new Promise(resolve => setTimeout(resolve, 100));

            expect(callback).toHaveBeenCalledWith(null, 'ok');
        });
    });

    describe('DefaultAIVendorName', () => {
        it('should return OpenAI', () => {
            const name = extension.VendorName;
            expect(name).toBe('OpenAI');
        });
    });

    describe('GetAIModel', () => {
        it('should filter models by vendor and type, sorted by PowerRank', async () => {
            const models = [
                { AIModelType: 'llm', Vendor: 'OpenAI', PowerRank: 50, Name: 'model-A' },
                { AIModelType: 'llm', Vendor: 'OpenAI', PowerRank: 100, Name: 'model-B' },
                { AIModelType: 'embedding', Vendor: 'OpenAI', PowerRank: 200, Name: 'model-C' },
            ];

            AIEngine.Instance.Models.length = 0;
            AIEngine.Instance.Models.push(...models.map(aiModel));

            const result = await extension.FindModel('OpenAI', contextUser);

            expect(result).toBeDefined();
            expect(result.Name).toBe('model-B'); // Highest PowerRank among LLMs
        });
    });
});

describe('AIPromptConfig', () => {
    it('should accept valid config object', () => {
        const config: AIPromptConfig = {
            AIModel: 'gpt-4',
            AllowFormatting: true,
        };

        expect(config.AIModel).toBe('gpt-4');
        expect(config.AllowFormatting).toBe(true);
    });

    it('should allow empty config', () => {
        const config: AIPromptConfig = {};
        expect(config.AIModel).toBeUndefined();
        expect(config.AllowFormatting).toBeUndefined();
    });
});

describe('AIPromptExtension failures always answer the render callback', () => {
    /** What the render callback received, or 'hung' when it was not called within the wait. */
    type CallbackOutcome = { Error: Error | null; Result: string | Error } | 'hung';

    /** Runs the extension and waits up to one second for its callback: a render waits on it forever otherwise. */
    const runAndAwaitCallback = (extension: AIPromptExtension): Promise<CallbackOutcome> =>
        new Promise((resolve) => {
            const timer = setTimeout(() => resolve('hung'), 1000);
            const callBack: NunjucksCallback = (err, result) => { clearTimeout(timer); resolve({ Error: err, Result: result }); };
            extension.run({}, {}, () => 'Write a greeting', callBack);
        });
    const model = (): MJAIModelEntityExtended => aiModel({ Name: 'Test Model', DriverClass: 'TestLLM', APINameOrName: 'test-model' });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(AIEngine.Instance.Config).mockResolvedValue(undefined);
        vi.mocked(AIEngine.Instance.GetHighestPowerModel).mockResolvedValue(model());
    });

    it('a failed ChatResult reaches the callback as an error naming the model and the vendor message, and is logged', async () => {
        vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue({ ChatCompletion: async () => ({ success: false, errorMessage: 'vendor refused the call' }) });
        const outcome = await runAndAwaitCallback(new AIPromptExtension(Object.assign(new UserInfo(), { ID: 'u', Name: 'User' })));
        expect(outcome).not.toBe('hung');
        if (outcome !== 'hung') {
            expect(outcome.Result).toBeInstanceOf(Error);
            expect(String(outcome.Result)).toContain("'Test Model'");
            expect(String(outcome.Result)).toContain('vendor refused the call');
        }
        expect(LogError).toHaveBeenCalledTimes(1);
    });

    it('a failed AI engine load reaches the callback too', async () => {
        vi.mocked(AIEngine.Instance.Config).mockRejectedValue(new Error('engine load failed'));
        const outcome = await runAndAwaitCallback(new AIPromptExtension(Object.assign(new UserInfo(), { ID: 'u', Name: 'User' })));
        expect(outcome).not.toBe('hung');
        if (outcome !== 'hung') {
            expect(String(outcome.Result)).toContain('engine load failed');
        }
    });

    it('a successful result still reaches the callback once, with the response', async () => {
        vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockReturnValue({ ChatCompletion: async () => ({ success: true, data: { choices: [{ message: { content: 'Hello &amp; welcome' } }] } }) });
        const outcome = await runAndAwaitCallback(new AIPromptExtension(Object.assign(new UserInfo(), { ID: 'u', Name: 'User' })));
        expect(outcome).toEqual({ Error: null, Result: 'Hello & welcome' });
    });
});
