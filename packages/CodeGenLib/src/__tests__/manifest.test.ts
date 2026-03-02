import { describe, it, expect, vi, beforeEach } from 'vitest';
import ts from 'typescript';
import * as fs from 'fs';
import { glob } from 'glob';
import { generateClassRegistrationsManifest } from '../Manifest/GenerateClassRegistrationsManifest';

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

vi.mock('glob', () => ({
    glob: vi.fn().mockResolvedValue([]),
    globSync: vi.fn().mockReturnValue([])
}));

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
        } = {
            outputPath: './manifest.ts',
            verbose: true,
            excludePackages: ['@memberjunction'],
            syncDependencies: true
        };
        expect(options.outputPath).toBe('./manifest.ts');
        expect(options.excludePackages).toContain('@memberjunction');
        expect(options.syncDependencies).toBe(true);
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

    const appDir = '/test-app';
    const outputPath = '/test-app/src/generated/manifest.ts';

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

    beforeEach(() => {
        vi.clearAllMocks();
        writtenFiles = [];
        setupVirtualFileSystem();

        // existsSync: true for files in virtualFiles or directories containing them
        vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = p.toString();
            if (pathStr in virtualFiles) return true;
            // Directory check: exists if any file lives under it
            return Object.keys(virtualFiles).some(f => f.startsWith(pathStr + '/'));
        });

        // readFileSync: return content from virtual filesystem
        vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathLike) => {
            const pathStr = p.toString();
            if (pathStr in virtualFiles) return virtualFiles[pathStr] as string & Buffer;
            const err = new Error(`ENOENT: no such file or directory, open '${pathStr}'`);
            (err as NodeJS.ErrnoException).code = 'ENOENT';
            throw err;
        });

        // writeFileSync: capture all writes
        vi.mocked(fs.writeFileSync).mockImplementation((p: fs.PathLike, content: string | NodeJS.ArrayBufferView) => {
            writtenFiles.push({ path: p.toString(), content: content.toString() });
        });

        vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as unknown as string);
        vi.mocked(fs.realpathSync).mockImplementation((p: fs.PathLike) => p.toString() as string & Buffer);

        // glob: return .ts source files under the requested cwd
        vi.mocked(glob).mockImplementation(async (_pattern: string | string[], opts?: Record<string, unknown>) => {
            const cwd = (opts?.cwd as string) || '';
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
