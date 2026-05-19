/**
 * Unit tests for teams-card-builder.ts — rich Adaptive Card response builder.
 */
import { describe, it, expect } from 'vitest';
import {
    buildRichAdaptiveCard,
    buildAgentHeader,
    buildTextBody,
    buildArtifactCard,
    buildActionButtons,
    buildExplorerLink,
    buildMetadataFooter,
    buildErrorCard,
    buildResponseFormElements,
} from '../teams/teams-card-builder.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockAgent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        Name: 'Test Agent',
        LogoURL: null,
        ...overrides,
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
        ...overrides,
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('teams-card-builder', () => {
    describe('buildAgentHeader', () => {
        it('should create a ColumnSet with agent name', () => {
            const agent = createMockAgent({ Name: 'Sage' });
            const header = buildAgentHeader(agent as never);

            expect(header.type).toBe('ColumnSet');
            const columns = header.columns as Record<string, unknown>[];
            expect(columns.length).toBeGreaterThan(0);

            // Find the name column
            const nameCol = columns.find(c => {
                const items = (c as Record<string, unknown>).items as Record<string, unknown>[];
                return items?.some(i => (i as Record<string, unknown>).text === '**Sage**');
            });
            expect(nameCol).toBeDefined();
        });

        it('should include Image column when LogoURL is HTTPS', () => {
            const agent = createMockAgent({
                Name: 'Research Agent',
                LogoURL: 'https://example.com/avatar.png',
            });
            const header = buildAgentHeader(agent as never);
            const columns = header.columns as Record<string, unknown>[];

            const imageCol = columns.find(c => {
                const items = (c as Record<string, unknown>).items as Record<string, unknown>[];
                return items?.some(i => (i as Record<string, unknown>).type === 'Image');
            });
            expect(imageCol).toBeDefined();
            const imageItem = ((imageCol as Record<string, unknown>).items as Record<string, unknown>[])[0];
            expect(imageItem.url).toBe('https://example.com/avatar.png');
        });

        it('should NOT include Image for non-HTTPS URLs', () => {
            const agent = createMockAgent({ LogoURL: 'http://insecure.com/avatar.png' });
            const header = buildAgentHeader(agent as never);
            const columns = header.columns as Record<string, unknown>[];

            const imageCol = columns.find(c => {
                const items = (c as Record<string, unknown>).items as Record<string, unknown>[];
                return items?.some(i => (i as Record<string, unknown>).type === 'Image');
            });
            expect(imageCol).toBeUndefined();
        });

        it('should NOT include Image for data URIs', () => {
            const agent = createMockAgent({ LogoURL: 'data:image/png;base64,abc123' });
            const header = buildAgentHeader(agent as never);
            const columns = header.columns as Record<string, unknown>[];
            expect(columns).toHaveLength(1); // Only name column
        });

        it('should handle null Name gracefully', () => {
            const agent = createMockAgent({ Name: null });
            const header = buildAgentHeader(agent as never);
            const columns = header.columns as Record<string, unknown>[];
            const nameCol = columns.find(c => {
                const items = (c as Record<string, unknown>).items as Record<string, unknown>[];
                return items?.some(i => (i as Record<string, unknown>).text === '**Agent**');
            });
            expect(nameCol).toBeDefined();
        });
    });

    describe('buildTextBody', () => {
        it('should convert markdown to TextBlock elements', () => {
            const elements = buildTextBody('Hello **world**');
            expect(elements.length).toBeGreaterThan(0);
            expect(elements[0].type).toBe('TextBlock');
        });

        it('should handle headers', () => {
            const elements = buildTextBody('# My Title\n\nSome text');
            const headerEl = elements.find(e =>
                (e as Record<string, unknown>).size === 'Large' &&
                (e as Record<string, unknown>).weight === 'Bolder'
            );
            expect(headerEl).toBeDefined();
            expect((headerEl as Record<string, unknown>).text).toBe('My Title');
        });

        it('should handle code blocks with Monospace font', () => {
            const elements = buildTextBody('```js\nconsole.log("hi")\n```');
            const codeEl = elements.find(e => (e as Record<string, unknown>).fontType === 'Monospace');
            expect(codeEl).toBeDefined();
        });

        it('should handle empty text', () => {
            const elements = buildTextBody('');
            expect(elements.length).toBeGreaterThan(0);
            expect(elements[0].text).toBe('(empty response)');
        });
    });

    describe('buildArtifactCard', () => {
        it('should create a Container with explorer link', () => {
            const container = buildArtifactCard('artifact-123', 'https://explorer.example.com');
            expect(container.type).toBe('Container');
            expect(container.style).toBe('emphasis');

            const selectAction = container.selectAction as Record<string, unknown>;
            expect(selectAction.type).toBe('Action.OpenUrl');
            expect(selectAction.url).toBe('https://explorer.example.com/resource/artifact/artifact-123');
        });

        it('should strip trailing slashes from explorer URL', () => {
            const container = buildArtifactCard('art-1', 'https://explorer.example.com/');
            const selectAction = container.selectAction as Record<string, unknown>;
            expect(selectAction.url).toBe('https://explorer.example.com/resource/artifact/art-1');
        });
    });

    describe('buildActionButtons', () => {
        it('should create Action.OpenUrl for open:url commands', () => {
            const commands = [
                { type: 'open:url' as const, label: 'Visit', url: 'https://example.com' },
            ];
            const actions = buildActionButtons(commands);
            expect(actions).toHaveLength(1);
            expect(actions[0].type).toBe('Action.OpenUrl');
            expect(actions[0].url).toBe('https://example.com');
            expect(actions[0].title).toBe('Visit');
        });

        it('should deep-link open:resource when explorer URL is provided', () => {
            const commands = [
                { type: 'open:resource' as const, label: 'View Customer', resourceType: 'Record' as const, entityName: 'Customers', resourceId: 'abc-123' },
            ];
            const actions = buildActionButtons(commands, 'https://explorer.myco.com');
            expect(actions).toHaveLength(1);
            expect(actions[0].url).toBe('https://explorer.myco.com/resource/record/Customers/abc-123');
        });

        it('should deep-link dashboard resources', () => {
            const commands = [
                { type: 'open:resource' as const, label: 'Sales Dashboard', resourceType: 'Dashboard' as const, resourceId: 'dash-1' },
            ];
            const actions = buildActionButtons(commands, 'https://explorer.myco.com/');
            expect(actions[0].url).toBe('https://explorer.myco.com/resource/dashboard/dash-1');
        });

        it('should skip open:resource when no explorer URL', () => {
            const commands = [
                { type: 'open:resource' as const, label: 'View Record', resourceType: 'Record' as const, entityName: 'Orders', resourceId: '456' },
            ];
            const actions = buildActionButtons(commands);
            expect(actions).toHaveLength(0);
        });

        it('should limit to 5 commands', () => {
            const commands = Array.from({ length: 8 }, (_, i) => ({
                type: 'open:url' as const,
                label: `Action ${i}`,
                url: `https://example.com/${i}`,
            }));
            const actions = buildActionButtons(commands);
            expect(actions).toHaveLength(5);
        });
    });

    describe('buildExplorerLink', () => {
        it('should return artifact link when artifactId is provided', () => {
            const action = buildExplorerLink('https://explorer.example.com', 'art-1');
            expect(action).not.toBeNull();
            expect(action!.type).toBe('Action.OpenUrl');
            expect(action!.url).toBe('https://explorer.example.com/resource/artifact/art-1');
            expect(action!.title).toBe('View in MJ Explorer');
        });

        it('should return conversation link when only conversationId is provided', () => {
            const action = buildExplorerLink('https://explorer.example.com', undefined, 'convo-1');
            expect(action).not.toBeNull();
            expect(action!.url).toContain('/app/Chat/Conversations?conversationId=convo-1');
            expect(action!.title).toBe('Open in MJ Explorer');
        });

        it('should prefer artifact link over conversation link', () => {
            const action = buildExplorerLink('https://explorer.example.com', 'art-1', 'convo-1');
            expect(action!.url).toContain('/resource/artifact/art-1');
        });

        it('should return null when no explorer URL', () => {
            expect(buildExplorerLink(undefined, 'art-1')).toBeNull();
        });

        it('should return null when neither artifact nor conversation ID', () => {
            expect(buildExplorerLink('https://explorer.example.com')).toBeNull();
        });
    });

    describe('buildMetadataFooter', () => {
        it('should show timing information', () => {
            const result = createMockResult();
            const footer = buildMetadataFooter(result as never);
            expect(footer.type).toBe('TextBlock');
            expect(footer.isSubtle).toBe(true);
            expect((footer.text as string)).toContain('4.2s');
        });

        it('should show step count', () => {
            const result = createMockResult();
            const footer = buildMetadataFooter(result as never);
            expect((footer.text as string)).toContain('1 step');
        });

        it('should show token count', () => {
            const result = createMockResult();
            const footer = buildMetadataFooter(result as never);
            expect((footer.text as string)).toContain('1,240 tokens');
        });

        it('should show "Completed" when no timing data available', () => {
            const result = createMockResult({ agentRun: {} });
            const footer = buildMetadataFooter(result as never);
            expect(footer.text).toBe('Completed');
        });

        it('should show cost when available', () => {
            const result = createMockResult({
                agentRun: {
                    StartedAt: new Date('2025-01-01T00:00:00Z'),
                    CompletedAt: new Date('2025-01-01T00:00:02Z'),
                    Steps: [],
                    TotalTokensUsed: 500,
                    TotalCostRollup: 0.0345,
                },
            });
            const footer = buildMetadataFooter(result as never);
            expect((footer.text as string)).toContain('$0.03');
        });
    });

    describe('buildErrorCard', () => {
        it('should create a full Adaptive Card with error message', () => {
            const card = buildErrorCard('Something went wrong');
            expect(card.type).toBe('AdaptiveCard');
            expect(card.version).toBe('1.4');

            const body = card.body as Record<string, unknown>[];
            expect(body).toHaveLength(1);
            expect(body[0].color).toBe('Attention');
            expect((body[0].text as string)).toContain('Something went wrong');
        });
    });

    describe('buildRichAdaptiveCard', () => {
        it('should produce a valid Adaptive Card structure', () => {
            const agent = createMockAgent({ Name: 'Sage' });
            const card = buildRichAdaptiveCard(null, agent as never, 'Hello!');

            expect(card.type).toBe('AdaptiveCard');
            expect(card.version).toBe('1.4');
            expect(card['$schema']).toBeDefined();
            expect(Array.isArray(card.body)).toBe(true);
        });

        it('should include agent header as first body element', () => {
            const agent = createMockAgent({ Name: 'Sage' });
            const card = buildRichAdaptiveCard(null, agent as never, 'Hello!');
            const body = card.body as Record<string, unknown>[];
            expect(body[0].type).toBe('ColumnSet');
        });

        it('should include text content after header', () => {
            const agent = createMockAgent();
            const card = buildRichAdaptiveCard(null, agent as never, 'Some response text');
            const body = card.body as Record<string, unknown>[];

            const textBlocks = body.filter(e => e.type === 'TextBlock' && !(e as Record<string, unknown>).isSubtle);
            expect(textBlocks.length).toBeGreaterThan(0);
        });

        it('should add separator to first text element', () => {
            const agent = createMockAgent();
            const card = buildRichAdaptiveCard(null, agent as never, 'Response');
            const body = card.body as Record<string, unknown>[];

            // Second element (after ColumnSet) should have separator
            expect(body[1].separator).toBe(true);
        });

        it('should include metadata footer when agentRun is present', () => {
            const agent = createMockAgent();
            const result = createMockResult();
            const card = buildRichAdaptiveCard(result as never, agent as never, 'Response');
            const body = card.body as Record<string, unknown>[];

            const footer = body.find(e =>
                e.type === 'TextBlock' && (e as Record<string, unknown>).isSubtle === true
            );
            expect(footer).toBeDefined();
            expect((footer as Record<string, unknown>).text as string).toContain('4.2s');
        });

        it('should include action buttons when commands are present', () => {
            const agent = createMockAgent();
            const result = createMockResult({
                actionableCommands: [
                    { type: 'open:url', label: 'Docs', url: 'https://docs.example.com' },
                ],
            });
            const card = buildRichAdaptiveCard(result as never, agent as never, 'Response');
            const actions = card.actions as Record<string, unknown>[];
            expect(actions).toBeDefined();
            expect(actions.length).toBeGreaterThan(0);
            expect(actions[0].type).toBe('Action.OpenUrl');
        });

        it('should include Explorer action (not body link) when conversationId is provided', () => {
            const agent = createMockAgent();
            const result = createMockResult();
            const card = buildRichAdaptiveCard(result as never, agent as never, 'Response', {
                explorerBaseURL: 'https://explorer.example.com',
                conversationId: 'convo-123',
            });

            // Should NOT have inline body link
            const body = card.body as Record<string, unknown>[];
            const inlineLink = body.find(e =>
                e.type === 'TextBlock' &&
                typeof (e as Record<string, unknown>).text === 'string' &&
                ((e as Record<string, unknown>).text as string).includes('MJ Explorer')
            );
            expect(inlineLink).toBeUndefined();

            // Should have action button
            const actions = card.actions as Record<string, unknown>[];
            const explorerAction = actions?.find(a =>
                (a as Record<string, unknown>).title === 'Open in MJ Explorer'
            );
            expect(explorerAction).toBeDefined();
        });

        it('should include Explorer action when artifactId is provided', () => {
            const agent = createMockAgent();
            const result = createMockResult();
            const card = buildRichAdaptiveCard(result as never, agent as never, 'Response', {
                explorerBaseURL: 'https://explorer.example.com',
                artifactId: 'artifact-abc',
            });
            const actions = card.actions as Record<string, unknown>[];
            const explorerAction = actions?.find(a =>
                (a as Record<string, unknown>).title === 'View in MJ Explorer'
            );
            expect(explorerAction).toBeDefined();
        });

        it('should NOT include Explorer link when no explorerBaseURL', () => {
            const agent = createMockAgent();
            const result = createMockResult();
            const card = buildRichAdaptiveCard(result as never, agent as never, 'Response');

            const actions = card.actions as Record<string, unknown>[] | undefined;
            const explorerAction = actions?.find(a =>
                typeof (a as Record<string, unknown>).title === 'string' &&
                ((a as Record<string, unknown>).title as string).includes('MJ Explorer')
            );
            expect(explorerAction).toBeUndefined();
        });

        it('should NOT include Explorer link when explorerBaseURL set but no IDs', () => {
            const agent = createMockAgent();
            const result = createMockResult();
            const card = buildRichAdaptiveCard(result as never, agent as never, 'Response', {
                explorerBaseURL: 'https://explorer.example.com',
            });

            const actions = card.actions as Record<string, unknown>[] | undefined;
            const explorerAction = actions?.find(a =>
                typeof (a as Record<string, unknown>).title === 'string' &&
                ((a as Record<string, unknown>).title as string).includes('MJ Explorer')
            );
            expect(explorerAction).toBeUndefined();
        });
    });

    describe('buildResponseFormElements', () => {
        it('should render form title and description', () => {
            const form = {
                title: 'Campaign Settings',
                description: 'Configure your campaign',
                submitLabel: 'Launch',
                questions: [
                    { id: 'name', label: 'Name', required: true, type: { type: 'text' as const } },
                ],
            };
            const elements = buildResponseFormElements(form as never);

            const titleEl = elements.find(e =>
                e.type === 'TextBlock' && (e as Record<string, unknown>).text === '**Campaign Settings**'
            );
            expect(titleEl).toBeDefined();

            const descEl = elements.find(e =>
                e.type === 'TextBlock' && (e as Record<string, unknown>).text === 'Configure your campaign'
            );
            expect(descEl).toBeDefined();
        });

        it('should render Input.Text for text questions', () => {
            const form = {
                questions: [
                    { id: 'name', label: 'Your Name', required: true, type: { type: 'text' as const, placeholder: 'Enter name' } },
                ],
            };
            const elements = buildResponseFormElements(form as never);
            const input = elements.find(e => e.type === 'Input.Text');
            expect(input).toBeDefined();
            expect((input as Record<string, unknown>).id).toBe('mj_form_name');
            expect((input as Record<string, unknown>).isRequired).toBe(true);
            expect((input as Record<string, unknown>).placeholder).toBe('Enter name');
        });

        it('should render multiline Input.Text for textarea questions', () => {
            const form = {
                questions: [
                    { id: 'bio', label: 'Bio', required: false, type: { type: 'textarea' as const } },
                ],
            };
            const elements = buildResponseFormElements(form as never);
            const input = elements.find(e => e.type === 'Input.Text');
            expect(input).toBeDefined();
            expect((input as Record<string, unknown>).isMultiline).toBe(true);
        });

        it('should render Input.Number for number questions', () => {
            const form = {
                questions: [
                    { id: 'age', label: 'Age', required: true, type: { type: 'number' as const, min: 0, max: 120 } },
                ],
            };
            const elements = buildResponseFormElements(form as never);
            const input = elements.find(e => e.type === 'Input.Number');
            expect(input).toBeDefined();
            expect((input as Record<string, unknown>).min).toBe(0);
            expect((input as Record<string, unknown>).max).toBe(120);
        });

        it('should render Input.Date for date questions', () => {
            const form = {
                questions: [
                    { id: 'dob', label: 'Date of Birth', type: { type: 'date' as const } },
                ],
            };
            const elements = buildResponseFormElements(form as never);
            const input = elements.find(e => e.type === 'Input.Date');
            expect(input).toBeDefined();
        });

        it('should render Input.Time for time questions', () => {
            const form = {
                questions: [
                    { id: 'start', label: 'Start Time', type: { type: 'time' as const } },
                ],
            };
            const elements = buildResponseFormElements(form as never);
            const input = elements.find(e => e.type === 'Input.Time');
            expect(input).toBeDefined();
        });

        it('should render expanded Input.ChoiceSet for radio questions', () => {
            const form = {
                questions: [{
                    id: 'color', label: 'Color', required: true,
                    type: {
                        type: 'radio' as const,
                        options: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }],
                    },
                }],
            };
            const elements = buildResponseFormElements(form as never);
            const input = elements.find(e => e.type === 'Input.ChoiceSet');
            expect(input).toBeDefined();
            expect((input as Record<string, unknown>).style).toBe('Expanded');
            expect((input as Record<string, unknown>).choices).toHaveLength(2);
        });

        it('should render compact Input.ChoiceSet for dropdown questions', () => {
            const form = {
                questions: [{
                    id: 'size', label: 'Size',
                    type: {
                        type: 'dropdown' as const,
                        options: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }],
                    },
                }],
            };
            const elements = buildResponseFormElements(form as never);
            const input = elements.find(e => e.type === 'Input.ChoiceSet');
            expect(input).toBeDefined();
            expect((input as Record<string, unknown>).style).toBe('Compact');
        });

        it('should render multi-select Input.ChoiceSet for checkbox questions', () => {
            const form = {
                questions: [{
                    id: 'toppings', label: 'Toppings',
                    type: {
                        type: 'checkbox' as const,
                        options: [{ value: 'cheese', label: 'Cheese' }, { value: 'pepperoni', label: 'Pepperoni' }],
                    },
                }],
            };
            const elements = buildResponseFormElements(form as never);
            const input = elements.find(e => e.type === 'Input.ChoiceSet');
            expect(input).toBeDefined();
            expect((input as Record<string, unknown>).isMultiSelect).toBe(true);
        });

        it('should render ColumnSet with two date inputs for daterange', () => {
            const form = {
                questions: [
                    { id: 'period', label: 'Period', type: { type: 'daterange' as const } },
                ],
            };
            const elements = buildResponseFormElements(form as never);
            const columnSet = elements.find(e => e.type === 'ColumnSet');
            expect(columnSet).toBeDefined();
            const columns = (columnSet as Record<string, unknown>).columns as Record<string, unknown>[];
            expect(columns).toHaveLength(2);
        });

        it('should include submit ActionSet', () => {
            const form = {
                submitLabel: 'Go',
                questions: [
                    { id: 'q', label: 'Q', type: { type: 'text' as const } },
                ],
            };
            const elements = buildResponseFormElements(form as never);
            const actionSet = elements.find(e => e.type === 'ActionSet');
            expect(actionSet).toBeDefined();
            const actions = (actionSet as Record<string, unknown>).actions as Record<string, unknown>[];
            expect(actions[0].title).toBe('Go');
            expect(actions[0].style).toBe('positive');
        });

        it('should render form in full card when responseForm is present', () => {
            const agent = createMockAgent();
            const result = createMockResult({
                responseForm: {
                    title: 'Pick One',
                    questions: [{
                        id: 'choice', label: 'Option', required: true,
                        type: {
                            type: 'buttongroup' as const,
                            options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
                        },
                    }],
                },
            });
            const card = buildRichAdaptiveCard(result as never, agent as never, 'Please choose:');
            const body = card.body as Record<string, unknown>[];

            const choiceSet = body.find(e => e.type === 'Input.ChoiceSet');
            expect(choiceSet).toBeDefined();

            const actionSet = body.find(e => e.type === 'ActionSet');
            expect(actionSet).toBeDefined();
        });
    });

    describe('payload size enforcement', () => {
        it('should pass through cards under the size limit', () => {
            const agent = createMockAgent();
            const card = buildRichAdaptiveCard(null, agent as never, 'Short response');
            const payloadSize = JSON.stringify(card).length;
            expect(payloadSize).toBeLessThan(24_000);
        });

        it('should truncate large payloads', () => {
            const agent = createMockAgent();
            // 100 paragraphs × ~2000 chars each = ~200KB raw; triggers progressive truncation
            const longText = Array.from({ length: 100 }, (_, i) =>
                `Paragraph ${i}: ${'Lorem ipsum dolor sit amet. '.repeat(70)}`
            ).join('\n\n');

            const card = buildRichAdaptiveCard(null, agent as never, longText);
            const payloadSize = JSON.stringify(card).length;
            // Should be near or under 24KB limit (with truncation notice overhead)
            expect(payloadSize).toBeLessThan(30_000);
        });

        it('should add truncation notice when content is trimmed', () => {
            const agent = createMockAgent();
            const longText = Array.from({ length: 100 }, (_, i) =>
                `Paragraph ${i}: ${'Lorem ipsum dolor sit amet. '.repeat(70)}`
            ).join('\n\n');

            const card = buildRichAdaptiveCard(null, agent as never, longText);
            const body = card.body as Record<string, unknown>[];

            const truncationNotice = body.find(e =>
                e.type === 'TextBlock' &&
                typeof (e as Record<string, unknown>).text === 'string' &&
                ((e as Record<string, unknown>).text as string).toLowerCase().includes('truncat')
            );
            expect(truncationNotice).toBeDefined();
        });
    });
});
