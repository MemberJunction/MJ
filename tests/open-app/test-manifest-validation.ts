/**
 * Tests for the MJ Open App manifest Zod schema.
 *
 * Validates that the manifest schema correctly accepts valid manifests
 * and rejects manifests with invalid or missing fields.
 *
 * Run: npx tsx tests/open-app/test-manifest-validation.ts
 */
import {
    mjAppManifestSchema,
    ValidateManifestObject,
} from '@memberjunction/mj-open-app-engine';
import type { ManifestLoadResult } from '@memberjunction/mj-open-app-engine';

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

function assertValid(result: ManifestLoadResult, label: string): void {
    assert(result.Success === true, label);
    if (!result.Success) {
        console.error(`    Errors: ${result.Errors?.join(', ')}`);
    }
}

function assertInvalid(result: ManifestLoadResult, label: string, expectedSubstring?: string): void {
    assert(result.Success === false, label);
    if (expectedSubstring && result.Errors) {
        const hasMatch = result.Errors.some(e => e.includes(expectedSubstring));
        assert(hasMatch, `  → error contains "${expectedSubstring}"`);
    }
}

/** Minimal valid manifest with only required fields. */
function minimalManifest(): Record<string, unknown> {
    return {
        manifestVersion: 1,
        name: 'test-app',
        displayName: 'Test App',
        description: 'A test app with at least ten characters.',
        version: '1.0.0',
        publisher: { name: 'Test Publisher' },
        repository: 'https://github.com/test/test-app',
        mjVersionRange: '>=4.0.0',
        packages: {},
    };
}

// ── Test Suites ────────────────────────────────────────────

console.log('\n=== Manifest Validation Tests ===\n');

// -- Valid Manifests --

console.log('▸ Valid Manifests');

(function testMinimalManifest() {
    const result = ValidateManifestObject(minimalManifest());
    assertValid(result, 'Minimal required fields are accepted');
})();

(function testFullManifest() {
    const full = {
        ...minimalManifest(),
        $schema: 'https://example.com/schema.json',
        license: 'MIT',
        icon: 'https://example.com/icon.png',
        color: '#FF5733',
        publisher: {
            name: 'Full Publisher',
            email: 'dev@example.com',
            url: 'https://example.com',
        },
        schema: {
            name: 'test_schema',
            createIfNotExists: true,
        },
        migrations: {
            directory: 'migrations',
            engine: 'skyway' as const,
        },
        metadata: { directory: 'metadata' },
        packages: {
            registry: 'https://registry.npmjs.org',
            server: [{ name: '@test/server', role: 'actions', startupExport: 'register' }],
            client: [{ name: '@test/client', role: 'components' }],
            shared: [{ name: '@test/shared', role: 'library' }],
        },
        dependencies: {
            'dep-app-one': '^1.0.0',
            'dep-app-two': '>=2.0.0 <3.0.0',
        },
        code: { visibility: 'public' as const, sourceDirectory: 'src' },
        configuration: {
            schema: { type: 'object', properties: { apiKey: { type: 'string' } } },
        },
        hooks: {
            postInstall: 'node scripts/post-install.js',
            postUpgrade: 'node scripts/post-upgrade.js',
            preRemove: 'node scripts/pre-remove.js',
        },
        categories: ['testing', 'demo'],
        tags: ['sample', 'test', 'demo'],
    };
    const result = ValidateManifestObject(full);
    assertValid(result, 'Full manifest with all optional fields is accepted');
})();

// -- Invalid Name --

console.log('\n▸ Invalid Name');

(function testNameTooShort() {
    const m = { ...minimalManifest(), name: 'ab' };
    assertInvalid(ValidateManifestObject(m), 'Name too short (2 chars) is rejected');
})();

(function testNameUppercase() {
    const m = { ...minimalManifest(), name: 'TestApp' };
    assertInvalid(ValidateManifestObject(m), 'Uppercase name is rejected');
})();

(function testNameSpecialChars() {
    const m = { ...minimalManifest(), name: 'test_app!' };
    assertInvalid(ValidateManifestObject(m), 'Name with special characters is rejected');
})();

(function testNameWithUnderscores() {
    const m = { ...minimalManifest(), name: 'test_app' };
    assertInvalid(ValidateManifestObject(m), 'Name with underscores is rejected (only hyphens allowed)');
})();

// -- Invalid Version --

console.log('\n▸ Invalid Version');

(function testVersionNotSemver() {
    const m = { ...minimalManifest(), version: 'v1.0' };
    assertInvalid(ValidateManifestObject(m), 'Non-semver version is rejected', 'semver');
})();

(function testVersionEmpty() {
    const m = { ...minimalManifest(), version: '' };
    assertInvalid(ValidateManifestObject(m), 'Empty version is rejected');
})();

// -- Missing Required Fields --

console.log('\n▸ Missing Required Fields');

(function testMissingName() {
    const m = minimalManifest();
    delete m.name;
    assertInvalid(ValidateManifestObject(m), 'Missing name is rejected');
})();

(function testMissingPublisher() {
    const m = minimalManifest();
    delete m.publisher;
    assertInvalid(ValidateManifestObject(m), 'Missing publisher is rejected');
})();

(function testMissingVersion() {
    const m = minimalManifest();
    delete m.version;
    assertInvalid(ValidateManifestObject(m), 'Missing version is rejected');
})();

(function testMissingManifestVersion() {
    const m = minimalManifest();
    delete m.manifestVersion;
    assertInvalid(ValidateManifestObject(m), 'Missing manifestVersion is rejected');
})();

(function testMissingRepository() {
    const m = minimalManifest();
    delete m.repository;
    assertInvalid(ValidateManifestObject(m), 'Missing repository is rejected');
})();

(function testMissingMjVersionRange() {
    const m = minimalManifest();
    delete m.mjVersionRange;
    assertInvalid(ValidateManifestObject(m), 'Missing mjVersionRange is rejected');
})();

// -- Invalid manifestVersion --

console.log('\n▸ Invalid manifestVersion');

(function testWrongManifestVersion() {
    const m = { ...minimalManifest(), manifestVersion: 2 };
    assertInvalid(ValidateManifestObject(m), 'manifestVersion != 1 is rejected');
})();

// -- Invalid Schema Name --

console.log('\n▸ Invalid Schema Name');

(function testSchemaNameUppercase() {
    const m = { ...minimalManifest(), schema: { name: 'MySchema' } };
    assertInvalid(ValidateManifestObject(m), 'Uppercase schema name is rejected');
})();

(function testSchemaNameStartsWithUnderscore() {
    const m = { ...minimalManifest(), schema: { name: '__mj_reserved' } };
    assertInvalid(ValidateManifestObject(m), 'Schema name starting with __ is rejected');
})();

(function testSchemaNameTooShort() {
    const m = { ...minimalManifest(), schema: { name: 'ab' } };
    assertInvalid(ValidateManifestObject(m), 'Schema name too short is rejected');
})();

// -- Invalid Color --

console.log('\n▸ Invalid Color');

(function testColorNotHex() {
    const m = { ...minimalManifest(), color: 'red' };
    assertInvalid(ValidateManifestObject(m), 'Non-hex color is rejected', 'hex color');
})();

(function testColorShortHex() {
    const m = { ...minimalManifest(), color: '#FFF' };
    assertInvalid(ValidateManifestObject(m), 'Short hex (#FFF) is rejected');
})();

// -- Invalid Tags --

console.log('\n▸ Invalid Tags');

(function testTagUppercase() {
    const m = { ...minimalManifest(), tags: ['ValidTag'] };
    assertInvalid(ValidateManifestObject(m), 'Uppercase tag is rejected');
})();

(function testTooManyTags() {
    const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
    const m = { ...minimalManifest(), tags };
    assertInvalid(ValidateManifestObject(m), 'More than 20 tags is rejected');
})();

// -- Invalid Package Roles --

console.log('\n▸ Invalid Package Roles');

(function testUnknownRole() {
    const m = {
        ...minimalManifest(),
        packages: {
            server: [{ name: '@test/pkg', role: 'unknown-role' }],
        },
    };
    assertInvalid(ValidateManifestObject(m), 'Unknown package role is rejected');
})();

// -- Valid Package Roles --

console.log('\n▸ Valid Package Roles');

(function testAllValidRoles() {
    const roles = ['bootstrap', 'actions', 'engine', 'provider', 'module', 'components', 'library'];
    for (const role of roles) {
        const pkg: Record<string, string> = { name: `@test/${role}-pkg`, role };
        if (role === 'bootstrap') {
            pkg.startupExport = 'registerApp';
        }
        const m = {
            ...minimalManifest(),
            packages: {
                server: [pkg],
            },
        };
        assertValid(ValidateManifestObject(m), `Package role '${role}' is accepted`);
    }
})();

// -- Invalid Repository --

console.log('\n▸ Invalid Repository');

(function testNonGitHubRepo() {
    const m = { ...minimalManifest(), repository: 'https://gitlab.com/test/repo' };
    assertInvalid(ValidateManifestObject(m), 'Non-GitHub repository is rejected');
})();

// -- Invalid Description --

console.log('\n▸ Invalid Description');

(function testDescriptionTooShort() {
    const m = { ...minimalManifest(), description: 'Short' };
    assertInvalid(ValidateManifestObject(m), 'Description < 10 chars is rejected');
})();

// -- Valid Semver Versions --

console.log('\n▸ Valid Semver Versions');

(function testPreReleaseVersion() {
    const m = { ...minimalManifest(), version: '1.0.0-beta.1' };
    assertValid(ValidateManifestObject(m), 'Pre-release version (1.0.0-beta.1) is accepted');
})();

(function testBuildMetadata() {
    const m = { ...minimalManifest(), version: '1.0.0+build.123' };
    assertValid(ValidateManifestObject(m), 'Build metadata version (1.0.0+build.123) is accepted');
})();

// ── Summary ────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('='.repeat(50) + '\n');

if (failed > 0) {
    process.exit(1);
}
