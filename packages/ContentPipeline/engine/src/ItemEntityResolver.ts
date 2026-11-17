/**
 * @fileoverview {@link ItemEntityResolver} — which entity a source's Content Items are, so the pipeline
 * creates, loads and saves them as a product's IS-A extension of `MJ: Content Items` when one is set.
 *
 * MJ's IS-A layer keeps an extension's fields in a table of its own under the item's ID. Working with the
 * item as the extension reads and writes both rows (one `Save()` writes the parent row, then the
 * extension's, in one transaction); working with it as `MJ: Content Items` sees only the core columns.
 * So a pipeline that always used `MJ: Content Items` created items without their extension row, could not
 * show stages the extension's fields, and refused a driver's `Columns` that named one.
 *
 * Resolution order, first answer wins: the Content Source's `Configuration.ItemEntity`; its Content Source
 * Type's; its Content Type's; `ContentPipeline.ItemEntity` on the default AI Configuration (beside
 * `ContentPipeline.DefaultVectorIndexID`); then plain `MJ: Content Items`.
 *
 * @module @memberjunction/content-pipeline
 */

import { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { FatalStageError } from '@memberjunction/content-pipeline-base';

/** The core entity every item is, whatever extension it is created as. */
export const BASE_ITEM_ENTITY = 'MJ: Content Items';

/** The AI Configuration parameter holding the system-wide default, compared case-insensitively. */
export const ITEM_ENTITY_PARAM = 'ContentPipeline.ItemEntity';

/** Where an item's entity was configured. */
export type ItemEntitySetBy = 'Content Source' | 'Content Source Type' | 'Content Type' | 'AI Configuration' | 'Default';

/** The entity a source's items are, and which setting said so. */
export interface ResolvedItemEntity {
    EntityName: string;
    SetBy: ItemEntitySetBy;
    /** Whether {@link EntityName} is an extension rather than `MJ: Content Items` itself. */
    IsExtension: boolean;
}

/** Resolves a source's item entity from cached metadata. Cheap: every read is an engine's in-memory list. */
export class ItemEntityResolver {
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo,
    ) {}

    /**
     * The entity the items of `contentSourceID` are. An item with no source takes the system default.
     *
     * @throws FatalStageError when the configured name is not an entity, or not an extension of
     *   `MJ: Content Items`: an item created as the wrong entity, or silently as a plain item without the
     *   extension row the product expects, is worse than one that waits for the setting to be fixed.
     */
    public async Resolve(contentSourceID: string | null | undefined): Promise<ResolvedItemEntity> {
        const configured = (contentSourceID ? await this.fromSource(contentSourceID) : null) ?? (await this.fromAIConfiguration());
        if (!configured) {
            return { EntityName: BASE_ITEM_ENTITY, SetBy: 'Default', IsExtension: false };
        }
        return { ...configured, IsExtension: this.validate(configured.EntityName, configured.SetBy) };
    }

    /** The source's own setting, then its source type's, then its content type's. */
    private async fromSource(contentSourceID: string): Promise<{ EntityName: string; SetBy: ItemEntitySetBy } | null> {
        const knowledge = KnowledgeHubMetadataEngine.Instance;
        await knowledge.Config(false, this.contextUser, this.provider);
        let source = knowledge.ContentSources.find((s) => UUIDsEqual(s.ID, contentSourceID));
        if (!source) {
            await knowledge.Config(true, this.contextUser, this.provider);
            source = knowledge.ContentSources.find((s) => UUIDsEqual(s.ID, contentSourceID));
        }
        if (!source) {
            return null;
        }
        const sourceType = knowledge.ContentSourceTypes.find((t) => UUIDsEqual(t.ID, source.ContentSourceTypeID));
        const contentType = source.ContentTypeID ? knowledge.ContentTypes.find((t) => UUIDsEqual(t.ID, source.ContentTypeID)) : undefined;
        const candidates: [string | null, ItemEntitySetBy][] = [
            [nonEmpty(readConfiguration(() => source.ConfigurationObject?.ItemEntity)), 'Content Source'],
            [nonEmpty(readConfiguration(() => sourceType?.ConfigurationObject?.ItemEntity)), 'Content Source Type'],
            [nonEmpty(readConfiguration(() => contentType?.ConfigurationObject?.ItemEntity)), 'Content Type'],
        ];
        const found = candidates.find(([name]) => name !== null);
        return found ? { EntityName: found[0] as string, SetBy: found[1] } : null;
    }

    /** `ContentPipeline.ItemEntity` on the single active default AI Configuration. */
    private async fromAIConfiguration(): Promise<{ EntityName: string; SetBy: ItemEntitySetBy } | null> {
        await AIEngine.Instance.Config(false, this.contextUser, this.provider);
        const defaults = (AIEngine.Instance.Configurations ?? []).filter((c) => Boolean(c.IsDefault) && (c.Status ?? 'Active') === 'Active');
        if (defaults.length !== 1) {
            return null; // none, or an ambiguous set the vector-index resolution already reports
        }
        const param = (AIEngine.Instance.ConfigurationParams ?? []).find(
            (p) => UUIDsEqual(p.ConfigurationID, defaults[0].ID) && p.Name?.trim().toLowerCase() === ITEM_ENTITY_PARAM.toLowerCase(),
        );
        const name = nonEmpty(param?.Value);
        return name ? { EntityName: name, SetBy: 'AI Configuration' } : null;
    }

    /** Whether `name` is an extension (true) or `MJ: Content Items` itself (false); throws when it is neither. */
    private validate(name: string, setBy: ItemEntitySetBy): boolean {
        const entity: EntityInfo | undefined = this.provider.EntityByName(name);
        if (!entity) {
            throw new FatalStageError(`ItemEntity '${name}' (set on the ${setBy}) is not an entity in this database`);
        }
        if (entity.Name === BASE_ITEM_ENTITY) {
            return false;
        }
        if (!entity.ParentChain.some((ancestor) => ancestor.Name === BASE_ITEM_ENTITY)) {
            throw new FatalStageError(
                `ItemEntity '${name}' (set on the ${setBy}) is not an IS-A extension of '${BASE_ITEM_ENTITY}', so its items cannot be created as it`,
            );
        }
        return true;
    }
}

/** A Configuration column that does not parse is read as unset; its own validation reports it. */
function readConfiguration(read: () => string | undefined): string | undefined {
    try {
        return read();
    } catch {
        return undefined;
    }
}

function nonEmpty(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
