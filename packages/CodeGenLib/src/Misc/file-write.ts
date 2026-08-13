import fs from 'fs';
import path from 'path';

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
export function writeFileIfChanged(filePath: string, newContent: string): boolean {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (existing === newContent) {
      return false;
    }
  }
  fs.writeFileSync(filePath, newContent);
  return true;
}
