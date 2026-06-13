/**
 * @fileoverview Driver for executing scheduled Integration DISCOVERY jobs (§13).
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import {
    Metadata,
    ValidationResult,
    ValidationErrorInfo,
    ValidationErrorType,
    IMetadataProvider,
} from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';
import { IntegrationEngine, ConnectorFactory, IntegrationConnectorCreationPipeline } from '@memberjunction/integration-engine';
import { ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';

/**
 * Configuration schema (stored in ScheduledJob.Configuration) for a DISCOVERY-only job:
 * {
 *   CompanyIntegrationID: string,
 *   DeactivateAbsent?: boolean,        // §7 — default true (comprehensive, reversible)
 *   UniversalPKConvention?: string
 * }
 */
interface IntegrationDiscoveryJobConfiguration {
    CompanyIntegrationID: string;
    DeactivateAbsent?: boolean;
    UniversalPKConvention?: string;
}

/**
 * Driver for executing scheduled Integration DISCOVERY jobs (§13).
 *
 * Unlike {@link IntegrationSyncScheduledJobDriver} (which moves DATA via RunSync), this driver ONLY
 * re-discovers the connector's SCHEMA on a cron — it runs the same `IntegrationConnectorCreationPipeline`
 * as the on-demand `IntegrationRefreshConnectorSchema` mutation (ConnectionTest → Introspect → Persist →
 * PKClassify). Its job is to keep the `MJ: Integration Objects` / `Integration Object Fields` catalog
 * evolving so the entity-map / field-map picker keeps offering newly-appeared tables/columns, and so
 * objects/fields the source dropped get deactivated (reversibly) when discovery is authoritative.
 *
 * It NEVER materializes tables (no RSU) and NEVER syncs records — selection + create-tables remain an
 * explicit operator action. Created/managed entirely over GraphQL via the `discovery` job-kind on
 * `IntegrationCreateSchedule`.
 */
@RegisterClass(BaseScheduledJob, 'IntegrationDiscoveryScheduledJobDriver')
export class IntegrationDiscoveryScheduledJobDriver extends BaseScheduledJob {

    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.parseConfiguration<IntegrationDiscoveryJobConfiguration>(context.Schedule);

        this.log(`Starting integration DISCOVERY refresh for CompanyIntegration: ${config.CompanyIntegrationID}`);

        // Ensure the integration engine metadata is loaded (connector cache, etc.).
        await IntegrationEngine.Instance.Config(false, context.ContextUser);

        const provider = Metadata.Provider as unknown as IMetadataProvider;
        const ci = await provider.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', context.ContextUser);
        if (!(await ci.Load(config.CompanyIntegrationID))) {
            return {
                Success: false,
                ErrorMessage: `CompanyIntegration "${config.CompanyIntegrationID}" not found`,
                Details: { CompanyIntegrationID: config.CompanyIntegrationID },
            };
        }
        const integration = await provider.GetEntityObject<MJIntegrationEntity>('MJ: Integrations', context.ContextUser);
        if (!(await integration.Load(ci.IntegrationID))) {
            return {
                Success: false,
                ErrorMessage: `Integration "${ci.IntegrationID}" not found`,
                Details: { CompanyIntegrationID: config.CompanyIntegrationID },
            };
        }
        const connector = ConnectorFactory.Resolve(integration);

        const pipeline = new IntegrationConnectorCreationPipeline();
        const result = await pipeline.Run({
            Connector: connector,
            CompanyIntegration: ci,
            ContextUser: context.ContextUser,
            Provider: provider,
            UniversalPKConvention: config.UniversalPKConvention || undefined,
            TriggerType: 'Scheduled',
            ConsoleMirror: false,
            // §13 — a scheduled discovery refresh is comprehensive by default: it evolves the IO/IOF catalog,
            // deactivating absent objects/fields and reactivating reappeared ones (reversible, gated on the
            // connector's authoritative-discovery getter). Caller can opt out per-job via Configuration.
            DeactivateAbsent: config.DeactivateAbsent ?? true,
        });

        const p = result.PersistResult;
        this.log(
            `Discovery refresh ${result.Success ? 'completed' : 'failed'}: ` +
            `${p?.ObjectsCreated ?? 0} new objects, ${p?.FieldsCreated ?? 0} new fields, ` +
            `${p?.ObjectsUpdated ?? 0} updated objects, ${p?.FieldsUpdated ?? 0} updated fields`
        );

        return {
            Success: result.Success,
            ErrorMessage: result.FailureMessage,
            Details: {
                RunID: result.RunID,
                CompanyIntegrationID: config.CompanyIntegrationID,
                ObjectsCreated: p?.ObjectsCreated ?? 0,
                ObjectsUpdated: p?.ObjectsUpdated ?? 0,
                FieldsCreated: p?.FieldsCreated ?? 0,
                FieldsUpdated: p?.FieldsUpdated ?? 0,
                UnresolvedObjects: result.UnresolvedObjects,
            },
        };
    }

    public ValidateConfiguration(schedule: { Configuration?: string }): ValidationResult {
        const result = new ValidationResult();

        try {
            const config = this.parseConfiguration<IntegrationDiscoveryJobConfiguration>(
                schedule as Parameters<typeof this.parseConfiguration>[0]
            );

            if (!config.CompanyIntegrationID) {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.CompanyIntegrationID',
                    'CompanyIntegrationID is required',
                    config.CompanyIntegrationID,
                    ValidationErrorType.Failure
                ));
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid configuration';
            result.Errors.push(new ValidationErrorInfo(
                'Configuration',
                errorMessage,
                schedule.Configuration,
                ValidationErrorType.Failure
            ));
        }

        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(
        context: ScheduledJobExecutionContext,
        result: ScheduledJobResult
    ): NotificationContent {
        const details = result.Details;

        const subject = result.Success
            ? `Scheduled Integration Discovery Completed: ${context.Schedule.Name}`
            : `Scheduled Integration Discovery Failed: ${context.Schedule.Name}`;

        const body = result.Success
            ? [
                `The scheduled integration discovery "${context.Schedule.Name}" completed successfully.`,
                '',
                `New objects:     ${details?.ObjectsCreated ?? 'N/A'}`,
                `New fields:      ${details?.FieldsCreated ?? 'N/A'}`,
                `Updated objects: ${details?.ObjectsUpdated ?? 'N/A'}`,
                `Updated fields:  ${details?.FieldsUpdated ?? 'N/A'}`,
            ].join('\n')
            : [
                `The scheduled integration discovery "${context.Schedule.Name}" failed.`,
                '',
                `Error: ${result.ErrorMessage ?? 'Unknown error'}`,
            ].join('\n');

        return {
            Subject: subject,
            Body: body,
            Priority: result.Success ? 'Normal' : 'High',
            Metadata: {
                ScheduleID: context.Schedule.ID,
                JobType: 'IntegrationDiscovery',
                CompanyIntegrationID: details?.CompanyIntegrationID,
                RunID: details?.RunID,
            }
        };
    }
}
