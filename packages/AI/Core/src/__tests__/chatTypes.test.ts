import { describe, it, expect } from 'vitest';
import {
    ChatParams,
    ChatResult,
    ChatMessageRole,
    GetUserMessageFromChatParams,
    GetSystemPromptFromChatParams,
    serializeMessageContent,
    deserializeMessageContent,
    hasImageContent,
    getTextFromContent,
    parseBase64DataUrl,
    createBase64DataUrl,
    CONTENT_BLOCKS_PREFIX
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
        expect(serializeMessageContent('Hello world')).toBe('Hello world');
    });

    it('should serialize content blocks with prefix', () => {
        const blocks = [
            { type: 'text' as const, content: 'Hello' },
            { type: 'image_url' as const, content: 'data:image/png;base64,abc123' }
        ];

        const serialized = serializeMessageContent(blocks);
        expect(serialized.startsWith(CONTENT_BLOCKS_PREFIX)).toBe(true);
    });
});

describe('deserializeMessageContent', () => {
    it('should return plain strings as-is', () => {
        expect(deserializeMessageContent('Hello world')).toBe('Hello world');
    });

    it('should deserialize content blocks', () => {
        const blocks = [{ type: 'text', content: 'Hello' }];
        const serialized = CONTENT_BLOCKS_PREFIX + JSON.stringify(blocks);

        const result = deserializeMessageContent(serialized);
        expect(Array.isArray(result)).toBe(true);
        expect((result as Array<{ type: string; content: string }>)[0].content).toBe('Hello');
    });

    it('should handle empty string', () => {
        expect(deserializeMessageContent('')).toBe('');
    });

    it('should handle malformed prefix content gracefully', () => {
        const result = deserializeMessageContent(CONTENT_BLOCKS_PREFIX + 'not json');
        expect(typeof result).toBe('string');
    });
});

describe('hasImageContent', () => {
    it('should return false for string content', () => {
        expect(hasImageContent('just text')).toBe(false);
    });

    it('should return true when image_url block exists', () => {
        const blocks = [
            { type: 'text' as const, content: 'text' },
            { type: 'image_url' as const, content: 'data:image/png;base64,abc' }
        ];
        expect(hasImageContent(blocks)).toBe(true);
    });

    it('should return false when no image_url block exists', () => {
        const blocks = [{ type: 'text' as const, content: 'text only' }];
        expect(hasImageContent(blocks)).toBe(false);
    });
});

describe('getTextFromContent', () => {
    it('should return string content directly', () => {
        expect(getTextFromContent('Hello')).toBe('Hello');
    });

    it('should extract text blocks only', () => {
        const blocks = [
            { type: 'text' as const, content: 'Hello' },
            { type: 'image_url' as const, content: 'data:...' },
            { type: 'text' as const, content: 'World' }
        ];
        expect(getTextFromContent(blocks)).toBe('Hello\nWorld');
    });

    it('should return empty string when no text blocks exist', () => {
        const blocks = [{ type: 'image_url' as const, content: 'data:...' }];
        expect(getTextFromContent(blocks)).toBe('');
    });
});

describe('parseBase64DataUrl', () => {
    it('should parse valid data URL', () => {
        const result = parseBase64DataUrl('data:image/png;base64,iVBORw0KGgo=');

        expect(result).toEqual({
            mediaType: 'image/png',
            data: 'iVBORw0KGgo='
        });
    });

    it('should return null for non-data URL', () => {
        expect(parseBase64DataUrl('https://example.com/image.png')).toBeNull();
    });

    it('should return null for malformed data URL', () => {
        expect(parseBase64DataUrl('data:invalid')).toBeNull();
    });
});

describe('createBase64DataUrl', () => {
    it('should create valid data URL', () => {
        const result = createBase64DataUrl('abc123', 'image/jpeg');

        expect(result).toBe('data:image/jpeg;base64,abc123');
    });
});
