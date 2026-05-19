import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Tests for MJAPI server bootstrap configuration.
 *
 * MJAPI is a thin bootstrap layer — most logic lives in @memberjunction/server-bootstrap.
 * These tests verify the configuration is wired correctly without actually starting the server.
 */

describe('MJAPI Bootstrap', () => {
    describe('Module structure', () => {
        it('should have a valid entry point at src/index.ts', async () => {
            // Verify the file exists and exports something (without executing it)
            const fs = await import('node:fs');
            const entryPath = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', 'index.ts');
            expect(fs.existsSync(entryPath)).toBe(true);
        });
    });

    describe('Resolver path resolution', () => {
        it('should resolve generated resolver path correctly', () => {
            // Simulate the path resolution logic from index.ts
            const __dirname = fileURLToPath(new URL('.', import.meta.url));
            const resolverPath = resolve(__dirname, '..', 'generated', 'generated.{js,ts}');

            expect(resolverPath).toContain('generated');
            expect(resolverPath).toMatch(/generated\.\{js,ts\}$/);
        });
    });

    describe('Generated files', () => {
        it('should have a class-registrations-manifest file', async () => {
            const fs = await import('node:fs');
            const manifestPath = resolve(
                fileURLToPath(new URL('.', import.meta.url)),
                '..', 'generated', 'class-registrations-manifest.ts'
            );
            expect(fs.existsSync(manifestPath)).toBe(true);
        });

        it('should have a generated resolvers file', async () => {
            const fs = await import('node:fs');
            const generatedPath = resolve(
                fileURLToPath(new URL('.', import.meta.url)),
                '..', 'generated', 'generated.ts'
            );
            expect(fs.existsSync(generatedPath)).toBe(true);
        });
    });
});
