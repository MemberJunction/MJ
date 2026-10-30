import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import type { ServerExtensionInitContext } from '@memberjunction/server-extensions-core';
import { ComputeAddinPublicUrl, ExcelAddinServerExtension } from '../extension';
import { ExcelAddinRuntime } from '../runtime';

/** Serves the pane from a temp directory instead of the built package. */
class TestExtension extends ExcelAddinServerExtension {
    constructor(private readonly webRoot: string) {
        super();
    }

    protected override ResolveWebRoot(): string {
        return this.webRoot;
    }
}

let webRoot: string;

function contextFor(app: express.Express, settings: Record<string, unknown>, publicUrl: string | null = 'https://api.example.org/api'): ServerExtensionInitContext {
    return {
        app,
        config: { Enabled: true, DriverClass: 'ExcelAddinServerExtension', RootPath: '/api/office/excel', Settings: settings },
        publicUrl: publicUrl ?? undefined,
        apiRootPath: '/api',
        services: { RegisterService: () => undefined, GetService: () => undefined, GetAllServices: () => new Map() } as unknown as ServerExtensionInitContext['services'],
        phase: 'pre-auth',
    };
}

beforeAll(() => {
    webRoot = mkdtempSync(join(tmpdir(), 'mj-excel-pane-'));
    writeFileSync(join(webRoot, 'taskpane.html'), '<!doctype html><title>pane</title>');
    mkdirSync(join(webRoot, 'assets'));
    writeFileSync(join(webRoot, 'assets', 'icon-32.png'), 'png');
});

afterAll(() => rmSync(webRoot, { recursive: true, force: true }));

beforeEach(() => ExcelAddinRuntime.Instance.Reset());

describe('ComputeAddinPublicUrl', () => {
    it.each([
        ['https://api.example.org/api', '/api', '/api/office/excel', 'https://api.example.org/api/office/excel'],
        ['https://api.example.org/', '', '/office/excel', 'https://api.example.org/office/excel'],
        ['https://api.example.org', '/api', '/office/excel/', 'https://api.example.org/office/excel'],
    ])('%s + base %s + root %s → %s', (publicUrl, apiRoot, rootPath, expected) => {
        expect(ComputeAddinPublicUrl(publicUrl, apiRoot, rootPath)).toBe(expected);
    });
});

describe('ExcelAddinServerExtension', () => {
    it('refuses to start without ExplorerUrl, and leaves the add-in off', async () => {
        const result = await new TestExtension(webRoot).Initialize(contextFor(express(), {}));
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('ExplorerUrl');
        expect(ExcelAddinRuntime.Instance.IsEnabled).toBe(false);
    });

    it('refuses to start without a public URL', async () => {
        const result = await new TestExtension(webRoot).Initialize(contextFor(express(), { ExplorerUrl: 'https://e.org' }, null));
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('public URL');
    });

    it('refuses the legacy Initialize(app, config) call', async () => {
        const context = contextFor(express(), { ExplorerUrl: 'https://e.org' });
        const result = await new TestExtension(webRoot).Initialize(context.app, context.config);
        expect(result.Success).toBe(false);
    });

    it('fails cleanly when the pane isn\'t built, and leaves the add-in off', async () => {
        class UnbuiltPane extends ExcelAddinServerExtension {
            protected override ResolveWebRoot(): string {
                throw new Error('the add-in pane isn\'t built');
            }
        }
        const result = await new UnbuiltPane().Initialize(contextFor(express(), { ExplorerUrl: 'https://e.org' }));
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('isn\'t built');
        expect(ExcelAddinRuntime.Instance.IsEnabled).toBe(false);
    });

    it('finds the built pane in @memberjunction/excel-addin by default', async () => {
        const result = await new ExcelAddinServerExtension().Initialize(contextFor(express(), { ExplorerUrl: 'https://e.org' }));
        expect(result.Success).toBe(true);
    });

    describe('serving', () => {
        let server: Server;
        let origin: string;

        beforeAll(async () => {
            const app = express();
            const result = await new TestExtension(webRoot).Initialize(contextFor(app, { ExplorerUrl: 'https://explorer.example.org', ServerName: 'Cheese Federation' }));
            expect(result.Success).toBe(true);
            await new Promise<void>(resolve => {
                server = app.listen(0, () => resolve());
            });
            origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        });

        afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

        it('serves a manifest that points at the public URL, uncached', async () => {
            const response = await fetch(`${origin}/api/office/excel/manifest.xml`);
            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('application/xml');
            expect(response.headers.get('cache-control')).toBe('no-store');
            const xml = await response.text();
            expect(xml).toContain('https://api.example.org/api/office/excel/taskpane.html');
            expect(xml).toContain('<DisplayName DefaultValue="Cheese Federation"/>');
        });

        it('serves the pane\'s config', async () => {
            const config = await (await fetch(`${origin}/api/office/excel/config.json`)).json();
            expect(config).toEqual({
                ContractVersion: 1,
                ServerName: 'Cheese Federation',
                AddinUrl: 'https://api.example.org/api/office/excel',
                ExplorerConnectUrl: 'https://explorer.example.org/office/connect',
                MaxRows: 100000,
            });
        });

        it('serves the pane\'s files without a directory index, framable by Excel on the web', async () => {
            const page = await fetch(`${origin}/api/office/excel/taskpane.html`);
            expect(page.status).toBe(200);
            expect(page.headers.get('x-frame-options')).toBeNull();
            expect(page.headers.get('x-content-type-options')).toBe('nosniff');
            expect((await fetch(`${origin}/api/office/excel/assets/icon-32.png`)).status).toBe(200);
            expect((await fetch(`${origin}/api/office/excel/`)).status).toBe(404);
        });
    });

    it('turns the add-in on and off with Initialize and Shutdown', async () => {
        const extension = new TestExtension(webRoot);
        await extension.Initialize(contextFor(express(), { ExplorerUrl: 'https://explorer.example.org' }));
        expect(ExcelAddinRuntime.Instance.IsEnabled).toBe(true);
        expect(ExcelAddinRuntime.Instance.ConnectedPageUrl).toBe('https://api.example.org/api/office/excel/connected.html');
        expect((await extension.HealthCheck()).Healthy).toBe(true);
        await extension.Shutdown();
        expect(ExcelAddinRuntime.Instance.IsEnabled).toBe(false);
        expect((await extension.HealthCheck()).Healthy).toBe(false);
    });
});
