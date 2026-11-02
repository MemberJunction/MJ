/**
 * anchored-record-comments.test.ts — End-to-end cross-package integration tests verifying the
 * contract between `@memberjunction/core-entities` (AnchoredConversationSecurity, ConversationEngine,
 * ConversationWriteAccess, DispatchConversationMentionNotifications) and
 * `@memberjunction/core-entities-server` (InspectAndStampRestrictedFieldsForComment,
 * RegisterRestrictedFieldLLMClassifier).
 */
import { describe, expect, it, vi } from 'vitest';
import { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ComputeAnchoredCommentCounts,
    DispatchConversationMentionNotifications,
    IsConversationHiddenByFieldSecurity,
    MJConversationEntity,
    RegisterShareNotificationHandler,
    UserMayWriteConversation
} from '@memberjunction/core-entities';
import {
    InspectAndStampRestrictedFieldsForComment,
    RegisterRestrictedFieldLLMClassifier
} from '@memberjunction/core-entities-server';

function buildEntityWithFLS(deniedFieldsForUser: Map<string, Set<string>>): EntityInfo {
    return {
        ID: 'E0000000-0000-0000-0000-000000000010',
        Name: 'Employees',
        DisplayNameOrName: 'Employees',
        FieldLevelSecurityApplies: true,
        FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true, TSType: 'string' },
        PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true, TSType: 'string' }],
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, DisplayName: 'ID', DisplayNameOrName: 'ID', NeedsQuotes: true, TSType: 'string', HasFieldPermissions: false },
            { Name: 'Title', IsPrimaryKey: false, DisplayName: 'Job Title', DisplayNameOrName: 'Job Title', NeedsQuotes: true, TSType: 'string', HasFieldPermissions: false },
            { Name: 'Salary', IsPrimaryKey: false, DisplayName: 'Annual Salary', DisplayNameOrName: 'Annual Salary', NeedsQuotes: false, TSType: 'number', HasFieldPermissions: true, Description: 'Employee compensation' },
            { Name: 'SSN', IsPrimaryKey: false, DisplayName: 'Social Security Number', DisplayNameOrName: 'Social Security Number', NeedsQuotes: true, TSType: 'string', HasFieldPermissions: true, Description: 'Tax identifier' }
        ],
        GetUserPermisions: vi.fn().mockReturnValue({ CanRead: true }),
        GetDeniedReadFields: vi.fn((user: UserInfo) => deniedFieldsForUser.get(user.ID) ?? new Set<string>()),
        IsFieldReadableByUser: vi.fn((fieldName: string, user: UserInfo) => {
            const denied = deniedFieldsForUser.get(user.ID);
            return !denied || !denied.has(fieldName.toLowerCase());
        })
    } as unknown as EntityInfo;
}

describe('Anchored Record Comments Cross-Package Security & Notification Integration', () => {
    const hrDirector = { ID: 'U0000000-0000-0000-0000-000000000001', Name: 'HR Director' } as unknown as UserInfo;
    const teamPeer = { ID: 'U0000000-0000-0000-0000-000000000002', Name: 'Team Peer' } as unknown as UserInfo;

    it('detects unanchored comments about restricted fields via LLM/deterministic classifier, stamps AnchorMetadataObject.restrictedFields, hides the thread from FLS-denied peers, and suppresses their @mention notifications', async () => {
        const deniedMap = new Map<string, Set<string>>([
            [hrDirector.ID, new Set<string>()],
            [teamPeer.ID, new Set<string>(['salary', 'ssn'])]
        ]);
        const employeesEntity = buildEntityWithFLS(deniedMap);

        const savedNotifications: Array<{ UserID: string; Title: string; Message: string }> = [];
        let activeConversation: MJConversationEntity | null = null;
        const runViewFn = vi.fn().mockImplementation(async (params: { ResultType?: string }) => {
            if (params.ResultType === 'count_only') {
                return { Success: true, TotalRowCount: 1, Results: [] };
            }
            return {
                Success: true,
                Results: [{ ID: 'EMP-1', Title: 'Staff Engineer', Salary: 215000, SSN: '999-00-1234' }]
            };
        });
        const provider = {
            ProviderType: 'Database',
            Entities: [employeesEntity],
            EntityByID: vi.fn().mockReturnValue(employeesEntity),
            RunView: runViewFn,
            CreateRunViewObject: vi.fn().mockReturnValue({
                RunView: runViewFn
            }),
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: Conversations') {
                    return {
                        ...(activeConversation ?? {}),
                        Load: vi.fn().mockImplementation(async function (this: Record<string, unknown>) {
                            if (activeConversation) {
                                Object.assign(this, activeConversation);
                                return true;
                            }
                            return false;
                        })
                    };
                }
                if (entityName === 'MJ: Users') {
                    return {
                        ID: teamPeer.ID,
                        Name: teamPeer.Name,
                        Load: vi.fn().mockResolvedValue(true)
                    };
                }
                if (entityName === 'MJ: User Notifications') {
                    const notif = {
                        UserID: '',
                        Title: '',
                        Message: '',
                        ResourceRecordID: '',
                        ResourceConfiguration: '',
                        Unread: true,
                        NewRecord: vi.fn(),
                        Save: vi.fn().mockImplementation(async function (this: { UserID: string; Title: string; Message: string }) {
                            savedNotifications.push({ UserID: this.UserID, Title: this.Title, Message: this.Message });
                            return true;
                        })
                    };
                    return notif;
                }
                return null;
            })
        } as unknown as IMetadataProvider;

        // 1. Register a semantic classifier simulating LLM detection of indirect compensation discussion,
        //    and use the in-app MJ: User Notifications dispatcher for isolated provider testing.
        RegisterShareNotificationHandler(null);
        RegisterRestrictedFieldLLMClassifier(async (prompt) => {
            if (prompt.MessageText.toLowerCase().includes('total comp package')) {
                return ['Salary'];
            }
            return [];
        });

        try {
            const recordLevelConversation = {
                ID: 'C0000000-0000-0000-0000-000000000099',
                Name: 'Employee Review Thread',
                UserID: hrDirector.ID,
                LinkedEntityID: employeesEntity.ID,
                LinkedRecordID: 'EMP-1',
                AnchorType: 'Record',
                AnchorKey: null,
                AnchorMetadata: null,
                AnchorMetadataObject: { anchorDisplayName: 'Employee Record' },
                IsResolved: false,
                IsDirty: true,
                Save: vi.fn().mockResolvedValue(true)
            } as unknown as MJConversationEntity;
            activeConversation = recordLevelConversation;

            // 2. HR Director posts an unanchored Record comment mentioning Team Peer and discussing "total comp package"
            const commentMessage =
                'Hey @{"type":"user","id":"U0000000-0000-0000-0000-000000000002","name":"Team Peer"} let us review the total comp package before Friday.';

            const inspection = await InspectAndStampRestrictedFieldsForComment({
                Provider: provider,
                ContextUser: hrDirector,
                Conversation: recordLevelConversation,
                EntityInfo: employeesEntity,
                MessageText: commentMessage
            });

            expect(inspection.Allowed).toBe(true);
            expect(inspection.DetectedFields).toEqual(['Salary']);
            expect(recordLevelConversation.AnchorMetadataObject?.restrictedFields).toEqual(['Salary']);

            // 3. Team Peer (denied FLS read on Salary) attempts to view or write to the thread
            expect(
                IsConversationHiddenByFieldSecurity(
                    employeesEntity,
                    teamPeer,
                    recordLevelConversation.AnchorType,
                    recordLevelConversation.AnchorKey,
                    recordLevelConversation.AnchorMetadataObject
                )
            ).toBe(true);

            const peerWriteDecision = await UserMayWriteConversation(
                provider,
                teamPeer,
                recordLevelConversation.ID
            );
            expect(peerWriteDecision.Allowed).toBe(false);

            // 4. Rollup counts for Team Peer exclude the Salary-stamped thread, while HR Director sees it
            const peerRollup = ComputeAnchoredCommentCounts([recordLevelConversation], teamPeer, employeesEntity);
            const directorRollup = ComputeAnchoredCommentCounts([recordLevelConversation], hrDirector, employeesEntity);
            expect(peerRollup.TotalOpenCount).toBe(0);
            expect(directorRollup.TotalOpenCount).toBe(1);

            // 5. @Mention notification dispatch suppresses notification for Team Peer because of FLS denial
            await DispatchConversationMentionNotifications({
                Provider: provider,
                ContextUser: hrDirector,
                ConversationID: recordLevelConversation.ID,
                ConversationDetailID: 'D0000000-0000-0000-0000-000000000001',
                AuthorUserID: hrDirector.ID,
                Message: commentMessage,
                Conversation: recordLevelConversation,
                ResolveRecipientUserInfo: (userId) => (userId === teamPeer.ID ? teamPeer : hrDirector)
            });
            expect(savedNotifications).toHaveLength(0);

            // 6. Now HR Director opens a Field thread on an UNRESTRICTED field ('Title') in section 'sec-role' / group 'grp-org'
            //    and @mentions Team Peer — Team Peer CAN read 'Title', so they receive the notification and see the rollup!
            const titleConversation = {
                ID: 'C0000000-0000-0000-0000-000000000100',
                Name: 'Job Title Thread',
                UserID: hrDirector.ID,
                LinkedEntityID: employeesEntity.ID,
                LinkedRecordID: 'EMP-1',
                AnchorType: 'Field',
                AnchorKey: 'Title',
                AnchorMetadata: null,
                AnchorMetadataObject: {
                    anchorDisplayName: 'Job Title',
                    fieldName: 'Title',
                    sectionKey: 'sec-role',
                    groupKey: 'grp-org',
                    quotedValue: 'Staff Engineer'
                },
                IsResolved: false,
                IsDirty: true,
                Save: vi.fn().mockResolvedValue(true)
            } as unknown as MJConversationEntity;
            activeConversation = titleConversation;

            const titleComment =
                'Hey @{"type":"user","id":"U0000000-0000-0000-0000-000000000002","name":"Team Peer"} should we update Job Title to Principal Engineer?';

            const titleInspection = await InspectAndStampRestrictedFieldsForComment({
                Provider: provider,
                ContextUser: hrDirector,
                Conversation: titleConversation,
                EntityInfo: employeesEntity,
                MessageText: titleComment
            });
            expect(titleInspection.Allowed).toBe(true);
            expect(titleInspection.DetectedFields).toEqual([]);

            const peerWriteTitle = await UserMayWriteConversation(provider, teamPeer, titleConversation.ID);
            expect(peerWriteTitle.Allowed).toBe(true);

            const peerCombinedRollup = ComputeAnchoredCommentCounts(
                [recordLevelConversation, titleConversation],
                teamPeer,
                employeesEntity
            );
            expect(peerCombinedRollup.TotalOpenCount).toBe(1);
            expect(peerCombinedRollup.ByField.get('title')).toBe(1);
            expect(peerCombinedRollup.BySection.get('sec-role')).toBe(1);
            expect(peerCombinedRollup.ByGroup.get('grp-org')).toBe(1);

            await DispatchConversationMentionNotifications({
                Provider: provider,
                ContextUser: hrDirector,
                ConversationID: titleConversation.ID,
                ConversationDetailID: 'D0000000-0000-0000-0000-000000000002',
                AuthorUserID: hrDirector.ID,
                Message: titleComment,
                Conversation: titleConversation,
                ResolveRecipientUserInfo: (userId) => (userId === teamPeer.ID ? teamPeer : hrDirector)
            });
            expect(savedNotifications).toHaveLength(1);
            expect(savedNotifications[0].UserID).toBe(teamPeer.ID);
            expect(savedNotifications[0].Title).toContain('HR Director mentioned you');
            expect(savedNotifications[0].Message).toContain('Job Title');
        } finally {
            RegisterRestrictedFieldLLMClassifier(null);
        }
    });
});
