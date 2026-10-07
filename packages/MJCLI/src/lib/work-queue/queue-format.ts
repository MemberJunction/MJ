import type { RemoteOpResult } from '@memberjunction/core';
import type {
    WorkQueueBindingIssueRow, WorkQueueGetBacklogOutput, WorkQueueListDeadLettersOutput, WorkQueueListPartitionsInput,
    WorkQueueListPartitionsOutput, WorkQueueStatsFailureRow, WorkQueueSubscriptionStatsRow,
} from '@memberjunction/core-entities';
import type { BindingImport, WorkJson } from '@memberjunction/work-queue-core';

type PartitionConditionOption = NonNullable<WorkQueueListPartitionsInput['condition']>;

export const PARTITION_CONDITION_OPTIONS: readonly PartitionConditionOption[] = ['Idle', 'InFlight', 'Blocked'];

const UNKNOWN = '—';
const MAX_ERROR_WIDTH = 60;

export function FormatTable(headers: string[], rows: string[][]): string {
    const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => (row[index] ?? '').length)));
    const line = (cells: string[]): string => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd();
    return [line(headers), line(widths.map(width => '-'.repeat(width))), ...rows.map(line)].join('\n');
}

export function FormatStatsTable(rows: WorkQueueSubscriptionStatsRow[], failures: WorkQueueStatsFailureRow[]): string {
    if (rows.length === 0 && failures.length === 0) {
        return 'No subscriptions.';
    }
    const table = rows.length === 0 ? '' : FormatTable(
        ['Subscription', 'Pending', 'In flight', 'Dead', 'Blocked keys', 'Oldest pending (s)', 'Done/hour'],
        rows.map(row => [
            row.SubscriptionName, String(row.Pending), String(row.InFlight), String(row.DeadLettered), Optional(row.BlockedKeys),
            Optional(row.OldestPendingAgeSeconds), Optional(row.CompletedLastHour),
        ]),
    );
    const failed = failures.map(failure => `! ${failure.subscriptionName}: ${failure.error}`);
    return [table, ...failed].filter(part => part !== '').join('\n');
}

export function FormatDeadLetters(output: WorkQueueListDeadLettersOutput): string {
    if (!output.supported) {
        return "This subscription's transport cannot list dead letters.";
    }
    if (output.items.length === 0) {
        return 'No dead letters.';
    }
    const table = FormatTable(
        ['Delivery', 'Partition key', 'Attempts', 'Reason', 'Blocks key', 'Dead-lettered at', 'Last error'],
        output.items.map(item => [
            item.DeliveryID, item.PartitionKey ?? UNKNOWN, String(item.Attempts), item.Reason, item.BlocksKey ? 'yes' : 'no',
            item.DeadLetteredAt ?? UNKNOWN, Truncate(item.LastError ?? '', MAX_ERROR_WIDTH),
        ]),
    );
    return WithCursor(table, output.nextCursor);
}

export function FormatPartitions(output: WorkQueueListPartitionsOutput): string {
    if (!output.supported) {
        return "This subscription's transport cannot list partitions.";
    }
    if (output.items.length === 0) {
        return 'No partitions match.';
    }
    const table = FormatTable(
        ['Partition key', 'Condition', 'Head delivery', 'Waiting'],
        output.items.map(item => [item.PartitionKey, item.Condition, item.HeadDeliveryID ?? UNKNOWN, String(item.WaitingItems)]),
    );
    return WithCursor(table, output.nextCursor);
}

export function FormatBacklog(output: WorkQueueGetBacklogOutput): string {
    if (!output.supported) {
        return "This subscription's transport reports no backlog; scale from the transport's own metrics.";
    }
    const line = `claimable ${output.claimable} · in flight ${output.inFlight} · total ${output.total}`;
    return output.capped ? `${line} (capped at 1000 — the real backlog is at least this large)` : line;
}

export function FormatBindingIssues(issues: WorkQueueBindingIssueRow[]): string {
    if (issues.length === 0) {
        return 'No binding issues.';
    }
    return issues.map(issue => `${issue.Severity === 'Error' ? '✖' : '⚠'} ${issue.Severity} ${issue.Subject}: ${issue.Message}`).join('\n');
}

export function HasBindingErrors(issues: WorkQueueBindingIssueRow[]): boolean {
    return issues.some(issue => issue.Severity === 'Error');
}

export function ParseBindingImport(json: string): BindingImport {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error('Binding import file is not valid JSON');
    }
    if (!IsRecord(parsed) || parsed.ManifestVersion !== 1 || !Array.isArray(parsed.Topics) || !Array.isArray(parsed.Subscriptions)) {
        throw new Error('Binding import must be { "ManifestVersion": 1, "Topics": [...], "Subscriptions": [...] }');
    }
    return {
        ManifestVersion: 1,
        Topics: parsed.Topics.map((entry, index) => BindingEntry(entry, `Topics[${index}]`)),
        Subscriptions: parsed.Subscriptions.map((entry, index) => BindingEntry(entry, `Subscriptions[${index}]`)),
    };
}

export function RequireOperationOutput<T>(result: RemoteOpResult<T>, operationKey: string): T {
    if (!result.Success || result.Output === undefined) {
        throw new Error(`${operationKey} failed (${result.ResultCode ?? 'UNKNOWN'}): ${result.ErrorMessage ?? 'no output'}`);
    }
    return result.Output;
}

export function ToPartitionCondition(value: string | undefined): PartitionConditionOption | undefined {
    if (value === undefined) {
        return undefined;
    }
    const condition = PARTITION_CONDITION_OPTIONS.find(option => option === value);
    if (!condition) {
        throw new Error(`--condition must be one of ${PARTITION_CONDITION_OPTIONS.join(', ')}`);
    }
    return condition;
}

function BindingEntry(value: unknown, at: string): { Name: string; BindingConfig: Record<string, WorkJson> } {
    if (!IsRecord(value) || typeof value.Name !== 'string' || !IsJsonObject(value.BindingConfig)) {
        throw new Error(`${at} must have a string Name and an object BindingConfig`);
    }
    return { Name: value.Name, BindingConfig: value.BindingConfig };
}

function IsJsonObject(value: unknown): value is Record<string, WorkJson> {
    return IsRecord(value) && Object.values(value).every(IsWorkJsonValue);
}

function IsWorkJsonValue(value: unknown): value is WorkJson {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every(IsWorkJsonValue);
    }
    return IsJsonObject(value);
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function Optional(value: number | null): string {
    return value === null ? UNKNOWN : String(value);
}

function Truncate(text: string, width: number): string {
    return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}

function WithCursor(table: string, nextCursor: string | null): string {
    return nextCursor ? `${table}\nMore: --cursor ${nextCursor}` : table;
}
