import { RegisterClass } from '@memberjunction/global';
import { BaseFormBuilderAction, FormResponse, FormAnswer } from '../../base/base-form-builder.action';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { HttpClient, HttpError, IsHttpError } from '@memberjunction/network-utils';
import { BaseAction } from '@memberjunction/actions';

/**
 * JotForm API response structures
 */
/** JotForm wraps every successful payload in a `content` envelope. */
export interface JotFormEnvelope<T> {
    responseCode?: number;
    message?: string;
    content: T;
}

export interface JotFormSubmission {
    id: string;
    form_id: string;
    ip: string;
    created_at: string;
    status: string;
    new: string;
    flag: string;
    answers: Record<string, {
        name: string;
        order: string;
        text: string;
        type: string;
        answer?: string | string[];
        prettyFormat?: string;
    }>;
}

export interface JotFormSubmissionsResult {
    responseCode: number;
    message: string;
    content: JotFormSubmission[];
    limit: number;
    offset: number;
}

/**
 * Base class for all JotForm actions.
 * Handles JotForm-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'JotFormBaseAction')
export abstract class JotFormBaseAction extends BaseFormBuilderAction {
    protected get formPlatform(): string {
        return 'JotForm';
    }

    protected get integrationName(): string {
        return 'JotForm';
    }

    protected get apiBaseUrl(): string {
        return 'https://api.jotform.com';
    }

    private httpClientInstance: HttpClient | null = null;
    private currentAPIKey: string | null = null;

    /**
     * Get the HTTP client configured with JotForm authentication
     */
    protected getHttpClient(apiKey: string, region?: 'us' | 'eu' | 'hipaa'): HttpClient {
        const baseURL = this.getRegionalBaseUrl(region);

        if (!this.httpClientInstance || this.currentAPIKey !== apiKey) {
            this.currentAPIKey = apiKey;
            this.httpClientInstance = new HttpClient({
                BaseURL: baseURL,
                Timeout: 60000,
                Headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                OnRequest: (config) => ({
                    // JotForm authenticates with the API key in the query string
                    ...config,
                    Query: { ...config.Query, apiKey }
                }),
                OnRetry: async (error) => {
                    if (error.Status === 429) {
                        LogStatus('JotForm rate limit hit. Waiting 60 seconds...');
                        await this.sleep(60000);
                        return true;
                    }
                    return false;
                }
            });
        }
        return this.httpClientInstance;
    }

    /**
     * Get regional base URL
     */
    protected getRegionalBaseUrl(region?: 'us' | 'eu' | 'hipaa'): string {
        switch (region) {
            case 'eu':
                return 'https://eu-api.jotform.com';
            case 'hipaa':
                return 'https://hipaa-api.jotform.com';
            default:
                return 'https://api.jotform.com';
        }
    }

    /**
     * Get submissions from a JotForm
     */
    protected async getJotFormSubmissions(
        formId: string,
        apiKey: string,
        options?: {
            limit?: number;
            offset?: number;
            filter?: Record<string, string>;
            orderby?: string;
            region?: 'us' | 'eu' | 'hipaa';
        }
    ): Promise<JotFormSubmissionsResult> {
        try {
            const params: Record<string, any> = {
                apiKey,
                limit: options?.limit || 100,
                offset: options?.offset || 0
            };

            if (options?.filter) {
                params.filter = JSON.stringify(options.filter);
            }

            if (options?.orderby) {
                params.orderby = options.orderby;
            }

            const response = await this.getHttpClient(apiKey, options?.region).Get<JotFormSubmissionsResult>(
                `/form/${formId}/submissions`,
                { Query: params }
            );

            return response.Data;
        } catch (error) {
            LogError('Failed to get JotForm submissions:', error);
            throw this.handleJotFormError(error);
        }
    }

    /**
     * Get all submissions with automatic pagination
     */
    protected async getAllJotFormSubmissions(
        formId: string,
        apiKey: string,
        options?: {
            filter?: Record<string, string>;
            orderby?: string;
            maxSubmissions?: number;
            region?: 'us' | 'eu' | 'hipaa';
        }
    ): Promise<JotFormSubmission[]> {
        const allSubmissions: JotFormSubmission[] = [];
        let offset = 0;
        const limit = 1000;
        const maxSubmissions = options?.maxSubmissions || 10000;

        try {
            while (true) {
                const result = await this.getJotFormSubmissions(formId, apiKey, {
                    limit: Math.min(limit, maxSubmissions - allSubmissions.length),
                    offset,
                    filter: options?.filter,
                    orderby: options?.orderby,
                    region: options?.region
                });

                if (result.content && result.content.length > 0) {
                    allSubmissions.push(...result.content);

                    if (allSubmissions.length >= maxSubmissions) {
                        LogStatus(`Reached max submissions limit of ${maxSubmissions}`);
                        break;
                    }

                    if (result.content.length < limit) {
                        break;
                    }

                    offset += limit;
                    await this.sleep(100);
                } else {
                    break;
                }
            }

            LogStatus(`Retrieved ${allSubmissions.length} submissions from JotForm`);
            return allSubmissions;
        } catch (error) {
            LogError('Failed to get all JotForm submissions:', error);
            throw error;
        }
    }

    /**
     * Get a single submission by ID
     */
    protected async getSingleJotFormSubmission(
        submissionId: string,
        apiKey: string,
        region?: 'us' | 'eu' | 'hipaa'
    ): Promise<JotFormSubmission> {
        try {
            const response = await this.getHttpClient(apiKey, region).Get<JotFormEnvelope<JotFormSubmission>>(
                `/submission/${submissionId}`,
                { Query: { apiKey } }
            );

            return response.Data.content;
        } catch (error) {
            LogError('Failed to get single JotForm submission:', error);
            throw this.handleJotFormError(error);
        }
    }

    /**
     * Get form details
     */
    protected async getJotFormDetails(
        formId: string,
        apiKey: string,
        region?: 'us' | 'eu' | 'hipaa'
    ): Promise<any> {
        try {
            const response = await this.getHttpClient(apiKey, region).Get<JotFormEnvelope<any>>(
                `/form/${formId}`,
                { Query: { apiKey } }
            );

            return response.Data.content;
        } catch (error) {
            LogError('Failed to get JotForm details:', error);
            throw this.handleJotFormError(error);
        }
    }

    /**
     * Get form questions/fields
     */
    protected async getJotFormQuestions(
        formId: string,
        apiKey: string,
        region?: 'us' | 'eu' | 'hipaa'
    ): Promise<any> {
        try {
            const response = await this.getHttpClient(apiKey, region).Get<JotFormEnvelope<any>>(
                `/form/${formId}/questions`,
                { Query: { apiKey } }
            );

            return response.Data.content;
        } catch (error) {
            LogError('Failed to get JotForm questions:', error);
            throw this.handleJotFormError(error);
        }
    }

    /**
     * Create a new submission
     */
    protected async createJotFormSubmission(
        formId: string,
        apiKey: string,
        submissionData: Record<string, any>,
        region?: 'us' | 'eu' | 'hipaa'
    ): Promise<any> {
        try {
            const params: Record<string, any> = { apiKey };

            // Add submission data to params
            Object.entries(submissionData).forEach(([fieldId, value]) => {
                params[`submission[${fieldId}]`] = value;
            });

            const response = await this.getHttpClient(apiKey, region).Post<any>(
                `/form/${formId}/submissions`,
                null,
                { Query: params }
            );

            return response.Data;
        } catch (error) {
            LogError('Failed to create JotForm submission:', error);
            throw this.handleJotFormError(error);
        }
    }

    /**
     * Normalize JotForm submission to common format
     */
    protected normalizeJotFormSubmission(jfSubmission: JotFormSubmission): FormResponse {
        const answers: FormAnswer[] = Object.entries(jfSubmission.answers || {}).map(([fieldId, answerData]) => {
            let answerValue: any = answerData.answer;

            // Handle array answers
            if (Array.isArray(answerValue)) {
                answerValue = answerValue.filter(v => v !== '');
            }

            return {
                fieldId,
                fieldType: answerData.type,
                question: answerData.text || answerData.name,
                answer: answerValue || answerData.prettyFormat,
                choices: Array.isArray(answerValue) ? answerValue : undefined
            };
        });

        const submittedAt = new Date(jfSubmission.created_at);
        const completed = jfSubmission.status === 'ACTIVE';

        return {
            responseId: jfSubmission.id,
            formId: jfSubmission.form_id,
            submittedAt,
            completed,
            answerDetails: answers, // For now, use answers as answerDetails since JotForm doesn't have simpleAnswers
            answers: {}, // Empty object for now - could be implemented later
            metadata: {
                userAgent: jfSubmission.ip,
                platform: 'JotForm'
            }
        };
    }

    /**
     * Handle JotForm-specific errors
     */
    protected handleJotFormError(error: any): Error {
        if (IsHttpError(error)) {
            const httpError = error as HttpError;
            const status = httpError.Status;
            const data = httpError.Data as any;

            if (status === 401) {
                return new Error('Invalid JotForm API key. Please check your authentication.');
            } else if (status === 403) {
                return new Error('Insufficient permissions to access this JotForm resource.');
            } else if (status === 404) {
                return new Error('JotForm form or submission not found.');
            } else if (status === 429) {
                return new Error('JotForm API rate limit exceeded. Please try again later.');
            } else if (data?.message) {
                return new Error(`JotForm API error: ${data.message}`);
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
}
