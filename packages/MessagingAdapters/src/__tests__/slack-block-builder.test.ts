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
    buildResponseForm,
    buildFormModal,
    buildNotificationBlocks,
    getFullResponseText,
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
        it('should create URL buttons for open:url commands', () => {
            const commands = [
                { type: 'open:url' as const, label: 'Visit', url: 'https://example.com' }
            ];
            const blocks = buildActionButtons(commands);
            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('actions');
            const elements = (blocks[0] as Record<string, unknown>).elements as Record<string, unknown>[];
            expect(elements[0].url).toBe('https://example.com');
        });

        it('should render open:resource as info context when no explorer URL', () => {
            const commands = [
                { type: 'open:resource' as const, label: 'View Customer', resourceType: 'Record' as const, entityName: 'Customers', resourceId: '123' }
            ];
            const blocks = buildActionButtons(commands);
            // No buttons (no URL), just a context block with resource info
            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('context');
            const elements = (blocks[0] as Record<string, unknown>).elements as Record<string, unknown>[];
            expect(elements[0].text).toContain('View Customer');
            expect(elements[0].text).toContain('Customers');
            expect(elements[0].text).toContain('MJ Explorer');
        });

        it('should deep-link open:resource when explorer URL is provided', () => {
            const commands = [
                { type: 'open:resource' as const, label: 'View Customer', resourceType: 'Record' as const, entityName: 'Customers', resourceId: 'abc-123' }
            ];
            const blocks = buildActionButtons(commands, 'https://explorer.myco.com');
            expect(blocks).toHaveLength(1);
            expect(blocks[0].type).toBe('actions');
            const elements = (blocks[0] as Record<string, unknown>).elements as Record<string, unknown>[];
            expect(elements[0].url).toBe('https://explorer.myco.com/resource/record/Customers/abc-123');
        });

        it('should deep-link dashboard resources', () => {
            const commands = [
                { type: 'open:resource' as const, label: 'Sales Dashboard', resourceType: 'Dashboard' as const, resourceId: 'dash-1' }
            ];
            const blocks = buildActionButtons(commands, 'https://explorer.myco.com/');
            const elements = ((blocks[0] as Record<string, unknown>).elements as Record<string, unknown>[]);
            expect(elements[0].url).toBe('https://explorer.myco.com/resource/dashboard/dash-1');
        });

        it('should mix URL buttons and resource info when both present', () => {
            const commands = [
                { type: 'open:url' as const, label: 'Docs', url: 'https://docs.example.com' },
                { type: 'open:resource' as const, label: 'View Record', resourceType: 'Record' as const, entityName: 'Orders', resourceId: '456' }
            ];
            const blocks = buildActionButtons(commands); // no explorer URL
            // Should have actions block (URL button) + context block (resource info)
            expect(blocks).toHaveLength(2);
            expect(blocks[0].type).toBe('actions');
            expect(blocks[1].type).toBe('context');
        });

        it('should limit to 5 commands', () => {
            const commands = Array.from({ length: 8 }, (_, i) => ({
                type: 'open:url' as const,
                label: `Action ${i}`,
                url: `https://example.com/${i}`
            }));
            const blocks = buildActionButtons(commands);
            const elements = (blocks[0] as Record<string, unknown>).elements as Record<string, unknown>[];
            expect(elements).toHaveLength(5);
        });
    });

    describe('buildNotificationBlocks', () => {
        it('should render notification commands as styled context blocks', () => {
            const commands = [
                { type: 'notification' as const, message: 'Record saved successfully', severity: 'success' as const },
                { type: 'notification' as const, message: 'Cache refreshed', severity: 'info' as const }
            ];
            const blocks = buildNotificationBlocks(commands);
            expect(blocks).toHaveLength(2);
            expect(blocks[0].type).toBe('context');
            const el0 = ((blocks[0] as Record<string, unknown>).elements as Record<string, unknown>[])[0];
            expect(el0.text).toContain(':white_check_mark:');
            expect(el0.text).toContain('Record saved successfully');
            const el1 = ((blocks[1] as Record<string, unknown>).elements as Record<string, unknown>[])[0];
            expect(el1.text).toContain(':information_source:');
        });

        it('should skip non-notification automatic commands', () => {
            const commands = [
                { type: 'refresh:data' as const, scope: 'entity' as const, entityNames: ['Users'] },
                { type: 'notification' as const, message: 'Done', severity: 'success' as const }
            ];
            const blocks = buildNotificationBlocks(commands);
            expect(blocks).toHaveLength(1); // only the notification
            const el = ((blocks[0] as Record<string, unknown>).elements as Record<string, unknown>[])[0];
            expect(el.text).toContain('Done');
        });

        it('should return empty array for undefined commands', () => {
            expect(buildNotificationBlocks(undefined)).toHaveLength(0);
            expect(buildNotificationBlocks([])).toHaveLength(0);
        });

        it('should use warning and error icons', () => {
            const commands = [
                { type: 'notification' as const, message: 'Low disk space', severity: 'warning' as const },
                { type: 'notification' as const, message: 'Connection failed', severity: 'error' as const }
            ];
            const blocks = buildNotificationBlocks(commands);
            const el0 = ((blocks[0] as Record<string, unknown>).elements as Record<string, unknown>[])[0];
            expect(el0.text).toContain(':warning:');
            const el1 = ((blocks[1] as Record<string, unknown>).elements as Record<string, unknown>[])[0];
            expect(el1.text).toContain(':x:');
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

    describe('Explorer artifact link', () => {
        it('should include Explorer link when explorerBaseURL is configured and agentRun has ID', () => {
            const agent = createMockAgent();
            const result = createMockResult({
                agentRun: {
                    ID: 'run-123',
                    StartedAt: new Date('2025-01-01T00:00:00Z'),
                    CompletedAt: new Date('2025-01-01T00:00:04.2Z'),
                    Steps: [{ StepNumber: 1 }],
                    TotalTokensUsed: 1240,
                },
            });
            const blocks = buildRichResponse(result as never, agent as never, 'Response', {
                explorerBaseURL: 'https://explorer.example.com'
            });

            const explorerLink = blocks.find(b => {
                if (b.type !== 'context') return false;
                const elements = (b as Record<string, unknown>).elements as Record<string, unknown>[];
                return elements?.some(e => ((e as Record<string, unknown>).text as string)?.includes('MJ Explorer'));
            });
            expect(explorerLink).toBeDefined();
        });

        it('should NOT include Explorer link when explorerBaseURL is not configured', () => {
            const agent = createMockAgent();
            const result = createMockResult({
                agentRun: {
                    ID: 'run-789',
                    StartedAt: new Date('2025-01-01T00:00:00Z'),
                    CompletedAt: new Date('2025-01-01T00:00:04.2Z'),
                    Steps: [{ StepNumber: 1 }],
                    TotalTokensUsed: 1240,
                },
            });
            const blocks = buildRichResponse(result as never, agent as never, 'Response');

            const explorerLink = blocks.find(b => {
                if (b.type !== 'context') return false;
                const elements = (b as Record<string, unknown>).elements as Record<string, unknown>[];
                return elements?.some(e => ((e as Record<string, unknown>).text as string)?.includes('MJ Explorer'));
            });
            expect(explorerLink).toBeUndefined();
        });

        it('should NOT include Explorer link when agentRun has no ID', () => {
            const agent = createMockAgent();
            const result = createMockResult(); // default mock has no ID
            const blocks = buildRichResponse(result as never, agent as never, 'Response', {
                explorerBaseURL: 'https://explorer.example.com'
            });

            const explorerLink = blocks.find(b => {
                if (b.type !== 'context') return false;
                const elements = (b as Record<string, unknown>).elements as Record<string, unknown>[];
                return elements?.some(e => ((e as Record<string, unknown>).text as string)?.includes('MJ Explorer'));
            });
            expect(explorerLink).toBeUndefined();
        });
    });

    // ─── Phase 5a: New test coverage ─────────────────────────────────────────

    describe('buildResponseForm', () => {
        it('should render form title and description', () => {
            const form = {
                title: 'Campaign Settings',
                description: 'Configure your campaign',
                submitLabel: 'Launch',
                questions: [
                    { id: 'name', label: 'Name', required: true, type: { type: 'text' as const } }
                ]
            };
            const blocks = buildResponseForm(form as never);

            const titleBlock = blocks.find(b =>
                b.type === 'section' &&
                ((b as Record<string, unknown>).text as Record<string, unknown>)?.text === '*Campaign Settings*'
            );
            expect(titleBlock).toBeDefined();

            const descBlock = blocks.find(b => {
                if (b.type !== 'context') return false;
                const elements = (b as Record<string, unknown>).elements as Record<string, unknown>[];
                return elements.some(e => (e as Record<string, unknown>).text === 'Configure your campaign');
            });
            expect(descBlock).toBeDefined();
        });

        it('should show field names summary', () => {
            const form = {
                questions: [
                    { id: 'q1', label: 'First Name', required: true, type: { type: 'text' as const } },
                    { id: 'q2', label: 'Email', required: false, type: { type: 'email' as const } }
                ]
            };
            const blocks = buildResponseForm(form as never);

            const fieldsBlock = blocks.find(b => {
                if (b.type !== 'context') return false;
                const elements = (b as Record<string, unknown>).elements as Record<string, unknown>[];
                return elements.some(e => ((e as Record<string, unknown>).text as string)?.includes('First Name'));
            });
            expect(fieldsBlock).toBeDefined();
        });

        it('should include green submit button', () => {
            const form = {
                submitLabel: 'Submit',
                questions: [
                    { id: 'q1', label: 'Name', required: true, type: { type: 'text' as const } }
                ]
            };
            const blocks = buildResponseForm(form as never);

            const actionsBlock = blocks.find(b => b.type === 'actions');
            expect(actionsBlock).toBeDefined();
            const elements = (actionsBlock as Record<string, unknown>).elements as Record<string, unknown>[];
            expect(elements[0].style).toBe('primary');
            expect(elements[0].action_id).toBe('mj:form_modal:open');
        });

        it('should set value to "too_large" when form JSON exceeds 2KB', () => {
            const questions = Array.from({ length: 50 }, (_, i) => ({
                id: `q${i}`,
                label: `Question ${i} with a very long label text that takes up space`.repeat(2),
                required: true,
                type: { type: 'text' as const }
            }));
            const form = { questions };
            const blocks = buildResponseForm(form as never);

            const actionsBlock = blocks.find(b => b.type === 'actions');
            const elements = (actionsBlock as Record<string, unknown>).elements as Record<string, unknown>[];
            expect(elements[0].value).toBe('too_large');
        });
    });

    describe('buildFormModal', () => {
        it('should create a modal with text input for text questions', () => {
            const form = {
                title: 'Test Form',
                submitLabel: 'Go',
                questions: [
                    { id: 'name', label: 'Your Name', required: true, type: { type: 'text' as const } }
                ]
            };
            const modal = buildFormModal(form as never);

            expect(modal.type).toBe('modal');
            expect((modal.title as Record<string, unknown>).text).toBe('Test Form');
            expect((modal.submit as Record<string, unknown>).text).toBe('Go');

            const modalBlocks = modal.blocks as Record<string, unknown>[];
            expect(modalBlocks).toHaveLength(1);
            const element = (modalBlocks[0] as Record<string, unknown>).element as Record<string, unknown>;
            expect(element.type).toBe('plain_text_input');
        });

        it('should create textarea for textarea questions', () => {
            const form = {
                questions: [
                    { id: 'bio', label: 'Bio', required: false, type: { type: 'textarea' as const } }
                ]
            };
            const modal = buildFormModal(form as never);
            const modalBlocks = modal.blocks as Record<string, unknown>[];
            const element = (modalBlocks[0] as Record<string, unknown>).element as Record<string, unknown>;
            expect(element.type).toBe('plain_text_input');
            expect(element.multiline).toBe(true);
        });

        it('should create number_input for number questions', () => {
            const form = {
                questions: [
                    { id: 'age', label: 'Age', required: true, type: { type: 'number' as const, min: 0, max: 120 } }
                ]
            };
            const modal = buildFormModal(form as never);
            const modalBlocks = modal.blocks as Record<string, unknown>[];
            const element = (modalBlocks[0] as Record<string, unknown>).element as Record<string, unknown>;
            expect(element.type).toBe('number_input');
            expect(element.min_value).toBe('0');
            expect(element.max_value).toBe('120');
        });

        it('should create datepicker for date questions', () => {
            const form = {
                questions: [
                    { id: 'dob', label: 'Date of Birth', required: false, type: { type: 'date' as const } }
                ]
            };
            const modal = buildFormModal(form as never);
            const modalBlocks = modal.blocks as Record<string, unknown>[];
            const element = (modalBlocks[0] as Record<string, unknown>).element as Record<string, unknown>;
            expect(element.type).toBe('datepicker');
        });

        it('should create radio_buttons for radio questions', () => {
            const form = {
                questions: [
                    {
                        id: 'color', label: 'Favorite Color', required: true,
                        type: { type: 'radio' as const, options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] }
                    }
                ]
            };
            const modal = buildFormModal(form as never);
            const modalBlocks = modal.blocks as Record<string, unknown>[];
            const element = (modalBlocks[0] as Record<string, unknown>).element as Record<string, unknown>;
            expect(element.type).toBe('radio_buttons');
            expect((element.options as Record<string, unknown>[]).length).toBe(2);
        });

        it('should create static_select for dropdown questions', () => {
            const form = {
                questions: [
                    {
                        id: 'size', label: 'Size', required: true,
                        type: { type: 'dropdown' as const, options: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }] }
                    }
                ]
            };
            const modal = buildFormModal(form as never);
            const modalBlocks = modal.blocks as Record<string, unknown>[];
            const element = (modalBlocks[0] as Record<string, unknown>).element as Record<string, unknown>;
            expect(element.type).toBe('static_select');
        });

        it('should create checkboxes for checkbox questions', () => {
            const form = {
                questions: [
                    {
                        id: 'toppings', label: 'Toppings', required: false,
                        type: { type: 'checkbox' as const, options: [{ value: 'cheese', label: 'Cheese' }, { value: 'pepperoni', label: 'Pepperoni' }] }
                    }
                ]
            };
            const modal = buildFormModal(form as never);
            const modalBlocks = modal.blocks as Record<string, unknown>[];
            const element = (modalBlocks[0] as Record<string, unknown>).element as Record<string, unknown>;
            expect(element.type).toBe('checkboxes');
        });

        it('should mark required fields as non-optional', () => {
            const form = {
                questions: [
                    { id: 'req', label: 'Required', required: true, type: { type: 'text' as const } },
                    { id: 'opt', label: 'Optional', required: false, type: { type: 'text' as const } }
                ]
            };
            const modal = buildFormModal(form as never);
            const modalBlocks = modal.blocks as Record<string, unknown>[];
            expect((modalBlocks[0] as Record<string, unknown>).optional).toBe(false);
            expect((modalBlocks[1] as Record<string, unknown>).optional).toBe(true);
        });

        it('should truncate long titles to 24 chars', () => {
            const form = {
                title: 'This Is A Very Long Modal Title That Exceeds Limit',
                questions: [
                    { id: 'q', label: 'Q', required: false, type: { type: 'text' as const } }
                ]
            };
            const modal = buildFormModal(form as never);
            expect(((modal.title as Record<string, unknown>).text as string).length).toBeLessThanOrEqual(24);
        });
    });

    describe('structured payload detection', () => {
        it('should detect and render code payloads', () => {
            const agent = createMockAgent();
            const result = createMockResult({
                payload: {
                    task: 'Calculate sum',
                    code: 'const sum = 1 + 2;',
                    results: '3'
                }
            });
            const blocks = buildRichResponse(result as never, agent as never, 'Response');

            const allText = blocks
                .filter(b => b.type === 'section')
                .map(b => ((b as Record<string, unknown>).text as Record<string, unknown>).text as string)
                .join(' ');
            expect(allText).toContain('Task');
        });

        it('should detect and render research payloads', () => {
            const agent = createMockAgent();
            const result = createMockResult({
                payload: {
                    metadata: { researchGoal: 'Analyze AI trends', status: 'completed' },
                    plan: { initialPlan: 'Survey recent papers', researchQuestions: ['What are the trends?'] },
                    findings: [{ heading: 'Trend 1', content: 'LLMs are growing' }],
                    sources: [{ title: 'ArXiv', url: 'https://arxiv.org' }]
                }
            });
            const blocks = buildRichResponse(result as never, agent as never, 'Response');

            const headerBlocks = blocks.filter(b => b.type === 'header');
            expect(headerBlocks.length).toBeGreaterThanOrEqual(1);
        });

        it('should reject orchestration payloads', () => {
            const agent = createMockAgent();
            const result = createMockResult({
                payload: {
                    subAgentResult: { success: true },
                    shouldTerminate: false
                }
            });
            // Should fall back to text rendering, not structured
            const blocks = buildRichResponse(result as never, agent as never, 'Some text');
            const sectionBlocks = blocks.filter(b => b.type === 'section');
            expect(sectionBlocks.length).toBeGreaterThan(0);
        });
    });

    describe('enforceBlockLimit byte-size enforcement', () => {
        it('should pass through blocks under both count and byte limits', () => {
            const agent = createMockAgent();
            const blocks = buildRichResponse(null, agent as never, 'Short response');
            expect(blocks.length).toBeLessThan(50);
            // No truncation notice
            const hasNotice = blocks.some(b =>
                b.type === 'context' &&
                JSON.stringify(b).includes('truncated')
            );
            expect(hasNotice).toBe(false);
        });

        it('should enforce byte limit when blocks are few but large', () => {
            const agent = createMockAgent();
            // Generate 30 blocks with 2500 chars each = ~75KB JSON, under 50 blocks but over 38KB
            const longSections = Array.from({ length: 30 }, (_, i) =>
                `# Section ${i}\n\n${'A'.repeat(2500)}`
            ).join('\n\n');
            const blocks = buildRichResponse(null, agent as never, longSections);

            // Should be truncated (byte enforcement)
            const payloadSize = JSON.stringify(blocks).length;
            // Payload should be under ~40KB (38K + notice/button overhead)
            expect(payloadSize).toBeLessThan(42_000);
        });

        it('should store full text for "View Full" modal retrieval', () => {
            const agent = createMockAgent();
            const longText = Array.from({ length: 100 }, (_, i) => `# Section ${i}\n\nParagraph ${i}.`).join('\n\n');
            const blocks = buildRichResponse(null, agent as never, longText);

            // Find the "View Full" button
            const actionsBlock = blocks.find(b => {
                if (b.type !== 'actions') return false;
                const elements = (b as Record<string, unknown>).elements as Record<string, unknown>[];
                return elements.some(e => (e as Record<string, unknown>).action_id === 'mj:view_full:response');
            });

            if (actionsBlock) {
                const elements = (actionsBlock as Record<string, unknown>).elements as Record<string, unknown>[];
                const button = elements.find(e => (e as Record<string, unknown>).action_id === 'mj:view_full:response') as Record<string, unknown>;
                const storeKey = button.value as string;
                expect(storeKey).toBeDefined();
                expect(storeKey).not.toBe('no_stored_text');

                // Retrieve stored text
                const retrieved = getFullResponseText(storeKey);
                expect(retrieved).toBe(longText);
            }
        });
    });

    describe('catch-all payload content rendering', () => {
        it('should render payload content when structured detection misses it', () => {
            const blogContent = 'A'.repeat(300); // Substantial content
            const result = createMockResult({
                payload: {
                    blogPost: {
                        title: 'AI in Healthcare',
                        body: blogContent,
                    },
                },
            });
            const agent = createMockAgent();
            const blocks = buildRichResponse(
                result as never,
                agent as never,
                'Your blog post is ready.',
            );

            // Should find a header block with the title
            const headerBlocks = blocks.filter(
                b => b.type === 'header' &&
                    ((b.text as Record<string, unknown>)?.text as string)?.includes('AI in Healthcare'),
            );
            expect(headerBlocks.length).toBeGreaterThan(0);

            // Should find section blocks with content
            const sectionBlocks = blocks.filter(b => b.type === 'section');
            expect(sectionBlocks.length).toBeGreaterThan(0);
        });

        it('should render deeply nested payload content (Marketing Agent style)', () => {
            const blogText = 'This is a comprehensive guide to artificial intelligence in modern healthcare. '.repeat(10);
            const result = createMockResult({
                payload: {
                    campaign: {
                        deliverables: [{
                            type: 'blog',
                            content: blogText,
                        }],
                    },
                },
            });
            const agent = createMockAgent();
            const blocks = buildRichResponse(
                result as never,
                agent as never,
                'Your campaign deliverables are ready.',
            );

            // Should render the blog text content somewhere in the blocks
            const allText = blocks.map(b => {
                const textObj = b.text as Record<string, unknown> | undefined;
                return (textObj?.text as string) ?? '';
            }).join(' ');
            expect(allText).toContain('comprehensive guide');
        });

        it('should NOT render payload content when it duplicates responseText', () => {
            const responseText = 'Here is your detailed blog post about AI.';
            const result = createMockResult({
                payload: { message: responseText }, // Same content
            });
            const agent = createMockAgent();
            const blocks = buildRichResponse(
                result as never,
                agent as never,
                responseText,
            );

            // Should NOT have a "View Full Content" button (content is same as message)
            const viewButtons = blocks.filter(b =>
                b.type === 'actions' &&
                Array.isArray(b.elements) &&
                (b.elements as Record<string, unknown>[]).some(
                    e => (e as Record<string, unknown>).action_id === 'mj:view_full:payload',
                ),
            );
            expect(viewButtons.length).toBe(0);
        });

        it('should skip payload content shorter than 200 chars', () => {
            const result = createMockResult({
                payload: { note: 'Short note' }, // Too short
            });
            const agent = createMockAgent();
            const blocks = buildRichResponse(
                result as never,
                agent as never,
                'Response summary.',
            );

            // Should NOT render any header for short payload
            const headerBlocks = blocks.filter(b => b.type === 'header');
            expect(headerBlocks.length).toBe(0);
        });

        it('should add View Full Content button for long payload content', () => {
            const longContent = 'This is a very detailed blog post. '.repeat(100); // ~3500 chars
            const result = createMockResult({
                payload: {
                    title: 'My Blog Post',
                    body: longContent,
                },
            });
            const agent = createMockAgent();
            const blocks = buildRichResponse(
                result as never,
                agent as never,
                'Your blog post is ready.',
            );

            // Should have a "View Full Content" button (either via artifact card or catch-all)
            const viewButtons = blocks.filter(b =>
                b.type === 'actions' &&
                Array.isArray(b.elements) &&
                (b.elements as Record<string, unknown>[]).some(
                    e => {
                        const actionId = (e as Record<string, unknown>).action_id as string;
                        return actionId?.startsWith('mj:view_full:');
                    },
                ),
            );
            expect(viewButtons.length).toBeGreaterThanOrEqual(1);

            // The store key should be retrievable
            const btn = ((viewButtons[0].elements as Record<string, unknown>[])
                .find(e => ((e as Record<string, unknown>).action_id as string)?.startsWith('mj:view_full:'))) as Record<string, unknown>;
            const storeKey = btn.value as string;
            const retrieved = getFullResponseText(storeKey);
            expect(retrieved).toBe(longContent);
        });

        it('should skip orchestration payloads', () => {
            const result = createMockResult({
                payload: {
                    taskGraph: { steps: ['step1'] },
                    actionResult: { status: 'completed', message: 'A'.repeat(300) },
                },
            });
            const agent = createMockAgent();
            const blocks = buildRichResponse(
                result as never,
                agent as never,
                'Done.',
            );

            // Should NOT render orchestration content as artifact
            const headerBlocks = blocks.filter(b => b.type === 'header');
            expect(headerBlocks.length).toBe(0);
        });

        it('should extract content from FinalPayload when in-memory payload is missing', () => {
            const blogContent = 'B'.repeat(300);
            const result = createMockResult({
                payload: null,
                agentRun: {
                    StartedAt: new Date('2025-01-01T00:00:00Z'),
                    CompletedAt: new Date('2025-01-01T00:00:04.2Z'),
                    Steps: [],
                    TotalTokensUsed: 500,
                    FinalPayload: JSON.stringify({
                        title: 'Report',
                        content: blogContent,
                    }),
                },
            });
            const agent = createMockAgent();
            const blocks = buildRichResponse(
                result as never,
                agent as never,
                'Report is ready.',
            );

            const headerBlocks = blocks.filter(
                b => b.type === 'header' &&
                    ((b.text as Record<string, unknown>)?.text as string)?.includes('Report'),
            );
            expect(headerBlocks.length).toBeGreaterThan(0);
        });
    });
});
