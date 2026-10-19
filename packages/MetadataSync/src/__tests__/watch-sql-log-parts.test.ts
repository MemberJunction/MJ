/**
 * mj sync watch announces every part of a size-split SQL log when it stops, the same way
 * mj sync push does (PR #3369 review). The provider, its logging session and the config are
 * fakes; no directory is actually watched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { SqlLoggingOptions } from '@memberjunction/generic-database-provider';
import type { SyncConfig } from '../config';
import type { SyncEngine } from '../lib/sync-engine';

/** Stands in for SqlLoggingSessionImpl: after a split, FilePath is the first part, as in the real one. */
class FakeSession {
    readonly Id = 'fake-watch-session';
    readonly StartTime = new Date();
    StatementCount = 0;
    private parts: string[];

    constructor(private readonly basePath: string, readonly Options: SqlLoggingOptions) {
        this.parts = [basePath];
    }

    get FilePath(): string {
        return this.parts[0];
    }

    get FilePaths(): string[] {
        return [...this.parts];
    }

    SplitInto(count: number): void {
        const parsed = path.parse(this.basePath);
        this.parts = Array.from({ length: count }, (_, i) =>
            path.join(parsed.dir, `${parsed.name}.part${String(i + 1).padStart(3, '0')}${parsed.ext}`)
        );
    }

    async Dispose(): Promise<void> {}
}

class Host {
    session: FakeSession | undefined;
    async CreateSqlLogger(filePath: string, options: SqlLoggingOptions): Promise<FakeSession> {
        this.session = new FakeSession(filePath, options);
        return this.session;
    }
}

let host = new Host();
let syncConfig: SyncConfig | null = null;
let cwd = '';

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        static get Provider(): Host {
            return host;
        }
    }
    return { ...actual, Metadata: MockMetadata };
});

vi.mock('../config', async () => {
    const actual = await vi.importActual<typeof import('../config')>('../config');
    return {
        ...actual,
        LoadSyncConfig: async () => syncConfig,
        // No entity directory has a usable config, so nothing is watched.
        LoadEntityConfig: async () => null,
    };
});

vi.mock('../lib/provider-utils', async () => {
    const actual = await vi.importActual<typeof import('../lib/provider-utils')>('../lib/provider-utils');
    return { ...actual, FindEntityDirectories: () => ['/no-such-entity-dir'] };
});

vi.mock('../lib/config-manager', () => ({
    configManager: { getOriginalCwd: () => cwd },
}));

import { WatchService } from '../services/WatchService';

describe('WatchService announces every part of a size-split SQL log when it stops', () => {
    let logs: string[];

    beforeEach(async () => {
        host = new Host();
        logs = [];
        cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-watch-sql-parts-'));
    });

    afterEach(async () => {
        await fs.remove(cwd);
    });

    async function watchThenStop(maxFileSize: number, splitInto?: number): Promise<FakeSession> {
        syncConfig = { version: '1.0.0', sqlLogging: { enabled: true, maxFileSize } } as SyncConfig;
        const service = new WatchService({} as SyncEngine);
        const result = await service.Watch({}, {
            onLog: (message: string) => logs.push(message),
            onWarn: (message: string) => logs.push(`WARN ${message}`),
        });
        const session = host.session!;
        if (splitInto) {
            session.SplitInto(splitInto);
        }
        await result.stop();
        return session;
    }

    it('lists each part, numbered, when the capture split', async () => {
        const session = await watchThenStop(1024 * 1024, 3);
        const parts = session.FilePaths;

        const notice = logs.indexOf('📝 SQL log split into 3 parts (each ≤ ~1.0 MiB unless a single statement exceeds it):');
        expect(notice).toBeGreaterThanOrEqual(0);
        expect(logs.slice(notice + 1, notice + 4)).toEqual([
            `   1. ${parts[0]}`,
            `   2. ${parts[1]}`,
            `   3. ${parts[2]}`,
        ]);
        expect(logs.some((line) => line.startsWith('📝 SQL log written to:'))).toBe(false);
    });

    it('keeps the one-line message when the capture fit in one file', async () => {
        const session = await watchThenStop(1024 * 1024);

        expect(logs).toContain(`📝 SQL log written to: ${session.FilePath}`);
        expect(logs.some((line) => line.includes('SQL log split into'))).toBe(false);
    });
});
