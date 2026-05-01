/**
 * Post-conversion deduplication for EntityField Sequence values.
 *
 * Problem: MJ CodeGen assigns temporary high sequence values (MAX + 100000 + ordinal)
 * that get compacted by spUpdateExistingEntityFieldsFromSchema on the next CodeGen run.
 * When two migrations independently add fields to the same entity, they both compute
 * the same temporary sequence, violating UQ_EntityField_EntityID_Sequence on PG.
 * On SQL Server this is masked because CodeGen runs between migrations and renumbers.
 *
 * Fix: After all migration files are converted to PG, scan for INSERT INTO EntityField
 * statements, detect (EntityID, Sequence) collisions across files, and auto-bump the
 * later file's sequence. The values are temporary anyway — CodeGen renumbers them.
 *
 * Usage:
 *   import { deduplicateEntityFieldSequences } from './SequenceDeduplicator.js';
 *   const result = deduplicateEntityFieldSequences('/path/to/migrations-pg/v5');
 *   // result.fixes contains every bump applied; result.totalCollisions is the count
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface SequenceFix {
  /** Migration file that was modified */
  file: string;
  /** EntityID where the collision occurred */
  entityId: string;
  /** Original sequence value (collided) */
  originalSequence: number;
  /** New sequence value (bumped) */
  newSequence: number;
  /** Line number in the file where the fix was applied */
  line: number;
}

export interface DeduplicationResult {
  /** Total files scanned */
  filesScanned: number;
  /** Total EntityField INSERT statements found */
  totalInserts: number;
  /** Number of (EntityID, Sequence) collisions detected */
  totalCollisions: number;
  /** Details of every fix applied */
  fixes: SequenceFix[];
}

interface SequenceEntry {
  entityId: string;
  sequence: number;
  file: string;
  /** Line number of the sequence value in the file */
  line: number;
  /** Character offset of the sequence value within the line */
  offset: number;
  /** Length of the sequence string (e.g., "100048" = 6 chars) */
  length: number;
}

/**
 * Scans all .pg.sql files in a directory for EntityField INSERT statements,
 * detects (EntityID, Sequence) collisions, and rewrites later files to bump
 * the sequence. Returns a report of all changes made.
 *
 * @param migrationsDir - Directory containing .pg.sql files (e.g., migrations-pg/v5)
 * @param dryRun - If true, detect collisions but don't modify files
 */
export function deduplicateEntityFieldSequences(
  migrationsDir: string,
  dryRun: boolean = false
): DeduplicationResult {
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.pg.sql') || f.endsWith('.pg-only.sql'))
    .sort(); // sorted by version timestamp = chronological order

  const allEntries: SequenceEntry[] = [];

  // Phase 1: Extract all (EntityID, Sequence) pairs from all files
  for (const file of files) {
    const filePath = join(migrationsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const entries = extractEntityFieldInserts(content, file);
    allEntries.push(...entries);
  }

  // Phase 2: Detect collisions — group by (EntityID, Sequence)
  const seen = new Map<string, SequenceEntry>(); // key: "entityId|sequence"
  const collisions: Array<{ first: SequenceEntry; duplicate: SequenceEntry }> = [];

  for (const entry of allEntries) {
    const key = `${entry.entityId.toLowerCase()}|${entry.sequence}`;
    const existing = seen.get(key);
    if (existing) {
      collisions.push({ first: existing, duplicate: entry });
    } else {
      seen.set(key, entry);
    }
  }

  if (collisions.length === 0) {
    return {
      filesScanned: files.length,
      totalInserts: allEntries.length,
      totalCollisions: 0,
      fixes: [],
    };
  }

  // Phase 3: Compute fixes — bump each duplicate to the next available sequence for that entity
  const maxSeqPerEntity = new Map<string, number>();
  for (const entry of allEntries) {
    const eid = entry.entityId.toLowerCase();
    const cur = maxSeqPerEntity.get(eid) ?? 0;
    if (entry.sequence > cur) maxSeqPerEntity.set(eid, entry.sequence);
  }

  const fixes: SequenceFix[] = [];
  // Group fixes by file so we can apply them in a single pass per file
  const fixesByFile = new Map<string, Array<{ entry: SequenceEntry; newSequence: number }>>();

  for (const { duplicate } of collisions) {
    const eid = duplicate.entityId.toLowerCase();
    const current = maxSeqPerEntity.get(eid) ?? duplicate.sequence;
    const newSeq = current + 1;
    maxSeqPerEntity.set(eid, newSeq);

    // Also register the new sequence in `seen` to avoid cascading collisions
    seen.set(`${eid}|${newSeq}`, { ...duplicate, sequence: newSeq });

    fixes.push({
      file: duplicate.file,
      entityId: duplicate.entityId,
      originalSequence: duplicate.sequence,
      newSequence: newSeq,
      line: duplicate.line,
    });

    if (!fixesByFile.has(duplicate.file)) fixesByFile.set(duplicate.file, []);
    fixesByFile.get(duplicate.file)!.push({ entry: duplicate, newSequence: newSeq });
  }

  // Phase 4: Apply fixes — rewrite files
  if (!dryRun) {
    for (const [file, fileFixes] of fixesByFile) {
      const filePath = join(migrationsDir, file);
      let lines = readFileSync(filePath, 'utf-8').split('\n');

      // Apply fixes in reverse line order so line numbers stay valid
      const sortedFixes = fileFixes.sort((a, b) => b.entry.line - a.entry.line);
      for (const { entry, newSequence } of sortedFixes) {
        const lineIdx = entry.line - 1; // 0-based
        const line = lines[lineIdx];
        const seqStr = String(entry.sequence);
        const newLine =
          line.substring(0, entry.offset) +
          String(newSequence) +
          ', -- auto-bumped from ' + seqStr + ' (UQ_EntityField_EntityID_Sequence dedup)' +
          line.substring(entry.offset + entry.length);
        lines[lineIdx] = newLine;
      }

      writeFileSync(filePath, lines.join('\n'), 'utf-8');
    }
  }

  return {
    filesScanned: files.length,
    totalInserts: allEntries.length,
    totalCollisions: collisions.length,
    fixes,
  };
}

/**
 * Extracts all EntityField INSERT (EntityID, Sequence) pairs from a SQL file.
 *
 * Matches the pattern produced by the converter:
 *   INSERT INTO __mj."EntityField"
 *   (
 *   "ID",
 *   "EntityID",
 *   "Sequence",
 *   ...
 *   )
 *   VALUES
 *   (
 *   'uuid-id',
 *   'uuid-entity-id', -- optional comment
 *   100048,
 *   ...
 */
function extractEntityFieldInserts(content: string, fileName: string): SequenceEntry[] {
  const entries: SequenceEntry[] = [];
  const lines = content.split('\n');

  // Strategy: find lines with INSERT INTO __mj."EntityField", then scan forward
  // through column list to find VALUES, then extract positional values for EntityID (pos 2) and Sequence (pos 3).
  for (let i = 0; i < lines.length; i++) {
    // Accept `__mj."EntityField"` as well as `"__mj"."EntityField"` — the v5.3
    // Missing_Metadata file quotes the schema, older regex missed its inserts
    // and the (EntityID, Sequence) collisions went undetected (e.g. v5.3
    // ReplayRun at 100040 collided with v5.28 RestoreReason at the same value).
    if (!/INSERT\s+INTO\s+"?__mj"?\."EntityField"/i.test(lines[i])) continue;

    // Found an INSERT. Determine the column order by scanning the column list.
    // Look for the column list to find positions of "EntityID" and "Sequence"
    let entityIdPos = -1;
    let sequencePos = -1;
    let colIndex = 0;
    let j = i + 1;

    // Skip to opening paren of column list
    while (j < lines.length && !lines[j].includes('(')) j++;
    j++; // skip the ( line itself

    // Read column names until closing )
    while (j < lines.length && !lines[j].trim().startsWith(')')) {
      const colName = lines[j].trim().replace(/,$/, '').replace(/"/g, '').trim();
      if (colName === 'EntityID') entityIdPos = colIndex;
      if (colName === 'Sequence') sequencePos = colIndex;
      colIndex++;
      j++;
    }

    if (entityIdPos === -1 || sequencePos === -1) continue;

    // Now find the VALUES section
    while (j < lines.length && !/\bVALUES\b/i.test(lines[j])) j++;
    if (j >= lines.length) continue;

    // Skip to opening paren of VALUES
    while (j < lines.length && !lines[j].includes('(')) j++;
    j++; // skip the ( line itself

    // Read values positionally
    let valIndex = 0;
    let entityId = '';
    let sequence = 0;
    let seqLine = 0;
    let seqOffset = 0;
    let seqLength = 0;

    while (j < lines.length && !lines[j].trim().startsWith(')')) {
      const rawValue = lines[j].trim();

      if (valIndex === entityIdPos) {
        // EntityID value — extract UUID from 'uuid', possibly with trailing comment
        const match = rawValue.match(/^'([^']+)'/);
        if (match) entityId = match[1];
      }

      if (valIndex === sequencePos) {
        // Sequence value — extract integer, possibly with trailing comma/comment
        const match = rawValue.match(/^(\d+)/);
        if (match) {
          sequence = parseInt(match[1], 10);
          seqLine = j + 1; // 1-based line number
          // Find the offset of the number within the line
          const lineContent = lines[j];
          const numMatch = lineContent.match(/^(\s*)(\d+)/);
          if (numMatch) {
            seqOffset = numMatch[1].length;
            seqLength = numMatch[2].length;
          }
        }
      }

      valIndex++;
      j++;
    }

    if (entityId && sequence > 0 && seqLine > 0) {
      entries.push({
        entityId,
        sequence,
        file: fileName,
        line: seqLine,
        offset: seqOffset,
        length: seqLength,
      });
    }
  }

  return entries;
}
