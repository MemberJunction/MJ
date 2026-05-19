import { describe, it, expect, vi, beforeEach } from 'vitest';
import ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { generateClassRegistrationsManifest, resolveSubpathExports } from '../Manifest/GenerateClassRegistrationsManifest';

// We test the pure functions from the manifest generator by importing via a module-level mock setup.
// Many functions in the manifest generator are module-private, but we can test the exported types
// and the extractRegisterClassDecorators logic by creating our own test source code and parsing it.

// Mock fs, glob, and path for anything the module loads at import time
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        default: {
            ...actual,
            existsSync: vi.fn().mockReturnValue(false),
            readFileSync: vi.fn().mockReturnValue('{}'),
            writeFileSync: vi.fn(),
            realpathSync: vi.fn((p: string) => p),
            mkdirSync: vi.fn()
        },
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn().mockReturnValue('{}'),
        writeFileSync: vi.fn(),
        realpathSync: vi.fn((p: string) => p),
        mkdirSync: vi.fn()
    };
});

vi.mock('glob', () => {
    // Create the mock glob function with a .sync property attached
    const mockGlob = Object.assign(vi.fn().mockResolvedValue([]), {
        sync: vi.fn().mockReturnValue([])
    });
    return {
        glob: mockGlob,
        globSync: vi.fn().mockReturnValue([])
    };
});

// Since the functions we want to test are not exported, we test the underlying TypeScript AST parsing
// which is the core logic of the manifest generator

describe('Manifest Generator - TypeScript AST Parsing', () => {
    function parseSourceForRegisterClass(sourceCode: string): { className: string; baseClass?: string; key?: string }[] {
        const sourceFile = ts.createSourceFile(
            'test.ts',
            sourceCode,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );

        const results: { className: string; baseClass?: string; key?: string }[] = [];

        function visit(node: ts.Node): void {
            if (ts.isClassDeclaration(node) && node.name) {
                const decorators = ts.getDecorators(node);
                if (decorators) {
                    for (const decorator of decorators) {
                        if (ts.isCallExpression(decorator.expression)) {
                            const expr = decorator.expression;
                            if (ts.isIdentifier(expr.expression) && expr.expression.text === 'RegisterClass') {
                                const info: { className: string; baseClass?: string; key?: string } = {
                                    className: node.name.text
                                };
                                if (expr.arguments.length > 0 && ts.isIdentifier(expr.arguments[0])) {
                                    info.baseClass = expr.arguments[0].text;
                                }
                                if (expr.arguments.length > 1 && ts.isStringLiteral(expr.arguments[1])) {
                                    info.key = expr.arguments[1].text;
                                }
                                results.push(info);
                            }
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
        return results;
    }

    it('should detect @RegisterClass on a class', () => {
        const source = `
            import { RegisterClass } from '@memberjunction/global';
            @RegisterClass(BaseEntity, 'Users')
            export class MJUserEntity extends BaseEntity {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MJUserEntity');
        expect(results[0].baseClass).toBe('BaseEntity');
        expect(results[0].key).toBe('Users');
    });

    it('should detect multiple @RegisterClass decorators in one file', () => {
        const source = `
            @RegisterClass(BaseEntity, 'Users')
            export class MJUserEntity extends BaseEntity {}

            @RegisterClass(BaseEntity, 'Roles')
            export class MJRoleEntity extends BaseEntity {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(2);
        expect(results[0].className).toBe('MJUserEntity');
        expect(results[1].className).toBe('MJRoleEntity');
    });

    it('should return empty for files without @RegisterClass', () => {
        const source = `
            export class SimpleClass {
                DoSomething() {}
            }
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(0);
    });

    it('should handle class with no key argument', () => {
        const source = `
            @RegisterClass(BaseAction)
            export class MyAction extends BaseAction {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MyAction');
        expect(results[0].baseClass).toBe('BaseAction');
        expect(results[0].key).toBeUndefined();
    });

    it('should skip undecorated classes', () => {
        const source = `
            export class NotDecorated {}

            @RegisterClass(BaseEntity, 'Decorated')
            export class DecoratedClass extends BaseEntity {}

            export class AlsoNotDecorated {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('DecoratedClass');
    });

    it('should ignore other decorators', () => {
        const source = `
            @Component({})
            export class MyComponent {}

            @RegisterClass(BaseEntity, 'Test')
            @Injectable()
            export class MJTestEntity extends BaseEntity {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MJTestEntity');
    });
});

describe('Manifest Generator Types', () => {
    it('should have RegisteredClassInfo shape', () => {
        // Validate the type shape compiles
        const info: { className: string; filePath: string; packageName: string; baseClassName?: string; key?: string } = {
            className: 'TestClass',
            filePath: '/path/to/file.ts',
            packageName: '@memberjunction/test'
        };
        expect(info.className).toBe('TestClass');
        expect(info.filePath).toBe('/path/to/file.ts');
        expect(info.packageName).toBe('@memberjunction/test');
    });

    it('should have GenerateManifestOptions shape', () => {
        const options: {
            outputPath: string;
            appDir?: string;
            verbose?: boolean;
            filterBaseClasses?: string[];
            excludePatterns?: string[];
            excludePackages?: string[];
            syncDependencies?: boolean;
            scanDist?: boolean;
        } = {
            outputPath: './manifest.ts',
            verbose: true,
            excludePackages: ['@memberjunction'],
            syncDependencies: true,
            scanDist: false
        };
        expect(options.outputPath).toBe('./manifest.ts');
        expect(options.excludePackages).toContain('@memberjunction');
        expect(options.syncDependencies).toBe(true);
        expect(options.scanDist).toBe(false);
    });

    it('should have GenerateManifestResult shape', () => {
        const result: {
            success: boolean;
            outputPath: string;
            ManifestChanged: boolean;
            classes: unknown[];
            packages: string[];
            totalDepsWalked: number;
            AddedDependencies: Record<string, string>;
            errors: string[];
        } = {
            success: true,
            outputPath: './manifest.ts',
            ManifestChanged: false,
            classes: [],
            packages: ['@memberjunction/core'],
            totalDepsWalked: 15,
            AddedDependencies: {},
            errors: []
        };
        expect(result.success).toBe(true);
        expect(result.packages).toHaveLength(1);
        expect(result.AddedDependencies).toEqual({});
    });
});

// =============================================================================
// Compiled JS Extraction Tests
// =============================================================================
// When a package ships only dist/ (no src/), the manifest generator can scan
// compiled .js files (with --scan-dist). TypeScript downlevels decorators into
// __decorate() calls. We re-implement the AST extraction logic here to test it.
// =============================================================================

describe('Manifest Generator - Compiled JS Extraction', () => {
    /**
     * Re-implements the AST logic from extractRegisterClassFromCompiledJS()
     * so we can test it without exporting the private function.
     *
     * Uses TypeScript's parser with ScriptKind.JS to walk the AST for
     * `ClassName = __decorate([ RegisterClass(Base, 'key') ], ClassName)` patterns.
     */
    function parseCompiledJSForRegisterClass(
        sourceCode: string
    ): { className: string; baseClass?: string; key?: string }[] {
        const results: { className: string; baseClass?: string; key?: string }[] = [];
        if (!sourceCode.includes('RegisterClass')) return results;

        const sourceFile = ts.createSourceFile(
            'test.js',
            sourceCode,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.JS
        );

        function visit(node: ts.Node): void {
            if (ts.isExpressionStatement(node)) {
                const expr = node.expression;
                if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                    if (ts.isIdentifier(expr.left) && ts.isCallExpression(expr.right)) {
                        const className = expr.left.text;
                        const callExpr = expr.right;
                        if (ts.isIdentifier(callExpr.expression) && callExpr.expression.text === '__decorate' &&
                            callExpr.arguments.length >= 1 && ts.isArrayLiteralExpression(callExpr.arguments[0])) {
                            for (const element of callExpr.arguments[0].elements) {
                                if (!ts.isCallExpression(element)) continue;
                                if (!ts.isIdentifier(element.expression) || element.expression.text !== 'RegisterClass') continue;

                                const info: { className: string; baseClass?: string; key?: string } = { className };
                                const args = element.arguments;
                                if (args.length > 0 && ts.isIdentifier(args[0])) {
                                    info.baseClass = args[0].text;
                                }
                                if (args.length > 1 && ts.isStringLiteral(args[1])) {
                                    info.key = args[1].text;
                                }
                                results.push(info);
                            }
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
        return results;
    }

    it('should detect RegisterClass in standard ESM compiled output', () => {
        const source = `
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length;
    return c;
};
import { BaseEntity } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";

let MJDashboardEntityExtended = class MJDashboardEntityExtended extends MJDashboardEntity {
    constructor() { super(); }
};
MJDashboardEntityExtended = __decorate([
    RegisterClass(BaseEntity, 'MJ: Dashboards')
], MJDashboardEntityExtended);
export { MJDashboardEntityExtended };
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MJDashboardEntityExtended');
        expect(results[0].baseClass).toBe('BaseEntity');
        expect(results[0].key).toBe('MJ: Dashboards');
    });

    it('should detect multiple RegisterClass decorators across classes', () => {
        const source = `
let UserEntity = class UserEntity extends BaseEntity {};
UserEntity = __decorate([
    RegisterClass(BaseEntity, 'Users')
], UserEntity);

let RoleEntity = class RoleEntity extends BaseEntity {};
RoleEntity = __decorate([
    RegisterClass(BaseEntity, 'Roles')
], RoleEntity);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(2);
        expect(results[0].className).toBe('UserEntity');
        expect(results[0].key).toBe('Users');
        expect(results[1].className).toBe('RoleEntity');
        expect(results[1].key).toBe('Roles');
    });

    it('should handle RegisterClass without a key argument', () => {
        const source = `
let MyAction = class MyAction extends BaseAction {};
MyAction = __decorate([
    RegisterClass(BaseAction)
], MyAction);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MyAction');
        expect(results[0].baseClass).toBe('BaseAction');
        expect(results[0].key).toBeUndefined();
    });

    it('should handle RegisterClass alongside other decorators', () => {
        const source = `
let MJTestEntity = class MJTestEntity extends BaseEntity {};
MJTestEntity = __decorate([
    SomeOtherDecorator(),
    RegisterClass(BaseEntity, 'Test Entities'),
    Injectable()
], MJTestEntity);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MJTestEntity');
        expect(results[0].baseClass).toBe('BaseEntity');
        expect(results[0].key).toBe('Test Entities');
    });

    it('should return empty for files without RegisterClass', () => {
        const source = `
let SimpleClass = class SimpleClass {};
SimpleClass = __decorate([
    Injectable()
], SimpleClass);
export { SimpleClass };
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(0);
    });

    it('should return empty for files with no __decorate calls', () => {
        const source = `
export class PlainClass {
    doSomething() { return 42; }
}
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(0);
    });

    it('should handle single-line minified output', () => {
        const source = `let Foo=class Foo extends Bar{};Foo=__decorate([RegisterClass(Bar,'Foos')],Foo);`;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('Foo');
        expect(results[0].baseClass).toBe('Bar');
        expect(results[0].key).toBe('Foos');
    });

    it('should handle double-quoted key strings', () => {
        const source = `
let MyEntity = class MyEntity extends BaseEntity {};
MyEntity = __decorate([
    RegisterClass(BaseEntity, "My Entities")
], MyEntity);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe('My Entities');
    });

    it('should handle keys with special characters like MJ: prefix', () => {
        const source = `
let AIAgentRunEntity = class AIAgentRunEntity extends BaseEntity {};
AIAgentRunEntity = __decorate([
    RegisterClass(BaseEntity, 'MJ: AI Agent Runs')
], AIAgentRunEntity);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('AIAgentRunEntity');
        expect(results[0].key).toBe('MJ: AI Agent Runs');
    });
});

describe('isPackageExcluded (logic test)', () => {
    // Re-implement the logic to test it since it's a private function
    function isPackageExcluded(packageName: string, excludePackages: string[]): boolean {
        return excludePackages.some(prefix => packageName.startsWith(prefix));
    }

    it('should exclude packages matching a prefix', () => {
        expect(isPackageExcluded('@memberjunction/core', ['@memberjunction'])).toBe(true);
    });

    it('should not exclude packages not matching any prefix', () => {
        expect(isPackageExcluded('lodash', ['@memberjunction'])).toBe(false);
    });

    it('should handle multiple prefixes', () => {
        expect(isPackageExcluded('@angular/core', ['@memberjunction', '@angular'])).toBe(true);
    });

    it('should return false for empty excludePackages', () => {
        expect(isPackageExcluded('@memberjunction/core', [])).toBe(false);
    });

    it('should handle exact match', () => {
        expect(isPackageExcluded('lodash', ['lodash'])).toBe(true);
    });

    it('should not match partial package names incorrectly', () => {
        expect(isPackageExcluded('lodash-es', ['lodash'])).toBe(true); // starts with lodash
        expect(isPackageExcluded('my-lodash', ['lodash'])).toBe(false); // doesn't start with lodash
    });
});

describe('Dependency reconciliation (logic tests)', () => {
    // Re-implement the core logic functions to test them since they're private

    function findMissingDependencies(
        manifestPackages: string[],
        currentDeps: Record<string, string>,
        depTreeVersions: Record<string, string>
    ): Record<string, string> {
        const missing: Record<string, string> = {};
        for (const pkg of manifestPackages) {
            if (currentDeps[pkg]) continue;
            const version = depTreeVersions[pkg];
            if (version) {
                missing[pkg] = version;
            }
        }
        return missing;
    }

    function sortObjectKeys(obj: Record<string, string>): Record<string, string> {
        const sorted: Record<string, string> = {};
        for (const key of Object.keys(obj).sort()) {
            sorted[key] = obj[key];
        }
        return sorted;
    }

    describe('findMissingDependencies', () => {
        it('should detect packages missing from dependencies', () => {
            const manifest = ['@memberjunction/ai-openai', '@memberjunction/ai-anthropic', '@memberjunction/core'];
            const currentDeps = { '@memberjunction/core': '5.2.0' };
            const versions = {
                '@memberjunction/ai-openai': '5.2.0',
                '@memberjunction/ai-anthropic': '5.2.0',
                '@memberjunction/core': '5.2.0'
            };
            const missing = findMissingDependencies(manifest, currentDeps, versions);
            expect(missing).toEqual({
                '@memberjunction/ai-openai': '5.2.0',
                '@memberjunction/ai-anthropic': '5.2.0'
            });
        });

        it('should return empty when all packages are already declared', () => {
            const manifest = ['@memberjunction/core', '@memberjunction/global'];
            const currentDeps = {
                '@memberjunction/core': '5.2.0',
                '@memberjunction/global': '5.2.0'
            };
            const versions = {
                '@memberjunction/core': '5.2.0',
                '@memberjunction/global': '5.2.0'
            };
            const missing = findMissingDependencies(manifest, currentDeps, versions);
            expect(Object.keys(missing)).toHaveLength(0);
        });

        it('should skip packages whose version cannot be resolved', () => {
            const manifest = ['@memberjunction/core', 'unknown-pkg'];
            const currentDeps = {};
            const versions = { '@memberjunction/core': '5.2.0' };
            const missing = findMissingDependencies(manifest, currentDeps, versions);
            expect(missing).toEqual({ '@memberjunction/core': '5.2.0' });
            expect(missing['unknown-pkg']).toBeUndefined();
        });

        it('should handle empty manifest packages', () => {
            const missing = findMissingDependencies([], { '@memberjunction/core': '5.2.0' }, {});
            expect(Object.keys(missing)).toHaveLength(0);
        });

        it('should handle empty current dependencies', () => {
            const manifest = ['@memberjunction/core'];
            const versions = { '@memberjunction/core': '5.2.0' };
            const missing = findMissingDependencies(manifest, {}, versions);
            expect(missing).toEqual({ '@memberjunction/core': '5.2.0' });
        });
    });

    describe('sortObjectKeys', () => {
        it('should sort keys alphabetically', () => {
            const input = { 'zebra': '1.0', 'alpha': '2.0', 'middle': '3.0' };
            const sorted = sortObjectKeys(input);
            expect(Object.keys(sorted)).toEqual(['alpha', 'middle', 'zebra']);
        });

        it('should sort scoped package names correctly', () => {
            const input = {
                '@memberjunction/core': '5.2.0',
                '@memberjunction/ai-openai': '5.2.0',
                '@memberjunction/actions': '5.2.0'
            };
            const sorted = sortObjectKeys(input);
            expect(Object.keys(sorted)).toEqual([
                '@memberjunction/actions',
                '@memberjunction/ai-openai',
                '@memberjunction/core'
            ]);
        });

        it('should handle empty object', () => {
            expect(Object.keys(sortObjectKeys({}))).toHaveLength(0);
        });

        it('should preserve values', () => {
            const input = { 'b': '2.0', 'a': '1.0' };
            const sorted = sortObjectKeys(input);
            expect(sorted['a']).toBe('1.0');
            expect(sorted['b']).toBe('2.0');
        });
    });
});

// ============================================================================
// Integration tests: exercise the real generateClassRegistrationsManifest
// function with a virtual filesystem to verify the syncDependencies feature.
// ============================================================================

describe('generateClassRegistrationsManifest - syncDependencies integration', () => {
    /**
     * Virtual filesystem: path → file content.
     * existsSync checks this map; readFileSync returns from it.
     */
    let virtualFiles: Record<string, string>;

    /** Captures every writeFileSync call for assertions. */
    let writtenFiles: Array<{ path: string; content: string }>;

    // Use platform-resolved absolute paths so virtualFiles keys match what
    // the function-under-test sees after `path.resolve()` / `path.join()` —
    // on Windows this becomes `C:/test-app/...`, on Unix `/test-app/...`.
    // We always normalize backslashes to forward slashes (see `norm` below)
    // so virtualFiles keys can be written with one consistent style.
    const appDir = path.resolve('/test-app').replace(/\\/g, '/');
    const outputPath = `${appDir}/src/generated/manifest.ts`;

    /**
     * Builds a minimal dependency graph where:
     *   test-app → @test/bundle → @test/provider (has @RegisterClass)
     *
     * @test/provider is a TRANSITIVE dependency — it is NOT listed in
     * test-app's direct dependencies. This is the scenario from issue #2008.
     */
    function setupVirtualFileSystem(): void {
        virtualFiles = {
            // App package.json — only @test/bundle is a direct dependency
            [`${appDir}/package.json`]: JSON.stringify({
                name: 'test-app',
                dependencies: { '@test/bundle': '1.0.0' }
            }, null, 2),

            // Bundle package — depends on @test/provider transitively
            [`${appDir}/node_modules/@test/bundle/package.json`]: JSON.stringify({
                name: '@test/bundle',
                version: '1.0.0',
                dependencies: { '@test/provider': '1.0.0' }
            }),

            // Provider package — has @RegisterClass but is NOT a direct dep
            [`${appDir}/node_modules/@test/provider/package.json`]: JSON.stringify({
                name: '@test/provider',
                version: '1.0.0',
                dependencies: {}
            }),

            // Provider source with @RegisterClass decorator
            [`${appDir}/node_modules/@test/provider/src/provider.ts`]: [
                "import { RegisterClass } from '@memberjunction/global';",
                "@RegisterClass(BaseProvider, 'TestProvider')",
                "export class TestProvider extends BaseProvider {}"
            ].join('\n'),
        };
    }

    // Normalize path separators so the virtual filesystem (forward-slash keys)
    // can be looked up with paths that node's `path.join` may have produced
    // with backslashes on Windows.
    const norm = (p: string) => p.replace(/\\/g, '/');

    beforeEach(() => {
        vi.clearAllMocks();
        writtenFiles = [];
        setupVirtualFileSystem();

        // existsSync: true for files in virtualFiles or directories containing them
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = norm(p.toString());
            if (pathStr in virtualFiles) return true;
            // Directory check: exists if any file lives under it
            return Object.keys(virtualFiles).some(f => f.startsWith(pathStr + '/'));
        });

        // readFileSync: return content from virtual filesystem
        vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = norm(p.toString());
            if (pathStr in virtualFiles) return virtualFiles[pathStr] as string & Buffer;
            const err = new Error(`ENOENT: no such file or directory, open '${pathStr}'`);
            (err as NodeJS.ErrnoException).code = 'ENOENT';
            throw err;
        });

        // writeFileSync: capture all writes (normalize so test assertions match
        // the forward-slash paths used in virtualFiles keys)
        vi.mocked(fs.writeFileSync).mockImplementation((p: fs.PathLike, content: string | NodeJS.ArrayBufferView) => {
            writtenFiles.push({ path: norm(p.toString()), content: content.toString() });
        });

        vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as unknown as string);
        vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) => norm(p.toString()) as string & Buffer);

        // glob: return .ts source files under the requested cwd
        vi.mocked(glob).mockImplementation(async (_pattern: string | string[], opts?: Record<string, unknown>) => {
            const cwd = norm((opts?.cwd as string) || '');
            return Object.keys(virtualFiles).filter(
                f => f.startsWith(cwd + '/') && f.endsWith('.ts') && !f.endsWith('.d.ts')
            );
        });
    });

    it('should add missing transitive dependencies to package.json', async () => {
        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: true,
        });

        expect(result.success).toBe(true);
        expect(result.AddedDependencies).toEqual({ '@test/provider': '1.0.0' });

        // Verify package.json was rewritten with the added dependency
        const pkgWrite = writtenFiles.find(w => w.path === `${appDir}/package.json`);
        expect(pkgWrite).toBeDefined();
        const updatedPkg = JSON.parse(pkgWrite!.content);
        expect(updatedPkg.dependencies['@test/bundle']).toBe('1.0.0');
        expect(updatedPkg.dependencies['@test/provider']).toBe('1.0.0');
    });

    it('should NOT modify package.json when syncDependencies is false', async () => {
        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: false,
        });

        expect(result.success).toBe(true);
        expect(result.AddedDependencies).toEqual({});

        // package.json should NOT have been written
        const pkgWrite = writtenFiles.find(w => w.path === `${appDir}/package.json`);
        expect(pkgWrite).toBeUndefined();
    });

    it('should report no additions when all deps are already declared', async () => {
        // Pre-declare @test/provider in the app's direct dependencies
        virtualFiles[`${appDir}/package.json`] = JSON.stringify({
            name: 'test-app',
            dependencies: {
                '@test/bundle': '1.0.0',
                '@test/provider': '1.0.0'
            }
        }, null, 2);

        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: true,
        });

        expect(result.success).toBe(true);
        expect(result.AddedDependencies).toEqual({});

        // package.json should NOT have been rewritten
        const pkgWrite = writtenFiles.find(w => w.path === `${appDir}/package.json`);
        expect(pkgWrite).toBeUndefined();
    });

    it('should sort dependencies alphabetically after adding', async () => {
        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: true,
        });

        expect(result.success).toBe(true);

        const pkgWrite = writtenFiles.find(w => w.path === `${appDir}/package.json`);
        expect(pkgWrite).toBeDefined();
        const updatedPkg = JSON.parse(pkgWrite!.content);
        const depKeys = Object.keys(updatedPkg.dependencies);
        // @test/bundle and @test/provider should be in sorted order
        expect(depKeys).toEqual([...depKeys].sort());
    });

    it('should include the provider class in the generated manifest', async () => {
        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: true,
        });

        expect(result.success).toBe(true);
        // The manifest should contain the @RegisterClass class from the transitive dep
        expect(result.classes.length).toBeGreaterThanOrEqual(1);
        expect(result.classes.some(c => c.className === 'TestProvider')).toBe(true);
        expect(result.classes.some(c => c.packageName === '@test/provider')).toBe(true);

        // The manifest file should have been written with the import
        const manifestWrite = writtenFiles.find(w => w.path === outputPath);
        expect(manifestWrite).toBeDefined();
        expect(manifestWrite!.content).toContain("import {");
        expect(manifestWrite!.content).toContain("TestProvider");
        expect(manifestWrite!.content).toContain("@test/provider");
    });
});

// =============================================================================
// scanDist Opt-In Integration Tests
// =============================================================================
// These tests verify that dist/ scanning only happens when --scan-dist is
// explicitly enabled, and that src/ is always preferred over dist/.
// =============================================================================

describe('generateClassRegistrationsManifest - scanDist opt-in', () => {
    let virtualFiles: Record<string, string>;
    let writtenFiles: Array<{ path: string; content: string }>;
    const appDir = path.resolve('/test-scan-dist').replace(/\\/g, '/');
    const outputPath = `${appDir}/src/generated/manifest.ts`;

    function setupDistOnlyPackage(): void {
        virtualFiles = {
            // App package.json
            [`${appDir}/package.json`]: JSON.stringify({
                name: 'test-scan-dist-app',
                dependencies: { '@test/dist-only': '1.0.0' }
            }, null, 2),

            // Package with ONLY dist/ (no src/) — simulates npm-published package
            [`${appDir}/node_modules/@test/dist-only/package.json`]: JSON.stringify({
                name: '@test/dist-only',
                version: '1.0.0',
                types: './dist/index.d.ts',
                dependencies: {}
            }),

            // Compiled JS file in dist/ with __decorate pattern
            [`${appDir}/node_modules/@test/dist-only/dist/index.js`]: [
                'var __decorate = (this && this.__decorate) || function (d, t, k, desc) { return t; };',
                'import { RegisterClass } from "@memberjunction/global";',
                'let DistOnlyClass = class DistOnlyClass extends BaseEntity {};',
                'DistOnlyClass = __decorate([',
                "    RegisterClass(BaseEntity, 'Dist Only Items')",
                '], DistOnlyClass);',
                'export { DistOnlyClass };',
            ].join('\n'),

            // Type declarations needed for export verification
            [`${appDir}/node_modules/@test/dist-only/dist/index.d.ts`]:
                'export declare class DistOnlyClass extends BaseEntity {}\n',
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        writtenFiles = [];
        setupDistOnlyPackage();

        // Normalize path separators so the forward-slash virtualFiles keys
        // resolve regardless of platform (Windows path.join produces backslashes).
        const norm = (p: string) => p.replace(/\\/g, '/');

        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = norm(p.toString());
            if (pathStr in virtualFiles) return true;
            return Object.keys(virtualFiles).some(f => f.startsWith(pathStr + '/'));
        });

        vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = norm(p.toString());
            if (pathStr in virtualFiles) return virtualFiles[pathStr] as string & Buffer;
            const err = new Error(`ENOENT: no such file or directory, open '${pathStr}'`);
            (err as NodeJS.ErrnoException).code = 'ENOENT';
            throw err;
        });

        vi.mocked(fs.writeFileSync).mockImplementation((p: fs.PathLike, content: string | NodeJS.ArrayBufferView) => {
            writtenFiles.push({ path: norm(p.toString()), content: content.toString() });
        });

        vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as unknown as string);
        vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) => norm(p.toString()) as string & Buffer);

        // glob: return matching files under the requested cwd based on pattern
        vi.mocked(glob).mockImplementation(async (_pattern: string | string[], opts?: Record<string, unknown>) => {
            const cwd = norm((opts?.cwd as string) || '');
            const patternStr = Array.isArray(_pattern) ? _pattern.join(',') : _pattern;
            const wantsTS = patternStr.includes('.ts');
            const wantsJS = patternStr.includes('js'); // matches .js, .mjs, .cjs, and {js,mjs,cjs}
            return Object.keys(virtualFiles).filter(f => {
                if (!f.startsWith(cwd + '/')) return false;
                if (wantsTS && f.endsWith('.ts') && !f.endsWith('.d.ts')) return true;
                if (wantsJS && (f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs')) && !f.endsWith('.d.ts')) return true;
                return false;
            });
        });
    });

    it('should NOT find classes from dist/ when scanDist is false (default)', async () => {
        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: false,
        });
        expect(result.success).toBe(true);
        expect(result.classes.some(c => c.className === 'DistOnlyClass')).toBe(false);
    });

    it('should find classes from dist/ when scanDist is true', async () => {
        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: false,
            scanDist: true,
        });
        expect(result.success).toBe(true);
        expect(result.classes.some(c => c.className === 'DistOnlyClass')).toBe(true);
        expect(result.classes.some(c => c.packageName === '@test/dist-only')).toBe(true);
    });

    it('should prefer src/ over dist/ even when scanDist is true', async () => {
        // Add src/ directory with a different class to the same package
        virtualFiles[`${appDir}/node_modules/@test/dist-only/src/index.ts`] = [
            "import { RegisterClass } from '@memberjunction/global';",
            "@RegisterClass(BaseEntity, 'Src Items')",
            "export class SrcOnlyClass extends BaseEntity {}"
        ].join('\n');
        // Update .d.ts to export the src class (as a real build would)
        virtualFiles[`${appDir}/node_modules/@test/dist-only/dist/index.d.ts`] =
            'export declare class SrcOnlyClass extends BaseEntity {}\n';

        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: false,
            scanDist: true,
        });
        expect(result.success).toBe(true);
        // Should find the TS source class, not the dist class
        expect(result.classes.some(c => c.className === 'SrcOnlyClass')).toBe(true);
        expect(result.classes.some(c => c.className === 'DistOnlyClass')).toBe(false);
    });
});

// =============================================================================
// Lazy Config Generation Tests
// =============================================================================

describe('resolveSubpathExports', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return empty map for package with no exports field', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            name: '@test/no-exports',
            main: './dist/index.js'
        }) as string & Buffer);

        const result = resolveSubpathExports('/test/pkg');
        expect(result.size).toBe(0);
    });

    it('should return empty map for package with only main entry', () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            name: '@test/main-only',
            exports: {
                '.': { types: './dist/index.d.ts', default: './dist/index.js' }
            }
        }) as string & Buffer);

        const result = resolveSubpathExports('/test/pkg');
        expect(result.size).toBe(0);
    });

    it('should collect class names from subpath .d.ts files', () => {
        const pkgJson = JSON.stringify({
            name: '@test/dashboards',
            exports: {
                '.': { types: './dist/public-api.d.ts', default: './dist/public-api.js' },
                './feature-a.module': { types: './dist/feature-a.module.d.ts', default: './dist/feature-a.module.js' }
            }
        });
        const featureDts = 'export declare class FeatureAComponent {}\nexport declare class FeatureBComponent {}\n';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = p.toString();
            if (pathStr.endsWith('package.json')) return pkgJson as string & Buffer;
            if (pathStr.endsWith('feature-a.module.d.ts')) return featureDts as string & Buffer;
            return '{}' as string & Buffer;
        });

        const result = resolveSubpathExports('/test/pkg');
        expect(result.size).toBe(1);
        expect(result.has('./feature-a.module')).toBe(true);
        const names = result.get('./feature-a.module')!;
        expect(names.has('FeatureAComponent')).toBe(true);
        expect(names.has('FeatureBComponent')).toBe(true);
    });

    it('should follow import * as patterns in Angular module .d.ts files', () => {
        const pkgJson = JSON.stringify({
            name: '@test/dashboards',
            exports: {
                '.': { types: './dist/public-api.d.ts', default: './dist/public-api.js' },
                './ai.module': { types: './dist/ai.module.d.ts', default: './dist/ai.module.js' }
            }
        });
        // Angular module .d.ts uses import * as iN pattern
        const moduleDts = [
            'import * as i0 from "@angular/core";',
            'import * as i1 from "./components/model.component";',
            'import * as i2 from "./components/agent.component";',
            'export declare class AIDashboardsModule {}',
        ].join('\n');
        const modelDts = 'export declare class ModelComponent {}\n';
        const agentDts = 'export declare class AgentComponent {}\n';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = p.toString();
            if (pathStr.endsWith('package.json')) return pkgJson as string & Buffer;
            if (pathStr.endsWith('ai.module.d.ts')) return moduleDts as string & Buffer;
            if (pathStr.endsWith('model.component.d.ts')) return modelDts as string & Buffer;
            if (pathStr.endsWith('agent.component.d.ts')) return agentDts as string & Buffer;
            return '' as string & Buffer;
        });

        const result = resolveSubpathExports('/test/pkg');
        expect(result.size).toBe(1);
        const names = result.get('./ai.module')!;
        expect(names.has('AIDashboardsModule')).toBe(true);
        expect(names.has('ModelComponent')).toBe(true);
        expect(names.has('AgentComponent')).toBe(true);
    });

    it('should skip subpaths without types field', () => {
        const pkgJson = JSON.stringify({
            name: '@test/pkg',
            exports: {
                '.': { types: './dist/index.d.ts', default: './dist/index.js' },
                './no-types': { default: './dist/no-types.js' }
            }
        });

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(pkgJson as string & Buffer);

        const result = resolveSubpathExports('/test/pkg');
        expect(result.size).toBe(0);
    });

    it('should handle circular re-exports without infinite loop', () => {
        const pkgJson = JSON.stringify({
            name: '@test/circular',
            exports: {
                '.': { types: './dist/index.d.ts', default: './dist/index.js' },
                './a': { types: './dist/a.d.ts', default: './dist/a.js' }
            }
        });
        // a.d.ts re-exports from b.d.ts which re-exports from a.d.ts
        const aDts = 'export * from "./b";\nexport declare class ClassA {}\n';
        const bDts = 'export * from "./a";\nexport declare class ClassB {}\n';

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = p.toString();
            if (pathStr.endsWith('package.json')) return pkgJson as string & Buffer;
            if (pathStr.endsWith('a.d.ts')) return aDts as string & Buffer;
            if (pathStr.endsWith('b.d.ts')) return bDts as string & Buffer;
            return '' as string & Buffer;
        });

        // Should not hang or throw
        const result = resolveSubpathExports('/test/pkg');
        expect(result.size).toBe(1);
        const names = result.get('./a')!;
        expect(names.has('ClassA')).toBe(true);
        expect(names.has('ClassB')).toBe(true);
    });
});

describe('Lazy Config Generation - Integration', () => {
    let virtualFiles: Record<string, string>;
    let writtenFiles: Array<{ path: string; content: string }>;
    const appDir = path.resolve('/test-lazy').replace(/\\/g, '/');
    const outputPath = `${appDir}/src/generated/manifest.ts`;
    const lazyConfigPath = `${appDir}/src/generated/lazy-config.ts`;

    function setupLazyTestFiles(): void {
        virtualFiles = {
            // App package.json — depends on an excluded package with subpath exports
            [`${appDir}/package.json`]: JSON.stringify({
                name: 'test-lazy-app',
                dependencies: { '@test/dashboards': '1.0.0' }
            }, null, 2),

            // Excluded package with subpath exports
            [`${appDir}/node_modules/@test/dashboards/package.json`]: JSON.stringify({
                name: '@test/dashboards',
                version: '1.0.0',
                exports: {
                    '.': { types: './dist/public-api.d.ts', default: './dist/public-api.js' },
                    './ai.module': { types: './dist/ai.module.d.ts', default: './dist/ai.module.js' },
                    './actions.module': { types: './dist/actions.module.d.ts', default: './dist/actions.module.js' }
                },
                dependencies: {}
            }),

            // AI module .d.ts with Angular-style import pattern
            [`${appDir}/node_modules/@test/dashboards/dist/ai.module.d.ts`]: [
                'import * as i0 from "@angular/core";',
                'import * as i1 from "./ai/model.component";',
                'export declare class AIDashboardsModule {}',
            ].join('\n'),

            [`${appDir}/node_modules/@test/dashboards/dist/ai/model.component.d.ts`]:
                'export declare class ModelComponent extends BaseResourceComponent {}\n',

            // Actions module .d.ts
            [`${appDir}/node_modules/@test/dashboards/dist/actions.module.d.ts`]:
                'import * as i0 from "./actions/overview.component";\nexport declare class ActionsModule {}\n',

            [`${appDir}/node_modules/@test/dashboards/dist/actions/overview.component.d.ts`]:
                'export declare class OverviewComponent extends BaseResourceComponent {}\n',

            // Public API .d.ts
            [`${appDir}/node_modules/@test/dashboards/dist/public-api.d.ts`]:
                'export {};\n',

            // Source files with @RegisterClass
            [`${appDir}/node_modules/@test/dashboards/src/ai/model.component.ts`]: [
                "import { RegisterClass } from '@memberjunction/global';",
                "@RegisterClass(BaseResourceComponent, 'AIModels')",
                "export class ModelComponent extends BaseResourceComponent {}"
            ].join('\n'),

            [`${appDir}/node_modules/@test/dashboards/src/actions/overview.component.ts`]: [
                "import { RegisterClass } from '@memberjunction/global';",
                "@RegisterClass(BaseResourceComponent, 'ActionsOverview')",
                "export class OverviewComponent extends BaseResourceComponent {}"
            ].join('\n'),
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        writtenFiles = [];
        setupLazyTestFiles();

        // Normalize backslashes so virtualFiles keys (forward-slash) resolve
        // when path.join produces Windows-style paths.
        const norm = (p: string) => p.replace(/\\/g, '/');

        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = norm(p.toString());
            if (pathStr in virtualFiles) return true;
            return Object.keys(virtualFiles).some(f => f.startsWith(pathStr + '/'));
        });

        vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = norm(p.toString());
            if (pathStr in virtualFiles) return virtualFiles[pathStr] as string & Buffer;
            const err = new Error(`ENOENT: no such file or directory, open '${pathStr}'`);
            (err as NodeJS.ErrnoException).code = 'ENOENT';
            throw err;
        });

        vi.mocked(fs.writeFileSync).mockImplementation((p: fs.PathLike, content: string | NodeJS.ArrayBufferView) => {
            writtenFiles.push({ path: norm(p.toString()), content: content.toString() });
        });

        vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as unknown as string);
        vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) => norm(p.toString()) as string & Buffer);

        vi.mocked(glob).mockImplementation(async (_pattern: string | string[], opts?: Record<string, unknown>) => {
            const cwd = norm((opts?.cwd as string) || '');
            return Object.keys(virtualFiles).filter(
                f => f.startsWith(cwd + '/') && f.endsWith('.ts') && !f.endsWith('.d.ts')
            );
        });

        // Mock glob.sync for the lazy config scanner (findSourceFilesSync/findDistFilesSync)
        const mockedGlob = vi.mocked(glob) as unknown as { sync: ReturnType<typeof vi.fn> };
        mockedGlob.sync.mockImplementation((_pattern: string, opts?: Record<string, unknown>) => {
            const syncCwd = norm((opts?.cwd as string) || '');
            return Object.keys(virtualFiles).filter(
                f => f.startsWith(syncCwd + '/') && f.endsWith('.ts') && !f.endsWith('.d.ts')
            );
        });
    });

    it('should generate lazy config with keys grouped by subpath', async () => {
        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: false,
            excludePackages: ['@test/dashboards'],
            lazyConfigPath,
            lazyBaseClasses: ['BaseResourceComponent'],
        });

        expect(result.success).toBe(true);
        expect(result.LazyConfigChanged).toBe(true);

        const lazyWrite = writtenFiles.find(w => w.path === lazyConfigPath);
        expect(lazyWrite).toBeDefined();
        const content = lazyWrite!.content;

        // Should contain both compound keys (BaseClassName::Key format)
        expect(content).toContain("'BaseResourceComponent::AIModels'");
        expect(content).toContain("'BaseResourceComponent::ActionsOverview'");

        // Should have correct import paths
        expect(content).toContain("@test/dashboards/ai.module");
        expect(content).toContain("@test/dashboards/actions.module");

        // Should have LAZY_FEATURE_CONFIG export
        expect(content).toContain('export const LAZY_FEATURE_CONFIG');
        expect(content).toContain('export const LAZY_FEATURE_CONFIG_COUNT');
    });

    it('should not generate lazy config when lazyConfigPath is not set', async () => {
        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: false,
            excludePackages: ['@test/dashboards'],
        });

        expect(result.success).toBe(true);
        expect(result.LazyConfigChanged).toBe(false);

        const lazyWrite = writtenFiles.find(w => w.path === lazyConfigPath);
        expect(lazyWrite).toBeUndefined();
    });

    it('should detect key collisions across subpaths', async () => {
        // Add a duplicate key in the actions module
        virtualFiles[`${appDir}/node_modules/@test/dashboards/src/actions/overview.component.ts`] = [
            "import { RegisterClass } from '@memberjunction/global';",
            "@RegisterClass(BaseResourceComponent, 'AIModels')", // Same key as AI module!
            "export class OverviewComponent extends BaseResourceComponent {}"
        ].join('\n');

        const result = await generateClassRegistrationsManifest({
            outputPath,
            appDir,
            verbose: false,
            syncDependencies: false,
            excludePackages: ['@test/dashboards'],
            lazyConfigPath,
            lazyBaseClasses: ['BaseResourceComponent'],
        });

        // Should report an error for the collision
        expect(result.errors.some(e => e.includes('collision') || e.includes('AIModels'))).toBe(true);
    });
});
