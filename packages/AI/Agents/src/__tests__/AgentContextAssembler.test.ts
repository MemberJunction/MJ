import { describe, it, expect, vi } from 'vitest';
import { AgentContextAssembler } from '../AgentContextAssembler';
import { AgentChatMessage, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import {
    SCRATCHPAD_NOTES_PLACEHOLDER,
    SCRATCHPAD_TASKS_PLACEHOLDER,
    SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER,
} from '../constants';

describe('AgentContextAssembler', () => {
    describe('AssembleOutgoingMessages', () => {
        it('should strip prior volatileState messages in replace mode and append the new fragment', () => {
            const assembler = new AgentContextAssembler();
            const history: ChatMessage[] = [
                { role: 'system', content: 'System prompt' },
                { role: 'user', content: 'Hello <mj-runtime-state>injected</mj-runtime-state>' },
                {
                    role: 'user',
                    content: '<mj-runtime-state>old</mj-runtime-state>',
                    metadata: { volatileState: true, turnAdded: 1 },
                } as AgentChatMessage,
            ];
            const fragment: AgentChatMessage = {
                role: 'user',
                content: '<mj-runtime-state>fresh</mj-runtime-state>',
                metadata: { volatileState: true, turnAdded: 2 },
            };

            const outgoing = assembler.AssembleOutgoingMessages(history, fragment, false);
            expect(outgoing).toHaveLength(3);
            expect(outgoing[0].content).toBe('System prompt');
            expect(outgoing[1].content).not.toContain('<mj-runtime-state>');
            expect(outgoing[2]).toBe(fragment);
        });

        it('should retain prior volatileState messages in append-only mode', () => {
            const assembler = new AgentContextAssembler();
            const priorFragment: AgentChatMessage = {
                role: 'user',
                content: '<mj-runtime-state>turn-1</mj-runtime-state>',
                metadata: { volatileState: true, turnAdded: 1 },
            };
            const freshFragment: AgentChatMessage = {
                role: 'user',
                content: '<mj-runtime-state>turn-2</mj-runtime-state>',
                metadata: { volatileState: true, turnAdded: 2 },
            };
            const history: ChatMessage[] = [{ role: 'system', content: 'System' }, priorFragment];

            const outgoing = assembler.AssembleOutgoingMessages(history, freshFragment, true);
            expect(outgoing).toHaveLength(3);
            expect(outgoing[1]).toBe(priorFragment);
            expect(outgoing[2]).toBe(freshFragment);
        });
    });

    describe('TemplateTextEmbedsVolatileState', () => {
        it('should detect embedded volatile markers in template text', () => {
            const assembler = new AgentContextAssembler();
            expect(assembler.TemplateTextEmbedsVolatileState('Prompt with {{ _CURRENT_DATE }}')).toBe(true);
            expect(assembler.TemplateTextEmbedsVolatileState('Prompt referencing <mj-runtime-state> block')).toBe(
                false
            );
            expect(assembler.TemplateTextEmbedsVolatileState('Static prompt with neither')).toBe(false);
        });
    });

    describe('ResolveClientToolsForRun & BuildClientToolPromptSection', () => {
        it('should resolve client tools through ResolveClientToolsForRun and format them in BuildClientToolPromptSection', () => {
            const assembler = new AgentContextAssembler();
            const getClientToolsSpy = vi
                .spyOn(AIEngine.Instance, 'GetClientToolsForAgent')
                .mockReturnValue([]);
            const resolveSpy = vi.spyOn(assembler, 'ResolveClientToolsForRun');
            const agent = { ID: '11111111-1111-4111-8111-111111111111' } as MJAIAgentEntityExtended;

            const section = assembler.BuildClientToolPromptSection(agent, {
                clientTools: [
                    {
                        Name: 'NavigateToRecord',
                        Description: 'Opens a record view',
                        Category: 'Navigation',
                        InputSchema: {
                            type: 'object',
                            properties: { recordId: { type: 'string', description: 'Target ID' } },
                            required: ['recordId'],
                        },
                    },
                ],
            });

            expect(resolveSpy).toHaveBeenCalledOnce();
            expect(section).toContain('- **NavigateToRecord** [Navigation]: Opens a record view');
            expect(section).toContain('Inputs: `recordId`\\* — Target ID');
            getClientToolsSpy.mockRestore();
        });
    });

    describe('ReadScratchpadFromTemplateData & BuildRuntimeStateFragment', () => {
        it('should read scratchpad strings and build a serialized runtime state XML fragment', () => {
            const assembler = new AgentContextAssembler();
            const scratchpad = assembler.ReadScratchpadFromTemplateData({
                [SCRATCHPAD_NOTES_PLACEHOLDER]: 'Note 1',
                [SCRATCHPAD_TASKS_PLACEHOLDER]: '- [ ] Task 1',
                [SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER]: '0/1 completed',
            });
            expect(scratchpad).toEqual({
                Notes: 'Note 1',
                Tasks: '- [ ] Task 1',
                TaskSummary: '0/1 completed',
            });

            const xml = assembler.BuildRuntimeStateFragment({
                DateTime: { Date: '2026-11-02', DayOfWeek: 'Monday', Time: '16:00:00' },
                Scratchpad: scratchpad,
                Payload: { count: 3 },
                IncludePayload: true,
                Specialization: 'Focus on financial metrics.',
            });
            expect(xml).toContain('<mj-runtime-state>');
            expect(xml).toContain('2026-11-02');
            expect(xml).toContain('Note 1');
            expect(xml).toContain('{"count":3}');
            expect(xml).toContain('Focus on financial metrics.');
        });
    });

    describe('BuildAppContextSection', () => {
        it('should format current application context and dashboard state into markdown', () => {
            const assembler = new AgentContextAssembler();
            const markdown = assembler.BuildAppContextSection({
                appContext: {
                    App: { Name: 'Sales Hub', Description: 'CRM workspace' },
                    ActiveNavItem: { Name: 'Pipeline', Description: 'Deal stages', ResourceType: 'Dashboard' },
                    OtherNavItems: [{ Name: 'Accounts', Description: 'Customer accounts' }],
                    User: { Name: 'Jane Doe', Roles: ['Sales', 'Admin'] },
                    AdditionalContext: { selectedStage: 'Negotiation', filterCount: 2 },
                },
            });
            expect(markdown).toContain('### Current Application Context');
            expect(markdown).toContain('**Sales Hub** application — CRM workspace');
            expect(markdown).toContain('**Active view:** Pipeline — Deal stages (Dashboard)');
            expect(markdown).toContain('- Accounts — Customer accounts');
            expect(markdown).toContain('**User:** Jane Doe (Roles: Sales, Admin)');
            expect(markdown).toContain('- selectedStage: Negotiation');
        });
    });

    describe('ExtractSchemaDefaults & ApplyResponseTypeAutoAlignment', () => {
        it('should extract schema defaults and align responseType flags with docs and gates', () => {
            const assembler = new AgentContextAssembler();
            const defaults = assembler.ExtractSchemaDefaults(
                JSON.stringify({
                    properties: {
                        includeForEachDocs: { default: false },
                        enableTaskGraphs: { default: true },
                    },
                })
            );
            expect(defaults).toEqual({
                includeForEachDocs: false,
                enableTaskGraphs: true,
            });

            const params: Record<string, unknown> = {
                ...defaults,
                decisionsEnabled: false,
            };
            assembler.ApplyResponseTypeAutoAlignment(params, undefined, false);
            const responseType = params.includeResponseTypeDefinition as Record<string, unknown>;
            expect(responseType.forEach).toBe(false);
            expect(responseType.tasks).toBe(true);
            expect(responseType.handoff).toBe(false);
            expect(responseType.decisions).toBe(false);
            expect(responseType.finishIf).toBe(false);
        });
    });
});
