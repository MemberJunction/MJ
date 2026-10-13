import { describe, it, expect } from 'vitest';
import {
    ChatParams,
    ChatResult,
    ChatMessageRole,
    GetUserMessageFromChatParams,
    GetSystemPromptFromChatParams,
    SerializeMessageContent,
    DeserializeMessageContent,
    HasImageContent,
    GetTextFromContent,
    ParseBase64DataUrl,
    CreateBase64DataUrl,
    CONTENT_BLOCKS_PREFIX,
    ChatMessageContentBlock,
    ChatMessage,
    ToClassicChatMessageRole,
    CreateToolResultMessage,
    GetToolResultBlocks,
    ValidateToolConversation
} from '../generic/chat.types';

describe('ChatMessageRole', () => {
    it('should have system, user, and assistant roles', () => {
        expect(ChatMessageRole.system).toBe('system');
        expect(ChatMessageRole.user).toBe('user');
        expect(ChatMessageRole.assistant).toBe('assistant');
    });
});

describe('ChatParams', () => {
    it('should default messages to empty array', () => {
        const params = new ChatParams();
        expect(params.messages).toEqual([]);
    });

    it('should default streaming to false', () => {
        const params = new ChatParams();
        expect(params.streaming).toBe(false);
    });

    it('should default enableCaching to true', () => {
        const params = new ChatParams();
        expect(params.enableCaching).toBe(true);
    });

    it('should default includeLogProbs to false', () => {
        const params = new ChatParams();
        expect(params.includeLogProbs).toBe(false);
    });

    it('should allow setting all sampling parameters', () => {
        const params = new ChatParams();
        params.topP = 0.9;
        params.topK = 50;
        params.minP = 0.05;
        params.frequencyPenalty = 0.5;
        params.presencePenalty = 0.3;

        expect(params.topP).toBe(0.9);
        expect(params.topK).toBe(50);
        expect(params.minP).toBe(0.05);
        expect(params.frequencyPenalty).toBe(0.5);
        expect(params.presencePenalty).toBe(0.3);
    });
});

describe('ChatResult', () => {
    it('should extend BaseResult', () => {
        const result = new ChatResult(true, new Date(), new Date());
        expect(result.success).toBe(true);
    });

    it('should allow setting data and statusText', () => {
        const result = new ChatResult(true, new Date(), new Date());
        result.statusText = 'ok';
        result.data = {
            choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop', index: 0 }],
        };

        expect(result.statusText).toBe('ok');
        expect(result.data.choices[0].message.content).toBe('Hello');
    });
});

describe('GetUserMessageFromChatParams', () => {
    it('should return first user message content', () => {
        const params = new ChatParams();
        params.messages = [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello there' }
        ];

        expect(GetUserMessageFromChatParams(params)).toBe('Hello there');
    });

    it('should return undefined when no user message exists', () => {
        const params = new ChatParams();
        params.messages = [{ role: 'system', content: 'You are helpful' }];

        expect(GetUserMessageFromChatParams(params)).toBeUndefined();
    });
});

describe('GetSystemPromptFromChatParams', () => {
    it('should return first system message content', () => {
        const params = new ChatParams();
        params.messages = [
            { role: 'system', content: 'Be concise' },
            { role: 'user', content: 'Hi' }
        ];

        expect(GetSystemPromptFromChatParams(params)).toBe('Be concise');
    });

    it('should return undefined when no system message exists', () => {
        const params = new ChatParams();
        params.messages = [{ role: 'user', content: 'Hi' }];

        expect(GetSystemPromptFromChatParams(params)).toBeUndefined();
    });
});

describe('serializeMessageContent', () => {
    it('should pass through plain strings', () => {
        expect(SerializeMessageContent('Hello world')).toBe('Hello world');
    });

    it('should serialize content blocks with prefix', () => {
        const blocks = [
            { type: 'text' as const, content: 'Hello' },
            { type: 'image_url' as const, content: 'data:image/png;base64,abc123' }
        ];

        const serialized = SerializeMessageContent(blocks);
        expect(serialized.startsWith(CONTENT_BLOCKS_PREFIX)).toBe(true);
    });
});

describe('deserializeMessageContent', () => {
    it('should return plain strings as-is', () => {
        expect(DeserializeMessageContent('Hello world')).toBe('Hello world');
    });

    it('should deserialize content blocks', () => {
        const blocks = [{ type: 'text', content: 'Hello' }];
        const serialized = CONTENT_BLOCKS_PREFIX + JSON.stringify(blocks);

        const result = DeserializeMessageContent(serialized);
        expect(Array.isArray(result)).toBe(true);
        expect((result as Array<{ type: string; content: string }>)[0].content).toBe('Hello');
    });

    it('should handle empty string', () => {
        expect(DeserializeMessageContent('')).toBe('');
    });

    it('should handle malformed prefix content gracefully', () => {
        const result = DeserializeMessageContent(CONTENT_BLOCKS_PREFIX + 'not json');
        expect(typeof result).toBe('string');
    });
});

describe('hasImageContent', () => {
    it('should return false for string content', () => {
        expect(HasImageContent('just text')).toBe(false);
    });

    it('should return true when image_url block exists', () => {
        const blocks = [
            { type: 'text' as const, content: 'text' },
            { type: 'image_url' as const, content: 'data:image/png;base64,abc' }
        ];
        expect(HasImageContent(blocks)).toBe(true);
    });

    it('should return false when no image_url block exists', () => {
        const blocks = [{ type: 'text' as const, content: 'text only' }];
        expect(HasImageContent(blocks)).toBe(false);
    });
});

describe('getTextFromContent', () => {
    it('should return string content directly', () => {
        expect(GetTextFromContent('Hello')).toBe('Hello');
    });

    it('should extract text blocks only', () => {
        const blocks = [
            { type: 'text' as const, content: 'Hello' },
            { type: 'image_url' as const, content: 'data:...' },
            { type: 'text' as const, content: 'World' }
        ];
        expect(GetTextFromContent(blocks)).toBe('Hello\nWorld');
    });

    it('should return empty string when no text blocks exist', () => {
        const blocks = [{ type: 'image_url' as const, content: 'data:...' }];
        expect(GetTextFromContent(blocks)).toBe('');
    });
});

describe('parseBase64DataUrl', () => {
    it('should parse valid data URL', () => {
        const result = ParseBase64DataUrl('data:image/png;base64,iVBORw0KGgo=');

        expect(result).toEqual({
            mediaType: 'image/png',
            data: 'iVBORw0KGgo='
        });
    });

    it('should return null for non-data URL', () => {
        expect(ParseBase64DataUrl('https://example.com/image.png')).toBeNull();
    });

    it('should return null for malformed data URL', () => {
        expect(ParseBase64DataUrl('data:invalid')).toBeNull();
    });
});

describe('createBase64DataUrl', () => {
    it('should create valid data URL', () => {
        const result = CreateBase64DataUrl('abc123', 'image/jpeg');

        expect(result).toBe('data:image/jpeg;base64,abc123');
    });
});

// =============================================================================
// Native tool calling — the provider-neutral surface (implementation plan §5)
// =============================================================================

describe('ChatMessageRole.tool', () => {
    it('exposes a tool role for carrying tool results', () => {
        expect(ChatMessageRole.tool).toBe('tool');
    });
});

describe('toClassicChatMessageRole', () => {
    it('collapses tool onto user, the role a tool result reads as without tool support', () => {
        expect(ToClassicChatMessageRole(ChatMessageRole.tool)).toBe('user');
    });

    it('leaves the three classic roles untouched', () => {
        expect(ToClassicChatMessageRole(ChatMessageRole.system)).toBe('system');
        expect(ToClassicChatMessageRole(ChatMessageRole.user)).toBe('user');
        expect(ToClassicChatMessageRole(ChatMessageRole.assistant)).toBe('assistant');
    });
});

describe('createToolResultMessage', () => {
    it('builds a single tool turn carrying every result, as providers require', () => {
        const message = CreateToolResultMessage([
            { toolCallId: 'call_1', toolName: 'get_weather', content: '72F' },
            { toolCallId: 'call_2', toolName: 'get_time', content: '10:30' }
        ]);

        expect(message.role).toBe('tool');
        expect(Array.isArray(message.content)).toBe(true);
        const blocks = message.content as ChatMessageContentBlock[];
        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ type: 'tool_result', toolCallId: 'call_1', toolName: 'get_weather', content: '72F' });
        expect(blocks[1]).toMatchObject({ type: 'tool_result', toolCallId: 'call_2', content: '10:30' });
    });

    it('carries the error flag through so failures stay distinguishable from results', () => {
        const message = CreateToolResultMessage([
            { toolCallId: 'call_1', content: 'boom', isError: true }
        ]);
        expect((message.content as ChatMessageContentBlock[])[0].isError).toBe(true);
    });
});

describe('getToolResultBlocks', () => {
    it('returns only the tool_result blocks', () => {
        const blocks = GetToolResultBlocks([
            { type: 'text', content: 'hello' },
            { type: 'tool_result', content: 'result', toolCallId: 'call_1' }
        ]);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].toolCallId).toBe('call_1');
    });

    it('returns an empty array for plain-string content', () => {
        expect(GetToolResultBlocks('just text')).toEqual([]);
    });
});

describe('getTextFromContent with tool results', () => {
    it('ignores tool_result blocks — they are not prose', () => {
        const text = GetTextFromContent([
            { type: 'text', content: 'hello' },
            { type: 'tool_result', content: 'raw tool payload', toolCallId: 'call_1' }
        ]);
        expect(text).toBe('hello');
    });
});

describe('tool_result content-block serialization', () => {
    it('round-trips a tool turn through storage so tool history survives message logs', () => {
        const original = CreateToolResultMessage([
            { toolCallId: 'call_1', toolName: 'get_weather', content: '72F', isError: false }
        ]);

        const restored = DeserializeMessageContent(SerializeMessageContent(original.content));

        expect(restored).toEqual(original.content);
    });
});

describe('ChatParams tool fields', () => {
    it('leaves every tool field undefined by default, so existing calls are unchanged', () => {
        const params = new ChatParams();
        expect(params.tools).toBeUndefined();
        expect(params.toolChoice).toBeUndefined();
        expect(params.parallelToolCalls).toBeUndefined();
    });

    it('accepts declarations, a named choice, and a parallelism flag', () => {
        const params = new ChatParams();
        params.tools = [{ name: 'get_weather', description: 'Call this when asked about weather.', inputSchema: { type: 'object', properties: {} } }];
        params.toolChoice = { name: 'get_weather' };
        params.parallelToolCalls = false;

        expect(params.tools[0].name).toBe('get_weather');
        expect(params.toolChoice).toEqual({ name: 'get_weather' });
        expect(params.parallelToolCalls).toBe(false);
    });
});

describe('validateToolConversation', () => {
    const assistantWithCall = (id: string): ChatMessage => ({
        role: ChatMessageRole.assistant,
        content: '',
        toolCalls: [{ id, name: 'get_weather', arguments: {} }]
    });

    it('accepts a well-formed call/result exchange', () => {
        expect(() => ValidateToolConversation([
            { role: ChatMessageRole.user, content: 'weather?' },
            assistantWithCall('call_1'),
            CreateToolResultMessage([{ toolCallId: 'call_1', content: '72F' }])
        ])).not.toThrow();
    });

    it('rejects a result whose call was never declared, naming the id', () => {
        expect(() => ValidateToolConversation([
            { role: ChatMessageRole.user, content: 'weather?' },
            // The caller forgot to copy toolCalls onto the assistant turn — the exact mistake.
            { role: ChatMessageRole.assistant, content: '' },
            CreateToolResultMessage([{ toolCallId: 'call_1', content: '72F' }])
        ])).toThrow(/call_1/);
    });

    it('rejects a result that arrives BEFORE the call declaring it', () => {
        expect(() => ValidateToolConversation([
            CreateToolResultMessage([{ toolCallId: 'call_1', content: '72F' }]),
            assistantWithCall('call_1')
        ])).toThrow(/call_1/);
    });

    it('rejects a tool_result block with no toolCallId at all', () => {
        expect(() => ValidateToolConversation([
            assistantWithCall('call_1'),
            { role: ChatMessageRole.tool, content: [{ type: 'tool_result', content: '72F' }] }
        ])).toThrow(/missing toolCallId/);
    });

    it('accepts several results answering several calls from one turn', () => {
        expect(() => ValidateToolConversation([
            {
                role: ChatMessageRole.assistant,
                content: '',
                toolCalls: [
                    { id: 'call_1', name: 'get_weather', arguments: {} },
                    { id: 'call_2', name: 'get_time', arguments: {} }
                ]
            },
            CreateToolResultMessage([
                { toolCallId: 'call_1', content: '72F' },
                { toolCallId: 'call_2', content: '10:30' }
            ])
        ])).not.toThrow();
    });

    it('reports every orphan, not just the first', () => {
        expect(() => ValidateToolConversation([
            { role: ChatMessageRole.assistant, content: '' },
            CreateToolResultMessage([
                { toolCallId: 'call_1', content: 'a' },
                { toolCallId: 'call_2', content: 'b' }
            ])
        ])).toThrow(/call_1, call_2/);
    });

    it('leaves a conversation with no tool turns alone', () => {
        expect(() => ValidateToolConversation([
            { role: ChatMessageRole.user, content: 'hello' },
            { role: ChatMessageRole.assistant, content: 'hi' }
        ])).not.toThrow();
    });
});
