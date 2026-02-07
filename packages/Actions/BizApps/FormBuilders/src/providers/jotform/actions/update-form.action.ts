import { RegisterClass } from '@memberjunction/global';
import { JotFormBaseAction } from '../jotform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to update an existing JotForm
 *
 * IMPORTANT: JotForm uses separate endpoints for properties and questions.
 * Use the MergeWithExisting parameter to safely update only specified properties
 * while preserving existing ones.
 *
 * Security: API credentials are retrieved securely from Company Integrations
 * instead of being passed as parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Update JotForm',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'FormID',
 *     Value: '123456789'
 *   }, {
 *     Name: 'Title',
 *     Value: 'Updated Survey Title'
 *   }, {
 *     Name: 'MergeWithExisting',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'UpdateJotFormAction')
export class UpdateJotFormAction extends JotFormBaseAction {

    public get Description(): string {
        return 'Updates an existing JotForm. Set MergeWithExisting=true (default) to safely update only specified properties while preserving others. Set to false to replace entire form data (not recommended).';
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

            const apiToken = await this.getSecureAPIToken(companyId, contextUser);

            const mergeWithExisting = this.getParamValue(params.Params, 'MergeWithExisting') !== false;
            const region = this.getParamValue(params.Params, 'Region') as 'us' | 'eu' | 'hipaa' | undefined;

            const title = this.getParamValue(params.Params, 'Title');
            const questions = this.getParamValue(params.Params, 'Questions');
            const properties = this.getParamValue(params.Params, 'Properties');

            // Check if any updates are provided
            if (!title && !questions && !properties) {
                return {
                    Success: false,
                    ResultCode: 'NO_CHANGES_PROVIDED',
                    Message: 'At least one of Title, Questions, or Properties must be provided'
                };
            }

            const updatedFields: string[] = [];
            let existingForm: any = null;

            // Get existing form if merging
            if (mergeWithExisting) {
                existingForm = await this.getJotFormDetails(formId, apiToken, region);
            }

            const axiosInstance = this.getAxiosInstance(apiToken, region);

            // Update properties (including title)
            if (title || properties) {
                let propertiesToUpdate: Record<string, any> = {};

                // Start with existing properties if merging
                if (mergeWithExisting && existingForm?.properties) {
                    propertiesToUpdate = { ...existingForm.properties };
                }

                // Add title if provided
                if (title) {
                    propertiesToUpdate.title = title;
                    updatedFields.push('title');
                }

                // Merge additional properties if provided
                if (properties) {
                    const propsToMerge = typeof properties === 'string' ? JSON.parse(properties) : properties;
                    propertiesToUpdate = { ...propertiesToUpdate, ...propsToMerge };
                    updatedFields.push('properties');
                }

                // Update properties via PUT endpoint
                await axiosInstance.put(
                    `/form/${formId}/properties`,
                    { properties: propertiesToUpdate }
                );
            }

            // Update questions if provided
            if (questions) {
                let questionsToUpdate = Array.isArray(questions) ? questions :
                                       typeof questions === 'string' ? JSON.parse(questions) : questions;

                // If merging, get existing questions and merge
                if (mergeWithExisting) {
                    const existingQuestions = await this.getJotFormQuestions(formId, apiToken, region);

                    // Merge questions by ID or order
                    const mergedQuestions: Record<string, any> = { ...existingQuestions };

                    if (Array.isArray(questionsToUpdate)) {
                        // If questions array is provided, update by index/ID
                        questionsToUpdate.forEach((question: any, index: number) => {
                            const questionId = question.qid || Object.keys(existingQuestions)[index];
                            if (questionId) {
                                mergedQuestions[questionId] = { ...mergedQuestions[questionId], ...question };
                            }
                        });
                    } else {
                        // If questions object is provided, merge directly
                        Object.assign(mergedQuestions, questionsToUpdate);
                    }

                    questionsToUpdate = mergedQuestions;
                }

                // Update questions via POST endpoint
                await axiosInstance.post(
                    `/form/${formId}/questions`,
                    { questions: questionsToUpdate }
                );

                updatedFields.push('questions');
            }

            // Get updated form details
            const updatedForm = await this.getJotFormDetails(formId, apiToken, region);

            // Construct form URL
            const formUrl = updatedForm.url || `https://form.jotform.com/${formId}`;

            // Build output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'FormID',
                    Type: 'Output',
                    Value: formId
                },
                {
                    Name: 'FormURL',
                    Type: 'Output',
                    Value: formUrl
                },
                {
                    Name: 'UpdatedFields',
                    Type: 'Output',
                    Value: updatedFields
                },
                {
                    Name: 'FormDetails',
                    Type: 'Output',
                    Value: updatedForm
                }
            ];

            // Add output params to result
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
                Message: `Successfully updated JotForm "${updatedForm.title || formId}". Updated fields: ${updatedFields.join(', ')}`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Update JotForm', errorMessage, error)
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
                Name: 'MergeWithExisting',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'Title',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Questions',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Properties',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Region',
                Type: 'Input',
                Value: 'us'
            }
        ];
    }
}