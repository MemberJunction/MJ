import fs from 'fs';
import path from 'path';
import { EmitStats } from './emit-stats';

/**
 * Write `newContent` to `filePath` only when the file is missing or the bytes differ.
 *
 * Unchanged generated files keep their mtime. That is the whole point on a 2,000-entity
 * database: TypeScript incremental builds (`incremental: true`) and file watchers treat
 * a rewritten-but-identical monolith as dirty and recompile it. Skipping the write is
 * what makes per-schema emit actually cheap on a no-op CodeGen run.
 *
 * Deliberately dependency-free (no `util` / config import) so unit tests can exercise
 * it without booting the CodeGen config graph.
 *
 * @returns true when the file was created or rewritten
 */
export function WriteFileIfChanged(filePath: string, newContent: string): boolean {
  // Read directly rather than checking existence first, so nothing can change between the check and the read.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (readIfExists(filePath) === newContent) {
    EmitStats.RecordFileWrite(false);
    return false;
  }
  fs.writeFileSync(filePath, newContent);
  EmitStats.RecordFileWrite(true);
  return true;
}

/** The file's contents, or `undefined` when it does not exist. */
function readIfExists(filePath: string): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
}

/** @deprecated Use {@link WriteFileIfChanged}. */
export function writeFileIfChanged(filePath: string, newContent: string): boolean {
  return WriteFileIfChanged(filePath, newContent);
}
