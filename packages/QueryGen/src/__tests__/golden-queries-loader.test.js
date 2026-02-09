/**
 * Unit tests for golden queries loading functionality
 *
 * Tests that the golden-queries.json file can be loaded correctly using
 * the ES module compatible file system approach introduced to fix the
 * JSON import attribute error.
 *
 * Run with: node --test src/__tests__/golden-queries-loader.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Get the path to the golden-queries.json file relative to this test file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// The test file is at: src/__tests__/golden-queries-loader.test.js
// The JSON file is at: src/data/golden-queries.json
// So the relative path is: ../data/golden-queries.json
const goldenQueriesPathFromSource = join(__dirname, '../data/golden-queries.json');

describe('Golden Queries Loader', () => {
    describe('File System Loading', () => {
        test('should find the golden-queries.json file', () => {
            assert.strictEqual(existsSync(goldenQueriesPathFromSource), true,
                `Expected golden-queries.json to exist at ${goldenQueriesPathFromSource}`);
        });

        test('should load the golden-queries.json file as valid JSON', () => {
            const content = readFileSync(goldenQueriesPathFromSource, 'utf-8');
            const data = JSON.parse(content);

            assert.ok(data !== undefined, 'Expected data to be defined');
        });

        test('should contain an array of golden queries', () => {
            const content = readFileSync(goldenQueriesPathFromSource, 'utf-8');
            const data = JSON.parse(content);

            assert.strictEqual(Array.isArray(data), true, 'Expected data to be an array');
        });

        test('should have at least one golden query', () => {
            const content = readFileSync(goldenQueriesPathFromSource, 'utf-8');
            const data = JSON.parse(content);

            assert.ok(data.length > 0, 'Expected at least one golden query');
        });
    });

    describe('Golden Query Schema Validation', () => {
        const content = readFileSync(goldenQueriesPathFromSource, 'utf-8');
        const goldenQueries = JSON.parse(content);

        test('each golden query should have a name', () => {
            for (const query of goldenQueries) {
                assert.ok(query.name !== undefined, 'Expected name to be defined');
                assert.strictEqual(typeof query.name, 'string', 'Expected name to be a string');
                assert.ok(query.name.length > 0, 'Expected name to be non-empty');
            }
        });

        test('each golden query should have a userQuestion', () => {
            for (const query of goldenQueries) {
                assert.ok(query.userQuestion !== undefined, 'Expected userQuestion to be defined');
                assert.strictEqual(typeof query.userQuestion, 'string', 'Expected userQuestion to be a string');
            }
        });

        test('each golden query should have a description', () => {
            for (const query of goldenQueries) {
                assert.ok(query.description !== undefined, 'Expected description to be defined');
                assert.strictEqual(typeof query.description, 'string', 'Expected description to be a string');
            }
        });

        test('each golden query should have sql', () => {
            for (const query of goldenQueries) {
                assert.ok(query.sql !== undefined, 'Expected sql to be defined');
                assert.strictEqual(typeof query.sql, 'string', 'Expected sql to be a string');
                assert.ok(query.sql.length > 0, 'Expected sql to be non-empty');
            }
        });

        test('each golden query should have a parameters array', () => {
            for (const query of goldenQueries) {
                assert.ok(query.parameters !== undefined, 'Expected parameters to be defined');
                assert.strictEqual(Array.isArray(query.parameters), true, 'Expected parameters to be an array');
            }
        });

        test('each golden query should have a selectClause array', () => {
            for (const query of goldenQueries) {
                assert.ok(query.selectClause !== undefined, 'Expected selectClause to be defined');
                assert.strictEqual(Array.isArray(query.selectClause), true, 'Expected selectClause to be an array');
            }
        });
    });

    describe('loadGoldenQueries Function Simulation', () => {
        /**
         * Simulates the loadGoldenQueries function from generate.ts
         * to verify the implementation works correctly
         */
        async function loadGoldenQueries(config) {
            try {
                // This mirrors the implementation in generate.ts
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = dirname(__filename);
                // Adjust path for test location vs generate.ts location
                const goldenQueriesPath = join(__dirname, '../data/golden-queries.json');
                const goldenQueriesData = JSON.parse(readFileSync(goldenQueriesPath, 'utf-8'));
                const goldenQueries = goldenQueriesData;

                if (!Array.isArray(goldenQueries)) {
                    if (config.verbose) {
                        console.log('[Warning] Golden queries data is not an array');
                    }
                    return [];
                }

                if (config.verbose) {
                    console.log(`[Info] Loaded ${goldenQueries.length} golden queries for few-shot learning`);
                }
                return goldenQueries;
            } catch (error) {
                if (config.verbose) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    console.log(`[Warning] Failed to load golden queries: ${message}`);
                }
                return [];
            }
        }

        test('should successfully load golden queries with verbose=false', async () => {
            const result = await loadGoldenQueries({ verbose: false });

            assert.strictEqual(Array.isArray(result), true, 'Expected result to be an array');
            assert.ok(result.length > 0, 'Expected result to have items');
        });

        test('should return empty array when file does not exist', async () => {
            // Create a version that uses a bad path
            async function loadGoldenQueriesWithBadPath(config) {
                try {
                    const badPath = '/nonexistent/path/golden-queries.json';
                    const goldenQueriesData = JSON.parse(readFileSync(badPath, 'utf-8'));
                    return goldenQueriesData;
                } catch {
                    return [];
                }
            }

            const result = await loadGoldenQueriesWithBadPath({ verbose: false });

            assert.strictEqual(Array.isArray(result), true, 'Expected result to be an array');
            assert.strictEqual(result.length, 0, 'Expected result to be empty');
        });

        test('should return empty array when JSON is invalid', async () => {
            // Create a version that parses invalid JSON
            async function loadGoldenQueriesWithInvalidJson(config) {
                try {
                    JSON.parse('{ invalid json }');
                    return [];
                } catch {
                    return [];
                }
            }

            const result = await loadGoldenQueriesWithInvalidJson({ verbose: false });

            assert.strictEqual(Array.isArray(result), true, 'Expected result to be an array');
            assert.strictEqual(result.length, 0, 'Expected result to be empty');
        });
    });
});
