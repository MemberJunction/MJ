import { RegisterClass } from '@memberjunction/global';
import { BaseFormBuilderAction, FormResponse, FormAnswer } from '../../base/base-form-builder.action';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { BaseAction } from '@memberjunction/actions';

/**
 * JotForm API response structures
 */
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

    private axiosInstance: AxiosInstance | null = null;
    private currentAPIKey: string | null = null;

    /**
     * Get axios instance with JotForm authentication
     */
    protected getAxiosInstance(apiKey: string, region?: 'us' | 'eu' | 'hipaa'): AxiosInstance {
        const baseURL = this.getRegionalBaseUrl(region);

        if (!this.axiosInstance || this.currentAPIKey !== apiKey) {
            this.currentAPIKey = apiKey;
            this.axiosInstance = axios.create({
                baseURL,
                timeout: 60000,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                params: {
                    apiKey  // JotForm uses API key in query params
                }
            });

            this.axiosInstance.interceptors.response.use(
                (response) => {
                    return response;
                },
                async (error: AxiosError) => {
                    if (error.response?.status === 429) {
                        LogStatus('JotForm rate limit hit. Waiting 60 seconds...');
                        await this.sleep(60000);
                        return this.axiosInstance!.request(error.config!);
                    }
                    return Promise.reject(error);
                }
            );
        }
        return this.axiosInstance;
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

            const response = await this.getAxiosInstance(apiKey, options?.region).get(
                `/form/${formId}/submissions`,
                { params }
            );

            return response.data;
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
            const response = await this.getAxiosInstance(apiKey, region).get(
                `/submission/${submissionId}`,
                { params: { apiKey } }
            );

            return response.data.content;
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
            const response = await this.getAxiosInstance(apiKey, region).get(
                `/form/${formId}`,
                { params: { apiKey } }
            );

            return response.data.content;
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
            const response = await this.getAxiosInstance(apiKey, region).get(
                `/form/${formId}/questions`,
                { params: { apiKey } }
            );

            return response.data.content;
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

            const response = await this.getAxiosInstance(apiKey, region).post(
                `/form/${formId}/submissions`,
                null,
                { params }
            );

            return response.data;
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
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            const status = axiosError.response?.status;
            const data = axiosError.response?.data as any;

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
