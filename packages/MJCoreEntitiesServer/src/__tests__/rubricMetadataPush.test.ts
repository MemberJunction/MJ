import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../metadata');
const shipped = [
    '.research-answer.json',
    '.query-answer.json',
    '.generated-code.json',
    '.schema-proposal.json',
    '.catalog-contract.json',
    '.picture-from-the-data.json',
    '.duplicate-decision.json',
];

describe('shipped rubric metadata', () => {
    it('pushes scales, draft rubrics, and publications before the agents that look them up', () => {
        const order = JSON.parse(readFileSync(join(root, '.mj-sync.json'), 'utf8')).directoryOrder as string[];
        const at = (name: string) => order.indexOf(name);
        expect(at('rubric-scales')).toBeGreaterThanOrEqual(0);
        expect(at('rubric-scales')).toBeLessThan(at('rubrics'));
        expect(at('rubrics')).toBeLessThan(at('rubric-publications'));
        expect(at('rubric-publications')).toBeLessThan(at('agents'));
    });

    it('leaves the seven versions as drafts and publishes them in a later folder without hand-written hashes', () => {
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

    it('keys the three rubric prompts by uuid so a push does not duplicate them', () => {
        const prompts = [
            ['.rubric-evaluator-prompt.json', '71932BB5-CEC3-4484-947C-EB17704F992C'],
            ['.rubric-evaluation-agent-prompt.json', '258BD01A-6F1F-4D0D-8EEF-6B99530318B6'],
            ['.rubric-architect-prompt.json', 'A04F025E-E797-4CA2-8EB3-8C0D4983C274'],
        ] as const;
        for (const [file, id] of prompts) {
            const prompt = JSON.parse(readFileSync(join(root, 'prompts', file), 'utf8'));
            expect(prompt.primaryKey).toEqual({ ID: id });
            expect(prompt.primaryKey.Name).toBeUndefined();
        }
    });
});
