import { LogError } from '@memberjunction/core';
import type { MJEntityDocumentEntity } from '@memberjunction/core-entities';
import type { EntityDocumentConfiguration } from './entityDocumentConfig.types';

/**
 * Parse an entity document's `Configuration` JSON.
 *
 * @returns the configuration, or an empty object when the column is null or not valid JSON
 */
export function ParseEntityDocumentConfiguration(entityDocument: Pick<MJEntityDocumentEntity, 'Configuration' | 'Name'>): EntityDocumentConfiguration {
  const raw = entityDocument.Configuration;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as EntityDocumentConfiguration;
  } catch {
    LogError(`Invalid JSON in EntityDocument.Configuration for "${entityDocument.Name}", using defaults`);
    return {};
  }
}

/**
 * The entity document's record filter, `Configuration.recordFilter.extraFilter`: a RunView
 * ExtraFilter predicate on the document's entity that a record must satisfy to be vectorized and
 * to take part in duplicate detection, as the record checked or as a candidate. A record that
 * fails it (for example one its source system has flagged deleted) stays readable everywhere else.
 *
 * @returns the predicate, or null when none is set
 */
export function GetEntityDocumentRecordFilter(entityDocument: Pick<MJEntityDocumentEntity, 'Configuration' | 'Name'>): string | null {
  const filter = ParseEntityDocumentConfiguration(entityDocument).recordFilter?.extraFilter?.trim();
  return filter ? filter : null;
}
