/**
 * Tests for `mj codegen integration-actions` — the user-facing command that
 * generates mj-sync action JSON for a downstream connector module.
 *
 * Three layers:
 *  1. Static command metadata (description, flags)
 *  2. The exported `findConnectorClass` helper (pure JS, no FS)
 *  3. `runIntegrationActionsCommand` against synthesized .js fixtures, covering
 *     the failure paths a user is likely to hit (missing file, no connector
 *     class, named-export miss).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import CodeGenIntegrationActions, {
    findConnectorClass,
    runIntegrationActionsCommand,
} from '../commands/codegen/integration-actions.js';

// ---------------------------------------------------------------------------
// Static metadata
// ---------------------------------------------------------------------------

describe('codegen integration-actions command class', () => {
    it('exposes a description that mentions action generation', () => {
        expect(CodeGenIntegrationActions.description).toMatch(/action/i);
    });

    it('declares the expected flags', () => {
        const flags = Object.keys(CodeGenIntegrationActions.flags);
        for (const expected of ['connector', 'export', 'output-dir', 'json', 'verbose']) {
            expect(flags).toContain(expected);
        }
    });

    it('makes --connector required', () => {
        const connectorFlag = CodeGenIntegrationActions.flags.connector as { required?: boolean };
        expect(connectorFlag.required).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// findConnectorClass — pure logic
// ---------------------------------------------------------------------------

describe('findConnectorClass', () => {
    /** A mock connector whose constructor name matches what the prototype-walk looks for. */
    class FakeBase {}
    Object.defineProperty(FakeBase, 'name', { value: 'BaseIntegrationConnector' });

    class MyConnector extends FakeBase {}
    class NotAConnector {}

    it('returns the only connector class from a module via auto-detection', () => {
        const module = { MyConnector, helper: () => 'noop' };
        expect(findConnectorClass(module)).toBe(MyConnector);
    });

    it('returns null when no class extends BaseIntegrationConnector', () => {
        const module = { NotAConnector, helper: () => 'noop' };
        expect(findConnectorClass(module)).toBeNull();
    });

    it('honors an explicit exportName when given', () => {
        const module = { MyConnector, OtherConnector: class extends FakeBase {} };
        expect(findConnectorClass(module, 'MyConnector')).toBe(MyConnector);
    });

    it('returns null when explicit exportName does not extend BaseIntegrationConnector', () => {
        const module = { Wrong: NotAConnector };
        expect(findConnectorClass(module, 'Wrong')).toBeNull();
    });

    it('returns null when explicit exportName is missing entirely', () => {
        const module = { MyConnector };
        expect(findConnectorClass(module, 'NonExistent')).toBeNull();
    });

    it('handles default exports', () => {
        const module = { default: MyConnector };
        expect(findConnectorClass(module)).toBe(MyConnector);
    });
});

// ---------------------------------------------------------------------------
// runIntegrationActionsCommand — failure paths against real FS
// ---------------------------------------------------------------------------

describe('runIntegrationActionsCommand error handling', () => {
    let tmp: string;

    beforeEach(() => {
        tmp = mkdtempSync(path.join(tmpdir(), 'mj-cli-iact-'));
    });

    afterEach(() => {
        rmSync(tmp, { recursive: true, force: true });
    });

    it('fails clearly when the connector module path does not exist', async () => {
        const result = await runIntegrationActionsCommand({
            ConnectorPath: path.join(tmp, 'does-not-exist.js'),
            OutputDir: tmp,
        });

        expect(result.ok).toBe(false);
        if (result.ok === false) {
            expect(result.error).toMatch(/not found/i);
        }
    });

    it('fails clearly when the module imports but exports nothing connector-shaped', async () => {
        const modPath = path.join(tmp, 'empty.mjs');
        writeFileSync(modPath, 'export const nothing = 1;\n');

        const result = await runIntegrationActionsCommand({
            ConnectorPath: modPath,
            OutputDir: tmp,
        });

        expect(result.ok).toBe(false);
        if (result.ok === false) {
            expect(result.error).toMatch(/no class extending BaseIntegrationConnector/i);
        }
    });

    it('fails clearly when --export points at a missing export', async () => {
        const modPath = path.join(tmp, 'wrong-export.mjs');
        writeFileSync(modPath, 'export class Something {}\n');

        const result = await runIntegrationActionsCommand({
            ConnectorPath: modPath,
            ExportName: 'NotThere',
            OutputDir: tmp,
        });

        expect(result.ok).toBe(false);
        if (result.ok === false) {
            expect(result.error).toMatch(/NotThere/);
        }
    });

    it('fails clearly when the named export is not a connector class', async () => {
        const modPath = path.join(tmp, 'wrong-class.mjs');
        writeFileSync(modPath, 'export class PlainClass {}\n');

        const result = await runIntegrationActionsCommand({
            ConnectorPath: modPath,
            ExportName: 'PlainClass',
            OutputDir: tmp,
        });

        expect(result.ok).toBe(false);
        if (result.ok === false) {
            expect(result.error).toMatch(/does not extend BaseIntegrationConnector/i);
        }
    });

    it('surfaces import errors with the original message', async () => {
        const modPath = path.join(tmp, 'broken-syntax.mjs');
        writeFileSync(modPath, 'export class Broken { this is not valid syntax }\n');

        const result = await runIntegrationActionsCommand({
            ConnectorPath: modPath,
            OutputDir: tmp,
        });

        expect(result.ok).toBe(false);
        if (result.ok === false) {
            expect(result.error).toMatch(/failed to import/i);
        }
    });
});
