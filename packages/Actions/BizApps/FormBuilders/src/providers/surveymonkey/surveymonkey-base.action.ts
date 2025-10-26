import { RegisterClass } from '@memberjunction/global';
import { BaseFormBuilderAction, FormResponse, FormAnswer } from '../../base/base-form-builder.action';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { BaseAction } from '@memberjunction/actions';

/**
 * SurveyMonkey API response structures
 */
export interface SurveyMonkeyResponse {
    id: string;
    href: string;
    recipient_id?: string;
    collection_mode: string;
    response_status: string;
    custom_value?: string;
    first_name?: string;
    last_name?: string;
    email_address?: string;
    ip_address?: string;
    logic_path?: Record<string, any>;
    metadata?: Record<string, any>;
    page_path?: Array<{ id: string; }>;
    collector_id: string;
    survey_id: string;
    custom_variables?: Record<string, string>;
    edit_url?: string;
    analyze_url?: string;
    total_time: number;
    date_created: string;
    date_modified: string;
    pages?: Array<{
        id: string;
        questions: Array<{
            id: string;
            variable_id?: string;
            answers: Array<{
                choice_id?: string;
                row_id?: string;
                col_id?: string;
                other_id?: string;
                text?: string;
                tag_data?: Array<{
                    text: string;
                    tag?: string;
                }>;
            }>;
        }>;
    }>;
}

export interface SurveyMonkeyResponsesResult {
    data: SurveyMonkeyResponse[];
    per_page: number;
    page: number;
    total: number;
    links: {
        self: string;
        next?: string;
    };
}

export interface SurveyMonkeySurveyDetails {
    id: string;
    title: string;
    nickname?: string;
    href: string;
    language: string;
    question_count: number;
    page_count: number;
    response_count: number;
    date_created: string;
    date_modified: string;
    buttons_text?: {
        next_button?: string;
        prev_button?: string;
        done_button?: string;
        exit_button?: string;
    };
    custom_variables?: Record<string, string>;
    preview?: string;
    edit_url?: string;
    collect_url?: string;
    analyze_url?: string;
    summary_url?: string;
}

export interface SurveyMonkeyCollector {
    id: string;
    type: string;
    name: string;
    status: string;
    response_count: number;
    href: string;
}

/**
 * Base class for all SurveyMonkey actions.
 * Handles SurveyMonkey-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'SurveyMonkeyBaseAction')
export abstract class SurveyMonkeyBaseAction extends BaseFormBuilderAction {
    protected get formPlatform(): string {
        return 'SurveyMonkey';
    }

    protected get integrationName(): string {
        return 'SurveyMonkey';
    }

    protected get apiBaseUrl(): string {
        return 'https://api.surveymonkey.com/v3';
    }

    private axiosInstance: AxiosInstance | null = null;
    private currentAccessToken: string | null = null;

    /**
     * Get axios instance with SurveyMonkey authentication
     */
    protected getAxiosInstance(accessToken: string): AxiosInstance {
        if (!this.axiosInstance || this.currentAccessToken !== accessToken) {
            this.currentAccessToken = accessToken;
            this.axiosInstance = axios.create({
                baseURL: this.apiBaseUrl,
                timeout: 60000,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
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
                        LogStatus(`SurveyMonkey rate limit hit. Waiting ${waitTime}ms before retry...`);
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
     * Get responses from a SurveyMonkey survey
     */
    protected async getSurveyMonkeyResponses(
        surveyId: string,
        accessToken: string,
        options?: {
            per_page?: number;
            page?: number;
            start_created_at?: string;
            end_created_at?: string;
            start_modified_at?: string;
            end_modified_at?: string;
            sort_order?: 'ASC' | 'DESC';
            sort_by?: 'date_modified' | 'date_created';
            status?: 'completed' | 'partial' | 'overquota' | 'disqualified';
        }
    ): Promise<SurveyMonkeyResponsesResult> {
        try {
            const params: Record<string, any> = {
                per_page: options?.per_page || 100
            };

            if (options?.page !== undefined) params.page = options.page;
            if (options?.start_created_at) params.start_created_at = options.start_created_at;
            if (options?.end_created_at) params.end_created_at = options.end_created_at;
            if (options?.start_modified_at) params.start_modified_at = options.start_modified_at;
            if (options?.end_modified_at) params.end_modified_at = options.end_modified_at;
            if (options?.sort_order) params.sort_order = options.sort_order;
            if (options?.sort_by) params.sort_by = options.sort_by;
            if (options?.status) params.status = options.status;

            const response = await this.getAxiosInstance(accessToken).get(
                `/surveys/${surveyId}/responses/bulk`,
                { params }
            );

            return response.data;
        } catch (error) {
            LogError('Failed to get SurveyMonkey responses:', error);
            throw this.handleSurveyMonkeyError(error);
        }
    }

    /**
     * Get all responses with automatic pagination
     */
    protected async getAllSurveyMonkeyResponses(
        surveyId: string,
        accessToken: string,
        options?: {
            start_created_at?: string;
            end_created_at?: string;
            start_modified_at?: string;
            end_modified_at?: string;
            sort_order?: 'ASC' | 'DESC';
            sort_by?: 'date_modified' | 'date_created';
            status?: 'completed' | 'partial' | 'overquota' | 'disqualified';
            maxResponses?: number;
        }
    ): Promise<SurveyMonkeyResponse[]> {
        const allResponses: SurveyMonkeyResponse[] = [];
        let currentPage = 1;
        const maxResponses = options?.maxResponses || 10000;

        try {
            while (true) {
                const result = await this.getSurveyMonkeyResponses(surveyId, accessToken, {
                    per_page: Math.min(100, maxResponses - allResponses.length),
                    page: currentPage,
                    start_created_at: options?.start_created_at,
                    end_created_at: options?.end_created_at,
                    start_modified_at: options?.start_modified_at,
                    end_modified_at: options?.end_modified_at,
                    sort_order: options?.sort_order,
                    sort_by: options?.sort_by,
                    status: options?.status
                });

                allResponses.push(...result.data);

                if (allResponses.length >= maxResponses) {
                    LogStatus(`Reached max responses limit of ${maxResponses}`);
                    break;
                }

                if (result.data.length === 0 || !result.links.next) {
                    break;
                }

                if (result.data.length < result.per_page) {
                    break;
                }

                currentPage++;
                await this.sleep(100);
            }

            LogStatus(`Retrieved ${allResponses.length} responses from SurveyMonkey`);
            return allResponses;
        } catch (error) {
            LogError('Failed to get all SurveyMonkey responses:', error);
            throw error;
        }
    }

    /**
     * Get a single response by ID with detailed information
     */
    protected async getSingleSurveyMonkeyResponse(
        surveyId: string,
        responseId: string,
        accessToken: string
    ): Promise<SurveyMonkeyResponse> {
        try {
            const response = await this.getAxiosInstance(accessToken).get(
                `/surveys/${surveyId}/responses/${responseId}/details`
            );

            return response.data;
        } catch (error) {
            LogError('Failed to get single SurveyMonkey response:', error);
            throw this.handleSurveyMonkeyError(error);
        }
    }

    /**
     * Get survey details
     */
    protected async getSurveyMonkeyDetails(
        surveyId: string,
        accessToken: string
    ): Promise<SurveyMonkeySurveyDetails> {
        try {
            const response = await this.getAxiosInstance(accessToken).get(
                `/surveys/${surveyId}`
            );

            return response.data;
        } catch (error) {
            LogError('Failed to get SurveyMonkey survey details:', error);
            throw this.handleSurveyMonkeyError(error);
        }
    }

    /**
     * Get survey pages and questions for detailed response normalization
     */
    protected async getSurveyMonkeyPages(
        surveyId: string,
        accessToken: string
    ): Promise<any> {
        try {
            const response = await this.getAxiosInstance(accessToken).get(
                `/surveys/${surveyId}/pages`
            );

            return response.data;
        } catch (error) {
            LogError('Failed to get SurveyMonkey pages:', error);
            throw this.handleSurveyMonkeyError(error);
        }
    }

    /**
     * Get collectors for a survey
     */
    protected async getSurveyMonkeyCollectors(
        surveyId: string,
        accessToken: string
    ): Promise<SurveyMonkeyCollector[]> {
        try {
            const response = await this.getAxiosInstance(accessToken).get(
                `/surveys/${surveyId}/collectors`
            );

            return response.data.data;
        } catch (error) {
            LogError('Failed to get SurveyMonkey collectors:', error);
            throw this.handleSurveyMonkeyError(error);
        }
    }

    /**
     * Create a new collector for a survey
     */
    protected async createSurveyMonkeyCollector(
        surveyId: string,
        accessToken: string,
        collectorData: {
            type: 'weblink' | 'email';
            name: string;
            thank_you_message?: string;
            redirect_url?: string;
        }
    ): Promise<SurveyMonkeyCollector> {
        try {
            const response = await this.getAxiosInstance(accessToken).post(
                `/surveys/${surveyId}/collectors`,
                collectorData
            );

            return response.data;
        } catch (error) {
            LogError('Failed to create SurveyMonkey collector:', error);
            throw this.handleSurveyMonkeyError(error);
        }
    }

    /**
     * Update survey details
     */
    protected async updateSurveyMonkey(
        surveyId: string,
        accessToken: string,
        updateData: {
            title?: string;
            nickname?: string;
            language?: string;
            buttons_text?: {
                next_button?: string;
                prev_button?: string;
                done_button?: string;
                exit_button?: string;
            };
            custom_variables?: Record<string, string>;
        }
    ): Promise<SurveyMonkeySurveyDetails> {
        try {
            const response = await this.getAxiosInstance(accessToken).patch(
                `/surveys/${surveyId}`,
                updateData
            );

            return response.data;
        } catch (error) {
            LogError('Failed to update SurveyMonkey survey:', error);
            throw this.handleSurveyMonkeyError(error);
        }
    }

    /**
     * Normalize SurveyMonkey response to common format
     */
    protected normalizeSurveyMonkeyResponse(smResponse: SurveyMonkeyResponse): FormResponse {
        const answers: FormAnswer[] = [];

        if (smResponse.pages) {
            for (const page of smResponse.pages) {
                for (const question of page.questions) {
                    for (const answer of question.answers) {
                        let answerValue: any;
                        let fieldType = 'unknown';

                        if (answer.text !== undefined) {
                            answerValue = answer.text;
                            fieldType = 'text';
                        } else if (answer.choice_id) {
                            answerValue = answer.choice_id;
                            fieldType = 'choice';
                        } else if (answer.row_id || answer.col_id) {
                            answerValue = {
                                row: answer.row_id,
                                col: answer.col_id
                            };
                            fieldType = 'matrix';
                        } else if (answer.tag_data) {
                            answerValue = answer.tag_data.map(t => t.text);
                            fieldType = 'tag';
                        }

                        answers.push({
                            fieldId: question.id,
                            fieldType,
                            question: question.variable_id || question.id,
                            answer: answerValue,
                            choices: answer.tag_data ? answer.tag_data.map(t => t.text) : undefined
                        });
                    }
                }
            }
        }

        const completed = smResponse.response_status === 'completed';
        const submittedAt = new Date(smResponse.date_modified);

        return {
            responseId: smResponse.id,
            formId: smResponse.survey_id,
            submittedAt,
            completed,
            answers,
            metadata: {
                userAgent: smResponse.ip_address,
                platform: 'SurveyMonkey'
            },
            calculatedFields: {
                total_time: smResponse.total_time,
                collection_mode: smResponse.collection_mode,
                response_status: smResponse.response_status
            },
            hiddenFields: smResponse.custom_variables
        };
    }

    /**
     * Handle SurveyMonkey-specific errors
     */
    protected handleSurveyMonkeyError(error: any): Error {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            const status = axiosError.response?.status;
            const data = axiosError.response?.data as any;

            if (status === 401) {
                return new Error('Invalid SurveyMonkey access token. Please check your authentication.');
            } else if (status === 403) {
                return new Error('Insufficient permissions to access this SurveyMonkey resource.');
            } else if (status === 404) {
                return new Error('SurveyMonkey survey or response not found.');
            } else if (status === 429) {
                return new Error('SurveyMonkey API rate limit exceeded. Please try again later.');
            } else if (data?.error?.message) {
                return new Error(`SurveyMonkey API error: ${data.error.message}`);
            } else if (data?.message) {
                return new Error(`SurveyMonkey API error: ${data.message}`);
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
     * Format date for SurveyMonkey API (ISO 8601 format)
     */
    protected formatSurveyMonkeyDate(date: Date): string {
        return date.toISOString();
    }

    /**
     * Parse SurveyMonkey date string
     */
    protected parseSurveyMonkeyDate(dateValue: string): Date {
        return new Date(dateValue);
    }
}
