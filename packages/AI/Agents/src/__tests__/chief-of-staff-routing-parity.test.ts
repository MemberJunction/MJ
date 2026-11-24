import fs from 'node:fs';
import path from 'node:path';
import nunjucks from 'nunjucks';
import { describe, expect, it } from 'vitest';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';

function makeAgent(fields: Partial<MJAIAgentEntityExtended>): MJAIAgentEntityExtended {
    const obj = Object.create(Object.prototype) as MJAIAgentEntityExtended;
    const defaults: Partial<MJAIAgentEntityExtended> = {
        ParentID: null,
        BaseAgentID: null,
        OwnerUserID: null,
        Status: 'Active',
        InstantiationMode: 'None',
        IsPrimaryInstance: false,
        DriverClass: null,
        TypeID: 'type-loop',
        AgentTypePromptParams: null,
        TypeConfiguration: null,
        ...fields,
    };
    for (const key of Object.keys(defaults) as Array<keyof MJAIAgentEntityExtended>) {
        Object.defineProperty(obj, key, {
            value: defaults[key],
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }
    return obj;
}

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const COS_AGENT_JSON = path.join(REPO_ROOT, 'metadata/agents/.chief-of-staff-agent.json');
const SAGE_TEMPLATE = path.join(REPO_ROOT, 'metadata/prompts/templates/sage/sage.template.md');
const COS_TEMPLATE = path.join(REPO_ROOT, 'metadata/prompts/templates/chief-of-staff/chief-of-staff.template.md');
const SHARED_DELEGATION_INCLUDE = path.join(REPO_ROOT, 'metadata/prompts/templates/_includes/agent-delegation.md');

interface AgentMetadataRecord {
    fields: {
        Name: string;
        AgentTypePromptParams?: Record<string, boolean>;
    };
}

function resolveMetadataIncludes(templatePath: string): string {
    const content = fs.readFileSync(templatePath, 'utf8');
    const dir = path.dirname(templatePath);
    return content.replace(/\{@include\s+([^}]+)\}/g, (_match, rawRelPath: string) => {
        const includedPath = path.resolve(dir, rawRelPath.trim());
        return resolveMetadataIncludes(includedPath);
    });
}

describe('Epic B: Chief of Staff routing parity with Sage', () => {
    it('enables both enableTaskGraphs and enableHandoff in Chief of Staff AgentTypePromptParams metadata', () => {
        const parsed = JSON.parse(fs.readFileSync(COS_AGENT_JSON, 'utf8')) as AgentMetadataRecord[];
        const cos = parsed.find((r) => r.fields.Name === 'Chief of Staff');
        expect(cos).toBeDefined();
        expect(cos?.fields.AgentTypePromptParams?.enableTaskGraphs).toBe(true);
        expect(cos?.fields.AgentTypePromptParams?.enableHandoff).toBe(true);
    });

    it('extracts Agent Delegation into a shared include with zero hardcoded Sage references and keeps Sage sub-agents out of it', () => {
        const shared = fs.readFileSync(SHARED_DELEGATION_INCLUDE, 'utf8');
        const sage = fs.readFileSync(SAGE_TEMPLATE, 'utf8');
        const cos = fs.readFileSync(COS_TEMPLATE, 'utf8');

        expect(shared).not.toMatch(/\bSage\b/);
        expect(shared).not.toContain('Workflow Planner');
        expect(shared).not.toContain('Form Builder');
        expect(shared).toContain('{{ agentName }}');
        expect(shared).toContain('NEVER Hallucinate or Guess Agent Names');

        expect(sage).toContain('{@include ../_includes/agent-delegation.md}');
        expect(sage).toContain('Workflow Planner, Form Builder');
        expect(sage).not.toContain('to yourself (Sage)');

        expect(cos).toContain('{@include ../_includes/agent-delegation.md}');
        expect(cos).toContain('Query Builder');
        expect(cos).not.toContain('Workflow Planner');
        expect(cos).not.toContain('Form Builder');
    });

    it('renders the resolved Chief of Staff template with Pepper as agentName and handoff instructions active', () => {
        const resolvedCos = resolveMetadataIncludes(COS_TEMPLATE);
        const env = new nunjucks.Environment(null, { autoescape: false });
        const rendered = env.renderString(resolvedCos, {
            agentIsDerivedInstance: true,
            agentName: 'Pepper',
            agentBaseAgentName: 'Chief of Staff',
            _USER_NAME: 'Alice',
            _CURRENT_TIMEZONE: 'America/Chicago',
            availableAgentCount: 2,
            availableAgentDetails: '- Research Agent\n- Query Builder',
            __agentTypePromptParams: {
                enableHandoff: true,
                enableTaskGraphs: true,
                includeResponseTypeDefinition: { handoff: true },
            },
        });

        expect(rendered).toContain('Never hand off to yourself (Pepper)');
        expect(rendered).toContain('Handoff (Default for Single-Agent Specialized Work)');
        expect(rendered).toContain('Available Agents for Task Graph & Sub-Agent Delegation (2 Runnable by Current User)');
        expect(rendered).not.toContain('to yourself (Sage)');
    });

    it('passes enableHandoff: true through BaseAgentID prototype inheritance to derived instances like Pepper', () => {
        const engine = new AIEngineBase() as AIEngineBase & {
            _agents: MJAIAgentEntityExtended[];
        };
        const cosId = '11111111-0000-4000-8000-000000000001';
        const pepperId = '11111111-0000-4000-8000-000000000002';

        const cosAgent = makeAgent({
            ID: cosId,
            Name: 'Chief of Staff',
            BaseAgentID: null,
            Status: 'Active',
            AgentTypePromptParams: JSON.stringify({
                enableTaskGraphs: true,
                enableHandoff: true,
                includeScratchpadDocs: true,
            }),
            TypeConfiguration: JSON.stringify({ realtime: { directActions: { enabled: true } } }),
        });

        const pepperAgent = makeAgent({
            ID: pepperId,
            Name: 'Pepper',
            BaseAgentID: cosId,
            Status: 'Active',
            AgentTypePromptParams: null,
            TypeConfiguration: null,
        });

        engine._agents = [cosAgent, pepperAgent];

        const effective = engine.ResolveEffectiveAgentProperties(pepperAgent);
        expect(effective.AgentTypePromptParams).toBeTruthy();
        const parsedParams = JSON.parse(effective.AgentTypePromptParams ?? '{}') as Record<string, boolean>;
        expect(parsedParams.enableHandoff).toBe(true);
        expect(parsedParams.enableTaskGraphs).toBe(true);
        expect(parsedParams.includeScratchpadDocs).toBe(true);
    });
});
