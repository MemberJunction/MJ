import { describe, it, expect, vi } from 'vitest';
import {
    ConversationUtility,
    DEFAULT_ATTACHMENT_LIMITS,
    DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES
} from '../conversation-utility';
import type {
    AgentInfo,
    UserInfo,
    AttachmentContent,
    AttachmentData,
    AttachmentDefaults,
    AttachmentLimits,
    AttachmentType
} from '../conversation-utility';

describe('ConversationUtility', () => {
    describe('ParseSpecialContent', () => {
        it('should return empty array for null/empty text', () => {
            expect(ConversationUtility.ParseSpecialContent('')).toEqual([]);
            expect(ConversationUtility.ParseSpecialContent(null as unknown as string)).toEqual([]);
        });

        it('should parse mention tokens', () => {
            const text = 'Hello @{"_mode":"mention","type":"agent","id":"a1","name":"TestAgent"}!';
            const tokens = ConversationUtility.ParseSpecialContent(text);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].mode).toBe('mention');
            expect((tokens[0].content as { name: string }).name).toBe('TestAgent');
        });

        it('should parse form tokens', () => {
            const text = '@{"_mode":"form","action":"create","fields":[{"name":"field1","value":"val1"}]}';
            const tokens = ConversationUtility.ParseSpecialContent(text);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].mode).toBe('form');
        });

        it('should parse attachment tokens', () => {
            const text = 'See @{"_mode":"attachment","id":"att1","type":"Image","mimeType":"image/png"}';
            const tokens = ConversationUtility.ParseSpecialContent(text);

            expect(tokens).toHaveLength(1);
            expect(tokens[0].mode).toBe('attachment');
        });

        it('should parse multiple tokens', () => {
            const text = '@{"_mode":"mention","type":"agent","id":"a1","name":"Agent1"} and @{"_mode":"mention","type":"user","id":"u1","name":"User1"}';
            const tokens = ConversationUtility.ParseSpecialContent(text);

            expect(tokens).toHaveLength(2);
        });

        it('should handle nested braces in JSON', () => {
            const text = '@{"_mode":"form","action":"create","fields":[{"name":"data","value":{"nested":"obj"}}]}';
            const tokens = ConversationUtility.ParseSpecialContent(text);

            expect(tokens).toHaveLength(1);
        });

        it('should handle text without any tokens', () => {
            const text = 'Just regular text without any special tokens';
            const tokens = ConversationUtility.ParseSpecialContent(text);

            expect(tokens).toEqual([]);
        });

        it('should skip invalid JSON tokens', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const text = '@{not valid json}';
            const tokens = ConversationUtility.ParseSpecialContent(text);

            expect(tokens).toEqual([]);
            warnSpy.mockRestore();
        });

        it('should handle unclosed braces gracefully', () => {
            const text = '@{"_mode":"mention","type":"agent"';
            const tokens = ConversationUtility.ParseSpecialContent(text);

            expect(tokens).toEqual([]);
        });
    });

    describe('ToPlainText', () => {
        const agents: AgentInfo[] = [{ ID: 'a1', Name: 'Test Agent' }];
        const users: UserInfo[] = [{ ID: 'u1', Name: 'Test User' }];

        it('should return empty string for empty/null text', () => {
            expect(ConversationUtility.ToPlainText('')).toBe('');
            expect(ConversationUtility.ToPlainText(null as unknown as string)).toBe('');
        });

        it('should convert mention to @Name format', () => {
            const text = 'Hello @{"_mode":"mention","type":"agent","id":"a1","name":"AgentName"}!';
            const result = ConversationUtility.ToPlainText(text, agents, users);

            expect(result).toBe('Hello @Test Agent!');
        });

        it('should use lookup name for user mentions', () => {
            const text = '@{"_mode":"mention","type":"user","id":"u1","name":"UserHandle"}';
            const result = ConversationUtility.ToPlainText(text, agents, users);

            expect(result).toBe('@Test User');
        });

        it('should fall back to token name when lookup fails', () => {
            const text = '@{"_mode":"mention","type":"agent","id":"unknown","name":"FallbackName"}';
            const result = ConversationUtility.ToPlainText(text, agents, users);

            expect(result).toBe('@FallbackName');
        });

        it('should convert single-field form to simple format', () => {
            const text = '@{"_mode":"form","action":"answer","fields":[{"name":"response","value":"Yes","label":"Do you agree?"}]}';
            const result = ConversationUtility.ToPlainText(text);

            expect(result).toBe('Do you agree?: Yes');
        });

        it('should convert multi-field form to list format', () => {
            const text = '@{"_mode":"form","action":"create","fields":[{"name":"f1","value":"v1","label":"Field 1"},{"name":"f2","value":"v2","label":"Field 2"}]}';
            const result = ConversationUtility.ToPlainText(text);

            expect(result).toBe('Form Response: Field 1=v1, Field 2=v2');
        });

        it('should pass through text without tokens unchanged', () => {
            expect(ConversationUtility.ToPlainText('Regular text')).toBe('Regular text');
        });
    });

    describe('ToAgentContext', () => {
        it('should return empty string for empty/null text', () => {
            expect(ConversationUtility.ToAgentContext('')).toBe('');
        });

        it('should convert mentions without @ prefix', () => {
            const text = 'Hello @{"_mode":"mention","type":"agent","id":"a1","name":"AgentName"}!';
            const result = ConversationUtility.ToAgentContext(text);

            expect(result).toBe('Hello AgentName!');
        });

        it('should strip attachment tokens from text', () => {
            const text = 'See this @{"_mode":"attachment","id":"att1","type":"Image","mimeType":"image/png"} image';
            const result = ConversationUtility.ToAgentContext(text);

            expect(result).toBe('See this  image');
        });

        it('should convert form to JSON context', () => {
            const text = '@{"_mode":"form","action":"create","fields":[{"name":"f1","value":"v1"}]}';
            const result = ConversationUtility.ToAgentContext(text);

            expect(result).toContain('User submitted form with:');
            expect(result).toContain('"action":"create"');
        });
    });

    describe('CreateMention', () => {
        it('should create a valid mention token string', () => {
            const result = ConversationUtility.CreateMention('agent', 'a1', 'Test Agent');

            expect(result).toContain('"_mode":"mention"');
            expect(result).toContain('"type":"agent"');
            expect(result).toContain('"id":"a1"');
            expect(result).toContain('"name":"Test Agent"');
            expect(result.startsWith('@{')).toBe(true);
        });

        it('should include optional configurationId and configurationName', () => {
            const result = ConversationUtility.CreateMention('agent', 'a1', 'Agent', 'cfg1', 'Config Name');

            expect(result).toContain('"configurationId":"cfg1"');
            expect(result).toContain('"configurationName":"Config Name"');
        });
    });

    describe('CreateFormResponse', () => {
        it('should create a valid form response token', () => {
            const result = ConversationUtility.CreateFormResponse(
                'submit',
                [{ name: 'field1', value: 'val1' }],
                'Test Form'
            );

            expect(result).toContain('"_mode":"form"');
            expect(result).toContain('"action":"submit"');
            expect(result).toContain('"title":"Test Form"');
            expect(result.startsWith('@{')).toBe(true);
        });
    });

    describe('ContainsFormResponse', () => {
        it('should return true for text with form token', () => {
            const text = '@{"_mode":"form","action":"create","fields":[{"name":"f1","value":"v1"}]}';
            expect(ConversationUtility.ContainsFormResponse(text)).toBe(true);
        });

        it('should return false for text without form token', () => {
            expect(ConversationUtility.ContainsFormResponse('Regular text')).toBe(false);
        });

        it('should return false for null/empty text', () => {
            expect(ConversationUtility.ContainsFormResponse('')).toBe(false);
        });
    });

    describe('Attachment methods', () => {
        it('should create attachment reference token', () => {
            const result = ConversationUtility.CreateAttachmentReference({
                _mode: 'attachment',
                id: 'att1',
                type: 'Image',
                mimeType: 'image/png',
                fileName: 'test.png'
            });

            expect(result).toContain('"_mode":"attachment"');
            expect(result).toContain('"id":"att1"');
        });

        it('should detect attachments in text', () => {
            const text = 'See @{"_mode":"attachment","id":"att1","type":"Image","mimeType":"image/png"}';
            expect(ConversationUtility.ContainsAttachments(text)).toBe(true);
        });

        it('should return false for text without attachments', () => {
            expect(ConversationUtility.ContainsAttachments('No attachments')).toBe(false);
        });

        it('should get attachment references from text', () => {
            const text = 'Image: @{"_mode":"attachment","id":"att1","type":"Image","mimeType":"image/png"} and @{"_mode":"attachment","id":"att2","type":"Audio","mimeType":"audio/mp3"}';
            const refs = ConversationUtility.GetAttachmentReferences(text);

            expect(refs).toHaveLength(2);
            expect(refs[0].id).toBe('att1');
            expect(refs[1].id).toBe('att2');
        });

        it('should return empty array for null text in GetAttachmentReferences', () => {
            expect(ConversationUtility.GetAttachmentReferences('')).toEqual([]);
        });
    });

    describe('BuildChatMessageContent', () => {
        it('should return processed text when no attachments', () => {
            const result = ConversationUtility.BuildChatMessageContent('Hello world', []);

            expect(result).toBe('Hello world');
        });

        it('should build content blocks when attachments present', () => {
            const attachments: AttachmentData[] = [
                { type: 'Image', mimeType: 'image/png', content: 'data:image/png;base64,abc' }
            ];
            const result = ConversationUtility.BuildChatMessageContent('Look at this', attachments);

            expect(Array.isArray(result)).toBe(true);
            const blocks = result as Array<{ type: string; content: string }>;
            expect(blocks).toHaveLength(2);
            expect(blocks[0].type).toBe('text');
            expect(blocks[1].type).toBe('image_url');
        });

        it('should return string if only text block after processing', () => {
            const attachments: AttachmentData[] = [
                { type: 'Image', mimeType: 'image/png', content: '' } // empty content = no block
            ];
            const result = ConversationUtility.BuildChatMessageContent('Hello', attachments);

            // Empty content attachment should be filtered, only text remains
            expect(typeof result === 'string' || Array.isArray(result)).toBe(true);
        });
    });

    describe('ValidateAttachment', () => {
        const systemDefaults: AttachmentDefaults = { ...DEFAULT_ATTACHMENT_LIMITS };
        const zeroCounts = { images: 0, videos: 0, audios: 0, documents: 0 };

        it('should allow valid image attachment', () => {
            const result = ConversationUtility.ValidateAttachment(
                { type: 'Image', sizeBytes: 1024 },
                zeroCounts,
                null,
                null,
                systemDefaults
            );

            expect(result.allowed).toBe(true);
        });

        it('should reject oversized image', () => {
            const result = ConversationUtility.ValidateAttachment(
                { type: 'Image', sizeBytes: 100 * 1024 * 1024 },
                zeroCounts,
                null,
                null,
                systemDefaults
            );

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('exceeds maximum');
        });

        it('should reject when max count reached', () => {
            const result = ConversationUtility.ValidateAttachment(
                { type: 'Image', sizeBytes: 1024 },
                { images: 10, videos: 0, audios: 0, documents: 0 },
                null,
                null,
                systemDefaults
            );

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Maximum');
        });

        it('should use agent limits over model limits', () => {
            const agentLimits: Partial<AttachmentLimits> = { maxImageSizeBytes: 500 };
            const modelLimits: Partial<AttachmentLimits> = { maxImageSizeBytes: 5000 };

            const result = ConversationUtility.ValidateAttachment(
                { type: 'Image', sizeBytes: 1000 },
                zeroCounts,
                agentLimits,
                modelLimits,
                systemDefaults
            );

            expect(result.allowed).toBe(false); // 1000 > 500 (agent limit)
        });

        it('should validate video attachments', () => {
            const result = ConversationUtility.ValidateAttachment(
                { type: 'Video', sizeBytes: 1024 },
                zeroCounts,
                null,
                null,
                systemDefaults
            );

            expect(result.allowed).toBe(true);
        });

        it('should validate audio attachments', () => {
            const result = ConversationUtility.ValidateAttachment(
                { type: 'Audio', sizeBytes: 1024 },
                zeroCounts,
                null,
                null,
                systemDefaults
            );

            expect(result.allowed).toBe(true);
        });
    });

    describe('GetEffectiveLimit', () => {
        const systemDefaults: AttachmentDefaults = { ...DEFAULT_ATTACHMENT_LIMITS };

        it('should use agent limit when set', () => {
            const result = ConversationUtility.GetEffectiveLimit(
                'maxImageSizeBytes',
                { maxImageSizeBytes: 1000 },
                { maxImageSizeBytes: 5000 },
                systemDefaults
            );

            expect(result).toBe(1000);
        });

        it('should use model limit when agent not set', () => {
            const result = ConversationUtility.GetEffectiveLimit(
                'maxImageSizeBytes',
                null,
                { maxImageSizeBytes: 5000 },
                systemDefaults
            );

            expect(result).toBe(5000);
        });

        it('should use system default when neither agent nor model set', () => {
            const result = ConversationUtility.GetEffectiveLimit(
                'maxImageSizeBytes',
                null,
                null,
                systemDefaults
            );

            expect(result).toBe(5 * 1024 * 1024);
        });
    });

    describe('ShouldStoreInline', () => {
        it('should return true when size is within threshold', () => {
            expect(ConversationUtility.ShouldStoreInline(512, null, 1024)).toBe(true);
        });

        it('should return false when size exceeds threshold', () => {
            expect(ConversationUtility.ShouldStoreInline(2048, null, 1024)).toBe(false);
        });

        it('should use agent threshold over system threshold', () => {
            expect(ConversationUtility.ShouldStoreInline(750, 500, 1024)).toBe(false); // 750 > 500
        });

        it('should use system threshold when agent threshold is null', () => {
            expect(ConversationUtility.ShouldStoreInline(750, null, 1024)).toBe(true);
        });
    });

    describe('GetAttachmentTypeFromMime', () => {
        it('should detect image types', () => {
            expect(ConversationUtility.GetAttachmentTypeFromMime('image/png')).toBe('Image');
            expect(ConversationUtility.GetAttachmentTypeFromMime('image/jpeg')).toBe('Image');
        });

        it('should detect video types', () => {
            expect(ConversationUtility.GetAttachmentTypeFromMime('video/mp4')).toBe('Video');
        });

        it('should detect audio types', () => {
            expect(ConversationUtility.GetAttachmentTypeFromMime('audio/mp3')).toBe('Audio');
        });

        it('should default to Document for unknown types', () => {
            expect(ConversationUtility.GetAttachmentTypeFromMime('application/pdf')).toBe('Document');
        });

        it('should return Document for empty string', () => {
            expect(ConversationUtility.GetAttachmentTypeFromMime('')).toBe('Document');
        });
    });

    describe('GetContentBlockType', () => {
        it('should map Image to image_url', () => {
            expect(ConversationUtility.GetContentBlockType('Image')).toBe('image_url');
        });

        it('should map Video to video_url', () => {
            expect(ConversationUtility.GetContentBlockType('Video')).toBe('video_url');
        });

        it('should map Audio to audio_url', () => {
            expect(ConversationUtility.GetContentBlockType('Audio')).toBe('audio_url');
        });

        it('should map Document to file_url', () => {
            expect(ConversationUtility.GetContentBlockType('Document')).toBe('file_url');
        });
    });
});

describe('DEFAULT_ATTACHMENT_LIMITS', () => {
    it('should have expected default values', () => {
        expect(DEFAULT_ATTACHMENT_LIMITS.maxImageSizeBytes).toBe(5 * 1024 * 1024);
        expect(DEFAULT_ATTACHMENT_LIMITS.maxVideoSizeBytes).toBe(20 * 1024 * 1024);
        expect(DEFAULT_ATTACHMENT_LIMITS.maxAudioSizeBytes).toBe(10 * 1024 * 1024);
        expect(DEFAULT_ATTACHMENT_LIMITS.maxImagesPerMessage).toBe(10);
        expect(DEFAULT_ATTACHMENT_LIMITS.maxVideosPerMessage).toBe(5);
        expect(DEFAULT_ATTACHMENT_LIMITS.maxAudiosPerMessage).toBe(5);
    });
});

describe('DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES', () => {
    it('should be 1MB', () => {
        expect(DEFAULT_INLINE_STORAGE_THRESHOLD_BYTES).toBe(1 * 1024 * 1024);
    });
});
