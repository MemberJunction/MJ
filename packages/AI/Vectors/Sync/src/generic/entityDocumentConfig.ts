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
 * ExtraFilter predicate on the document's entity that a record must satisfy to be vectorized, to
 * be checked by a batch duplicate-detection run, and to be offered as a candidate. (A single-record
 * or entry-time check still checks the record it is given.) A record that fails it (for example one
 * its source system has flagged deleted) stays readable everywhere else.
 *
 * @returns the predicate, or null when none is set
 */
export function GetEntityDocumentRecordFilter(entityDocument: Pick<MJEntityDocumentEntity, 'Configuration' | 'Name'>): string | null {
  const filter = ParseEntityDocumentConfiguration(entityDocument).recordFilter?.extraFilter?.trim();
  return filter ? filter : null;
}

/**
 * AND RunView `ExtraFilter` predicates together, skipping empty ones. Used wherever the record
 * filter is combined with another filter: a list run's membership filter in sync, and a run's own
 * filter or the existence check's key filter in duplicate detection.
 *
 * @returns the one predicate unchanged, several each parenthesized and ANDed, or undefined for none
 */
export function CombineExtraFilters(...filters: (string | null | undefined)[]): string | undefined {
  const present = filters.filter((f): f is string => !!f && f.trim().length > 0);
  if (present.length <= 1) {
    return present[0];
  }
  return present.map((f) => `(${f})`).join(' AND ');
}
