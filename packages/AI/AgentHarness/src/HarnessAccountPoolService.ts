/**
 * @fileoverview Multi-account CLI subscription pool, lock-free per-lease tracking,
 * N-account auto-balancing, and isolated slot home preparation for `@memberjunction/ai-agent-harness`.
 *
 * Enables `1 + N` subscription balancing across Claude Code, Antigravity (`agy`), OpenAI Codex,
 * and Gemini CLI without requiring users to migrate away from their default OS login.
 *
 * @module @memberjunction/ai-agent-harness
 */

import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BaseSingleton } from '@memberjunction/global';
import { DetectLocalCliLoginSession } from './HarnessCredentialResolver.js';
import { DEFAULT_HARNESS_QUOTA_COOLDOWN_MS } from './HarnessQuotaClassifier.js';
import type { HarnessAccountSelectionStrategy, HarnessPoolVendor } from './types.js';

/** Environment variable overriding the default account pool storage directory (`~/.mj/harness-accounts`). */
export const HARNESS_ACCOUNT_POOL_DIR_ENV_VAR = 'MJ_HARNESS_ACCOUNT_POOL_DIR';

/** Environment variable preserving the host user's real `$HOME` when running inside an isolated slot `$HOME`. */
export const HARNESS_REAL_HOME_ENV_VAR = 'MJ_HARNESS_REAL_HOME';

/** Default lease TTL when `AcquireSlotLease` does not specify one (30 minutes). */
export const DEFAULT_HARNESS_LEASE_TTL_MS = 30 * 60 * 1000;

/** Default timeout (ms) for lightweight per-vendor CLI binary availability probes (`<binary> --version`). */
export const DEFAULT_HARNESS_BINARY_PROBE_TIMEOUT_MS = 3000;

/** Default TTL (ms) for memoizing per-vendor CLI binary availability results (30 seconds). */
export const DEFAULT_HARNESS_BINARY_PROBE_CACHE_TTL_MS = 30_000;

/** Canonical list of CLI vendors supported by the multi-account pool. */
export const HARNESS_POOL_VENDORS: readonly HarnessPoolVendor[] = ['claude', 'agy', 'codex', 'gemini'];

/** Canonical list of supported account selection strategies. */
export const HARNESS_ACCOUNT_SELECTION_STRATEGIES: readonly HarnessAccountSelectionStrategy[] = [
    'least-in-flight',
    'round-robin',
    'weighted',
    'priority-failover',
];

const HOME_TOOLCHAIN_SYMLINKS: readonly string[] = [
    '.gitconfig',
    '.ssh',
    '.npmrc',
    '.nvm',
    '.volta',
    '.asdf',
    '.local',
    '.cargo',
];

/**
 * Normalizes a vendor alias or adapter driver class name to a canonical {@link HarnessPoolVendor}.
 *
 * Supported mappings:
 * - `'claude' | 'claude-code'` -> `'claude'`
 * - `'agy' | 'antigravity'` -> `'agy'`
 * - `'codex' | 'openai-codex'` -> `'codex'`
 * - `'gemini' | 'gemini-cli'` -> `'gemini'`
 */
export function NormalizeHarnessPoolVendor(input: string | null | undefined): HarnessPoolVendor | null {
    if (typeof input !== 'string') {
        return null;
    }
    const normalized = input.trim().toLowerCase();
    switch (normalized) {
        case 'claude':
        case 'claude-code':
        case 'claudecode':
        case 'claude_code':
        case 'claudecodecliadapter':
            return 'claude';
        case 'agy':
        case 'antigravity':
        case 'antigravity-cli':
        case 'antigravitycliadapter':
            return 'agy';
        case 'codex':
        case 'openai-codex':
        case 'codex-cli':
        case 'codexadapter':
            return 'codex';
        case 'gemini':
        case 'gemini-cli':
        case 'geminicli':
        case 'geminicliadapter':
            return 'gemini';
        default:
            return null;
    }
}

/** Maps a registered local CLI adapter `DriverClass` to its canonical {@link HarnessPoolVendor}, or `null`. */
export function DriverClassToHarnessPoolVendor(driverClass: string | null | undefined): HarnessPoolVendor | null {
    switch (driverClass) {
        case 'ClaudeCodeCliAdapter':
            return 'claude';
        case 'AntigravityCliAdapter':
            return 'agy';
        case 'CodexAdapter':
            return 'codex';
        case 'GeminiCliAdapter':
            return 'gemini';
        default:
            return null;
    }
}

/** Maps a canonical {@link HarnessPoolVendor} to its local CLI adapter `DriverClass`. */
export function HarnessPoolVendorToDriverClass(vendor: HarnessPoolVendor): string {
    switch (vendor) {
        case 'claude':
            return 'ClaudeCodeCliAdapter';
        case 'agy':
            return 'AntigravityCliAdapter';
        case 'codex':
            return 'CodexAdapter';
        case 'gemini':
            return 'GeminiCliAdapter';
    }
}

/** Parses and validates a selection strategy name into {@link HarnessAccountSelectionStrategy}, or `null`. */
export function ParseHarnessAccountSelectionStrategy(
    value: string | null | undefined,
): HarnessAccountSelectionStrategy | null {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (
        normalized === 'least-in-flight' ||
        normalized === 'round-robin' ||
        normalized === 'weighted' ||
        normalized === 'priority-failover'
    ) {
        return normalized;
    }
    return null;
}

/** Returns the synthetic slot ID representing the host user's default OS `$HOME` login for `vendor`. */
export function OsDefaultSlotIdForVendor(vendor: HarnessPoolVendor): string {
    return `os-default-${vendor}`;
}

/** Extracts the vendor from a synthetic `os-default-<vendor>` slot ID, or `null` if not an OS-default ID. */
export function ParseOsDefaultSlotVendor(slotId: string): HarnessPoolVendor | null {
    const trimmed = slotId.trim().toLowerCase();
    if (!trimmed.startsWith('os-default-')) {
        return null;
    }
    return NormalizeHarnessPoolVendor(trimmed.slice('os-default-'.length));
}

/** Persisted per-account slot record in `<poolDir>/pool.json`. */
export interface HarnessAccountSlotRecord {
    slotId: string;
    vendor: HarnessPoolVendor;
    label: string;
    identityEmail?: string;
    identityOrg?: string;
    slotDir: string;
    oauthTokenEnvValue?: string;
    enabled: boolean;
    weight: number;
    priority: number;
    createdAtIso: string;
    lastUsedAtIso?: string;
    totalTurnsExecuted: number;
    totalRateLimitHits: number;
    cooldownUntilIso?: string;
    lastCooldownReason?: string;
    /** True only for synthesized `os-default-<vendor>` slots backed by the user's normal OS `$HOME`. */
    isOsDefault?: boolean;
}

/** Persisted operational state overlay for synthetic `os-default-<vendor>` slots. */
export interface HarnessOsDefaultSlotState {
    enabled?: boolean;
    weight?: number;
    priority?: number;
    label?: string;
    lastUsedAtIso?: string;
    totalTurnsExecuted?: number;
    totalRateLimitHits?: number;
    cooldownUntilIso?: string;
    lastCooldownReason?: string;
}

/** Schema of `<poolDir>/pool.json` (`version: 1`). */
export interface HarnessAccountPoolFile {
    version: 1;
    strategy: HarnessAccountSelectionStrategy;
    includeOsDefaultLogin: boolean;
    roundRobinCursorByVendor?: Partial<Record<HarnessPoolVendor, number>>;
    slots: HarnessAccountSlotRecord[];
    osDefaultStates?: Partial<Record<HarnessPoolVendor, HarnessOsDefaultSlotState>>;
}

/** Per-lease file written under `<poolDir>/leases/<leaseId>.json`. */
export interface HarnessAccountLeaseRecord {
    leaseId: string;
    slotId: string;
    vendor: HarnessPoolVendor;
    pid: number;
    ownerLabel: string;
    acquiredAtIso: string;
    expiresAtIso: string;
}

/** Active slot lease returned by {@link HarnessAccountPoolService.AcquireSlotLease}. */
export interface HarnessAccountLease extends HarnessAccountLeaseRecord {
    /** Snapshot of the leased slot record. */
    slot: HarnessAccountSlotRecord;
    /** Exact subprocess environment overrides required to route the CLI to this slot's credentials. */
    envOverrides: Record<string, string>;
    /** True when the lease targets the synthetic `os-default-<vendor>` slot. */
    isOsDefault: boolean;
    /** Selection strategy that chose this slot. */
    strategyUsed: HarnessAccountSelectionStrategy;
}

/** Result of probing whether a vendor's CLI executable is installed and runnable on `PATH`. */
export interface HarnessVendorBinaryProbeResult {
    Available: boolean;
    Binary: string;
    Version?: string;
    Error?: string;
}

/** Injectable per-vendor CLI binary executability probe signature (for deterministic unit tests). */
export type HarnessVendorBinaryProbe = (
    vendor: HarnessPoolVendor,
    binary: string,
    timeoutMs: number,
) => HarnessVendorBinaryProbeResult;

/** Display status for a slot's CLI subscription authentication and binary health. */
export type HarnessSlotAuthDisplayStatus = 'Ready' | 'Binary Missing' | 'Needs Login';

/** Result of probing whether a slot has usable CLI subscription credentials on disk or via token. */
export interface HarnessSlotAuthStatus {
    authenticated: boolean;
    indicatorPath: string | null;
    statusLabel: HarnessSlotAuthDisplayStatus;
    /** Present when binary executability probing was enabled (`VerifyBinaryExecutable` or `BinaryProbe`). */
    BinaryAvailable?: boolean;
    /** Concise diagnostic when `BinaryAvailable` is `false`. */
    BinaryError?: string;
}

/** Enriched slot view returned by {@link HarnessAccountPoolService.ListSlots} and {@link HarnessAccountPoolService.GetSlot}. */
export interface HarnessAccountSlotStatus extends HarnessAccountSlotRecord {
    authenticated: boolean;
    authIndicatorPath: string | null;
    authStatus: HarnessSlotAuthDisplayStatus;
    /** Present when binary executability probing was enabled (`VerifyBinaryExecutable` or `BinaryProbe`). */
    BinaryAvailable?: boolean;
    /** Concise diagnostic when `BinaryAvailable` is `false`. */
    BinaryError?: string;
    activeLeaseCount: number;
    activeLeases: HarnessAccountLeaseRecord[];
    inCooldown: boolean;
    envOverrides: Record<string, string>;
}

/** Optional configuration overrides for {@link HarnessAccountPoolService} operations. */
export interface HarnessAccountPoolOptions {
    /** Explicit pool directory override (defaults to `MJ_HARNESS_ACCOUNT_POOL_DIR` or `~/.mj/harness-accounts`). */
    poolDir?: string;
    /** Explicit host `$HOME` override (for hermetic testing). */
    realHomeDir?: string;
    /** Explicit process environment override (for hermetic testing). */
    env?: NodeJS.ProcessEnv;
    /** Explicit clock override in epoch ms (for deterministic testing). */
    nowMs?: number;
    /** Default cooldown duration in ms when `MarkSlotCooldown` omits `cooldownUntilIso`. */
    defaultCooldownMs?: number;
    /** Default lease TTL in ms when `AcquireSlotLease` omits `ttlMs`. */
    defaultLeaseTtlMs?: number;
    /** Override OS platform for `PrepareIsolatedHomeSlotDir` tests (`'darwin' | 'linux'`). */
    platform?: NodeJS.Platform;
    /** Custom PID liveness checker for unit tests. Defaults to `process.kill(pid, 0)`. */
    isPidAlive?: (pid: number) => boolean;
    /**
     * When `true`, `ProbeSlotAuthStatus`, `ListSlots`, `HasHealthySlot`, and `AcquireSlotLease`
     * also verify that the vendor's CLI binary executes `<binary> --version` successfully.
     * Defaults to `false` so hermetic unit tests without vendor CLIs on `PATH` stay deterministic.
     */
    VerifyBinaryExecutable?: boolean;
    /** Custom per-vendor binary probe override (implicitly enables binary probing for the call). */
    BinaryProbe?: HarnessVendorBinaryProbe;
    /** Timeout (ms) for default `<binary> --version` probe (default: 3000ms). */
    BinaryProbeTimeoutMs?: number;
}

/** Parameters for {@link HarnessAccountPoolService.AddSlot}. */
export interface AddHarnessAccountSlotParams {
    vendor: HarnessPoolVendor | string;
    label?: string;
    slotId?: string;
    identityEmail?: string;
    identityOrg?: string;
    oauthTokenEnvValue?: string;
    weight?: number;
    priority?: number;
    enabled?: boolean;
}

/** Parameters for {@link HarnessAccountPoolService.AcquireSlotLease}. */
export interface AcquireSlotLeaseParams {
    vendor: HarnessPoolVendor | string;
    strategy?: HarnessAccountSelectionStrategy;
    slotId?: string;
    ownerLabel?: string;
    ttlMs?: number;
    excludeSlotIds?: readonly string[];
    pid?: number;
}

/** Interactive login command descriptor for a CLI vendor. */
export interface InteractiveLoginCommandSpec {
    command: string;
    args: string[];
    displayCommand: string;
}

/**
 * Prepares an isolated `$HOME` slot directory for CLIs that store credentials under `$HOME` /
 * `$XDG_CONFIG_HOME` (`agy` and `gemini`).
 *
 * Ensures `<slotDir>`, `<slotDir>/.config`, and `<slotDir>/.gemini` exist as real local
 * directories (keeping `.gemini/antigravity`, `.config/antigravity`, `.gemini/oauth_creds.json`,
 * and `.gemini/google_accounts.json` strictly isolated to `<slotDir>`) while safely symlinking
 * host developer toolchain and git/ssh/npm configs from `realHomeDir`.
 *
 * Never mutates or deletes anything inside `realHomeDir`.
 */
export function PrepareIsolatedHomeSlotDir(
    slotDir: string,
    realHomeDir?: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const resolvedSlotDir = path.resolve(slotDir);
    fs.mkdirSync(resolvedSlotDir, { recursive: true });
    fs.mkdirSync(path.join(resolvedSlotDir, '.config'), { recursive: true });
    fs.mkdirSync(path.join(resolvedSlotDir, '.gemini'), { recursive: true });

    const effectiveRealHome = resolveRealHomePath(realHomeDir);
    if (!effectiveRealHome) {
        return resolvedSlotDir;
    }

    const resolvedRealHome = path.resolve(effectiveRealHome);
    if (resolvedRealHome === resolvedSlotDir) {
        return resolvedSlotDir;
    }

    for (const entryName of HOME_TOOLCHAIN_SYMLINKS) {
        ensureSafeSymlink(
            path.join(resolvedRealHome, entryName),
            path.join(resolvedSlotDir, entryName),
        );
    }

    if (platform === 'darwin') {
        const sourceLibraryCaches = path.join(resolvedRealHome, 'Library', 'Caches');
        if (pathExistsRaw(sourceLibraryCaches)) {
            fs.mkdirSync(path.join(resolvedSlotDir, 'Library'), { recursive: true });
            ensureSafeSymlink(
                sourceLibraryCaches,
                path.join(resolvedSlotDir, 'Library', 'Caches'),
            );
        }
    } else if (platform === 'linux') {
        ensureSafeSymlink(
            path.join(resolvedRealHome, '.cache'),
            path.join(resolvedSlotDir, '.cache'),
        );
    }

    return resolvedSlotDir;
}

/**
 * Singleton service managing the multi-account CLI subscription pool (`~/.mj/harness-accounts`),
 * lock-free per-lease files, N-account auto-balancing across 4 strategies, and quota cooldowns.
 */
export class HarnessAccountPoolService extends BaseSingleton<HarnessAccountPoolService> {
    private readonly binaryProbeCache = new Map<
        string,
        { Result: HarnessVendorBinaryProbeResult; ExpiresAtMs: number }
    >();

    protected constructor() {
        super();
    }

    /** Process-wide singleton instance backed by `GetGlobalObjectStore()`. */
    public static get Instance(): HarnessAccountPoolService {
        return super.getInstance<HarnessAccountPoolService>();
    }

    /** Resolves the effective pool root directory (`options.poolDir` > `MJ_HARNESS_ACCOUNT_POOL_DIR` > `~/.mj/harness-accounts`). */
    public GetPoolDir(options?: HarnessAccountPoolOptions): string {
        const env = options?.env ?? process.env;
        const explicit = nonEmptyString(options?.poolDir);
        if (explicit) {
            return path.resolve(explicit);
        }
        const fromEnv = nonEmptyString(env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR]);
        if (fromEnv) {
            return path.resolve(fromEnv);
        }
        const home = this.GetRealHomeDir(options);
        return path.join(home, '.mj', 'harness-accounts');
    }

    /** Returns `<poolDir>/pool.json`. */
    public GetPoolFilePath(options?: HarnessAccountPoolOptions): string {
        return path.join(this.GetPoolDir(options), 'pool.json');
    }

    /** Returns `<poolDir>/leases`. */
    public GetLeasesDir(options?: HarnessAccountPoolOptions): string {
        return path.join(this.GetPoolDir(options), 'leases');
    }

    /** Resolves the host user's real `$HOME` directory without recursing into isolated slot homes. */
    public GetRealHomeDir(options?: HarnessAccountPoolOptions): string {
        const env = options?.env ?? process.env;
        return (
            resolveRealHomePath(options?.realHomeDir, env) ??
            os.homedir()
        );
    }

    /** Loads `<poolDir>/pool.json`, returning a clean default v1 pool when the file does not exist yet. */
    public LoadPool(options?: HarnessAccountPoolOptions): HarnessAccountPoolFile {
        const poolFile = this.GetPoolFilePath(options);
        if (!fs.existsSync(poolFile)) {
            return createDefaultPoolFile();
        }
        try {
            const raw = fs.readFileSync(poolFile, 'utf8');
            const parsed = JSON.parse(raw) as Partial<HarnessAccountPoolFile>;
            const strategy =
                ParseHarnessAccountSelectionStrategy(parsed.strategy) ?? 'least-in-flight';
            const includeOsDefaultLogin =
                typeof parsed.includeOsDefaultLogin === 'boolean'
                    ? parsed.includeOsDefaultLogin
                    : true;
            const slots = Array.isArray(parsed.slots)
                ? parsed.slots
                      .filter((s): s is HarnessAccountSlotRecord => isValidSlotRecord(s))
                      .map((s) => normalizeSlotRecord(s))
                : [];
            return {
                version: 1,
                strategy,
                includeOsDefaultLogin,
                roundRobinCursorByVendor: sanitizeCursorMap(parsed.roundRobinCursorByVendor),
                slots,
                osDefaultStates: sanitizeOsDefaultStates(parsed.osDefaultStates),
            };
        } catch {
            return createDefaultPoolFile();
        }
    }

    /** Atomically writes `<poolDir>/pool.json` via `<poolDir>/pool.json.tmp.<pid>.<nonce>` + `fs.renameSync`. */
    public SavePool(pool: HarnessAccountPoolFile, options?: HarnessAccountPoolOptions): void {
        const poolDir = this.GetPoolDir(options);
        fs.mkdirSync(poolDir, { recursive: true });
        const poolFile = path.join(poolDir, 'pool.json');
        const normalized: HarnessAccountPoolFile = {
            version: 1,
            strategy: ParseHarnessAccountSelectionStrategy(pool.strategy) ?? 'least-in-flight',
            includeOsDefaultLogin: pool.includeOsDefaultLogin !== false,
            roundRobinCursorByVendor: sanitizeCursorMap(pool.roundRobinCursorByVendor),
            slots: pool.slots.map((s) => normalizeSlotRecord(s)),
            osDefaultStates: sanitizeOsDefaultStates(pool.osDefaultStates),
        };
        atomicWriteJsonFile(poolFile, normalized);
    }

    /** Returns the active default selection strategy for the pool. */
    public GetStrategy(options?: HarnessAccountPoolOptions): HarnessAccountSelectionStrategy {
        return this.LoadPool(options).strategy;
    }

    /** Updates and persists the pool's default selection strategy. */
    public SetStrategy(
        strategy: HarnessAccountSelectionStrategy,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountPoolFile {
        const parsed = ParseHarnessAccountSelectionStrategy(strategy);
        if (!parsed) {
            throw new Error(
                `Invalid account selection strategy '${String(strategy)}'. ` +
                    `Valid strategies: ${HARNESS_ACCOUNT_SELECTION_STRATEGIES.join(', ')}.`,
            );
        }
        const pool = this.LoadPool(options);
        pool.strategy = parsed;
        this.SavePool(pool, options);
        return pool;
    }

    /** Updates whether active OS `$HOME` logins are automatically included as `os-default-<vendor>` slots. */
    public SetIncludeOsDefaultLogin(
        include: boolean,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountPoolFile {
        const pool = this.LoadPool(options);
        pool.includeOsDefaultLogin = include;
        this.SavePool(pool, options);
        return pool;
    }

    /** Returns the interactive login CLI command specification for a vendor. */
    public GetInteractiveLoginCommand(vendor: HarnessPoolVendor): InteractiveLoginCommandSpec {
        switch (vendor) {
            case 'claude':
                return { command: 'claude', args: ['auth', 'login'], displayCommand: 'claude auth login' };
            case 'agy':
                return { command: 'agy', args: [], displayCommand: 'agy' };
            case 'codex':
                return { command: 'codex', args: ['login'], displayCommand: 'codex login' };
            case 'gemini':
                return { command: 'gemini', args: [], displayCommand: 'gemini' };
        }
    }

    /**
     * Computes exact per-process environment overrides for a slot:
     * - `os-default-*`: `{}` (inherits normal OS `$HOME`)
     * - `claude`: `{ CLAUDE_CONFIG_DIR: slot.slotDir }` (+ `CLAUDE_CODE_OAUTH_TOKEN` when stored)
     * - `codex`: `{ CODEX_HOME: slot.slotDir }`
     * - `agy` & `gemini`: prepares isolated symlinked home and returns `{ HOME, XDG_CONFIG_HOME, MJ_HARNESS_REAL_HOME }`
     */
    public BuildSlotEnvOverrides(
        slot: Pick<HarnessAccountSlotRecord, 'slotId' | 'vendor' | 'slotDir' | 'oauthTokenEnvValue' | 'isOsDefault'>,
        options?: HarnessAccountPoolOptions,
        prepareIsolatedHome = true,
    ): Record<string, string> {
        if (slot.isOsDefault || ParseOsDefaultSlotVendor(slot.slotId) !== null) {
            return {};
        }
        switch (slot.vendor) {
            case 'claude': {
                const env: Record<string, string> = { CLAUDE_CONFIG_DIR: slot.slotDir };
                const token = nonEmptyString(slot.oauthTokenEnvValue);
                if (token) {
                    env.CLAUDE_CODE_OAUTH_TOKEN = token;
                }
                return env;
            }
            case 'codex':
                return { CODEX_HOME: slot.slotDir };
            case 'agy':
            case 'gemini': {
                const realHomeDir = this.GetRealHomeDir(options);
                if (prepareIsolatedHome) {
                    PrepareIsolatedHomeSlotDir(slot.slotDir, realHomeDir, options?.platform);
                }
                return {
                    HOME: slot.slotDir,
                    XDG_CONFIG_HOME: path.join(slot.slotDir, '.config'),
                    [HARNESS_REAL_HOME_ENV_VAR]: realHomeDir,
                };
            }
        }
    }

    /** Returns the executable CLI binary name for a pooled vendor (`claude`, `agy`, `codex`, `gemini`). */
    public GetVendorBinaryName(vendor: HarnessPoolVendor): string {
        return this.GetInteractiveLoginCommand(vendor).command;
    }

    /** Clears the in-memory per-vendor CLI binary availability probe cache. */
    public ClearBinaryProbeCache(): void {
        this.binaryProbeCache.clear();
    }

    /**
     * Probes whether the vendor's CLI executable is installed and runnable by invoking
     * `<binary> --version` with a short timeout (default 3000ms). Results for the default
     * probe are memoized per `(vendor, PATH)` for 30 seconds to keep repeated slot checks fast.
     */
    public ProbeVendorBinaryAvailable(
        vendor: HarnessPoolVendor,
        options?: HarnessAccountPoolOptions,
    ): HarnessVendorBinaryProbeResult {
        const binary = this.GetVendorBinaryName(vendor);
        const timeoutMs = resolvePositiveMs(
            options?.BinaryProbeTimeoutMs,
            DEFAULT_HARNESS_BINARY_PROBE_TIMEOUT_MS,
        );

        if (options?.BinaryProbe) {
            return options.BinaryProbe(vendor, binary, timeoutMs);
        }

        const env = options?.env ?? process.env;
        const pathValue = env.PATH ?? env.Path ?? '';
        const cacheKey = `${vendor}|${pathValue}`;
        const nowMs = options?.nowMs ?? Date.now();
        const cached = this.binaryProbeCache.get(cacheKey);
        if (cached && cached.ExpiresAtMs > nowMs) {
            return cached.Result;
        }

        const probeResult = defaultProbeVendorBinary(binary, timeoutMs, env);
        this.binaryProbeCache.set(cacheKey, {
            Result: probeResult,
            ExpiresAtMs: nowMs + DEFAULT_HARNESS_BINARY_PROBE_CACHE_TTL_MS,
        });
        return probeResult;
    }

    /**
     * Probes whether credentials actually exist for a slot by delegating to
     * {@link DetectLocalCliLoginSession} parameterized with the slot's environment overrides.
     * When `options.VerifyBinaryExecutable` is `true` (or `options.BinaryProbe` is supplied),
     * also verifies that the vendor's CLI executable runs `<binary> --version` cleanly.
     */
    public ProbeSlotAuthStatus(
        slot: Pick<HarnessAccountSlotRecord, 'slotId' | 'vendor' | 'slotDir' | 'oauthTokenEnvValue' | 'isOsDefault'>,
        options?: HarnessAccountPoolOptions,
    ): HarnessSlotAuthStatus {
        const driverClass = HarnessPoolVendorToDriverClass(slot.vendor);
        const isOsDefault = slot.isOsDefault === true || ParseOsDefaultSlotVendor(slot.slotId) !== null;

        let hasLocalLogin: boolean;
        let indicatorPath: string | null;

        if (isOsDefault) {
            const realHomeDir = this.GetRealHomeDir(options);
            const probeEnv: NodeJS.ProcessEnv = {
                ...(options?.env ?? process.env),
                HOME: realHomeDir,
            };
            // Ensure OS default probe checks standard OS login paths rather than any inherited isolated slot override.
            delete probeEnv.CLAUDE_CONFIG_DIR;
            delete probeEnv.CODEX_HOME;
            const detection = DetectLocalCliLoginSession(driverClass, {
                homeDir: realHomeDir,
                env: probeEnv,
                strictSlotIsolation: false,
            });
            hasLocalLogin = detection.hasLocalLogin;
            indicatorPath = detection.indicatorPath;
        } else {
            const envOverrides = this.BuildSlotEnvOverrides(slot, options, false);
            const homeDir = envOverrides.HOME ?? slot.slotDir;
            const detection = DetectLocalCliLoginSession(driverClass, {
                homeDir,
                env: envOverrides,
                strictSlotIsolation: true,
            });
            hasLocalLogin = detection.hasLocalLogin;
            indicatorPath = detection.indicatorPath;
        }

        const shouldVerifyBinary =
            options?.VerifyBinaryExecutable === true || options?.BinaryProbe !== undefined;
        if (!shouldVerifyBinary) {
            return {
                authenticated: hasLocalLogin,
                indicatorPath,
                statusLabel: hasLocalLogin ? 'Ready' : 'Needs Login',
            };
        }

        const binaryCheck = this.ProbeVendorBinaryAvailable(slot.vendor, options);
        const statusLabel: HarnessSlotAuthDisplayStatus = !binaryCheck.Available
            ? 'Binary Missing'
            : hasLocalLogin
              ? 'Ready'
              : 'Needs Login';

        return {
            authenticated: hasLocalLogin,
            indicatorPath,
            statusLabel,
            BinaryAvailable: binaryCheck.Available,
            ...(binaryCheck.Error ? { BinaryError: binaryCheck.Error } : {}),
        };
    }

    /**
     * Scans `<poolDir>/leases/*.json`, automatically prunes expired or dead-PID leases, and returns
     * all currently active leases.
     */
    public ListActiveLeases(options?: HarnessAccountPoolOptions): HarnessAccountLeaseRecord[] {
        const leasesDir = this.GetLeasesDir(options);
        if (!fs.existsSync(leasesDir)) {
            return [];
        }

        const nowMs = options?.nowMs ?? Date.now();
        const pidCheck = options?.isPidAlive ?? defaultIsPidAlive;
        const active: HarnessAccountLeaseRecord[] = [];

        let entries: string[];
        try {
            entries = fs.readdirSync(leasesDir);
        } catch {
            return [];
        }

        for (const entry of entries) {
            if (!entry.endsWith('.json') || entry.includes('.tmp.')) {
                continue;
            }
            const fullPath = path.join(leasesDir, entry);
            const record = readLeaseFile(fullPath);
            if (!record) {
                safeUnlink(fullPath);
                continue;
            }
            const expiresMs = Date.parse(record.expiresAtIso);
            const isExpired = !Number.isFinite(expiresMs) || expiresMs <= nowMs;
            const alive = pidCheck(record.pid);
            if (isExpired || !alive) {
                safeUnlink(fullPath);
                continue;
            }
            active.push(record);
        }

        return active;
    }

    /** Prunes expired and dead-PID lease files from `<poolDir>/leases/`, returning the number removed. */
    public PruneStaleLeases(options?: HarnessAccountPoolOptions): number {
        const leasesDir = this.GetLeasesDir(options);
        if (!fs.existsSync(leasesDir)) {
            return 0;
        }
        const before = fs
            .readdirSync(leasesDir)
            .filter((name) => name.endsWith('.json') && !name.includes('.tmp.')).length;
        const active = this.ListActiveLeases(options);
        return Math.max(0, before - active.length);
    }

    /**
     * Lists enrolled slots plus synthesized `os-default-<vendor>` slots (when `includeOsDefaultLogin`
     * is enabled and the host OS `$HOME` has an active login for that CLI), annotated with live
     * auth status, active lease counts, and cooldown state.
     */
    public ListSlots(
        filter?: { vendor?: HarnessPoolVendor | string; includeUnauthenticatedOsDefault?: boolean },
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountSlotStatus[] {
        const pool = this.LoadPool(options);
        const nowMs = options?.nowMs ?? Date.now();
        const activeLeases = this.ListActiveLeases(options);

        let vendorFilter: HarnessPoolVendor | null = null;
        if (filter?.vendor !== undefined) {
            vendorFilter = NormalizeHarnessPoolVendor(filter.vendor);
            if (!vendorFilter) {
                throw new Error(
                    `Unknown harness vendor '${String(filter.vendor)}'. ` +
                        `Supported vendors: ${HARNESS_POOL_VENDORS.join(', ')}.`,
                );
            }
        }

        const vendorsToInspect: readonly HarnessPoolVendor[] = vendorFilter
            ? [vendorFilter]
            : HARNESS_POOL_VENDORS;

        const leasesBySlot = new Map<string, HarnessAccountLeaseRecord[]>();
        for (const lease of activeLeases) {
            const list = leasesBySlot.get(lease.slotId) ?? [];
            list.push(lease);
            leasesBySlot.set(lease.slotId, list);
        }

        const results: HarnessAccountSlotStatus[] = [];

        if (pool.includeOsDefaultLogin) {
            for (const vendor of vendorsToInspect) {
                const osSlot = this.buildOsDefaultSlotRecord(vendor, pool, options);
                const auth = this.ProbeSlotAuthStatus(osSlot, options);
                if (auth.authenticated || filter?.includeUnauthenticatedOsDefault === true) {
                    results.push(this.enrichSlotStatus(osSlot, auth, leasesBySlot, nowMs, options));
                }
            }
        }

        for (const slot of pool.slots) {
            if (vendorFilter && slot.vendor !== vendorFilter) {
                continue;
            }
            const auth = this.ProbeSlotAuthStatus(slot, options);
            results.push(this.enrichSlotStatus(slot, auth, leasesBySlot, nowMs, options));
        }

        return results;
    }

    /** Looks up a single slot (enrolled or synthetic `os-default-<vendor>`) by `slotId`. */
    public GetSlot(slotId: string, options?: HarnessAccountPoolOptions): HarnessAccountSlotStatus | null {
        const trimmed = slotId.trim();
        if (!trimmed) {
            return null;
        }
        const all = this.ListSlots({ includeUnauthenticatedOsDefault: true }, options);
        return all.find((s) => s.slotId === trimmed) ?? null;
    }

    /**
     * Enrolls a new isolated slot under `<poolDir>/<vendor>/<slotId>`, creates its directory
     * (and prepares safe toolchain symlinks for `agy`/`gemini`), and persists it in `pool.json`.
     */
    public AddSlot(
        params: AddHarnessAccountSlotParams,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountSlotRecord {
        const vendor = NormalizeHarnessPoolVendor(params.vendor);
        if (!vendor) {
            throw new Error(
                `Unsupported harness vendor '${String(params.vendor)}'. ` +
                    `Supported vendors: ${HARNESS_POOL_VENDORS.join(', ')} ` +
                    `(aliases: claude-code, antigravity, openai-codex, gemini-cli).`,
            );
        }

        const pool = this.LoadPool(options);
        const nowIso = new Date(options?.nowMs ?? Date.now()).toISOString();
        const label = nonEmptyString(params.label) ?? `${vendor}-${pool.slots.filter((s) => s.vendor === vendor).length + 1}`;
        const slotId = resolveUniqueSlotId(vendor, params.slotId, label, pool.slots);

        if (ParseOsDefaultSlotVendor(slotId) !== null) {
            throw new Error(`Slot ID '${slotId}' is reserved for OS default login slots.`);
        }

        const weight = normalizeWeight(params.weight);
        const priority = normalizePriority(params.priority);
        const slotDir = path.join(this.GetPoolDir(options), vendor, slotId);
        fs.mkdirSync(slotDir, { recursive: true });

        if (vendor === 'agy' || vendor === 'gemini') {
            PrepareIsolatedHomeSlotDir(slotDir, this.GetRealHomeDir(options), options?.platform);
        }

        const record: HarnessAccountSlotRecord = {
            slotId,
            vendor,
            label,
            identityEmail: nonEmptyString(params.identityEmail),
            identityOrg: nonEmptyString(params.identityOrg),
            slotDir,
            oauthTokenEnvValue: nonEmptyString(params.oauthTokenEnvValue),
            enabled: params.enabled !== false,
            weight,
            priority,
            createdAtIso: nowIso,
            totalTurnsExecuted: 0,
            totalRateLimitHits: 0,
        };

        pool.slots.push(record);
        this.SavePool(pool, options);
        return { ...record };
    }

    /** Updates mutable metadata/settings on an enrolled slot (or operational controls on `os-default-<vendor>`). */
    public UpdateSlot(
        slotId: string,
        patch: Partial<
            Pick<
                HarnessAccountSlotRecord,
                'label' | 'identityEmail' | 'identityOrg' | 'oauthTokenEnvValue' | 'enabled' | 'weight' | 'priority'
            >
        >,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountSlotRecord | null {
        const pool = this.LoadPool(options);
        const osVendor = ParseOsDefaultSlotVendor(slotId);
        if (osVendor) {
            pool.osDefaultStates = pool.osDefaultStates ?? {};
            const state: HarnessOsDefaultSlotState = { ...(pool.osDefaultStates[osVendor] ?? {}) };
            if (patch.label !== undefined) state.label = nonEmptyString(patch.label) ?? state.label;
            if (patch.enabled !== undefined) state.enabled = patch.enabled;
            if (patch.weight !== undefined) state.weight = normalizeWeight(patch.weight);
            if (patch.priority !== undefined) state.priority = normalizePriority(patch.priority);
            pool.osDefaultStates[osVendor] = state;
            this.SavePool(pool, options);
            return this.buildOsDefaultSlotRecord(osVendor, pool, options);
        }

        const target = pool.slots.find((s) => s.slotId === slotId);
        if (!target) {
            return null;
        }
        if (patch.label !== undefined) {
            const cleaned = nonEmptyString(patch.label);
            if (cleaned) target.label = cleaned;
        }
        if (patch.identityEmail !== undefined) {
            target.identityEmail = nonEmptyString(patch.identityEmail);
        }
        if (patch.identityOrg !== undefined) {
            target.identityOrg = nonEmptyString(patch.identityOrg);
        }
        if (patch.oauthTokenEnvValue !== undefined) {
            target.oauthTokenEnvValue = nonEmptyString(patch.oauthTokenEnvValue);
        }
        if (patch.enabled !== undefined) {
            target.enabled = patch.enabled;
        }
        if (patch.weight !== undefined) {
            target.weight = normalizeWeight(patch.weight);
        }
        if (patch.priority !== undefined) {
            target.priority = normalizePriority(patch.priority);
        }
        this.SavePool(pool, options);
        return { ...target };
    }

    /** Removes an enrolled slot from `pool.json`, releasing any active leases and optionally purging `<slotDir>`. */
    public RemoveSlot(
        slotId: string,
        removeOptions?: { purgeFiles?: boolean },
        options?: HarnessAccountPoolOptions,
    ): boolean {
        if (ParseOsDefaultSlotVendor(slotId) !== null) {
            throw new Error(
                `Cannot remove synthetic OS default slot '${slotId}'. ` +
                    `Use disable ('mj harness account disable ${slotId}') instead.`,
            );
        }

        const pool = this.LoadPool(options);
        const index = pool.slots.findIndex((s) => s.slotId === slotId);
        if (index === -1) {
            return false;
        }

        const [removed] = pool.slots.splice(index, 1);
        this.SavePool(pool, options);

        // Release any lingering leases referencing this slot
        for (const lease of this.ListActiveLeases(options)) {
            if (lease.slotId === slotId) {
                this.ReleaseSlotLease(lease.leaseId, options);
            }
        }

        if (removeOptions?.purgeFiles === true && removed.slotDir) {
            const poolDir = path.resolve(this.GetPoolDir(options));
            const resolvedSlotDir = path.resolve(removed.slotDir);
            if (
                resolvedSlotDir !== poolDir &&
                resolvedSlotDir.startsWith(`${poolDir}${path.sep}`)
            ) {
                fs.rmSync(resolvedSlotDir, { recursive: true, force: true });
            }
        }

        return true;
    }

    /** Enables or disables an enrolled or OS-default slot. */
    public SetSlotEnabled(
        slotId: string,
        enabled: boolean,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountSlotRecord {
        const updated = this.UpdateSlot(slotId, { enabled }, options);
        if (!updated) {
            throw new Error(`Account slot '${slotId}' not found.`);
        }
        return updated;
    }

    /** Places a slot (enrolled or `os-default-<vendor>`) into quota cooldown and increments `totalRateLimitHits`. */
    public MarkSlotCooldown(
        slotId: string,
        reason: string,
        cooldownUntilIso?: string,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountSlotRecord | null {
        const nowMs = options?.nowMs ?? Date.now();
        const defaultCooldownMs = options?.defaultCooldownMs ?? DEFAULT_HARNESS_QUOTA_COOLDOWN_MS;
        const resolvedUntilIso =
            cooldownUntilIso && Number.isFinite(Date.parse(cooldownUntilIso))
                ? new Date(Date.parse(cooldownUntilIso)).toISOString()
                : new Date(nowMs + defaultCooldownMs).toISOString();
        const cleanReason = nonEmptyString(reason) ?? 'Rate limit or quota exceeded';

        const pool = this.LoadPool(options);
        const osVendor = ParseOsDefaultSlotVendor(slotId);
        if (osVendor) {
            pool.osDefaultStates = pool.osDefaultStates ?? {};
            const state: HarnessOsDefaultSlotState = { ...(pool.osDefaultStates[osVendor] ?? {}) };
            state.totalRateLimitHits = (state.totalRateLimitHits ?? 0) + 1;
            state.cooldownUntilIso = resolvedUntilIso;
            state.lastCooldownReason = cleanReason;
            pool.osDefaultStates[osVendor] = state;
            this.SavePool(pool, options);
            return this.buildOsDefaultSlotRecord(osVendor, pool, options);
        }

        const target = pool.slots.find((s) => s.slotId === slotId);
        if (!target) {
            return null;
        }
        target.totalRateLimitHits = (target.totalRateLimitHits ?? 0) + 1;
        target.cooldownUntilIso = resolvedUntilIso;
        target.lastCooldownReason = cleanReason;
        this.SavePool(pool, options);
        return { ...target };
    }

    /** Clears active cooldown state on a slot (enrolled or `os-default-<vendor>`). */
    public ClearSlotCooldown(
        slotId: string,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountSlotRecord | null {
        const pool = this.LoadPool(options);
        const osVendor = ParseOsDefaultSlotVendor(slotId);
        if (osVendor) {
            pool.osDefaultStates = pool.osDefaultStates ?? {};
            const state: HarnessOsDefaultSlotState = { ...(pool.osDefaultStates[osVendor] ?? {}) };
            delete state.cooldownUntilIso;
            delete state.lastCooldownReason;
            pool.osDefaultStates[osVendor] = state;
            this.SavePool(pool, options);
            return this.buildOsDefaultSlotRecord(osVendor, pool, options);
        }

        const target = pool.slots.find((s) => s.slotId === slotId);
        if (!target) {
            return null;
        }
        delete target.cooldownUntilIso;
        delete target.lastCooldownReason;
        this.SavePool(pool, options);
        return { ...target };
    }

    /** Returns true when at least one enabled, authenticated, non-cooldown slot is available for `vendor`. */
    public HasHealthySlot(
        vendorInput: HarnessPoolVendor | string,
        excludeSlotIds?: readonly string[],
        options?: HarnessAccountPoolOptions,
    ): boolean {
        const vendor = NormalizeHarnessPoolVendor(vendorInput);
        if (!vendor) {
            return false;
        }
        const excludeSet = new Set(excludeSlotIds ?? []);
        const candidates = this.ListSlots({ vendor }, options);
        return candidates.some(
            (slot) =>
                slot.enabled &&
                slot.authenticated &&
                slot.BinaryAvailable !== false &&
                !slot.inCooldown &&
                !excludeSet.has(slot.slotId),
        );
    }

    /**
     * Selects the best healthy slot for `params.vendor` using the configured strategy, writes a
     * lock-free lease file under `<poolDir>/leases/<leaseId>.json`, updates `lastUsedAtIso` and
     * `totalTurnsExecuted`, and returns the active {@link HarnessAccountLease} (or `null` when no
     * healthy slot is available).
     */
    public AcquireSlotLease(
        params: AcquireSlotLeaseParams,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountLease | null {
        const vendor = NormalizeHarnessPoolVendor(params.vendor);
        if (!vendor) {
            throw new Error(
                `Unsupported harness vendor '${String(params.vendor)}'. ` +
                    `Supported vendors: ${HARNESS_POOL_VENDORS.join(', ')}.`,
            );
        }

        const nowMs = options?.nowMs ?? Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const pool = this.LoadPool(options);
        const strategy: HarnessAccountSelectionStrategy =
            (params.strategy ? ParseHarnessAccountSelectionStrategy(params.strategy) : null) ??
            pool.strategy;
        const excludeSet = new Set(params.excludeSlotIds ?? []);
        const activeLeases = this.ListActiveLeases(options);

        const activeCountBySlot = new Map<string, number>();
        for (const lease of activeLeases) {
            activeCountBySlot.set(lease.slotId, (activeCountBySlot.get(lease.slotId) ?? 0) + 1);
        }

        const candidateRecords: HarnessAccountSlotRecord[] = [];
        if (pool.includeOsDefaultLogin) {
            candidateRecords.push(this.buildOsDefaultSlotRecord(vendor, pool, options));
        }
        for (const slot of pool.slots) {
            if (slot.vendor === vendor) {
                candidateRecords.push(slot);
            }
        }

        const pinnedSlotId = nonEmptyString(params.slotId);
        const healthy = candidateRecords.filter((slot) => {
            if (pinnedSlotId && slot.slotId !== pinnedSlotId) {
                return false;
            }
            if (!slot.enabled) {
                return false;
            }
            if (excludeSet.has(slot.slotId)) {
                return false;
            }
            if (isSlotInCooldown(slot, nowMs)) {
                return false;
            }
            const auth = this.ProbeSlotAuthStatus(slot, options);
            return auth.authenticated && auth.BinaryAvailable !== false;
        });

        if (healthy.length === 0) {
            return null;
        }

        const { selected, nextRoundRobinCursor } = selectWinningSlot(
            healthy,
            strategy,
            activeCountBySlot,
            pool.roundRobinCursorByVendor?.[vendor] ?? 0,
        );

        const ttlMs = resolvePositiveMs(
            params.ttlMs,
            options?.defaultLeaseTtlMs ?? DEFAULT_HARNESS_LEASE_TTL_MS,
        );
        const leaseId = `lease-${vendor}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
        const leaseRecord: HarnessAccountLeaseRecord = {
            leaseId,
            slotId: selected.slotId,
            vendor,
            pid: typeof params.pid === 'number' && Number.isInteger(params.pid) && params.pid > 0
                ? params.pid
                : process.pid,
            ownerLabel: nonEmptyString(params.ownerLabel) ?? 'harness-run',
            acquiredAtIso: nowIso,
            expiresAtIso: new Date(nowMs + ttlMs).toISOString(),
        };

        const leasesDir = this.GetLeasesDir(options);
        fs.mkdirSync(leasesDir, { recursive: true });
        atomicWriteJsonFile(path.join(leasesDir, `${leaseId}.json`), leaseRecord);

        // Update slot usage stats & round-robin cursor atomically in pool.json
        if (selected.isOsDefault) {
            pool.osDefaultStates = pool.osDefaultStates ?? {};
            const state: HarnessOsDefaultSlotState = { ...(pool.osDefaultStates[vendor] ?? {}) };
            state.lastUsedAtIso = nowIso;
            state.totalTurnsExecuted = (state.totalTurnsExecuted ?? 0) + 1;
            pool.osDefaultStates[vendor] = state;
        } else {
            const persisted = pool.slots.find((s) => s.slotId === selected.slotId);
            if (persisted) {
                persisted.lastUsedAtIso = nowIso;
                persisted.totalTurnsExecuted = (persisted.totalTurnsExecuted ?? 0) + 1;
            }
        }

        if (nextRoundRobinCursor !== undefined) {
            pool.roundRobinCursorByVendor = pool.roundRobinCursorByVendor ?? {};
            pool.roundRobinCursorByVendor[vendor] = nextRoundRobinCursor;
        }
        this.SavePool(pool, options);

        const updatedSlot: HarnessAccountSlotRecord = {
            ...selected,
            lastUsedAtIso: nowIso,
            totalTurnsExecuted: (selected.totalTurnsExecuted ?? 0) + 1,
        };
        const envOverrides = this.BuildSlotEnvOverrides(updatedSlot, options, true);

        return {
            ...leaseRecord,
            slot: updatedSlot,
            envOverrides,
            isOsDefault: updatedSlot.isOsDefault === true,
            strategyUsed: strategy,
        };
    }

    /** Extends an active lease's `expiresAtIso` atomically; returns `null` if the lease no longer exists. */
    public RenewSlotLease(
        leaseId: string,
        ttlMs?: number,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountLeaseRecord | null {
        const cleanId = nonEmptyString(leaseId);
        if (!cleanId) {
            return null;
        }
        const leasePath = path.join(this.GetLeasesDir(options), `${cleanId}.json`);
        const existing = readLeaseFile(leasePath);
        if (!existing) {
            return null;
        }
        const nowMs = options?.nowMs ?? Date.now();
        const effectiveTtl = resolvePositiveMs(
            ttlMs,
            options?.defaultLeaseTtlMs ?? DEFAULT_HARNESS_LEASE_TTL_MS,
        );
        const updated: HarnessAccountLeaseRecord = {
            ...existing,
            expiresAtIso: new Date(nowMs + effectiveTtl).toISOString(),
        };
        atomicWriteJsonFile(leasePath, updated);
        return updated;
    }

    /** Idempotently deletes `<poolDir>/leases/<leaseId>.json`. Returns true if a file was removed. */
    public ReleaseSlotLease(
        leaseId: string,
        options?: HarnessAccountPoolOptions,
    ): boolean {
        const cleanId = nonEmptyString(leaseId);
        if (!cleanId) {
            return false;
        }
        const leasePath = path.join(this.GetLeasesDir(options), `${cleanId}.json`);
        return safeUnlink(leasePath);
    }

    private buildOsDefaultSlotRecord(
        vendor: HarnessPoolVendor,
        pool: HarnessAccountPoolFile,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountSlotRecord {
        const state = pool.osDefaultStates?.[vendor];
        return {
            slotId: OsDefaultSlotIdForVendor(vendor),
            vendor,
            label: state?.label ?? `OS Default (${vendor})`,
            slotDir: this.GetRealHomeDir(options),
            enabled: state?.enabled !== false,
            weight: normalizeWeight(state?.weight),
            priority: normalizePriority(state?.priority),
            createdAtIso: '1970-01-01T00:00:00.000Z',
            lastUsedAtIso: state?.lastUsedAtIso,
            totalTurnsExecuted: state?.totalTurnsExecuted ?? 0,
            totalRateLimitHits: state?.totalRateLimitHits ?? 0,
            cooldownUntilIso: state?.cooldownUntilIso,
            lastCooldownReason: state?.lastCooldownReason,
            isOsDefault: true,
        };
    }

    private enrichSlotStatus(
        slot: HarnessAccountSlotRecord,
        auth: HarnessSlotAuthStatus,
        leasesBySlot: Map<string, HarnessAccountLeaseRecord[]>,
        nowMs: number,
        options?: HarnessAccountPoolOptions,
    ): HarnessAccountSlotStatus {
        const slotLeases = leasesBySlot.get(slot.slotId) ?? [];
        return {
            ...slot,
            authenticated: auth.authenticated,
            authIndicatorPath: auth.indicatorPath,
            authStatus: auth.statusLabel,
            ...(auth.BinaryAvailable !== undefined ? { BinaryAvailable: auth.BinaryAvailable } : {}),
            ...(auth.BinaryError !== undefined ? { BinaryError: auth.BinaryError } : {}),
            activeLeaseCount: slotLeases.length,
            activeLeases: slotLeases,
            inCooldown: isSlotInCooldown(slot, nowMs),
            envOverrides: this.BuildSlotEnvOverrides(slot, options, false),
        };
    }
}

// ============================================================================
// Internal Selection & Filesystem Helpers
// ============================================================================

function selectWinningSlot(
    healthy: readonly HarnessAccountSlotRecord[],
    strategy: HarnessAccountSelectionStrategy,
    activeCountBySlot: ReadonlyMap<string, number>,
    roundRobinCursor: number,
): { selected: HarnessAccountSlotRecord; nextRoundRobinCursor?: number } {
    if (strategy === 'round-robin') {
        const ordered = [...healthy].sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.slotId.localeCompare(b.slotId);
        });
        const safeCursor =
            Number.isFinite(roundRobinCursor) && roundRobinCursor >= 0
                ? Math.floor(roundRobinCursor)
                : 0;
        const index = safeCursor % ordered.length;
        return {
            selected: ordered[index],
            nextRoundRobinCursor: (index + 1) % ordered.length,
        };
    }

    if (strategy === 'priority-failover') {
        const ordered = [...healthy].sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            const ratioDiff = inFlightRatio(a, activeCountBySlot) - inFlightRatio(b, activeCountBySlot);
            if (ratioDiff !== 0) {
                return ratioDiff;
            }
            const lruDiff = lastUsedEpoch(a) - lastUsedEpoch(b);
            if (lruDiff !== 0) {
                return lruDiff;
            }
            return a.slotId.localeCompare(b.slotId);
        });
        return { selected: ordered[0] };
    }

    if (strategy === 'weighted') {
        const ordered = [...healthy].sort((a, b) => {
            const inFlightDiff = inFlightRatio(a, activeCountBySlot) - inFlightRatio(b, activeCountBySlot);
            if (Math.abs(inFlightDiff) > 1e-9) {
                return inFlightDiff;
            }
            const weightedTurnsA = (a.totalTurnsExecuted ?? 0) / Math.max(1, a.weight);
            const weightedTurnsB = (b.totalTurnsExecuted ?? 0) / Math.max(1, b.weight);
            if (Math.abs(weightedTurnsA - weightedTurnsB) > 1e-9) {
                return weightedTurnsA - weightedTurnsB;
            }
            if (a.weight !== b.weight) {
                return b.weight - a.weight;
            }
            const lruDiff = lastUsedEpoch(a) - lastUsedEpoch(b);
            if (lruDiff !== 0) {
                return lruDiff;
            }
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.slotId.localeCompare(b.slotId);
        });
        return { selected: ordered[0] };
    }

    // Default: 'least-in-flight'
    const ordered = [...healthy].sort((a, b) => {
        const ratioDiff = inFlightRatio(a, activeCountBySlot) - inFlightRatio(b, activeCountBySlot);
        if (Math.abs(ratioDiff) > 1e-9) {
            return ratioDiff;
        }
        const lruDiff = lastUsedEpoch(a) - lastUsedEpoch(b);
        if (lruDiff !== 0) {
            return lruDiff;
        }
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        return a.slotId.localeCompare(b.slotId);
    });
    return { selected: ordered[0] };
}

function inFlightRatio(
    slot: HarnessAccountSlotRecord,
    activeCountBySlot: ReadonlyMap<string, number>,
): number {
    const active = activeCountBySlot.get(slot.slotId) ?? 0;
    return active / Math.max(1, slot.weight);
}

function lastUsedEpoch(slot: HarnessAccountSlotRecord): number {
    if (!slot.lastUsedAtIso) {
        return 0;
    }
    const parsed = Date.parse(slot.lastUsedAtIso);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isSlotInCooldown(slot: HarnessAccountSlotRecord, nowMs: number): boolean {
    if (!slot.cooldownUntilIso) {
        return false;
    }
    const until = Date.parse(slot.cooldownUntilIso);
    return Number.isFinite(until) && until > nowMs;
}

function createDefaultPoolFile(): HarnessAccountPoolFile {
    return {
        version: 1,
        strategy: 'least-in-flight',
        includeOsDefaultLogin: true,
        roundRobinCursorByVendor: {},
        slots: [],
        osDefaultStates: {},
    };
}

function isValidSlotRecord(
    candidate: Partial<HarnessAccountSlotRecord> | null | undefined,
): candidate is HarnessAccountSlotRecord {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return false;
    }
    return (
        typeof candidate.slotId === 'string' &&
        candidate.slotId.trim().length > 0 &&
        NormalizeHarnessPoolVendor(candidate.vendor) !== null &&
        typeof candidate.slotDir === 'string' &&
        candidate.slotDir.trim().length > 0
    );
}

function normalizeSlotRecord(record: HarnessAccountSlotRecord): HarnessAccountSlotRecord {
    const vendor = NormalizeHarnessPoolVendor(record.vendor) ?? 'claude';
    return {
        slotId: record.slotId.trim(),
        vendor,
        label: nonEmptyString(record.label) ?? record.slotId.trim(),
        identityEmail: nonEmptyString(record.identityEmail),
        identityOrg: nonEmptyString(record.identityOrg),
        slotDir: record.slotDir.trim(),
        oauthTokenEnvValue: nonEmptyString(record.oauthTokenEnvValue),
        enabled: record.enabled !== false,
        weight: normalizeWeight(record.weight),
        priority: normalizePriority(record.priority),
        createdAtIso: nonEmptyString(record.createdAtIso) ?? new Date(0).toISOString(),
        lastUsedAtIso: nonEmptyString(record.lastUsedAtIso),
        totalTurnsExecuted:
            typeof record.totalTurnsExecuted === 'number' && Number.isFinite(record.totalTurnsExecuted)
                ? Math.max(0, Math.floor(record.totalTurnsExecuted))
                : 0,
        totalRateLimitHits:
            typeof record.totalRateLimitHits === 'number' && Number.isFinite(record.totalRateLimitHits)
                ? Math.max(0, Math.floor(record.totalRateLimitHits))
                : 0,
        cooldownUntilIso: nonEmptyString(record.cooldownUntilIso),
        lastCooldownReason: nonEmptyString(record.lastCooldownReason),
    };
}

function sanitizeCursorMap(
    raw: Partial<Record<HarnessPoolVendor, number>> | undefined,
): Partial<Record<HarnessPoolVendor, number>> {
    const clean: Partial<Record<HarnessPoolVendor, number>> = {};
    if (!raw || typeof raw !== 'object') {
        return clean;
    }
    for (const vendor of HARNESS_POOL_VENDORS) {
        const val = raw[vendor];
        if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
            clean[vendor] = Math.floor(val);
        }
    }
    return clean;
}

function sanitizeOsDefaultStates(
    raw: Partial<Record<HarnessPoolVendor, HarnessOsDefaultSlotState>> | undefined,
): Partial<Record<HarnessPoolVendor, HarnessOsDefaultSlotState>> {
    const clean: Partial<Record<HarnessPoolVendor, HarnessOsDefaultSlotState>> = {};
    if (!raw || typeof raw !== 'object') {
        return clean;
    }
    for (const vendor of HARNESS_POOL_VENDORS) {
        const entry = raw[vendor];
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            clean[vendor] = { ...entry };
        }
    }
    return clean;
}

function resolveUniqueSlotId(
    vendor: HarnessPoolVendor,
    explicitSlotId: string | undefined,
    label: string,
    existingSlots: readonly HarnessAccountSlotRecord[],
): string {
    const existingIds = new Set(existingSlots.map((s) => s.slotId));
    const explicit = nonEmptyString(explicitSlotId);
    if (explicit) {
        const sanitized = sanitizeSlug(explicit);
        if (!sanitized) {
            throw new Error(`Invalid slotId '${explicit}'.`);
        }
        if (existingIds.has(sanitized)) {
            throw new Error(`Account slot '${sanitized}' already exists.`);
        }
        return sanitized;
    }

    const labelSlug = sanitizeSlug(label);
    const base = labelSlug
        ? labelSlug.startsWith(`${vendor}-`)
            ? labelSlug
            : `${vendor}-${labelSlug}`
        : `${vendor}-acct`;

    if (!existingIds.has(base)) {
        return base;
    }
    let suffix = 2;
    while (existingIds.has(`${base}-${suffix}`)) {
        suffix++;
    }
    return `${base}-${suffix}`;
}

function sanitizeSlug(input: string): string {
    const replaced = input.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    let start = 0;
    let end = replaced.length;
    while (start < end && replaced.charCodeAt(start) === 45) {
        start++;
    }
    while (end > start && replaced.charCodeAt(end - 1) === 45) {
        end--;
    }
    return replaced.slice(start, end).slice(0, 64);
}

function normalizeWeight(value: number | undefined): number {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
        return Math.round(value);
    }
    return 1;
}

function normalizePriority(value: number | undefined): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.round(value);
    }
    return 100;
}

function resolvePositiveMs(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonEmptyString(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function resolveRealHomePath(
    explicit?: string,
    env: NodeJS.ProcessEnv = process.env,
): string | undefined {
    return (
        nonEmptyString(explicit) ??
        nonEmptyString(env[HARNESS_REAL_HOME_ENV_VAR]) ??
        nonEmptyString(env.HOME) ??
        nonEmptyString(os.homedir())
    );
}

function pathExistsRaw(targetPath: string): boolean {
    try {
        fs.lstatSync(targetPath);
        return true;
    } catch {
        return false;
    }
}

function ensureSafeSymlink(sourcePath: string, targetPath: string): void {
    if (!pathExistsRaw(sourcePath) || pathExistsRaw(targetPath)) {
        return;
    }
    try {
        let symlinkType: 'dir' | 'file' | 'junction' | undefined;
        if (process.platform === 'win32') {
            try {
                symlinkType = fs.statSync(sourcePath).isDirectory() ? 'junction' : 'file';
            } catch {
                symlinkType = 'file';
            }
        }
        fs.symlinkSync(sourcePath, targetPath, symlinkType);
    } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
        if (code !== 'EEXIST') {
            throw err;
        }
    }
}

function atomicWriteJsonFile<T extends object>(targetPath: string, payload: T): void {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });
    const nonce = crypto.randomBytes(6).toString('hex');
    const tmpPath = `${targetPath}.tmp.${process.pid}.${nonce}`;
    const content = `${JSON.stringify(payload, null, 2)}\n`;
    try {
        fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(tmpPath, targetPath);
    } catch (err) {
        safeUnlink(tmpPath);
        throw err;
    }
}

function readLeaseFile(filePath: string): HarnessAccountLeaseRecord | null {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<HarnessAccountLeaseRecord>;
        const vendor = NormalizeHarnessPoolVendor(parsed.vendor);
        if (
            typeof parsed.leaseId !== 'string' ||
            typeof parsed.slotId !== 'string' ||
            !vendor ||
            typeof parsed.pid !== 'number' ||
            typeof parsed.acquiredAtIso !== 'string' ||
            typeof parsed.expiresAtIso !== 'string'
        ) {
            return null;
        }
        return {
            leaseId: parsed.leaseId,
            slotId: parsed.slotId,
            vendor,
            pid: parsed.pid,
            ownerLabel: typeof parsed.ownerLabel === 'string' ? parsed.ownerLabel : 'harness-run',
            acquiredAtIso: parsed.acquiredAtIso,
            expiresAtIso: parsed.expiresAtIso,
        };
    } catch {
        return null;
    }
}

function safeUnlink(filePath: string): boolean {
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
        if (code === 'ENOENT') {
            return false;
        }
        throw err;
    }
}

function defaultIsPidAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false;
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        const code = err instanceof Error && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
        // EPERM means the process exists but belongs to another user. ESRCH means no such process.
        return code === 'EPERM';
    }
}

function firstNonEmptyLine(text: string | null | undefined): string | undefined {
    if (typeof text !== 'string') {
        return undefined;
    }
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }
    return undefined;
}

function defaultProbeVendorBinary(
    binary: string,
    timeoutMs: number,
    env: NodeJS.ProcessEnv,
): HarnessVendorBinaryProbeResult {
    try {
        const res = spawnSync(binary, ['--version'], {
            env,
            timeout: timeoutMs,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32',
        });
        if (!res.error && res.status === 0) {
            const version = firstNonEmptyLine(res.stdout) ?? firstNonEmptyLine(res.stderr);
            return {
                Available: true,
                Binary: binary,
                ...(version ? { Version: version } : {}),
            };
        }
        const errorDetail =
            res.error?.message ??
            firstNonEmptyLine(res.stderr) ??
            firstNonEmptyLine(res.stdout) ??
            (res.signal ? `terminated by signal ${res.signal}` : `exited with code ${String(res.status)}`);
        return {
            Available: false,
            Binary: binary,
            Error: errorDetail,
        };
    } catch (err) {
        return {
            Available: false,
            Binary: binary,
            Error: err instanceof Error ? err.message : String(err),
        };
    }
}
