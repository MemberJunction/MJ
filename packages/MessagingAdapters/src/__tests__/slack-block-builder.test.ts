/**
 * Unit tests for slack-block-builder.ts — rich Block Kit response builder.
 */
import { describe, it, expect } from 'vitest';
import {
    buildRichResponse,
    buildAgentContextBlock,
    buildTextBlocks,
    buildArtifactCard,
    buildActionButtons,
    buildMediaBlocks,
    buildErrorBlocks,
    buildMetadataFooter,
    buildDivider,
} from '../slack/slack-block-builder.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockAgent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        Name: 'Test Agent',
        LogoURL: null,
        ...overrides
    };
}

function createMockResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        success: true,
        payload: 'Test response',
        agentRun: {
            StartedAt: new Date('2025-01-01T00:00:00Z'),
            CompletedAt: new Date('2025-01-01T00:00:04.2Z'),
            Steps: [{ StepNumber: 1 }],
            TotalTokensUsed: 1240,
        },
        ...overrides
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('slack-block-builder', () => {
    describe('buildAgentContextBlock', () => {
        it('should create a context block with agent name', () => {
            const agent = createMockAgent({ Name: 'Sage' });
            const block = buildAgentContextBlock(agent as never);

            expect(block.type).toBe('context');
            const elements = block.elements as Record<string, unknown>[];
            expect(elements.length).toBeGreaterThan(0);
            const textEl = elements.find(e => (e as Record<string, unknown>).type === 'mrkdwn');
            expect((textEl as Record<string, unknown>).text).toBe('*Sage*');
        });

        it('should include image element when LogoURL is HTTPS', () => {
            const agent = createMockAgent({
                Name: 'Research Agent',
                LogoURL: 'https://example.com/avatar.png'
            });
            const block = buildAgentContextBlock(agent as never);
            const elements = block.elements as Record<string, unknown>[];
            const imageEl = elements.find(e => (e as Record<string, unknown>).type === 'image');
            expect(imageEl).toBeDefined();
            expect((imageEl as Record<string, unknown>).image_url).toBe('https://example.com/avatar.png');
        });

        it('should NOT include image element for non-HTTPS URLs', () => {
            const agent = createMockAgent({ LogoURL: 'http://insecure.com/avatar.png' });
            const block = buildAgentContextBlock(agent as never);
            const elements = block.elements as Record<string, unknown>[];
            const imageEl = elements.find(e => (e as Record<string, unknown>).type === 'image');
            expect(imageEl).toBeUndefined();
        });

        it('should NOT include image element for data URIs', () => {
            const agent = createMockAgent({ LogoURL: 'data:image/png;base64,abc123' });
            const block = buildAgentContextBlock(agent as never);
            const elements = block.elements as Record<string, unknown>[];
            const imageEl = elements.find(e => (e as Record<string, unknown>).type === 'image');
            expect(imageEl).toBeUndefined();
        });

        it('should handle null Name gracefully', () => {
            const agent = createMockAgent({ Name: null });
            const block = buildAgentContextBlock(agent as never);
            const elements = block.elements as Record<string, unknown>[];
            const textEl = elements.find(e => (e as Record<string, unknown>).type === 'mrkdwn');
            expect((textEl as Record<string, unknown>).text).toBe('*Agent*');
        });
    });

    describe('buildTextBlocks', () => {
        it('should convert markdown to Block Kit sections', () => {
            const blocks = buildTextBlocks('Hello **world**');
            expect(blocks.length).toBeGreaterThan(0);
            expect(blocks[0].type).toBe('section');
        });

        it('should handle empty text', () => {
            const blocks = buildTextBlocks('');
            expect(blocks.length).toBeGreaterThan(0); // At least the fallback block
        });
    });

    describe('buildArtifactCard', () => {
        it('should render title as header block', () => {
            const blocks = buildArtifactCard({
                Title: 'Research Report',
                Summary: 'Key findings from the analysis'
            });
            const headerBlock = blocks.find(b => b.type === 'header');
            expect(headerBlock).toBeDefined();
            expect(((headerBlock as Record<string, unknown>).text as Record<string, unknown>).text).toBe('Research Report');
        });

        it('should render summary as section block', () => {
            const blocks = buildArtifactCard({ Title: 'Test', Summary: 'A summary' });
            const sectionBlock = blocks.find(b =>
                b.type === 'section' &&
                ((b as Record<string, unknown>).text as Record<string, unknown>).text === 'A summary'
            );
            expect(sectionBlock).toBeDefined();
        });

        it('should render sources as context block', () => {
            const blocks = buildArtifactCard({
                Title: 'Test',
                Sources: [
                    { Title: 'Wikipedia', URL: 'https://wikipedia.org' },
                    { Title: 'ArXiv', URL: 'https://arxiv.org' }
                ]
            });
            const contextBlock = blocks.find(b => b.type === 'context');
            expect(contextBlock).toBeDefined();
            const elements = (contextBlock as Record<string, unknown>).elements as Record<string, unknown>[];
            expect((elements[0].text as string)).toContain('Wikipedia');
            expect((elements[0].text as string)).toContain('ArXiv');
        });

        it('should render view button when URL is provided', () => {
            const blocks = buildArtifactCard({ Title: 'Test', URL: 'https://example.com/report' });
            const actionsBlock = blocks.find(b => b.type === 'actions');
            expect(actionsBlock).toBeDefined();
        });

        it('should limit sections to 5', () => {
            const sections = Array.from({ length: 10 }, (_, i) => ({
                Heading: `Section ${i}`,
                Content: `Content ${i}`
            }));
            const blocks = buildArtifactCard({ Title: 'Test', Sections: sections });
            const sectionBlocks = blocks.filter(b => b.type === 'section');
            expect(sectionBlocks.length).toBeLessThanOrEqual(5);
        });
    });

    describe('buildActionButtons', () => {
        it('should create an actions block with buttons', () => {
            const commands = [
                { type: 'open:url' as const, label: 'Open Report', url: 'https://example.com' },
                { type: 'open:resource' as const, label: 'View Record', resourceType: 'Record' as const, resourceId: '123' }
            ];
            const block = buildActionButtons(commands);
            expect(block.type).toBe('actions');
            const elements = block.elements as Record<string, unknown>[];
            expect(elements).toHaveLength(2);
        });

        it('should include URL for open:url commands', () => {
            const commands = [
                { type: 'open:url' as const, label: 'Visit', url: 'https://example.com' }
            ];
            const block = buildActionButtons(commands);
            const elements = block.elements as Record<string, unknown>[];
            expect(elements[0].url).toBe('https://example.com');
        });

        it('should limit to 5 buttons', () => {
            const commands = Array.from({ length: 8 }, (_, i) => ({
                type: 'open:url' as const,
                label: `Action ${i}`,
                url: `https://example.com/${i}`
            }));
            const block = buildActionButtons(commands);
            const elements = block.elements as Record<string, unknown>[];
            expect(elements).toHaveLength(5);
        });
    });

    describe('buildMediaBlocks', () => {
        it('should create image blocks for HTTPS URLs', () => {
            const media = [{ url: 'https://example.com/chart.png', title: 'Chart' }];
            const blocks = buildMediaBlocks(media);
            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('image');
            expect(blocks[0].image_url).toBe('https://example.com/chart.png');
        });

        it('should skip non-HTTPS URLs', () => {
            const media = [
                { url: 'http://insecure.com/img.png' },
                { url: 'data:image/png;base64,abc' }
            ];
            const blocks = buildMediaBlocks(media);
            expect(blocks).toHaveLength(0);
        });
    });

    describe('buildErrorBlocks', () => {
        it('should create a warning-styled section block', () => {
            const blocks = buildErrorBlocks('Something went wrong');
            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('section');
            expect(((blocks[0] as Record<string, unknown>).text as Record<string, unknown>).text)
                .toContain('Something went wrong');
        });
    });

    describe('buildMetadataFooter', () => {
        it('should show timing information', () => {
            const result = createMockResult();
            const block = buildMetadataFooter(result as never);
            expect(block.type).toBe('context');
            const elements = block.elements as Record<string, unknown>[];
            expect((elements[0].text as string)).toContain('4.2s');
        });

        it('should show step count', () => {
            const result = createMockResult();
            const block = buildMetadataFooter(result as never);
            const elements = block.elements as Record<string, unknown>[];
            expect((elements[0].text as string)).toContain('1 step');
        });

        it('should show token count', () => {
            const result = createMockResult();
            const block = buildMetadataFooter(result as never);
            const elements = block.elements as Record<string, unknown>[];
            expect((elements[0].text as string)).toContain('1,240 tokens');
        });

        it('should show "Completed" when no timing data available', () => {
            const result = createMockResult({ agentRun: {} });
            const block = buildMetadataFooter(result as never);
            const elements = block.elements as Record<string, unknown>[];
            expect((elements[0].text as string)).toBe('Completed');
        });
    });

    describe('buildDivider', () => {
        it('should create a divider block', () => {
            const block = buildDivider();
            expect(block.type).toBe('divider');
        });
    });

    describe('buildRichResponse', () => {
        it('should include agent context header and divider', () => {
            const agent = createMockAgent({ Name: 'Sage' });
            const blocks = buildRichResponse(null, agent as never, 'Hello!');

            expect(blocks[0].type).toBe('context'); // Agent header
            expect(blocks[1].type).toBe('divider');
        });

        it('should include text content blocks', () => {
            const agent = createMockAgent();
            const blocks = buildRichResponse(null, agent as never, 'Some response text');

            const sectionBlocks = blocks.filter(b => b.type === 'section');
            expect(sectionBlocks.length).toBeGreaterThan(0);
        });

        it('should include metadata footer when agentRun is present', () => {
            const agent = createMockAgent();
            const result = createMockResult();
            const blocks = buildRichResponse(result as never, agent as never, 'Response');

            const contextBlocks = blocks.filter(b => b.type === 'context');
            // At least agent header context + metadata footer context
            expect(contextBlocks.length).toBeGreaterThanOrEqual(2);
        });

        it('should enforce 50-block limit', () => {
            const agent = createMockAgent();
            // Create a very long response that would generate many blocks
            const longText = Array.from({ length: 100 }, (_, i) => `# Section ${i}\n\nParagraph ${i} with some content.`).join('\n\n');
            const blocks = buildRichResponse(null, agent as never, longText);

            expect(blocks.length).toBeLessThanOrEqual(50);
        });

        it('should add truncation notice when blocks exceed limit', () => {
            const agent = createMockAgent();
            const longText = Array.from({ length: 100 }, (_, i) => `# Section ${i}\n\nParagraph ${i}.`).join('\n\n');
            const blocks = buildRichResponse(null, agent as never, longText);

            if (blocks.length === 50) {
                // Second-to-last block is the truncation notice
                const noticeBlock = blocks[blocks.length - 2];
                expect(noticeBlock.type).toBe('context');
                const elements = noticeBlock.elements as Record<string, unknown>[];
                expect((elements[0].text as string)).toContain('truncated');

                // Last block is the "View Full Response" button
                const buttonBlock = blocks[blocks.length - 1];
                expect(buttonBlock.type).toBe('actions');
                const btnElements = buttonBlock.elements as Record<string, unknown>[];
                expect(btnElements[0].action_id).toBe('mj:view_full:response');
            }
        });

        it('should detect and render artifact payloads', () => {
            const agent = createMockAgent();
            const result = createMockResult({
                payload: {
                    title: 'Research Report',
                    summary: 'Key findings',
                    sections: [{ heading: 'Overview', content: 'Details here' }]
                }
            });
            const blocks = buildRichResponse(result as never, agent as never, 'Response');

            // Should have header block for the artifact title
            const headerBlocks = blocks.filter(b => b.type === 'header');
            expect(headerBlocks.length).toBeGreaterThanOrEqual(1);
        });
    });
});
