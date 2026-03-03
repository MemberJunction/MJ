/**
 * Tests for the MJ Open App manifest Zod schema.
 *
 * Validates that the manifest schema correctly accepts valid manifests
 * and rejects manifests with invalid or missing fields.
 */
import { describe, it, expect } from 'vitest';
import { ValidateManifestObject } from '../manifest/manifest-loader.js';

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

describe('Manifest Validation', () => {
    describe('Valid Manifests', () => {
        it('should accept minimal required fields', () => {
            const result = ValidateManifestObject(minimalManifest());
            expect(result.Success).toBe(true);
        });

        it('should accept full manifest with all optional fields', () => {
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
            expect(result.Success).toBe(true);
        });
    });

    describe('Invalid Name', () => {
        it('should reject name too short (2 chars)', () => {
            const m = { ...minimalManifest(), name: 'ab' };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject uppercase name', () => {
            const m = { ...minimalManifest(), name: 'TestApp' };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject name with special characters', () => {
            const m = { ...minimalManifest(), name: 'test_app!' };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject name with underscores (only hyphens allowed)', () => {
            const m = { ...minimalManifest(), name: 'test_app' };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Invalid Version', () => {
        it('should reject non-semver version', () => {
            const m = { ...minimalManifest(), version: 'v1.0' };
            const result = ValidateManifestObject(m);
            expect(result.Success).toBe(false);
            expect(result.Errors?.some(e => e.includes('semver'))).toBe(true);
        });

        it('should reject empty version', () => {
            const m = { ...minimalManifest(), version: '' };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Missing Required Fields', () => {
        it('should reject missing name', () => {
            const m = minimalManifest();
            delete m.name;
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject missing publisher', () => {
            const m = minimalManifest();
            delete m.publisher;
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject missing version', () => {
            const m = minimalManifest();
            delete m.version;
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject missing manifestVersion', () => {
            const m = minimalManifest();
            delete m.manifestVersion;
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject missing repository', () => {
            const m = minimalManifest();
            delete m.repository;
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject missing mjVersionRange', () => {
            const m = minimalManifest();
            delete m.mjVersionRange;
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Invalid manifestVersion', () => {
        it('should reject manifestVersion != 1', () => {
            const m = { ...minimalManifest(), manifestVersion: 2 };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Invalid Schema Name', () => {
        it('should reject uppercase schema name', () => {
            const m = { ...minimalManifest(), schema: { name: 'MySchema' } };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should accept schema name starting with __ (e.g., __bcsaas)', () => {
            const m = { ...minimalManifest(), schema: { name: '__bcsaas' } };
            expect(ValidateManifestObject(m).Success).toBe(true);
        });

        it('should reject schema name starting with 3+ underscores', () => {
            const m = { ...minimalManifest(), schema: { name: '___invalid' } };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject schema name too short', () => {
            const m = { ...minimalManifest(), schema: { name: 'ab' } };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Invalid Color', () => {
        it('should reject non-hex color', () => {
            const m = { ...minimalManifest(), color: 'red' };
            const result = ValidateManifestObject(m);
            expect(result.Success).toBe(false);
            expect(result.Errors?.some(e => e.includes('hex color'))).toBe(true);
        });

        it('should reject short hex (#FFF)', () => {
            const m = { ...minimalManifest(), color: '#FFF' };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Invalid Tags', () => {
        it('should reject uppercase tag', () => {
            const m = { ...minimalManifest(), tags: ['ValidTag'] };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });

        it('should reject more than 20 tags', () => {
            const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`);
            const m = { ...minimalManifest(), tags };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Invalid Package Roles', () => {
        it('should reject unknown package role', () => {
            const m = {
                ...minimalManifest(),
                packages: {
                    server: [{ name: '@test/pkg', role: 'unknown-role' }],
                },
            };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Valid Package Roles', () => {
        const roles = ['bootstrap', 'actions', 'engine', 'provider', 'module', 'components', 'library'];

        for (const role of roles) {
            it(`should accept package role '${role}'`, () => {
                const pkg: Record<string, string> = { name: `@test/${role}-pkg`, role };
                if (role === 'bootstrap') {
                    pkg.startupExport = 'registerApp';
                }
                const m = {
                    ...minimalManifest(),
                    packages: { server: [pkg] },
                };
                expect(ValidateManifestObject(m).Success).toBe(true);
            });
        }
    });

    describe('Invalid Repository', () => {
        it('should reject non-GitHub repository', () => {
            const m = { ...minimalManifest(), repository: 'https://gitlab.com/test/repo' };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Invalid Description', () => {
        it('should reject description < 10 chars', () => {
            const m = { ...minimalManifest(), description: 'Short' };
            expect(ValidateManifestObject(m).Success).toBe(false);
        });
    });

    describe('Valid Semver Versions', () => {
        it('should accept pre-release version (1.0.0-beta.1)', () => {
            const m = { ...minimalManifest(), version: '1.0.0-beta.1' };
            expect(ValidateManifestObject(m).Success).toBe(true);
        });

        it('should accept build metadata version (1.0.0+build.123)', () => {
            const m = { ...minimalManifest(), version: '1.0.0+build.123' };
            expect(ValidateManifestObject(m).Success).toBe(true);
        });
    });
});
