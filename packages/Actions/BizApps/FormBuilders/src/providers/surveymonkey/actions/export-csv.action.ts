import { RegisterClass } from '@memberjunction/global';
import { SurveyMonkeyBaseAction } from '../surveymonkey-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to export SurveyMonkey responses as CSV format
 *
 * Security: Uses secure credential lookup via CompanyID instead of accepting tokens directly.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Export SurveyMonkey Responses to CSV',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'SurveyID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'IncludeMetadata',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'ExportSurveyMonkeyCSVAction')
export class ExportSurveyMonkeyCSVAction extends SurveyMonkeyBaseAction {

    public get Description(): string {
        return 'Exports SurveyMonkey responses to CSV format for use in spreadsheets, data analysis tools, or archival. Supports custom delimiters, date range filtering, and optional metadata columns.';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'Context user is required for SurveyMonkey API calls'
                };
            }

            const companyId = this.getParamValue(params.Params, 'CompanyID');

            const surveyId = this.getParamValue(params.Params, 'SurveyID');
            if (!surveyId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_SURVEY_ID',
                    Message: 'SurveyID parameter is required'
                };
            }

            const accessToken = await this.getSecureAPIToken(companyId, contextUser);

            const startCreatedAt = this.getParamValue(params.Params, 'StartCreatedAt');
            const endCreatedAt = this.getParamValue(params.Params, 'EndCreatedAt');
            const includeMetadata = this.getParamValue(params.Params, 'IncludeMetadata') !== false;
            const delimiter = this.getParamValue(params.Params, 'Delimiter') || ',';
            const maxResponses = this.getParamValue(params.Params, 'MaxResponses') || 10000;

            const smResponses = await this.getAllSurveyMonkeyResponses(surveyId, accessToken, {
                start_created_at: startCreatedAt,
                end_created_at: endCreatedAt,
                maxResponses
            });

            if (smResponses.length === 0) {
                return {
                    Success: true,
                    ResultCode: 'NO_DATA',
                    Message: 'No responses found matching the criteria'
                };
            }

            const responses = smResponses.map(r => this.normalizeSurveyMonkeyResponse(r));

            const { csv, headers } = this.convertToCSV(responses, includeMetadata, delimiter);

            const outputParams: ActionParam[] = [
                {
                    Name: 'CSVData',
                    Type: 'Output',
                    Value: csv
                },
                {
                    Name: 'RowCount',
                    Type: 'Output',
                    Value: responses.length
                },
                {
                    Name: 'Headers',
                    Type: 'Output',
                    Value: headers
                },
                {
                    Name: 'ColumnCount',
                    Type: 'Output',
                    Value: headers.length
                },
                {
                    Name: 'FileSize',
                    Type: 'Output',
                    Value: Buffer.byteLength(csv, 'utf8')
                }
            ];

            for (const outputParam of outputParams) {
                const existingParam = params.Params.find(p => p.Name === outputParam.Name);
                if (existingParam) {
                    existingParam.Value = outputParam.Value;
                } else {
                    params.Params.push(outputParam);
                }
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully exported ${responses.length} responses to CSV (${headers.length} columns, ${Buffer.byteLength(csv, 'utf8')} bytes)`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Export SurveyMonkey to CSV', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'CompanyID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SurveyID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'StartCreatedAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EndCreatedAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeMetadata',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'Delimiter',
                Type: 'Input',
                Value: ','
            },
            {
                Name: 'MaxResponses',
                Type: 'Input',
                Value: 10000
            }
        ];
    }
}