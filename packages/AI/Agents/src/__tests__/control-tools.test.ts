/**
 * Control-flow tools for the implicit protocol (spec §2.2, §4): one tool per sub-agent,
 * payload_change_request, ask_user — built beside the Action tools into ONE reverse map.
 */
import { describe, it, expect } from 'vitest';
import { BuildActionToolSet } from '../native-tools/action-tool-builder';
import {
    ASK_USER_TOOL, PAYLOAD_CHANGE_TOOL, SUB_AGENT_TOOL_PREFIX, NATIVE_CONTROL_TOOL_NAMES,
    BuildAskUserTool, BuildPayloadChangeTool, BuildSubAgentTool, BuildNativeToolSet
} from '../native-tools/control-tools';
import type { MJAIAgentEntityExtended } from '@memberjunction/core-entities';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';

const agent = (Name: string, Description = 'Writes copy.') => ({ ID: Name, Name, Description } as unknown as MJAIAgentEntityExtended);
const action = (Name: string) => ({ ID: Name, Name, Description: 'd', Params: { Items: [] } } as unknown as MJActionEntityExtended);
const actionSet = (...names: string[]) => BuildActionToolSet(names.map(action), new Map(names.map((n) => [n, []])));

describe('fixed control tools', () => {
    it('payload_change_request declares the four element sections and reasoning, none required', () => {
        const t = BuildPayloadChangeTool();
        expect(t.name).toBe(PAYLOAD_CHANGE_TOOL);
        expect(Object.keys(t.inputSchema.properties ?? {}).sort()).toEqual(['newElements', 'reasoning', 'removeElements', 'replaceElements', 'updateElements']);
        expect(t.inputSchema.required ?? []).toEqual([]);
        expect(t.description.length).toBeLessThanOrEqual(1024);
    });
    it('ask_user requires a message and says when NOT to use it', () => {
        const t = BuildAskUserTool();
        expect(t.name).toBe(ASK_USER_TOOL);
        expect(t.inputSchema.required).toEqual(['message']);
        expect(t.description).toMatch(/plain text/i);
    });
    it('ask_user carries an optional responseForm shaped like the envelope\'s (results §16.7)', () => {
        const t = BuildAskUserTool();
        const props = t.inputSchema.properties as Record<string, { type: string; properties?: Record<string, unknown> }>;
        expect(Object.keys(props).sort()).toEqual(['message', 'responseForm']);
        expect(props.responseForm.type).toBe('object');
        expect(Object.keys(props.responseForm.properties ?? {}).sort()).toEqual(['description', 'questions', 'submitLabel', 'title']);
        expect(t.inputSchema.required).toEqual(['message']); // the form stays optional
    });
    it('ask_user tells the model to delegate or act before asking (Plan B, Task 2)', () => {
        expect(BuildAskUserTool().description).toMatch(/sub-agent or an Action can/i);
    });
    it('exports exactly the two fixed names', () => {
        expect([...NATIVE_CONTROL_TOOL_NAMES].sort()).toEqual([ASK_USER_TOOL, PAYLOAD_CHANGE_TOOL].sort());
    });
});

describe('sub-agent tools', () => {
    it('names the tool delegate_to_<sanitized agent name> and carries the agent description', () => {
        const t = BuildSubAgentTool(agent('Query Strategist', 'Plans SQL.'));
        expect(t.name).toBe(`${SUB_AGENT_TOOL_PREFIX}query_strategist`);
        expect(t.description).toContain('Query Strategist');
        expect(t.description).toContain('Plans SQL.');
        expect(t.inputSchema.required).toEqual(['message']);
        expect(Object.keys(t.inputSchema.properties ?? {}).sort()).toEqual(['message', 'terminateAfter']);
    });
    it('caps the name at 64 characters', () => {
        const t = BuildSubAgentTool(agent('A'.repeat(80)));
        expect(t.name.length).toBeLessThanOrEqual(64);
    });
});

describe('buildNativeToolSet', () => {
    it('lists actions first, then sub-agents, then the fixed control tools, and names the control ones', () => {
        const set = BuildNativeToolSet(actionSet('Run Ad-hoc Query'), [agent('Copywriter Agent')]);
        expect(set.tools.map((t) => t.name)).toEqual(['run_ad_hoc_query', 'delegate_to_copywriter_agent', PAYLOAD_CHANGE_TOOL, ASK_USER_TOOL]);
        expect(set.controlToolNames).toEqual(['delegate_to_copywriter_agent', PAYLOAD_CHANGE_TOOL, ASK_USER_TOOL]);
        expect(set.byToolName.get('run_ad_hoc_query')?.kind).toBe('action');
        expect(set.byToolName.get('delegate_to_copywriter_agent')?.kind).toBe('subAgent');
        expect(set.byToolName.get(PAYLOAD_CHANGE_TOOL)?.kind).toBe('payloadChange');
        expect(set.byToolName.get(ASK_USER_TOOL)?.kind).toBe('askUser');
    });
    it('rejects an Action that collides with a reserved name', () => {
        expect(() => BuildNativeToolSet(actionSet('Ask User'), [])).toThrow(/reserved/i);
    });
    it('rejects two sub-agents that sanitize to one name', () => {
        expect(() => BuildNativeToolSet(actionSet(), [agent('Editor Agent'), agent('Editor-Agent')])).toThrow(/collision/i);
    });
    it('works with no actions at all (a pure orchestrator)', () => {
        const set = BuildNativeToolSet(actionSet(), [agent('Copywriter Agent'), agent('Editor Agent')]);
        expect(set.tools.map((t) => t.name)).toEqual(['delegate_to_copywriter_agent', 'delegate_to_editor_agent', PAYLOAD_CHANGE_TOOL, ASK_USER_TOOL]);
    });
});
