/**
 * @fileoverview {@link ContentPipelineResetService} — putting a record back in play.
 *
 * **Reset only changes status fields.** A record set back to `Pending` is ready again, and whatever
 * finds ready records picks it up the next time it looks. Reset does not need to know a queue
 * exists.
 *
 * **The reset is flat.** It writes every downstream status field directly rather than relying on
 * each intermediate stage to run and propagate it forward. Nothing guarantees every stage between
 * the point of change and the end of a deployment's sequence is actually running — and resetting a
 * status field nobody acts on is harmless, while relying on a stage that never runs to carry a reset
 * forward leaves the record stuck.
 *
 * One operation, two callers: a checksum noticing a change, and a person deciding a failure is worth
 * retrying.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, CompositeKey, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { WorkingRecordEntity } from '@memberjunction/content-pipeline-base';
import { GetEntityName, GetStatusFields } from './EntityFieldMap.js';

/** What a reset did. */
export interface ResetResult {
    /** How many records were reset. */
    RecordCount: number;
    /** The status fields written. */
    StatusFields: readonly string[];
}

/** Which stages to reset, when not resetting all of them. */
export interface ResetOptions {
    /**
     * Reset only these status fields. Omitted means every status field on the entity.
     *
     * A driver that noticed only a metadata change uses this to reset just Embed's status, leaving
     * everything upstream alone.
     */
    StatusFields?: readonly string[];
    /** The value to write. Defaults to `Pending`. */
    Status?: string;
}

/**
 * Resets pipeline status fields.
 *
 * Deliberately small: it knows the status fields each entity carries and nothing else about why a
 * reset is happening.
 */
export class ContentPipelineResetService {
    constructor(
        private readonly provider: IMetadataProvider = Metadata.Provider,
        private readonly contextUser?: UserInfo,
    ) {}

    /**
     * Put one record back in play.
     *
     * @param entity Which entity the record belongs to.
     * @param recordID The record's primary key.
     */
    public async ResetRecord(
        entity: WorkingRecordEntity,
        recordID: string,
        options: ResetOptions = {},
        contextUser?: UserInfo,
    ): Promise<ResetResult> {
        const user = this.requireUser(contextUser);
        const fields = this.fieldsFor(entity, options);
        const entityObject = await this.provider.GetEntityObject<BaseEntity>(GetEntityName(entity), user);
        if (!(await entityObject.InnerLoad(CompositeKey.FromID(recordID)))) { // first-pk-ok: MJ core content entity, single-column ID
            throw new Error(`${GetEntityName(entity)} record '${recordID}' not found`);
        }
        const written = this.applyStatuses(entityObject, fields, options.Status ?? 'Pending');
        if (written.length > 0 && !(await entityObject.Save())) {
            throw new Error(
                `Failed to reset ${GetEntityName(entity)} '${recordID}': ` +
                    `${entityObject.LatestResult?.Message ?? 'unknown error'}`,
            );
        }
        return { RecordCount: written.length > 0 ? 1 : 0, StatusFields: written };
    }

    /**
     * Put every failed record on a source back in play.
     *
     * The deliberate, human-triggered half of the same operation — used once someone has looked at
     * why the records failed.
     */
    public async ResetFailedForSource(
        contentSourceID: string,
        options: ResetOptions = {},
        contextUser?: UserInfo,
    ): Promise<ResetResult> {
        const user = this.requireUser(contextUser);
        const fields = this.fieldsFor('Content Item', options);
        const failedClause = fields.map((f) => `${f} = 'Failed'`).join(' OR ');
        const rv = RunView.FromMetadataProvider(this.provider);
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: GetEntityName('Content Item'),
                ExtraFilter: `ContentSourceID='${contentSourceID}' AND (${failedClause})`,
            },
            user,
        );
        if (!result.Success) {
            throw new Error(`Could not list failed records for source '${contentSourceID}'`);
        }

        let reset = 0;
        for (const row of result.Results) {
            try {
                // Only the fields that actually failed, so a record that failed at Extract is not
                // also re-tagged and re-embedded for no reason.
                await this.ResetRecord('Content Item', row.ID, { ...options, Status: options.Status ?? 'Pending' }, user);
                reset++;
            } catch (error) {
                LogError(
                    `ContentPipelineResetService: could not reset '${row.ID}': ` +
                        `${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
        return { RecordCount: reset, StatusFields: fields };
    }

    /** Write the status fields the entity actually has. */
    private applyStatuses(entityObject: BaseEntity, fields: readonly string[], status: string): string[] {
        const written: string[] = [];
        for (const field of fields) {
            if (entityObject.Fields.some((f) => f.Name === field)) {
                entityObject.Set(field, status);
                written.push(field);
            }
        }
        return written;
    }

    /** Which status fields this reset touches. */
    private fieldsFor(entity: WorkingRecordEntity, options: ResetOptions): readonly string[] {
        const all = GetStatusFields(entity);
        if (!options.StatusFields) {
            return all;
        }
        // Only fields the entity genuinely has, so a caller naming a field from another entity gets
        // a no-op rather than a save error.
        return options.StatusFields.filter((f) => all.includes(f));
    }

    /** The acting user, which every path needs. */
    private requireUser(contextUser?: UserInfo): UserInfo {
        const user = contextUser ?? this.contextUser;
        if (!user) {
            throw new Error('ContentPipelineResetService: a context user is required');
        }
        return user;
    }
}
