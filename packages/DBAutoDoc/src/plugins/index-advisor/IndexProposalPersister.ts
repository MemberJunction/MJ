/**
 * Persists DBAutoDoc Index Advisor proposals into MemberJunction entity metadata
 * (`MJ: Entity Indexes` and `MJ: Entity Index Fields`) with `Status = 'Proposed'`
 * and `Source = 'DBAutoDoc'`.
 *
 * When DBAutoDoc runs in standalone CLI mode without an active MJ metadata provider,
 * persistence is skipped gracefully and logged.
 */

import {
  BaseEntity,
  EntityInfo,
  IMetadataProvider,
  Metadata,
  UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { IndexProposal } from './IndexAdvisorTypes.js';

/** Maximum identifier length for generated proposed index names (fits SQL Server 128-char limit). */
const MAX_PROPOSED_INDEX_NAME_LENGTH = 128; // SQL Server sysname identifier limit

const ENTITY_INDEXES_NAME = 'MJ: Entity Indexes';
const ENTITY_INDEX_FIELDS_NAME = 'MJ: Entity Index Fields';

/** Summary of persisting proposals into MJ entity metadata. */
export interface IndexProposalPersistenceResult {
  Persisted: number;
  Skipped: number;
  Errors: string[];
  SkippedReason?: string;
}

/** Optional overrides for dependency injection in tests or embedded MJ hosts. */
export interface PersistIndexProposalsOptions {
  Provider?: IMetadataProvider | null;
  ContextUser?: UserInfo;
  Log?: (message: string) => void;
}

/** Builds a deterministic proposed index name (`IX_<Table>_<Col1>_<Col2>`, capped at 128 chars). */
export function BuildProposedIndexName(tableName: string, columns: readonly string[]): string {
  const raw = `IX_${tableName}_${columns.join('_')}`.replace(/[^A-Za-z0-9_]/g, '_');
  return raw.length > MAX_PROPOSED_INDEX_NAME_LENGTH
    ? raw.slice(0, MAX_PROPOSED_INDEX_NAME_LENGTH)
    : raw;
}

function findEntityForTable(entities: readonly EntityInfo[], schemaName: string, tableName: string): EntityInfo | undefined {
  const targetSchema = schemaName.trim().toLowerCase();
  const targetTable = tableName.trim().toLowerCase();
  return entities.find(
    (e) =>
      !e.VirtualEntity &&
      e.SchemaName?.trim().toLowerCase() === targetSchema &&
      e.BaseTable?.trim().toLowerCase() === targetTable,
  );
}

function proposalAlreadyTracked(entity: EntityInfo, proposedName: string, keyFieldIDs: readonly string[]): boolean {
  const lowerName = proposedName.toLowerCase();
  for (const existing of entity.Indexes) {
    if (existing.Name?.trim().toLowerCase() === lowerName) {
      return true;
    }
    const existingKeys = existing.KeyFields;
    if (
      existingKeys.length === keyFieldIDs.length &&
      existingKeys.every((f, idx) => f.EntityFieldID != null && UUIDsEqual(f.EntityFieldID, keyFieldIDs[idx]))
    ) {
      return true;
    }
  }
  return false;
}

function resolveFieldIDs(entity: EntityInfo, columnNames: readonly string[]): string[] | null {
  const ids: string[] = [];
  for (const col of columnNames) {
    const field = entity.Fields.find((f) => f.Name.trim().toLowerCase() === col.trim().toLowerCase());
    if (!field) {
      return null;
    }
    ids.push(field.ID);
  }
  return ids;
}

async function saveProposedIndex(
  provider: IMetadataProvider,
  entity: EntityInfo,
  proposal: IndexProposal,
  proposedName: string,
  keyFieldIDs: readonly string[],
  includeFieldIDs: readonly string[],
  contextUser?: UserInfo,
): Promise<boolean> {
  const indexEntity = await provider.GetEntityObject<BaseEntity>(ENTITY_INDEXES_NAME, contextUser);
  indexEntity.NewRecord();
  await indexEntity.LoadFromData({
    EntityID: entity.ID,
    Name: proposedName,
    IndexType: 'BTree',
    NativeType: '',
    IsUnique: false,
    IsPrimaryKey: false,
    IsClustered: false,
    FilterDefinition: null,
    HasExpressions: false,
    Source: 'DBAutoDoc',
    Status: 'Proposed',
    Description: proposal.Reason,
  });

  if (!(await indexEntity.Save())) {
    return false;
  }

  const indexID = String(indexEntity.PrimaryKey.GetValueByIndex(0));
  let sequence = 1;
  for (const fieldID of keyFieldIDs) {
    const fieldEntity = await provider.GetEntityObject<BaseEntity>(ENTITY_INDEX_FIELDS_NAME, contextUser);
    fieldEntity.NewRecord();
    await fieldEntity.LoadFromData({
      EntityIndexID: indexID,
      EntityFieldID: fieldID,
      Expression: null,
      Sequence: sequence++,
      Role: 'Key',
      SortDirection: 'ASC',
    });
    await fieldEntity.Save();
  }
  for (const fieldID of includeFieldIDs) {
    const fieldEntity = await provider.GetEntityObject<BaseEntity>(ENTITY_INDEX_FIELDS_NAME, contextUser);
    fieldEntity.NewRecord();
    await fieldEntity.LoadFromData({
      EntityIndexID: indexID,
      EntityFieldID: fieldID,
      Expression: null,
      Sequence: sequence++,
      Role: 'Include',
      SortDirection: 'ASC',
    });
    await fieldEntity.Save();
  }

  return true;
}

/**
 * Persists `IndexProposal` entries as `Status = 'Proposed'`, `Source = 'DBAutoDoc'` rows in
 * `MJ: Entity Indexes` and `MJ: Entity Index Fields`. Gracefully skips and logs if no MJ
 * metadata provider is configured (standalone CLI mode) or the index entities are not registered.
 */
export async function PersistIndexProposalsToMJMetadata(
  proposals: readonly IndexProposal[],
  options: PersistIndexProposalsOptions = {},
): Promise<IndexProposalPersistenceResult> {
  const result: IndexProposalPersistenceResult = { Persisted: 0, Skipped: 0, Errors: [] };
  if (proposals.length === 0) {
    return result;
  }

  const provider = options.Provider !== undefined ? options.Provider : Metadata.Provider;
  if (!provider || !provider.Entities || provider.Entities.length === 0) {
    result.Skipped = proposals.length;
    result.SkippedReason = 'MJ metadata provider is not configured';
    options.Log?.(`Index Advisor: skipping MJ metadata persistence (${result.SkippedReason})`);
    return result;
  }

  const hasIndexEntities =
    provider.EntityByName(ENTITY_INDEXES_NAME) != null &&
    provider.EntityByName(ENTITY_INDEX_FIELDS_NAME) != null;
  if (!hasIndexEntities) {
    result.Skipped = proposals.length;
    result.SkippedReason = `${ENTITY_INDEXES_NAME} metadata entities are not registered`;
    options.Log?.(`Index Advisor: skipping MJ metadata persistence (${result.SkippedReason})`);
    return result;
  }

  for (const proposal of proposals) {
    const entity = findEntityForTable(provider.Entities, proposal.SchemaName, proposal.TableName);
    if (!entity) {
      result.Skipped++;
      continue;
    }

    const keyFieldIDs = resolveFieldIDs(entity, proposal.Columns);
    const includeFieldIDs = resolveFieldIDs(entity, proposal.IncludeColumns);
    if (!keyFieldIDs || keyFieldIDs.length === 0 || !includeFieldIDs) {
      result.Skipped++;
      continue;
    }

    const proposedName = BuildProposedIndexName(proposal.TableName, proposal.Columns);
    if (proposalAlreadyTracked(entity, proposedName, keyFieldIDs)) {
      result.Skipped++;
      continue;
    }

    try {
      const saved = await saveProposedIndex(
        provider,
        entity,
        proposal,
        proposedName,
        keyFieldIDs,
        includeFieldIDs,
        options.ContextUser,
      );
      if (saved) {
        result.Persisted++;
      } else {
        result.Errors.push(`Failed to save proposed index ${proposedName} on ${entity.Name}`);
      }
    } catch (err) {
      result.Errors.push(
        `Error saving proposed index ${proposedName} on ${entity.Name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}
