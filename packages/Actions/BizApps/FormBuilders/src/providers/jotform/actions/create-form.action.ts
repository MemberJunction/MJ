import { RegisterClass } from '@memberjunction/global';
import { JotFormBaseAction } from '../jotform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a new JotForm programmatically
 *
 * Security: API credentials are retrieved securely from Company Integrations
 * instead of being passed as parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Create JotForm',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'Title',
 *     Value: 'Customer Feedback Form'
 *   }, {
 *     Name: 'Questions',
 *     Value: [{
 *       type: 'control_text',
 *       text: 'What is your name?',
 *       name: 'name',
 *       required: 'Yes'
 *     }, {
 *       type: 'control_email',
 *       text: 'What is your email address?',
 *       name: 'email',
 *       required: 'Yes'
 *     }]
 *   }, {
 *     Name: 'Properties',
 *     Value: {
 *       thankYouURL: 'https://example.com/thank-you',
 *       requiresPassword: false
 *     }
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'CreateJotFormAction')
export class CreateJotFormAction extends JotFormBaseAction {

    public get Description(): string {
        return 'Creates a new JotForm with specified title, questions, and properties. Supports all question types including text inputs, email, dropdowns, checkboxes, file uploads, and more. Returns the new form ID, public URL, and admin URL.';
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

            const apiToken = await this.getSecureAPIToken(companyId, contextUser);

            const title = this.getParamValue(params.Params, 'Title');
            if (!title) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_TITLE',
                    Message: 'Title parameter is required'
                };
            }

            const questions = this.getParamValue(params.Params, 'Questions');
            if (!questions || !Array.isArray(questions) || questions.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_QUESTIONS',
                    Message: 'Questions parameter is required and must be a non-empty array'
                };
            }

            const region = this.getParamValue(params.Params, 'Region') as 'us' | 'eu' | 'hipaa' | undefined;

            const formData: Record<string, any> = {
                'questions': this.buildQuestionsObject(questions),
                'properties': {
                    'title': title
                }
            };

            const properties = this.getParamValue(params.Params, 'Properties');
            if (properties && typeof properties === 'object') {
                formData.properties = {
                    ...formData.properties,
                    ...properties
                };
            }

            const response = await this.getAxiosInstance(apiToken, region).post('/user/forms', null, {
                params: {
                    apiKey: apiToken,
                    ...this.flattenFormData(formData)
                }
            });

            const createdForm = response.data.content;

            const formUrl = `https://form.jotform.com/${createdForm.id}`;
            const adminUrl = `https://www.jotform.com/build/${createdForm.id}`;

            const outputParams: ActionParam[] = [
                {
                    Name: 'FormDetails',
                    Type: 'Output',
                    Value: createdForm
                },
                {
                    Name: 'FormID',
                    Type: 'Output',
                    Value: createdForm.id
                },
                {
                    Name: 'FormURL',
                    Type: 'Output',
                    Value: formUrl
                },
                {
                    Name: 'AdminURL',
                    Type: 'Output',
                    Value: adminUrl
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
                Message: `Successfully created JotForm "${title}" (ID: ${createdForm.id}). View at: ${formUrl}`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Create JotForm', errorMessage, error)
            };
        }
    }

    /**
     * Build questions object in JotForm API format
     * JotForm uses numeric keys for questions (1, 2, 3, etc.)
     */
    private buildQuestionsObject(questions: any[]): Record<string, any> {
        const questionsObj: Record<string, any> = {};

        questions.forEach((question, index) => {
            const questionId = index + 1;
            questionsObj[questionId] = {
                type: question.type,
                text: question.text,
                name: question.name || `question_${questionId}`,
                order: String(questionId),
                ...this.extractQuestionProperties(question)
            };
        });

        return questionsObj;
    }

    /**
     * Extract additional question properties (required, validation, options, etc.)
     */
    private extractQuestionProperties(question: any): Record<string, any> {
        const props: Record<string, any> = {};

        if (question.required != null) {
            props.required = question.required === 'Yes' || question.required === true ? 'Yes' : 'No';
        }

        if (question.validation) {
            props.validation = question.validation;
        }

        if (question.sublabel) {
            props.sublabel = question.sublabel;
        }

        if (question.hint) {
            props.hint = question.hint;
        }

        if (question.options && Array.isArray(question.options)) {
            props.options = question.options.join('|');
        }

        if (question.special) {
            props.special = question.special;
        }

        if (question.size) {
            props.size = question.size;
        }

        if (question.maxsize) {
            props.maxsize = question.maxsize;
        }

        if (question.allowTime) {
            props.allowTime = question.allowTime;
        }

        if (question.payment) {
            props.payment = question.payment;
        }

        return props;
    }

    /**
     * Flatten nested form data into JotForm API parameter format
     * JotForm API expects: properties[title]=value, questions[1][type]=value, etc.
     */
    private flattenFormData(data: Record<string, any>, prefix: string = ''): Record<string, any> {
        const flattened: Record<string, any> = {};

        for (const [key, value] of Object.entries(data)) {
            const paramKey = prefix ? `${prefix}[${key}]` : key;

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(flattened, this.flattenFormData(value, paramKey));
            } else if (value != null) {
                flattened[paramKey] = value;
            }
        }

        return flattened;
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'CompanyID',
                Type: 'Input',
                Value: null
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
                Value: null
            }
        ];
    }
}