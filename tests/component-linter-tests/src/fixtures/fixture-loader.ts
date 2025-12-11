/**
 * Fixture Loader
 *
 * Utilities for loading component spec fixtures from JSON files for testing.
 * Fixtures are organized into categories: broken-components, fixed-components, valid-components
 *
 * Supports reference-based fixtures using $ref to point to source component specs,
 * which enables single source of truth for valid components in metadata/components/spec
 */

import * as fs from 'fs';
import * as path from 'path';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { JsonPreprocessor } from '@memberjunction/metadata-sync';

/**
 * Reference fixture that points to a source component spec
 */
export interface ReferenceFixture {
  /** Path to the source spec file, relative to repo root */
  $ref: string;
  /** Optional description override for test output */
  description?: string;
  /** Optional expected violations (for testing specific scenarios) */
  expectedViolations?: string[];
}

/**
 * Check if a loaded fixture is a reference fixture
 */
function isReferenceFixture(data: unknown): data is ReferenceFixture {
  return data !== null &&
         typeof data === 'object' &&
         '$ref' in data &&
         typeof (data as ReferenceFixture).$ref === 'string';
}

/**
 * Get the repository root directory
 */
function getRepoRoot(): string {
  // Navigate up from src/fixtures to package root, then to repo root
  return path.resolve(__dirname, '../../../..');
}

/**
 * Recursively search for a file by name in a directory
 */
async function findFileRecursive(dirPath: string, filename: string): Promise<string | null> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const found = await findFileRecursive(fullPath, filename);
        if (found) return found;
      } else if (entry.name === filename) {
        return fullPath;
      }
    }
  } catch (error) {
    // Directory doesn't exist or not readable
    return null;
  }

  return null;
}

/**
 * Recursively get all JSON files from a directory
 */
async function getJsonFilesRecursive(dirPath: string, baseDir: string = dirPath): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const nested = await getJsonFilesRecursive(fullPath, baseDir);
        results.push(...nested);
      } else if (entry.name.endsWith('.json')) {
        // Return relative path from baseDir
        const relativePath = path.relative(baseDir, fullPath);
        results.push(relativePath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or not readable
  }

  return results;
}

export interface FixtureMetadata {
  name: string;
  category: 'broken' | 'fixed' | 'valid';
  description?: string;
  expectedViolations?: string[];  // Expected violation rule names
  bugTracking?: {
    issueId?: string;
    dateReported?: string;
    dateFixed?: string;
  };
  /** Indicates this fixture was loaded via $ref */
  isReference?: boolean;
  /** The source path if loaded via $ref */
  sourcePath?: string;
}

export interface LoadedFixture {
  metadata: FixtureMetadata;
  spec: ComponentSpec;
  filePath: string;
}

/**
 * Load a single fixture from the fixtures directory
 * Supports both direct fixtures and $ref-based fixtures that point to source specs
 *
 * @param category - The fixture category (broken, fixed, valid)
 * @param name - The fixture name, can include nested path (e.g., "schema-validation/entity-validation/entity-field-invalid")
 */
export async function loadFixture(category: 'broken' | 'fixed' | 'valid', name: string): Promise<LoadedFixture> {
  const fixturesRoot = path.join(__dirname, '../../fixtures');
  const categoryDir = `${category}-components`;

  // Support nested paths with forward slashes
  const nameWithExt = name.endsWith('.json') ? name : `${name}.json`;
  let filePath = path.join(fixturesRoot, categoryDir, nameWithExt);

  // If nested path not found, try searching for the file (backward compatibility)
  if (!fs.existsSync(filePath)) {
    const basename = path.basename(nameWithExt);
    const found = await findFileRecursive(path.join(fixturesRoot, categoryDir), basename);
    if (found) {
      filePath = found;
    } else {
      throw new Error(`Fixture not found: ${filePath}`);
    }
  }

  const content = await fs.promises.readFile(filePath, 'utf8');
  const rawData = JSON.parse(content);

  let spec: ComponentSpec;
  let isReference = false;
  let sourcePath: string | undefined;
  let descriptionOverride: string | undefined;

  // Check if this is a reference fixture
  if (isReferenceFixture(rawData)) {
    isReference = true;
    descriptionOverride = rawData.description;

    // Resolve the reference path relative to repo root
    const repoRoot = getRepoRoot();
    sourcePath = path.resolve(repoRoot, rawData.$ref);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Referenced spec not found: ${sourcePath} (from $ref: ${rawData.$ref})`);
    }

    // Use JsonPreprocessor to load the spec and resolve @file: references
    const preprocessor = new JsonPreprocessor();
    spec = await preprocessor.processFile(sourcePath) as ComponentSpec;
  } else {
    // Direct fixture - use JsonPreprocessor to handle any @file: references
    const preprocessor = new JsonPreprocessor();
    spec = await preprocessor.processJsonData(rawData, filePath) as ComponentSpec;
  }

  // Extract metadata from filename or component
  const metadata: FixtureMetadata = {
    name,
    category,
    description: descriptionOverride || spec.description,
    isReference,
    sourcePath
  };

  return {
    metadata,
    spec,
    filePath
  };
}

/**
 * Load all fixtures from a specific category (recursively searches subdirectories)
 */
export async function loadFixturesByCategory(category: 'broken' | 'fixed' | 'valid'): Promise<LoadedFixture[]> {
  const fixturesRoot = path.join(__dirname, '../../fixtures');
  const categoryDir = `${category}-components`;
  const dirPath = path.join(fixturesRoot, categoryDir);

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  // Recursively get all JSON files from the category directory
  const jsonFiles = await getJsonFilesRecursive(dirPath);

  const fixtures = await Promise.all(
    jsonFiles.map(async (relativePath) => {
      // Remove .json extension to get the name (which may include nested path)
      const name = relativePath.replace(/\.json$/, '');
      return loadFixture(category, name);
    })
  );

  return fixtures;
}

/**
 * Load all fixtures from all categories
 */
export async function loadAllFixtures(): Promise<{
  broken: LoadedFixture[];
  fixed: LoadedFixture[];
  valid: LoadedFixture[];
}> {
  const [broken, fixed, valid] = await Promise.all([
    loadFixturesByCategory('broken'),
    loadFixturesByCategory('fixed'),
    loadFixturesByCategory('valid')
  ]);

  return { broken, fixed, valid };
}

/**
 * Find a fixture by name across all categories
 */
export async function findFixture(name: string): Promise<LoadedFixture | null> {
  const categories: Array<'broken' | 'fixed' | 'valid'> = ['broken', 'fixed', 'valid'];

  for (const category of categories) {
    try {
      const fixture = await loadFixture(category, name);
      return fixture;
    } catch {
      // Not in this category, continue
    }
  }

  return null;
}

/**
 * Get fixture statistics
 */
export async function getFixtureStats(): Promise<{
  total: number;
  broken: number;
  fixed: number;
  valid: number;
}> {
  const all = await loadAllFixtures();

  return {
    total: all.broken.length + all.fixed.length + all.valid.length,
    broken: all.broken.length,
    fixed: all.fixed.length,
    valid: all.valid.length
  };
}
