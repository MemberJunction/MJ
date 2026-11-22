import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentSkillGovernanceCheck } from '../checks/agent-skill-governance.js';

const tempDirs: string[] = [];

function createTempRepo(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-std-agent-gov-'));
    tempDirs.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
    }
    return dir;
}

afterEach(() => {
    while (tempDirs.length > 0) {
        const d = tempDirs.pop();
        if (d && fs.existsSync(d)) {
            fs.rmSync(d, { recursive: true, force: true });
        }
    }
});

describe('agent-skill-governance standard', () => {
    it('flags Run Ad-hoc Query on non-allow-listed agents', () => {
        const repo = createTempRepo({
            'metadata/agents/.chief-of-staff-agent.json': JSON.stringify([
                {
                    fields: { Name: 'Chief of Staff' },
                    relatedEntities: {
                        'MJ: AI Agent Actions': [
                            { fields: { ActionID: '@lookup:MJ: Actions.Name=Run Ad-hoc Query' } },
                        ],
                    },
                },
            ]),
        });

        const res = AgentSkillGovernanceCheck.Run({
            RepoRoot: repo,
            Roots: ['metadata'],
            Options: AgentSkillGovernanceCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(1);
        expect(res.Violations[0].Message).toContain('Chief of Staff');
        expect(res.Violations[0].Message).toContain('Run Ad-hoc Query');
    });

    it('permits Run Ad-hoc Query on allow-listed data specialist agents', () => {
        const repo = createTempRepo({
            'metadata/agents/.query-builder-agent.json': JSON.stringify([
                {
                    fields: { Name: 'Query Builder' },
                    relatedEntities: {
                        'MJ: AI Agent Actions': [
                            { fields: { ActionID: '@lookup:MJ: Actions.Name=Run Ad-hoc Query' } },
                        ],
                    },
                },
            ]),
        });

        const res = AgentSkillGovernanceCheck.Run({
            RepoRoot: repo,
            Roots: ['metadata'],
            Options: AgentSkillGovernanceCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(0);
    });

    it('flags generic CRUD actions bundled in a skill', () => {
        const repo = createTempRepo({
            'metadata/chief-of-staff-skills/.tasks-skill.json': JSON.stringify([
                {
                    fields: { Name: 'Chief of Staff Tasks & To-dos' },
                    relatedEntities: {
                        'MJ: AI Skill Actions': [
                            { fields: { ActionID: '@lookup:MJ: Actions.Name=Create Record' } },
                        ],
                    },
                },
            ]),
        });

        const res = AgentSkillGovernanceCheck.Run({
            RepoRoot: repo,
            Roots: ['metadata'],
            Options: AgentSkillGovernanceCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(1);
        expect(res.Violations[0].Message).toContain('Create Record');
    });

    it('flags a repo-defined skill action with zero MJ: Action Params', () => {
        const repo = createTempRepo({
            'metadata/actions/.planning-actions.json': JSON.stringify([
                {
                    fields: { Name: 'Planning.EvaluatePeriodPace' },
                },
            ]),
            'metadata/chief-of-staff-skills/.planning-skill.json': JSON.stringify([
                {
                    fields: { Name: 'Strategic Plan & OKRs' },
                    relatedEntities: {
                        'MJ: AI Skill Actions': [
                            { fields: { ActionID: '@lookup:MJ: Actions.Name=Planning.EvaluatePeriodPace' } },
                        ],
                    },
                },
            ]),
        });

        const res = AgentSkillGovernanceCheck.Run({
            RepoRoot: repo,
            Roots: ['metadata'],
            Options: AgentSkillGovernanceCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(1);
        expect(res.Violations[0].Message).toContain('zero MJ: Action Params');
    });

    it('flags non-allow-listed agents setting AcceptsSkills="All" when an active skill bundles Run Ad-hoc Query', () => {
        const repo = createTempRepo({
            'metadata/ai-skills/.core-skills.json': JSON.stringify([
                {
                    fields: { Name: 'Data Analysis & Queries', Status: 'Active' },
                    relatedEntities: {
                        'MJ: AI Skill Actions': [
                            { fields: { ActionID: '@lookup:MJ: Actions.Name=Run Ad-hoc Query' } },
                        ],
                    },
                },
            ]),
            'metadata/agents/.chief-of-staff-agent.json': JSON.stringify([
                {
                    fields: { Name: 'Chief of Staff', AcceptsSkills: 'All' },
                },
            ]),
        });

        const res = AgentSkillGovernanceCheck.Run({
            RepoRoot: repo,
            Roots: ['metadata'],
            Options: AgentSkillGovernanceCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(1);
        expect(res.Violations[0].Message).toContain('Chief of Staff');
        expect(res.Violations[0].Message).toContain('AcceptsSkills="All"');
        expect(res.Violations[0].Message).toContain('Data Analysis & Queries');
    });

    it('allows AcceptsSkills="Limited" on non-SQL agents and AcceptsSkills="All" on allow-listed SQL specialists or AllowedAllSkillsAgents', () => {
        const repo = createTempRepo({
            'metadata/ai-skills/.core-skills.json': JSON.stringify([
                {
                    fields: { Name: 'Data Analysis & Queries', Status: 'Active' },
                    relatedEntities: {
                        'MJ: AI Skill Actions': [
                            { fields: { ActionID: '@lookup:MJ: Actions.Name=Run Ad-hoc Query' } },
                        ],
                    },
                },
            ]),
            'metadata/agents/.chief-of-staff-agent.json': JSON.stringify([
                {
                    fields: { Name: 'Chief of Staff', AcceptsSkills: 'Limited' },
                    relatedEntities: {
                        'MJ: AI Agent Skills': [
                            { fields: { SkillID: '@lookup:MJ: AI Skills.Name=Web Research', Status: 'Active' } },
                        ],
                    },
                },
            ]),
            'metadata/agents/.query-builder-agent.json': JSON.stringify([
                {
                    fields: { Name: 'Query Builder', AcceptsSkills: 'All' },
                },
            ]),
            'metadata/agents/.sage-agent.json': JSON.stringify([
                {
                    fields: { Name: 'Sage', AcceptsSkills: 'All' },
                },
            ]),
        });

        const res = AgentSkillGovernanceCheck.Run({
            RepoRoot: repo,
            Roots: ['metadata'],
            Options: {
                ...(AgentSkillGovernanceCheck.DefaultOptions ?? {}),
                AllowedAllSkillsAgents: ['Sage'],
            },
        });

        expect(res.Violations).toHaveLength(0);
    });

    it('flags non-allow-listed agents that explicitly grant an SQL-bundling skill via MJ: AI Agent Skills', () => {
        const repo = createTempRepo({
            'metadata/ai-skills/.core-skills.json': JSON.stringify([
                {
                    fields: { Name: 'Data Analysis & Queries', Status: 'Active' },
                    relatedEntities: {
                        'MJ: AI Skill Actions': [
                            { fields: { ActionID: '@lookup:MJ: Actions.Name=Run Ad-hoc Query' } },
                        ],
                    },
                },
            ]),
            'metadata/agents/.chief-of-staff-agent.json': JSON.stringify([
                {
                    fields: { Name: 'Chief of Staff', AcceptsSkills: 'Limited' },
                    relatedEntities: {
                        'MJ: AI Agent Skills': [
                            { fields: { SkillID: '@lookup:MJ: AI Skills.Name=Data Analysis & Queries', Status: 'Active' } },
                        ],
                    },
                },
            ]),
        });

        const res = AgentSkillGovernanceCheck.Run({
            RepoRoot: repo,
            Roots: ['metadata'],
            Options: AgentSkillGovernanceCheck.DefaultOptions ?? {},
        });

        expect(res.Violations).toHaveLength(1);
        expect(res.Violations[0].Message).toContain('Chief of Staff');
        expect(res.Violations[0].Message).toContain('Data Analysis & Queries');
    });
});
