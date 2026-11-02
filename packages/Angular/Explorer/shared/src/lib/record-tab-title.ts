import { CompositeKey, EntityInfo, IMetadataProvider } from '@memberjunction/core';

const RAW_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true when `value` is a standard 36-character UUID string
 * (e.g., `9FAF6073-CEDD-50C9-A49E-009FEDCEC577`).
 */
export function IsRawUUIDString(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return RAW_UUID_REGEX.test(value.trim());
}

/**
 * Abbreviates a UUID or long opaque identifier to a compact `6…4` representation
 * (e.g., `9FAF6073-CEDD-50C9-A49E-009FEDCEC577` → `9FAF60…C577`).
 */
export function AbbreviateRecordUUID(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) {
    return '';
  }
  if (raw.length <= 12) {
    return raw;
  }
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
}

/**
 * Extracts a single displayable primary key value from a `CompositeKey` or URL segment string.
 * Handles both bare key values (`"9FAF6073-..."`) and `FieldName|Value` URL segments (`"ID|9FAF6073-..."`).
 */
export function ExtractPrimaryKeyDisplayValue(
  recordIdOrKey: string | CompositeKey | null | undefined
): string {
  if (!recordIdOrKey) {
    return '';
  }
  if (typeof recordIdOrKey !== 'string') {
    const pairs = recordIdOrKey.KeyValuePairs;
    if (Array.isArray(pairs) && pairs.length > 0) {
      const vals = pairs
        .map(kv => (kv?.Value != null ? String(kv.Value).trim() : ''))
        .filter(v => v.length > 0);
      if (vals.length > 0) {
        return vals.join(' · ');
      }
    }
    if (typeof recordIdOrKey.ToURLSegment === 'function') {
      const seg = recordIdOrKey.ToURLSegment();
      if (typeof seg === 'string' && seg.length > 0) {
        return ExtractPrimaryKeyDisplayValue(seg);
      }
    }
    return '';
  }

  const trimmed = recordIdOrKey.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('|')) {
    const segments = trimmed.split('||');
    const values: string[] = [];
    for (const seg of segments) {
      const pipeIdx = seg.indexOf('|');
      const val = pipeIdx >= 0 ? seg.slice(pipeIdx + 1).trim() : seg.trim();
      if (val.length > 0) {
        values.push(val);
      }
    }
    if (values.length > 0) {
      return values.join(' · ');
    }
  }
  return trimmed;
}

/**
 * Formats the display title for an entity record used in tab headers, browser titles, and breadcrumbs.
 *
 * - When `resolvedRecordName` is a human-readable record name (non-empty, not a raw UUID, and not
 *   merely the entity name itself), returns `resolvedRecordName`.
 * - When the record has no human-readable display name (`GetEntityRecordName` returned empty/null
 *   or returned a raw UUID such as a polymorphic `RecordID`), returns the entity's `DisplayName`
 *   (or `Name`) paired with the abbreviated UUID / key: e.g., `"Process Run Details · 9FAF60…C577"`.
 */
export function FormatEntityRecordDisplayTitle(
  entityInfo: EntityInfo | undefined | null,
  entityName: string,
  recordIdOrKey: string | CompositeKey | null | undefined,
  resolvedRecordName?: string | null
): string {
  const friendlyEntityName = (
    entityInfo?.DisplayName ||
    entityInfo?.DisplayNameOrName ||
    entityInfo?.Name ||
    entityName ||
    ''
  ).trim();
  const canonicalEntityName = (entityInfo?.Name || entityName || '').trim();
  const trimmedResolved = (resolvedRecordName ?? '').trim();

  if (
    trimmedResolved.length > 0 &&
    !IsRawUUIDString(trimmedResolved) &&
    trimmedResolved.toLowerCase() !== friendlyEntityName.toLowerCase() &&
    trimmedResolved.toLowerCase() !== canonicalEntityName.toLowerCase()
  ) {
    return trimmedResolved;
  }

  const pkValue = ExtractPrimaryKeyDisplayValue(recordIdOrKey);
  if (IsRawUUIDString(pkValue)) {
    return friendlyEntityName
      ? `${friendlyEntityName} · ${AbbreviateRecordUUID(pkValue)}`
      : AbbreviateRecordUUID(pkValue);
  }
  if (IsRawUUIDString(trimmedResolved)) {
    return friendlyEntityName
      ? `${friendlyEntityName} · ${AbbreviateRecordUUID(trimmedResolved)}`
      : AbbreviateRecordUUID(trimmedResolved);
  }
  if (pkValue.length > 0) {
    const compactKey = pkValue.length > 12 ? AbbreviateRecordUUID(pkValue) : pkValue;
    return friendlyEntityName ? `${friendlyEntityName} · ${compactKey}` : compactKey;
  }

  return friendlyEntityName || trimmedResolved;
}

/**
 * Ensures a record tab's title never displays a bare 36-character UUID or bare entity name
 * when the tab configuration identifies an entity and a UUID record key.
 */
export function ResolveRecordTabDisplayTitle(
  tab: { title?: string; resourceRecordId?: string; configuration?: Record<string, unknown> } | null | undefined,
  provider?: IMetadataProvider | null
): string | null {
  if (!tab) {
    return null;
  }
  const rawTitle = (tab.title ?? '').trim();
  const config = tab.configuration;
  const resourceType = ((config?.['resourceType'] as string | undefined) ?? '').trim();
  const entityName = ((config?.['Entity'] || config?.['entity']) as string | undefined)?.trim() ?? '';
  const recordId = ((config?.['recordId'] as string | undefined) || tab.resourceRecordId || '').trim();

  const isRecordTab = resourceType.toLowerCase() === 'records' || (entityName.length > 0 && recordId.length > 0);
  if (!isRecordTab || !entityName) {
    return rawTitle || null;
  }

  let entityInfo = provider?.EntityByName?.(entityName);
  if (!entityInfo && provider?.Entities) {
    const lowered = entityName.toLowerCase();
    entityInfo = provider.Entities.find(
      e => e.Name.trim().toLowerCase() === lowered || (e.DisplayName ?? '').trim().toLowerCase() === lowered
    );
  }

  const friendlyEntityName = (
    entityInfo?.DisplayName ||
    entityInfo?.DisplayNameOrName ||
    entityInfo?.Name ||
    entityName
  ).trim();
  const extractedKey = ExtractPrimaryKeyDisplayValue(recordId);

  if (
    !rawTitle ||
    IsRawUUIDString(rawTitle) ||
    ((rawTitle.toLowerCase() === friendlyEntityName.toLowerCase() ||
      rawTitle.toLowerCase() === entityName.toLowerCase()) &&
      IsRawUUIDString(extractedKey))
  ) {
    return FormatEntityRecordDisplayTitle(entityInfo, entityName, recordId, rawTitle);
  }

  return rawTitle;
}
