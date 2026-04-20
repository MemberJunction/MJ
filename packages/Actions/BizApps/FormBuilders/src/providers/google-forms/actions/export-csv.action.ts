import { RegisterClass } from '@memberjunction/global';
import { GoogleFormsBaseAction } from '../googleforms-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to export Google Forms responses as CSV format
 *
 * Security: This action uses secure credential lookup via Company Integrations.
 * API credentials are retrieved from environment variables or the database based on CompanyID.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Export Google Forms Responses to CSV',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'company-uuid-here'
 *   }, {
 *     Name: 'FormID',
 *     Value: '1a2b3c4d5e6f7g8h9i0j'
 *   }, {
 *     Name: 'IncludeMetadata',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'ExportGoogleFormsCSVAction')
export class ExportGoogleFormsCSVAction extends GoogleFormsBaseAction {

    public get Description(): string {
        return 'Exports Google Forms responses to CSV format for use in spreadsheets, data analysis tools, or archival. Supports custom delimiters and optional metadata columns. Requires OAuth 2.0 access token with forms.responses.readonly scope.';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'Context user is required for Google Forms API calls'
                };
            }

            const companyId = this.getParamValue(params.Params, 'CompanyID');

            const formId = this.getParamValue(params.Params, 'FormID');
            if (!formId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_FORM_ID',
                    Message: 'FormID parameter is required'
                };
            }

            const accessToken = await this.getSecureAPIToken(companyId, contextUser);

            const includeMetadata = this.getParamValue(params.Params, 'IncludeMetadata') !== false;
            const delimiter = this.getParamValue(params.Params, 'Delimiter') || ',';
            const maxResponses = this.getParamValue(params.Params, 'MaxResponses') || 10000;

            const gfResponses = await this.getAllGoogleFormsResponses(formId, accessToken, {
                maxResponses
            });

            if (gfResponses.length === 0) {
                return {
                    Success: true,
                    ResultCode: 'NO_DATA',
                    Message: 'No responses found for this form'
                };
            }

            const responses = gfResponses.map(r => {
                const normalized = this.normalizeGoogleFormsResponse(r);
                // Set the formId since it's not included in the response object
                normalized.formId = formId;
                return normalized;
            });

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
                Message: this.buildFormErrorMessage('Export Google Forms to CSV', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'CompanyID',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'FormID',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'IncludeMetadata',
                Type: 'Input',
                Value: true,
            },
            {
                Name: 'Delimiter',
                Type: 'Input',
                Value: ',',
            },
            {
                Name: 'MaxResponses',
                Type: 'Input',
                Value: 10000,
            }
        ];
    }
}