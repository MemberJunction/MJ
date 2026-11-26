/**
 * @fileoverview Server subclass for `MJ: Tour Steps` that validates `Configuration`
 * against `MJ: Tour Step Types.ConfigSchema` and triggers canonical snapshot updates
 * when a step of an `Active` tour changes outside a batch sync.
 * @module @memberjunction/tours-server
 */

import {
    BaseEntity,
    LogError,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    type EntitySaveOptions,
    type UserInfo,
    type ValidationResult,
} from '@memberjunction/core';
import {
    MJTourEntity,
    MJTourStepEntity,
    MJTourStepTypeEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { IsTourMetadataProvider, TourPublisherService } from '../services/tour-publisher.service.js';
import {
    ValidateJsonAgainstSchema,
    type TourConfigJsonSchema,
} from '../validation/config-schema-validator.js';

@RegisterClass(BaseEntity, 'MJ: Tour Steps')
export class MJTourStepEntityServer extends MJTourStepEntity {
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        await this.validateConfigurationAgainstStepTypeSchema(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const saved = await super.Save(options);
        if (!saved) {
            return false;
        }

        if (
            !TourPublisherService.Instance.IsAutoSnapshotSuppressed &&
            !options?.ReplayOnly &&
            this.TourID
        ) {
            await this.snapshotParentTourIfActive();
        }

        return true;
    }

    private async validateConfigurationAgainstStepTypeSchema(result: ValidationResult): Promise<void> {
        const rawConfig = this.Configuration;
        let parsedConfig: unknown = {};
        if (rawConfig != null && rawConfig.trim().length > 0) {
            try {
                parsedConfig = JSON.parse(rawConfig) as unknown;
            } catch (e) {
                result.Errors.push(
                    new ValidationErrorInfo(
                        'Configuration',
                        `Tour step Configuration must be valid JSON: ${e instanceof Error ? e.message : String(e)}`,
                        rawConfig,
                        ValidationErrorType.Failure,
                    ),
                );
                return;
            }
        }

        const provider = IsTourMetadataProvider(this.ProviderToUse) ? this.ProviderToUse : undefined;
        if (!provider || !this.StepTypeID) {
            return;
        }

        const contextUser = this.ContextCurrentUser as UserInfo | undefined;
        const rv = RunView.FromMetadataProvider(provider);
        const stepTypeRes = await rv.RunView<MJTourStepTypeEntity>(
            {
                EntityName: 'MJ: Tour Step Types',
                ExtraFilter: `ID='${EscapeSQLString(this.StepTypeID)}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            contextUser,
        );

        if (!stepTypeRes.Success || stepTypeRes.Results.length === 0) {
            return;
        }

        const stepType = stepTypeRes.Results[0];
        if (!stepType.ConfigSchema || !stepType.ConfigSchema.trim()) {
            return;
        }

        let schema: TourConfigJsonSchema;
        try {
            const parsedSchema = JSON.parse(stepType.ConfigSchema) as unknown;
            if (!parsedSchema || typeof parsedSchema !== 'object' || Array.isArray(parsedSchema)) {
                return;
            }
            schema = parsedSchema as TourConfigJsonSchema;
        } catch {
            return;
        }

        const schemaErrors = ValidateJsonAgainstSchema(parsedConfig, schema, '$');
        for (const err of schemaErrors) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'Configuration',
                    `Step '${this.StepKey}' Configuration violates '${stepType.Name}' ConfigSchema (${err}).`,
                    rawConfig,
                    ValidationErrorType.Failure,
                ),
            );
        }
    }

    private async snapshotParentTourIfActive(): Promise<void> {
        const provider = IsTourMetadataProvider(this.ProviderToUse) ? this.ProviderToUse : undefined;
        const contextUser = this.ContextCurrentUser as UserInfo | undefined;
        if (!provider || !contextUser || !this.TourID) {
            return;
        }

        if (TourPublisherService.Instance.IsSnapshottingTour(this.TourID)) {
            return;
        }

        try {
            const tour = await provider.GetEntityObject<MJTourEntity>('MJ: Tours', contextUser);
            if (!(await tour.Load(this.TourID)) || tour.Status !== 'Active') {
                return;
            }

            const snapResult = await TourPublisherService.Instance.SnapshotIfChanged(
                tour,
                contextUser,
                provider,
                { ChangeSummary: `Auto-snapshot after updating step '${this.StepKey}'` },
            );
            if (!snapResult.Success) {
                LogError(
                    `[MJTourStepEntityServer] Failed auto-snapshotting active tour '${tour.TourKey}': ${snapResult.ErrorMessage ?? 'unknown error'}`,
                );
            }
        } catch (e) {
            LogError(
                `[MJTourStepEntityServer] Error checking active parent tour snapshot for step '${this.StepKey}': ${e instanceof Error ? e.message : String(e)}`,
            );
        }
    }
}
