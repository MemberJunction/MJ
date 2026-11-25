import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    TopologicallySortPackagesForTest,
    WalkDependencyTreeForTest,
    GenerateClassRegistrationsManifest,
    ClearManifestASTCache,
    GetManifestASTCacheStats,
    LoadManifestASTCacheFromDisk,
    SaveManifestASTCacheToDisk,
    ResolveDefaultAstCachePath,
    MAX_AST_CACHE_ENTRIES,
} from '../Manifest/GenerateClassRegistrationsManifest';

describe('Wave 4.6 - Manifest Generator Enhancements', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-manifest-w46-'));
        ClearManifestASTCache();
    });

    afterEach(() => {
        ClearManifestASTCache();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // Best effort cleanup
        }
    });

    describe('TopologicallySortPackagesForTest', () => {
        it('orders peerDependencies before dependents and overcomes alphabetical tiebreaks', () => {
            // @memberjunction/alpha-consumer peer-depends on @memberjunction/zeta-provider.
            // Alphabetically, alpha < zeta. Topologically, zeta MUST come before alpha!
            const alphaDir = path.join(tempDir, 'alpha-consumer');
            const zetaDir = path.join(tempDir, 'zeta-provider');

            fs.mkdirSync(alphaDir, { recursive: true });
            fs.mkdirSync(zetaDir, { recursive: true });

            fs.writeFileSync(
                path.join(alphaDir, 'package.json'),
                JSON.stringify({
                    name: '@memberjunction/alpha-consumer',
                    version: '1.0.0',
                    peerDependencies: {
                        '@memberjunction/zeta-provider': '^1.0.0'
                    }
                }),
                'utf-8'
            );

            fs.writeFileSync(
                path.join(zetaDir, 'package.json'),
                JSON.stringify({
                    name: '@memberjunction/zeta-provider',
                    version: '1.0.0'
                }),
                'utf-8'
            );

            const packageMap = new Map<string, string[]>([
                ['@memberjunction/alpha-consumer', ['AlphaClass']],
                ['@memberjunction/zeta-provider', ['ZetaClass']]
            ]);

            const depTree = new Map<string, string>([
                ['@memberjunction/alpha-consumer', alphaDir],
                ['@memberjunction/zeta-provider', zetaDir]
            ]);

            const sorted = TopologicallySortPackagesForTest(packageMap, depTree);

            expect(sorted).toEqual([
                '@memberjunction/zeta-provider',
                '@memberjunction/alpha-consumer'
            ]);
        });

        it('orders Angular library @memberjunction/ng-child after its peer-dep @memberjunction/ng-base', () => {
            const baseDir = path.join(tempDir, 'ng-base');
            const childDir = path.join(tempDir, 'ng-child');

            fs.mkdirSync(baseDir, { recursive: true });
            fs.mkdirSync(childDir, { recursive: true });

            fs.writeFileSync(
                path.join(baseDir, 'package.json'),
                JSON.stringify({
                    name: '@memberjunction/ng-base',
                    version: '1.0.0'
                }),
                'utf-8'
            );

            fs.writeFileSync(
                path.join(childDir, 'package.json'),
                JSON.stringify({
                    name: '@memberjunction/ng-child',
                    version: '1.0.0',
                    peerDependencies: {
                        '@memberjunction/ng-base': '^1.0.0'
                    }
                }),
                'utf-8'
            );

            const packageMap = new Map<string, string[]>([
                ['@memberjunction/ng-child', ['ChildComponent']],
                ['@memberjunction/ng-base', ['BaseComponent']]
            ]);

            const depTree = new Map<string, string>([
                ['@memberjunction/ng-base', baseDir],
                ['@memberjunction/ng-child', childDir]
            ]);

            const sorted = TopologicallySortPackagesForTest(packageMap, depTree);

            expect(sorted).toEqual([
                '@memberjunction/ng-base',
                '@memberjunction/ng-child'
            ]);
        });

        it('handles a package listing the same dependency in both dependencies and peerDependencies without duplicating counts or breaking Kahn sort', () => {
            const coreDir = path.join(tempDir, 'core');
            const dualDir = path.join(tempDir, 'dual-dep');

            fs.mkdirSync(coreDir, { recursive: true });
            fs.mkdirSync(dualDir, { recursive: true });

            fs.writeFileSync(
                path.join(coreDir, 'package.json'),
                JSON.stringify({
                    name: '@memberjunction/core',
                    version: '1.0.0'
                }),
                'utf-8'
            );

            // Lists @memberjunction/core in BOTH dependencies and peerDependencies
            fs.writeFileSync(
                path.join(dualDir, 'package.json'),
                JSON.stringify({
                    name: '@memberjunction/dual-dep',
                    version: '1.0.0',
                    dependencies: {
                        '@memberjunction/core': '1.0.0'
                    },
                    peerDependencies: {
                        '@memberjunction/core': '^1.0.0'
                    }
                }),
                'utf-8'
            );

            const packageMap = new Map<string, string[]>([
                ['@memberjunction/dual-dep', ['DualClass']],
                ['@memberjunction/core', ['CoreClass']]
            ]);

            const depTree = new Map<string, string>([
                ['@memberjunction/core', coreDir],
                ['@memberjunction/dual-dep', dualDir]
            ]);

            const sorted = TopologicallySortPackagesForTest(packageMap, depTree);

            expect(sorted).toEqual([
                '@memberjunction/core',
                '@memberjunction/dual-dep'
            ]);
        });
    });

    describe('WalkDependencyTreeForTest', () => {
        it('upgrades a nested node_modules path to a live workspace directory when discovered via another dependency branch', () => {
            // Structure:
            // tempDir/
            //   packages/
            //     shared-lib/   (live workspace package: no /node_modules/ or /.pnpm/ in realpath)
            //   apps/
            //     my-app/
            //       node_modules/
            //         pkg-a/
            //           package.json (deps: { "shared-lib": "1.0.0" })
            //           node_modules/
            //             shared-lib/  (nested tarball copy: has /node_modules/ in path)
            //               package.json
            //         pkg-b/
            //           package.json (deps: { "shared-lib": "1.0.0" })
            //           node_modules/
            //             shared-lib -> symlink to packages/shared-lib
            const workspaceDir = path.join(tempDir, 'workspace');
            const liveSharedDir = path.join(workspaceDir, 'packages', 'shared-lib');
            const appDir = path.join(workspaceDir, 'apps', 'my-app');
            const pkgADir = path.join(appDir, 'node_modules', 'pkg-a');
            const nestedSharedDir = path.join(pkgADir, 'node_modules', 'shared-lib');
            const pkgBDir = path.join(appDir, 'node_modules', 'pkg-b');
            const pkgBNodeModules = path.join(pkgBDir, 'node_modules');

            fs.mkdirSync(liveSharedDir, { recursive: true });
            fs.mkdirSync(nestedSharedDir, { recursive: true });
            fs.mkdirSync(pkgBNodeModules, { recursive: true });

            // 1. Live workspace shared-lib package.json
            fs.writeFileSync(
                path.join(liveSharedDir, 'package.json'),
                JSON.stringify({ name: 'shared-lib', version: '2.0.0-workspace' }),
                'utf-8'
            );

            // 2. Nested tarball shared-lib package.json
            fs.writeFileSync(
                path.join(nestedSharedDir, 'package.json'),
                JSON.stringify({ name: 'shared-lib', version: '1.0.0-tarball' }),
                'utf-8'
            );

            // 3. pkg-a depending on shared-lib (resolves to nestedSharedDir first)
            fs.writeFileSync(
                path.join(pkgADir, 'package.json'),
                JSON.stringify({
                    name: 'pkg-a',
                    version: '1.0.0',
                    dependencies: { 'shared-lib': '1.0.0' }
                }),
                'utf-8'
            );

            // 4. pkg-b depending on shared-lib with symlink pointing to live workspace shared-lib
            fs.writeFileSync(
                path.join(pkgBDir, 'package.json'),
                JSON.stringify({
                    name: 'pkg-b',
                    version: '1.0.0',
                    dependencies: { 'shared-lib': '1.0.0' }
                }),
                'utf-8'
            );
            fs.symlinkSync(liveSharedDir, path.join(pkgBNodeModules, 'shared-lib'), 'dir');

            // 5. Root my-app depending on pkg-a (first) and pkg-b (second)
            fs.writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify({
                    name: 'my-app',
                    version: '1.0.0',
                    dependencies: {
                        'pkg-a': '1.0.0',
                        'pkg-b': '1.0.0'
                    }
                }),
                'utf-8'
            );

            const logs: string[] = [];
            const result = WalkDependencyTreeForTest(appDir, (msg: string) => logs.push(msg));

            const resolvedShared = result.get('shared-lib');
            expect(resolvedShared).toBeDefined();

            // Must have upgraded to the live workspace package realpath!
            const realLiveSharedDir = fs.realpathSync(liveSharedDir);
            expect(resolvedShared).toBe(realLiveSharedDir);
            expect(resolvedShared).not.toContain('node_modules');

            // Verify the upgrade log was recorded
            const upgradeLog = logs.find(l => l.includes('Preferring workspace source for shared-lib'));
            expect(upgradeLog).toBeDefined();
        });
    });

    describe('Deterministic AST Cache for @RegisterClass', () => {
        it('hits AST cache on second GenerateClassRegistrationsManifest run, invalidates on modification, and round-trips disk persistence', async () => {
            // Setup a minimal valid package tree with @RegisterClass
            const appDir = path.join(tempDir, 'app');
            const pkgDir = path.join(tempDir, 'my-pkg');
            const pkgSrcDir = path.join(pkgDir, 'src');
            const manifestOut = path.join(appDir, 'src', 'generated', 'manifest.ts');
            const cacheFilePath = path.join(tempDir, 'ast-cache.json');

            fs.mkdirSync(pkgSrcDir, { recursive: true });
            fs.mkdirSync(path.join(appDir, 'node_modules'), { recursive: true });

            const entityFilePath = path.join(pkgSrcDir, 'MyEntity.ts');
            fs.writeFileSync(
                entityFilePath,
                `import { RegisterClass } from '@memberjunction/global';
@RegisterClass(BaseEntity, 'MyFirstEntity')
export class MyFirstEntity {}
`,
                'utf-8'
            );

            fs.writeFileSync(
                path.join(pkgDir, 'package.json'),
                JSON.stringify({
                    name: 'my-pkg',
                    version: '1.0.0'
                }),
                'utf-8'
            );

            // Symlink pkgDir into appDir/node_modules/my-pkg
            fs.symlinkSync(pkgDir, path.join(appDir, 'node_modules', 'my-pkg'), 'dir');

            fs.writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify({
                    name: 'app',
                    version: '1.0.0',
                    dependencies: {
                        'my-pkg': '1.0.0'
                    }
                }),
                'utf-8'
            );

            // Run 1: Cold run - should have 0 hits and > 0 misses
            ClearManifestASTCache();
            const result1 = await GenerateClassRegistrationsManifest({
                outputPath: manifestOut,
                appDir,
                verbose: false,
                syncDependencies: false,
                useDiskCache: false
            });

            expect(result1.success).toBe(true);
            expect(result1.classes.length).toBe(1);
            expect(result1.classes[0].className).toBe('MyFirstEntity');

            const stats1 = GetManifestASTCacheStats();
            expect(stats1.Hits).toBe(0);
            expect(stats1.Misses).toBeGreaterThan(0);
            expect(stats1.Size).toBeGreaterThan(0);

            // Run 2: Warm run - should have hits > 0 and misses === 0
            const result2 = await GenerateClassRegistrationsManifest({
                outputPath: manifestOut,
                appDir,
                verbose: false,
                syncDependencies: false,
                useDiskCache: false
            });

            expect(result2.success).toBe(true);
            expect(result2.classes.length).toBe(1);
            expect(result2.classes[0].className).toBe('MyFirstEntity');

            const stats2 = GetManifestASTCacheStats();
            expect(stats2.Hits).toBeGreaterThan(0);
            expect(stats2.Misses).toBe(0);
            expect(stats2.Size).toBe(stats1.Size);

            // Test Invalidation: modify the file content and size
            fs.writeFileSync(
                entityFilePath,
                `import { RegisterClass } from '@memberjunction/global';
@RegisterClass(BaseEntity, 'MyFirstEntityUpdated')
export class MyFirstEntityUpdated {}
`,
                'utf-8'
            );

            const result3 = await GenerateClassRegistrationsManifest({
                outputPath: manifestOut,
                appDir,
                verbose: false,
                syncDependencies: false,
                useDiskCache: false
            });

            expect(result3.success).toBe(true);
            expect(result3.classes.length).toBe(1);
            expect(result3.classes[0].className).toBe('MyFirstEntityUpdated');

            const stats3 = GetManifestASTCacheStats();
            // Invalidated file caused a miss on this run!
            expect(stats3.Misses).toBeGreaterThan(0);

            // Test Disk Persistence: SaveManifestASTCacheToDisk -> ClearManifestASTCache -> LoadManifestASTCacheFromDisk
            SaveManifestASTCacheToDisk(cacheFilePath);
            expect(fs.existsSync(cacheFilePath)).toBe(true);

            // Clear in-memory cache
            ClearManifestASTCache();
            expect(GetManifestASTCacheStats().Size).toBe(0);

            // Restore from disk
            LoadManifestASTCacheFromDisk(cacheFilePath);
            expect(GetManifestASTCacheStats().Size).toBe(stats3.Size);

            // Running again should now hit the restored cache
            const result4 = await GenerateClassRegistrationsManifest({
                outputPath: manifestOut,
                appDir,
                verbose: false,
                syncDependencies: false,
                useDiskCache: false
            });

            expect(result4.success).toBe(true);
            const stats4 = GetManifestASTCacheStats();
            expect(stats4.Hits).toBeGreaterThan(0);
            expect(stats4.Misses).toBe(0);
        });
    });

    describe('GenerateClassRegistrationsManifest AST Cache v2', () => {
        it('invalidates cache on same-length content edit with identical normalized mtime (1985-10-26)', async () => {
            const appDir = path.join(tempDir, 'app2');
            const pkgDir = path.join(tempDir, 'sample-pkg');
            const pkgSrcDir = path.join(pkgDir, 'src');
            const manifestOut = path.join(appDir, 'src', 'generated', 'manifest.ts');

            fs.mkdirSync(pkgSrcDir, { recursive: true });
            fs.mkdirSync(path.join(appDir, 'node_modules'), { recursive: true });

            // Exactly the same length strings (107 characters each)
            const fileContentA = `import { RegisterClass } from '@memberjunction/global';
@RegisterClass(BaseEntity, 'EntityA')
export class ClassA {}
`;
            const fileContentB = `import { RegisterClass } from '@memberjunction/global';
@RegisterClass(BaseEntity, 'EntityB')
export class ClassB {}
`;
            expect(fileContentA.length).toBe(fileContentB.length);

            const entityFilePath = path.join(pkgSrcDir, 'MyEntity.ts');
            fs.writeFileSync(entityFilePath, fileContentA, 'utf-8');

            // Normalized npm pack mtime: 1985-10-26T08:15:00.000Z
            const fixedDate = new Date('1985-10-26T08:15:00.000Z');
            fs.utimesSync(entityFilePath, fixedDate, fixedDate);

            fs.writeFileSync(
                path.join(pkgDir, 'package.json'),
                JSON.stringify({
                    name: 'sample-pkg',
                    version: '1.0.0'
                }),
                'utf-8'
            );

            fs.symlinkSync(pkgDir, path.join(appDir, 'node_modules', 'sample-pkg'), 'dir');

            fs.writeFileSync(
                path.join(appDir, 'package.json'),
                JSON.stringify({
                    name: 'app',
                    version: '1.0.0',
                    dependencies: {
                        'sample-pkg': '1.0.0'
                    }
                }),
                'utf-8'
            );

            // Run 1: Cold parse of ClassA
            const res1 = await GenerateClassRegistrationsManifest({
                outputPath: manifestOut,
                appDir,
                verbose: false,
                syncDependencies: false,
                useDiskCache: false
            });
            expect(res1.success).toBe(true);
            expect(res1.classes.length).toBe(1);
            expect(res1.classes[0].className).toBe('ClassA');
            expect(res1.classes[0].key).toBe('EntityA');

            // Run 2: Cache hit
            const res2 = await GenerateClassRegistrationsManifest({
                outputPath: manifestOut,
                appDir,
                verbose: false,
                syncDependencies: false,
                useDiskCache: false
            });
            expect(res2.success).toBe(true);
            expect(res2.classes[0].className).toBe('ClassA');
            expect(GetManifestASTCacheStats().Hits).toBeGreaterThan(0);

            // Modify file with SAME LENGTH content and reset to EXACT SAME mtime
            fs.writeFileSync(entityFilePath, fileContentB, 'utf-8');
            fs.utimesSync(entityFilePath, fixedDate, fixedDate);

            const statB = fs.statSync(entityFilePath);
            expect(statB.mtime.toISOString()).toBe(fixedDate.toISOString());

            // Run 3: Must NOT serve stale ClassA from cache; must detect contentHash mismatch and parse ClassB!
            const res3 = await GenerateClassRegistrationsManifest({
                outputPath: manifestOut,
                appDir,
                verbose: false,
                syncDependencies: false,
                useDiskCache: false
            });
            expect(res3.success).toBe(true);
            expect(res3.classes.length).toBe(1);
            expect(res3.classes[0].className).toBe('ClassB');
            expect(res3.classes[0].key).toBe('EntityB');
        });

        it('performs atomic save, merges concurrent disk entries, and prunes deleted files', () => {
            const cacheFile = path.join(tempDir, 'cache', 'mj-manifest-ast-cache-v2.json');
            const liveFile = path.join(tempDir, 'LiveFile.ts');
            const deletedFile = path.join(tempDir, 'DeletedFile.ts');
            const siblingFile = path.join(tempDir, 'SiblingFile.ts');

            fs.writeFileSync(liveFile, 'export class LiveClass {}', 'utf-8');
            fs.writeFileSync(deletedFile, 'export class DeletedClass {}', 'utf-8');
            fs.writeFileSync(siblingFile, 'export class SiblingClass {}', 'utf-8');

            ClearManifestASTCache();
            const liveKey = `ts::${liveFile}`;
            const deletedKey = `ts::${deletedFile}`;
            const siblingKey = `ts::${siblingFile}`;

            // Create an existing disk cache simulating a sibling build process
            // Actually include deletedKey in disk payload to test pruning an existing entry
            const initialDiskPayload = {
                version: 2,
                entries: {
                    [siblingKey]: {
                        contentHash: 'hash-sibling',
                        size: 100,
                        isCompiledJS: false,
                        lastSeenMs: 1000,
                        classes: [{ className: 'SiblingClass' }]
                    },
                    [liveKey]: {
                        contentHash: 'hash-live-old',
                        size: 80,
                        isCompiledJS: false,
                        lastSeenMs: 500,
                        classes: [{ className: 'LiveClassOld' }]
                    },
                    [deletedKey]: {
                        contentHash: 'hash-deleted',
                        size: 90,
                        isCompiledJS: false,
                        lastSeenMs: 600,
                        classes: [{ className: 'DeletedClass' }]
                    }
                }
            };

            fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
            fs.writeFileSync(cacheFile, JSON.stringify(initialDiskPayload), 'utf-8');

            // Load into memory from disk
            LoadManifestASTCacheFromDisk(cacheFile);

            // Delete deletedFile from disk
            fs.unlinkSync(deletedFile);
            expect(fs.existsSync(deletedFile)).toBe(false);

            // Save with pruning enabled (default)
            SaveManifestASTCacheToDisk(cacheFile, { PruneMissingFiles: true });

            expect(fs.existsSync(cacheFile)).toBe(true);
            const savedRaw = fs.readFileSync(cacheFile, 'utf-8');
            const savedPayload = JSON.parse(savedRaw) as { version: number; entries: Record<string, unknown> };

            expect(savedPayload.version).toBe(2);
            // Sibling file was merged in from disk
            expect(savedPayload.entries[siblingKey]).toBeDefined();
            // Live file exists
            expect(savedPayload.entries[liveKey]).toBeDefined();
            // Deleted file was pruned
            expect(savedPayload.entries[deletedKey]).toBeUndefined();
        });

        it('caps AST cache at MAX_AST_CACHE_ENTRIES on save', () => {
            expect(MAX_AST_CACHE_ENTRIES).toBe(20000);

            const cacheFile = path.join(tempDir, 'cache', 'mj-cap-test-cache.json');
            ClearManifestASTCache();

            const initialDiskPayload = {
                version: 2,
                entries: {
                    'entry1': {
                        contentHash: 'hash1',
                        size: 10,
                        isCompiledJS: false,
                        lastSeenMs: 100, // oldest
                        classes: [{ className: 'Class1' }]
                    },
                    'entry2': {
                        contentHash: 'hash2',
                        size: 20,
                        isCompiledJS: false,
                        lastSeenMs: 200,
                        classes: [{ className: 'Class2' }]
                    },
                    'entry3': {
                        contentHash: 'hash3',
                        size: 30,
                        isCompiledJS: false,
                        lastSeenMs: 300, // newest
                        classes: [{ className: 'Class3' }]
                    }
                }
            };

            fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
            fs.writeFileSync(cacheFile, JSON.stringify(initialDiskPayload), 'utf-8');

            LoadManifestASTCacheFromDisk(cacheFile);

            // Pass MaxEntries: 2 and PruneMissingFiles: false so synthetic keys are not pruned for missing files
            SaveManifestASTCacheToDisk(cacheFile, { MaxEntries: 2, PruneMissingFiles: false });

            const savedRaw = fs.readFileSync(cacheFile, 'utf-8');
            const savedPayload = JSON.parse(savedRaw) as { version: number; entries: Record<string, unknown> };

            expect(Object.keys(savedPayload.entries).length).toBe(2);
            // entry1 was oldest (100) -> evicted
            expect(savedPayload.entries['entry1']).toBeUndefined();
            // entry2 (200) and entry3 (300) -> kept
            expect(savedPayload.entries['entry2']).toBeDefined();
            expect(savedPayload.entries['entry3']).toBeDefined();
        });

        it('does not create a .turbo directory when turbo.json does not exist (uses node_modules/.cache instead)', async () => {
            const repoDir = path.join(tempDir, 'plain-project');
            const nodeModulesDir = path.join(repoDir, 'node_modules');
            fs.mkdirSync(nodeModulesDir, { recursive: true });

            // No turbo.json or .turbo folder exists in repoDir
            expect(fs.existsSync(path.join(repoDir, 'turbo.json'))).toBe(false);
            expect(fs.existsSync(path.join(repoDir, '.turbo'))).toBe(false);

            const resolvedPath = ResolveDefaultAstCachePath(repoDir);
            expect(resolvedPath).toBe(
                path.join(nodeModulesDir, '.cache', 'memberjunction', 'mj-manifest-ast-cache-v2.json')
            );

            // When neither turbo nor node_modules exists, returns null
            const bareDir = path.join(tempDir, 'bare-dir');
            fs.mkdirSync(bareDir, { recursive: true });
            const bareResolved = ResolveDefaultAstCachePath(bareDir);
            expect(bareResolved).toBeNull();
        });
    });
});
