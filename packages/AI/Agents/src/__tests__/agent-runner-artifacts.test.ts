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
    public DuplicateVersionId: string | null = null;

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

    public override async GetMaxVersionForArtifact(): Promise<number> {
        return this.MaxVersion;
    }

    protected override async CheckForDuplicateVersion(): Promise<string | null> {
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
