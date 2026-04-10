import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { VAULT_DIRS, classifyPackage, sanitizeFilename, type SyncConfig } from '../lib/config.js';
import { type HashCache, updateFileHash } from '../lib/hasher.js';

interface PackageInfo {
  name: string;
  displayName: string;
  version: string;
  description: string;
  mjDeps: string[];
  category: string;
  readmeContent: string;
  packageJsonPath: string;
  relPath: string;
}

interface DepGraph {
  forward: Map<string, string[]>;  // package -> its MJ dependencies
  reverse: Map<string, string[]>;  // package -> who depends on it
}

function npmNameToDisplayName(npmName: string): string {
  return npmName
    .replace('@memberjunction/', '')
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

function parsePackageJson(pkgPath: string, repoRoot: string): PackageInfo | null {
  try {
    const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (!raw.name || raw.private === true) {
      // Still include private packages if they have a name (e.g., MJAPI)
      if (!raw.name) return null;
    }

    const dir = path.dirname(pkgPath);
    const relPath = path.relative(repoRoot, dir);
    const allDeps = { ...(raw.dependencies || {}), ...(raw.peerDependencies || {}) };
    const mjDeps = Object.keys(allDeps).filter(d => d.startsWith('@memberjunction/'));

    let readmeContent = '';
    const readmePath = path.join(dir, 'README.md');
    if (fs.existsSync(readmePath)) {
      readmeContent = fs.readFileSync(readmePath, 'utf-8');
      // Strip existing frontmatter from README
      if (readmeContent.startsWith('---')) {
        const endIdx = readmeContent.indexOf('---', 3);
        if (endIdx > 0) {
          readmeContent = readmeContent.slice(endIdx + 3).trimStart();
        }
      }
    }

    return {
      name: raw.name,
      displayName: npmNameToDisplayName(raw.name),
      version: raw.version || '0.0.0',
      description: raw.description || '',
      mjDeps,
      category: classifyPackage(dir),
      readmeContent,
      packageJsonPath: pkgPath,
      relPath,
    };
  } catch {
    return null;
  }
}

function buildDepGraph(packages: PackageInfo[]): DepGraph {
  const nameToDisplay = new Map<string, string>();
  for (const pkg of packages) {
    nameToDisplay.set(pkg.name, pkg.displayName);
  }

  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();

  for (const pkg of packages) {
    const depDisplayNames = pkg.mjDeps
      .map(d => nameToDisplay.get(d))
      .filter((d): d is string => d !== undefined);

    forward.set(pkg.displayName, depDisplayNames);

    for (const dep of depDisplayNames) {
      const existing = reverse.get(dep) || [];
      existing.push(pkg.displayName);
      reverse.set(dep, existing);
    }
  }

  return { forward, reverse };
}

function generatePackagePage(pkg: PackageInfo, depGraph: DepGraph): string {
  const deps = depGraph.forward.get(pkg.displayName) || [];
  const reverseDeps = depGraph.reverse.get(pkg.displayName) || [];

  const lines: string[] = [
    '---',
    `package_name: "${pkg.displayName}"`,
    `npm_name: "${pkg.name}"`,
    `version: "${pkg.version}"`,
    `dependency_count: ${deps.length}`,
    `dependents_count: ${reverseDeps.length}`,
    `category: "${pkg.category.replace('_', '')}"`,
    `tags: ["package", "category/${pkg.category.replace('_', '')}", "auto-generated"]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    `# ${pkg.displayName}`,
    '',
    `> [!info] \`${pkg.name}\` v${pkg.version} -- Source: \`${pkg.relPath}\``,
    '',
  ];

  if (pkg.description) {
    lines.push(pkg.description, '');
  }

  // Dependencies
  if (deps.length > 0) {
    lines.push('## MJ Dependencies', '');
    for (const dep of deps.sort()) {
      lines.push(`- [[${dep}]]`);
    }
    lines.push('');
  }

  // Reverse dependencies
  if (reverseDeps.length > 0) {
    lines.push('## Depended On By', '');
    for (const dep of reverseDeps.sort()) {
      lines.push(`- [[${dep}]]`);
    }
    lines.push('');
  }

  // README content
  if (pkg.readmeContent) {
    lines.push('---', '', '## README', '', pkg.readmeContent);
  }

  return lines.join('\n');
}

export interface PackageExtractorResult {
  packagesProcessed: number;
  categories: Map<string, number>;
}

/** Exported for use by dep graph generator */
export interface PackageDepData {
  packages: PackageInfo[];
  depGraph: DepGraph;
}

let _lastDepData: PackageDepData | null = null;
export function getLastDepData(): PackageDepData | null {
  return _lastDepData;
}

export async function extractPackages(
  config: SyncConfig,
  _cache: HashCache
): Promise<PackageExtractorResult> {
  const result: PackageExtractorResult = {
    packagesProcessed: 0,
    categories: new Map(),
  };

  // Find all package.json files
  const packageJsonFiles = await glob('packages/**/package.json', {
    cwd: config.repoRoot,
    ignore: ['**/node_modules/**', '**/dist/**'],
    nodir: true,
  });

  // Parse all packages
  const packages: PackageInfo[] = [];
  for (const relPkgPath of packageJsonFiles) {
    const absPath = path.join(config.repoRoot, relPkgPath);
    const pkg = parsePackageJson(absPath, config.repoRoot);
    if (pkg) packages.push(pkg);
  }

  // Build dependency graph
  const depGraph = buildDepGraph(packages);
  _lastDepData = { packages, depGraph };

  // Generate pages grouped by category
  for (const pkg of packages) {
    const category = pkg.category;
    const count = result.categories.get(category) || 0;
    result.categories.set(category, count + 1);

    const page = generatePackagePage(pkg, depGraph);
    const categoryDir = path.join(config.vaultPath, VAULT_DIRS.packages, category);
    fs.mkdirSync(categoryDir, { recursive: true });

    const filename = sanitizeFilename(pkg.displayName) + '.md';
    fs.writeFileSync(path.join(categoryDir, filename), page);
    updateFileHash(pkg.packageJsonPath, _cache);
    result.packagesProcessed++;
  }

  return result;
}
