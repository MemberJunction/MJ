import {
    BaseEntity,
    CompositeKey,
    EntityFieldInfo,
    EntityInfo,
    IMetadataProvider,
    KeyValuePair,
    Metadata
} from '@memberjunction/core';

/**
 * Input options for resolving a declarative record link target.
 * Supports both **Field-driven mode** (`Record` + `FieldName`) and **Direct mode**
 * (`EntityName` + `PrimaryKey` or `RecordID`).
 */
export interface ResolveRecordLinkOptions {
    /** Host entity record when operating in field-driven mode (`[mjRecordLink]="Record" FieldName="..."`). */
    Record?: BaseEntity | null;
    /** Foreign-key or polymorphic-FK field name on `Record`. */
    FieldName?: string | null;
    /** Explicit target entity name when operating in direct mode. */
    EntityName?: string | null;
    /** Explicit target record ID when operating in direct mode. */
    RecordID?: string | number | null;
    /** Explicit target composite primary key when operating in direct mode. */
    PrimaryKey?: CompositeKey | null;
    /** Optional pre-resolved display name for the linked record. */
    DisplayName?: string | null;
    /** Optional explicit virtual display-name field on `Record` to update on Quick Edit. */
    NameFieldMap?: string | null;
    /** Optional metadata provider override; falls back to `Record.ProviderToUse` or `Metadata.Provider`. */
    Provider?: IMetadataProvider | null;
}

/**
 * Fully resolved target descriptor for a record link.
 */
export interface ResolvedRecordLinkTarget {
    /** Canonical MemberJunction entity name of the linked record. */
    EntityName: string;
    /** Resolved `EntityInfo` metadata if found in the provider. */
    EntityInfo: EntityInfo | undefined;
    /** Human-readable display name of the target entity. */
    EntityDisplayName: string;
    /** Font Awesome icon class for the target entity. */
    EntityIcon: string;
    /** Target record's `CompositeKey`. */
    PrimaryKey: CompositeKey;
    /** String representation of the target record ID (or URL segment for composite keys). */
    RecordID: string;
    /** Known display name of the target record, or `null` if not yet resolved. */
    DisplayName: string | null;
    /** True when resolved via a polymorphic `EntityField.EntityIDFieldName` pair. */
    IsPolymorphic: boolean;
    /** Companion entity discriminator column name when `IsPolymorphic === true`. */
    CompanionEntityFieldName: string | null;
    /** Companion virtual display-name column on the host `Record` (if any). */
    NameFieldMapOnHost: string | null;
}

/**
 * Resolves a metadata provider from an explicit provider, a `BaseEntity` instance, or `Metadata.Provider`.
 */
export function ResolveLinkMetadataProvider(
    explicitProvider?: IMetadataProvider | null,
    record?: BaseEntity | null
): IMetadataProvider | null {
    if (explicitProvider) {
        return explicitProvider;
    }
    const recordProvider = (record as unknown as { ProviderToUse?: IMetadataProvider } | null | undefined)?.ProviderToUse;
    if (recordProvider) {
        return recordProvider;
    }
    return Metadata.Provider ?? null;
}

/**
 * Resolves an `EntityInfo` by entity ID (UUID) or entity name (case-insensitive) from the metadata provider.
 */
export function FindEntityInfoByIdOrName(
    provider: IMetadataProvider | null,
    entityRef: string | null | undefined
): EntityInfo | undefined {
    if (!provider || !entityRef) {
        return undefined;
    }
    const trimmed = entityRef.trim();
    if (!trimmed) {
        return undefined;
    }
    const entities = provider.Entities ?? [];
    const lower = trimmed.toLowerCase();
    return entities.find(
        e =>
            e.ID?.trim().toLowerCase() === lower ||
            e.Name?.trim().toLowerCase() === lower ||
            e.DisplayNameOrName?.trim().toLowerCase() === lower
    );
}

/**
 * Resolves the companion virtual display-name field on `record` for a given FK `fieldInfo`.
 * Checks `fieldInfo.RelatedEntityNameFieldMap` first, then explicit `nameFieldMapOverride`,
 * and finally checks if `record.EntityInfo` has a virtual field named `<Base>Name` or `<Base>`
 * (e.g. `CurrentOrganizationID` -> `CurrentOrganizationName`).
 */
export function ResolveHostNameFieldMap(
    record: BaseEntity | null | undefined,
    fieldInfo: EntityFieldInfo | null | undefined,
    nameFieldMapOverride?: string | null
): string | null {
    if (nameFieldMapOverride && nameFieldMapOverride.trim().length > 0) {
        return nameFieldMapOverride.trim();
    }
    if (fieldInfo?.RelatedEntityNameFieldMap && fieldInfo.RelatedEntityNameFieldMap.trim().length > 0) {
        return fieldInfo.RelatedEntityNameFieldMap.trim();
    }
    if (!record?.EntityInfo || !fieldInfo?.Name) {
        return null;
    }
    const fieldName = fieldInfo.Name.trim();
    if (!/ID$/i.test(fieldName) || fieldName.length <= 2) {
        return null;
    }
    const baseName = fieldName.replace(/ID$/i, '');
    const candidateNames = [`${baseName}Name`, baseName];
    for (const candidate of candidateNames) {
        const match = record.EntityInfo.Fields.find(
            f => f.IsVirtual && f.Name.toLowerCase() === candidate.toLowerCase()
        );
        if (match) {
            return match.Name;
        }
    }
    return null;
}

/**
 * Resolves a {@link ResolvedRecordLinkTarget} from either Field-driven inputs (`Record` + `FieldName`)
 * or Direct inputs (`EntityName` + `PrimaryKey` / `RecordID`).
 * Returns `null` when required link data is empty or unresolvable.
 */
export function ResolveRecordLinkTarget(options: ResolveRecordLinkOptions): ResolvedRecordLinkTarget | null {
    const provider = ResolveLinkMetadataProvider(options.Provider, options.Record);

    // 1. Field-driven mode: Record + FieldName
    if (options.Record && options.FieldName && options.FieldName.trim().length > 0) {
        const record = options.Record;
        const fieldName = options.FieldName.trim();
        const entityInfo = record.EntityInfo;
        const fieldInfo = entityInfo?.Fields?.find(
            f => f.Name.trim().toLowerCase() === fieldName.toLowerCase()
        );

        if (fieldInfo) {
            if (entityInfo && provider?.CurrentUser && !entityInfo.IsFieldReadableByUser(fieldInfo.Name, provider.CurrentUser)) {
                return null;
            }
            const rawFkVal = record.Get(fieldInfo.Name);
            if (rawFkVal === null || rawFkVal === undefined || String(rawFkVal).trim() === '') {
                return null;
            }

            const companionFieldName = fieldInfo.EntityIDFieldName?.trim() || null;
            const isPolymorphic = Boolean(companionFieldName);
            let relatedEntity: EntityInfo | undefined;
            let relatedEntityName = '';

            if (isPolymorphic && companionFieldName) {
                const rawEntityRef = record.Get(companionFieldName);
                if (rawEntityRef === null || rawEntityRef === undefined || String(rawEntityRef).trim() === '') {
                    return null;
                }
                const entityRefStr = String(rawEntityRef).trim();
                relatedEntity = FindEntityInfoByIdOrName(provider, entityRefStr);
                relatedEntityName = relatedEntity?.Name || entityRefStr;
            } else {
                relatedEntityName = fieldInfo.RelatedEntity?.trim() || '';
                if (!relatedEntityName && options.EntityName) {
                    relatedEntityName = options.EntityName.trim();
                }
                if (!relatedEntityName) {
                    return null;
                }
                relatedEntity = FindEntityInfoByIdOrName(provider, relatedEntityName);
                if (relatedEntity) {
                    relatedEntityName = relatedEntity.Name;
                }
            }

            let primaryKey: CompositeKey;
            if (isPolymorphic) {
                primaryKey = CompositeKey.FromURLSegment(relatedEntity, String(rawFkVal));
            } else {
                const pkFieldName =
                    fieldInfo.RelatedEntityFieldName ||
                    relatedEntity?.FirstPrimaryKey?.Name || // first-pk-ok: foreign-key target, single-column by design (polymorphic FKs take the FromURLSegment branch)
                    'ID';
                primaryKey = new CompositeKey([new KeyValuePair(pkFieldName, rawFkVal)]);
            }

            const nameFieldMap = ResolveHostNameFieldMap(record, fieldInfo, options.NameFieldMap);
            let displayName = options.DisplayName?.trim() || null;
            if (!displayName && nameFieldMap) {
                const canReadNameMap =
                    !entityInfo ||
                    !provider?.CurrentUser ||
                    entityInfo.IsFieldReadableByUser(nameFieldMap, provider.CurrentUser);
                if (canReadNameMap) {
                    const mappedVal = record.Get(nameFieldMap);
                    if (mappedVal !== null && mappedVal !== undefined && String(mappedVal).trim() !== '') {
                        displayName = String(mappedVal).trim();
                    }
                }
            }

            return {
                EntityName: relatedEntityName,
                EntityInfo: relatedEntity,
                EntityDisplayName: relatedEntity?.DisplayNameOrName || relatedEntityName,
                EntityIcon: ResolveEntityIconClass(relatedEntity),
                PrimaryKey: primaryKey,
                RecordID: String(rawFkVal).trim(),
                DisplayName: displayName,
                IsPolymorphic: isPolymorphic,
                CompanionEntityFieldName: companionFieldName,
                NameFieldMapOnHost: nameFieldMap
            };
        }
    }

    // 2. Direct mode: EntityName + (PrimaryKey or RecordID)
    const directEntityRef = options.EntityName?.trim() || '';
    if (!directEntityRef) {
        return null;
    }
    const relatedEntity = FindEntityInfoByIdOrName(provider, directEntityRef);
    const canonicalEntityName = relatedEntity?.Name || directEntityRef;

    let primaryKey: CompositeKey | null = options.PrimaryKey ?? null;
    let recordIdStr = '';

    if (primaryKey && primaryKey.KeyValuePairs?.length > 0) {
        recordIdStr =
            primaryKey.KeyValuePairs.length === 1
                ? String(primaryKey.KeyValuePairs[0].Value ?? '').trim()
                : primaryKey.ToURLSegment();
    } else if (options.RecordID !== null && options.RecordID !== undefined && String(options.RecordID).trim() !== '') {
        recordIdStr = String(options.RecordID).trim();
        primaryKey = CompositeKey.FromURLSegment(relatedEntity, recordIdStr);
    }

    if (!primaryKey || !recordIdStr) {
        return null;
    }

    const fieldInfoOnHost =
        options.Record && options.FieldName
            ? options.Record.EntityInfo?.Fields?.find(f => f.Name.toLowerCase() === options.FieldName!.trim().toLowerCase())
            : undefined;
    const nameFieldMap = ResolveHostNameFieldMap(options.Record, fieldInfoOnHost, options.NameFieldMap);

    return {
        EntityName: canonicalEntityName,
        EntityInfo: relatedEntity,
        EntityDisplayName: relatedEntity?.DisplayNameOrName || canonicalEntityName,
        EntityIcon: ResolveEntityIconClass(relatedEntity),
        PrimaryKey: primaryKey,
        RecordID: recordIdStr,
        DisplayName: options.DisplayName?.trim() || null,
        IsPolymorphic: false,
        CompanionEntityFieldName: null,
        NameFieldMapOnHost: nameFieldMap
    };
}

/**
 * Normalizes an `EntityInfo.Icon` string into a full Font Awesome class string.
 */
export function ResolveEntityIconClass(entityInfo: EntityInfo | undefined): string {
    const raw = entityInfo?.Icon?.trim();
    if (!raw) {
        return 'fa-solid fa-table';
    }
    if (raw.includes('fa-')) {
        return raw.startsWith('fa-') ? `fa-solid ${raw}` : raw;
    }
    return `fa-solid fa-${raw}`;
}

/**
 * Propagates inline Quick Edit field updates from `<mj-record-preview-popover>` back onto
 * the host `Record`'s virtual display-name field (when present), keeping custom headers and
 * form fields in sync without dirtying persisted database columns.
 *
 * @returns The new display name if the linked record's name was updated, or `null` otherwise.
 */
export function ApplyQuickEditToHostRecord(
    hostRecord: BaseEntity | null | undefined,
    resolvedTarget: ResolvedRecordLinkTarget | null,
    updatedFields: Record<string, unknown>
): string | null {
    if (!resolvedTarget || !updatedFields) {
        return null;
    }
    const targetNameField = resolvedTarget.EntityInfo?.NameField?.Name ?? 'Name';
    let updatedName: string | null = null;

    if (
        Object.prototype.hasOwnProperty.call(updatedFields, targetNameField) &&
        updatedFields[targetNameField] !== null &&
        updatedFields[targetNameField] !== undefined
    ) {
        updatedName = String(updatedFields[targetNameField]).trim();
    } else {
        for (const fallback of ['Name', 'DisplayName', 'Title', 'Subject']) {
            if (
                Object.prototype.hasOwnProperty.call(updatedFields, fallback) &&
                updatedFields[fallback] !== null &&
                updatedFields[fallback] !== undefined
            ) {
                updatedName = String(updatedFields[fallback]).trim();
                break;
            }
        }
    }

    if (updatedName && hostRecord && resolvedTarget.NameFieldMapOnHost) {
        const hostField = hostRecord.EntityInfo?.Fields?.find(
            f => f.Name.toLowerCase() === resolvedTarget.NameFieldMapOnHost!.toLowerCase()
        );
        // Only set virtual display columns on the host record so we don't mark persisted columns dirty
        if (!hostField || hostField.IsVirtual) {
            hostRecord.Set(resolvedTarget.NameFieldMapOnHost, updatedName);
        }
    }

    return updatedName;
}
