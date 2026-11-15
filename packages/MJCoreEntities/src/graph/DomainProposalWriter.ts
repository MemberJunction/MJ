import { RunInEntityTransaction, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJGraphConceptEntity, MJGraphEdgeEntity, MJGraphEntity } from '../generated/entity_subclasses';
import type { DomainProposal } from './DomainClustering';
import { GraphEngine } from './GraphEngine';

const CONCEPT_ENTITY = 'MJ: Graph Concepts';
const EDGE_ENTITY = 'MJ: Graph Edges';
const ENTITY_ENTITY = 'MJ: Entities';
const DOMAIN_CONCEPT_TYPE = 'Domain';
const DESCRIBES_EDGE_TYPE = 'Describes';

/** What {@link SaveDomainProposals} wrote. */
export interface SavedDomainProposals {
    ConceptIDs: string[];
    EdgeCount: number;
}

/** The provider shape `RunInEntityTransaction` reads. */
type TransactableProvider = Parameters<typeof RunInEntityTransaction>[0];

/**
 * Write domain proposals into `graph` for review: each becomes a `Proposed` `Domain` concept, and
 * each member entity gets an `Inferred` + `Proposed` `Describes` edge to it, carrying the member's
 * confidence. Nothing is approved here; approval goes through the normal review path.
 *
 * Every save runs as `user` through `provider`, so entity permissions apply. Each proposal is written
 * in one transaction (where the provider supports one), so a concept never lands without its edges.
 * Throws with the failing save's message; proposals written before the failure stay written.
 */
export async function SaveDomainProposals(
    graph: MJGraphEntity,
    proposals: readonly DomainProposal[],
    user: UserInfo,
    provider: IMetadataProvider,
): Promise<SavedDomainProposals> {
    const lookups = resolveLookups(graph, provider);
    const saved: SavedDomainProposals = { ConceptIDs: [], EdgeCount: 0 };
    for (const proposal of proposals) {
        // A server provider exposes entity transactions; a client one runs the work as-is.
        const conceptId = await RunInEntityTransaction(provider as TransactableProvider, () => saveOne(graph, proposal, lookups, user, provider));
        saved.ConceptIDs.push(conceptId);
        saved.EdgeCount += proposal.Members.length;
    }
    return saved;
}

interface WriterLookups {
    DomainTypeID: string;
    DescribesTypeID: string;
    DescribesWeight: number;
    EntityEntityID: string;
    ConceptEntityID: string;
}

function resolveLookups(graph: MJGraphEntity, provider: IMetadataProvider): WriterLookups {
    const engine = GraphEngine.Instance;
    const domainType = engine.ConceptTypes.find((t) => t.Name.trim().toLowerCase() === DOMAIN_CONCEPT_TYPE.toLowerCase());
    const describes = engine.EdgeTypes.find(
        (t) => t.Name.trim().toLowerCase() === DESCRIBES_EDGE_TYPE.toLowerCase() && (t.GraphID == null || UUIDsEqual(t.GraphID, graph.ID)),
    );
    const entityEntity = provider.EntityByName(ENTITY_ENTITY);
    const conceptEntity = provider.EntityByName(CONCEPT_ENTITY);
    if (!domainType) {
        throw new Error(`The "${DOMAIN_CONCEPT_TYPE}" graph concept type is not defined.`);
    }
    if (!describes) {
        throw new Error(`The "${DESCRIBES_EDGE_TYPE}" edge type is not defined for graph "${graph.Name}".`);
    }
    if (!entityEntity || !conceptEntity) {
        throw new Error(`Entity metadata for "${ENTITY_ENTITY}" or "${CONCEPT_ENTITY}" is not loaded.`);
    }
    return {
        DomainTypeID: domainType.ID,
        DescribesTypeID: describes.ID,
        DescribesWeight: describes.DefaultWeight,
        EntityEntityID: entityEntity.ID,
        ConceptEntityID: conceptEntity.ID,
    };
}

async function saveOne(graph: MJGraphEntity, proposal: DomainProposal, lookups: WriterLookups, user: UserInfo, provider: IMetadataProvider): Promise<string> {
    const concept = await provider.GetEntityObject<MJGraphConceptEntity>(CONCEPT_ENTITY, user);
    concept.NewRecord();
    concept.GraphID = graph.ID;
    concept.Name = proposal.Name;
    concept.ConceptTypeID = lookups.DomainTypeID;
    concept.Description = proposal.Description;
    concept.Status = 'Proposed';
    if (!(await concept.Save())) {
        throw new Error(`Saving proposed concept "${proposal.Name}" failed: ${concept.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    for (const member of proposal.Members) {
        const edge = await provider.GetEntityObject<MJGraphEdgeEntity>(EDGE_ENTITY, user);
        edge.NewRecord();
        edge.GraphID = graph.ID;
        edge.EdgeTypeID = lookups.DescribesTypeID;
        edge.SourceEntityID = lookups.EntityEntityID;
        edge.SourceRecordID = member.EntityID; // MJ: Entities has a single-column key, so the compact form is the bare ID
        edge.TargetEntityID = lookups.ConceptEntityID;
        edge.TargetRecordID = concept.ID;
        edge.Weight = lookups.DescribesWeight;
        edge.Description = `Proposed member of "${proposal.Name}" (share of its links inside the group: ${Math.round(member.Confidence * 100)}%).`;
        edge.Origin = 'Inferred';
        edge.Status = 'Proposed';
        edge.Confidence = member.Confidence;
        if (!(await edge.Save())) {
            throw new Error(`Saving the Describes edge from "${member.EntityName}" to "${proposal.Name}" failed: ${edge.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }
    return concept.ID;
}
