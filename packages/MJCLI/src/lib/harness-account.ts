import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
    HARNESS_ACCOUNT_SELECTION_STRATEGIES,
    HARNESS_POOL_VENDORS,
    HarnessAccountPoolService,
    NormalizeHarnessPoolVendor,
    ParseHarnessAccountSelectionStrategy,
    StripHarnessApiKeyEnvironment,
    type HarnessAccountPoolOptions,
    type HarnessAccountSelectionStrategy,
    type HarnessAccountSlotStatus,
    type HarnessPoolVendor,
    type InteractiveLoginCommandSpec,
} from '@memberjunction/ai-agent-harness';

/** Result returned by an {@link InteractiveLoginRunner} invocation. */
export interface InteractiveLoginResult {
    Status: number | null;
    Error?: Error;
}

/** Function signature for spawning interactive CLI logins (injectable for unit tests). */
export type InteractiveLoginRunner = (
    spec: InteractiveLoginCommandSpec,
    env: Record<string, string>,
) => InteractiveLoginResult;

/** Default interactive login runner using `spawnSync(..., { stdio: 'inherit' })`. */
export function RunInteractiveCliLogin(
    spec: InteractiveLoginCommandSpec,
    env: Record<string, string>,
): InteractiveLoginResult {
    const result: SpawnSyncReturns<Buffer> = spawnSync(spec.command, spec.args, {
        stdio: 'inherit',
        env,
    });
    return {
        Status: result.status,
        Error: result.error,
    };
}

/**
 * Builds the subprocess environment for an interactive CLI subscription login:
 * inherits host environment, layers the slot's `envOverrides`, and strips provider API keys
 * so the CLI executes its subscription OAuth login flow cleanly.
 */
export function BuildInteractiveLoginEnv(
    envOverrides: Readonly<Record<string, string>>,
    baseEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(baseEnv)) {
        if (value !== undefined) {
            env[key] = value;
        }
    }
    Object.assign(env, envOverrides);
    StripHarnessApiKeyEnvironment(env);
    return env;
}

/** Builds {@link HarnessAccountPoolOptions} from an optional `--pool-dir` CLI flag. */
export function BuildPoolOptionsFromFlag(poolDir?: string): HarnessAccountPoolOptions | undefined {
    const trimmed = poolDir?.trim();
    return trimmed ? { poolDir: trimmed } : undefined;
}

/** Validates and normalizes a CLI `<vendor>` argument or throws an actionable error message. */
export function RequireHarnessVendor(rawVendor: string): HarnessPoolVendor {
    const vendor = NormalizeHarnessPoolVendor(rawVendor);
    if (!vendor) {
        throw new Error(
            `Unknown vendor '${rawVendor}'. Supported vendors: ${HARNESS_POOL_VENDORS.join(', ')} ` +
                `(aliases: claude-code, antigravity, openai-codex, gemini-cli).`,
        );
    }
    return vendor;
}

/** Validates and normalizes a CLI `<strategy>` argument or throws an actionable error message. */
export function RequireHarnessStrategy(rawStrategy: string): HarnessAccountSelectionStrategy {
    const strategy = ParseHarnessAccountSelectionStrategy(rawStrategy);
    if (!strategy) {
        throw new Error(
            `Invalid strategy '${rawStrategy}'. Valid strategies: ${HARNESS_ACCOUNT_SELECTION_STRATEGIES.join(', ')}.`,
        );
    }
    return strategy;
}

/** Formats human-readable setup instructions for an isolated CLI account slot. */
export function FormatSlotIsolationInstructions(
    vendor: HarnessPoolVendor,
    slotId: string,
    slotDir: string,
    envOverrides: Readonly<Record<string, string>>,
): string[] {
    const loginSpec = HarnessAccountPoolService.Instance.GetInteractiveLoginCommand(vendor);
    const envPreview = Object.entries(envOverrides)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
    const lines = [
        `Slot '${slotId}' (${vendor}) directory: ${slotDir}`,
        `Interactive login command: ${envPreview ? `${envPreview} ` : ''}${loginSpec.displayCommand}`,
    ];
    if (vendor === 'agy' || vendor === 'gemini') {
        lines.push(
            'Isolated HOME prepared with read-through toolchain symlinks (.gitconfig, .ssh, .npmrc, etc.); ' +
                '.gemini/ and .config/ credentials stay local to this slot.',
        );
    }
    return lines;
}

/** Structured JSON payload emitted by `mj harness account list --json`. */
export interface HarnessAccountListJsonOutput {
    PoolDir: string;
    Strategy: HarnessAccountSelectionStrategy;
    IncludeOsDefaultLogin: boolean;
    Slots: HarnessAccountSlotStatus[];
}

/** Renders the `mj harness account list` human-readable table. */
export function FormatHarnessAccountTable(
    poolDir: string,
    strategy: HarnessAccountSelectionStrategy,
    includeOsDefaultLogin: boolean,
    slots: readonly HarnessAccountSlotStatus[],
): string {
    const lines: string[] = [
        `Harness Account Pool (${poolDir})`,
        `Strategy: ${strategy} | Include OS Default Login: ${includeOsDefaultLogin ? 'yes' : 'no'}`,
        '',
    ];

    if (slots.length === 0) {
        lines.push('No CLI account slots found. Add one with: mj harness account add <claude|agy|codex|gemini>');
        return lines.join('\n');
    }

    const headers = ['SLOT ID', 'VENDOR', 'LABEL', 'AUTH', 'ENABLED', 'LEASES', 'W/P', 'COOLDOWN'];
    const rows = slots.map((slot) => [
        slot.slotId,
        slot.vendor,
        slot.label,
        slot.authStatus,
        slot.enabled ? 'yes' : 'no',
        String(slot.activeLeaseCount),
        `${slot.weight}/${slot.priority}`,
        slot.inCooldown && slot.cooldownUntilIso ? `until ${slot.cooldownUntilIso}` : 'none',
    ]);

    const widths = headers.map((header, colIdx) =>
        Math.max(header.length, ...rows.map((row) => row[colIdx].length)),
    );

    const formatRow = (cols: readonly string[]): string =>
        cols.map((col, idx) => col.padEnd(widths[idx])).join('  ');

    lines.push(formatRow(headers));
    lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
    for (const row of rows) {
        lines.push(formatRow(row));
    }

    return lines.join('\n');
}
