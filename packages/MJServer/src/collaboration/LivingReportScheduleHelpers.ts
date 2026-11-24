import { IsValidUUID, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { ActionJobConfiguration } from '@memberjunction/scheduling-base-types';
import { CronExpressionHelper } from '@memberjunction/scheduling-engine';

/** Seeded fallback ID of the `'Action'` scheduled job type (`ActionScheduledJobDriver`). */
export const ACTION_SCHEDULED_JOB_TYPE_ID = '3B94DD43-E961-4D85-B7F4-B6783D748766';

/** Seeded `DriverClass` and `ID` of the `'Refresh and Snapshot Artifact'` action. */
export const LIVING_REPORT_ACTION_DRIVER_CLASS = '__RefreshAndSnapshotArtifact';
export const LIVING_REPORT_DEFAULT_ACTION_ID = 'A4D18C20-5B3E-4C1A-9E8F-100000000001';

/** Fallback parameter UUIDs matching `metadata/actions/.refresh-and-snapshot-artifact.json`. */
export const LIVING_REPORT_FALLBACK_PARAM_IDS = {
    ArtifactID: 'A4D18C20-5B3E-4C1A-9E8F-100000000002',
    FreezeRefreshedBlocks: 'A4D18C20-5B3E-4C1A-9E8F-100000000003',
    ForceSaveIfUnchanged: 'A4D18C20-5B3E-4C1A-9E8F-100000000005',
    ForceRefreshFrozen: '41E37F99-DB03-4D14-A0A4-969AB90F0FA5',
} as const;

/** Minimum allowed interval (5 minutes) between scheduled Living Report runs to prevent cron DoS. */
export const MIN_LIVING_REPORT_INTERVAL_MS = 5 * 60 * 1000;
/** Sample depth across >=2h of 1-minute ticks so sparse sub-5m bursts cannot pass initial samples. */
export const LIVING_REPORT_CRON_SAMPLE_SIZE = 128;
export const MAX_LIVING_REPORT_NAME_LENGTH = 200;
export const MAX_CRON_EXPRESSION_LENGTH = 120;

export interface ParsedLivingReportJobConfig {
    ActionID: string;
    ArtifactID: string;
    ForceSaveIfUnchanged: boolean;
    HasNonStaticParams: boolean;
}

export interface LivingReportParamIds {
    ArtifactID: string;
    FreezeRefreshedBlocks?: string;
    ForceRefreshFrozen?: string;
    ForceSaveIfUnchanged?: string;
}

const SUPPORTED_IANA_TIMEZONES: ReadonlySet<string> | null =
    typeof Intl.supportedValuesOf === 'function'
        ? new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])
        : null;

/**
 * Validates that `timezone` is a recognized IANA timezone identifier (rejecting raw offsets like `+05:30` or `UTC+5`).
 * Uses `Intl.DateTimeFormat` canonicalization before checking `Intl.supportedValuesOf('timeZone')` so valid IANA
 * links omitted from V8's CLDR list (`Asia/Kolkata`, `Europe/Kyiv`, `Etc/UTC`, `US/Eastern`) are accepted cleanly.
 */
export function ValidateLivingReportTimezone(timezone: string): boolean {
    const trimmed = timezone.trim();
    if (!trimmed || trimmed.length > 64 || /^[+-]|^(?:UTC|GMT)[+-]/i.test(trimmed)) {
        return false;
    }
    try {
        const canonical = new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions().timeZone;
        if (!SUPPORTED_IANA_TIMEZONES) {
            return true;
        }
        return SUPPORTED_IANA_TIMEZONES.has(trimmed) || SUPPORTED_IANA_TIMEZONES.has(canonical);
    } catch {
        return false;
    }
}

/**
 * Validates a Living Report cron expression and timezone, rejecting invalid syntax, over-length expressions,
 * impossible/non-finite cadences, and intervals tighter than 5 minutes across a 128-run sample window.
 */
export function ValidateLivingReportScheduleInput(
    cronExpression: string,
    timezone: string,
): { Valid: boolean; NormalizedCron: string; NormalizedTimezone: string; NextRunAt?: Date; ErrorMessage?: string } {
    const normalizedCron = cronExpression.trim();
    const normalizedTz = timezone.trim() || 'UTC';

    if (!normalizedCron || normalizedCron.length > MAX_CRON_EXPRESSION_LENGTH) {
        return {
            Valid: false,
            NormalizedCron: normalizedCron,
            NormalizedTimezone: normalizedTz,
            ErrorMessage: `Cron expression must be between 1 and ${MAX_CRON_EXPRESSION_LENGTH} characters.`,
        };
    }

    if (!ValidateLivingReportTimezone(normalizedTz)) {
        return {
            Valid: false,
            NormalizedCron: normalizedCron,
            NormalizedTimezone: normalizedTz,
            ErrorMessage: `Invalid IANA timezone '${timezone}'.`,
        };
    }

    const validation = CronExpressionHelper.ValidateExpression(normalizedCron);
    if (!validation.Success) {
        const reason = validation.Errors.map((e) => e.Message).join('; ') || 'Invalid cron expression.';
        return {
            Valid: false,
            NormalizedCron: normalizedCron,
            NormalizedTimezone: normalizedTz,
            ErrorMessage: reason,
        };
    }

    const minIntervalMs = CronExpressionHelper.GetMinIntervalMs(
        normalizedCron,
        normalizedTz,
        LIVING_REPORT_CRON_SAMPLE_SIZE,
    );
    if (!Number.isFinite(minIntervalMs) || minIntervalMs < MIN_LIVING_REPORT_INTERVAL_MS) {
        return {
            Valid: false,
            NormalizedCron: normalizedCron,
            NormalizedTimezone: normalizedTz,
            ErrorMessage: 'Living Report schedules must yield valid recurring intervals at least 5 minutes apart.',
        };
    }

    try {
        const nextRunAt = CronExpressionHelper.GetNextRunTime(normalizedCron, normalizedTz);
        return {
            Valid: true,
            NormalizedCron: normalizedCron,
            NormalizedTimezone: normalizedTz,
            NextRunAt: nextRunAt,
        };
    } catch (error) {
        return {
            Valid: false,
            NormalizedCron: normalizedCron,
            NormalizedTimezone: normalizedTz,
            ErrorMessage: error instanceof Error ? error.message : 'Unable to determine next run time for cron expression.',
        };
    }
}

/**
 * Parses an `MJ: Scheduled Jobs.Configuration` JSON payload and verifies it targets the Living Report action
 * (`expectedActionId` or default) and the specified `artifactId` (when supplied).
 */
export function ParseLivingReportJobConfiguration(
    configJson: string | null | undefined,
    expectedArtifactParamIds: ReadonlySet<string>,
    allowedActionIds: ReadonlyArray<string> = [LIVING_REPORT_DEFAULT_ACTION_ID],
    expectedForceSaveParamIds: ReadonlySet<string> = new Set([
        LIVING_REPORT_FALLBACK_PARAM_IDS.ForceSaveIfUnchanged.toLowerCase(),
    ]),
): ParsedLivingReportJobConfig | null {
    if (!configJson || typeof configJson !== 'string') {
        return null;
    }
    const parsed = SafeJSONParse<ActionJobConfiguration>(configJson);
    if (!parsed || typeof parsed.ActionID !== 'string') {
        return null;
    }
    const matchesAction = allowedActionIds.some((id) => UUIDsEqual(parsed.ActionID, id));
    if (!matchesAction || !Array.isArray(parsed.Params)) {
        return null;
    }

    let artifactId = '';
    let artifactParamCount = 0;
    let forceSaveIfUnchanged = false;
    let hasNonStaticParams = false;

    for (const p of parsed.Params) {
        if (!p || typeof p !== 'object') {
            continue;
        }
        if (p.ValueType !== 'Static') {
            hasNonStaticParams = true;
        }
        const rawParamId = String(p.ActionParamID ?? '').trim().toLowerCase();
        const rawValue = String(p.Value ?? '').trim();

        if (expectedArtifactParamIds.has(rawParamId)) {
            artifactParamCount += 1;
            if (artifactParamCount > 1 || !IsValidUUID(rawValue)) {
                return null;
            }
            artifactId = rawValue;
        }
        if (expectedForceSaveParamIds.has(rawParamId)) {
            forceSaveIfUnchanged = rawValue.toLowerCase() === 'true';
        }
    }

    if (!artifactId) {
        return null;
    }

    return {
        ActionID: parsed.ActionID,
        ArtifactID: artifactId,
        ForceSaveIfUnchanged: forceSaveIfUnchanged,
        HasNonStaticParams: hasNonStaticParams,
    };
}

/**
 * Builds an `ActionScheduledJobDriver` configuration JSON string with strict static parameters and
 * hardcoded `FreezeRefreshedBlocks: false` / `ForceRefreshFrozen: false` invariants.
 */
export function BuildLivingReportJobConfiguration(options: {
    actionId: string;
    artifactId: string;
    paramIds: LivingReportParamIds;
    forceSaveIfUnchanged: boolean;
}): string {
    const params: ActionJobConfiguration['Params'] = [
        {
            ActionParamID: options.paramIds.ArtifactID,
            ValueType: 'Static',
            Value: options.artifactId,
        },
    ];
    if (options.paramIds.FreezeRefreshedBlocks) {
        params.push({
            ActionParamID: options.paramIds.FreezeRefreshedBlocks,
            ValueType: 'Static',
            Value: 'false',
        });
    }
    if (options.paramIds.ForceRefreshFrozen) {
        params.push({
            ActionParamID: options.paramIds.ForceRefreshFrozen,
            ValueType: 'Static',
            Value: 'false',
        });
    }
    if (options.paramIds.ForceSaveIfUnchanged) {
        params.push({
            ActionParamID: options.paramIds.ForceSaveIfUnchanged,
            ValueType: 'Static',
            Value: options.forceSaveIfUnchanged ? 'true' : 'false',
        });
    }

    const config: ActionJobConfiguration = {
        ActionID: options.actionId,
        Params: params,
    };
    return JSON.stringify(config, null, 2);
}
