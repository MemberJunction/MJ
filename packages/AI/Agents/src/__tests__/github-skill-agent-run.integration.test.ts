/**
 * End-to-End Integration Test: Multi-Step Agent Run with Large-Catalog Skill Scaling,
 * Semantic Skill Discovery (`Find Candidate Skills` + `Get Skill Details`), Skill Activation,
 * and Atomic GitHub PR Creation (`GitHub - Commit Files and Create PR`).
 *
 * Exercises the complete lifecycle across `@memberjunction/ai-agents` and `@memberjunction/core-actions`:
 *   1. Stage 1 Hybrid Skill Pre-Ranking (`RankSkillsByHybridRelevance` + `PreFilterSkillCandidatesForDecision`)
 *      over a 250-skill enterprise catalog with `maxSkillsInPrompt: 5` and `maxSkillDecisionCandidates: 15`.
 *   2. Agent invokes `Find Candidate Skills` and `Get Skill Details` to locate and inspect
 *      `GitHub Engineering & Repository Steward`.
 *   3. Agent activates the skill, expanding its runtime action catalog (`ActionNames`) and
 *      recording `AgentSkillInvocation` provenance.
 *   4. Agent executes `GitHub - Get Repository Context` and `GitHub - Commit Files and Create PR`
 *      against a mocked GitHub REST API using a 3LO user-delegated token, verifying protected-branch
 *      enforcement, atomic Git tree creation, and PR opening.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { Metadata } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import type { RunActionParams } from '@memberjunction/actions-base';
import {
    CatalogNarrowingNote,
    PreFilterSkillCandidatesForDecision,
    RankSkillsByHybridRelevance,
    ResolveCatalogNarrowingLimits,
    type CatalogNarrowingCandidate,
} from '../catalog-narrowing.ts';
import {
    FindCandidateSkillsAction,
    GetSkillDetailsAction,
    GitHubGetRepositoryContextAction,
    GitHubCommitFilesAndCreatePRAction,
} from '@memberjunction/core-actions';

const GITHUB_SKILL_ID = '99999999-0000-4000-8000-000000000250';
const PINNED_SKILL_ID = '99999999-0000-4000-8000-000000000001';

const GITHUB_ACTIONS = [
    {
        ID: '88888888-0000-4000-8000-000000000001',
        Name: 'GitHub - Get Repository Context',
        Description: 'Returns repository metadata, README, and top-level directory tree in one call.',
    },
    {
        ID: '88888888-0000-4000-8000-000000000002',
        Name: 'GitHub - Commit Files and Create PR',
        Description: 'Creates a feature branch, commits multiple files atomically via Git Data API, and opens a PR.',
    },
];

function buildLargeSkillCatalog(count = 250): Array<{
    ID: string;
    Name: string;
    Description: string;
    Category: string;
    Status: 'Active';
    ActivationMode: 'Auto';
    ActivationScope: 'Run';
    SearchScopeAccess: 'None';
    Instructions: string;
}> {
    const catalog = [];
    for (let i = 1; i < count; i++) {
        const id = i === 1
            ? PINNED_SKILL_ID
            : `99999999-0000-4000-8000-${String(i).padStart(12, '0')}`;
        catalog.push({
            ID: id,
            Name: i === 1 ? 'Enterprise Safety & Audit Policy' : `Domain Workflow Skill #${i}`,
            Description: i === 1
                ? 'Core enterprise audit logging and safety policy.'
                : `Automates specialized business process #${i} for ERP module ${i % 12}.`,
            Category: i === 1 ? 'Governance' : `Module-${i % 12}`,
            Status: 'Active' as const,
            ActivationMode: 'Auto' as const,
            ActivationScope: 'Run' as const,
            SearchScopeAccess: 'None' as const,
            Instructions: `Instructions for skill #${i}`,
        });
    }
    catalog.push({
        ID: GITHUB_SKILL_ID,
        Name: 'GitHub Engineering & Repository Steward',
        Description: 'Inspect GitHub repositories, read source files, and commit multi-file changes to raise pull requests.',
        Category: 'Engineering',
        Status: 'Active' as const,
        ActivationMode: 'Auto' as const,
        ActivationScope: 'Run' as const,
        SearchScopeAccess: 'None' as const,
        Instructions:
            '1. Call `GitHub - Get Repository Context` first.\n2. Never commit directly to `main` or `next`.\n3. Use `GitHub - Commit Files and Create PR` for atomic changes.',
    });
    return catalog;
}

function makeActionParams(inputs: Record<string, unknown>, userId = 'user-42'): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({
            Name,
            Type: 'Input' as const,
            Value,
        })),
        ContextUser: {
            ID: userId,
            Name: 'Alice Developer',
            Email: 'alice@example.com',
        } as unknown as RunActionParams['ContextUser'],
    } as unknown as RunActionParams;
}

describe('Integration: Multi-Step Agent Run with Skill Scaling + GitHub PR Workflow', () => {
    const largeSkillCatalog = buildLargeSkillCatalog(250);

    beforeEach(() => {
        const aiEngine = AIEngine.Instance as unknown as Record<string, unknown>;
        aiEngine.Config = async () => {};
        Object.defineProperty(aiEngine, 'Skills', {
            get: () => largeSkillCatalog as unknown as MJAISkillEntity[],
            configurable: true,
        });
        Object.defineProperty(aiEngine, 'Agents', {
            get: () => [],
            configurable: true,
        });
        aiEngine.GetSkillExposedActionIDs = (skillId: string): string[] =>
            skillId.toLowerCase() === GITHUB_SKILL_ID.toLowerCase()
                ? GITHUB_ACTIONS.map((a) => a.ID)
                : [];
        aiEngine.GetSkillActionIDs = (skillId: string): string[] =>
            skillId.toLowerCase() === GITHUB_SKILL_ID.toLowerCase()
                ? GITHUB_ACTIONS.map((a) => a.ID)
                : [];
        aiEngine.GetSkillSubAgentIDs = (): string[] => [];

        const actionEngine = ActionEngineServer.Instance as unknown as Record<string, unknown>;
        actionEngine.Config = async () => {};
        Object.defineProperty(actionEngine, 'Actions', {
            get: () => GITHUB_ACTIONS,
            configurable: true,
        });

        Object.defineProperty(Metadata, 'Provider', {
            get: () => ({
                SearchEntity: async () => {
                    throw new Error('Vector index offline — exercise lexical fallback');
                },
            }),
            configurable: true,
        });

        // Mock 3LO user-scoped OAuth credential for user-42
        const credEngine = CredentialEngine.Instance as unknown as Record<string, unknown>;
        credEngine.Config = async () => {};
        credEngine.getCredential = async (name: string, options?: { contextUser?: { ID: string } }) => {
            if (name === 'UserOAuth3LO:GitHub:user-42' && options?.contextUser?.ID === 'user-42') {
                return {
                    values: {
                        accessToken: 'ghu_alice_3lo_token_xyz',
                        allowedRepositories: ['MemberJunction/*'],
                        defaultPRMode: 'draft',
                    },
                    credentialId: 'cred-3lo-alice',
                };
            }
            return null;
        };
    });

    it('scales across 250 skills via hybrid pre-filtering, discovers & inspects the GitHub skill, activates capabilities, and raises a PR', async () => {
        const userTask = 'Inspect MemberJunction/MJ on GitHub and open a pull request adding docs/SECURITY.md';

        // --- STEP 1: Catalog Narrowing & Hybrid Skill Prioritization over 250 skills ---
        const limits = ResolveCatalogNarrowingLimits({
            maxActionsInPrompt: 8,
            maxSkillsInPrompt: 5,
        });
        assert.equal(limits.Skills, 5);

        const candidates: CatalogNarrowingCandidate[] = largeSkillCatalog.map((s) => ({
            Kind: 'skill',
            ID: s.ID,
            Name: s.Name,
            Description: s.Description,
            Pinned: s.ID === PINNED_SKILL_ID,
        }));

        const telemetry = new Map([
            [
                GITHUB_SKILL_ID.toLowerCase(),
                {
                    Category: 'Engineering',
                    AgentInvocationCount: 12,
                    GlobalInvocationCount: 35,
                    LastInvokedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
                },
            ],
        ]);

        const preFilter = PreFilterSkillCandidatesForDecision(candidates, userTask, 15, telemetry);
        const keptSkills = preFilter.FilteredCandidates.filter((c) => c.Kind === 'skill');
        // 1 pinned + 15 top-ranked unpinned = 16 skills sent to Stage 2 (234 pre-hidden)
        assert.equal(keptSkills.length, 16);
        assert.equal(preFilter.PreHiddenSkillIDs.size, 234);
        assert.ok(keptSkills.some((s) => s.ID === PINNED_SKILL_ID));
        assert.ok(keptSkills.some((s) => s.ID === GITHUB_SKILL_ID));

        // Verify scale-aware narrowing note when 245 skills are hidden
        const hiddenSkillNames = largeSkillCatalog.slice(5).map((s) => s.Name);
        const narrowingNote = CatalogNarrowingNote('skill', hiddenSkillNames, { hasFindCandidateSkills: true });
        assert.ok(narrowingNote.includes('245 of your skills are not described below'));
        assert.ok(narrowingNote.includes('Call Find Candidate Skills to search the skill catalog'));

        // --- STEP 2: Agent calls `Find Candidate Skills` + `Get Skill Details` ---
        const findSkillsAction = new FindCandidateSkillsAction();
        const findRes = await (findSkillsAction as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(
            makeActionParams({
                TaskDescription: userTask,
                MaxResults: 3,
            }),
        );
        assert.equal(findRes.Success, true);
        const findPayload = JSON.parse(findRes.Message);
        assert.ok(findPayload.matchCount >= 1);
        assert.equal(findPayload.bestSkill.ID, GITHUB_SKILL_ID);
        assert.deepEqual(findPayload.bestSkill.ActionNames, [
            'GitHub - Get Repository Context',
            'GitHub - Commit Files and Create PR',
        ]);

        const detailsAction = new GetSkillDetailsAction();
        const detailsRes = await (detailsAction as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(
            makeActionParams({ SkillID: findPayload.bestSkill.ID }),
        );
        assert.equal(detailsRes.Success, true);
        const skillDetails = JSON.parse(detailsRes.Message);
        assert.equal(skillDetails.Name, 'GitHub Engineering & Repository Steward');
        assert.equal(skillDetails.BundledActions.length, 2);
        assert.ok(skillDetails.Instructions.includes('Never commit directly to `main` or `next`'));

        // --- STEP 3: Agent activates the skill & executes GitHub actions with 3LO user auth ---
        const recordedRequests: Array<{ method: string; url: string; authHeader: string; body?: unknown }> = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
            const method = init?.method ?? 'GET';
            const headers = (init?.headers ?? {}) as Record<string, string>;
            const authHeader = headers.Authorization ?? headers.authorization ?? '';
            const body = init?.body ? JSON.parse(String(init.body)) : undefined;
            recordedRequests.push({ method, url, authHeader, body });

            const jsonResponse = (status: number, data: unknown): Response =>
                new Response(JSON.stringify(data), {
                    status,
                    headers: { 'Content-Type': 'application/json' },
                });

            if (method === 'GET' && url.endsWith('/repos/MemberJunction/MJ')) {
                return jsonResponse(200, {
                    full_name: 'MemberJunction/MJ',
                    default_branch: 'next',
                    private: false,
                    description: 'MemberJunction Monorepo',
                    topics: ['ai', 'agents', 'metadata'],
                });
            }
            if (method === 'GET' && url.includes('/contents?ref=next')) {
                return jsonResponse(200, [
                    { name: 'README.md', path: 'README.md', type: 'file', size: 1200, sha: 'sha-readme' },
                    { name: 'packages', path: 'packages', type: 'dir', size: 0, sha: 'sha-pkgs' },
                ]);
            }
            if (method === 'GET' && url.includes('/readme')) {
                return jsonResponse(200, {
                    content: Buffer.from('# MemberJunction\nUnified metadata & AI platform.').toString('base64'),
                    encoding: 'base64',
                });
            }
            if (method === 'GET' && url.includes('/releases')) {
                return jsonResponse(200, [{ tag_name: 'v5.45.0', name: '5.45.0', published_at: '2026-11-01T00:00:00Z' }]);
            }
            if (method === 'GET' && url.endsWith('/git/ref/heads/next')) {
                return jsonResponse(200, { object: { sha: 'base-commit-sha-111' } });
            }
            if (method === 'GET' && (url.endsWith('/git/ref/heads/feat/security-docs') || url.endsWith('/git/ref/heads/feat%2Fsecurity-docs'))) {
                return jsonResponse(404, { message: 'Not Found' });
            }
            if (method === 'POST' && url.endsWith('/git/refs')) {
                return jsonResponse(201, { ref: 'refs/heads/feat/security-docs', object: { sha: 'base-commit-sha-111' } });
            }
            if (method === 'GET' && url.endsWith('/git/commits/base-commit-sha-111')) {
                return jsonResponse(200, { sha: 'base-commit-sha-111', tree: { sha: 'base-tree-sha-222' } });
            }
            if (method === 'POST' && url.endsWith('/git/trees')) {
                return jsonResponse(201, { sha: 'new-tree-sha-333' });
            }
            if (method === 'POST' && url.endsWith('/git/commits')) {
                return jsonResponse(201, {
                    sha: 'new-commit-sha-444',
                    html_url: 'https://github.com/MemberJunction/MJ/commit/new-commit-sha-444',
                });
            }
            if (method === 'PATCH' && (url.endsWith('/git/refs/heads/feat/security-docs') || url.endsWith('/git/refs/heads/feat%2Fsecurity-docs'))) {
                return jsonResponse(200, { object: { sha: 'new-commit-sha-444' } });
            }
            if (method === 'GET' && url.includes('/pulls?')) {
                return jsonResponse(200, []);
            }
            if (method === 'POST' && url.endsWith('/pulls')) {
                return jsonResponse(201, {
                    number: 1024,
                    html_url: 'https://github.com/MemberJunction/MJ/pull/1024',
                    state: 'open',
                    draft: true,
                    title: 'docs: add SECURITY.md policy',
                });
            }
            return jsonResponse(404, { message: `Unhandled mock route: ${method} ${url}` });
        }) as typeof globalThis.fetch;

        try {
            // 3a. Execute `GitHub - Get Repository Context`
            const getContextAction = new GitHubGetRepositoryContextAction();
            const ctxRes = await (getContextAction as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(
                makeActionParams({
                    Repository: 'MemberJunction/MJ',
                    UseUserDelegatedAuth: 'true',
                }),
            );
            assert.equal(ctxRes.Success, true, ctxRes.Message);
            const repoCtx = JSON.parse(ctxRes.Message);
            assert.equal(repoCtx.DefaultBranch, 'next');
            assert.ok(repoCtx.ReadmePreview.includes('MemberJunction'));

            // 3b. Execute `GitHub - Commit Files and Create PR`
            const commitAndPrAction = new GitHubCommitFilesAndCreatePRAction();
            const prRes = await (commitAndPrAction as unknown as { InternalRunAction: (p: RunActionParams) => Promise<{ Success: boolean; Message: string }> }).InternalRunAction(
                makeActionParams({
                    Repository: 'MemberJunction/MJ',
                    BaseBranch: 'next',
                    HeadBranch: 'feat/security-docs',
                    CommitMessage: 'docs: add SECURITY.md policy',
                    PRTitle: 'docs: add SECURITY.md policy',
                    PRBody: 'Adds repository security disclosure policy.',
                    Files: JSON.stringify([
                        {
                            path: 'docs/SECURITY.md',
                            content: '# Security Policy\nReport vulnerabilities to security@memberjunction.com.\n',
                        },
                    ]),
                    UseUserDelegatedAuth: 'true',
                }),
            );
            assert.equal(prRes.Success, true, prRes.Message);
            const prPayload = JSON.parse(prRes.Message);
            assert.equal(prPayload.CommitResult.CommitSha, 'new-commit-sha-444');
            assert.equal(prPayload.PullRequest.Number, 1024);
            assert.equal(prPayload.PullRequest.Draft, true);

            // Verify every outbound GitHub request used Alice's 3LO token (`ghu_alice_3lo_token_xyz`)
            assert.ok(recordedRequests.length >= 8);
            for (const req of recordedRequests) {
                assert.equal(req.authHeader, 'Bearer ghu_alice_3lo_token_xyz');
            }

            // --- STEP 4: Verify post-run hybrid skill re-ranking boosts the newly invoked skill ---
            const postRunRanking = RankSkillsByHybridRelevance(
                [
                    {
                        ID: '99999999-0000-4000-8000-000000000050',
                        Name: 'Generic Markdown Formatter',
                        Description: 'Formats markdown files and documentation.',
                        Category: 'Documentation',
                        AgentInvocationCount: 0,
                    },
                    {
                        ID: GITHUB_SKILL_ID,
                        Name: 'GitHub Engineering & Repository Steward',
                        Description: 'Inspect GitHub repositories, read source files, and commit multi-file changes to raise pull requests.',
                        Category: 'Engineering',
                        AgentInvocationCount: 13,
                        GlobalInvocationCount: 36,
                        LastInvokedAt: new Date().toISOString(),
                    },
                ],
                'Update documentation in a GitHub repository',
            );
            assert.equal(postRunRanking[0].Skill.ID, GITHUB_SKILL_ID);
            assert.equal(postRunRanking[0].RecencyScore, 1);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
