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
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
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

/** Provider handing out fakes per entity name and recording every request. */
function makeProvider(factory: (entityName: string) => FakeEntity): {
    provider: IMetadataProvider;
    requested: string[];
} {
    const requested: string[] = [];
    const provider = {
        GetEntityObject: vi.fn(async (entityName: string) => {
            requested.push(entityName);
            return factory(entityName);
        }),
    } as unknown as IMetadataProvider;
    return { provider, requested };
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
        runner.PreviousArtifact = { artifactId: 'art-prior', versionNumber: 3 };

        const info = await runner.ProcessAgentArtifacts(makeResult(), 'detail-9', undefined, contextUser, provider);

        // No new artifact header — only the version row was created.
        expect(requested).not.toContain('MJ: Artifacts');
        expect(version.ArtifactID).toBe('art-prior');
        expect(version.VersionNumber).toBe(4);
        expect(info).toEqual({ artifactId: 'art-prior', versionId: 'ver-2', versionNumber: 4 });
    });

    it('honors an explicit sourceArtifactId identically with or without a conversation detail', async () => {
        const version = makeEntity('ver-5');
        const { provider, requested } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 4;

        const info = await runner.ProcessAgentArtifacts(makeResult(), undefined, 'art-source', contextUser, provider);

        expect(runner.FindPreviousSpy).not.toHaveBeenCalled();
        expect(requested).not.toContain('MJ: Artifacts');
        expect(info).toEqual({ artifactId: 'art-source', versionId: 'ver-5', versionNumber: 5 });
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
        runner.PreviousArtifact = { artifactId: 'art-prior', versionNumber: 3 };
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
    // A directive-named targetArtifactId reaches raw ExtraFilter fragments, so it must be UUID-shaped.
    const TARGET_UUID = '7a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
    const SOURCE_UUID = '9f8e7d6c-5b4a-4938-8271-6a5b4c3d2e1f';
    const SQL_INJECTION = "' OR '1'='1";

    it("'create-new' ignores sourceArtifactId, skips the previous-artifact lookup, and names the artifact from the directive", async () => {
        const artifact = makeEntity('art-new');
        const version = makeEntity('ver-1');
        const { provider, requested } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 2;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'create-new', name: 'Entity Catalog Explorer', description: 'Schema explorer' } }),
            'detail-1', 'art-old', contextUser, provider
        );

        expect(info).toEqual({ artifactId: 'art-new', versionId: 'ver-1', versionNumber: 1 });
        expect(artifact.Name).toBe('Entity Catalog Explorer');
        expect(artifact.Description).toBe('Schema explorer');
        expect(requested).toContain('MJ: Artifacts');
        expect(runner.FindPreviousSpy).not.toHaveBeenCalled();
    });

    it("'version-source' with a targetArtifactId versions the target, not the run's sourceArtifactId", async () => {
        // The directive-named target is loaded first to prove it exists and is readable.
        const artifact = makeEntity(TARGET_UUID);
        const version = makeEntity('ver-9');
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 4;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: TARGET_UUID } }),
            'detail-1', 'art-B', contextUser, provider
        );

        expect(info).toEqual({ artifactId: TARGET_UUID, versionId: 'ver-9', versionNumber: 5 });
        expect(version.ArtifactID).toBe(TARGET_UUID);
        expect(artifact.Load).toHaveBeenCalledWith(TARGET_UUID);
        // Readable target -> versioned in place; no new artifact header was created.
        expect(artifact.Save).not.toHaveBeenCalled();
    });

    it("'version-source' without a target versions the run's sourceArtifactId", async () => {
        const version = makeEntity('ver-3');
        const { provider } = makeProvider(() => version);
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 2;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source' } }),
            'detail-1', 'art-B', contextUser, provider
        );

        expect(info).toEqual({ artifactId: 'art-B', versionId: 'ver-3', versionNumber: 3 });
        expect(version.ArtifactID).toBe('art-B');
    });

    it("'suppress' creates nothing and never touches the provider", async () => {
        const { provider, requested } = makeProvider(() => makeEntity('unused'));
        const runner = new TestableAgentRunner(provider);

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'suppress' } }),
            'detail-1', 'art-B', contextUser, provider
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

        const info = await runner.ProcessAgentArtifacts(makeResult(), 'detail-1', 'art-B', contextUser, provider);

        expect(info).toEqual({ artifactId: 'art-B', versionId: 'ver-2', versionNumber: 2 });
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

    it("falls back to the run's sourceArtifactId when the directive-named target is not found or not readable", async () => {
        const artifact = makeEntity(TARGET_UUID, { Load: vi.fn(async () => false) });
        const version = makeEntity('ver-12');
        const { provider } = makeProvider((name) => (name === 'MJ: Artifacts' ? artifact : version));
        const runner = new TestableAgentRunner(provider);
        runner.MaxVersion = 6;

        const info = await runner.ProcessAgentArtifacts(
            makeResult({ artifactDirective: { behavior: 'version-source', targetArtifactId: TARGET_UUID } }),
            'detail-1', SOURCE_UUID, contextUser, provider
        );

        expect(artifact.Load).toHaveBeenCalledWith(TARGET_UUID);
        expect(info).toEqual({ artifactId: SOURCE_UUID, versionId: 'ver-12', versionNumber: 7 });
        expect(version.ArtifactID).toBe(SOURCE_UUID);
        // The unreadable target never reached either raw ExtraFilter, and nothing new was created.
        expect(runner.MaxVersionSpy).toHaveBeenCalledWith(SOURCE_UUID);
        expect(runner.MaxVersionSpy).not.toHaveBeenCalledWith(TARGET_UUID);
        expect(runner.DuplicateSpy).not.toHaveBeenCalledWith(TARGET_UUID);
        expect(artifact.Save).not.toHaveBeenCalled();
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
