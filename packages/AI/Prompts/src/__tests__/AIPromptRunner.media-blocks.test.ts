/**
 * Media content blocks in AIPromptRunner: native file injection keeps the blocks a message
 * already has and adds each file once, and modality stripping changes copies of messages,
 * never the caller's objects.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import { ChatMessageRole, ChatParams, type ChatMessage, type FileCapabilities } from '@memberjunction/ai';

/** The two private methods under test, reached through a narrowing type. */
type Runner = {
    injectNativeFileInputs(params: { nativeFileInputs?: unknown[] }, llm: unknown, chatParams: ChatParams, verbose: boolean): void;
    stripUnsupportedMediaBlocks(llm: unknown, chatParams: ChatParams, model: unknown, verbose: boolean, params: unknown): void;
};

const imageCaps: FileCapabilities = { SupportedMimeTypes: ['image/jpeg', 'image/png'], MaxFileSize: 1e9, MaxFilesPerRequest: 10, HasFileAPI: false };
const imageLlm = { GetFileCapabilities: (): FileCapabilities | null => imageCaps };
const textLlm = { GetFileCapabilities: (): FileCapabilities | null => null };

function blockMessage(): ChatMessage {
    return {
        role: 'user',
        content: [
            { type: 'image_url', content: 'data:image/jpeg;base64,AAAA', mimeType: 'image/jpeg' },
            { type: 'text', content: 'Client tool results:' },
        ],
    };
}

function chatParamsWith(...messages: ChatMessage[]): ChatParams {
    const chatParams = new ChatParams();
    chatParams.messages = messages;
    return chatParams;
}

describe('AIPromptRunner media blocks', () => {
    beforeEach(() => {
        // The runner logs each attachment and modality note to the console; keep test output clean.
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    it('injectNativeFileInputs keeps the existing blocks of the last user message', () => {
        const runner = new AIPromptRunner() as unknown as Runner;
        const chatParams = chatParamsWith(blockMessage());
        runner.injectNativeFileInputs(
            { nativeFileInputs: [{ Name: 'a.png', MimeType: 'image/png', SizeBytes: 10, Base64Content: 'BBBB' }] },
            imageLlm, chatParams, false,
        );
        const blocks = chatParams.messages[0].content as Array<{ type: string; content: string }>;
        expect(blocks.map(b => b.type)).toEqual(['file_url', 'image_url', 'text']);
        expect(blocks[2].content).toBe('Client tool results:');
    });

    it('injectNativeFileInputs adds a file once when the same inputs are injected twice', () => {
        const runner = new AIPromptRunner() as unknown as Runner;
        const chatParams = chatParamsWith(blockMessage());
        const params = { nativeFileInputs: [{ Name: 'a.png', MimeType: 'image/png', SizeBytes: 10, Base64Content: 'BBBB' }] };
        runner.injectNativeFileInputs(params, imageLlm, chatParams, false);
        runner.injectNativeFileInputs(params, imageLlm, chatParams, false);
        const blocks = chatParams.messages[0].content as Array<{ type: string; content: string }>;
        expect(blocks.map(b => b.type)).toEqual(['file_url', 'image_url', 'text']);
        expect(blocks.slice(1)).toEqual(blockMessage().content);
    });

    it('injectNativeFileInputs adds a text fallback once when the same inputs are injected twice', () => {
        const runner = new AIPromptRunner() as unknown as Runner;
        const chatParams = chatParamsWith({ role: 'user', content: 'Summarize the notes' });
        const params = { nativeFileInputs: [{ Name: 'notes.txt', MimeType: 'text/plain', SizeBytes: 5, Base64Content: '', TextContent: 'hello' }] };
        runner.injectNativeFileInputs(params, textLlm, chatParams, false);
        runner.injectNativeFileInputs(params, textLlm, chatParams, false);
        const blocks = chatParams.messages[0].content as Array<{ type: string; content: string }>;
        expect(blocks).toEqual([
            { type: 'text', content: '--- File: notes.txt (text/plain) ---\nhello\n--- End of file ---' },
            { type: 'text', content: 'Summarize the notes' },
        ]);
    });

    it('stripUnsupportedMediaBlocks does not mutate the caller\'s message object', () => {
        const runner = new AIPromptRunner() as unknown as Runner;
        const original = blockMessage();
        const chatParams = chatParamsWith(original);
        runner.stripUnsupportedMediaBlocks(textLlm, chatParams, { Name: 'text-only' }, false, {});
        expect(original.content).toEqual(blockMessage().content);
        expect(chatParams.messages[0]).not.toBe(original);
        const sent = chatParams.messages[0].content as Array<{ type: string }>;
        expect(sent[0].type).toBe('text');
    });

    it('stripUnsupportedMediaBlocks keeps the same message object when the driver supports every block', () => {
        const runner = new AIPromptRunner() as unknown as Runner;
        const original = blockMessage();
        const chatParams = chatParamsWith(original);
        runner.stripUnsupportedMediaBlocks(imageLlm, chatParams, { Name: 'vision' }, false, {});
        expect(chatParams.messages[0]).toBe(original);
    });

    it('stripUnsupportedMediaBlocks annotates a copy of a system message, not the original', () => {
        const runner = new AIPromptRunner() as unknown as Runner;
        const manifest = '## Available Artifacts\n**IMAGE** — photo.png [image/png]\n';
        const original: ChatMessage = { role: ChatMessageRole.system, content: manifest };
        const chatParams = chatParamsWith(original);
        runner.stripUnsupportedMediaBlocks(textLlm, chatParams, { Name: 'text-only' }, false, {});
        expect(original.content).toBe(manifest);
        expect(chatParams.messages[0].content).toContain('cannot process image');
    });
});
