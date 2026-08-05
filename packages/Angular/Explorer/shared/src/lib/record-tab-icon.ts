import { IMetadataProvider } from '@memberjunction/core';

/**
 * Entity TYPE icon for a record tab, resolved from the tab's configuration.
 * Single source of truth shared by the golden-layout tab type slot, the
 * mobile record bar, and the record switcher sheet — the fallback glyph must
 * stay identical across all three or the same record renders different icons
 * on different surfaces.
 */
export function ResolveRecordTypeIcon(
  configuration: Record<string, unknown> | undefined | null,
  provider: IMetadataProvider | null | undefined
): string {
  const entityName = configuration?.['Entity'];
  const entityIcon = typeof entityName === 'string'
    ? provider?.EntityByName(entityName)?.Icon
    : undefined;
  return entityIcon || 'fa-regular fa-file-lines';
}
