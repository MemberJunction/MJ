import { BaseEntity, IMetadataProvider, RelatedRecordCollection, UserInfo } from '@memberjunction/core';
import type { RecordData } from './sync-engine';

/**
 * A declared collection that a `relatedEntities` group is saved through.
 */
export interface CollectionPromotion {
  /** The collection's companion name on the parent (the key `collections` would use). */
  CollectionName: string;
  /** The related entity's field holding the foreign key back to the parent. */
  JoinField: string;
  /** The parent's key field the join field holds (`ID` for most entities). */
  ParentKeyField: string;
}

/** The declared collections of one parent entity, keyed by lower-cased related entity name. */
type PromotionsByRelatedEntity = Map<string, CollectionPromotion>;

/**
 * Whether a declared collection can carry `relatedEntities` items without changing what they save.
 *
 * A collection qualifies when it is writable, can load (`Load` is not `'never'`), and declares no
 * automatic sequence numbering. Sequence numbering renumbers every child from its position on each
 * add, which would overwrite the sequence values a `relatedEntities` item states, so such a
 * collection keeps the separate-save behaviour.
 */
export function IsPromotableCollection(collection: RelatedRecordCollection): boolean {
  return !collection.IsReadOnly && collection.LoadMode !== 'never' && !collection.SequenceOptions;
}

/**
 * The promotable declared collections of an entity object, keyed by lower-cased related entity.
 * When two collections name the same related entity, neither is used: the group would be ambiguous.
 */
export function DeclaredCollectionsOf(entity: BaseEntity): Map<string, CollectionPromotion> {
  const found = new Map<string, CollectionPromotion>();
  const ambiguous = new Set<string>();
  // A collection joins on one foreign key column, so the parent's key is single-column here.
  const parentKeyField = entity.EntityInfo?.FirstPrimaryKey?.Name ?? 'ID'; // first-pk-ok: a collection's join field holds a single-column parent key
  for (const companion of entity.Companions) {
    if (!(companion instanceof RelatedRecordCollection) || !IsPromotableCollection(companion)) {
      continue;
    }
    const key = companion.RelatedEntityName.trim().toLowerCase();
    if (found.has(key)) {
      ambiguous.add(key);
      continue;
    }
    found.set(key, { CollectionName: companion.Name, JoinField: companion.RelatedEntityJoinField, ParentKeyField: parentKeyField });
  }
  for (const key of ambiguous) {
    found.delete(key);
  }
  return found;
}

/**
 * Whether the items of a `relatedEntities` group can be saved as collection items of `promotion`.
 *
 * Collection items are applied in the parent's graph, which handles fields, keys and nested
 * `collections`/`embeds`, but not nested `relatedEntities` (those would never be flattened) nor the
 * separate delete phase a `deleteRecord` item takes part in. The collection also stamps the join
 * field with the parent's key, so an item may leave it out or point it at the parent
 * (`@parent:ID`), but not set it to anything else. A group that breaks any of these keeps the
 * separate-save behaviour.
 */
export function IsPromotableGroup(items: readonly RecordData[] | undefined, promotion: CollectionPromotion): boolean {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }
  return items.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      !item.deleteRecord &&
      (!item.relatedEntities || Object.keys(item.relatedEntities).length === 0) &&
      joinsToParent(item, promotion)
  );
}

/** True when an item leaves the join field out, or sets it to `@parent:<the parent's key field>`. */
function joinsToParent(item: RecordData, promotion: CollectionPromotion): boolean {
  const entry = Object.entries(item.fields ?? {}).find(([name]) => name.toLowerCase() === promotion.JoinField.toLowerCase());
  if (!entry || entry[1] === undefined) {
    return true;
  }
  return typeof entry[1] === 'string' && entry[1].trim().toLowerCase() === `@parent:${promotion.ParentKeyField}`.toLowerCase();
}

/**
 * Decides which `relatedEntities` groups `mj sync push` saves as collection items.
 *
 * When a record's `relatedEntities` names a related entity for which the parent entity declares a
 * collection, its items are applied to that collection before the parent saves, so the parent and
 * those children are one graph save: the parent row first, then the children, in one transaction,
 * and the parent's post-save logic (for example query extraction) sees them already written.
 * Without promotion the children are flattened into separate saves after the parent, so that logic
 * runs before they exist.
 *
 * The file is never rewritten in the other format: promotion only changes how the items are saved.
 *
 * Call {@link Prepare} for a file's records before flattening them; {@link Resolve} is synchronous.
 */
export class CollectionPromotionResolver {
  private readonly byEntity = new Map<string, PromotionsByRelatedEntity>();

  /**
   * @param provider - Returns the provider whose registered entity classes declare the collections;
   *   called only when an entity is first discovered.
   * @param contextUser - The user entity objects are created for.
   */
  constructor(
    private readonly provider: () => IMetadataProvider,
    private readonly contextUser: UserInfo
  ) {}

  /**
   * Discovers the declared collections of every parent entity in these records, including nested
   * `relatedEntities` levels that stay flattened.
   *
   * @param records - A file's records.
   * @param entityName - Their entity.
   */
  public async Prepare(records: readonly RecordData[], entityName: string): Promise<void> {
    for (const record of records) {
      if (!record?.relatedEntities) {
        continue;
      }
      await this.discover(entityName);
      for (const [relatedEntity, items] of Object.entries(record.relatedEntities)) {
        if (!this.Resolve(entityName, relatedEntity, items) && Array.isArray(items)) {
          await this.Prepare(items, relatedEntity);
        }
      }
    }
  }

  /**
   * The collection a `relatedEntities` group is saved through, or `undefined` when the group keeps
   * the separate-save behaviour.
   *
   * @param parentEntity - The parent record's entity.
   * @param relatedEntity - The `relatedEntities` key.
   * @param items - The group's items.
   */
  public Resolve(parentEntity: string, relatedEntity: string, items: readonly RecordData[] | undefined): CollectionPromotion | undefined {
    const promotion = this.byEntity.get(parentEntity.trim().toLowerCase())?.get(relatedEntity.trim().toLowerCase());
    return promotion && IsPromotableGroup(items, promotion) ? promotion : undefined;
  }

  /** The groups of a record that are saved as collection items, with their collections. */
  public PromotedGroups(parentEntity: string, record: RecordData): Array<{ RelatedEntity: string; Items: RecordData[]; Promotion: CollectionPromotion }> {
    const groups: Array<{ RelatedEntity: string; Items: RecordData[]; Promotion: CollectionPromotion }> = [];
    for (const [relatedEntity, items] of Object.entries(record.relatedEntities ?? {})) {
      const promotion = this.Resolve(parentEntity, relatedEntity, items);
      if (promotion) {
        groups.push({ RelatedEntity: relatedEntity, Items: items, Promotion: promotion });
      }
    }
    return groups;
  }

  /** Reads an entity's declared collections once, from a throwaway entity object. */
  private async discover(entityName: string): Promise<void> {
    const key = entityName.trim().toLowerCase();
    if (this.byEntity.has(key)) {
      return;
    }
    this.byEntity.set(key, new Map());
    let prototype: BaseEntity | null = null;
    try {
      prototype = await this.provider().GetEntityObject<BaseEntity>(entityName, this.contextUser);
    } catch {
      // An entity the provider cannot create declares nothing here; its save reports the real error.
      return;
    }
    if (prototype?.HasCompanions) {
      this.byEntity.set(key, DeclaredCollectionsOf(prototype));
    }
  }
}
