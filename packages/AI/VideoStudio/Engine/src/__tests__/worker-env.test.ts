import { describe, expect, it } from 'vitest';
import { RENDER_WORKER_ENV } from '@memberjunction/video-studio-core';
import {
    ALLOWED_WORKER_PARENT_ENV_KEYS,
    BuildWorkerEnv,
} from '../index.js';

describe('BuildWorkerEnv', () => {
    it('drops DB_PASSWORD and OPENAI_API_KEY, keeps PATH and allowlisted vars, and sets the three worker vars', () => {
        const parentEnv: NodeJS.ProcessEnv = {
            PATH: '/usr/local/bin:/usr/bin:/bin',
            HOME: '/Users/tester',
            TMPDIR: '/tmp/test',
            LANG: 'en_US.UTF-8',
            CHROME_PATH: '/opt/chrome/chrome-headless-shell',
            DB_PASSWORD: 'super-secret-db-password',
            OPENAI_API_KEY: 'sk-live-secret-key',
            ANTHROPIC_API_KEY: 'sk-ant-secret',
            AWS_SECRET_ACCESS_KEY: 'aws-secret',
            DATABASE_URL: 'mssql://sa:secret@localhost:1433',
        };

        const token = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const childEnv = BuildWorkerEnv(parentEnv, token);

        expect(childEnv.DB_PASSWORD).toBeUndefined();
        expect(childEnv.OPENAI_API_KEY).toBeUndefined();
        expect(childEnv.ANTHROPIC_API_KEY).toBeUndefined();
        expect(childEnv.AWS_SECRET_ACCESS_KEY).toBeUndefined();
        expect(childEnv.DATABASE_URL).toBeUndefined();

        expect(childEnv.PATH).toBe('/usr/local/bin:/usr/bin:/bin');
        expect(childEnv.HOME).toBe('/Users/tester');
        expect(childEnv.TMPDIR).toBe('/tmp/test');
        expect(childEnv.LANG).toBe('en_US.UTF-8');
        expect(childEnv.CHROME_PATH).toBe('/opt/chrome/chrome-headless-shell');

        expect(childEnv[RENDER_WORKER_ENV.Host]).toBe('127.0.0.1');
        expect(childEnv[RENDER_WORKER_ENV.Port]).toBe('0');
        expect(childEnv[RENDER_WORKER_ENV.Token]).toBe(token);

        const allowedSet = new Set<string>([
            ...ALLOWED_WORKER_PARENT_ENV_KEYS,
            RENDER_WORKER_ENV.Host,
            RENDER_WORKER_ENV.Port,
            RENDER_WORKER_ENV.Token,
        ]);
        for (const key of Object.keys(childEnv)) {
            expect(allowedSet.has(key)).toBe(true);
        }
    });
});
