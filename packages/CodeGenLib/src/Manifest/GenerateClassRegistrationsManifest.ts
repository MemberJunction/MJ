/**
 * Build-time tool to generate an import manifest that prevents tree-shaking of
 * @RegisterClass decorated classes.
 *
 * The tool starts from the current app's package.json, walks its full transitive
 * dependency tree, scans each dependency's source for @RegisterClass decorators,
 * and generates a manifest importing only the packages that contain them.
 *
 * Usage (via MJCLI):
 *   mj codegen manifest --output ./src/generated/class-registrations-manifest.ts
 *
 * Or programmatically:
 *   import { generateClassRegistrationsManifest } from '@memberjunction/codegen-lib';
 *   await generateClassRegistrationsManifest({ outputPath: './src/generated/class-manifest.ts' });
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Information about a class decorated with @RegisterClass
 */
export interface RegisteredClassInfo {
    /** The class name */
    className: string;
    /** Absolute path to the source file */
    filePath: string;
    /** The npm package name (e.g., @memberjunction/core) */
    packageName: string;
    /** The base class name from the decorator (first argument) */
    baseClassName?: string;
    /** The key from the decorator (second argument) */
    key?: string;
}

/**
 * Options for the manifest generator
 */
export interface GenerateManifestOptions {
    /**
     * Output path for the generated manifest file.
     */
    outputPath: string;

    /**
     * Directory containing the app's package.json.
     * Defaults to process.cwd().
     */
    appDir?: string;

    /**
     * If true, logs progress to console. Default: true
     */
    verbose?: boolean;

    /**
     * If provided, only include classes registered with these base classes.
     * Example: ['BaseEngine', 'BaseAction']
     */
    filterBaseClasses?: string[];

    /**
     * Glob patterns to exclude from scanning.
     */
    excludePatterns?: string[];
}

/**
 * Result of the manifest generation
 */
export interface GenerateManifestResult {
    /** Whether generation was successful */
    success: boolean;
    /** Path to the generated manifest file */
    outputPath: string;
    /** Whether the manifest file content changed and was written to disk */
    ManifestChanged: boolean;
    /** All classes found */
    classes: RegisteredClassInfo[];
    /** Unique packages that will be imported */
    packages: string[];
    /** Total packages in the dependency tree */
    totalDepsWalked: number;
    /** Any errors encountered */
    errors: string[];
}

// ============================================================================
// Dependency Tree Walking
// ============================================================================

interface PackageJsonInfo {
    name: string;
    dir: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}

/**
 * Reads and parses a package.json file, returning relevant info.
 */
function readPackageJson(dir: string): PackageJsonInfo | null {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return {
            name: pkg.name || path.basename(dir),
            dir,
            dependencies: pkg.dependencies || {},
            devDependencies: pkg.devDependencies || {}
        };
    } catch {
        return null;
    }
}

/**
 * Resolves a dependency name to its directory on disk.
 * Walks up node_modules directories from the starting point to handle hoisted packages.
 */
function resolvePackageDir(depName: string, fromDir: string): string | null {
    let searchDir = fromDir;
    const root = path.parse(searchDir).root;

    while (searchDir !== root) {
        const candidate = path.join(searchDir, 'node_modules', depName);
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
            // Resolve symlinks (workspace packages are symlinked)
            try {
                const realPath = fs.realpathSync(candidate);
                return realPath;
            } catch {
                return candidate;
            }
        }
        searchDir = path.dirname(searchDir);
    }

    return null;
}

/**
 * Walks the full transitive dependency tree starting from an app's package.json.
 * Returns all unique package directories found (deduplicated by resolved real path).
 */
function walkDependencyTree(
    appDir: string,
    log: (msg: string) => void
): Map<string, string> {
    // Map of package name -> resolved directory
    const visited = new Map<string, string>();
    const queue: Array<{ depName: string; fromDir: string }> = [];

    // Start with the app's own package.json
    const appPkg = readPackageJson(appDir);
    if (!appPkg) {
        log(`No package.json found in ${appDir}`);
        return visited;
    }

    // Seed queue with all direct dependencies (both deps and devDeps for the root app)
    const allDeps = { ...appPkg.dependencies, ...appPkg.devDependencies };
    for (const depName of Object.keys(allDeps)) {
        queue.push({ depName, fromDir: appDir });
    }

    while (queue.length > 0) {
        const { depName, fromDir } = queue.shift()!;

        // Skip if already visited
        if (visited.has(depName)) continue;

        // Resolve to actual directory on disk
        const depDir = resolvePackageDir(depName, fromDir);
        if (!depDir) continue; // External package not found locally, skip

        visited.set(depName, depDir);

        // Read this package's dependencies and add to queue (only dependencies, not devDeps for transitive)
        const depPkg = readPackageJson(depDir);
        if (depPkg) {
            for (const transitiveDep of Object.keys(depPkg.dependencies)) {
                if (!visited.has(transitiveDep)) {
                    queue.push({ depName: transitiveDep, fromDir: depDir });
                }
            }
        }
    }

    return visited;
}

// ============================================================================
// Source Scanning
// ============================================================================

/**
 * Finds all TypeScript source files in a package directory.
 * Looks in the src/ folder by default.
 */
  async function findSourceFiles(packageDir: string, excludePatterns: string[]): Promise<string[]>
  {
      const srcDir = path.join(packageDir, 'src');
      if (!fs.existsSync(srcDir)) return [];

      const defaultExcludes = [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/.git/**',
          '**/__tests__/**',
          '**/*.d.ts',
          '**/*.spec.ts',
          '**/*.test.ts',
          ...excludePatterns.map(p => `**/${p}/**`)
      ];

      const files = await glob('**/*.ts', {
          cwd: srcDir,
          absolute: true,
          ignore: defaultExcludes,
          nodir: true
      });

      return files;
  }

/**
 * Parses a TypeScript file and extracts @RegisterClass decorator information
 */
function extractRegisterClassDecorators(filePath: string, sourceText: string, packageName: string): RegisteredClassInfo[] {
    const results: RegisteredClassInfo[] = [];

    // Quick check before parsing
    if (!sourceText.includes('RegisterClass')) return results;

    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );

    function visit(node: ts.Node): void {
        if (ts.isClassDeclaration(node) && node.name) {
            const decorators = ts.getDecorators(node);
            if (decorators) {
                for (const decorator of decorators) {
                    const info = parseRegisterClassDecorator(decorator, node.name.text, filePath, packageName);
                    if (info) {
                        results.push(info);
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return results;
}

/**
 * Parses a single @RegisterClass decorator and extracts its arguments
 */
function parseRegisterClassDecorator(
    decorator: ts.Decorator,
    className: string,
    filePath: string,
    packageName: string
): RegisteredClassInfo | null {
    if (!ts.isCallExpression(decorator.expression)) return null;

    const callExpr = decorator.expression;

    // Check if the function being called is "RegisterClass"
    if (!ts.isIdentifier(callExpr.expression) || callExpr.expression.text !== 'RegisterClass') {
        return null;
    }

    // Extract arguments
    const args = callExpr.arguments;
    let baseClassName: string | undefined;
    let key: string | undefined;

    if (args.length > 0 && ts.isIdentifier(args[0])) {
        baseClassName = args[0].text;
    }
    if (args.length > 1 && ts.isStringLiteral(args[1])) {
        key = args[1].text;
    }

    return { className, filePath, packageName, baseClassName, key };
}

// ============================================================================
// Export Verification
// ============================================================================

/**
 * Resolves the `.d.ts` entry point for a package by reading its package.json.
 * Checks `types`, `typings`, then falls back to conventional locations.
 */
function resolveTypesEntryPoint(packageDir: string): string | null {
    const pkgPath = path.join(packageDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

        // Check types/typings fields (these are the authoritative source)
        const typesField = pkg.types || pkg.typings;
        if (typesField) {
            const resolved = path.resolve(packageDir, typesField);
            // If the field points to a .ts source file, convert to .d.ts in dist
            if (resolved.endsWith('.ts') && !resolved.endsWith('.d.ts')) {
                const dtsPath = resolved
                    .replace(/\/src\//, '/dist/')
                    .replace(/\.ts$/, '.d.ts');
                if (fs.existsSync(dtsPath)) return dtsPath;
            }
            if (fs.existsSync(resolved)) return resolved;
        }

        // Fallback: check main field and derive .d.ts from it
        if (pkg.main) {
            const mainDts = path.resolve(packageDir, pkg.main.replace(/\.js$/, '.d.ts'));
            if (fs.existsSync(mainDts)) return mainDts;
        }

        // Last resort: conventional locations
        for (const candidate of ['dist/index.d.ts', 'dist/public-api.d.ts']) {
            const candidatePath = path.join(packageDir, candidate);
            if (fs.existsSync(candidatePath)) return candidatePath;
        }
    } catch {
        // Ignore parse errors
    }

    return null;
}

/**
 * Collects all class names exported from a package by recursively following
 * `export * from '...'` and `export { Foo } from '...'` declarations
 * in .d.ts files starting from the types entry point.
 */
function collectExportedClassNames(entryDtsPath: string): Set<string> {
    const exported = new Set<string>();
    const visited = new Set<string>();

    function processFile(filePath: string): void {
        if (visited.has(filePath)) return;
        visited.add(filePath);

        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch {
            return;
        }

        const fileDir = path.dirname(filePath);

        for (const line of content.split('\n')) {
            const trimmed = line.trim();

            // export declare class ClassName ...
            const declareClassMatch = trimmed.match(/^export\s+declare\s+class\s+(\w+)/);
            if (declareClassMatch) {
                exported.add(declareClassMatch[1]);
                continue;
            }

            // export { Foo, Bar, Baz } (with or without "from")
            const namedExportMatch = trimmed.match(/^export\s*\{([^}]+)\}/);
            if (namedExportMatch) {
                const names = namedExportMatch[1].split(',');
                for (const name of names) {
                    // Handle "Foo as Bar" — the exported name is "Bar"
                    const parts = name.trim().split(/\s+as\s+/);
                    const exportedName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
                    if (exportedName && /^\w+$/.test(exportedName)) {
                        exported.add(exportedName);
                    }
                }

                // If this is a re-export from another file, also follow it
                const fromMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
                if (fromMatch) {
                    const resolvedPath = resolveDtsImport(fromMatch[1], fileDir);
                    if (resolvedPath) processFile(resolvedPath);
                }
                continue;
            }

            // export * from './something'
            const starExportMatch = trimmed.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/);
            if (starExportMatch) {
                const resolvedPath = resolveDtsImport(starExportMatch[1], fileDir);
                if (resolvedPath) processFile(resolvedPath);
                continue;
            }
        }
    }

    processFile(entryDtsPath);
    return exported;
}

/**
 * Resolves a relative import specifier to an actual .d.ts file path.
 */
function resolveDtsImport(specifier: string, fromDir: string): string | null {
    // Only resolve relative imports
    if (!specifier.startsWith('.')) return null;

    // Strip .js extension if present (common in ESM .d.ts files)
    const cleaned = specifier.replace(/\.js$/, '');
    const base = path.resolve(fromDir, cleaned);

    // Try direct .d.ts, then with index
    for (const candidate of [
        `${base}.d.ts`,
        path.join(base, 'index.d.ts')
    ]) {
        if (fs.existsSync(candidate)) return candidate;
    }

    return null;
}

/**
 * Builds a map of package name -> Set of exported class names
 * by checking each package's .d.ts entry point.
 */
function buildPackageExportsMap(
    depTree: Map<string, string>,
    log: (msg: string) => void
): Map<string, Set<string>> {
    const exportsMap = new Map<string, Set<string>>();

    for (const [depName, depDir] of Array.from(depTree.entries())) {
        const entryDts = resolveTypesEntryPoint(depDir);
        if (!entryDts) continue;

        const exportedNames = collectExportedClassNames(entryDts);
        if (exportedNames.size > 0) {
            exportsMap.set(depName, exportedNames);
        }
    }

    return exportsMap;
}

/**
 * Filters registered classes to only include those actually exported
 * from their package's public API.
 */
function filterToExportedClasses(
    classes: RegisteredClassInfo[],
    exportsMap: Map<string, Set<string>>,
    log: (msg: string) => void
): { exported: RegisteredClassInfo[]; skipped: RegisteredClassInfo[] } {
    const exported: RegisteredClassInfo[] = [];
    const skipped: RegisteredClassInfo[] = [];

    for (const cls of classes) {
        const packageExports = exportsMap.get(cls.packageName);
        if (!packageExports) {
            // No .d.ts found for this package — include it (may be a local/workspace package)
            exported.push(cls);
            continue;
        }

        if (packageExports.has(cls.className)) {
            exported.push(cls);
        } else {
            skipped.push(cls);
        }
    }

    if (skipped.length > 0) {
        log(`Skipped ${skipped.length} classes not exported from their package's public API:`);
        for (const cls of skipped) {
            log(`  - ${cls.className} (found in ${cls.packageName} source but not in public exports)`);
        }
    }

    return { exported, skipped };
}

// ============================================================================
// Manifest Generation
// ============================================================================

/**
 * Generates the manifest file content with named imports and runtime references
 * to prevent tree-shaking of individual classes.
 *
 * Bare `import 'pkg'` only ensures side effects run but bundlers can still
 * tree-shake individual classes within a package. By importing each class by
 * name and placing it in an exported array, we create a static code path that
 * the bundler cannot eliminate.
 */
function generateManifestContent(
    classes: RegisteredClassInfo[],
    appName: string,
    totalDepsWalked: number,
    filterBaseClasses?: string[]
): string {
    // Filter by base classes if specified
    let filteredClasses = classes;
    if (filterBaseClasses && filterBaseClasses.length > 0) {
        const filterSet = new Set(filterBaseClasses);
        filteredClasses = classes.filter(c => c.baseClassName && filterSet.has(c.baseClassName));
    }

    // Group by package and deduplicate class names within each package
    const packageMap = new Map<string, string[]>();
    for (const cls of filteredClasses) {
        if (!packageMap.has(cls.packageName)) {
            packageMap.set(cls.packageName, []);
        }
        const existing = packageMap.get(cls.packageName)!;
        if (!existing.includes(cls.className)) {
            existing.push(cls.className);
        }
    }

    const sortedPackages = Array.from(packageMap.keys()).sort();

    // Build alias map: detect cross-package name collisions and assign unique aliases
    const aliasMap = buildAliasMap(packageMap, sortedPackages);

    const lines: string[] = buildFileHeader(appName, totalDepsWalked, sortedPackages.length);

    // Generate named imports per package
    const allAliases: string[] = [];
    for (const packageName of sortedPackages) {
        const classNames = packageMap.get(packageName)!.sort();
        const importSpecifiers = buildImportSpecifiers(classNames, packageName, aliasMap);
        allAliases.push(...importSpecifiers.map(s => s.alias));

        lines.push(`// ${packageName} (${classNames.length} classes)`);
        lines.push(`import {`);
        for (const spec of importSpecifiers) {
            if (spec.alias !== spec.original) {
                lines.push(`    ${spec.original} as ${spec.alias},`);
            } else {
                lines.push(`    ${spec.alias},`);
            }
        }
        lines.push(`} from '${packageName}';`);
        lines.push('');
    }

    // Runtime reference array — this is the static code path that prevents tree-shaking
    lines.push('/**');
    lines.push(' * Runtime references to every @RegisterClass decorated class.');
    lines.push(' * This array creates a static code path the bundler cannot tree-shake.');
    lines.push(' */');
    lines.push('// eslint-disable-next-line @typescript-eslint/no-explicit-any');
    lines.push(`export const CLASS_REGISTRATIONS: any[] = [`);
    for (const alias of allAliases) {
        lines.push(`    ${alias},`);
    }
    lines.push('];');
    lines.push('');

    lines.push('/** Marker constant indicating the manifest has been loaded. */');
    lines.push('export const CLASS_REGISTRATIONS_MANIFEST_LOADED = true;');
    lines.push('');
    lines.push(`/** Total @RegisterClass decorated classes discovered in dependency tree */`);
    lines.push(`export const CLASS_REGISTRATIONS_COUNT = ${allAliases.length};`);
    lines.push('');
    lines.push(`/** Packages imported by this manifest */`);
    lines.push(`export const CLASS_REGISTRATIONS_PACKAGES = [`);
    for (const pkg of sortedPackages) {
        lines.push(`    '${pkg}',`);
    }
    lines.push(`] as const;`);
    lines.push('');

    return lines.join('\n');
}

/**
 * Builds the file header comment block.
 */
function buildFileHeader(appName: string, totalDepsWalked: number, packageCount: number): string[] {
    return [
        '/**',
        ' * AUTO-GENERATED FILE - DO NOT EDIT',
        ' * Generated by mj codegen manifest',
        ` * App: ${appName}`,
        ` * Dependency tree: ${totalDepsWalked} packages walked, ${packageCount} contain @RegisterClass`,
        ' *',
        ' * This file imports every @RegisterClass decorated class by name and places',
        ' * them in an exported array, creating a static code path that prevents',
        ' * tree-shaking from removing them.',
        ' */',
        '',
        '/* eslint-disable @typescript-eslint/no-unused-vars */',
        ''
    ];
}

interface ImportSpecifier {
    original: string;
    alias: string;
}

/**
 * Detects cross-package class name collisions and builds a map of
 * (packageName, className) -> unique alias for any collisions.
 *
 * Classes that are unique across all packages keep their original name.
 * Colliding classes get prefixed with a sanitized package suffix.
 */
function buildAliasMap(
    packageMap: Map<string, string[]>,
    sortedPackages: string[]
): Map<string, string> {
    // Count how many packages export each class name
    const nameCount = new Map<string, number>();
    for (const pkg of sortedPackages) {
        const classNames = packageMap.get(pkg)!;
        for (const name of classNames) {
            nameCount.set(name, (nameCount.get(name) || 0) + 1);
        }
    }

    // Build alias map only for collisions: "pkgName::className" -> alias
    const aliasMap = new Map<string, string>();
    for (const pkg of sortedPackages) {
        const classNames = packageMap.get(pkg)!;
        for (const name of classNames) {
            if ((nameCount.get(name) || 0) > 1) {
                const suffix = sanitizePackageName(pkg);
                aliasMap.set(`${pkg}::${name}`, `${name}_${suffix}`);
            }
        }
    }

    return aliasMap;
}

/**
 * Converts a package name like "@memberjunction/ai-anthropic"
 * into a safe identifier suffix like "ai_anthropic".
 */
function sanitizePackageName(packageName: string): string {
    return packageName
        .replace(/^@[^/]+\//, '') // strip scope
        .replace(/[^a-zA-Z0-9]/g, '_'); // non-alphanum → underscore
}

/**
 * Builds import specifiers for a package's classes, applying aliases where needed.
 */
function buildImportSpecifiers(
    classNames: string[],
    packageName: string,
    aliasMap: Map<string, string>
): ImportSpecifier[] {
    return classNames.map(name => {
        const key = `${packageName}::${name}`;
        const alias = aliasMap.get(key) || name;
        return { original: name, alias };
    });
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Generates a class registrations manifest for the app in the given directory.
 *
 * Walks the app's dependency tree from its package.json, scans each dependency
 * for @RegisterClass decorators, and writes an import manifest that prevents
 * tree-shaking from removing those classes.
 *
 * @param options - Configuration options
 * @returns Result with discovered classes and generated manifest path
 *
 * @example
 * ```typescript
 * import { generateClassRegistrationsManifest } from '@memberjunction/codegen-lib';
 *
 * const result = await generateClassRegistrationsManifest({
 *     outputPath: './src/generated/class-manifest.ts'
 * });
 *
 * if (result.success) {
 *     console.log(`Manifest: ${result.packages.length} packages, ${result.classes.length} classes`);
 * }
 * ```
 */
export async function generateClassRegistrationsManifest(
    options: GenerateManifestOptions
): Promise<GenerateManifestResult> {
    const {
        outputPath,
        appDir = process.cwd(),
        verbose = true,
        filterBaseClasses,
        excludePatterns = []
    } = options;

    const errors: string[] = [];
    const allClasses: RegisteredClassInfo[] = [];

    // verbose log: only emitted with verbose=true (e.g. not during prestart)
    const log = (msg: string) => {
        if (verbose) console.log(`[class-manifest] ${msg}`);
    };

    const absoluteAppDir = path.resolve(appDir);

    // Read the app's package.json
    const appPkg = readPackageJson(absoluteAppDir);
    if (!appPkg) {
        errors.push(`No package.json found in ${absoluteAppDir}`);
        return { success: false, outputPath, ManifestChanged: false, classes: [], packages: [], totalDepsWalked: 0, errors };
    }

    log(`Building manifest for: ${appPkg.name}`);
    log(`App directory: ${absoluteAppDir}`);

    // Walk the dependency tree
    const depTree = walkDependencyTree(absoluteAppDir, log);
    log(`Dependency tree: ${depTree.size} packages`);

    // Scan each dependency for @RegisterClass decorators
    let packagesWithDecorators = 0;
    for (const [depName, depDir] of Array.from(depTree.entries())) {
        const sourceFiles = await findSourceFiles(depDir, excludePatterns);
        if (sourceFiles.length === 0) continue;

        let foundInPackage = false;
        for (const filePath of sourceFiles) {
            try {
                const sourceText = fs.readFileSync(filePath, 'utf-8');
                const classes = extractRegisterClassDecorators(filePath, sourceText, depName);
                if (classes.length > 0) {
                    foundInPackage = true;
                    allClasses.push(...classes);
                }
            } catch (err) {
                errors.push(`Error reading ${filePath}: ${err}`);
            }
        }

        if (foundInPackage) packagesWithDecorators++;
    }

    log(`Found ${allClasses.length} @RegisterClass decorators in ${packagesWithDecorators} packages`);

    // Build export map and filter to only classes actually exported from public API
    log('Verifying classes are exported from package public APIs...');
    const exportsMap = buildPackageExportsMap(depTree, log);
    const { exported: verifiedClasses, skipped } = filterToExportedClasses(allClasses, exportsMap, log);
    log(`Verified: ${verifiedClasses.length} exported, ${skipped.length} skipped (not in public API)`);

    // Generate manifest using only verified classes
    const manifestContent = generateManifestContent(verifiedClasses, appPkg.name, depTree.size, filterBaseClasses);
    const absoluteOutputPath = path.resolve(outputPath);
    let manifestChanged = false;

    try {
        fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });

        // Only write if content actually changed to preserve file mtime and avoid
        // invalidating Angular's .angular cache or esbuild's incremental build cache
        let existingContent = '';
        try {
            existingContent = fs.readFileSync(absoluteOutputPath, 'utf-8');
        } catch {
            // File doesn't exist yet, that's fine
        }

        if (existingContent !== manifestContent) {
            fs.writeFileSync(absoluteOutputPath, manifestContent, 'utf-8');
            manifestChanged = true;
            log(`Wrote manifest to: ${absoluteOutputPath}`);
        } else {
            log(`Manifest unchanged, skipped write`);
        }
    } catch (err) {
        errors.push(`Error writing manifest: ${err}`);
        return { success: false, outputPath: absoluteOutputPath, ManifestChanged: false, classes: allClasses, packages: [], totalDepsWalked: depTree.size, errors };
    }

    const uniquePackages = Array.from(new Set(verifiedClasses.map(c => c.packageName))).sort();

    return {
        success: errors.length === 0,
        outputPath: absoluteOutputPath,
        ManifestChanged: manifestChanged,
        classes: verifiedClasses,
        packages: uniquePackages,
        totalDepsWalked: depTree.size,
        errors
    };
}
