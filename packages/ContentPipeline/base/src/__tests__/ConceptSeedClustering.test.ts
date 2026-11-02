import { describe, expect, it } from 'vitest';
import {
    ClusterContentIntoConceptSeeds,
    ExtractLeafTopicFromHeading,
    GetAuthorityTierRank,
    GetConceptTypeRank,
    InferConceptTypeFromSignals,
    ResolveGraphOverlayConfig,
    ScoreConceptNameSimilarity,
    type ContentChunkSeedInput,
    type ExistingGraphConceptSeed,
    type GraphConceptTypeDescriptor,
    type SchemaGroundingTarget,
} from '../graph/index.js';

describe('GraphOverlay & ConceptSeedClustering', () => {
    it('resolves Canon vs Knowledge GraphOverlay defaults accurately', () => {
        const canonResolved = ResolveGraphOverlayConfig('graph-canon-1', {
            GraphOverlay: { TargetGraphType: 'Canon' },
        });
        expect(canonResolved.EnableGraphOverlay).toBe(true);
        expect(canonResolved.GraphID).toBe('graph-canon-1');
        expect(canonResolved.TargetGraphType).toBe('Canon');
        expect(canonResolved.ConceptTaxonomyMode).toBe('propose-only');
        expect(canonResolved.GroundingMode).toBe('full-canon');
        expect(canonResolved.AuthorityTier).toBe('ExecutiveSOP');

        const knowledgeResolved = ResolveGraphOverlayConfig(null, {
            GraphOverlay: { GraphID: 'graph-kb-1', TargetGraphType: 'Knowledge' },
        });
        expect(knowledgeResolved.EnableGraphOverlay).toBe(true);
        expect(knowledgeResolved.GraphID).toBe('graph-kb-1');
        expect(knowledgeResolved.ConceptTaxonomyMode).toBe('auto-grow');
        expect(knowledgeResolved.GroundingMode).toBe('none');
        expect(knowledgeResolved.AuthorityTier).toBe('Reference');
    });

    it('extracts normalized leaf topics from multi-level document headings and strips section numbers', () => {
        expect(
            ExtractLeafTopicFromHeading('Association Bylaws > Article IV: Membership > Section 4.2.1 Renewal Grace Period'),
        ).toBe('Renewal Grace Period');
        expect(
            ExtractLeafTopicFromHeading('Finance Manual / Chapter 9 / §9.3 Conference Refund Policy > Overview'),
        ).toBe('Conference Refund Policy');
    });

    it('scores concept similarity across stems and synonyms', () => {
        expect(
            ScoreConceptNameSimilarity('Member Grace Windows', 'Renewal Grace Period', [
                'Dues Grace Window',
                'Member Grace Window',
            ]),
        ).toBe(1.0);
        expect(ScoreConceptNameSimilarity('Conference Refund Policies', 'Conference Refund Policy')).toBe(1.0);
    });

    it('infers ConceptType from heading and text signals', () => {
        expect(InferConceptTypeFromSignals('Net Member Retention Rate', ['Calculated quarterly'])).toBe('Metric');
        expect(
            InferConceptTypeFromSignals('Chapter Reinstatement Procedure', [
                '1. Verify dues. 2. Submit reinstatement form.',
            ]),
        ).toBe('Process');
        expect(
            InferConceptTypeFromSignals('Event Refund Eligibility', [
                'Requests over $500 must receive VP approval.',
            ]),
        ).toBe('Policy');
    });

    it('clusters chunks across multiple Content Sources, sorts by AuthorityTier, links MJ Schema, and detects threshold conflicts', () => {
        const existingConcepts: ExistingGraphConceptSeed[] = [
            {
                ConceptID: 'concept-grace-1',
                Name: 'Renewal Grace Period',
                ConceptType: 'Policy',
                Synonyms: ['Dues Grace Window', 'Late Renewal Grace Period'],
            },
        ];

        const groundingTargets: SchemaGroundingTarget[] = [
            {
                EntityName: 'MJ: Entity Alternate Base Views',
                RecordID: 'abv-active-members',
                Name: 'Active Members With Grace Period',
                SynonymsOrKeywords: ['Renewal Grace Period'],
            },
            {
                EntityName: 'MJ: Entities',
                RecordID: 'ent-refunds',
                Name: 'Event Refund Requests',
                SynonymsOrKeywords: ['Conference Refund Policy'],
            },
        ];

        const chunks: ContentChunkSeedInput[] = [
            // Source 1: Department Practice manual (lower authority, says 90 days)
            {
                ChunkID: 'chunk-sop-1',
                ContentItemID: 'item-sop',
                ContentSourceID: 'src-dept-sop',
                ContentItemTitle: 'Member Services Desk Manual',
                HeadingPath: 'Part 2 > 2.4 Late Renewal Grace Period',
                Text: 'Staff allow a 90 days grace period before suspending portal access.',
                Tags: ['Membership', 'Dues Grace Window'],
                AuthorityTier: 'DepartmentPractice',
            },
            // Source 2: Association Bylaws (highest authority, says 60 days!)
            {
                ChunkID: 'chunk-bylaws-1',
                ContentItemID: 'item-bylaws',
                ContentSourceID: 'src-bylaws',
                ContentItemTitle: '2026 Association Bylaws',
                HeadingPath: 'Article IV > Section 4.2 Renewal Grace Period',
                Text: 'A member in arrears shall have a 60 days grace period to remit annual dues.',
                Tags: ['Membership'],
                AuthorityTier: 'Bylaws',
            },
            // Source 3: Net-new topic from Finance Policy manual (Conference Refund Policy)
            {
                ChunkID: 'chunk-fin-1',
                ContentItemID: 'item-fin',
                ContentSourceID: 'src-board-policy',
                ContentItemTitle: 'Board Financial Policies',
                HeadingPath: 'Chapter 7 > §7.1 Conference Refund Policy',
                Text: 'Conference cancellations over $500 must be approved by the VP of Finance.',
                Tags: ['Conference Refund Policy', 'Events'],
                AuthorityTier: 'BoardPolicy',
            },
        ];

        const result = ClusterContentIntoConceptSeeds(chunks, existingConcepts, {
            taxonomyMode: 'propose-only',
            groundingTargets,
        });

        expect(result.MatchedExistingCount).toBe(1);
        expect(result.ProposedNewCount).toBe(1);
        expect(result.Clusters.length).toBe(2);

        const graceCluster = result.Clusters.find((c) => c.MatchedExistingConcept?.ConceptID === 'concept-grace-1')!;
        expect(graceCluster).toBeDefined();
        expect(graceCluster.Chunks.length).toBe(2);
        // Sorted highest authority first: Bylaws chunk before DepartmentPractice chunk
        expect(graceCluster.Chunks[0].ChunkID).toBe('chunk-bylaws-1');
        expect(graceCluster.HighestAuthorityTier).toBe('Bylaws');
        expect(GetAuthorityTierRank(graceCluster.HighestAuthorityTier)).toBeGreaterThan(
            GetAuthorityTierRank('DepartmentPractice'),
        );

        // Detected the 60 days vs 90 days conflict between Bylaws and Desk Manual!
        expect(graceCluster.PotentialConflicts.length).toBe(1);
        expect(graceCluster.PotentialConflicts[0].HigherAuthorityChunkID).toBe('chunk-bylaws-1');
        expect(graceCluster.PotentialConflicts[0].LowerAuthorityChunkID).toBe('chunk-sop-1');
        expect(graceCluster.PotentialConflicts[0].Reason).toContain('60');
        expect(graceCluster.PotentialConflicts[0].Reason).toContain('90');

        // Grounded to Alternate Base View ('Defines')
        expect(graceCluster.GroundingMatches.length).toBe(1);
        expect(graceCluster.GroundingMatches[0].SuggestedEdgeType).toBe('Defines');

        // Net-new proposed concept cluster
        const refundCluster = result.Clusters.find((c) => !c.MatchedExistingConcept)!;
        expect(refundCluster.ConceptName).toBe('Conference Refund Policy');
        expect(refundCluster.InferredConceptType).toBe('Policy');
        expect(refundCluster.GroundingMatches[0]?.Target.RecordID).toBe('ent-refunds');
        expect(refundCluster.GroundingMatches[0]?.SuggestedEdgeType).toBe('Describes');

        // Verify 'constrained' mode skips net-new concepts
        const constrainedResult = ClusterContentIntoConceptSeeds(chunks, existingConcepts, {
            taxonomyMode: 'constrained',
        });
        expect(constrainedResult.MatchedExistingCount).toBe(1);
        expect(constrainedResult.ProposedNewCount).toBe(0);
        expect(constrainedResult.UnmatchedChunkIDs).toEqual(['chunk-fin-1']);
    });

    it('enforces maxNewConcepts cap, detects currency conflicts, and maps Queries/Skills/Actions grounding edges', () => {
        const runOverrideConfig = ResolveGraphOverlayConfig(
            'graph-source-default',
            {
                GraphOverlay: {
                    TargetGraphType: 'Canon',
                    MaxNewConceptsPerRun: 50,
                    AuthorityTier: 'DepartmentPractice',
                },
            },
            {
                GraphOverlay: {
                    GraphID: 'graph-run-override',
                    MaxNewConceptsPerRun: 1,
                    AuthorityTier: 'BoardPolicy',
                },
            },
        );
        expect(runOverrideConfig.GraphID).toBe('graph-run-override');
        expect(runOverrideConfig.MaxNewConceptsPerRun).toBe(1);
        expect(runOverrideConfig.AuthorityTier).toBe('BoardPolicy');

        const groundingTargets: SchemaGroundingTarget[] = [
            {
                EntityName: 'MJ: Queries',
                RecordID: 'qry-ar-aging',
                Name: 'Open AR Aging Summary',
                SynonymsOrKeywords: ['Expense Reimbursement Threshold'],
            },
            {
                EntityName: 'MJ: Actions',
                RecordID: 'act-reimburse',
                Name: 'Submit Expense Reimbursement',
                SynonymsOrKeywords: ['Expense Reimbursement Threshold'],
            },
            {
                EntityName: 'MJ: AI Skills',
                RecordID: 'skill-audit',
                Name: 'Expense Reimbursement Auditor',
                SynonymsOrKeywords: ['Expense Reimbursement Threshold'],
            },
        ];

        const chunks: ContentChunkSeedInput[] = [
            {
                ChunkID: 'c-board-1',
                ContentItemID: 'item-1',
                ContentSourceID: 'src-1',
                ContentItemTitle: 'Board Expense Policy',
                HeadingPath: 'Finance > Expense Reimbursement Threshold',
                Text: 'Travel expenses above $500.00 require receipts and VP sign-off.',
                Tags: ['Expense Reimbursement Threshold'],
                AuthorityTier: 'BoardPolicy',
            },
            {
                ChunkID: 'c-dept-2',
                ContentItemID: 'item-2',
                ContentSourceID: 'src-2',
                ContentItemTitle: 'Staff Travel FAQ',
                HeadingPath: 'FAQ > Expense Reimbursement Threshold',
                Text: 'Travel expenses above $1,000 require receipts and VP sign-off.',
                Tags: ['Expense Reimbursement Threshold'],
                AuthorityTier: 'DepartmentPractice',
            },
            {
                ChunkID: 'c-minor-3',
                ContentItemID: 'item-3',
                ContentSourceID: 'src-2',
                ContentItemTitle: 'Office Supplies Note',
                HeadingPath: 'Misc > Stationary Ordering Term',
                Text: 'Stationary supplies are ordered monthly.',
                Tags: ['Stationary Ordering Term'],
                AuthorityTier: 'Informational',
            },
        ];

        const capped = ClusterContentIntoConceptSeeds(chunks, [], {
            taxonomyMode: 'propose-only',
            maxNewConcepts: 1,
            groundingTargets,
        });

        // Capped to 1 proposed concept; the 2-chunk BoardPolicy cluster wins over the 1-chunk Informational cluster
        expect(capped.ProposedNewCount).toBe(1);
        expect(capped.Clusters.length).toBe(1);
        const topCluster = capped.Clusters[0];
        expect(topCluster.ConceptName).toBe('Expense Reimbursement Threshold');
        expect(topCluster.PotentialConflicts.length).toBe(1);
        expect(topCluster.PotentialConflicts[0].Reason).toContain('$500.00');
        expect(topCluster.PotentialConflicts[0].Reason).toContain('$1000');

        const edgeTypes = topCluster.GroundingMatches.map((m) => m.SuggestedEdgeType);
        expect(edgeTypes).toContain('Measures');
        expect(edgeTypes).toContain('Implements');

        expect(InferConceptTypeFromSignals('Finance & Accounting Committee', ['Oversees budget'])).toBe('Domain');
        expect(InferConceptTypeFromSignals('Emeritus Member Definition', ['Honorary designation'])).toBe('Term');
        expect(InferConceptTypeFromSignals('Board Treasurer Role & Fiduciary Duties', ['Oversees audit'])).toBe('Role');
    });

    it('supports custom GraphTypes with IsCanon=true and prioritizes higher-ranked GraphConceptTypes when capped', () => {
        const customCanon = ResolveGraphOverlayConfig('graph-reg-canon', {
            GraphOverlay: {
                TargetGraphType: 'Regulatory Governance',
                IsCanon: true,
            },
        });
        expect(customCanon.TargetGraphType).toBe('Regulatory Governance');
        expect(customCanon.IsCanon).toBe(true);
        expect(customCanon.ConceptTaxonomyMode).toBe('propose-only');
        expect(customCanon.GroundingMode).toBe('full-canon');

        const configuredConceptTypes: GraphConceptTypeDescriptor[] = [
            { ID: 'ct-policy', Name: 'Policy', Rank: 10 },
            { ID: 'ct-role', Name: 'Role', Rank: 40 },
            { ID: 'ct-term', Name: 'Term', Rank: 60 },
        ];
        expect(GetConceptTypeRank('Policy', configuredConceptTypes)).toBe(10);
        expect(GetConceptTypeRank('Term', configuredConceptTypes)).toBe(60);

        const chunks: ContentChunkSeedInput[] = [
            {
                ChunkID: 'c-term',
                ContentItemID: 'item-1',
                ContentSourceID: 'src-1',
                ContentItemTitle: 'Glossary',
                HeadingPath: 'Glossary > Affiliate Glossary Term',
                Text: 'Affiliate members hold non-voting status.',
                Tags: ['Affiliate Glossary Term'],
                AuthorityTier: 'ExecutiveSOP',
            },
            {
                ChunkID: 'c-policy',
                ContentItemID: 'item-1',
                ContentSourceID: 'src-1',
                ContentItemTitle: 'Handbook',
                HeadingPath: 'Governance > Conflict of Interest Policy',
                Text: 'Board members must disclose conflicts annually.',
                Tags: ['Conflict of Interest Policy'],
                AuthorityTier: 'ExecutiveSOP',
            },
        ];

        const result = ClusterContentIntoConceptSeeds(chunks, [], {
            taxonomyMode: 'propose-only',
            maxNewConcepts: 1,
            conceptTypes: configuredConceptTypes,
        });

        // Both have 1 chunk and ExecutiveSOP authority, so Policy (Rank 10) beats Term (Rank 60)
        expect(result.Clusters.length).toBe(1);
        expect(result.Clusters[0].ConceptName).toBe('Conflict of Interest Policy');
        expect(result.Clusters[0].InferredConceptType).toBe('Policy');
        expect(result.Clusters[0].InferredConceptTypeID).toBe('ct-policy');
        expect(result.Clusters[0].ConceptTypeRank).toBe(10);
    });
});
