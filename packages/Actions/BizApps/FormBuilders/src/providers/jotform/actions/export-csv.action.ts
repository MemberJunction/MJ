import { RegisterClass } from '@memberjunction/global';
import { JotFormBaseAction } from '../jotform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to export JotForm submissions as CSV format
 *
 * Security: API credentials are retrieved securely from Company Integrations
 * instead of being passed as parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Export JotForm Submissions to CSV',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'FormID',
 *     Value: '123456789'
 *   }, {
 *     Name: 'IncludeMetadata',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'ExportJotFormCSVAction')
export class ExportJotFormCSVAction extends JotFormBaseAction {

    public get Description(): string {
        return 'Exports JotForm submissions to CSV format for use in spreadsheets, data analysis tools, or archival. Supports custom delimiters, optional metadata columns, and regional API endpoints.';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'Context user is required for JotForm API calls'
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

            const apiKey = await this.getSecureAPIToken(companyId, contextUser);

            const region = this.getParamValue(params.Params, 'Region') as 'us' | 'eu' | 'hipaa' | undefined;
            const filterParam = this.getParamValue(params.Params, 'Filter');
            const includeMetadata = this.getParamValue(params.Params, 'IncludeMetadata') !== false;
            const delimiter = this.getParamValue(params.Params, 'Delimiter') || ',';
            const maxSubmissions = this.getParamValue(params.Params, 'MaxSubmissions') || 10000;

            let filter: Record<string, string> | undefined = undefined;
            if (filterParam) {
                try {
                    filter = typeof filterParam === 'string' ? JSON.parse(filterParam) : filterParam;
                } catch (error) {
                    return {
                        Success: false,
                        ResultCode: 'INVALID_FILTER',
                        Message: 'Filter parameter must be valid JSON object'
                    };
                }
            }

            const jfSubmissions = await this.getAllJotFormSubmissions(formId, apiKey, {
                filter,
                maxSubmissions,
                region
            });

            if (jfSubmissions.length === 0) {
                return {
                    Success: true,
                    ResultCode: 'NO_DATA',
                    Message: 'No submissions found matching the criteria'
                };
            }

            const submissions = jfSubmissions.map(s => this.normalizeJotFormSubmission(s));

            const { csv, headers } = this.convertToCSV(submissions, includeMetadata, delimiter);

            const outputParams: ActionParam[] = [
                {
                    Name: 'CSVData',
                    Type: 'Output',
                    Value: csv
                },
                {
                    Name: 'RowCount',
                    Type: 'Output',
                    Value: submissions.length
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
                Message: `Successfully exported ${submissions.length} submissions to CSV (${headers.length} columns, ${Buffer.byteLength(csv, 'utf8')} bytes)`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Export JotForm to CSV', errorMessage, error)
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
                Name: 'FormID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Region',
                Type: 'Input',
                Value: 'us'
            },
            {
                Name: 'Filter',
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
                Name: 'MaxSubmissions',
                Type: 'Input',
                Value: 10000
            }
        ];
    }
}