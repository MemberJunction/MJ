/**
 * @fileoverview Driver for executing scheduled Action jobs
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { ValidationResult, UserInfo, Metadata, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import { ActionEngineServer } from '@memberjunction/actions';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import {
    ScheduledJobResult,
    NotificationContent,
    ActionJobConfiguration
} from '@memberjunction/scheduling-base-types';
import { ActionParam } from '@memberjunction/actions-base';

/**
 * Driver for executing scheduled Action jobs
 *
 * Configuration schema (stored in ScheduledJob.Configuration):
 * {
 *   ActionID: string,
 *   Params?: Array<{
 *     ActionParamID: string,
 *     ValueType: 'Static' | 'SQL Statement',
 *     Value: string
 *   }>
 * }
 *
 * Execution result details (stored in ScheduledJobRun.Details):
 * {
 *   ResultCode: string,
 *   IsSuccess: boolean,
 *   OutputParams?: any
 * }
 */
@RegisterClass(BaseScheduledJob, 'ActionScheduledJobDriver')
export class ActionScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.parseConfiguration<ActionJobConfiguration>(context.Schedule);

        // Load the action
        await ActionEngineServer.Instance.Config(false, context.ContextUser);
        const action = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, config.ActionID));

        if (!action) {
            throw new Error(`Action with ID ${config.ActionID} not found`);
        }

        this.log(`Executing action: ${action.Name}`);

        // Process parameters (static values or SQL queries)
        const params = await this.processParams(config.Params || [], context.ContextUser);

        // Execute the action
        const actionResult = await ActionEngineServer.Instance.RunAction({
            Action: action,
            ContextUser: context.ContextUser,
            Filters: [],
            Params: params
        });

        return {
            Success: actionResult.Success,
            ErrorMessage: actionResult.Message || undefined,
            Details: {
                ResultCode: actionResult.Result?.ResultCode,
                IsSuccess: actionResult.Success,
                OutputParams: actionResult.Params
            }
        };
    }

    public ValidateConfiguration(schedule: any): ValidationResult {
        const result = new ValidationResult();

        try {
            const config = this.parseConfiguration<ActionJobConfiguration>(schedule);

            if (!config.ActionID) {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.ActionID',
                    'ActionID is required',
                    config.ActionID,
                    ValidationErrorType.Failure
                ));
            }

            // Validate params structure
            if (config.Params) {
                if (!Array.isArray(config.Params)) {
                    result.Errors.push(new ValidationErrorInfo(
                        'Configuration.Params',
                        'Params must be an array',
                        config.Params,
                        ValidationErrorType.Failure
                    ));
                } else {
                    for (let i = 0; i < config.Params.length; i++) {
                        const param = config.Params[i];
                        if (!param.ActionParamID) {
                            result.Errors.push(new ValidationErrorInfo(
                                `Configuration.Params[${i}].ActionParamID`,
                                'ActionParamID is required',
                                param.ActionParamID,
                                ValidationErrorType.Failure
                            ));
                        }
                        if (!param.ValueType || !['Static', 'SQL Statement'].includes(param.ValueType)) {
                            result.Errors.push(new ValidationErrorInfo(
                                `Configuration.Params[${i}].ValueType`,
                                'ValueType must be "Static" or "SQL Statement"',
                                param.ValueType,
                                ValidationErrorType.Failure
                            ));
                        }
                    }
                }
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
        const details = result.Details as any;

        const subject = result.Success
            ? `Scheduled Action Completed: ${context.Schedule.Name}`
            : `Scheduled Action Failed: ${context.Schedule.Name}`;

        const body = result.Success
            ? `The scheduled action "${context.Schedule.Name}" completed successfully.\n\n` +
              `Result Code: ${details?.ResultCode || 'N/A'}`
            : `The scheduled action "${context.Schedule.Name}" failed.\n\n` +
              `Error: ${result.ErrorMessage}`;

        return {
            Subject: subject,
            Body: body,
            Priority: result.Success ? 'Normal' : 'High',
            Metadata: {
                ScheduleID: context.Schedule.ID,
                JobType: 'Action',
                ResultCode: details?.ResultCode
            }
        };
    }

    private async processParams(
        params: ActionJobConfiguration['Params'],
        contextUser: UserInfo
    ): Promise<ActionParam[]> {
        if (!params) {
            return [];
        }

        const allActionParams = ActionEngineServer.Instance.ActionParams;
        const result: ActionParam[] = [];

        for (const param of params) {
            const actionParam = allActionParams.find(p => UUIDsEqual(p.ID, param.ActionParamID));
            if (!actionParam) {
                this.logError(`Action param ${param.ActionParamID} not found`);
                continue;
            }

            let value: any = null;

            switch (param.ValueType) {
                case 'Static':
                    // Value could be scalar or JSON
                    const jsonValue = SafeJSONParse(param.Value);
                    value = jsonValue !== null ? jsonValue : param.Value;
                    break;

                case 'SQL Statement':
                    value = await this.executeSQL(param.Value);
                    break;
            }

            result.push({
                Name: actionParam.Name,
                Value: value,
                Type: actionParam.Type
            });
        }

        return result;
    }

    private async executeSQL(sql: string): Promise<any> {
        try {
            const sqlProvider = Metadata.Provider as SQLServerDataProvider;
            const result = await sqlProvider.ExecuteSQL(sql);
            return result;
        } catch (error) {
            this.logError(`Error executing SQL: ${sql}`, error);
            return null;
        }
    }
}