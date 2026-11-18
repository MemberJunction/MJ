import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the TruthSuite package lives on disk. */
export class TruthSuite {
  /** Absolute path of the TruthSuite package root (works from src/ under vitest and from dist/). */
  public static Root(): string {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  }
}
