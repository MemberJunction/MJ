import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJConversationEntity } from '../generated/entity_subclasses';

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        GetProviderInstance: () => ({
            Config: vi.fn().mockResolvedValue(undefined),
            GetUserAvailableResources: () => mockGrants,
            GetUserResourcePermissionLevel: (typeId: string, recordId: string) =>
                typeId === '81D4BC3D-9FEB-EF11-B01A-286B35C04427'
                    ? mockDirectLevel
                    : mockFolderLevels[recordId] ?? null,
        }),
    },
}));

let mockGrants: Array<{ ResourceRecordID: string; PermissionLevel: string }> = [];
let mockDirectLevel: 'View' | 'Edit' | 'Owner' | null = null;
let mockFolderLevels: Record<string, 'View' | 'Edit' | 'Owner'> = {};

import {
    UserMayReadConversation,
    UserMayWriteConversation,
} from '../custom/ConversationWriteAccess';
import {
    BUILT_IN_CONVERSATION_TYPE_IDS,
    CONVERSATION_TYPE_CODES,
    ConversationEngine,
} from '../engines/conversations';

interface StubProject {
    OwnerUserID: string | null;
    Load: () => Promise<boolean>;
}

interface StubConversation {
    UserID: string | null;
    ProjectID: string | null;
    AdditionalData: string | null;
    AnchorType: string | null;
    LinkedEntityID: string | null;
    LinkedRecordID: string | null;
    Load: () => Promise<boolean>;
}

function createTestUser(id: string): UserInfo {
    return new UserInfo(undefined, { ID: id, Name: id, Email: `${id}@example.com` });
}

function createMockProvider(opts: {
    ownerId: string | null;
    loadOk?: boolean;
    projectId?: string | null;
    folderOwnerId?: string | null;
    additionalData?: string | null;
}): IMetadataProvider {
    const mockProvider: Pick<IMetadataProvider, 'ProviderType' | 'GetEntityObject'> = {
        ProviderType: 'Database',
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: Projects') {
                const proj: StubProject = {
                    OwnerUserID: opts.folderOwnerId ?? null,
                    Load: async () => true,
                };
                return proj;
            }
            const conv: StubConversation = {
                UserID: opts.ownerId,
                ProjectID: opts.projectId ?? null,
                AdditionalData: opts.additionalData ?? null,
                AnchorType: null,
                LinkedEntityID: null,
                LinkedRecordID: null,
                Load: async () => opts.loadOk ?? true,
            };
            return conv;
        }) as IMetadataProvider['GetEntityObject'],
    };
    return mockProvider as IMetadataProvider;
}

describe('Side Questions — Core Entities & Access', () => {
    const user = createTestUser('user-viewer');

    beforeEach(() => {
        mockGrants = [];
        mockDirectLevel = null;
        mockFolderLevels = {};
    });

    it('exposes canonical SIDE_QUESTION conversation type constants', () => {
        expect(CONVERSATION_TYPE_CODES.SIDE_QUESTION).toBe('SIDE_QUESTION');
        expect(BUILT_IN_CONVERSATION_TYPE_IDS.SIDE_QUESTION).toBe('3B81EB3D-92D7-4947-92CE-D250F8928861');
        expect(
            ConversationEngine.Instance.ResolveConversationTypeID(CONVERSATION_TYPE_CODES.SIDE_QUESTION)
        ).toBe('3B81EB3D-92D7-4947-92CE-D250F8928861');
    });

    it('allows View-only users to read parent conversation via UserMayReadConversation while denying writes', async () => {
        mockGrants = [{ ResourceRecordID: 'conv-1', PermissionLevel: 'View' }];
        const provider = createMockProvider({ ownerId: 'owner-1' });

        const readDecision = await UserMayReadConversation(provider, user, 'conv-1');
        expect(readDecision.Loaded).toBe(true);
        expect(readDecision.Allowed).toBe(true);

        const writeDecision = await UserMayWriteConversation(provider, user, 'conv-1');
        expect(writeDecision.Allowed).toBe(false);
        expect(writeDecision.Reason).toMatch(/view-only/);
    });

    it('allows shared inheriting-folder viewers to read via UserMayReadConversation', async () => {
        const provider = createMockProvider({
            ownerId: 'owner-1',
            projectId: 'proj-shared',
            folderOwnerId: null,
            additionalData: '{"inheritFolderAccess":true}',
        });

        const readDecision = await UserMayReadConversation(provider, user, 'conv-1');
        expect(readDecision.Loaded).toBe(true);
        expect(readDecision.Allowed).toBe(true);
    });

    it('denies unrelated users with no grant and flags missing conversations as Loaded=false', async () => {
        const provider = createMockProvider({ ownerId: 'owner-1' });
        const denied = await UserMayReadConversation(provider, user, 'conv-1');
        expect(denied.Loaded).toBe(true);
        expect(denied.Allowed).toBe(false);

        const missingProvider = createMockProvider({ ownerId: 'owner-1', loadOk: false });
        const missing = await UserMayReadConversation(missingProvider, user, 'conv-missing');
        expect(missing.Loaded).toBe(false);
    });

    it('excludes ParentID != null from default visible conversation filter and allows opt-in', () => {
        const buildFilter = Reflect.get(
            ConversationEngine.Instance,
            'buildVisibleConversationsFilter'
        ) as (
            envId: string,
            userId: string,
            sharedIds: string[],
            options?: { includeSideQuestions?: boolean }
        ) => string;
        const defaultFilter = Reflect.apply(buildFilter, ConversationEngine.Instance, ['env-1', 'u1', []]);
        expect(defaultFilter).toContain('ParentID IS NULL');

        const optInFilter = Reflect.apply(buildFilter, ConversationEngine.Instance, [
            'env-1',
            'u1',
            [],
            { includeSideQuestions: true },
        ]);
        expect(optInFilter).not.toContain('ParentID IS NULL');
    });

    it('does not prepend child side conversations into sidebar cache', () => {
        const setLastEnv = Reflect.set(ConversationEngine.Instance, '_lastEnvironmentId', 'env-1');
        expect(setLastEnv).toBe(true);
        const listSubject = Reflect.get(ConversationEngine.Instance, '_conversations$') as {
            value: MJConversationEntity[];
            next: (v: MJConversationEntity[]) => void;
        };
        listSubject.next([]);

        const handleEvent = Reflect.get(
            ConversationEngine.Instance,
            'handleConversationEntityEvent'
        ) as (event: {
            type: string;
            baseEntity: { GetAll: () => Record<string, string | boolean | null> };
        }) => Promise<void>;

        void Reflect.apply(handleEvent, ConversationEngine.Instance, [
            {
                type: 'save',
                baseEntity: {
                    GetAll: () => ({
                        ID: 'side-conv-1',
                        ApplicationScope: 'Global',
                        AnchorType: null,
                        LinkedEntityID: null,
                        ParentID: 'parent-conv-1',
                        EnvironmentID: 'env-1',
                        IsArchived: false,
                    }),
                },
            },
        ]);
        expect(listSubject.value).toHaveLength(0);
    });
});
