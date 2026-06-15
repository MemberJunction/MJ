/**
 * Message-array construction + modality/media handling tests for the REAL AIPromptRunner.
 * Covers buildMessageArray, driverSupportsModality, annotateManifestForUnsupportedMedia,
 * stripUnsupportedMediaBlocks, and injectNativeFileInputs against real methods (cast to reach
 * privates). A fake LLM supplies GetFileCapabilities(); no AIEngine mock needed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import { ChatMessageRole } from '@memberjunction/ai';

type FileCaps = { SupportedMimeTypes: string[] } | null;
function fakeLLM(caps: FileCaps): unknown {
  return { GetFileCapabilities: () => caps };
}

type ChatInternals = {
  buildMessageArray(rendered: string, conv?: unknown[], role?: string): Array<{ role: string; content: unknown }>;
  driverSupportsModality(caps: FileCaps, mime: string): boolean;
  annotateManifestForUnsupportedMedia(text: string, caps: FileCaps, modelName: string): string;
  stripUnsupportedMediaBlocks(llm: unknown, chatParams: unknown, model: unknown, verbose: boolean, params: unknown): void;
  injectNativeFileInputs(params: unknown, llm: unknown, chatParams: unknown, verbose: boolean): void;
};
function priv(r: AIPromptRunner): ChatInternals { return r as unknown as ChatInternals; }

let runner: AIPromptRunner;
beforeEach(() => { runner = new AIPromptRunner(); });

describe('buildMessageArray', () => {
  it("system role + no conversation => system message + a default user nudge", () => {
    const msgs = priv(runner).buildMessageArray('SYSTEM TEXT', undefined, 'system');
    expect(msgs[0].role).toBe(ChatMessageRole.system);
    expect(msgs[0].content).toBe('SYSTEM TEXT');
    expect(msgs[msgs.length - 1].role).toBe(ChatMessageRole.user); // ensures at least one user turn
  });

  it("user role + no conversation => single user message (no extra nudge)", () => {
    const msgs = priv(runner).buildMessageArray('USER TEXT', undefined, 'user');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe(ChatMessageRole.user);
    expect(msgs[0].content).toBe('USER TEXT');
  });

  it('appends provided conversation messages after the system message', () => {
    const conv = [{ role: ChatMessageRole.user, content: 'hi' }];
    const msgs = priv(runner).buildMessageArray('SYS', conv as never, 'system');
    expect(msgs[0].role).toBe(ChatMessageRole.system);
    expect(msgs.some(m => m.content === 'hi')).toBe(true);
  });

  it("'none' role with no conversation and no rendered prompt => a fallback user message", () => {
    const msgs = priv(runner).buildMessageArray('', undefined, 'none');
    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[msgs.length - 1].role).toBe(ChatMessageRole.user);
  });
});

describe('driverSupportsModality', () => {
  it('returns false when capabilities are null (driver declares no file support)', () => {
    expect(priv(runner).driverSupportsModality(null, 'image/png')).toBe(false);
  });
  it('matches an exact MIME type', () => {
    expect(priv(runner).driverSupportsModality({ SupportedMimeTypes: ['image/png'] }, 'image/png')).toBe(true);
  });
  it('matches a subtype wildcard (image/*)', () => {
    expect(priv(runner).driverSupportsModality({ SupportedMimeTypes: ['image/*'] }, 'image/jpeg')).toBe(true);
  });
  it('rejects a MIME not on the supported list', () => {
    expect(priv(runner).driverSupportsModality({ SupportedMimeTypes: ['image/*'] }, 'audio/mpeg')).toBe(false);
  });
  it('matches a wildcard REQUEST (image/*) against a CONCRETE supported type (image/jpeg)', () => {
    // An image_url block with no explicit mimeType probes the driver as 'image/*'; it must
    // match a driver that declares any concrete image type, or vision images get stripped.
    expect(priv(runner).driverSupportsModality({ SupportedMimeTypes: ['image/jpeg', 'image/png'] }, 'image/*')).toBe(true);
  });
  it('rejects a wildcard REQUEST whose family the driver does not support', () => {
    expect(priv(runner).driverSupportsModality({ SupportedMimeTypes: ['image/jpeg'] }, 'audio/*')).toBe(false);
  });
});

describe('annotateManifestForUnsupportedMedia', () => {
  it('leaves text without an artifact manifest unchanged', () => {
    const text = 'just a normal system prompt';
    expect(priv(runner).annotateManifestForUnsupportedMedia(text, null, 'GPT-5')).toBe(text);
  });

  it('annotates an image manifest entry when the driver cannot process images', () => {
    const text = '## Available Artifacts\n**IMAGE** — photo.png [image/png]\n';
    const out = priv(runner).annotateManifestForUnsupportedMedia(text, { SupportedMimeTypes: [] }, 'Text-Only-Model');
    expect(out).not.toBe(text);
    expect(out.toLowerCase()).toContain('cannot process image');
  });

  it('does NOT annotate when the driver DOES support the modality', () => {
    const text = '## Available Artifacts\n**IMAGE** — photo.png [image/png]\n';
    const out = priv(runner).annotateManifestForUnsupportedMedia(text, { SupportedMimeTypes: ['image/*'] }, 'Vision-Model');
    expect(out).toBe(text);
  });
});

describe('stripUnsupportedMediaBlocks', () => {
  it('rewrites an unsupported image block into a visible text marker', () => {
    const chatParams = {
      messages: [
        { role: ChatMessageRole.user, content: [{ type: 'image_url', mimeType: 'image/png', fileName: 'x.png' }] },
      ],
    };
    priv(runner).stripUnsupportedMediaBlocks(fakeLLM(null), chatParams, { Name: 'Text Model' }, false, {});
    const block = (chatParams.messages[0].content as Array<{ type: string; content?: string }>)[0];
    expect(block.type).toBe('text');
    expect(block.content).toContain('does not support this modality');
  });

  it('keeps a media block the driver DOES support', () => {
    const original = { type: 'image_url', mimeType: 'image/png' };
    const chatParams = { messages: [{ role: ChatMessageRole.user, content: [original] }] };
    priv(runner).stripUnsupportedMediaBlocks(fakeLLM({ SupportedMimeTypes: ['image/*'] }), chatParams, { Name: 'Vision' }, false, {});
    expect((chatParams.messages[0].content as unknown[])[0]).toBe(original);
  });
});

describe('injectNativeFileInputs', () => {
  it('attaches a supported file natively as a file_url block on the last user message', () => {
    const chatParams = { messages: [{ role: ChatMessageRole.user, content: 'please analyze' }] };
    const params = {
      nativeFileInputs: [{ Name: 'doc.png', MimeType: 'image/png', SizeBytes: 1024, Base64Content: 'AAAA', TextContent: null }],
    };
    priv(runner).injectNativeFileInputs(params, fakeLLM({ SupportedMimeTypes: ['image/*'] }), chatParams, false);
    const content = chatParams.messages[0].content as Array<{ type: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content.some(b => b.type === 'file_url')).toBe(true);
    expect(content.some(b => b.type === 'text')).toBe(true); // original text preserved
  });

  it('falls back to injecting extracted text when the driver cannot take the file natively', () => {
    const chatParams = { messages: [{ role: ChatMessageRole.user, content: 'summarize' }] };
    const params = {
      nativeFileInputs: [{ Name: 'notes.txt', MimeType: 'text/plain', SizeBytes: 50, Base64Content: '', TextContent: 'hello from the file' }],
    };
    priv(runner).injectNativeFileInputs(params, fakeLLM(null), chatParams, false);
    const content = chatParams.messages[0].content as Array<{ type: string; content: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content.some(b => b.type === 'text' && b.content.includes('hello from the file'))).toBe(true);
    expect(content.some(b => b.type === 'file_url')).toBe(false);
  });

  it('is a no-op when there are no native file inputs', () => {
    const chatParams = { messages: [{ role: ChatMessageRole.user, content: 'plain' }] };
    priv(runner).injectNativeFileInputs({}, fakeLLM(null), chatParams, false);
    expect(chatParams.messages[0].content).toBe('plain');
  });
});
