/**
 * Unit tests verifying Wave 0.1 Canon Full-Run Schema CodeGen outputs, Zod schemas,
 * strongly-typed JSONType contracts, and entity metadata declarations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MJAIAgentContextItemEntity_IAgentContextItemDetails } from '../generated/entities/__mj.js';
import {
  MJAIAgentContextItemSchema,
  MJAIAgentLearningCycleProposalSchema,
  MJAIAgentLearningCycleProposalSourceSchema,
  MJAIAgentLearningCycleSchema,
  MJAIAgentNoteSchema,
  MJAIAgentNoteSourceSchema,
  MJAIAgentSchema,
  MJAISkillSchema,
  MJGraphConceptSchema,
  MJGraphEdgeSchema,
  MJGraphPermissionSchema,
  MJGraphSchema,
  MJSearchScopeGraphSchema,
} from '../generated/schemas/__mj.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');

interface MetadataEntityFileEntry {
  fields?: {
    Name?: string;
    TrackRecordChanges?: boolean;
    AllowCaching?: boolean;
    Configuration?: {
      Clone?: {
        Enabled?: boolean;
        NotCloneable?: boolean;
      };
    };
  };
  relatedEntities?: {
    'MJ: Entity Fields'?: Array<{
      fields?: {
        Name?: string;
        EntityIDFieldName?: string;
        Status?: string;
        JSONType?: string;
        JSONTypeDefinition?: string;
      };
      primaryKey?: {
        ID?: string;
      };
    }>;
  };
}

describe('Wave 0.1 Canon Full-Run Schema CodeGen & Metadata', () => {
  describe('MJ: Graph Permissions & MJ: Search Scope Graphs', () => {
    it.each(['None', 'Read', 'Use', 'Approve'] as const)(
      'accepts readable PermissionLevel value %s',
      (level) => {
        expect(MJGraphPermissionSchema.shape.PermissionLevel.safeParse(level).success).toBe(true);
      },
    );

    it('rejects unknown GraphPermission PermissionLevel values', () => {
      expect(MJGraphPermissionSchema.shape.PermissionLevel.safeParse('Admin').success).toBe(false);
    });

    it('exposes SearchScopeGraph Priority and nullable MaxResults', () => {
      expect(MJSearchScopeGraphSchema.shape.Priority.safeParse(100).success).toBe(true);
      expect(MJSearchScopeGraphSchema.shape.MaxResults.safeParse(null).success).toBe(true);
      expect(MJSearchScopeGraphSchema.shape.MaxResults.safeParse(25).success).toBe(true);
    });
  });

  describe('MJ 6213 schemas & readable value lists', () => {
    it.each([
      'Consolidated From',
      'Supersedes',
      'Disambiguated From',
      'Dream Synthesized From',
      'Other',
    ] as const)('accepts AIAgentNoteSource RelationshipType %s', (relType) => {
      expect(MJAIAgentNoteSourceSchema.shape.RelationshipType.safeParse(relType).success).toBe(true);
    });

    it('rejects unspaced legacy AIAgentNoteSource RelationshipType values', () => {
      expect(MJAIAgentNoteSourceSchema.shape.RelationshipType.safeParse('ConsolidatedFrom').success).toBe(false);
    });

    it.each([
      'Consolidation',
      'Dreaming',
      'Skill Extraction',
      'Harness Refinement',
      'Mixed',
    ] as const)('accepts AIAgentLearningCycle CycleType %s', (cycleType) => {
      expect(MJAIAgentLearningCycleSchema.shape.CycleType.safeParse(cycleType).success).toBe(true);
    });

    it.each([
      'Create Note',
      'Supersede Notes',
      'Promote To Canon',
      'Draft Skill',
      'Create Graph Edge',
      'Create Canon Concept',
      'Promote Workflow',
      'Evolve Workflow',
      'Resolve Graph Contradiction',
      'Prompt Revision',
    ] as const)('accepts AIAgentLearningCycleProposal ProposalType %s', (proposalType) => {
      expect(MJAIAgentLearningCycleProposalSchema.shape.ProposalType.safeParse(proposalType).success).toBe(true);
    });

    it.each([
      'Draft',
      'Filtered Out',
      'Verifying',
      'Verification Failed',
      'Awaiting Approval',
      'Approved',
      'Applied',
      'Rejected',
      'Rolled Back',
    ] as const)('accepts AIAgentLearningCycleProposal Status %s', (status) => {
      expect(MJAIAgentLearningCycleProposalSchema.shape.Status.safeParse(status).success).toBe(true);
    });

    it.each(['Low', 'Medium', 'High', 'Critical'] as const)(
      'accepts Rule 6 ImpactLevel %s and nullable',
      (impact) => {
        expect(MJAIAgentLearningCycleProposalSchema.shape.ImpactLevel.safeParse(impact).success).toBe(true);
        expect(MJAIAgentLearningCycleProposalSchema.shape.ImpactLevel.safeParse(null).success).toBe(true);
      },
    );

    it.each(['Approved by Policy', 'Provisional', 'Human', 'Named Owner'] as const)(
      'accepts Rule 6 PromotionRoute %s',
      (route) => {
        expect(MJAIAgentLearningCycleProposalSchema.shape.PromotionRoute.safeParse(route).success).toBe(true);
      },
    );

    it.each(['Approve', 'Reject', 'Needs Revision'] as const)(
      'accepts Rule 6 AIReviewerDecision %s',
      (decision) => {
        expect(MJAIAgentLearningCycleProposalSchema.shape.AIReviewerDecision.safeParse(decision).success).toBe(true);
      },
    );

    it.each([
      'Supporting Note',
      'Contradicting Note',
      'Failed Run',
      'Exemplar Run',
      'User Correction',
      'Bridge Node',
      'Other',
    ] as const)('accepts ProposalSource Role %s', (role) => {
      expect(MJAIAgentLearningCycleProposalSourceSchema.shape.Role.safeParse(role).success).toBe(true);
    });

    it.each(['Retrieved', 'Injected', 'Withheld', 'Cited', 'Other'] as const)(
      'accepts AIAgentContextItem EventType %s',
      (eventType) => {
        expect(MJAIAgentContextItemSchema.shape.EventType.safeParse(eventType).success).toBe(true);
      },
    );

    it.each([
      'Note',
      'Example',
      'Skill',
      'Graph Concept',
      'Scoped Prompt Part',
      'Other',
    ] as const)('accepts AIAgentContextItem ItemType %s', (itemType) => {
      expect(MJAIAgentContextItemSchema.shape.ItemType.safeParse(itemType).success).toBe(true);
    });

    it('provides strongly-typed IAgentContextItemDetails contract', () => {
      const details: MJAIAgentContextItemEntity_IAgentContextItemDetails = {
        Version: 1,
        Strategy: 'Canon Lane',
        Lane: 'Canon',
        RerankScore: 0.91,
        EffectiveScore: 0.96,
        StatusAtInjection: 'Approved',
        ProtectionTierAtInjection: 'Immutable',
        IsCanonicalAtInjection: true,
        ScopeLevel: 'Company',
        HoldoutBucket: 12,
        CitationSource: 'Agent Response',
      };
      expect(details.Version).toBe(1);
      expect(details.Lane).toBe('Canon');
      expect(MJAIAgentContextItemSchema.shape.Details.safeParse(JSON.stringify(details)).success).toBe(true);
    });
  });

  describe('Canon columns & Provisional status extensions', () => {
    it('adds Canon authority columns to AIAgentNote and AISkill and AllowInFlightMemorySearch to AIAgent', () => {
      expect(MJAIAgentNoteSchema.shape.IsCanonical.safeParse(false).success).toBe(true);
      expect(MJAIAgentNoteSchema.shape.CanonApprovedAt.safeParse(null).success).toBe(true);
      expect(MJAIAgentNoteSchema.shape.OriginProposalID.safeParse(null).success).toBe(true);

      expect(MJAISkillSchema.shape.IsCanonical.safeParse(true).success).toBe(true);
      expect(MJAISkillSchema.shape.CanonApprovedByUserID.safeParse(null).success).toBe(true);
      expect(MJAISkillSchema.shape.OriginProposalID.safeParse(null).success).toBe(true);

      expect(MJAIAgentSchema.shape.AllowInFlightMemorySearch.safeParse(false).success).toBe(true);
    });

    it('includes Provisional on GraphConcept and GraphEdge Status and effective/policy fields', () => {
      expect(MJGraphConceptSchema.shape.Status.safeParse('Provisional').success).toBe(true);
      expect(MJGraphConceptSchema.shape.EffectiveFrom.safeParse(null).success).toBe(true);
      expect(MJGraphConceptSchema.shape.EffectiveTo.safeParse(null).success).toBe(true);

      expect(MJGraphEdgeSchema.shape.Status.safeParse('Provisional').success).toBe(true);
      expect(MJGraphEdgeSchema.shape.AuthorityTierID.safeParse(null).success).toBe(true);

      expect(MJGraphSchema.shape.StaleMemberPolicy.safeParse('Hide').success).toBe(true);
      expect(MJGraphSchema.shape.StaleMemberPolicy.safeParse('Show With Warning').success).toBe(true);
      expect(MJGraphSchema.shape.StaleMemberPolicy.safeParse('ShowWithWarning').success).toBe(false);
      expect(MJGraphSchema.shape.PublishNonHumanApprovals.safeParse(false).success).toBe(true);
    });
  });

  describe('Entity metadata sync manifests', () => {
    it('declares all Wave 0.1 polymorphic EntityIDFieldName pairs in .polymorphic-fk-entity-fields.json', () => {
      const raw = fs.readFileSync(
        path.join(REPO_ROOT, 'metadata/entities/.polymorphic-fk-entity-fields.json'),
        'utf8',
      );
      const entries = JSON.parse(raw) as MetadataEntityFileEntry[];
      const pairs = new Map<string, string>();
      for (const entry of entries) {
        const entityName = entry.fields?.Name;
        for (const ef of entry.relatedEntities?.['MJ: Entity Fields'] ?? []) {
          if (entityName && ef.fields?.Name && ef.fields.EntityIDFieldName) {
            pairs.set(`${entityName}.${ef.fields.Name}`, ef.fields.EntityIDFieldName);
          }
        }
      }

      expect(pairs.get('MJ: AI Agent Context Items.ItemRecordID')).toBe('ItemEntityID');
      expect(pairs.get('MJ: AI Agent Learning Cycle Proposals.PrimaryScopeRecordID')).toBe('PrimaryScopeEntityID');
      expect(pairs.get('MJ: AI Agent Learning Cycle Proposals.AppliedRecordID')).toBe('AppliedEntityID');
      expect(pairs.get('MJ: AI Agent Learning Cycle Proposal Sources.SourceRecordID')).toBe('SourceEntityID');
    });

    it('marks all 4 new runtime/memory entities as NotCloneable in .clone-configurations.json', () => {
      const raw = fs.readFileSync(
        path.join(REPO_ROOT, 'metadata/entities/.clone-configurations.json'),
        'utf8',
      );
      const entries = JSON.parse(raw) as MetadataEntityFileEntry[];
      const notCloneable = new Set(
        entries
          .filter((e) => e.fields?.Configuration?.Clone?.NotCloneable === true && e.fields.Name)
          .map((e) => e.fields?.Name),
      );

      expect(notCloneable.has('MJ: AI Agent Context Items')).toBe(true);
      expect(notCloneable.has('MJ: AI Agent Learning Cycle Proposals')).toBe(true);
      expect(notCloneable.has('MJ: AI Agent Learning Cycle Proposal Sources')).toBe(true);
      expect(notCloneable.has('MJ: AI Agent Note Sources')).toBe(true);
    });

    it('disables caching and record-change tracking on MJ: AI Agent Context Items', () => {
      const raw = fs.readFileSync(
        path.join(REPO_ROOT, 'metadata/entities/.ai-agent-context-items.json'),
        'utf8',
      );
      const entries = JSON.parse(raw) as MetadataEntityFileEntry[];
      expect(entries[0]?.fields?.Name).toBe('MJ: AI Agent Context Items');
      expect(entries[0]?.fields?.TrackRecordChanges).toBe(false);
      expect(entries[0]?.fields?.AllowCaching).toBe(false);
    });

    it('binds IAgentContextItemDetails and deprecates AIAgentNote.DerivedFromNoteIDs', () => {
      const jsonTypeRaw = fs.readFileSync(
        path.join(REPO_ROOT, 'metadata/entities/.entity-field-jsontype-agent-context-item-details.json'),
        'utf8',
      );
      const jsonTypeEntries = JSON.parse(jsonTypeRaw) as MetadataEntityFileEntry[];
      const detailsField = jsonTypeEntries[0]?.relatedEntities?.['MJ: Entity Fields']?.[0]?.fields;
      expect(detailsField?.JSONType).toBe('IAgentContextItemDetails');
      expect(detailsField?.JSONTypeDefinition).toBe('@file:JSONType-interfaces/IAgentContextItemDetails.ts');

      const depRaw = fs.readFileSync(
        path.join(REPO_ROOT, 'metadata/entities/.ai-agent-note-derived-from-deprecation.json'),
        'utf8',
      );
      const depEntries = JSON.parse(depRaw) as MetadataEntityFileEntry[];
      const depField = depEntries[0]?.relatedEntities?.['MJ: Entity Fields']?.[0]?.fields;
      expect(depField?.Status).toBe('Deprecated');
    });
  });
});
