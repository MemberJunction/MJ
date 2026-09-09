import type { EntityInfo, EntityRelationshipInfo } from "@memberjunction/core";

export interface ResolvedCollectionInfo {
  relatedEntity: string;
  joinField: string;
  collectionName: string;
  load?: string;
  onRemove?: string;
  orderBy?: string;
  relationship: EntityRelationshipInfo;
}

/**
 * Resolves a collection name to its matching relationship on the entity.
 * Uses strict rule strength to ensure unambiguous, deterministic resolution:
 *   1. Explicit collection name in RelatedRecordCollection JSON ("Name": "...")
 *   2. Relationship DisplayName
 *   3. RelatedEntity full name
 *   4. Stripped RelatedEntity name (singular / plural variations)
 *
 * Guaranteed contract: Returns non-null ONLY when a relationship exists AND
 * has a valid RelatedEntityJoinField. Both ValidationService and PushService
 * use this single source of truth so validation and push never diverge.
 */
export function resolveCollectionRelationship(
  entityInfo: EntityInfo | null | undefined,
  colName: string
): ResolvedCollectionInfo | null {
  if (!entityInfo?.RelatedEntities || !colName) return null;

  const target = colName.trim().toLowerCase();
  const rels = entityInfo.RelatedEntities;

  let matchedRel: EntityRelationshipInfo | null = null;
  let parsedConfig: Record<string, unknown> | null = null;

  // Tier 1: Explicit Name in RelatedRecordCollection JSON
  const tier1Matches: Array<{ rel: EntityRelationshipInfo; config: Record<string, unknown> }> = [];
  for (const rel of rels) {
    if (rel.RelatedRecordCollection) {
      try {
        const parsed = typeof rel.RelatedRecordCollection === "string"
          ? (JSON.parse(rel.RelatedRecordCollection) as Record<string, unknown>)
          : (rel.RelatedRecordCollection as Record<string, unknown>);
        if (parsed && typeof parsed["Name"] === "string" && parsed["Name"].trim().toLowerCase() === target) {
          tier1Matches.push({ rel, config: parsed });
        }
      } catch (err) {
        console.warn(
          `collection-resolver: malformed RelatedRecordCollection JSON on entity '${entityInfo.Name}' relationship to '${rel.RelatedEntity}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (tier1Matches.length > 1) {
    throw new Error(
      `Ambiguous collection resolution for '${colName}' on entity '${entityInfo.Name}': matches multiple relationships (${tier1Matches.map((m) => m.rel.RelatedEntity).join(', ')}) at Tier 1 (explicit Name).`
    );
  } else if (tier1Matches.length === 1 && tier1Matches[0]) {
    matchedRel = tier1Matches[0].rel;
    parsedConfig = tier1Matches[0].config;
  }

  // Tier 2: DisplayName
  if (!matchedRel) {
    const tier2Matches: EntityRelationshipInfo[] = [];
    for (const rel of rels) {
      if (rel.DisplayName && rel.DisplayName.trim().toLowerCase() === target) {
        tier2Matches.push(rel);
      }
    }
    if (tier2Matches.length > 1) {
      throw new Error(
        `Ambiguous collection resolution for '${colName}' on entity '${entityInfo.Name}': matches multiple relationships (${tier2Matches.map((m) => m.RelatedEntity).join(', ')}) at Tier 2 (DisplayName).`
      );
    } else if (tier2Matches.length === 1 && tier2Matches[0]) {
      matchedRel = tier2Matches[0];
    }
  }

  // Tier 3: Full RelatedEntity Name
  if (!matchedRel) {
    const tier3Matches: EntityRelationshipInfo[] = [];
    for (const rel of rels) {
      if (rel.RelatedEntity && rel.RelatedEntity.trim().toLowerCase() === target) {
        tier3Matches.push(rel);
      }
    }
    if (tier3Matches.length > 1) {
      throw new Error(
        `Ambiguous collection resolution for '${colName}' on entity '${entityInfo.Name}': matches multiple relationships (${tier3Matches.map((m) => m.RelatedEntity).join(', ')}) at Tier 3 (Full RelatedEntity Name).`
      );
    } else if (tier3Matches.length === 1 && tier3Matches[0]) {
      matchedRel = tier3Matches[0];
    }
  }

  // Tier 4: Stripped RelatedEntity Name (with plural/singular tolerance)
  if (!matchedRel) {
    const tier4Matches: EntityRelationshipInfo[] = [];
    for (const rel of rels) {
      const stripped = rel.RelatedEntity?.replace(/^.*:\s*/, "").replace(/\s+/g, "");
      if (stripped) {
        const s = stripped.toLowerCase();
        if (s === target || s + "s" === target || target + "s" === s) {
          tier4Matches.push(rel);
        }
      }
    }
    if (tier4Matches.length > 1) {
      throw new Error(
        `Ambiguous collection resolution for '${colName}' on entity '${entityInfo.Name}': matches multiple relationships (${tier4Matches.map((m) => m.RelatedEntity).join(', ')}) at Tier 4 (Stripped Name).`
      );
    } else if (tier4Matches.length === 1 && tier4Matches[0]) {
      matchedRel = tier4Matches[0];
    }
  }

  if (!matchedRel || !matchedRel.RelatedEntity || !matchedRel.RelatedEntityJoinField) {
    return null;
  }

  // Parse options if not parsed yet
  if (!parsedConfig && matchedRel.RelatedRecordCollection) {
    try {
      parsedConfig = typeof matchedRel.RelatedRecordCollection === "string"
        ? (JSON.parse(matchedRel.RelatedRecordCollection) as Record<string, unknown>)
        : (matchedRel.RelatedRecordCollection as Record<string, unknown>);
    } catch {
      parsedConfig = null;
    }
  }

  return {
    relatedEntity: matchedRel.RelatedEntity,
    joinField: matchedRel.RelatedEntityJoinField,
    collectionName: colName,
    load: typeof parsedConfig?.["Load"] === "string" ? parsedConfig["Load"] : "explicit",
    onRemove: typeof parsedConfig?.["OnRemove"] === "string" ? parsedConfig["OnRemove"] : "delete",
    orderBy: typeof parsedConfig?.["OrderBy"] === "string" ? parsedConfig["OrderBy"] : undefined,
    relationship: matchedRel,
  };
}
