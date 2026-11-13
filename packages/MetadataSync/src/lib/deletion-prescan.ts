/**
 * @fileoverview The cheap scan push runs before the deletion audit. It decides whether a run
 * could have any delete markers at all; when it says no, the audit (and the delete phase) is
 * skipped, so it must never say no for a file that does have one.
 * @module deletion-prescan
 */

import type { RecordData } from './sync-engine';

/**
 * Whether the raw file text uses `@include` in any of its forms: a `"@include"` key, an
 * `"@include.name"` key, or an `"@include:path"` array element. The pre-scan reads files without
 * expanding includes, so a delete marker can live in an included file it never sees.
 */
export function TextHasInclude(text: string): boolean {
  return text.includes('"@include');
}

/**
 * Whether any record, or any record nested under `relatedEntities` at any depth, carries
 * `deleteRecord.delete: true`.
 */
export function RecordsHaveDeletions(records: RecordData[]): boolean {
  for (const record of records) {
    if (record.deleteRecord?.delete === true) {
      return true;
    }
    if (record.relatedEntities) {
      for (const relatedRecords of Object.values(record.relatedEntities)) {
        if (Array.isArray(relatedRecords) && RecordsHaveDeletions(relatedRecords)) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Whether one record file could hold a delete marker, judged from its raw text. True when the
 * file uses `@include` (its included content is not read here) or when it parses to records with
 * a delete marker at any depth. A file that fails to parse is reported as false; the full push
 * reports the parse error.
 */
export function FileMayHaveDeletions(content: string): boolean {
  if (TextHasInclude(content)) {
    return true;
  }
  if (!content.includes('"delete"')) {
    return false;
  }
  let data: RecordData | RecordData[];
  try {
    data = JSON.parse(content) as RecordData | RecordData[];
  } catch {
    return false;
  }
  return RecordsHaveDeletions(Array.isArray(data) ? data : [data]);
}
