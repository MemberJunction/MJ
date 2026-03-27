/**
 * Fixture Loader for Component Linter Tests
 *
 * Loads component spec fixtures from JSON files for testing.
 * Fixtures are organized into categories: broken-components, fixed-components, valid-components.
 *
 * Supports reference-based fixtures using $ref to point to source component specs
 * in metadata/components/spec/. No database or metadata-sync dependency required.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/** Root of the fixtures directory relative to this file */
const FIXTURES_ROOT = path.resolve(__dirname, '../../../fixtures/component-linter');

/** Root of the MJ repository (for resolving $ref paths in valid-component fixtures) */
const REPO_ROOT = path.resolve(__dirname, '../../../../../..');

interface ReferenceFixture {
  $ref: string;
  description?: string;
  expectedViolations?: string[];
}

export interface FixtureMetadata {
  name: string;
  category: 'broken' | 'fixed' | 'valid';
  description?: string;
  expectedViolations?: string[];
  isReference?: boolean;
  sourcePath?: string;
}

export interface LoadedFixture {
  metadata: FixtureMetadata;
  spec: ComponentSpec;
  filePath: string;
}

function isReferenceFixture(data: unknown): data is ReferenceFixture {
  return data !== null && typeof data === 'object' && '$ref' in data && typeof (data as ReferenceFixture).$ref === 'string';
}

/**
 * Resolve @file: references in a JSON object.
 * Replaces string values like "@file:./path/to/code.js" with the file contents.
 */
function resolveFileReferences(obj: Record<string, unknown>, basePath: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.startsWith('@file:')) {
      const filePath = path.resolve(path.dirname(basePath), value.slice('@file:'.length));
      try {
        result[key] = fs.readFileSync(filePath, 'utf8');
      } catch {
        result[key] = value; // Keep original if file not found
      }
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item) ? resolveFileReferences(item as Record<string, unknown>, basePath) : item,
      );
    } else if (value !== null && typeof value === 'object') {
      result[key] = resolveFileReferences(value as Record<string, unknown>, basePath);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Recursively collect all .json file paths from a directory */
async function getJsonFilesRecursive(dirPath: string, baseDir: string = dirPath): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await getJsonFilesRecursive(fullPath, baseDir)));
      } else if (entry.name.endsWith('.json')) {
        results.push(path.relative(baseDir, fullPath));
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return results;
}

/**
 * Load a single fixture by category and name.
 * Name can include nested subdirectory path (e.g. "schema-validation/entity-field-invalid").
 */
export async function loadFixture(category: 'broken' | 'fixed' | 'valid', name: string): Promise<LoadedFixture> {
  const categoryDir = `${category}-components`;
  const nameWithExt = name.endsWith('.json') ? name : `${name}.json`;
  const filePath = path.join(FIXTURES_ROOT, categoryDir, nameWithExt);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture not found: ${filePath}`);
  }

  const content = await fs.promises.readFile(filePath, 'utf8');
  const rawData = JSON.parse(content);

  let spec: ComponentSpec;
  let isReference = false;
  let sourcePath: string | undefined;
  let descriptionOverride: string | undefined;

  if (isReferenceFixture(rawData)) {
    isReference = true;
    descriptionOverride = rawData.description;
    sourcePath = path.resolve(REPO_ROOT, rawData.$ref);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Referenced spec not found: ${sourcePath} (from $ref: ${rawData.$ref})`);
    }

    const specContent = await fs.promises.readFile(sourcePath, 'utf8');
    const specData = JSON.parse(specContent);
    spec = resolveFileReferences(specData, sourcePath) as unknown as ComponentSpec;
  } else {
    spec = resolveFileReferences(rawData, filePath) as unknown as ComponentSpec;
  }

  const metadata: FixtureMetadata = {
    name,
    category,
    description: descriptionOverride || (spec as unknown as Record<string, unknown>).description as string | undefined,
    expectedViolations: isReferenceFixture(rawData) ? rawData.expectedViolations : undefined,
    isReference,
    sourcePath,
  };

  return { metadata, spec, filePath };
}

/** Load all fixtures from a given category */
export async function loadFixturesByCategory(category: 'broken' | 'fixed' | 'valid'): Promise<LoadedFixture[]> {
  const categoryDir = `${category}-components`;
  const dirPath = path.join(FIXTURES_ROOT, categoryDir);

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const jsonFiles = await getJsonFilesRecursive(dirPath);
  const fixtures: LoadedFixture[] = [];

  for (const relativePath of jsonFiles) {
    const name = relativePath.replace(/\.json$/, '');
    try {
      fixtures.push(await loadFixture(category, name));
    } catch (err) {
      // Record load failure but don't block other fixtures
      console.warn(`Warning: Failed to load fixture ${category}/${name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return fixtures;
}
