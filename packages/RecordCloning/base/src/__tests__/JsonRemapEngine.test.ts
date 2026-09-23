import { describe, it, expect } from 'vitest';
import { ApplyJsonRemap, JSON_REMAP_PRESETS } from '../JsonRemapEngine';

describe('JsonRemapEngine', () => {
    describe('Path Grammar and Modes', () => {
        it('remaps nested identifiers and handles arrays with [*]', () => {
            const input = {
                Params: [
                    { Name: 'P1', ActionParamID: 'old-param-1' },
                    { Name: 'P2', ActionParamID: 'old-param-2' },
                ],
            };

            const keyMap = {
                'old-param-1': 'new-param-1',
                'old-param-2': 'new-param-2',
            };

            const result = ApplyJsonRemap(input, {
                Rules: [
                    { Path: 'Params[*].ActionParamID', Mode: 'remap' },
                ],
                KeyMap: keyMap,
            });

            expect(result.Success).toBe(true);
            const output = result.Output as typeof input;
            expect(output.Params[0].ActionParamID).toBe('new-param-1');
            expect(output.Params[1].ActionParamID).toBe('new-param-2');
        });

        it('regenerates UUIDs on mode="regenerate"', () => {
            const input = {
                id: 'static-id',
                panels: [{ id: 'old-panel-1' }, { id: 'old-panel-2' }],
            };

            const result = ApplyJsonRemap(input, {
                Rules: [{ Path: 'panels[*].id', Mode: 'regenerate' }],
            });

            expect(result.Success).toBe(true);
            const output = result.Output as typeof input;
            expect(output.panels[0].id).not.toBe('old-panel-1');
            expect(output.panels[1].id).not.toBe('old-panel-2');
            expect(output.panels[0].id).toMatch(/^[0-9a-f-]{36}$/);
        });

        it('nulls fields on mode="null"', () => {
            const input = {
                ConversationID: 'conv-1234',
                Title: 'Test Job',
            };

            const result = ApplyJsonRemap(input, {
                Rules: [{ Path: 'ConversationID', Mode: 'null' }],
            });

            expect(result.Success).toBe(true);
            const output = result.Output as typeof input;
            expect(output.ConversationID).toBeNull();
            expect(output.Title).toBe('Test Job');
        });

        it('drops properties on mode="drop"', () => {
            const input = {
                secret: 'sensitive',
                visible: 'ok',
            };

            const result = ApplyJsonRemap(input, {
                Rules: [{ Path: 'secret', Mode: 'drop' }],
            });

            expect(result.Success).toBe(true);
            const output = result.Output as Record<string, unknown>;
            expect(output.secret).toBeUndefined();
            expect(output.visible).toBe('ok');
            expect(result.DropCount).toBe(1);
        });
    });

    describe('Drop-and-Count & Empty Container Removal', () => {
        it('drops unmappable references when OnMissing="drop" and counts drops', () => {
            const input = {
                rules: [
                    { targetQuestionId: 'q-kept' },
                    { targetQuestionId: 'q-orphaned' },
                ],
            };

            const keyMap = {
                'q-kept': 'q-new-1',
            };

            const result = ApplyJsonRemap(input, {
                Rules: [
                    {
                        Path: 'rules[*].targetQuestionId',
                        Mode: 'remap',
                        OnMissing: 'drop',
                    },
                ],
                KeyMap: keyMap,
            });

            expect(result.Success).toBe(true);
            expect(result.DropCount).toBe(1);
            const output = result.Output as typeof input;
            expect(output.rules).toHaveLength(1);
            expect(output.rules[0].targetQuestionId).toBe('q-new-1');
        });

        it('removes empty array container when all elements are dropped', () => {
            const input = {
                allowedEntities: [{ id: 'ent-1' }, { id: 'ent-2' }],
                name: 'Role Permission',
            };

            const result = ApplyJsonRemap(input, {
                Rules: [
                    {
                        Path: 'allowedEntities[*].id',
                        Mode: 'remap',
                        OnMissing: 'drop',
                    },
                ],
                KeyMap: {}, // None mapped -> both dropped
                CleanEmptyContainers: true,
            });

            expect(result.Success).toBe(true);
            expect(result.DropCount).toBe(2);
            const output = result.Output as Record<string, unknown>;
            expect(output.allowedEntities).toBeUndefined();
            expect(output.name).toBe('Role Permission');
        });
    });

    describe('Malformed Payloads', () => {
        const badJson = '{ invalid: json syntax ';

        it('blocks node by default when payload is malformed JSON', () => {
            const result = ApplyJsonRemap(badJson, {
                Rules: [{ Path: 'foo', Mode: 'null' }],
            });

            expect(result.Success).toBe(false);
            expect(result.Blocked).toBe(true);
            expect(result.Warning?.Code).toBe('PAYLOAD_DROPPED');
        });

        it('copies malformed JSON verbatim when OnMalformed="copy"', () => {
            const result = ApplyJsonRemap(badJson, {
                Rules: [{ Path: 'foo', Mode: 'null' }],
                OnMalformed: 'copy',
            });

            expect(result.Success).toBe(true);
            expect(result.Blocked).toBe(false);
            expect(result.Output).toBe(badJson);
        });

        it('nulls malformed JSON when OnMalformed="null"', () => {
            const result = ApplyJsonRemap(badJson, {
                Rules: [{ Path: 'foo', Mode: 'null' }],
                OnMalformed: 'null',
            });

            expect(result.Success).toBe(true);
            expect(result.Blocked).toBe(false);
            expect(result.Output).toBeNull();
        });
    });

    describe('Built-in Presets', () => {
        it('applies dashboard-ui-config preset', () => {
            const dashboardConfig = {
                content: [
                    {
                        id: 'panel-1',
                        componentState: {
                            config: {
                                viewId: 'view-old-1',
                                queryId: 'query-old-1',
                            },
                        },
                    },
                ],
            };

            const result = ApplyJsonRemap(dashboardConfig, {
                Preset: 'dashboard-ui-config',
                KeyMap: {
                    'view-old-1': 'view-new-1',
                    'query-old-1': 'query-new-1',
                },
            });

            expect(result.Success).toBe(true);
            const output = result.Output as typeof dashboardConfig;
            expect(output.content[0].id).not.toBe('panel-1');
            expect(output.content[0].componentState.config.viewId).toBe('view-new-1');
            expect(output.content[0].componentState.config.queryId).toBe('query-new-1');
        });

        it('applies scheduled-job-configuration preset', () => {
            const jobConfig = {
                ConversationID: 'conv-abc',
                ActionParamID: 'old-param-root',
                Params: [
                    { ActionParamID: 'old-param-1', Value: 123 },
                ],
            };

            const result = ApplyJsonRemap(jobConfig, {
                Preset: 'scheduled-job-configuration',
                KeyMap: {
                    'old-param-root': 'new-param-root',
                    'old-param-1': 'new-param-1',
                },
            });

            expect(result.Success).toBe(true);
            const output = result.Output as typeof jobConfig;
            expect(output.ConversationID).toBeNull();
            expect(output.ActionParamID).toBe('new-param-root');
            expect(output.Params[0].ActionParamID).toBe('new-param-1');
        });
    });

    describe('Forms Clone-Remap Fixture (complex conditionals)', () => {
        it('remaps question IDs, page IDs, jumps, and score conditions', () => {
            const formConfig = {
                pages: [
                    { id: 'page-1', title: 'Start' },
                    { id: 'page-2', title: 'Follow-up' },
                ],
                rules: [
                    {
                        sourceQuestionId: 'q-1',
                        condition: 'equals',
                        targetPageId: 'page-2',
                    },
                    {
                        sourceQuestionId: 'q-deleted',
                        targetPageId: 'page-1',
                    },
                ],
                scoreConditions: [
                    { questionId: 'q-1', weight: 10 },
                ],
            };

            const keyMap = {
                'page-1': 'new-page-1',
                'page-2': 'new-page-2',
                'q-1': 'new-q-1',
            };

            const result = ApplyJsonRemap(formConfig, {
                Rules: [
                    { Path: 'pages[*].id', Mode: 'remap' },
                    { Path: 'rules[*].sourceQuestionId', Mode: 'remap', OnMissing: 'drop' },
                    { Path: 'rules[*].targetPageId', Mode: 'remap', OnMissing: 'drop' },
                    { Path: 'scoreConditions[*].questionId', Mode: 'remap', OnMissing: 'drop' },
                ],
                KeyMap: keyMap,
            });

            expect(result.Success).toBe(true);
            const output = result.Output as typeof formConfig;
            expect(output.pages[0].id).toBe('new-page-1');
            expect(output.pages[1].id).toBe('new-page-2');
            expect(output.rules).toHaveLength(1);
            expect(output.rules[0].sourceQuestionId).toBe('new-q-1');
            expect(output.rules[0].targetPageId).toBe('new-page-2');
            expect(output.scoreConditions[0].questionId).toBe('new-q-1');
            expect(result.DropCount).toBe(1);
        });
    });
});
