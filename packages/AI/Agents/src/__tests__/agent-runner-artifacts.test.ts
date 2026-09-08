/**
 * Unit tests for {@link AgentRunner.ProcessAgentArtifacts} — specifically the branch-widened
 * `conversationDetailId?: string | undefined` contract added for realtime voice delegations:
 * outside a conversation context the artifact + version are still created, but the
 * previous-artifact lookup and the `ConversationDetailArtifact` junction link are SKIPPED.
 *
 * The DB-backed helpers (FindPreviousArtifactForMessage / LinkArtifactToConversationDetail /
 * GetMaxVersionForArtifact / CheckForDuplicateVersion) are overridden on a test subclass, the
 * provider is a fake entity factory, and AIEngine is module-mocked. No DB, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';

// Controllable agent cache — ProcessAgentArtifacts reads ArtifactCreationMode from it.
const engineAgents: Array<{ ID: string; Name: string; ArtifactCreationMode?: string; DefaultArtifactTypeID?: string }> = [];
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: vi.fn(async () => undefined),
                get Agents() { return engineAgents; },
            };
        },
    },
}));

import { AgentRunner } from '../AgentRunner';

interface FakeEntity {
    [key: string]: unknown;
    ID: string;
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    NewRecord: () => void;
}

function makeEntity(id: string, overrides: Partial<FakeEntity> = {}): FakeEntity {
    return {
        ID: id,
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        NewRecord: vi.fn(),
        ...overrides,
    };
}

/**
 * Real UUIDs throughout. Ids reach raw `ExtraFilter` fragments, and the runner rejects any id that
 * is not UUID-shaped — a fixture like `'art-B'` would silently exercise the REJECTION path while
 * appearing to test the happy one, which is how the injection assertion below used to pass by
 * accident (its two fixtures merely differed).
 */
const TARGET_UUID = '7a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const SOURCE_UUID = '9f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f';
const OTHER_UUID = '11112222-3333-4444-5555-666677778888';
const PRIOR_UUID = 'aaaabbbb-cccc-4ddd-8eee-ffff00001111';
const SQL_INJECTION = "' OR '1'='1";

/** How the fake provider answers the existence + authorization probe. */
interface ArtifactWorld {
    /** artifactId (lowercased) → owning user id. A missing key means "no such artifact". */
    owners: Map<string, string>;
    /** artifactIds (lowercased) the context user holds a CanEdit grant on. */
    grants: Set<string>;
    /** When set, RunViews throws instead of answering. */
    throws?: string;
}

function world(overrides: Partial<ArtifactWorld> = {}): ArtifactWorld {
    return { owners: new Map(), grants: new Set(), ...overrides };
}

/** Pulls the value out of a `Field='value'` fragment so the fake can answer by id. */
function filterValue(filter: string | undefined, field: string): string {
    const match = new RegExp(`${field}='([^']*)'`).exec(filter ?? '');
    return match ? match[1] : '';
}

/**
 * Provider handing out fakes per entity name and recording every request.
 *
 * `RunViews` answers the target-vetting probe (does the artifact exist, may this user add to it)
 * from `world`, and every batch is recorded so tests can assert on the ExtraFilter fragments
 * themselves — which is where id escaping has to be proven.
 */
function makeProvider(factory: (entityName: string) => FakeEntity, w: ArtifactWorld = world()): {
    provider: IMetadataProvider;
    requested: string[];
    runViewsCalls: RunViewParams[][];
} {
    const requested: string[] = [];
    const runViewsCalls: RunViewParams[][] = [];
    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            requested.push(entityName);
            return factory(entityName);
        }),
        RunViews: vi.fn(async (params: RunViewParams[]): Promise<RunViewResult[]> => {
            runViewsCalls.push(params);
            if (w.throws) {
                throw new Error(w.throws);
            }
            return params.map((view) => {
                if (view.EntityName === 'MJ: Artifacts') {
                    const id = filterValue(view.ExtraFilter as string, 'ID');
                    const owner = w.owners.get(id.toLowerCase());
                    return {
                        Success: true,
                        Results: owner === undefined ? [] : [{ ID: id, UserID: owner }],
                    } as unknown as RunViewResult;
                }
                if (view.EntityName === 'MJ: Artifact Permissions') {
                    const id = filterValue(view.ExtraFilter as string, 'ArtifactID');
                    return {
                        Success: true,
                        Results: w.grants.has(id.toLowerCase()) ? [{ ID: 'perm-1' }] : [],
                    } as unknown as RunViewResult;
                }
                return { Success: false, Results: [] } as unknown as RunViewResult;
            });
        }),
    } as unknown as IMetadataProvider;
    return { provider, requested, runViewsCalls };
}

/** Overrides the four DB-backed helpers with controllable spies. */
class TestableAgentRunner extends AgentRunner {
    public PreviousArtifact: { artifactId: string; versionNumber: number } | null = null;
    public FindPreviousSpy = vi.fn();
    public LinkSpy = vi.fn();
    public MaxVersion = 0;
    public MaxVersionSpy = vi.fn();
    public DuplicateVersionId: string | null = null;
    public DuplicateSpy = vi.fn();

    public override async FindPreviousArtifactForMessage(
        conversationDetailId: string
    ): Promise<{ artifactId: string; versionNumber: number } | null> {
        this.FindPreviousSpy(conversationDetailId);
        return this.PreviousArtifact;
    }

    protected override async LinkArtifactToConversationDetail(
        versionId: string,
        conversationDetailId: string,
        artifactId: string,
        versionNumber: number
    ): Promise<{ artifactId: string; versionId: string; versionNumber: number }> {
        this.LinkSpy(versionId, conversationDetailId, artifactId, versionNumber);
        return { artifactId, versionId, versionNumber };
    }

    public override async GetMaxVersionForArtifact(artifactId: string): Promise<number> {
        this.MaxVersionSpy(artifactId);
        return this.MaxVersion;
    }

    protected override async CheckForDuplicateVersion(artifactId: string): Promise<string | null> {
        this.DuplicateSpy(artifactId);
        return this.DuplicateVersionId;
    }
}

const contextUser = { ID: 'user-1', Email: 'u@example.com' } as unknown as UserInfo;

function makeResult(overrides: Partial<ExecuteAgentResult> = {}): ExecuteAgentResult {
    return {
        success: true,
        payload: { report: { title: 'Quarterly Summary' } },
        agentRun: { ID: 'run-1', AgentID: 'agent-1' },
        ...overrides,
    } as unknown as ExecuteAgentResult;
}

beforeEach(() => {
    engineAgents.length = 0;
    engineAgents.push({ ID: 'agent-1', Name: 'Test Agent', ArtifactCreationMode: 'Always' });
});

describe('AgentRunner.ProcessAgentArtifacts — conversationDetailId-optional widening', () => {
    it('creates the artifact + version WITHOUT previous-artifact lookup or junction link when detail id is undefined', async () => {
        const artifact = makeEntity('art-1');
        const version = makeEntity('ver-1');
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(makeResult(), undefined, undefined, contextUser, provider);

        expect(info).toEqual({ artifactId: 'art-1', versionId: 'ver-1', versionNumber: 1 });
        // Outside a conversation context: no look-behind, no junction link.
        expect(runner.FindPreviousSpy).not.toHaveBeenCalled();
        expect(runner.LinkSpy).not.toHaveBeenCalled();
        // The artifact header and version were still created.
        expect(artifact.Save).toHaveBeenCalledTimes(1);
        expect(artifact.Visibility).toBe('Always');
        expect(artifact.UserID).toBe('user-1');
        expect(version.Save).toHaveBeenCalledTimes(1);
        expect(version.ArtifactID).toBe('art-1');
        expect(version.VersionNumber).toBe(1);
        expect(JSON.parse(version.Content as string)).toEqual({ report: { title: 'Quarterly Summary' } });
    });

    it('keeps the conversation path intact: looks behind the message and links the junction when a detail id IS supplied', async () => {
        const artifact = makeEntity('art-1');
        const version = makeEntity('ver-1');
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(makeResult(), 'detail-9', undefined, contextUser, provider);

        expect(runner.FindPreviousSpy).toHaveBeenCalledWith('detail-9');
        expect(runner.LinkSpy).toHaveBeenCalledWith('ver-1', 'detail-9', 'art-1', 1);
        expect(info).toEqual({ artifactId: 'art-1', versionId: 'ver-1', versionNumber: 1 });
    });

    it('versions an existing artifact when the previous-artifact lookup hits (conversation path)', async () => {
        const version = makeEntity('ver-2');
        const { provider, requested } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.PreviousArtifact = { artifactId: PRIOR_UUID, versionNumber: 3 };

        const info = await runner.ProcessAgentArtifacts(makeResult(), 'detail-9', undefined, contextUser, provider);

        // No new artifact header — only the version row was created.
        expect(requested).not.toContain('MJ: Artifacts');
        expect(version.ArtifactID).toBe(PRIOR_UUID);
        expect(version.VersionNumber).toBe(4);
        expect(info).toEqual({ artifactId: PRIOR_UUID, versionId: 'ver-2', versionNumber: 4 });
    });

    it('honors an explicit sourceArtifactId identically with or without a conversation detail', async () => {
        const version = makeEntity('ver-5');
        const { provider, requested } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 4;

        const info = await runner.ProcessAgentArtifacts(makeResult(), undefined, SOURCE_UUID, contextUser, provider);

        expect(runner.FindPreviousSpy).not.toHaveBeenCalled();
        expect(requested).not.toContain('MJ: Artifacts');
        expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-5', versionNumber: 5 });
        expect(runner.LinkSpy).not.toHaveBeenCalled(); // no detail id → no junction
    });

    it("returns undefined without touching the provider when the agent's ArtifactCreationMode is 'Never'", async () => {
        engineAgents[0].ArtifactCreationMode = 'Never';
        const { provider, requested } = makeProvider(() => makeEntity('x'));
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(makeResult(), undefined, undefined, contextUser, provider);

        expect(info).toBeUndefined();
        expect(requested).toHaveLength(0);
    });

    it("stamps Visibility 'System Only' per the agent's ArtifactCreationMode", async () => {
        engineAgents[0].ArtifactCreationMode = 'System Only';
        const artifact = makeEntity('art-1');
        const version = makeEntity('ver-1');
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);

        await runner.ProcessAgentArtifacts(makeResult(), undefined, undefined, contextUser, provider);

        expect(artifact.Visibility).toBe('System Only');
    });

    it('returns undefined for an empty payload (nothing to create)', async () => {
        const { provider, requested } = makeProvider(() => makeEntity('x'));
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(makeResult({ payload: {} }), undefined, undefined, contextUser, provider);

        expect(info).toBeUndefined();
        expect(requested).toHaveLength(0);
    });

    it('skips the duplicate version (returns undefined) when content matches the latest version', async () => {
        const version = makeEntity('ver-never-saved');
        const { provider } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.PreviousArtifact = { artifactId: PRIOR_UUID, versionNumber: 3 };
        runner.DuplicateVersionId = 'ver-existing-3';

        const info = await runner.ProcessAgentArtifacts(makeResult(), 'detail-9', undefined, contextUser, provider);

        expect(info).toBeUndefined();
        expect(version.Save).not.toHaveBeenCalled();
        expect(runner.LinkSpy).not.toHaveBeenCalled();
    });

    it('contains a save failure (returns undefined, never throws)', async () => {
        const artifact = makeEntity('art-1', { Save: vi.fn(async () => false) });
        const { provider } = makeProvider(() => artifact);
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(makeResult(), undefined, undefined, contextUser, provider);

        expect(info).toBeUndefined();
    });
});

describe('AgentRunner.ProcessAgentArtifacts — artifactDirective (#529)', () => {
    it("'create-new' ignores sourceArtifactId, skips the previous-artifact lookup, and names the artifact from the directive", async () => {
        const artifact = makeEntity('art-new');
        const version = makeEntity('ver-1');
        const { provider, requested } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 2;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'create-new', name: 'Entity Catalog Explorer', description: 'Schema explorer' } }),
            'detail-1', OTHER_UUID, contextUser, provider
        );

        expect(info).toEqual({ artifactId: 'art-new', versionId: 'ver-1', versionNumber: 1 });
        expect(artifact.Name).toBe('Entity Catalog Explorer');
        expect(artifact.Description).toBe('Schema explorer');
        expect(requested).toContain('MJ: Artifacts');
        expect(runner.FindPreviousSpy).not.toHaveBeenCalled();
    });

    it("'version-source' with a targetArtifactId versions the target, not the run's sourceArtifactId", async () => {
        // The directive-named target is vetted first: it must exist AND be writable by this user.
        const version = makeEntity('ver-9');
        const { provider, requested, runViewsCalls } = makeProvider(
            () => version,
            world({ owners: new Map([[TARGET_UUID, 'user-1']]) })
        );
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 4;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: TARGET_UUID } }),
            'detail-1', SOURCE_UUID, contextUser, provider
        );

        expect(info).toEqual({ artifactId: TARGET_UUID, versionId: 'ver-9', versionNumber: 5 });
        expect(version.ArtifactID).toBe(TARGET_UUID);
        // Existence and authorization in ONE round trip, not a full-entity Load.
        expect(runViewsCalls).toHaveLength(1);
        expect(runViewsCalls[0].map((v) => v.EntityName)).toEqual(['MJ: Artifacts', 'MJ: Artifact Permissions']);
        // Writable target -> versioned in place; no new artifact header was created.
        expect(requested).not.toContain('MJ: Artifacts');
    });

    it("'version-source' without a target versions the run's sourceArtifactId", async () => {
        const version = makeEntity('ver-3');
        const { provider } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 2;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source' } }),
            'detail-1', SOURCE_UUID, contextUser, provider
        );

        expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-3', versionNumber: 3 });
        expect(version.ArtifactID).toBe(SOURCE_UUID);
    });

    it("'suppress' creates nothing and never touches the provider", async () => {
        const { provider, requested } = makeProvider(() => makeEntity('unused'));
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'suppress' } }),
            'detail-1', SOURCE_UUID, contextUser, provider
        );

        expect(info).toBeUndefined();
        expect(requested).toEqual([]);
        expect(runner.LinkSpy).not.toHaveBeenCalled();
    });

    it('absent directive keeps legacy behavior: sourceArtifactId is versioned', async () => {
        const version = makeEntity('ver-2');
        const { provider, requested } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 1;

        const info = await runner.ProcessAgentArtifacts(makeResult(), 'detail-1', SOURCE_UUID, contextUser, provider);

        expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-2', versionNumber: 2 });
        expect(requested).not.toContain('MJ: Artifacts');
    });

    it("'create-new' without a name keeps the historical placeholder name", async () => {
        const artifact = makeEntity('art-new');
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : makeEntity('ver-1')));
        const runner = new TestableAgentRunner(provider);

        await runner.ProcessAgentArtifacts(makeResult({ artifactDirective: { behavior: 'create-new' } }), 'detail-1', undefined, contextUser, provider);

        expect(String(artifact.Name)).toMatch(/^Test Agent Payload - /);
    });

    it("rejects a non-UUID targetArtifactId and falls back to the run's sourceArtifactId, never passing it to a filter", async () => {
        const version = makeEntity('ver-7');
        const { provider, requested } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 2;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: SQL_INJECTION } }),
            'detail-1', SOURCE_UUID, contextUser, provider
        );

        // Identical to the legacy sourceArtifactId case.
        expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-7', versionNumber: 3 });
        expect(requested).not.toContain('MJ: Artifacts');
        expect(version.ArtifactID).toBe(SOURCE_UUID);
        // The injected string never reaches either raw ExtraFilter.
        expect(runner.MaxVersionSpy).toHaveBeenCalledWith(SOURCE_UUID);
        expect(runner.MaxVersionSpy).not.toHaveBeenCalledWith(SQL_INJECTION);
        expect(runner.DuplicateSpy).toHaveBeenCalledWith(SOURCE_UUID);
        expect(runner.DuplicateSpy).not.toHaveBeenCalledWith(SQL_INJECTION);
    });

    it('rejects a non-UUID targetArtifactId with no sourceArtifactId and creates a new artifact instead', async () => {
        const artifact = makeEntity('art-fresh');
        const version = makeEntity('ver-1');
        const { provider, requested } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: SQL_INJECTION } }),
            undefined, undefined, contextUser, provider
        );

        expect(info).toEqual({ artifactId: 'art-fresh', versionId: 'ver-1', versionNumber: 1 });
        expect(requested).toContain('MJ: Artifacts');
        expect(version.VersionNumber).toBe(1);
        // No version lookup at all — nothing was versioned, so no filter was built.
        expect(runner.MaxVersionSpy).not.toHaveBeenCalled();
        expect(runner.DuplicateSpy).not.toHaveBeenCalled();
    });

    it('ignores a NON-STRING targetArtifactId without throwing and versions the source instead', async () => {
        const version = makeEntity('ver-11');
        const { provider, requested } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 1;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: 5 as unknown as string } }),
            'detail-1', SOURCE_UUID, contextUser, provider
        );

        // A defined result proves nothing threw: the catch-all around the whole body returns undefined.
        expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-11', versionNumber: 2 });
        expect(version.ArtifactID).toBe(SOURCE_UUID);
        expect(requested).not.toContain('MJ: Artifacts');
        expect(runner.MaxVersionSpy).toHaveBeenCalledWith(SOURCE_UUID);
        expect(runner.MaxVersionSpy).not.toHaveBeenCalledWith(5);
    });

    it("falls back to the run's sourceArtifactId when the directive-named target does not exist", async () => {
        const version = makeEntity('ver-12');
        // Empty world: the target id resolves to no row.
        const { provider, requested, runViewsCalls } = makeProvider(() => version, world());
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 6;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: TARGET_UUID } }),
            'detail-1', SOURCE_UUID, contextUser, provider
        );

        expect(runViewsCalls).toHaveLength(1);
        expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-12', versionNumber: 7 });
        expect(version.ArtifactID).toBe(SOURCE_UUID);
        // The missing target never reached either raw ExtraFilter, and nothing new was created.
        expect(runner.MaxVersionSpy).toHaveBeenCalledWith(SOURCE_UUID);
        expect(runner.MaxVersionSpy).not.toHaveBeenCalledWith(TARGET_UUID);
        expect(runner.DuplicateSpy).not.toHaveBeenCalledWith(TARGET_UUID);
        expect(requested).not.toContain('MJ: Artifacts');
    });

    it("keeps the directive's name even when the first version exposes an extracted name attribute", async () => {
        const artifact = makeEntity('art-new');
        const version = makeEntity('ver-1', { Attributes: [{ StandardProperty: 'name', Value: 'Extracted Name' }] });
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);

        await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'create-new', name: 'Entity Catalog Explorer' } }),
            'detail-1', undefined, contextUser, provider
        );

        expect(artifact.Name).toBe('Entity Catalog Explorer');
        // Header saved once; the extracted-name rename pass never ran.
        expect(artifact.Save).toHaveBeenCalledTimes(1);
    });

    /**
     * `vwArtifacts` has no per-user predicate and no row-level-security filter, so a row resolving
     * proves only that it EXISTS. Without an ownership test an agent could name any artifact id in
     * the instance and have the run's payload appended to it as a new version.
     */
    describe('authorization on a directive-named target', () => {
        it("versions an artifact owned by ANOTHER user when this user holds a CanEdit grant", async () => {
            const version = makeEntity('ver-20');
            const { provider, runViewsCalls } = makeProvider(
                () => version,
                world({ owners: new Map([[TARGET_UUID, 'somebody-else']]), grants: new Set([TARGET_UUID]) })
            );
            const runner = new TestableAgentRunner(provider);
            runner.MaxVersion = 1;

            const info = await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: TARGET_UUID } }),
                'detail-1', SOURCE_UUID, contextUser, provider
            );

            expect(info).toEqual({ artifactId: TARGET_UUID, versionId: 'ver-20', versionNumber: 2 });
            // The grant lookup is scoped to BOTH the artifact and this user.
            const grantFilter = runViewsCalls[0][1].ExtraFilter as string;
            expect(grantFilter).toContain(`ArtifactID='${TARGET_UUID}'`);
            expect(grantFilter).toContain("UserID='user-1'");
            expect(grantFilter).toContain('CanEdit=1');
        });

        it("REFUSES an artifact owned by another user with no grant, and falls back", async () => {
            const version = makeEntity('ver-21');
            const { provider, requested } = makeProvider(
                () => version,
                world({ owners: new Map([[TARGET_UUID, 'somebody-else']]) })
            );
            const runner = new TestableAgentRunner(provider);
            runner.MaxVersion = 3;

            const info = await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: TARGET_UUID } }),
                'detail-1', SOURCE_UUID, contextUser, provider
            );

            // Falls back to the caller's own artifact — the other user's is untouched.
            expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-21', versionNumber: 4 });
            expect(runner.MaxVersionSpy).not.toHaveBeenCalledWith(TARGET_UUID);
            expect(requested).not.toContain('MJ: Artifacts');
        });

        it('falls back rather than losing the artifact when the lookup THROWS', async () => {
            // BaseEntity.Load throws on a permission denial, a SQL conversion error or any transient
            // fault. A throw here used to reach the method-wide catch and return undefined: no
            // artifact, no version, no link — the deliverable survived only in the run's payload.
            const version = makeEntity('ver-22');
            const { provider } = makeProvider(() => version, world({ throws: 'Conversion failed when converting from a character string to uniqueidentifier' }));
            const runner = new TestableAgentRunner(provider);
            runner.MaxVersion = 8;

            const info = await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: TARGET_UUID } }),
                'detail-1', SOURCE_UUID, contextUser, provider
            );

            expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-22', versionNumber: 9 });
        });

        it('does not re-admit a rejected id when the agent echoed the run\'s own sourceArtifactId', async () => {
            // A model told the source id is apt to name it back as its target. The id is model
            // output on that rung, so it is vetted — and once rejected it must NOT reappear as a
            // "trusted" caller id on the next rung, which used to log "not readable" and then
            // version it anyway.
            const artifact = makeEntity('art-fresh');
            const version = makeEntity('ver-23');
            const { provider } = makeProvider(
                (name) => (name === 'MJ: Artifacts' ? artifact : version),
                world() // the echoed id resolves to nothing
            );
            const runner = new TestableAgentRunner(provider);

            const info = await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: SOURCE_UUID } }),
                'detail-1', SOURCE_UUID, contextUser, provider
            );

            // Legacy chain, ending in a new artifact — NOT a version of the rejected id.
            expect(info).toEqual({ artifactId: 'art-fresh', versionId: 'ver-23', versionNumber: 1 });
            expect(runner.MaxVersionSpy).not.toHaveBeenCalled();
            expect(runner.DuplicateSpy).not.toHaveBeenCalled();
        });

        it('trims a target id before it reaches a filter or the version row', async () => {
            // IsValidUUID tolerates surrounding whitespace, so a model writing the id on its own
            // line passes validation; the raw value would then land in ArtifactID='<uuid>\n'.
            const version = makeEntity('ver-24');
            const { provider, runViewsCalls } = makeProvider(
                () => version,
                world({ owners: new Map([[TARGET_UUID, 'user-1']]) })
            );
            const runner = new TestableAgentRunner(provider);
            runner.MaxVersion = 0;

            const info = await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: `  ${TARGET_UUID}\n` } }),
                'detail-1', undefined, contextUser, provider
            );

            expect(info).toEqual({ artifactId: TARGET_UUID, versionId: 'ver-24', versionNumber: 1 });
            expect(version.ArtifactID).toBe(TARGET_UUID);
            expect(runViewsCalls[0][0].ExtraFilter).toBe(`ID='${TARGET_UUID}'`);
            expect(runner.MaxVersionSpy).toHaveBeenCalledWith(TARGET_UUID);
        });
    });

    describe("the directive's free-text fields are model output", () => {
        it('clamps an over-long name to the column instead of failing the save', async () => {
            // MJ: Artifacts.Name is nvarchar(255) and BaseEntity.Validate enforces MaxLength, so an
            // unclamped LLM title made Save() return false and took the whole artifact down.
            const artifact = makeEntity('art-new');
            const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : makeEntity('ver-1')));
            const runner = new TestableAgentRunner(provider);

            await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: 'create-new', name: 'T'.repeat(400) } }),
                'detail-1', undefined, contextUser, provider
            );

            expect(String(artifact.Name)).toHaveLength(255);
            expect(artifact.Save).toHaveBeenCalledTimes(1);
        });

        it('ignores a NON-STRING name and keeps the placeholder', async () => {
            const artifact = makeEntity('art-new');
            const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : makeEntity('ver-1')));
            const runner = new TestableAgentRunner(provider);

            const info = await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: 'create-new', name: 42 as unknown as string, description: ['x'] as unknown as string } }),
                'detail-1', undefined, contextUser, provider
            );

            // A defined result proves nothing threw on `.trim()`.
            expect(info).toEqual({ artifactId: 'art-new', versionId: 'ver-1', versionNumber: 1 });
            expect(String(artifact.Name)).toMatch(/^Test Agent Payload - /);
            expect(artifact.Description).toBe('Payload returned by Test Agent');
        });

        it('does not throw on a value whose toString is not callable', async () => {
            // `String({ toString: 'x' })` throws — and it used to be called while BUILDING the log
            // line that reports the rejection, so the guard itself killed the artifact.
            const artifact = makeEntity('art-new');
            const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : makeEntity('ver-1')));
            const runner = new TestableAgentRunner(provider);

            const info = await runner.ProcessAgentArtifacts(
                makeResult({
                    artifactDirective: {
                        behavior: 'version-source',
                        targetArtifactId: { toString: 'not a function' } as unknown as string,
                    },
                }),
                'detail-1', undefined, contextUser, provider
            );

            expect(info).toEqual({ artifactId: 'art-new', versionId: 'ver-1', versionNumber: 1 });
        });
    });

    describe('a behavior this build does not recognize', () => {
        it("is no WORSE than no directive: the caller's sourceArtifactId is still versioned", async () => {
            // 'legacy' means "previous artifact on this message, else a new one", and on a fresh
            // agent-response detail there is no previous artifact — so dropping the run's
            // sourceArtifactId would make a garbled directive STRICTER than none at all.
            const version = makeEntity('ver-30');
            const { provider, requested } = makeProvider(() => version);
            const runner = new TestableAgentRunner(provider);
            runner.MaxVersion = 5;

            const info = await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: 'createNew' as unknown as 'create-new' } }),
                'detail-1', SOURCE_UUID, contextUser, provider
            );

            expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-30', versionNumber: 6 });
            expect(requested).not.toContain('MJ: Artifacts');
        });

        it('tolerates a non-string behavior', async () => {
            const version = makeEntity('ver-31');
            const { provider } = makeProvider(() => version);
            const runner = new TestableAgentRunner(provider);
            runner.MaxVersion = 1;

            const info = await runner.ProcessAgentArtifacts(
                makeResult({ artifactDirective: { behavior: null as unknown as 'suppress' } }),
                'detail-1', SOURCE_UUID, contextUser, provider
            );

            expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-31', versionNumber: 2 });
        });
    });

    it('rejects a non-UUID CALLER sourceArtifactId and falls back to the legacy chain', async () => {
        // Not only directive ids reach the ExtraFilter builders. A caller id that cannot name an
        // artifact used to be interpolated anyway, producing either a SQL error or — for a value
        // shaped like `x' OR 'a'='a` — a predicate.
        const artifact = makeEntity('art-fresh');
        const version = makeEntity('ver-32');
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(makeResult(), 'detail-1', SQL_INJECTION, contextUser, provider);

        expect(info).toEqual({ artifactId: 'art-fresh', versionId: 'ver-32', versionNumber: 1 });
        expect(runner.MaxVersionSpy).not.toHaveBeenCalled();
        expect(runner.DuplicateSpy).not.toHaveBeenCalled();
    });

    it("adopts the version's extracted name when the directive did NOT name the artifact", async () => {
        const artifact = makeEntity('art-new');
        const version = makeEntity('ver-1', { Attributes: [{ StandardProperty: 'name', Value: 'Extracted Name' }] });
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);

        await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'create-new', description: 'Schema explorer' } }),
            'detail-1', undefined, contextUser, provider
        );

        expect(artifact.Name).toBe('Extracted Name');
        // Header save + the rename save.
        expect(artifact.Save).toHaveBeenCalledTimes(2);
    });
});

/**
 * `RunViewParams.ExtraFilter` is a raw SQL fragment with no parameterized form, and the upstream
 * `ValidateUserProvidedSQLClause` blacklists statement keywords but permits `OR` — so an
 * unescaped id in one of these predicates is a real injection surface. Escaping is asserted at the
 * BUILDER rather than at one audited call site, which is what makes it cover every caller,
 * including the `sourceArtifactId` that arrives straight from the GraphQL boundary.
 */
describe('AgentRunner query builders — id escaping', () => {
    class ExposedRunner extends AgentRunner {
        public CheckDuplicate(artifactId: string, content: string, latestVersion: number, user: UserInfo, provider: IMetadataProvider) {
            return this.CheckForDuplicateVersion(artifactId, content, latestVersion, user, provider);
        }
    }

    /** Provider that records every single-view RunView and answers with no rows. */
    function capturingProvider(): { provider: IMetadataProvider; filters: string[] } {
        const filters: string[] = [];
        const provider = {
            GetEntityObject: vi.fn(async () => makeEntity('unused')),
            RunView: vi.fn(async (params: RunViewParams): Promise<RunViewResult> => {
                filters.push(params.ExtraFilter as string);
                return { Success: true, Results: [] } as unknown as RunViewResult;
            }),
        } as unknown as IMetadataProvider;
        return { provider, filters };
    }

    it('escapes a quote-bearing id in GetMaxVersionForArtifact', async () => {
        const { provider, filters } = capturingProvider();
        const runner = new AgentRunner(provider);

        await runner.GetMaxVersionForArtifact(SQL_INJECTION, contextUser, provider);

        // The closing quote is doubled, so the value stays one string literal instead of becoming
        // `ArtifactID='' OR '1'='1'`.
        expect(filters[0]).toBe(`ArtifactID=''' OR ''1''=''1'`);
        expect(filters[0]).not.toContain("' OR '1'='1'");
    });

    it('escapes a quote-bearing id in CheckForDuplicateVersion', async () => {
        const { provider, filters } = capturingProvider();
        const runner = new ExposedRunner(provider);

        await runner.CheckDuplicate(SQL_INJECTION, '{}', 3, contextUser, provider);

        expect(filters[0]).toBe(`ArtifactID=''' OR ''1''=''1' AND VersionNumber=3`);
    });

    it('escapes a quote-bearing conversation detail id in FindPreviousArtifactForMessage', async () => {
        const { provider, filters } = capturingProvider();
        const runner = new AgentRunner(provider);

        await runner.FindPreviousArtifactForMessage(SQL_INJECTION, contextUser, provider);

        expect(filters[0]).toBe(`ConversationDetailID=''' OR ''1''=''1' AND Direction='Output'`);
    });

    it('leaves a well-formed id untouched', async () => {
        const { provider, filters } = capturingProvider();
        const runner = new AgentRunner(provider);

        await runner.GetMaxVersionForArtifact(TARGET_UUID, contextUser, provider);

        expect(filters[0]).toBe(`ArtifactID='${TARGET_UUID}'`);
    });
});
