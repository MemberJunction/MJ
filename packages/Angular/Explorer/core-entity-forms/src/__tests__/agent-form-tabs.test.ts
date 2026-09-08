/**
 * Tests for the AI Agents form's tab rules.
 *
 * Both failure modes these guard against render as a *broken form* rather than an error, which is
 * why they are worth pinning: a stored tab that no longer exists hides every pane at once (a blank
 * form with nothing to explain it), and a hardcoded default sends every Flow agent back to Details —
 * re-burying the diagram that tabbing this form exists to surface.
 */
import { describe, it, expect } from 'vitest';
import {
    AGENT_TAB_DESIGNER,
    AGENT_TAB_DETAILS,
    AGENT_TAB_INVOCATIONS,
    BuildAgentFormTabs,
    DesignerTabLabel,
    HasDesignerTab,
    ResolveActiveTab,
    type AgentFormTabContext,
} from '../lib/custom/AIAgents/agent-form-tabs';

const flow: AgentFormTabContext = { AgentTypeName: 'Flow', UIFormSectionKey: 'FlowAgentType', HasRecordID: true };
const loop: AgentFormTabContext = { AgentTypeName: 'Loop', UIFormSectionKey: null, HasRecordID: true };
const unsaved: AgentFormTabContext = { AgentTypeName: 'Flow', UIFormSectionKey: 'FlowAgentType', HasRecordID: false };
const keys = (c: AgentFormTabContext, stored: string | null = null) =>
    BuildAgentFormTabs(c, stored).Tabs.map((t) => t.key);

describe('which tabs exist', () => {
    it('a Flow agent gets the designer, Details and Invocations — designer first', () => {
        expect(keys(flow)).toEqual([AGENT_TAB_DESIGNER, AGENT_TAB_DETAILS, AGENT_TAB_INVOCATIONS]);
    });

    it('a Loop agent gets no designer, because its type ships none', () => {
        expect(keys(loop)).toEqual([AGENT_TAB_DETAILS, AGENT_TAB_INVOCATIONS]);
    });

    it('an unsaved record gets Details only', () => {
        // No id means no designer to load into and nothing that could yet invoke it. Offering either
        // would be a tab that can only disappoint.
        expect(keys(unsaved)).toEqual([AGENT_TAB_DETAILS]);
    });

    it('keys on the section key, not on the type being named Flow', () => {
        // This is what makes the next agent type that ships a designer get one for free.
        const future: AgentFormTabContext = { AgentTypeName: 'Swarm', UIFormSectionKey: 'SwarmType', HasRecordID: true };
        expect(keys(future)).toContain(AGENT_TAB_DESIGNER);
        expect(HasDesignerTab(future)).toBe(true);
        expect(HasDesignerTab(loop)).toBe(false);
    });

    it('gives every tab a label and an icon', () => {
        for (const tab of BuildAgentFormTabs(flow, null).Tabs) {
            expect(tab.label.length, `${tab.key} label`).toBeGreaterThan(0);
            expect((tab.icon ?? '').length, `${tab.key} icon`).toBeGreaterThan(0);
        }
    });

    it('names the designer after its type, and does not give a non-Flow type the flow glyph', () => {
        expect(DesignerTabLabel(flow)).toBe('Flow');
        expect(DesignerTabLabel({ ...flow, AgentTypeName: 'Swarm' })).toBe('Swarm');
        expect(DesignerTabLabel({ ...flow, AgentTypeName: null })).toBe('Designer');
        expect(DesignerTabLabel({ ...flow, AgentTypeName: '   ' })).toBe('Designer');

        const flowTab = BuildAgentFormTabs(flow, null).Tabs[0];
        const swarmTab = BuildAgentFormTabs({ ...flow, AgentTypeName: 'Swarm' }, null).Tabs[0];
        expect(flowTab.icon).toContain('diagram-project');
        expect(swarmTab.icon).not.toContain('diagram-project');
    });
});

describe('which tab opens', () => {
    it('a Flow agent opens on its diagram when the user has never chosen', () => {
        // The whole point of tabbing this form. A hardcoded 'details' default would re-bury it.
        expect(BuildAgentFormTabs(flow, null).ActiveKey).toBe(AGENT_TAB_DESIGNER);
    });

    it('a Loop agent opens on Details, without that being hardcoded anywhere', () => {
        expect(BuildAgentFormTabs(loop, null).ActiveKey).toBe(AGENT_TAB_DETAILS);
    });

    it('a real stored choice wins over the default', () => {
        expect(BuildAgentFormTabs(flow, AGENT_TAB_INVOCATIONS).ActiveKey).toBe(AGENT_TAB_INVOCATIONS);
        expect(BuildAgentFormTabs(flow, AGENT_TAB_DETAILS).ActiveKey).toBe(AGENT_TAB_DETAILS);
    });

    it('falls through when the stored tab no longer exists on this agent', () => {
        // The agent's type changed, so its designer is gone. Honouring the stale key would hide every
        // pane at once — a blank form with no error to explain it.
        expect(BuildAgentFormTabs(loop, AGENT_TAB_DESIGNER).ActiveKey).toBe(AGENT_TAB_DETAILS);
        // Unsaved record: Invocations does not exist yet.
        expect(BuildAgentFormTabs(unsaved, AGENT_TAB_INVOCATIONS).ActiveKey).toBe(AGENT_TAB_DETAILS);
    });

    it('never returns a key that is not in the strip', () => {
        for (const context of [flow, loop, unsaved]) {
            for (const stored of [null, '', 'designer', 'details', 'invocations', 'nonsense']) {
                const plan = BuildAgentFormTabs(context, stored);
                expect(plan.Tabs.map((t) => t.key)).toContain(plan.ActiveKey);
            }
        }
    });

    it('degrades to Details rather than undefined if the strip were ever empty', () => {
        expect(ResolveActiveTab([], 'designer')).toBe(AGENT_TAB_DETAILS);
        expect(ResolveActiveTab([], null)).toBe(AGENT_TAB_DETAILS);
    });
});
