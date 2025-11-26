/**
 * Fixture Loader
 *
 * Utilities for loading component spec fixtures from JSON files for testing.
 * Fixtures are organized into categories: broken-components, fixed-components, valid-components
 */

import * as fs from 'fs';
import * as path from 'path';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

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
}

export interface LoadedFixture {
  metadata: FixtureMetadata;
  spec: ComponentSpec;
  filePath: string;
}

/**
 * Load a single fixture from the fixtures directory
 */
export async function loadFixture(category: 'broken' | 'fixed' | 'valid', name: string): Promise<LoadedFixture> {
  const fixturesRoot = path.join(__dirname, '../../fixtures');
  const categoryDir = `${category}-components`;
  const filePath = path.join(fixturesRoot, categoryDir, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture not found: ${filePath}`);
  }

  const content = await fs.promises.readFile(filePath, 'utf8');
  const spec = JSON.parse(content) as ComponentSpec;

  // Extract metadata from filename or component
  const metadata: FixtureMetadata = {
    name,
    category,
    description: spec.description
  };

  return {
    metadata,
    spec,
    filePath
  };
}

/**
 * Load all fixtures from a specific category
 */
export async function loadFixturesByCategory(category: 'broken' | 'fixed' | 'valid'): Promise<LoadedFixture[]> {
  const fixturesRoot = path.join(__dirname, '../../fixtures');
  const categoryDir = `${category}-components`;
  const dirPath = path.join(fixturesRoot, categoryDir);

  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files = await fs.promises.readdir(dirPath);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const fixtures = await Promise.all(
    jsonFiles.map(async (file) => {
      const name = path.basename(file, '.json');
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
