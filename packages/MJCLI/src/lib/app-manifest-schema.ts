/**
 * Finds the Open App manifest (`mj-app.json`) a `mj migrate` run is pointed at, so the target
 * schema can come from it when `--schema` is not passed (#4771).
 *
 * Without this, a migrate run from an Open App checkout reads the core schema's Flyway history,
 * where the app's migrations are naturally absent, and reports every one of them as unapplied.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { LoadManifestFromFile } from '@memberjunction/open-app-engine';

export const APP_MANIFEST_FILE_NAME = 'mj-app.json';

/** The manifest found and the schema it declares (undefined for an app with no schema). */
export type AppManifestSchema = {
  ManifestPath: string;
  SchemaName: string | undefined;
};

/**
 * Looks for `mj-app.json` in `dir` and each of its ancestors up to the repository root (the first
 * folder holding `.git`), then in `cwd`. `dir` comes first
 * because it names the migrations being run; `cwd` covers a run from the app's root without `--dir`.
 *
 * @returns The manifest and its schema, or null when no manifest is found.
 * @throws When a manifest is found but cannot be read or does not validate — guessing the core
 *   schema then would repeat the misdiagnosis this lookup exists to prevent.
 */
export function FindAppManifestSchema(dir: string | undefined, cwd: string): AppManifestSchema | null {
  const manifestPath = FindManifestPath(dir, cwd);
  if (!manifestPath) {
    return null;
  }
  let result: ReturnType<typeof LoadManifestFromFile>;
  try {
    result = LoadManifestFromFile(manifestPath);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read ${manifestPath}: ${message}. Pass --schema to choose the target schema.`);
  }
  if (!result.Success || !result.Manifest) {
    throw new Error(
      `${manifestPath} is not a valid Open App manifest (${(result.Errors ?? []).join('; ')}). ` +
        'Fix it, or pass --schema to choose the target schema.'
    );
  }
  return { ManifestPath: manifestPath, SchemaName: result.Manifest.schema?.name };
}

function FindManifestPath(dir: string | undefined, cwd: string): string | null {
  if (dir) {
    let current = path.resolve(cwd, dir.replace(/^filesystem:/, ''));
    for (;;) {
      const candidate = path.join(current, APP_MANIFEST_FILE_NAME);
      if (existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(current);
      // Stop at the repository root so a manifest in an unrelated parent folder is never used.
      if (parent === current || existsSync(path.join(current, '.git'))) {
        break;
      }
      current = parent;
    }
  }
  const inCwd = path.join(path.resolve(cwd), APP_MANIFEST_FILE_NAME);
  return existsSync(inCwd) ? inCwd : null;
}
