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
  for (const rel of rels) {
    if (rel.RelatedRecordCollection) {
      try {
        const parsed = typeof rel.RelatedRecordCollection === "string"
          ? (JSON.parse(rel.RelatedRecordCollection) as Record<string, unknown>)
          : (rel.RelatedRecordCollection as Record<string, unknown>);
        if (parsed && typeof parsed["Name"] === "string" && parsed["Name"].trim().toLowerCase() === target) {
          matchedRel = rel;
          parsedConfig = parsed;
          break;
        }
      } catch {
        // malformed JSON skipped at this tier
      }
    }
  }

  // Tier 2: DisplayName
  if (!matchedRel) {
    for (const rel of rels) {
      if (rel.DisplayName && rel.DisplayName.trim().toLowerCase() === target) {
        matchedRel = rel;
        break;
      }
    }
  }

  // Tier 3: Full RelatedEntity Name
  if (!matchedRel) {
    for (const rel of rels) {
      if (rel.RelatedEntity && rel.RelatedEntity.trim().toLowerCase() === target) {
        matchedRel = rel;
        break;
      }
    }
  }

  // Tier 4: Stripped RelatedEntity Name (with plural/singular tolerance)
  if (!matchedRel) {
    for (const rel of rels) {
      const stripped = rel.RelatedEntity?.replace(/^.*:\s*/, "").replace(/\s+/g, "");
      if (stripped) {
        const s = stripped.toLowerCase();
        if (s === target || s + "s" === target || target + "s" === s) {
          matchedRel = rel;
          break;
        }
      }
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
