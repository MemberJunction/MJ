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

import ts from 'typescript';
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

    /**
     * Package name prefixes to exclude from the dependency tree walk.
     * Any package whose name starts with one of these prefixes will be skipped entirely.
     * Useful for external consumers who import a pre-built manifest for framework packages
     * and only need to scan their own custom packages.
     *
     * @example ['@memberjunction'] — skips all @memberjunction/* packages
     */
    excludePackages?: string[];

    /**
     * When true (the default), compares manifest-imported packages against the
     * app's `package.json` dependencies and automatically adds any that are
     * missing. This prevents `MODULE_NOT_FOUND` errors after npm publish, since
     * transitive packages discovered during the dependency walk may not be
     * declared as direct dependencies.
     *
     * Set to false (or use `--no-sync-deps` in CLI) when generating supplemental
     * manifests that exclude framework packages — those dependencies are already
     * covered by the pre-built bootstrap manifest.
     *
     * Note: This modifies `package.json` only. You must run `npm install` at the
     * repo root afterwards to update the lockfile.
     *
     * @default true
     */
    syncDependencies?: boolean;

    /**
     * When true, scans compiled JavaScript files in dist/ directories for
     * packages that don't have src/ (e.g., npm-published packages).
     *
     * By default, the manifest generator only scans TypeScript source files
     * in src/ directories. Enable this flag to additionally discover
     * @RegisterClass decorators in pre-compiled dist/ output using AST parsing.
     *
     * Use this when your dependency tree includes npm-published packages
     * (not workspace-linked) that contain @RegisterClass decorators.
     *
     * @default false
     */
    scanDist?: boolean;

    /**
     * When set, generates a lazy-loading feature config file at this path.
     * The config maps @RegisterClass keys to dynamic import() loaders based on
     * each package's subpath exports in package.json.
     *
     * Includes all @RegisterClass classes with a key that are in packages
     * matching `excludePackages` AND have subpath exports defined in their
     * package.json. The subpath exports field is the package's declarative
     * marker that it supports lazy chunk loading.
     */
    lazyConfigPath?: string;

    /**
     * When true, the coverage audit treats gaps as fatal errors.
     * A gap is a @RegisterClass class that is neither in the eager manifest
     * nor reachable from any lazy chunk's subpath export.
     *
     * Use in CI to catch tree-shaking issues before merge.
     *
     * @default false
     */
    strict?: boolean;
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
    /**
     * Dependencies that were added to the app's package.json by the
     * syncDependencies step. Keys are package names, values are version strings.
     * Empty when syncDependencies is disabled or no packages were missing.
     */
    AddedDependencies: Record<string, string>;
    /** Any errors encountered */
    errors: string[];
    /** Whether the lazy config file content changed and was written to disk */
    LazyConfigChanged?: boolean;
}

/**
 * Represents a lazy-loadable chunk: a group of @RegisterClass keys
 * that are loaded together via a single dynamic import().
 */
/**
 * A single @RegisterClass entry within a lazy chunk, pairing the base class name with the key.
 * Used to generate compound lookup keys in the format 'BaseClassName::Key'.
 */
export interface LazyChunkEntry {
    /** The @RegisterClass key (second decorator argument, e.g., 'HomeDashboard') */
    key: string;
    /** The base class name (first decorator argument, e.g., 'BaseResourceComponent') */
    baseClassName: string;
}

export interface LazyChunk {
    /** The npm package name */
    packageName: string;
    /** The subpath export (e.g., './ai-dashboards.module') or '.' for whole-package chunks */
    subpath: string;
    /** The full import path for dynamic import (e.g., '@memberjunction/ng-dashboards/ai-dashboards.module') */
    importPath: string;
    /** The generated variable name for the loader function */
    loaderVarName: string;
    /** The @RegisterClass entries (base class + key pairs) that map to this chunk */
    entries: LazyChunkEntry[];
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
/**
 * Checks whether a package name matches any of the given exclusion prefixes.
 */
function isPackageExcluded(packageName: string, excludePackages: string[]): boolean {
    return excludePackages.some(prefix => packageName.startsWith(prefix));
}

function walkDependencyTree(
    appDir: string,
    log: (msg: string) => void,
    excludePackages: string[] = []
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

    if (excludePackages.length > 0) {
        log(`Excluding packages matching: ${excludePackages.join(', ')}`);
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

        // Skip packages matching exclusion prefixes
        if (isPackageExcluded(depName, excludePackages)) continue;

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
 * Result of finding scannable files in a package directory.
 * Indicates whether source (.ts) or compiled (.js) files were found.
 */
interface FindFilesResult {
    /** The discovered file paths */
    files: string[];
    /** Whether these are compiled JS files from dist/ (true) or TS source from src/ (false) */
    isCompiledJS: boolean;
}

/**
 * Finds scannable files in a package directory.
 * Prefers TypeScript source files from src/, but falls back to compiled JS
 * files in dist/ when src/ doesn't exist (e.g., npm-published packages).
 */
async function findScannableFiles(packageDir: string, excludePatterns: string[], scanDist: boolean): Promise<FindFilesResult> {
    const srcDir = path.join(packageDir, 'src');
    if (fs.existsSync(srcDir)) {
        const files = await findSourceFiles(srcDir, excludePatterns);
        return { files, isCompiledJS: false };
    }

    // Only scan dist/ when explicitly opted in via --scan-dist
    if (scanDist) {
        const distDir = path.join(packageDir, 'dist');
        if (fs.existsSync(distDir)) {
            const files = await findDistFiles(distDir, excludePatterns);
            return { files, isCompiledJS: true };
        }
    }

    return { files: [], isCompiledJS: false };
}

/**
 * Finds all TypeScript source files in a package's src/ directory.
 */
async function findSourceFiles(srcDir: string, excludePatterns: string[]): Promise<string[]> {
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

    return glob('**/*.ts', {
        cwd: srcDir,
        absolute: true,
        ignore: defaultExcludes,
        nodir: true
    });
}

/**
 * Finds compiled JavaScript files in a package's dist/ directory.
 * Used as a fallback when src/ doesn't exist (npm-published packages).
 */
async function findDistFiles(distDir: string, excludePatterns: string[]): Promise<string[]> {
    const defaultExcludes = [
        '**/node_modules/**',
        '**/.git/**',
        '**/*.d.ts',
        '**/*.d.ts.map',
        '**/*.js.map',
        '**/*.min.js',
        ...excludePatterns.map(p => `**/${p}/**`)
    ];

    return glob('**/*.{js,mjs,cjs}', {
        cwd: distDir,
        absolute: true,
        ignore: defaultExcludes,
        nodir: true
    });
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

/**
 * Extracts @RegisterClass decorator information from compiled JavaScript files.
 *
 * In compiled JS output, TypeScript decorators are downleveled into
 * `__decorate()` calls with the pattern:
 *
 *   ClassName = __decorate([ RegisterClass(BaseClass, 'key') ], ClassName);
 *
 * This function uses TypeScript's parser with ScriptKind.JS to build a proper
 * AST, then walks it looking for assignment expressions whose right-hand side
 * is a `__decorate([ ... ], ClassName)` call containing `RegisterClass()`.
 */
function extractRegisterClassFromCompiledJS(
    filePath: string,
    sourceText: string,
    packageName: string
): RegisteredClassInfo[] {
    const results: RegisteredClassInfo[] = [];

    // Quick check before parsing
    if (!sourceText.includes('RegisterClass')) return results;

    const sourceFile = ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
    );

    function visit(node: ts.Node): void {
        if (ts.isExpressionStatement(node)) {
            const expr = node.expression;
            if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                const found = parseDecorateAssignment(expr, filePath, packageName);
                results.push(...found);
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return results;
}

/**
 * Parses a binary assignment expression of the form:
 *   ClassName = __decorate([...decorators], ClassName)
 *
 * Validates the structure and delegates to extractRegisterClassFromDecoratorArray
 * for the actual RegisterClass extraction.
 */
function parseDecorateAssignment(
    expr: ts.BinaryExpression,
    filePath: string,
    packageName: string
): RegisteredClassInfo[] {
    // Left side must be an identifier (the class name)
    if (!ts.isIdentifier(expr.left)) return [];
    const className = expr.left.text;

    // Right side must be a call to __decorate
    if (!ts.isCallExpression(expr.right)) return [];
    const callExpr = expr.right;
    if (!ts.isIdentifier(callExpr.expression) || callExpr.expression.text !== '__decorate') return [];

    // First argument must be an array literal (the decorators list)
    if (callExpr.arguments.length < 1) return [];
    const decoratorsArray = callExpr.arguments[0];
    if (!ts.isArrayLiteralExpression(decoratorsArray)) return [];

    return extractRegisterClassFromDecoratorArray(decoratorsArray, className, filePath, packageName);
}

/**
 * Walks the elements of a __decorate() array literal and extracts
 * RegisterClass(...) calls, returning a RegisteredClassInfo for each.
 */
function extractRegisterClassFromDecoratorArray(
    arrayLiteral: ts.ArrayLiteralExpression,
    className: string,
    filePath: string,
    packageName: string
): RegisteredClassInfo[] {
    const results: RegisteredClassInfo[] = [];

    for (const element of arrayLiteral.elements) {
        if (!ts.isCallExpression(element)) continue;
        if (!ts.isIdentifier(element.expression)) continue;
        if (element.expression.text !== 'RegisterClass') continue;

        let baseClassName: string | undefined;
        let key: string | undefined;

        const args = element.arguments;
        if (args.length > 0 && ts.isIdentifier(args[0])) {
            baseClassName = args[0].text;
        }
        if (args.length > 1 && ts.isStringLiteral(args[1])) {
            key = args[1].text;
        }

        results.push({ className, filePath, packageName, baseClassName, key });
    }

    return results;
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
// Dependency Reconciliation
// ============================================================================

/**
 * Result of comparing manifest-imported packages against declared dependencies.
 */
interface DependencyReconciliationResult {
    /** Packages that were added to package.json */
    Added: Record<string, string>;
    /** Whether package.json was modified */
    Changed: boolean;
}

/**
 * Compares the set of packages imported by the manifest against the app's
 * declared `dependencies` in package.json. Any manifest-imported package that
 * is not already a direct dependency is added using the version from its
 * resolved package.json on disk.
 *
 * This prevents `MODULE_NOT_FOUND` errors when packages are published to npm,
 * since transitive dependencies may not be resolvable without explicit
 * declaration.
 */
function reconcileDependencies(
    manifestPackages: string[],
    appDir: string,
    depTree: Map<string, string>,
    log: (msg: string) => void
): DependencyReconciliationResult {
    const pkgPath = path.join(appDir, 'package.json');
    const pkgText = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgText);
    const currentDeps: Record<string, string> = pkg.dependencies || {};

    const missing = findMissingDependencies(manifestPackages, currentDeps, depTree);

    if (Object.keys(missing).length === 0) {
        log('All manifest-imported packages are already declared as dependencies.');
        return { Added: {}, Changed: false };
    }

    const updatedDeps = sortObjectKeys({ ...currentDeps, ...missing });
    pkg.dependencies = updatedDeps;

    const updatedText = JSON.stringify(pkg, null, 2) + '\n';

    // Only write if content actually changed (defensive — should always differ here)
    if (updatedText !== pkgText) {
        fs.writeFileSync(pkgPath, updatedText, 'utf-8');
        logAddedDependencies(missing, log);
        return { Added: missing, Changed: true };
    }

    return { Added: {}, Changed: false };
}

/**
 * Identifies manifest-imported packages that are not declared as direct
 * dependencies, resolving their versions from the installed package on disk.
 */
function findMissingDependencies(
    manifestPackages: string[],
    currentDeps: Record<string, string>,
    depTree: Map<string, string>
): Record<string, string> {
    const missing: Record<string, string> = {};

    for (const pkg of manifestPackages) {
        if (currentDeps[pkg]) continue; // Already declared

        const resolvedDir = depTree.get(pkg);
        if (!resolvedDir) continue; // Can't resolve — skip

        const resolvedPkg = readPackageJson(resolvedDir);
        if (!resolvedPkg) continue;

        // Read the actual version from the resolved package's package.json
        const resolvedPkgPath = path.join(resolvedDir, 'package.json');
        try {
            const resolvedPkgJson = JSON.parse(fs.readFileSync(resolvedPkgPath, 'utf-8'));
            const version = resolvedPkgJson.version;
            if (version) {
                missing[pkg] = version;
            }
        } catch {
            // Skip packages whose version can't be determined
        }
    }

    return missing;
}

/**
 * Logs the list of added dependencies with a reminder to run npm install.
 */
function logAddedDependencies(
    added: Record<string, string>,
    log: (msg: string) => void
): void {
    const count = Object.keys(added).length;
    log(`Added ${count} missing ${count === 1 ? 'dependency' : 'dependencies'} to package.json:`);
    for (const [name, version] of Object.entries(added)) {
        log(`  + ${name}@${version}`);
    }
    log('Remember to run `npm install` at the repo root to update the lockfile.');
}

/**
 * Returns a new object with keys sorted alphabetically.
 */
function sortObjectKeys(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
    }
    return sorted;
}

// ============================================================================
// Lazy Config Generation
// ============================================================================

/**
 * Collects all class names reachable from a `.d.ts` entry point by following
 * both `export` and `import` chains. This is needed for Angular NgModule `.d.ts`
 * files which use `import * as iN from './component'` rather than `export * from`.
 * When a subpath is dynamically imported, ALL transitively-imported modules load,
 * so their `@RegisterClass` decorators execute as side effects.
 */
function collectReachableClassNames(entryDtsPath: string): Set<string> {
    const result = collectReachableClasses(entryDtsPath);
    return new Set(result.keys());
}

/**
 * Extended version that also tracks which .d.ts file each class was found in.
 * Returns Map<className, dtsFilePath> for disambiguation when the same class
 * name appears in multiple subpaths.
 */
function collectReachableClasses(entryDtsPath: string): Map<string, string> {
    const classToFile = new Map<string, string>();
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
                classToFile.set(declareClassMatch[1], filePath);
                continue;
            }

            // export { Foo, Bar } from '...' or export { Foo, Bar }
            const namedExportMatch = trimmed.match(/^export\s*\{([^}]+)\}/);
            if (namedExportMatch) {
                const names = namedExportMatch[1].split(',');
                for (const name of names) {
                    const parts = name.trim().split(/\s+as\s+/);
                    const exportedName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
                    if (exportedName && /^\w+$/.test(exportedName)) {
                        classToFile.set(exportedName, filePath);
                    }
                }
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

            // import * as iN from './relative/path' — follow for reachable classes
            // Only follow relative imports (not external packages like @angular/core)
            const importStarMatch = trimmed.match(/^import\s+\*\s+as\s+\w+\s+from\s+['"](\.[^'"]+)['"]/);
            if (importStarMatch) {
                const resolvedPath = resolveDtsImport(importStarMatch[1], fileDir);
                if (resolvedPath) processFile(resolvedPath);
                continue;
            }

            // import { X } from './relative/path'
            const importNamedMatch = trimmed.match(/^import\s+\{[^}]+\}\s+from\s+['"](\.[^'"]+)['"]/);
            if (importNamedMatch) {
                const resolvedPath = resolveDtsImport(importNamedMatch[1], fileDir);
                if (resolvedPath) processFile(resolvedPath);
                continue;
            }
        }
    }

    processFile(entryDtsPath);
    return classToFile;
}

/**
 * Resolves subpath exports for a package by reading its `package.json` `exports`
 * field and collecting all class names reachable from each subpath's `.d.ts` entry.
 *
 * Uses `collectReachableClassNames` which follows both `export` and `import` chains,
 * since Angular NgModule `.d.ts` files use `import * as` patterns rather than re-exports.
 *
 * @returns Map of subpath name (e.g., './ai-dashboards.module') to Set of reachable class names.
 *          The main entry (`.`) is excluded from the map.
 */
/**
 * Detailed subpath resolution result that includes .d.ts file paths for disambiguation.
 */
export interface SubpathExportInfo {
    /** Class names reachable from this subpath */
    classNames: Set<string>;
    /** Map of className → .d.ts file where it was declared */
    classToFile: Map<string, string>;
}

export function resolveSubpathExports(packageDir: string): Map<string, Set<string>> {
    const detailed = resolveSubpathExportsDetailed(packageDir);
    const result = new Map<string, Set<string>>();
    for (const [subpath, info] of detailed.entries()) {
        result.set(subpath, info.classNames);
    }
    return result;
}

/**
 * Detailed version that also returns the .d.ts file path where each class was found.
 * Used by the lazy config generator to disambiguate classes with the same name
 * that appear in different subpath modules.
 */
function resolveSubpathExportsDetailed(packageDir: string): Map<string, SubpathExportInfo> {
    const result = new Map<string, SubpathExportInfo>();

    const pkgPath = path.join(packageDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return result;

    let pkg: Record<string, unknown>;
    try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
        return result;
    }

    const exports = pkg.exports as Record<string, Record<string, string> | string> | undefined;
    if (!exports || typeof exports !== 'object') return result;

    for (const [subpath, entry] of Object.entries(exports)) {
        // Skip the main entry point
        if (subpath === '.') continue;

        // Handle both { types, default } and plain string entries
        const typesField = typeof entry === 'object' && entry !== null ? entry.types : undefined;
        if (!typesField) continue;

        const dtsPath = path.resolve(packageDir, typesField);
        if (!fs.existsSync(dtsPath)) continue;

        const classToFile = collectReachableClasses(dtsPath);
        if (classToFile.size > 0) {
            result.set(subpath, {
                classNames: new Set(classToFile.keys()),
                classToFile
            });
        }
    }

    return result;
}

/**
 * Checks whether a package has subpath exports defined in its package.json.
 */
function hasSubpathExports(packageDir: string): boolean {
    const pkgPath = path.join(packageDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const exports = pkg.exports;
        if (!exports || typeof exports !== 'object') return false;
        // Has subpath exports if any key other than '.' exists
        return Object.keys(exports).some(k => k !== '.');
    } catch {
        return false;
    }
}

/**
 * Scans packages excluded from the eager manifest for lazy-loadable classes,
 * then groups them into lazy chunks by package subpath export.
 */
/**
 * Resolves which package (if any) contains a given file path.
 * Checks if the file path is under any package's resolved directory.
 */
function resolveHostPackage(filePath: string, depTree: Map<string, string>): string | undefined {
    const absolutePath = path.resolve(filePath);
    for (const [depName, depDir] of depTree.entries()) {
        if (absolutePath.startsWith(depDir + path.sep) || absolutePath.startsWith(depDir + '/')) {
            return depName;
        }
    }
    return undefined;
}

function buildLazyChunks(
    excludePackages: string[],
    fullDepTree: Map<string, string>,
    excludePatterns: string[],
    scanDist: boolean,
    log: (msg: string) => void,
    hostPackageName?: string
): { chunks: LazyChunk[]; errors: string[] } {
    const errors: string[] = [];

    // Find excluded packages that have subpath exports — these are lazy-loadable.
    // The subpath exports field in package.json is the package's declarative marker
    // that it supports lazy chunk loading.
    const lazyPackages = new Map<string, string>();
    for (const [depName, depDir] of fullDepTree.entries()) {
        if (!isPackageExcluded(depName, excludePackages)) continue;

        // Never include the package that hosts the lazy config file (would cause self-import)
        if (hostPackageName && depName === hostPackageName) {
            log(`Lazy config: skipping ${depName} (hosts the lazy config file)`);
            continue;
        }

        // Only include packages with subpath exports
        if (!hasSubpathExports(depDir)) continue;

        lazyPackages.set(depName, depDir);
    }

    log(`Lazy config: ${lazyPackages.size} excluded packages with subpath exports`);

    // Scan lazy packages for @RegisterClass decorators
    const lazyClasses = scanPackagesForDecorators(lazyPackages, excludePatterns, scanDist, errors);
    log(`Lazy config: ${lazyClasses.length} total @RegisterClass decorators found`);

    // Filter to classes with a key (the lazy config maps keys to loaders)
    const filtered = lazyClasses.filter(c => c.key);
    log(`Lazy config: ${filtered.length} classes have keys`);

    // Group classes into chunks by subpath export
    return { chunks: groupClassesIntoChunks(filtered, lazyPackages, log), errors };
}

/**
 * Scans a set of packages for @RegisterClass decorators.
 */
async function scanPackagesForDecoratorsAsync(
    packages: Map<string, string>,
    excludePatterns: string[],
    scanDist: boolean,
    errors: string[]
): Promise<RegisteredClassInfo[]> {
    const classes: RegisteredClassInfo[] = [];

    for (const [depName, depDir] of packages.entries()) {
        const { files, isCompiledJS } = await findScannableFiles(depDir, excludePatterns, scanDist);
        for (const filePath of files) {
            try {
                const sourceText = fs.readFileSync(filePath, 'utf-8');
                const found = isCompiledJS
                    ? extractRegisterClassFromCompiledJS(filePath, sourceText, depName)
                    : extractRegisterClassDecorators(filePath, sourceText, depName);
                classes.push(...found);
            } catch (err) {
                errors.push(`Error reading ${filePath}: ${err}`);
            }
        }
    }

    return classes;
}

/**
 * Synchronous version of scanPackagesForDecorators that calls the glob-based
 * file finder. Since glob is async, we use a sync glob fallback for the lazy path.
 */
function scanPackagesForDecorators(
    packages: Map<string, string>,
    excludePatterns: string[],
    scanDist: boolean,
    errors: string[]
): RegisteredClassInfo[] {
    const classes: RegisteredClassInfo[] = [];

    for (const [depName, depDir] of packages.entries()) {
        const srcDir = path.join(depDir, 'src');
        const distDir = path.join(depDir, 'dist');
        let files: string[] = [];
        let isCompiledJS = false;

        if (fs.existsSync(srcDir)) {
            files = findSourceFilesSync(srcDir, excludePatterns);
        } else if (scanDist && fs.existsSync(distDir)) {
            files = findDistFilesSync(distDir, excludePatterns);
            isCompiledJS = true;
        }

        for (const filePath of files) {
            try {
                const sourceText = fs.readFileSync(filePath, 'utf-8');
                const found = isCompiledJS
                    ? extractRegisterClassFromCompiledJS(filePath, sourceText, depName)
                    : extractRegisterClassDecorators(filePath, sourceText, depName);
                classes.push(...found);
            } catch (err) {
                errors.push(`Error reading ${filePath}: ${err}`);
            }
        }
    }

    return classes;
}

/**
 * Synchronous file finder for TypeScript source files.
 */
function findSourceFilesSync(srcDir: string, excludePatterns: string[]): string[] {
    return glob.sync('**/*.ts', {
        cwd: srcDir,
        absolute: true,
        ignore: [
            '**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**',
            '**/__tests__/**', '**/*.d.ts', '**/*.spec.ts', '**/*.test.ts',
            ...excludePatterns.map(p => `**/${p}/**`)
        ],
        nodir: true
    });
}

/**
 * Synchronous file finder for compiled JavaScript files.
 */
function findDistFilesSync(distDir: string, excludePatterns: string[]): string[] {
    return glob.sync('**/*.{js,mjs,cjs}', {
        cwd: distDir,
        absolute: true,
        ignore: [
            '**/node_modules/**', '**/.git/**', '**/*.d.ts', '**/*.d.ts.map',
            '**/*.js.map', '**/*.min.js',
            ...excludePatterns.map(p => `**/${p}/**`)
        ],
        nodir: true
    });
}

/**
 * Groups lazy classes into chunks based on their package's subpath exports.
 * Packages with subpath exports get one chunk per subpath.
 * Packages without subpath exports get one chunk for the whole package.
 */
function groupClassesIntoChunks(
    lazyClasses: RegisteredClassInfo[],
    lazyPackages: Map<string, string>,
    log: (msg: string) => void
): LazyChunk[] {
    // Build detailed subpath export maps (including .d.ts file paths for disambiguation)
    const packageSubpaths = new Map<string, Map<string, SubpathExportInfo>>();
    for (const [depName, depDir] of lazyPackages.entries()) {
        const subpaths = resolveSubpathExportsDetailed(depDir);
        if (subpaths.size > 0) {
            packageSubpaths.set(depName, subpaths);
        }
    }

    // Map: "packageName::subpath" -> LazyChunk
    const chunks = new Map<string, LazyChunk>();
    const keysSeen = new Map<string, string>(); // key -> chunkKey (collision detection)

    for (const cls of lazyClasses) {
        if (!cls.key) continue;

        const subpaths = packageSubpaths.get(cls.packageName);

        let chunkKey: string;
        let importPath: string;
        let subpath: string;

        if (subpaths) {
            // Package has subpath exports — find which one contains this class
            // Use file path matching to disambiguate classes with the same name
            const packageDir = lazyPackages.get(cls.packageName)!;
            const foundSubpath = findClassSubpathByFile(cls, subpaths, packageDir);
            if (!foundSubpath) {
                log(`  Warning: ${cls.key} (${cls.className}) not found in any subpath of ${cls.packageName}, skipping`);
                continue;
            }
            subpath = foundSubpath;
            const subpathClean = foundSubpath.replace(/^\.\//, '');
            importPath = `${cls.packageName}/${subpathClean}`;
            chunkKey = `${cls.packageName}::${foundSubpath}`;
        } else {
            // No subpath exports — whole package is one chunk
            subpath = '.';
            importPath = cls.packageName;
            chunkKey = `${cls.packageName}::.`;
        }

        // Build compound key for collision detection: 'BaseClassName::Key'
        const compoundKey = `${cls.baseClassName || 'Unknown'}::${cls.key}`;

        // Collision detection: same compound key in different chunks
        const existingChunk = keysSeen.get(compoundKey);
        if (existingChunk && existingChunk !== chunkKey) {
            throw new Error(
                `Lazy config collision: key '${compoundKey}' is exported from both ` +
                `${existingChunk} and ${chunkKey}`
            );
        }
        keysSeen.set(compoundKey, chunkKey);

        if (!chunks.has(chunkKey)) {
            chunks.set(chunkKey, {
                packageName: cls.packageName,
                subpath,
                importPath,
                loaderVarName: buildLoaderVarName(cls.packageName, subpath),
                entries: []
            });
        }

        chunks.get(chunkKey)!.entries.push({
            key: cls.key,
            baseClassName: cls.baseClassName || 'Unknown'
        });
    }

    // Sort entries within each chunk for deterministic output
    for (const chunk of chunks.values()) {
        chunk.entries.sort((a, b) => {
            const compoundA = `${a.baseClassName}::${a.key}`;
            const compoundB = `${b.baseClassName}::${b.key}`;
            return compoundA.localeCompare(compoundB);
        });
    }

    return Array.from(chunks.values()).sort((a, b) => a.importPath.localeCompare(b.importPath));
}

/**
 * Finds which subpath export contains a given class, using the source file path
 * to disambiguate when multiple subpaths export classes with the same name.
 *
 * Converts the class's source `.ts` path to the expected `.d.ts` path (src/ → dist/)
 * and checks which subpath's .d.ts tree includes that file.
 */
function findClassSubpathByFile(
    cls: RegisteredClassInfo,
    subpaths: Map<string, SubpathExportInfo>,
    packageDir: string
): string | undefined {
    // Collect all subpaths that contain a class with this name
    const candidates: string[] = [];
    for (const [subpath, info] of subpaths.entries()) {
        if (info.classNames.has(cls.className)) {
            candidates.push(subpath);
        }
    }

    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    // Multiple subpaths have this class name — disambiguate using file path.
    // Convert cls.filePath (src/Actions/components/foo.ts) to expected .d.ts
    // (dist/Actions/components/foo.d.ts) and check which subpath's tree matches.
    const relativeSource = path.relative(packageDir, cls.filePath);
    const expectedDts = relativeSource
        .replace(/^src\//, 'dist/')
        .replace(/\.ts$/, '.d.ts');
    const expectedDtsAbsolute = path.resolve(packageDir, expectedDts);

    for (const subpath of candidates) {
        const info = subpaths.get(subpath)!;
        const dtsFile = info.classToFile.get(cls.className);
        if (dtsFile && path.resolve(dtsFile) === expectedDtsAbsolute) {
            return subpath;
        }
    }

    // Fallback: return first candidate (shouldn't happen with correct .d.ts mapping)
    return candidates[0];
}

/**
 * Builds a deterministic loader variable name from a package name and subpath.
 *
 * Examples:
 *   ('@memberjunction/ng-dashboards', './ai-dashboards.module') → 'loadAiDashboardsModule'
 *   ('@memberjunction/ng-explorer-settings', '.')               → 'loadNgExplorerSettings'
 */
function buildLoaderVarName(packageName: string, subpath: string): string {
    if (subpath === '.') {
        // Whole-package chunk: derive from package name
        const parts = sanitizePackageName(packageName).split('_').filter(Boolean);
        const pascalParts = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1));
        return `load${pascalParts.join('')}`;
    }

    // Subpath chunk: derive from subpath name
    const clean = subpath
        .replace(/^\.\//, '')
        .replace(/\.module$/, '-module')
        .replace(/\.[^.]+$/, ''); // strip file extensions

    const parts = clean.split(/[-./]/).filter(Boolean);
    const pascalParts = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1));
    return `load${pascalParts.join('')}`;
}

/**
 * Generates the content of the lazy feature config TypeScript file.
 */
function generateLazyConfigContent(chunks: LazyChunk[]): string {
    const lines: string[] = [
        '/**',
        ' * AUTO-GENERATED FILE — DO NOT EDIT',
        ' * Generated by: mj codegen manifest --lazy-config',
        ' * Regenerate with: npm run mj:manifest:explorer',
        ' *',
        ' * Maps @RegisterClass entries to their lazy-loading chunks using compound keys.',
        ' * Compound key format: "BaseClassName::Key" (e.g., "BaseResourceComponent::HomeDashboard").',
        ' *',
        ' * When ClassFactory.GetRegistrationAsync() or CreateInstanceAsync() cannot find a',
        ' * registration synchronously, the registered lazy loader builds the compound key and',
        ' * looks it up here to dynamically import the chunk containing the class.',
        ' */',
        '',
        '/** Helper to create a loader that all entries in a feature share. */',
        'function featureLoader(importFn: () => Promise<unknown>): () => Promise<void> {',
        '  return () => importFn().then(() => {});',
        '}',
        ''
    ];

    // Emit one loader variable per chunk
    for (const chunk of chunks) {
        lines.push(`// --- ${chunk.packageName} → ${chunk.subpath} (${chunk.entries.length} entries) ---`);
        lines.push(`const ${chunk.loaderVarName} = featureLoader(() => import('${chunk.importPath}'));`);
        lines.push('');
    }

    // Emit the config record with compound keys
    lines.push('/**');
    lines.push(' * Complete mapping of compound keys (BaseClassName::Key) to lazy-loading functions.');
    lines.push(' * Covers all @RegisterClass decorated classes in lazy-loaded packages.');
    lines.push(' */');
    lines.push('export const LAZY_FEATURE_CONFIG: Record<string, () => Promise<void>> = {');

    for (const chunk of chunks) {
        lines.push(`  // ${chunk.packageName} → ${chunk.subpath}`);
        for (const entry of chunk.entries) {
            const compoundKey = `${entry.baseClassName}::${entry.key}`;
            lines.push(`  '${compoundKey}': ${chunk.loaderVarName},`);
        }
        lines.push('');
    }

    lines.push('};');
    lines.push('');

    // Count export
    const totalEntries = chunks.reduce((sum, c) => sum + c.entries.length, 0);
    lines.push(`export const LAZY_FEATURE_CONFIG_COUNT = ${totalEntries};`);
    lines.push('');

    return lines.join('\n');
}

/**
 * Writes content to a file only if it has changed, preserving mtime for build caches.
 * Returns true if the file was written.
 */
function writeIfChanged(filePath: string, content: string): boolean {
    const absolutePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

    let existing = '';
    try {
        existing = fs.readFileSync(absolutePath, 'utf-8');
    } catch {
        // File doesn't exist yet
    }

    if (existing === content) return false;

    fs.writeFileSync(absolutePath, content, 'utf-8');
    return true;
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
        excludePatterns = [],
        excludePackages = [],
        syncDependencies = true,
        scanDist = false,
        lazyConfigPath
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
        return { success: false, outputPath, ManifestChanged: false, classes: [], packages: [], totalDepsWalked: 0, AddedDependencies: {}, errors, LazyConfigChanged: false };
    }

    log(`Building manifest for: ${appPkg.name}`);
    log(`App directory: ${absoluteAppDir}`);

    // Walk the dependency tree
    const depTree = walkDependencyTree(absoluteAppDir, log, excludePackages);
    log(`Dependency tree: ${depTree.size} packages`);
    if (scanDist) {
        log('Dist scanning enabled: will scan dist/ for packages without src/');
    }

    // Scan each dependency for @RegisterClass decorators
    let packagesWithDecorators = 0;
    for (const [depName, depDir] of Array.from(depTree.entries())) {
        const { files, isCompiledJS } = await findScannableFiles(depDir, excludePatterns, scanDist);
        if (files.length === 0) continue;

        let foundInPackage = false;
        for (const filePath of files) {
            try {
                const sourceText = fs.readFileSync(filePath, 'utf-8');
                const classes = isCompiledJS
                    ? extractRegisterClassFromCompiledJS(filePath, sourceText, depName)
                    : extractRegisterClassDecorators(filePath, sourceText, depName);
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
        return { success: false, outputPath: absoluteOutputPath, ManifestChanged: false, classes: allClasses, packages: [], totalDepsWalked: depTree.size, AddedDependencies: {}, errors };
    }

    const uniquePackages = Array.from(new Set(verifiedClasses.map(c => c.packageName))).sort();

    // Reconcile manifest-imported packages against declared dependencies
    let addedDependencies: Record<string, string> = {};
    if (syncDependencies && uniquePackages.length > 0) {
        log('Checking for missing package.json dependencies...');
        try {
            const reconciliation = reconcileDependencies(uniquePackages, absoluteAppDir, depTree, log);
            addedDependencies = reconciliation.Added;
        } catch (err) {
            errors.push(`Error reconciling dependencies: ${err}`);
        }
    }

    // Lazy config generation
    let lazyConfigChanged = false;
    if (lazyConfigPath && excludePackages.length > 0) {
        log('');
        log('--- Lazy Config Generation ---');

        try {
            // Walk full dep tree (no excludes) to find packages excluded from the eager manifest
            const fullDepTree = walkDependencyTree(absoluteAppDir, log, []);

            // Detect the package that hosts the lazy config file to prevent self-imports
            const hostPackageName = resolveHostPackage(lazyConfigPath, fullDepTree);
            if (hostPackageName) {
                log(`Lazy config host package: ${hostPackageName} (will be excluded from scan)`);
            }

            const { chunks, errors: lazyErrors } = buildLazyChunks(
                excludePackages, fullDepTree,
                excludePatterns, scanDist, log, hostPackageName
            );
            errors.push(...lazyErrors);

            if (chunks.length > 0) {
                const totalEntries = chunks.reduce((sum, c) => sum + c.entries.length, 0);
                log(`Lazy config: ${totalEntries} entries across ${chunks.length} chunks`);

                const lazyContent = generateLazyConfigContent(chunks);
                lazyConfigChanged = writeIfChanged(lazyConfigPath, lazyContent);

                if (lazyConfigChanged) {
                    log(`Wrote lazy config to: ${path.resolve(lazyConfigPath)}`);
                } else {
                    log(`Lazy config unchanged, skipped write`);
                }
            } else {
                log('Lazy config: no lazy-loadable classes found');
            }

            // --- Coverage Audit ---
            // Scan the full dep tree (no excludes) for ALL @RegisterClass classes,
            // then check that every class is covered by either the lite manifest or a lazy chunk.
            log('');
            log('--- Coverage Audit ---');
            const fullClasses = await scanPackagesForDecorators(fullDepTree, excludePatterns, scanDist, errors);
            const fullClassesWithKeys = fullClasses.filter(c => c.key);

            // Build sets of covered class names
            const eagerClassNames = new Set(verifiedClasses.map(c => c.className));
            const lazyClassNames = new Set<string>();
            for (const chunk of chunks) {
                // Re-scan the chunk's packages to get class names (entries have keys, not classNames)
                // Use the fullClasses list filtered to matching package + key
                for (const entry of chunk.entries) {
                    const match = fullClassesWithKeys.find(
                        c => c.key === entry.key && c.baseClassName === entry.baseClassName && c.packageName === chunk.packageName
                    );
                    if (match) {
                        lazyClassNames.add(match.className);
                    }
                }
            }

            // Find gaps: classes with keys that are in neither set
            const gaps: RegisteredClassInfo[] = [];
            for (const cls of fullClassesWithKeys) {
                if (!eagerClassNames.has(cls.className) && !lazyClassNames.has(cls.className)) {
                    // Check if this class is from a package that we're supposed to handle
                    // (i.e., it's in the exclude list, so it should be in lazy config)
                    const isExcludedPackage = excludePackages.some(ep => cls.packageName.startsWith(ep));
                    if (isExcludedPackage) {
                        gaps.push(cls);
                    }
                }
            }

            if (gaps.length > 0) {
                log('');
                log(`⚠ Coverage gap: ${gaps.length} @RegisterClass class(es) will be tree-shaken:`);
                // Group by package for readable output
                const byPackage = new Map<string, RegisteredClassInfo[]>();
                for (const gap of gaps) {
                    const existing = byPackage.get(gap.packageName) || [];
                    existing.push(gap);
                    byPackage.set(gap.packageName, existing);
                }
                for (const [pkg, classes] of byPackage.entries()) {
                    log(`  ${pkg}:`);
                    for (const cls of classes) {
                        log(`    - ${cls.className} (${cls.baseClassName || '?'}, '${cls.key}')`);
                        log(`      Not in any subpath export. Add to a module or the eager manifest.`);
                    }
                }

                if (options.strict) {
                    errors.push(`Coverage audit failed: ${gaps.length} @RegisterClass class(es) are not covered by the eager manifest or any lazy chunk. Run with --verbose to see details.`);
                }
            } else {
                log(`Coverage audit passed: all ${fullClassesWithKeys.length} keyed @RegisterClass classes are covered`);
            }
        } catch (err) {
            errors.push(`Error generating lazy config: ${err}`);
        }
    }

    return {
        success: errors.length === 0,
        outputPath: absoluteOutputPath,
        ManifestChanged: manifestChanged,
        LazyConfigChanged: lazyConfigChanged,
        classes: verifiedClasses,
        packages: uniquePackages,
        totalDepsWalked: depTree.size,
        AddedDependencies: addedDependencies,
        errors
    };
}
