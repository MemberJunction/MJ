import { RegisterClass } from '@memberjunction/global';
import { BaseFormBuilderAction, FormResponse, FormAnswer } from '../../base/base-form-builder.action';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { BaseAction, OAuth2Manager } from '@memberjunction/actions';
import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * Typeform API response structures
 */
export interface TypeformResponseItem {
    landing_id: string;
    token: string;
    landed_at: string;
    submitted_at: string;
    metadata: {
        user_agent?: string;
        platform?: string;
        referer?: string;
        network_id?: string;
        browser?: string;
    };
    hidden?: Record<string, any>;
    calculated?: {
        score?: number;
    };
    answers: Array<{
        field: {
            id: string;
            type: string;
            ref?: string;
        };
        type: string;
        text?: string;
        email?: string;
        url?: string;
        file_url?: string;
        number?: number;
        boolean?: boolean;
        choice?: {
            label: string;
            other?: string;
        };
        choices?: {
            labels: string[];
            other?: string;
        };
        date?: string;
        phone_number?: string;
        payment?: {
            amount: string;
            last4: string;
            name: string;
        };
    }>;
}

export interface TypeformResponsesResult {
    total_items: number;
    page_count: number;
    items: TypeformResponseItem[];
}

/**
 * Base class for all Typeform actions.
 * Handles Typeform-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'TypeformBaseAction')
export abstract class TypeformBaseAction extends BaseFormBuilderAction {
    protected get formPlatform(): string {
        return 'Typeform';
    }

    protected get integrationName(): string {
        return 'Typeform';
    }

    protected get apiBaseUrl(): string {
        return 'https://api.typeform.com';
    }

    private axiosInstance: AxiosInstance | null = null;
    private currentAPIToken: string | null = null;
    private oauth2Manager: OAuth2Manager | null = null;

    /**
     * Creates an OAuth2Manager for Typeform authentication.
     * Configures the OAuth2 endpoints and credentials for Typeform.
     *
     * @override
     */
    protected async createOAuth2Manager(companyId: string, contextUser: UserInfo): Promise<OAuth2Manager | null> {
        const clientId = process.env['BIZAPPS_TYPEFORM_CLIENT_ID'];
        const clientSecret = process.env['BIZAPPS_TYPEFORM_CLIENT_SECRET'];

        if (!clientId || !clientSecret) {
            return null; // OAuth2 not configured
        }

        // Check if we have stored tokens for this company
        const integration = await this.getCompanyIntegration(companyId, contextUser);
        const credentials = await this.getAPICredentials(integration);

        const oauth = new OAuth2Manager({
            clientId,
            clientSecret,
            tokenEndpoint: 'https://api.typeform.com/oauth/token',
            authorizationEndpoint: 'https://api.typeform.com/oauth/authorize',
            scopes: ['forms:read', 'forms:write', 'responses:read', 'accounts:read'],
            accessToken: credentials.accessToken,
            refreshToken: credentials.apiKey, // Store refresh token in apiKey field
            onTokenUpdate: async (tokens) => {
                // TODO: Persist updated tokens back to Company Integrations table
                LogStatus(`Typeform OAuth2 tokens updated for company ${companyId}`);
            }
        });

        return oauth;
    }

    /**
     * Get axios instance with Typeform authentication
     */
    protected getAxiosInstance(apiToken: string): AxiosInstance {
        if (!this.axiosInstance || this.currentAPIToken !== apiToken) {
            this.currentAPIToken = apiToken;
            this.axiosInstance = axios.create({
                baseURL: this.apiBaseUrl,
                timeout: 60000,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiToken}`
                }
            });

            this.axiosInstance.interceptors.response.use(
                (response) => {
                    return response;
                },
                async (error: AxiosError) => {
                    if (error.response?.status === 429) {
                        const retryAfter = error.response.headers['retry-after'];
                        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
                        LogStatus(`Typeform rate limit hit. Waiting ${waitTime}ms before retry...`);
                        await this.sleep(waitTime);
                        return this.axiosInstance!.request(error.config!);
                    }
                    return Promise.reject(error);
                }
            );
        }
        return this.axiosInstance;
    }

    /**
     * Get responses from a Typeform
     */
    protected async getTypeformResponses(
        formId: string,
        apiToken: string,
        options?: {
            pageSize?: number;
            since?: string;
            until?: string;
            after?: string;
            before?: string;
            completed?: boolean;
            sort?: string;
            query?: string;
            fields?: string[];
        }
    ): Promise<TypeformResponsesResult> {
        try {
            const params: Record<string, any> = {
                page_size: options?.pageSize || 25
            };

            if (options?.since) params.since = options.since;
            if (options?.until) params.until = options.until;
            if (options?.after) params.after = options.after;
            if (options?.before) params.before = options.before;
            if (options?.completed !== undefined) {
                params.completed = options.completed ? 'true' : 'false';
            }
            if (options?.sort) params.sort = options.sort;
            if (options?.query) params.query = options.query;
            if (options?.fields && options.fields.length > 0) {
                params.fields = options.fields.join(',');
            }

            const response = await this.getAxiosInstance(apiToken).get(
                `/forms/${formId}/responses`,
                { params }
            );

            return response.data;
        } catch (error) {
            LogError('Failed to get Typeform responses:', error);
            throw this.handleTypeformError(error);
        }
    }

    /**
     * Get all responses with automatic pagination
     */
    protected async getAllTypeformResponses(
        formId: string,
        apiToken: string,
        options?: {
            since?: string;
            until?: string;
            completed?: boolean;
            sort?: string;
            query?: string;
            maxResponses?: number;
        }
    ): Promise<TypeformResponseItem[]> {
        const allResponses: TypeformResponseItem[] = [];
        let after: string | undefined = undefined;
        const maxResponses = options?.maxResponses || 10000;

        try {
            while (true) {
                const result = await this.getTypeformResponses(formId, apiToken, {
                    pageSize: Math.min(1000, maxResponses - allResponses.length),
                    since: options?.since,
                    until: options?.until,
                    completed: options?.completed,
                    sort: options?.sort,
                    query: options?.query,
                    after
                });

                allResponses.push(...result.items);

                if (allResponses.length >= maxResponses) {
                    LogStatus(`Reached max responses limit of ${maxResponses}`);
                    break;
                }

                if (result.items.length === 0) {
                    break;
                }

                const lastItem = result.items[result.items.length - 1];
                after = lastItem.token;

                if (result.items.length < 1000) {
                    break;
                }

                await this.sleep(100);
            }

            LogStatus(`Retrieved ${allResponses.length} responses from Typeform`);
            return allResponses;
        } catch (error) {
            LogError('Failed to get all Typeform responses:', error);
            throw error;
        }
    }

    /**
     * Get a single response by token
     */
    protected async getSingleTypeformResponse(
        formId: string,
        responseToken: string,
        apiToken: string
    ): Promise<TypeformResponseItem> {
        try {
            const result = await this.getTypeformResponses(formId, apiToken, {
                pageSize: 1,
                after: responseToken
            });

            if (!result.items || result.items.length === 0) {
                throw new Error(`Response with token ${responseToken} not found`);
            }

            return result.items[0];
        } catch (error) {
            LogError('Failed to get single Typeform response:', error);
            throw this.handleTypeformError(error);
        }
    }

    /**
     * Get form details from Typeform API
     */
    protected async getFormDetails(formId: string, apiToken: string): Promise<any> {
        try {
            const response = await this.getAxiosInstance(apiToken).get(`/forms/${formId}`);
            return response.data;
        } catch (error) {
            LogError('Failed to get Typeform form details:', error);
            throw this.handleTypeformError(error);
        }
    }

    /**
     * Normalize Typeform response to common format
     */
    protected normalizeTypeformResponse(tfResponse: TypeformResponseItem, formFields?: any[]): FormResponse {
        // Create field title lookup map from form fields
        const fieldTitleMap = new Map<string, string>();
        if (formFields) {
            formFields.forEach((field: any) => {
                // Use the field ref as key (matches what's in response.question) and title as value
                if (field.ref && field.title) {
                    fieldTitleMap.set(field.ref, field.title);
                }
            });
        }

        const answerDetails: FormAnswer[] = tfResponse.answers.map(answer => {
            let answerValue: any;
            let question = answer.field.ref || answer.field.id;

            switch (answer.type) {
                case 'text':
                    answerValue = answer.text;
                    break;
                case 'email':
                    answerValue = answer.email;
                    break;
                case 'url':
                    answerValue = answer.url;
                    break;
                case 'file_url':
                    answerValue = answer.file_url;
                    break;
                case 'number':
                    answerValue = answer.number;
                    break;
                case 'boolean':
                    answerValue = answer.boolean;
                    break;
                case 'choice':
                    answerValue = answer.choice?.label;
                    if (answer.choice?.other) {
                        answerValue += ` (Other: ${answer.choice.other})`;
                    }
                    break;
                case 'choices':
                    answerValue = answer.choices?.labels || [];
                    if (answer.choices?.other) {
                        answerValue.push(`Other: ${answer.choices.other}`);
                    }
                    break;
                case 'date':
                    answerValue = answer.date;
                    break;
                case 'phone_number':
                    answerValue = answer.phone_number;
                    break;
                case 'payment':
                    answerValue = answer.payment ? {
                        amount: answer.payment.amount,
                        last4: answer.payment.last4,
                        name: answer.payment.name
                    } : null;
                    break;
                default:
                    answerValue = null;
            }

            return {
                fieldId: answer.field.id,
                fieldType: answer.type,
                question,
                answer: answerValue,
                choices: answer.type === 'choices' ? answer.choices?.labels : undefined
            };
        });

        // Generate answers object with question titles as keys (renamed from simpleAnswers)
        const answers: Record<string, any> = {};
        answerDetails.forEach(answer => {
            const questionTitle = fieldTitleMap.get(answer.question) || answer.question;
            // Clean up the question title to be a valid object key
            const cleanKey = questionTitle.replace(/[^a-zA-Z0-9\s]/g, '').trim();
            answers[cleanKey] = answer.answer;
        });

        const completed = !!tfResponse.submitted_at;
        const submittedAt = tfResponse.submitted_at
            ? new Date(tfResponse.submitted_at)
            : new Date(tfResponse.landed_at);

        return {
            responseId: tfResponse.token,
            formId: tfResponse.landing_id,
            submittedAt,
            completed,
            answerDetails, // Renamed from answers
            answers, // Renamed from simpleAnswers
            metadata: {
                browser: tfResponse.metadata?.browser,
                platform: tfResponse.metadata?.platform,
                referer: tfResponse.metadata?.referer,
                userAgent: tfResponse.metadata?.user_agent
            },
            calculatedFields: tfResponse.calculated,
            hiddenFields: tfResponse.hidden
        };
    }

    /**
     * Handle Typeform-specific errors
     */
    protected handleTypeformError(error: any): Error {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            const status = axiosError.response?.status;
            const data = axiosError.response?.data as any;

            if (status === 401) {
                return new Error('Invalid Typeform API token. Please check your authentication.');
            } else if (status === 403) {
                return new Error('Insufficient permissions to access this Typeform resource.');
            } else if (status === 404) {
                return new Error('Typeform form or response not found.');
            } else if (status === 429) {
                return new Error('Typeform API rate limit exceeded. Please try again later.');
            } else if (data?.message) {
                return new Error(`Typeform API error: ${data.message}`);
            }
        }

        return error instanceof Error ? error : new Error(String(error));
    }

    /**
     * Sleep helper for rate limiting
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Format date for Typeform API (ISO 8601)
     */
    protected formatTypeformDate(date: Date): string {
        return date.toISOString();
    }

    /**
     * Parse Typeform date string or Unix timestamp
     */
    protected parseTypeformDate(dateValue: string | number): Date {
        if (typeof dateValue === 'number') {
            return new Date(dateValue * 1000);
        }
        return new Date(dateValue);
    }
}
