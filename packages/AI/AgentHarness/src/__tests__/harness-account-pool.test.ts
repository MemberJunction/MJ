import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    DriverClassToHarnessPoolVendor,
    HARNESS_ACCOUNT_POOL_DIR_ENV_VAR,
    HarnessAccountPoolService,
    HarnessPoolVendorToDriverClass,
    NormalizeHarnessPoolVendor,
    OsDefaultSlotIdForVendor,
    ParseHarnessAccountSelectionStrategy,
    ParseOsDefaultSlotVendor,
    PrepareIsolatedHomeSlotDir,
    type HarnessAccountPoolOptions,
    type HarnessAccountSlotRecord,
} from '../HarnessAccountPoolService.js';

function makeTempDir(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedSlotCredentials(slot: HarnessAccountSlotRecord): void {
    switch (slot.vendor) {
        case 'claude':
            fs.mkdirSync(slot.slotDir, { recursive: true });
            fs.writeFileSync(path.join(slot.slotDir, '.credentials.json'), '{"accessToken":"tok"}', 'utf8');
            break;
        case 'codex':
            fs.mkdirSync(slot.slotDir, { recursive: true });
            fs.writeFileSync(path.join(slot.slotDir, 'auth.json'), '{"tokens":{}}', 'utf8');
            break;
        case 'agy':
            fs.mkdirSync(path.join(slot.slotDir, '.gemini', 'antigravity'), { recursive: true });
            break;
        case 'gemini':
            fs.mkdirSync(path.join(slot.slotDir, '.gemini'), { recursive: true });
            fs.writeFileSync(path.join(slot.slotDir, '.gemini', 'oauth_creds.json'), '{}', 'utf8');
            break;
    }
}

describe('HarnessAccountPoolService', () => {
    const tempDirs: string[] = [];
    let poolDir: string;
    let fakeRealHome: string;
    let origPoolDirEnv: string | undefined;

    beforeEach(() => {
        origPoolDirEnv = process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR];
        poolDir = makeTempDir('mj-pool-test-');
        fakeRealHome = makeTempDir('mj-real-home-');
        tempDirs.push(poolDir, fakeRealHome);
        process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR] = poolDir;
    });

    afterEach(() => {
        if (origPoolDirEnv === undefined) {
            delete process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR];
        } else {
            process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR] = origPoolDirEnv;
        }
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
    });

    function opts(extra?: Partial<HarnessAccountPoolOptions>): HarnessAccountPoolOptions {
        return {
            poolDir,
            realHomeDir: fakeRealHome,
            env: { HOME: fakeRealHome, [HARNESS_ACCOUNT_POOL_DIR_ENV_VAR]: poolDir },
            ...extra,
        };
    }

    describe('Singleton & Canonical Vendor Mapping', () => {
        it('returns a single process-wide BaseSingleton instance', () => {
            expect(HarnessAccountPoolService.Instance).toBe(HarnessAccountPoolService.Instance);
        });

        it('normalizes vendor aliases and driver class names cleanly', () => {
            expect(NormalizeHarnessPoolVendor('claude')).toBe('claude');
            expect(NormalizeHarnessPoolVendor('claude-code')).toBe('claude');
            expect(NormalizeHarnessPoolVendor('CLAUDE-CODE')).toBe('claude');
            expect(NormalizeHarnessPoolVendor('agy')).toBe('agy');
            expect(NormalizeHarnessPoolVendor('antigravity')).toBe('agy');
            expect(NormalizeHarnessPoolVendor('codex')).toBe('codex');
            expect(NormalizeHarnessPoolVendor('openai-codex')).toBe('codex');
            expect(NormalizeHarnessPoolVendor('gemini')).toBe('gemini');
            expect(NormalizeHarnessPoolVendor('gemini-cli')).toBe('gemini');
            expect(NormalizeHarnessPoolVendor('unknown-cli')).toBeNull();
            expect(NormalizeHarnessPoolVendor('')).toBeNull();

            expect(DriverClassToHarnessPoolVendor('ClaudeCodeCliAdapter')).toBe('claude');
            expect(DriverClassToHarnessPoolVendor('AntigravityCliAdapter')).toBe('agy');
            expect(DriverClassToHarnessPoolVendor('CodexAdapter')).toBe('codex');
            expect(DriverClassToHarnessPoolVendor('GeminiCliAdapter')).toBe('gemini');
            expect(DriverClassToHarnessPoolVendor('ClaudeCodeCloudAdapter')).toBeNull();

            expect(HarnessPoolVendorToDriverClass('claude')).toBe('ClaudeCodeCliAdapter');
            expect(HarnessPoolVendorToDriverClass('agy')).toBe('AntigravityCliAdapter');
            expect(HarnessPoolVendorToDriverClass('codex')).toBe('CodexAdapter');
            expect(HarnessPoolVendorToDriverClass('gemini')).toBe('GeminiCliAdapter');

            expect(OsDefaultSlotIdForVendor('claude')).toBe('os-default-claude');
            expect(ParseOsDefaultSlotVendor('os-default-agy')).toBe('agy');
            expect(ParseOsDefaultSlotVendor('claude-work')).toBeNull();

            expect(ParseHarnessAccountSelectionStrategy('least-in-flight')).toBe('least-in-flight');
            expect(ParseHarnessAccountSelectionStrategy('ROUND-ROBIN')).toBe('round-robin');
            expect(ParseHarnessAccountSelectionStrategy('weighted')).toBe('weighted');
            expect(ParseHarnessAccountSelectionStrategy('priority-failover')).toBe('priority-failover');
            expect(ParseHarnessAccountSelectionStrategy('random')).toBeNull();
        });

        it('respects MJ_HARNESS_ACCOUNT_POOL_DIR env var when options.poolDir is omitted', () => {
            const service = HarnessAccountPoolService.Instance;
            expect(service.GetPoolDir()).toBe(path.resolve(poolDir));
        });
    });

    describe('Selection Strategies (1..N Slot Auto-Balancing)', () => {
        it('balances with least-in-flight (in-flight/weight) and breaks ties via LRU then priority then slotId', () => {
            const service = HarnessAccountPoolService.Instance;
            const o = opts();
            service.SetIncludeOsDefaultLogin(false, o);

            const s1 = service.AddSlot({ vendor: 'claude', slotId: 'claude-a', label: 'A', weight: 1, priority: 100 }, o);
            const s2 = service.AddSlot({ vendor: 'claude', slotId: 'claude-b', label: 'B', weight: 2, priority: 100 }, o);
            const s3 = service.AddSlot({ vendor: 'claude', slotId: 'claude-c', label: 'C', weight: 1, priority: 50 }, o);
            seedSlotCredentials(s1);
            seedSlotCredentials(s2);
            seedSlotCredentials(s3);

            const t0 = Date.parse('2026-11-24T10:00:00.000Z');
            // All idle (0 in-flight), never used (LRU=0): priority 50 wins first -> claude-c
            const l1 = service.AcquireSlotLease({ vendor: 'claude', strategy: 'least-in-flight' }, opts({ nowMs: t0 }));
            expect(l1?.slotId).toBe('claude-c');

            // claude-c has 1/1=1.0; claude-a & claude-b have 0; tie-break by slotId -> claude-a
            const l2 = service.AcquireSlotLease({ vendor: 'claude', strategy: 'least-in-flight' }, opts({ nowMs: t0 + 1000 }));
            expect(l2?.slotId).toBe('claude-a');

            // Only claude-b has 0 in-flight -> claude-b
            const l3 = service.AcquireSlotLease({ vendor: 'claude', strategy: 'least-in-flight' }, opts({ nowMs: t0 + 2000 }));
            expect(l3?.slotId).toBe('claude-b');

            // Now in-flight ratios: claude-c=1/1, claude-a=1/1, claude-b=1/2=0.5 -> claude-b gets 4th concurrent lease!
            const l4 = service.AcquireSlotLease({ vendor: 'claude', strategy: 'least-in-flight' }, opts({ nowMs: t0 + 3000 }));
            expect(l4?.slotId).toBe('claude-b');

            // Release all leases; now all 3 are 0 in-flight, LRU order is claude-c (t0) < claude-a (t0+1s) < claude-b (t0+3s)
            service.ReleaseSlotLease(l1!.leaseId, o);
            service.ReleaseSlotLease(l2!.leaseId, o);
            service.ReleaseSlotLease(l3!.leaseId, o);
            service.ReleaseSlotLease(l4!.leaseId, o);

            const l5 = service.AcquireSlotLease({ vendor: 'claude', strategy: 'least-in-flight' }, opts({ nowMs: t0 + 4000 }));
            expect(l5?.slotId).toBe('claude-c');
            service.ReleaseSlotLease(l5!.leaseId, o);

            const l6 = service.AcquireSlotLease({ vendor: 'claude', strategy: 'least-in-flight' }, opts({ nowMs: t0 + 5000 }));
            expect(l6?.slotId).toBe('claude-a');
            service.ReleaseSlotLease(l6!.leaseId, o);
        });

        it('distributes turns proportionally under weighted strategy (3:1 ratio)', () => {
            const service = HarnessAccountPoolService.Instance;
            const o = opts();
            service.SetIncludeOsDefaultLogin(false, o);

            const heavy = service.AddSlot({ vendor: 'codex', slotId: 'codex-heavy', label: 'Heavy', weight: 3 }, o);
            const light = service.AddSlot({ vendor: 'codex', slotId: 'codex-light', label: 'Light', weight: 1 }, o);
            seedSlotCredentials(heavy);
            seedSlotCredentials(light);

            const counts: Record<string, number> = { 'codex-heavy': 0, 'codex-light': 0 };
            let now = Date.parse('2026-11-24T11:00:00.000Z');
            for (let i = 0; i < 8; i++) {
                const lease = service.AcquireSlotLease({ vendor: 'codex', strategy: 'weighted' }, opts({ nowMs: now }));
                expect(lease).not.toBeNull();
                counts[lease!.slotId] = (counts[lease!.slotId] ?? 0) + 1;
                service.ReleaseSlotLease(lease!.leaseId, o);
                now += 1000;
            }

            expect(counts['codex-heavy']).toBe(6);
            expect(counts['codex-light']).toBe(2);
        });

        it('cycles evenly across healthy slots under round-robin and persists roundRobinCursorByVendor', () => {
            const service = HarnessAccountPoolService.Instance;
            const o = opts();
            service.SetIncludeOsDefaultLogin(false, o);
            service.SetStrategy('round-robin', o);

            const a = service.AddSlot({ vendor: 'claude', slotId: 'claude-1', label: 'One' }, o);
            const b = service.AddSlot({ vendor: 'claude', slotId: 'claude-2', label: 'Two' }, o);
            const c = service.AddSlot({ vendor: 'claude', slotId: 'claude-3', label: 'Three' }, o);
            seedSlotCredentials(a);
            seedSlotCredentials(b);
            seedSlotCredentials(c);

            const picks: string[] = [];
            for (let i = 0; i < 6; i++) {
                const lease = service.AcquireSlotLease({ vendor: 'claude' }, o);
                expect(lease).not.toBeNull();
                picks.push(lease!.slotId);
                service.ReleaseSlotLease(lease!.leaseId, o);
            }

            expect(picks).toEqual(['claude-1', 'claude-2', 'claude-3', 'claude-1', 'claude-2', 'claude-3']);
            const pool = service.LoadPool(o);
            expect(pool.roundRobinCursorByVendor?.claude).toBe(0);
        });

        it('uses priority-failover to prefer lowest priority and fails over on cooldown or exclusion', () => {
            const service = HarnessAccountPoolService.Instance;
            const o = opts();
            service.SetIncludeOsDefaultLogin(false, o);

            const primary = service.AddSlot({ vendor: 'agy', slotId: 'agy-primary', priority: 10 }, o);
            const secondary = service.AddSlot({ vendor: 'agy', slotId: 'agy-secondary', priority: 20 }, o);
            const tertiary = service.AddSlot({ vendor: 'agy', slotId: 'agy-tertiary', priority: 30 }, o);
            seedSlotCredentials(primary);
            seedSlotCredentials(secondary);
            seedSlotCredentials(tertiary);

            const now = Date.parse('2026-11-24T12:00:00.000Z');
            const l1 = service.AcquireSlotLease({ vendor: 'agy', strategy: 'priority-failover' }, opts({ nowMs: now }));
            const l2 = service.AcquireSlotLease({ vendor: 'agy', strategy: 'priority-failover' }, opts({ nowMs: now }));
            expect(l1?.slotId).toBe('agy-primary');
            expect(l2?.slotId).toBe('agy-primary');

            // Put primary into cooldown -> must fail over to secondary
            service.MarkSlotCooldown(
                'agy-primary',
                'HTTP 429 rate_limit_error',
                new Date(now + 15 * 60_000).toISOString(),
                opts({ nowMs: now }),
            );
            const l3 = service.AcquireSlotLease({ vendor: 'agy', strategy: 'priority-failover' }, opts({ nowMs: now + 1000 }));
            expect(l3?.slotId).toBe('agy-secondary');

            // Exclude secondary as well -> must fail over to tertiary
            const l4 = service.AcquireSlotLease(
                { vendor: 'agy', strategy: 'priority-failover', excludeSlotIds: ['agy-secondary'] },
                opts({ nowMs: now + 2000 }),
            );
            expect(l4?.slotId).toBe('agy-tertiary');

            // After cooldown expires, primary returns to service
            const l5 = service.AcquireSlotLease(
                { vendor: 'agy', strategy: 'priority-failover' },
                opts({ nowMs: now + 16 * 60_000 }),
            );
            expect(l5?.slotId).toBe('agy-primary');
        });
    });

    describe('Lease Reclamation (Dead PIDs, Expiry & Renewal)', () => {
        it('reclaims expired leases and leases owned by dead PIDs automatically', () => {
            const service = HarnessAccountPoolService.Instance;
            const now = Date.parse('2026-11-24T12:00:00.000Z');
            const o = opts({ nowMs: now });
            service.SetIncludeOsDefaultLogin(false, o);

            const s1 = service.AddSlot({ vendor: 'claude', slotId: 'claude-1' }, o);
            seedSlotCredentials(s1);

            const leasesDir = service.GetLeasesDir(o);
            fs.mkdirSync(leasesDir, { recursive: true });

            // Write 1 dead-PID lease, 1 expired lease, 1 live lease, and 1 corrupt lease file
            fs.writeFileSync(
                path.join(leasesDir, 'lease-dead.json'),
                JSON.stringify({
                    leaseId: 'lease-dead',
                    slotId: 'claude-1',
                    vendor: 'claude',
                    pid: 999991,
                    ownerLabel: 'dead-worker',
                    acquiredAtIso: new Date(now - 10_000).toISOString(),
                    expiresAtIso: new Date(now + 600_000).toISOString(),
                }),
                'utf8',
            );
            fs.writeFileSync(
                path.join(leasesDir, 'lease-expired.json'),
                JSON.stringify({
                    leaseId: 'lease-expired',
                    slotId: 'claude-1',
                    vendor: 'claude',
                    pid: process.pid,
                    ownerLabel: 'expired-worker',
                    acquiredAtIso: new Date(now - 600_000).toISOString(),
                    expiresAtIso: new Date(now - 1_000).toISOString(),
                }),
                'utf8',
            );
            fs.writeFileSync(
                path.join(leasesDir, 'lease-live.json'),
                JSON.stringify({
                    leaseId: 'lease-live',
                    slotId: 'claude-1',
                    vendor: 'claude',
                    pid: process.pid,
                    ownerLabel: 'live-worker',
                    acquiredAtIso: new Date(now - 5_000).toISOString(),
                    expiresAtIso: new Date(now + 600_000).toISOString(),
                }),
                'utf8',
            );
            fs.writeFileSync(path.join(leasesDir, 'lease-corrupt.json'), '{not-valid-json', 'utf8');

            const active = service.ListActiveLeases(
                opts({
                    nowMs: now,
                    isPidAlive: (pid) => pid === process.pid,
                }),
            );
            expect(active.map((l) => l.leaseId)).toEqual(['lease-live']);
            expect(fs.existsSync(path.join(leasesDir, 'lease-dead.json'))).toBe(false);
            expect(fs.existsSync(path.join(leasesDir, 'lease-expired.json'))).toBe(false);
            expect(fs.existsSync(path.join(leasesDir, 'lease-corrupt.json'))).toBe(false);
            expect(fs.existsSync(path.join(leasesDir, 'lease-live.json'))).toBe(true);
        });

        it('renews lease TTL and releases leases idempotently', () => {
            const service = HarnessAccountPoolService.Instance;
            const now = Date.parse('2026-11-24T12:00:00.000Z');
            const o = opts({ nowMs: now });
            service.SetIncludeOsDefaultLogin(false, o);

            const s1 = service.AddSlot({ vendor: 'codex', slotId: 'codex-1' }, o);
            seedSlotCredentials(s1);

            const lease = service.AcquireSlotLease({ vendor: 'codex', ttlMs: 60_000 }, o);
            expect(lease).not.toBeNull();
            expect(lease!.expiresAtIso).toBe(new Date(now + 60_000).toISOString());

            const renewed = service.RenewSlotLease(lease!.leaseId, 300_000, opts({ nowMs: now + 30_000 }));
            expect(renewed?.expiresAtIso).toBe(new Date(now + 330_000).toISOString());

            expect(service.ReleaseSlotLease(lease!.leaseId, o)).toBe(true);
            expect(service.ReleaseSlotLease(lease!.leaseId, o)).toBe(false);
            expect(service.RenewSlotLease(lease!.leaseId, 60_000, o)).toBeNull();
        });
    });

    describe('Isolated Env Overrides & PrepareIsolatedHomeSlotDir', () => {
        it('returns CLAUDE_CONFIG_DIR (+ optional CLAUDE_CODE_OAUTH_TOKEN) for claude and CODEX_HOME for codex', () => {
            const service = HarnessAccountPoolService.Instance;
            const o = opts();
            service.SetIncludeOsDefaultLogin(false, o);

            const claudeSlot = service.AddSlot(
                { vendor: 'claude', slotId: 'claude-pro', oauthTokenEnvValue: 'oauth-setup-token-xyz' },
                o,
            );
            const codexSlot = service.AddSlot({ vendor: 'codex', slotId: 'codex-team' }, o);
            seedSlotCredentials(codexSlot);

            // Claude slot authenticated via setup-token even without .credentials.json on disk
            expect(service.ProbeSlotAuthStatus(claudeSlot, o).authenticated).toBe(true);

            const claudeLease = service.AcquireSlotLease({ vendor: 'claude' }, o);
            expect(claudeLease?.envOverrides).toEqual({
                CLAUDE_CONFIG_DIR: claudeSlot.slotDir,
                CLAUDE_CODE_OAUTH_TOKEN: 'oauth-setup-token-xyz',
            });

            const codexLease = service.AcquireSlotLease({ vendor: 'codex' }, o);
            expect(codexLease?.envOverrides).toEqual({
                CODEX_HOME: codexSlot.slotDir,
            });
        });

        it('prepares symlinked HOME/XDG_CONFIG_HOME for agy and gemini without mutating realHomeDir or sharing auth dirs', () => {
            // Populate realistic toolchain files/dirs in fakeRealHome
            fs.writeFileSync(path.join(fakeRealHome, '.gitconfig'), '[user]\nname = Dev\n', 'utf8');
            fs.mkdirSync(path.join(fakeRealHome, '.ssh'), { recursive: true });
            fs.writeFileSync(path.join(fakeRealHome, '.ssh', 'config'), 'Host *\n', 'utf8');
            fs.writeFileSync(path.join(fakeRealHome, '.npmrc'), 'registry=https://registry.npmjs.org/\n', 'utf8');
            fs.mkdirSync(path.join(fakeRealHome, '.nvm'), { recursive: true });
            fs.mkdirSync(path.join(fakeRealHome, '.volta'), { recursive: true });
            fs.mkdirSync(path.join(fakeRealHome, '.asdf'), { recursive: true });
            fs.mkdirSync(path.join(fakeRealHome, '.local'), { recursive: true });
            fs.mkdirSync(path.join(fakeRealHome, '.cargo'), { recursive: true });
            fs.mkdirSync(path.join(fakeRealHome, 'Library', 'Caches'), { recursive: true });
            fs.mkdirSync(path.join(fakeRealHome, '.cache'), { recursive: true });
            // Put OS-level credentials in fakeRealHome that MUST NOT leak into isolated slots
            fs.mkdirSync(path.join(fakeRealHome, '.gemini', 'antigravity'), { recursive: true });
            fs.writeFileSync(path.join(fakeRealHome, '.gemini', 'oauth_creds.json'), '{"os":"secret"}', 'utf8');

            const macSlotDir = path.join(poolDir, 'agy', 'agy-mac');
            PrepareIsolatedHomeSlotDir(macSlotDir, fakeRealHome, 'darwin');

            // .config and .gemini MUST be real local directories, NOT symlinks
            expect(fs.lstatSync(path.join(macSlotDir, '.config')).isSymbolicLink()).toBe(false);
            expect(fs.lstatSync(path.join(macSlotDir, '.gemini')).isSymbolicLink()).toBe(false);
            expect(fs.existsSync(path.join(macSlotDir, '.gemini', 'antigravity'))).toBe(false);
            expect(fs.existsSync(path.join(macSlotDir, '.gemini', 'oauth_creds.json'))).toBe(false);

            // Toolchain & macOS cache entries MUST be symlinks pointing to realHome
            for (const item of ['.gitconfig', '.ssh', '.npmrc', '.nvm', '.volta', '.asdf', '.local', '.cargo']) {
                const target = path.join(macSlotDir, item);
                expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
                expect(fs.readlinkSync(target)).toBe(path.join(fakeRealHome, item));
            }
            expect(fs.lstatSync(path.join(macSlotDir, 'Library', 'Caches')).isSymbolicLink()).toBe(true);
            expect(fs.readlinkSync(path.join(macSlotDir, 'Library', 'Caches'))).toBe(
                path.join(fakeRealHome, 'Library', 'Caches'),
            );

            // Linux variant symlinks .cache
            const linuxSlotDir = path.join(poolDir, 'gemini', 'gemini-linux');
            PrepareIsolatedHomeSlotDir(linuxSlotDir, fakeRealHome, 'linux');
            expect(fs.lstatSync(path.join(linuxSlotDir, '.cache')).isSymbolicLink()).toBe(true);
            expect(fs.readlinkSync(path.join(linuxSlotDir, '.cache'))).toBe(path.join(fakeRealHome, '.cache'));

            // AcquireSlotLease returns exact envOverrides for agy
            const service = HarnessAccountPoolService.Instance;
            const o = opts({ platform: 'darwin' });
            service.SetIncludeOsDefaultLogin(false, o);
            const agySlot = service.AddSlot({ vendor: 'agy', slotId: 'agy-acct-2' }, o);
            // Before login, isolated slot MUST report unauthenticated even though fakeRealHome has OS login!
            expect(service.ProbeSlotAuthStatus(agySlot, o).authenticated).toBe(false);

            seedSlotCredentials(agySlot);
            expect(service.ProbeSlotAuthStatus(agySlot, o).authenticated).toBe(true);

            const lease = service.AcquireSlotLease({ vendor: 'agy' }, o);
            expect(lease?.envOverrides).toEqual({
                HOME: agySlot.slotDir,
                XDG_CONFIG_HOME: path.join(agySlot.slotDir, '.config'),
                MJ_HARNESS_REAL_HOME: fakeRealHome,
            });

            // Purging slot files MUST NOT delete or mutate anything in fakeRealHome
            service.RemoveSlot(agySlot.slotId, { purgeFiles: true }, o);
            expect(fs.existsSync(agySlot.slotDir)).toBe(false);
            expect(fs.existsSync(path.join(fakeRealHome, '.gitconfig'))).toBe(true);
            expect(fs.existsSync(path.join(fakeRealHome, '.ssh', 'config'))).toBe(true);
            expect(fs.existsSync(path.join(fakeRealHome, '.gemini', 'oauth_creds.json'))).toBe(true);
        });

        it('strictly isolates unauthenticated claude and codex slots from OS default login', () => {
            // Seed OS default logins in fakeRealHome
            fs.mkdirSync(path.join(fakeRealHome, '.claude'), { recursive: true });
            fs.writeFileSync(path.join(fakeRealHome, '.claude', '.credentials.json'), '{}', 'utf8');
            fs.mkdirSync(path.join(fakeRealHome, '.codex'), { recursive: true });
            fs.writeFileSync(path.join(fakeRealHome, '.codex', 'auth.json'), '{}', 'utf8');

            const service = HarnessAccountPoolService.Instance;
            const o = opts();
            const unauthClaude = service.AddSlot({ vendor: 'claude', slotId: 'claude-empty' }, o);
            const unauthCodex = service.AddSlot({ vendor: 'codex', slotId: 'codex-empty' }, o);

            expect(service.ProbeSlotAuthStatus(unauthClaude, o).authenticated).toBe(false);
            expect(service.ProbeSlotAuthStatus(unauthCodex, o).authenticated).toBe(false);
        });
    });

    describe('1 + N Hybrid Pooling (OS Default + Enrolled Slots)', () => {
        it('automatically balances os-default-<vendor> alongside enrolled isolated slots', () => {
            // Seed OS default Claude login
            fs.mkdirSync(path.join(fakeRealHome, '.claude'), { recursive: true });
            fs.writeFileSync(path.join(fakeRealHome, '.claude', '.credentials.json'), '{}', 'utf8');

            const service = HarnessAccountPoolService.Instance;
            const now = Date.parse('2026-11-24T13:00:00.000Z');
            const o = opts({ nowMs: now });

            const extra = service.AddSlot({ vendor: 'claude', slotId: 'claude-extra', label: 'Extra Pro' }, o);
            seedSlotCredentials(extra);

            const listed = service.ListSlots({ vendor: 'claude' }, o);
            expect(listed.map((s) => s.slotId).sort()).toEqual(['claude-extra', 'os-default-claude']);
            expect(listed.every((s) => s.authenticated && s.authStatus === 'Ready')).toBe(true);

            // Acquire 2 concurrent leases -> one gets claude-extra (isolated envOverrides), one gets os-default-claude (empty envOverrides)
            const l1 = service.AcquireSlotLease({ vendor: 'claude' }, opts({ nowMs: now }));
            const l2 = service.AcquireSlotLease({ vendor: 'claude' }, opts({ nowMs: now + 1000 }));
            expect(l1).not.toBeNull();
            expect(l2).not.toBeNull();
            expect(new Set([l1!.slotId, l2!.slotId])).toEqual(new Set(['claude-extra', 'os-default-claude']));

            const osLease = l1!.isOsDefault ? l1! : l2!;
            const isolatedLease = l1!.isOsDefault ? l2! : l1!;
            expect(osLease.envOverrides).toEqual({});
            expect(isolatedLease.envOverrides).toEqual({ CLAUDE_CONFIG_DIR: extra.slotDir });

            // Cooldown & disable work on os-default-claude too
            service.MarkSlotCooldown('os-default-claude', '429 limit hit', new Date(now + 60_000).toISOString(), o);
            const afterCooldown = service.GetSlot('os-default-claude', o);
            expect(afterCooldown?.inCooldown).toBe(true);
            expect(afterCooldown?.totalRateLimitHits).toBe(1);

            service.ClearSlotCooldown('os-default-claude', o);
            expect(service.GetSlot('os-default-claude', o)?.inCooldown).toBe(false);

            service.SetSlotEnabled('os-default-claude', false, o);
            expect(service.GetSlot('os-default-claude', o)?.enabled).toBe(false);
        });
    });

    describe('Live CLI Binary Health Probing', () => {
        it('flags slots as Binary Missing and blocks HasHealthySlot / AcquireSlotLease when credentials exist but binary is unrunnable', () => {
            // Simulate ~/.codex/auth.json present on disk while the `codex` binary throws ENOENT
            fs.mkdirSync(path.join(fakeRealHome, '.codex'), { recursive: true });
            fs.writeFileSync(path.join(fakeRealHome, '.codex', 'auth.json'), '{"tokens":{}}', 'utf8');

            const service = HarnessAccountPoolService.Instance;
            const failingProbe = (
                vendor: 'claude' | 'agy' | 'codex' | 'gemini',
                binary: string,
            ) =>
                vendor === 'codex'
                    ? { Available: false, Binary: binary, Error: 'spawnSync codex ENOENT' }
                    : { Available: true, Binary: binary, Version: '1.0.0' };

            const probeOpts = opts({
                VerifyBinaryExecutable: true,
                BinaryProbe: failingProbe,
            });

            // os-default-codex still appears in ListSlots (so operators see the stale auth file),
            // but authStatus is 'Binary Missing' instead of misleadingly saying 'Ready'
            const listed = service.ListSlots({ vendor: 'codex' }, probeOpts);
            expect(listed).toHaveLength(1);
            expect(listed[0].slotId).toBe('os-default-codex');
            expect(listed[0].authenticated).toBe(true);
            expect(listed[0].BinaryAvailable).toBe(false);
            expect(listed[0].BinaryError).toContain('ENOENT');
            expect(listed[0].authStatus).toBe('Binary Missing');

            // HasHealthySlot and AcquireSlotLease MUST treat the broken binary as unusable
            expect(service.HasHealthySlot('codex', undefined, probeOpts)).toBe(false);
            expect(service.AcquireSlotLease({ vendor: 'codex' }, probeOpts)).toBeNull();

            // When binary IS healthy, the same credentials report Ready and lease cleanly
            const healthyOpts = opts({
                VerifyBinaryExecutable: true,
                BinaryProbe: (_vendor, binary) => ({ Available: true, Binary: binary, Version: '0.1.0' }),
            });
            const healthyListed = service.ListSlots({ vendor: 'codex' }, healthyOpts);
            expect(healthyListed[0].authStatus).toBe('Ready');
            expect(healthyListed[0].BinaryAvailable).toBe(true);
            expect(service.HasHealthySlot('codex', undefined, healthyOpts)).toBe(true);
            const lease = service.AcquireSlotLease({ vendor: 'codex' }, healthyOpts);
            expect(lease?.slotId).toBe('os-default-codex');
            if (lease) {
                service.ReleaseSlotLease(lease.leaseId, healthyOpts);
            }
        });

        it('memoizes default ProbeVendorBinaryAvailable results per (vendor, PATH) and clears via ClearBinaryProbeCache', () => {
            const service = HarnessAccountPoolService.Instance;
            service.ClearBinaryProbeCache();

            const emptyBinDir = makeTempDir('mj-empty-path-');
            tempDirs.push(emptyBinDir);
            const t0 = Date.parse('2026-11-24T15:00:00.000Z');
            const emptyPathOpts = opts({
                env: { HOME: fakeRealHome, PATH: emptyBinDir },
                nowMs: t0,
            });

            const first = service.ProbeVendorBinaryAvailable('codex', emptyPathOpts);
            expect(first.Available).toBe(false);
            expect(first.Binary).toBe('codex');
            expect(first.Error).toBeTruthy();

            // Second call within TTL returns the exact memoized object
            const second = service.ProbeVendorBinaryAvailable('codex', {
                ...emptyPathOpts,
                nowMs: t0 + 1000,
            });
            expect(second).toBe(first);

            // Clearing the cache forces a fresh probe
            service.ClearBinaryProbeCache();
            const third = service.ProbeVendorBinaryAvailable('codex', {
                ...emptyPathOpts,
                nowMs: t0 + 2000,
            });
            expect(third).not.toBe(first);
            expect(third.Available).toBe(false);
        });
    });
});
