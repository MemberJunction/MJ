import { describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJArtifactUseEntity } from '@memberjunction/core-entities';
import {
    BridgeDocLinksToCitationsAndArtifactUses,
    DeduplicateDocRecordLinks,
    DocRecordLinkToArtifactUse,
    DocRecordLinkToMessageCitation,
    FormatDocRecordLink,
    FormatMessageCitationAsDocLink,
    MessageCitationToArtifactUse,
    MessageCitationToDocRecordLink,
    ParseDocRecordLinks,
    RecordCitedArtifactUse,
} from '../doc-citation-bridge';
import { type MessageCitation } from '../conversation-citations';
import { ConversationUtility } from '../conversation-utility';

const COMPANY_ID = '11000001-7001-4001-8001-000000000001';
const ARTIFACT_ID = '44000001-7001-4001-8001-000000000001';
const ARTIFACT_VERSION_ID = '55000001-7001-4001-8001-000000000002';
const USER_ID = '33000001-7001-4001-8001-000000000002';
const CONVERSATION_ID = '77000001-7001-4001-8001-000000000001';

describe('doc-citation-bridge (P0.5)', () => {
    describe('ParseDocRecordLinks', () => {
        it('extracts [[...]] record, composite-key, artifact, and versioned artifact links alongside durable @{...} mention tokens', () => {
            const mentionToken = ConversationUtility.CreateRecordLink('MJ: Artifacts', 'Acme Brief Mention', {
                ID: ARTIFACT_ID,
                ArtifactVersionID: ARTIFACT_VERSION_ID,
                VersionNumber: 2,
            });
            const markdown = [
                `Account: [[MJ: Companies|${COMPANY_ID}|Acme Global Ventures]]`,
                `Composite: [[Space Members|SpaceID=sp-1;UserID=usr-2|Alice in Core]]`,
                `Versioned by num: [[MJ: Artifacts|${ARTIFACT_ID}@v2|Acme Strategy v2]]`,
                `Versioned by uuid: [[MJ: Artifacts|${ARTIFACT_ID}@${ARTIFACT_VERSION_ID}|Acme Strategy Snapshot]]`,
                `Version entity: [[MJ: Artifact Versions|${ARTIFACT_VERSION_ID}|Pinned v2]]`,
                `Durable mention: ${mentionToken}`,
            ].join('\n');

            const links = ParseDocRecordLinks(markdown);
            expect(links).toHaveLength(6);

            expect(links[0]).toMatchObject({
                TargetKind: 'record',
                Syntax: 'wiki',
                EntityName: 'MJ: Companies',
                RecordID: COMPANY_ID,
                Keys: { ID: COMPANY_ID },
                DisplayName: 'Acme Global Ventures',
                HasExplicitDisplayName: true,
            });

            expect(links[1]).toMatchObject({
                TargetKind: 'record',
                Syntax: 'wiki',
                EntityName: 'Space Members',
                Keys: { SpaceID: 'sp-1', UserID: 'usr-2' },
                DisplayName: 'Alice in Core',
            });

            expect(links[2]).toMatchObject({
                TargetKind: 'artifact',
                Syntax: 'wiki',
                EntityName: 'MJ: Artifacts',
                RecordID: ARTIFACT_ID,
                ArtifactID: ARTIFACT_ID,
                VersionNumber: 2,
                DisplayName: 'Acme Strategy v2',
            });

            expect(links[3]).toMatchObject({
                TargetKind: 'artifact',
                Syntax: 'wiki',
                EntityName: 'MJ: Artifacts',
                RecordID: ARTIFACT_ID,
                ArtifactID: ARTIFACT_ID,
                ArtifactVersionID: ARTIFACT_VERSION_ID,
                DisplayName: 'Acme Strategy Snapshot',
            });

            expect(links[4]).toMatchObject({
                TargetKind: 'artifact',
                Syntax: 'wiki',
                EntityName: 'MJ: Artifact Versions',
                RecordID: ARTIFACT_VERSION_ID,
                ArtifactVersionID: ARTIFACT_VERSION_ID,
                DisplayName: 'Pinned v2',
            });

            expect(links[5]).toMatchObject({
                TargetKind: 'artifact',
                Syntax: 'mention',
                EntityName: 'MJ: Artifacts',
                ArtifactID: ARTIFACT_ID,
                ArtifactVersionID: ARTIFACT_VERSION_ID,
                VersionNumber: 2,
                DisplayName: 'Acme Brief Mention',
            });
        });

        it('skips links inside fenced code blocks and inline code spans and ignores malformed/empty tokens', () => {
            const text = [
                'Inline code `[[MJ: Companies|' + COMPANY_ID + '|Ignored Inline]]`',
                '```markdown',
                `[[MJ: Artifacts|${ARTIFACT_ID}@v2|Ignored Fence]]`,
                '```',
                'Malformed: [[]] [[OnlyOne]] [[|missing-entity|Label]] [[Entity||Label]] [[Entity|id\nnewline|Label]]',
                `Valid: [[MJ: Companies|${COMPANY_ID}]]`,
            ].join('\n');

            const links = ParseDocRecordLinks(text);
            expect(links).toHaveLength(1);
            expect(links[0]).toMatchObject({
                TargetKind: 'record',
                EntityName: 'MJ: Companies',
                RecordID: COMPANY_ID,
                DisplayName: 'MJ: Companies',
                HasExplicitDisplayName: false,
            });
        });

        it('returns empty array for empty or link-free text', () => {
            expect(ParseDocRecordLinks('')).toEqual([]);
            expect(ParseDocRecordLinks('Plain markdown with [url](https://example.com).')).toEqual([]);
        });
    });

    describe('Deduplication & BridgeDocLinksToCitationsAndArtifactUses', () => {
        it('deduplicates mixed-case UUIDs and mixed wiki/mention syntax, upgrades fallback labels, and maps to MessageCitation and ArtifactUseCitationPayload', () => {
            const upperCompanyId = COMPANY_ID.toUpperCase();
            const upperArtifactId = ARTIFACT_ID.toUpperCase();
            const mentionCompany = ConversationUtility.CreateRecordLink('MJ: Companies', 'Acme Global Ventures', {
                ID: COMPANY_ID,
            });

            const text = [
                `First ref [[MJ: Companies|${upperCompanyId}]] (no label yet),`,
                `then artifact [[MJ: Artifacts|${upperArtifactId}@${ARTIFACT_VERSION_ID}|Acme Q4 Strategy]],`,
                `then repeated company ${mentionCompany},`,
                `then repeated artifact [[MJ: Artifacts|${ARTIFACT_ID}@${ARTIFACT_VERSION_ID}|Acme Q4 Strategy]],`,
                `and unversioned artifact [[MJ: Artifacts|44000001-7001-4001-8001-000000000002|Architecture Proposal]].`,
            ].join(' ');

            const bridged = BridgeDocLinksToCitationsAndArtifactUses(text, {
                UserID: USER_ID,
                UsageType: 'Viewed',
                ConversationID: CONVERSATION_ID,
                ResolveArtifactVersionID: (link) =>
                    link.ArtifactID === '44000001-7001-4001-8001-000000000002'
                        ? '55000001-7001-4001-8001-000000000003'
                        : undefined,
            });

            expect(bridged.Occurrences).toHaveLength(5);
            expect(bridged.Links).toHaveLength(3);
            expect(bridged.Citations).toHaveLength(3);
            expect(bridged.ArtifactUses).toHaveLength(2);

            // Citation 1: company record upgraded from fallback 'MJ: Companies' to 'Acme Global Ventures'
            expect(bridged.Citations[0]).toMatchObject({
                Index: 1,
                Kind: 'record',
                EntityName: 'MJ: Companies',
                DisplayName: 'Acme Global Ventures',
            });

            // Citation 2: explicitly versioned artifact
            expect(bridged.Citations[1]).toMatchObject({
                Index: 2,
                Kind: 'artifact',
                EntityName: 'MJ: Artifacts',
                ArtifactID: upperArtifactId,
                DisplayName: 'Acme Q4 Strategy',
                Keys: { ID: upperArtifactId, ArtifactVersionID: ARTIFACT_VERSION_ID },
            });

            // Citation 3: artifact resolved via ResolveArtifactVersionID callback
            expect(bridged.Citations[2]).toMatchObject({
                Index: 3,
                Kind: 'artifact',
                ArtifactID: '44000001-7001-4001-8001-000000000002',
                DisplayName: 'Architecture Proposal',
            });

            // ArtifactUses contain strongly-typed UsageType + deterministic JSON context
            expect(bridged.ArtifactUses[0]).toMatchObject({
                ArtifactVersionID: ARTIFACT_VERSION_ID,
                ArtifactID: upperArtifactId,
                UserID: USER_ID,
                UsageType: 'Viewed',
                DisplayName: 'Acme Q4 Strategy',
            });
            expect(JSON.parse(bridged.ArtifactUses[0].UsageContextJSON)).toMatchObject({
                Source: 'doc-citation-bridge',
                ConversationID: CONVERSATION_ID,
                CitationIndex: 2,
                CanonicalLink: `[[MJ: Artifacts|${upperArtifactId}@${ARTIFACT_VERSION_ID}|Acme Q4 Strategy]]`,
            });

            expect(bridged.ArtifactUses[1]).toMatchObject({
                ArtifactVersionID: '55000001-7001-4001-8001-000000000003',
                ArtifactID: '44000001-7001-4001-8001-000000000002',
                UserID: USER_ID,
                UsageType: 'Viewed',
            });
        });

        it('does not mutate input links during DeduplicateDocRecordLinks', () => {
            const links = ParseDocRecordLinks(
                `[[MJ: Companies|${COMPANY_ID}]] and [[MJ: Companies|${COMPANY_ID}|Acme]]`
            );
            const originalFirstLabel = links[0].DisplayName;
            const deduped = DeduplicateDocRecordLinks(links);
            expect(deduped).toHaveLength(1);
            expect(deduped[0].DisplayName).toBe('Acme');
            expect(links[0].DisplayName).toBe(originalFirstLabel);
        });
    });

    describe('Bidirectional Round-Trip Formatting', () => {
        it('preserves record, composite-key, version-number, version-UUID, and full-metadata artifact links across DocRecordLink <-> MessageCitation <-> [[...]] round trips', () => {
            const canonicalInputs = [
                `[[MJ: Companies|${COMPANY_ID}|Acme Global Ventures]]`,
                `[[Space Members|SpaceID=sp-1;UserID=usr-2|Alice in Core]]`,
                `[[MJ: Artifacts|${ARTIFACT_ID}|Acme Brief]]`,
                `[[MJ: Artifacts|${ARTIFACT_ID}@v2|Acme Brief v2]]`,
                `[[MJ: Artifacts|${ARTIFACT_ID}@${ARTIFACT_VERSION_ID}|Acme Brief Snapshot]]`,
                `[[MJ: Artifacts|ID=${ARTIFACT_ID};ArtifactVersionID=${ARTIFACT_VERSION_ID};VersionNumber=2|Acme Full Ref]]`,
                `[[MJ: Artifact Versions|${ARTIFACT_VERSION_ID}|Version Only]]`,
            ];

            for (const input of canonicalInputs) {
                const [parsed] = ParseDocRecordLinks(input);
                expect(parsed).toBeDefined();

                const formatted = FormatDocRecordLink(parsed);
                expect(formatted).toBe(input);

                const citation = DocRecordLinkToMessageCitation(parsed, 1);
                const roundTrippedLink = MessageCitationToDocRecordLink(citation);
                expect(roundTrippedLink).not.toBeNull();
                expect(roundTrippedLink?.TargetKind).toBe(parsed.TargetKind);
                expect(roundTrippedLink?.ArtifactID).toBe(parsed.ArtifactID);
                expect(roundTrippedLink?.ArtifactVersionID).toBe(parsed.ArtifactVersionID);
                expect(roundTrippedLink?.VersionNumber).toBe(parsed.VersionNumber);
                expect(FormatMessageCitationAsDocLink(citation)).toBe(input);
            }
        });

        it('returns null when converting url citations to DocRecordLink or ArtifactUse', () => {
            const urlCitation: MessageCitation = {
                Index: 1,
                Kind: 'url',
                Url: 'https://memberjunction.org',
                DisplayName: 'MemberJunction',
                RawToken: 'https://memberjunction.org',
            };
            expect(MessageCitationToDocRecordLink(urlCitation)).toBeNull();
            expect(FormatMessageCitationAsDocLink(urlCitation)).toBeNull();
            expect(MessageCitationToArtifactUse(urlCitation, { UserID: USER_ID })).toBeNull();
        });

        it('returns null from DocRecordLinkToArtifactUse for non-artifact links or missing UserID/ArtifactVersionID', () => {
            const [companyLink] = ParseDocRecordLinks(`[[MJ: Companies|${COMPANY_ID}|Acme]]`);
            const [unversionedArtifact] = ParseDocRecordLinks(`[[MJ: Artifacts|${ARTIFACT_ID}|Acme Brief]]`);

            expect(DocRecordLinkToArtifactUse(companyLink, { UserID: USER_ID })).toBeNull();
            expect(DocRecordLinkToArtifactUse(unversionedArtifact, { UserID: USER_ID })).toBeNull();
            expect(
                DocRecordLinkToArtifactUse(unversionedArtifact, {
                    UserID: '',
                    ArtifactVersionID: ARTIFACT_VERSION_ID,
                })
            ).toBeNull();
        });
    });

    describe('RecordCitedArtifactUse', () => {
        it('persists MJ: Artifact Uses using strongly-typed properties and explicit contextUser, and fails closed when contextUser is missing', async () => {
            const [link] = ParseDocRecordLinks(
                `[[MJ: Artifacts|${ARTIFACT_ID}@${ARTIFACT_VERSION_ID}|Acme Q4 Strategy]]`
            );
            const payload = DocRecordLinkToArtifactUse(link, {
                UserID: USER_ID,
                UsageType: 'Opened',
                ConversationID: CONVERSATION_ID,
                CitationIndex: 1,
            });
            expect(payload).not.toBeNull();

            // Fail closed on null user
            const denied = await RecordCitedArtifactUse(payload!, null);
            expect(denied.Success).toBe(false);

            const savedRecord: Partial<MJArtifactUseEntity> = {
                ID: '88000001-7001-4001-8001-000000000001',
                ArtifactVersionID: '',
                UserID: '',
                UsageType: 'Viewed',
                UsageContext: null,
                LatestResult: { CompleteMessage: '' } as MJArtifactUseEntity['LatestResult'],
                NewRecord: vi.fn(() => true),
                Save: vi.fn(async () => true),
            };

            const getEntityObject = vi.fn(async () => savedRecord as MJArtifactUseEntity);
            const provider = {
                GetEntityObject: getEntityObject,
            } as Pick<IMetadataProvider, 'GetEntityObject'> as IMetadataProvider;

            const user = new UserInfo(null, {
                ID: USER_ID,
                Name: 'Elena Vance',
                Email: 'elena@example.com',
                IsActive: true,
                Type: 'User',
                UserRoles: [],
            });

            const res = await RecordCitedArtifactUse(payload!, user, provider);
            expect(res).toEqual({
                Success: true,
                ArtifactUseID: '88000001-7001-4001-8001-000000000001',
            });
            expect(getEntityObject).toHaveBeenCalledWith('MJ: Artifact Uses', user);
            expect(savedRecord.NewRecord).toHaveBeenCalledTimes(1);
            expect(savedRecord.ArtifactVersionID).toBe(ARTIFACT_VERSION_ID);
            expect(savedRecord.UserID).toBe(USER_ID);
            expect(savedRecord.UsageType).toBe('Opened');
            expect(savedRecord.UsageContext).toBe(payload!.UsageContextJSON);
        });
    });
});
