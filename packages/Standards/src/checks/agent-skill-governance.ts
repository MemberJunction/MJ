/**
 * @fileoverview The agent-skill-governance standard.
 *
 * Enforces MemberJunction's Chief of Staff & Open App skill contract in metadata:
 * 1. `Run Ad-hoc Query` may only be granted to explicitly allow-listed data-specialist agents
 *    (for example `Query Builder`, `Database Research Agent`) or allow-listed data skills.
 * 2. Skills must bundle narrow, typed domain actions — never generic CRUD (`Create Record`,
 *    `Update Record`, `Delete Record`, `Write Entity Fields`).
 * 3. Every repo-defined action bundled in a skill should declare typed `MJ: Action Params`
 *    so LLMs receive an explicit schema instead of guessing parameter names.
 *
 * @module @memberjunction/standards
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckResult, StandardCheck, Violation } from '../types.js';

const DEFAULT_ALLOWED_ADHOC_SQL_AGENTS = [
    'Query Builder',
    'Query Strategist',
    'Database Research Agent',
];

const DEFAULT_ALLOWED_ADHOC_SQL_SKILLS = [
    'Data Analysis & Queries',
];

const DEFAULT_DISALLOWED_SKILL_ACTIONS = [
    'Create Record',
    'Update Record',
    'Delete Record',
    'Write Entity Fields',
];

interface SyncMetadataRecord {
    fields?: Record<string, unknown>;
    relatedEntities?: Record<string, SyncMetadataRecord[]>;
    deleteRecord?: { delete?: boolean };
}

function extractLookupActionName(actionId: unknown): string | null {
    if (typeof actionId !== 'string') return null;
    const match = actionId.match(/^@lookup:MJ:\s*Actions\.Name=(.+)$/i);
    return match ? match[1].trim() : null;
}

function walkJsonFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'sql_logging') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkJsonFiles(full));
        } else if (
            entry.isFile() &&
            entry.name.endsWith('.json') &&
            entry.name !== '.mj-sync.json' &&
            entry.name !== '.mj-folder.json'
        ) {
            results.push(full);
        }
    }
    return results;
}

function parseMetadataRecords(filePath: string): SyncMetadataRecord[] {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
            return parsed.filter((r): r is SyncMetadataRecord => typeof r === 'object' && r !== null);
        }
        if (typeof parsed === 'object' && parsed !== null) {
            return [parsed as SyncMetadataRecord];
        }
        return [];
    } catch {
        return [];
    }
}

function collectNestedAgentActions(
    record: SyncMetadataRecord,
    parentName: string
): Array<{ agentName: string; actionName: string }> {
    const out: Array<{ agentName: string; actionName: string }> = [];
    const name = typeof record.fields?.['Name'] === 'string' ? record.fields['Name'].trim() : parentName;
    const related = record.relatedEntities ?? {};

    if (record.deleteRecord?.delete === true) {
        return out;
    }

    const agentActions = related['MJ: AI Agent Actions'] ?? [];
    for (const aa of agentActions) {
        if (aa.deleteRecord?.delete === true) continue;
        const actionName = extractLookupActionName(aa.fields?.['ActionID']);
        if (actionName) {
            out.push({ agentName: name || '(unnamed agent)', actionName });
        }
    }

    const subAgents = related['MJ: AI Agents'] ?? [];
    for (const sub of subAgents) {
        out.push(...collectNestedAgentActions(sub, name));
    }

    return out;
}

function findLineNumber(fileText: string, needle: string): number {
    const lines = fileText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(needle)) return i + 1;
    }
    return 0;
}

function run(context: CheckContext): CheckResult {
    const allowedAgents = new Set(
        ((context.Options['AllowedAdhocSqlAgents'] as string[] | undefined) ?? DEFAULT_ALLOWED_ADHOC_SQL_AGENTS).map(
            (s) => s.trim().toLowerCase()
        )
    );
    const allowedSkills = new Set(
        ((context.Options['AllowedAdhocSqlSkills'] as string[] | undefined) ?? DEFAULT_ALLOWED_ADHOC_SQL_SKILLS).map(
            (s) => s.trim().toLowerCase()
        )
    );
    const disallowedSkillActions = new Set(
        ((context.Options['DisallowedSkillActions'] as string[] | undefined) ?? DEFAULT_DISALLOWED_SKILL_ACTIONS).map(
            (s) => s.trim().toLowerCase()
        )
    );
    const requireParams = context.Options['RequireActionParamsForSkillActions'] !== false;

    const violations: Violation[] = [];
    const repoActionParamCounts = new Map<string, { file: string; paramCount: number }>();

    const jsonFiles: string[] = [];
    for (const root of context.Roots) {
        jsonFiles.push(...walkJsonFiles(path.join(context.RepoRoot, root)));
    }

    // Pass 1: index all repo-authored MJ: Actions so we can verify parameter metadata for skill actions.
    for (const file of jsonFiles) {
        const rel = path.relative(context.RepoRoot, file);
        const normalized = rel.split(path.sep).join('/');
        if (!normalized.includes('/actions/') && !normalized.startsWith('actions/')) continue;
        for (const rec of parseMetadataRecords(file)) {
            const actionName = typeof rec.fields?.['Name'] === 'string' ? rec.fields['Name'].trim() : null;
            if (!actionName) continue;
            const params = rec.relatedEntities?.['MJ: Action Params'] ?? [];
            repoActionParamCounts.set(actionName.toLowerCase(), { file: rel, paramCount: params.length });
        }
    }

    let filesChecked = 0;
    for (const file of jsonFiles) {
        const rel = path.relative(context.RepoRoot, file);
        const normalized = rel.split(path.sep).join('/');
        const isAgentFile = normalized.includes('/agents/') || normalized.startsWith('agents/');
        const isSkillFile =
            normalized.includes('/ai-skills/') ||
            normalized.includes('/skills/') ||
            normalized.includes('skills/');

        if (!isAgentFile && !isSkillFile) continue;
        filesChecked++;

        const fileText = fs.readFileSync(file, 'utf8');
        const records = parseMetadataRecords(file);

        for (const rec of records) {
            if (isAgentFile) {
                for (const { agentName, actionName } of collectNestedAgentActions(rec, '')) {
                    if (
                        actionName.toLowerCase() === 'run ad-hoc query' &&
                        !allowedAgents.has(agentName.toLowerCase())
                    ) {
                        violations.push({
                            File: rel,
                            Line: findLineNumber(fileText, 'Run Ad-hoc Query'),
                            Message:
                                `Agent "${agentName}" is granted "Run Ad-hoc Query", which is restricted to allow-listed data specialists ` +
                                `(${Array.from(allowedAgents).join(', ')}). Replace raw SQL with narrow typed actions or Scoped Search.`,
                        });
                    }
                }
            }

            if (isSkillFile) {
                const skillName =
                    typeof rec.fields?.['Name'] === 'string' ? rec.fields['Name'].trim() : '(unnamed skill)';
                const skillActions = rec.relatedEntities?.['MJ: AI Skill Actions'] ?? [];
                for (const sa of skillActions) {
                    if (sa.deleteRecord?.delete === true) continue;
                    const actionName = extractLookupActionName(sa.fields?.['ActionID']);
                    if (!actionName) continue;
                    const lowerAction = actionName.toLowerCase();

                    if (lowerAction === 'run ad-hoc query' && !allowedSkills.has(skillName.toLowerCase())) {
                        violations.push({
                            File: rel,
                            Line: findLineNumber(fileText, actionName),
                            Message:
                                `Skill "${skillName}" bundles "Run Ad-hoc Query", which is reserved for allow-listed data skills. ` +
                                `Use narrow typed domain actions instead.`,
                        });
                    }

                    if (disallowedSkillActions.has(lowerAction)) {
                        violations.push({
                            File: rel,
                            Line: findLineNumber(fileText, actionName),
                            Message:
                                `Skill "${skillName}" bundles generic CRUD action "${actionName}". ` +
                                `Skills must expose narrow, strongly typed domain actions instead of generic CRUD.`,
                        });
                    }

                    if (requireParams) {
                        const actionInfo = repoActionParamCounts.get(lowerAction);
                        if (actionInfo && actionInfo.paramCount === 0) {
                            violations.push({
                                File: actionInfo.file,
                                Line: 0,
                                Message:
                                    `Action "${actionName}" is bundled by skill "${skillName}" but declares zero MJ: Action Params. ` +
                                    `Declare typed input/output parameters so models receive an explicit tool schema.`,
                            });
                        }
                    }
                }
            }
        }
    }

    return {
        Violations: violations,
        Notes: [`${filesChecked} agent/skill metadata file(s) scanned.`],
    };
}

/** The registered standard. */
export const AgentSkillGovernanceCheck: StandardCheck = {
    Id: 'agent-skill-governance',
    Title: 'Agents & skills use typed domain actions instead of raw SQL or generic CRUD',
    Since: '6.3.0',
    DefaultSeverity: 'error',
    DocsUrl: 'https://github.com/MemberJunction/MJ/blob/next/plans/chief-of-staff-extensible-skills.md',
    Description:
        'Ensures Run Ad-hoc Query is restricted to allow-listed data specialist agents/skills, forbids skills ' +
        'from bundling generic CRUD actions (Create/Update/Delete Record, Write Entity Fields), and verifies ' +
        'that repo-defined actions bundled by skills declare typed MJ: Action Params.',
    DefaultRoots: ['metadata'],
    DefaultOptions: {
        AllowedAdhocSqlAgents: DEFAULT_ALLOWED_ADHOC_SQL_AGENTS,
        AllowedAdhocSqlSkills: DEFAULT_ALLOWED_ADHOC_SQL_SKILLS,
        DisallowedSkillActions: DEFAULT_DISALLOWED_SKILL_ACTIONS,
        RequireActionParamsForSkillActions: true,
    },
    Run: run,
};
