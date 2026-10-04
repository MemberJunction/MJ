import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../metadata');

interface PromptRecord {
    fields: { Name: string; TemplateText: string };
    primaryKey: { ID: string };
    sync?: object;
}

interface AgentRecord {
    fields?: { Name?: string; EvaluatorConfig?: { PromptName?: string } };
    relatedEntities?: Record<string, AgentRecord[]>;
}

/** Every EvaluatorConfig.PromptName on an agent's rubric links, its sub-agents included. */
function CollectJudges(agent: AgentRecord, into: string[]): void {
    for (const [entity, rows] of Object.entries(agent.relatedEntities ?? {})) {
        for (const row of rows) {
            const judge = row.fields?.EvaluatorConfig?.PromptName;
            if (entity === 'MJ: AI Agent Rubrics' && judge) into.push(judge);
            CollectJudges(row, into);
        }
    }
}
const shipped = [
    '.research-answer.json',
    '.query-answer.json',
    '.generated-code.json',
    '.schema-proposal.json',
    '.catalog-contract.json',
    '.picture-from-the-data.json',
    '.duplicate-decision.json',
    '.assistant-reply.json',
];

describe('shipped rubric metadata', () => {
    it('types deterministic values as JsonValue and the evaluator as the literal union', () => {
        const types = readFileSync(join(root, 'entities/JSONType-interfaces/IRubricJsonTypes.ts'), 'utf8');
        expect(types).toContain('Values: JsonValue[];');
        expect(types).not.toContain('unknown[]');
        expect(types).toContain("EvaluatorType: 'AIPrompt' | 'Agent' | 'Deterministic' | 'External' | 'Human' | 'Self';");
        expect(types).not.toMatch(/EvaluatorType:\s*string/);
        const rule = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../Rubrics/Engine/src/DeterministicRubricEvaluator.ts'), 'utf8');
        expect(rule).toContain('Values?: JsonValue[]');
        expect(rule).not.toContain('Values?: unknown[]');
        const services = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../Rubrics/Engine/src/evaluatorServices.ts'), 'utf8');
        expect(services).toContain("export type RubricEvaluatorType = MJRubricEvaluationEntity['EvaluatorType'];");
        expect(services).not.toMatch(/EvaluatorType\??:\s*string/);
    });

    it('pushes scales, draft rubrics, and publications before the agents that look them up', () => {
        const order = JSON.parse(readFileSync(join(root, '.mj-sync.json'), 'utf8')).directoryOrder as string[];
        const at = (name: string) => order.indexOf(name);
        expect(at('rubric-scales')).toBeGreaterThanOrEqual(0);
        expect(at('rubric-scales')).toBeLessThan(at('rubrics'));
        expect(at('rubrics')).toBeLessThan(at('rubric-publications'));
        expect(at('rubric-publications')).toBeLessThan(at('agents'));
    });

    it('leaves the shipped versions as drafts and publishes them in a later folder without hand-written hashes', () => {
        const versionIds: string[] = [];
        for (const file of shipped) {
            const rubric = JSON.parse(readFileSync(join(root, 'rubrics', file), 'utf8'));
            for (const version of rubric.relatedEntities['MJ: Rubric Versions']) {
                expect(version.fields.Status).toBe('Draft');
                for (const field of ['MajorVersion', 'MinorVersion', 'PatchVersion', 'ContentHash', 'ScoringHash', 'AppliedBump', 'PublishedAt']) {
                    expect(version.fields[field]).toBeUndefined();
                }
                versionIds.push(version.primaryKey.ID);
                for (const criterion of version.relatedEntities['MJ: Rubric Criteria']) {
                    const key = criterion.fields.Key as string;
                    expect(key.length).toBeLessThanOrEqual(100);
                    expect(key.endsWith('-')).toBe(false);
                    expect(key).not.toBe('the-stated-result-matches-the-rows-the-run-retur');
                    expect(criterion.fields.Name.length).toBeGreaterThan(0);
                    expect(criterion.fields.Name).not.toMatch(/when there is/i);
                    expect(String(criterion.fields.Guidance ?? '').length).toBeGreaterThan(0);
                    const levelIds = (criterion.relatedEntities['MJ: Rubric Criterion Levels'] as { fields: { ScaleLevelID: string } }[]).map(level => level.fields.ScaleLevelID);
                    expect(levelIds).toContain('A9E1A258-D99F-47A4-87EF-646C160D0282');
                }
                expect(String(version.fields.Instructions ?? '').length).toBeGreaterThan(0);
                expect(String(rubric.fields.Description)).not.toMatch(/Gate minimum/);
            }
        }
        const publications = JSON.parse(readFileSync(join(root, 'rubric-publications/.publish-shipped-versions.json'), 'utf8')) as { fields: Record<string, string>; primaryKey: { ID: string } }[];
        expect(publications.map(row => row.primaryKey.ID).sort()).toEqual([...versionIds].sort());
        for (const row of publications) expect(row.fields).toEqual({ Status: 'Published' });
    });

    it('tombstones the Test Rubrics application entity so a push deletes it', () => {
        const app = JSON.parse(readFileSync(join(root, 'applications/.testing-application.json'), 'utf8'));
        const row = app.relatedEntities['MJ: Application Entities'].find((item: { primaryKey: { ID: string } }) => item.primaryKey.ID === 'F3DC86D9-5698-4492-A5D9-FC6EA8C65024');
        expect(row?.fields.EntityID).toBe('@lookup:MJ: Entities.Name=MJ: Test Rubrics');
        expect(row?.deleteRecord).toEqual({ delete: true, deletedAt: '2026-10-02T21:42:50.885Z' });
    });

    it('does not give the Rubric Evaluation Agent Get Rubric Consensus', () => {
        const agent = JSON.parse(readFileSync(join(root, 'agents/.rubric-evaluation-agent.json'), 'utf8'));
        const actions = agent.relatedEntities['MJ: AI Agent Actions'] as { fields: { ActionID: string }; primaryKey: { ID: string }; deleteRecord?: { delete: boolean; deletedAt?: string } }[];
        const consensus = actions.find(row => row.primaryKey.ID === 'F2BE0462-B8C6-44ED-B041-0C6512F60DCD');
        expect(consensus?.fields.ActionID).toBe('@lookup:MJ: Actions.Name=Get Rubric Consensus');
        expect(consensus?.deleteRecord).toEqual({ delete: true, deletedAt: '2026-10-02T04:09:00.000Z' });
        const live = actions.filter(row => row.deleteRecord?.delete !== true).map(row => row.fields.ActionID);
        expect(live).not.toContain('@lookup:MJ: Actions.Name=Get Rubric Consensus');
        expect(live).toEqual([
            '@lookup:MJ: Actions.Name=Get Rubric',
            '@lookup:MJ: Actions.Name=Get Rubric Subject',
        ]);
        const prompt = readFileSync(join(root, 'prompts/templates/rubrics/rubric-evaluation-agent.md'), 'utf8');
        expect(prompt).not.toMatch(/Use Get Rubric Consensus/);
        expect(prompt).toContain('Do not call Get Rubric Consensus.');
    });

    it('matches the agent evaluation example to the guide scale', () => {
        const rubric = JSON.parse(readFileSync(join(root, 'rubrics/.agent-evaluation.json'), 'utf8'));
        const version = rubric.relatedEntities['MJ: Rubric Versions'][0];
        const scales = version.relatedEntities['MJ: Rubric Criteria'].map((criterion: { fields: { ScaleID: string } }) => criterion.fields.ScaleID);
        expect(new Set(scales)).toEqual(new Set(['@lookup:MJ: Rubric Scales.Name=Meets / Partial / Miss']));
        const guide = readFileSync(join(root, '../guides/RUBRICS_GUIDE.md'), 'utf8');
        const section = guide.slice(guide.indexOf('### Agent evaluation'), guide.indexOf('### Peer review'));
        expect(section).toContain('Meets / Partial / Miss');
        expect(section).not.toContain('Binary (Met / Not met)');
    });

    it('keys the three rubric prompts by uuid so a push does not duplicate them', () => {
        const prompts = [
            ['.rubric-evaluator-prompt.json', '71932BB5-CEC3-4484-947C-EB17704F992C'],
            ['.rubric-evaluation-agent-prompt.json', '258BD01A-6F1F-4D0D-8EEF-6B99530318B6'],
            ['.rubric-architect-prompt.json', 'A04F025E-E797-4CA2-8EB3-8C0D4983C274'],
        ] as const;
        for (const [file, id] of prompts) {
            const parsed = JSON.parse(readFileSync(join(root, 'prompts', file), 'utf8')) as PromptRecord | PromptRecord[];
            const records = Array.isArray(parsed) ? parsed : [parsed];
            const prompt = records.find(record => record.primaryKey.ID === id);
            expect(prompt?.primaryKey).toEqual({ ID: id });
        }
    });

    it('ships the rubric evaluator, criterion, and judge prompts from templates that exist', () => {
        const records = [
            ...JSON.parse(readFileSync(join(root, 'prompts/.rubric-evaluator-prompt.json'), 'utf8')) as PromptRecord[],
            ...JSON.parse(readFileSync(join(root, 'prompts/.rubric-judge-prompts.json'), 'utf8')) as PromptRecord[],
        ];
        const names = records.map(record => record.fields.Name);
        expect(names).toEqual(expect.arrayContaining(['Rubric Evaluator', 'Rubric Criterion', 'Rubric Evaluator - Default Judge']));
        expect(new Set(names).size).toBe(names.length);
        for (const record of records) {
            expect(record.primaryKey.ID).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
            expect(record.sync).toBeUndefined();
            const template = record.fields.TemplateText.replace('@file:', '');
            expect(readFileSync(join(root, 'prompts', template), 'utf8').length).toBeGreaterThan(0);
        }
        const evaluator = readFileSync(join(root, 'prompts/templates/rubrics/rubric-evaluator.template.md'), 'utf8');
        expect(evaluator).toContain('{{ judgePrompt | safe }}');
        expect(evaluator).not.toContain('{{content}}');
    });

    it('points every shipped agent-rubric judge at a shipped judge prompt', () => {
        const judges = new Set((JSON.parse(readFileSync(join(root, 'prompts/.rubric-judge-prompts.json'), 'utf8')) as PromptRecord[]).map(record => record.fields.Name));
        const named: string[] = [];
        for (const file of readdirSync(join(root, 'agents')).filter(name => name.startsWith('.') && name.endsWith('.json') && name !== '.mj-sync.json')) {
            const parsed = JSON.parse(readFileSync(join(root, 'agents', file), 'utf8')) as AgentRecord | AgentRecord[];
            for (const agent of Array.isArray(parsed) ? parsed : [parsed]) CollectJudges(agent, named);
        }
        expect(named.length).toBeGreaterThanOrEqual(16);
        for (const name of named) expect(judges.has(name)).toBe(true);
        expect(named).toContain('Rubric Judge - Sage');
        expect(named).toContain('Rubric Judge - Database Research Agent');
    });
});
