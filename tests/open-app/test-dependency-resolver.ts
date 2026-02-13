/**
 * Tests for the MJ Open App dependency resolver.
 *
 * Validates topological sorting, circular dependency detection,
 * and handling of already-installed dependencies.
 *
 * Run: npx tsx tests/open-app/test-dependency-resolver.ts
 */
import {
    ResolveDependencies,
} from '@memberjunction/mj-open-app-engine';
import type {
    DependencyNode,
    DependencyResolutionResult,
    InstalledAppMap,
} from '@memberjunction/mj-open-app-engine';

// ── Helpers ────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
    if (condition) {
        passed++;
        console.log(`  ✓ ${label}`);
    } else {
        failed++;
        console.error(`  ✗ FAIL: ${label}`);
    }
}

function node(appName: string, deps: Record<string, string> = {}): DependencyNode {
    return {
        AppName: appName,
        Repository: `https://github.com/test/${appName}`,
        Dependencies: deps,
    };
}

// ── Test Suites ────────────────────────────────────────────

console.log('\n=== Dependency Resolver Tests ===\n');

// -- No Dependencies --

console.log('▸ No Dependencies');

(function testNoDeps() {
    const root = node('my-app');
    const result = ResolveDependencies(root, {});

    assert(result.Success === true, 'Resolution succeeds with no dependencies');
    assert(result.InstallOrder !== undefined, 'InstallOrder is defined');
    assert(result.InstallOrder!.length === 0, 'InstallOrder is empty (root is not included)');
})();

// -- Single Dependency --

console.log('\n▸ Single Dependency');

(function testSingleDep() {
    const root = node('my-app', { 'dep-a': '^1.0.0' });
    const result = ResolveDependencies(root, {});

    assert(result.Success === true, 'Resolution succeeds with one dependency');
    assert(result.InstallOrder!.length === 1, 'One dependency in install order');
    assert(result.InstallOrder![0].AppName === 'dep-a', 'Dependency is dep-a');
    assert(result.InstallOrder![0].VersionRange === '^1.0.0', 'Version range is ^1.0.0');
    assert(result.InstallOrder![0].AlreadyInstalled === false, 'Not already installed');
})();

// -- Linear Chain --

console.log('\n▸ Linear Chain (A → B → C)');

(function testLinearChain() {
    // The resolver only has the root node's declared deps.
    // It visits dep-b and dep-c as leaves since it doesn't have
    // their full dependency trees (no manifest fetching in the resolver).
    const root = node('app-a', { 'dep-b': '^1.0.0', 'dep-c': '^1.0.0' });
    const result = ResolveDependencies(root, {});

    assert(result.Success === true, 'Linear chain resolves successfully');
    assert(result.InstallOrder!.length === 2, 'Two dependencies in install order');

    const names = result.InstallOrder!.map(d => d.AppName);
    assert(names.includes('dep-b'), 'dep-b is in the install order');
    assert(names.includes('dep-c'), 'dep-c is in the install order');
})();

// -- Already Installed Dependencies --

console.log('\n▸ Already Installed Dependencies');

(function testAlreadyInstalled() {
    const root = node('my-app', { 'dep-a': '^1.0.0', 'dep-b': '^2.0.0' });
    const installed: InstalledAppMap = {
        'dep-a': { Version: '1.2.0', Repository: 'https://github.com/test/dep-a' },
    };
    const result = ResolveDependencies(root, installed);

    assert(result.Success === true, 'Resolution succeeds with installed deps');

    const depA = result.InstallOrder!.find(d => d.AppName === 'dep-a');
    const depB = result.InstallOrder!.find(d => d.AppName === 'dep-b');

    assert(depA !== undefined, 'dep-a is in the install order');
    assert(depA!.AlreadyInstalled === true, 'dep-a marked as already installed');
    assert(depA!.InstalledVersion === '1.2.0', 'dep-a shows installed version 1.2.0');
    assert(depA!.Repository === 'https://github.com/test/dep-a', 'dep-a has installed repo URL');

    assert(depB !== undefined, 'dep-b is in the install order');
    assert(depB!.AlreadyInstalled === false, 'dep-b is NOT already installed');
})();

// -- All Dependencies Already Installed --

console.log('\n▸ All Dependencies Already Installed');

(function testAllInstalled() {
    const root = node('my-app', { 'dep-a': '^1.0.0' });
    const installed: InstalledAppMap = {
        'dep-a': { Version: '1.5.0', Repository: 'https://github.com/test/dep-a' },
    };
    const result = ResolveDependencies(root, installed);

    assert(result.Success === true, 'Resolution succeeds when all deps installed');
    assert(result.InstallOrder!.length === 1, 'One entry in install order');
    assert(result.InstallOrder![0].AlreadyInstalled === true, 'dep-a is marked installed');
})();

// -- Circular Dependency Detection --

console.log('\n▸ Circular Dependency Detection');

(function testSelfDependency() {
    // An app that depends on itself
    const root = node('self-dep', { 'self-dep': '^1.0.0' });
    const result = ResolveDependencies(root, {});

    assert(result.Success === false, 'Self-dependency is detected as circular');
    assert(result.ErrorMessage !== undefined, 'Error message is provided');
    assert(
        result.ErrorMessage!.toLowerCase().includes('circular'),
        'Error mentions "circular"'
    );
})();

// -- Multiple Dependencies --

console.log('\n▸ Multiple Dependencies');

(function testMultipleDeps() {
    const root = node('my-app', {
        'dep-a': '^1.0.0',
        'dep-b': '>=2.0.0',
        'dep-c': '~3.0.0',
    });
    const result = ResolveDependencies(root, {});

    assert(result.Success === true, 'Multiple dependencies resolve successfully');
    assert(result.InstallOrder!.length === 3, 'Three dependencies in install order');

    const names = result.InstallOrder!.map(d => d.AppName);
    assert(names.includes('dep-a'), 'dep-a is included');
    assert(names.includes('dep-b'), 'dep-b is included');
    assert(names.includes('dep-c'), 'dep-c is included');
})();

// -- Empty Dependencies Map --

console.log('\n▸ Empty Dependencies Map');

(function testEmptyDepsMap() {
    const root = node('my-app', {});
    const result = ResolveDependencies(root, {});

    assert(result.Success === true, 'Empty deps map resolves successfully');
    assert(result.InstallOrder!.length === 0, 'No dependencies in install order');
})();

// -- Mixed Installed and Not-Installed --

console.log('\n▸ Mixed Dependencies (some installed, some not)');

(function testMixed() {
    const root = node('my-app', {
        'lib-a': '^1.0.0',
        'lib-b': '^2.0.0',
        'lib-c': '^3.0.0',
    });
    const installed: InstalledAppMap = {
        'lib-a': { Version: '1.0.0', Repository: 'https://github.com/test/lib-a' },
        'lib-c': { Version: '3.1.0', Repository: 'https://github.com/test/lib-c' },
    };
    const result = ResolveDependencies(root, installed);

    assert(result.Success === true, 'Mixed dependencies resolve successfully');

    const libA = result.InstallOrder!.find(d => d.AppName === 'lib-a');
    const libB = result.InstallOrder!.find(d => d.AppName === 'lib-b');
    const libC = result.InstallOrder!.find(d => d.AppName === 'lib-c');

    assert(libA!.AlreadyInstalled === true, 'lib-a is installed');
    assert(libB!.AlreadyInstalled === false, 'lib-b is NOT installed');
    assert(libC!.AlreadyInstalled === true, 'lib-c is installed');
})();

// ── Summary ────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50) + '\n');

if (failed > 0) {
    process.exit(1);
}
