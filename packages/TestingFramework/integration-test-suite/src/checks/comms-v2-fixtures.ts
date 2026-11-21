/**
 * comms-v2-fixtures.ts — shared by the Comms V2 bundles (comms-v2-core / -compliance / -send /
 * -activity / -wire): how their test data is named and tagged, and a teardown that never throws.
 *
 * NAMING. Every run takes its own tag (NewCommsRunTag), and every address and name a check creates
 * carries it, so two runs against one database never collide and a leftover row names the run that
 * made it. Addresses use the reserved `.test` top-level domain, which no mail server delivers to.
 *
 * TAGGING. A row with a free-text column carries COMMS_IT_TAG there (suppression Notes, log
 * CorrelationData). Rows the server writes on a check's behalf carry the ASCII form through the
 * request that caused them (the User-Agent of an unsubscribe POST, the bounce reason of a webhook
 * event).
 *
 * RESIDUE. `MJ: Communication Consent Audit Logs` is append-only (no delete API), and its foreign
 * keys do not cascade. Once the activity worker has written an audit row for a suppression, that
 * audit row, its suppression, and the log and endpoint the suppression points at cannot be deleted
 * through the entity layer. CommsCleanup attempts every delete, records each refusal, and logs them
 * once; the rows left behind are uniquely named and tagged safe to delete.
 */
import { randomUUID } from 'node:crypto';
import { LogStatus, RunView } from '@memberjunction/core';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';

/** Marks a row as integration-test data that is safe to delete. */
export const COMMS_IT_TAG = '(mj-integration-test — safe to delete)';
/** The same marker in ASCII, for HTTP headers and signed request bodies. */
export const COMMS_IT_TAG_ASCII = 'mj-integration-test - safe to delete';

/** A tag unique to one run of one check or bundle, e.g. `cv2w-mb2k1x9a-3f9c1e07`. */
export function NewCommsRunTag(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

/** A recipient address unique to `runTag`, on the undeliverable `.test` domain. */
export function CommsTestAddress(runTag: string, label = 'rcpt'): string {
    return `mj-it-${label}-${runTag}@integration.test`.toLowerCase();
}

/** An `IN (...)` list of quoted, escaped IDs. */
export function QuotedIdList(ids: readonly string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Best-effort teardown for one check or bundle. Every delete is attempted on its own, a refusal or
 * a throw is recorded and the next delete still runs, and nothing here ever throws.
 */
export class CommsCleanup {
    private readonly failures: string[] = [];

    constructor(private readonly owner: string, private readonly user: UserInfo) {}

    /** The user every read and delete runs as. */
    public get User(): UserInfo {
        return this.user;
    }

    /** What could not be deleted, one line each. */
    public get Failures(): readonly string[] {
        return this.failures;
    }

    /** Deletes one saved entity object; does nothing for a missing or unsaved one. */
    public async Delete(entity: BaseEntity | null | undefined, label: string): Promise<void> {
        if (!entity || !entity.IsSaved) {
            return;
        }
        try {
            if (!(await entity.Delete())) {
                this.failures.push(`${label}: ${entity.LatestResult?.CompleteMessage ?? 'Delete() returned false'}`);
            }
        } catch (error) {
            this.failures.push(`${label}: ${describeError(error)}`);
        }
    }

    /** Deletes every row of `entityName` matching `filter`. */
    public async DeleteWhere(entityName: string, filter: string): Promise<void> {
        try {
            const rows = await new RunView().RunView<BaseEntity>(
                { EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true },
                this.user,
            );
            if (!rows.Success) {
                this.failures.push(`${entityName} [${filter}]: read failed: ${rows.ErrorMessage ?? 'RunView failed'}`);
                return;
            }
            for (const row of rows.Results) {
                await this.Delete(row, `${entityName} ${row.PrimaryKey.ToString()}`);
            }
        } catch (error) {
            this.failures.push(`${entityName} [${filter}]: ${describeError(error)}`);
        }
    }

    /** Runs one teardown step that is not a plain delete, recording a throw instead of raising it. */
    public async Step(label: string, work: () => Promise<void>): Promise<void> {
        try {
            await work();
        } catch (error) {
            this.failures.push(`${label}: ${describeError(error)}`);
        }
    }

    /**
     * Deletes what the activity worker and the send pipeline hang off the given endpoints and logs,
     * children first: consent audit rows, suppressions, activities, endpoint-principal links.
     */
    public async DeleteEndpointDependents(endpointIds: readonly string[], logIds: readonly string[] = []): Promise<void> {
        if (endpointIds.length === 0 && logIds.length === 0) {
            return;
        }
        const scope: string[] = [];
        if (endpointIds.length > 0) {
            scope.push(`CommunicationEndpointID IN (${QuotedIdList(endpointIds)})`);
        }
        if (logIds.length > 0) {
            scope.push(`CommunicationLogID IN (${QuotedIdList(logIds)})`);
        }
        const scopeFilter = scope.join(' OR ');
        const suppressionIds = await this.readIds('MJ: Communication Suppressions', scopeFilter);
        if (suppressionIds.length > 0) {
            await this.DeleteWhere('MJ: Communication Consent Audit Logs', `CommunicationSuppressionID IN (${QuotedIdList(suppressionIds)})`);
            await this.DeleteWhere('MJ: Communication Suppressions', `ID IN (${QuotedIdList(suppressionIds)})`);
        }
        await this.DeleteWhere('MJ: Communication Activities', scopeFilter);
        if (endpointIds.length > 0) {
            await this.DeleteWhere('MJ: Communication Endpoint Principals', `CommunicationEndpointID IN (${QuotedIdList(endpointIds)})`);
        }
    }

    /** Logs what was left behind. Call last; never throws. */
    public Report(): void {
        if (this.failures.length === 0) {
            return;
        }
        try {
            LogStatus(
                `[${this.owner}] teardown left ${this.failures.length} row(s) or step(s) behind, all uniquely named and tagged ${COMMS_IT_TAG}:\n  - ${this.failures.join('\n  - ')}`,
            );
        } catch {
            // logging must not turn a finished check into a failed one
        }
    }

    private async readIds(entityName: string, filter: string): Promise<string[]> {
        try {
            const rows = await new RunView().RunView<{ ID: string }>(
                { EntityName: entityName, Fields: ['ID'], ExtraFilter: filter, ResultType: 'simple', BypassCache: true },
                this.user,
            );
            if (!rows.Success) {
                this.failures.push(`${entityName} [${filter}]: read failed: ${rows.ErrorMessage ?? 'RunView failed'}`);
                return [];
            }
            return rows.Results.map((row) => row.ID);
        } catch (error) {
            this.failures.push(`${entityName} [${filter}]: ${describeError(error)}`);
            return [];
        }
    }
}
