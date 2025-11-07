import { RegisterClass } from '@memberjunction/global';
import { BaseFormBuilderAction, FormResponse, FormAnswer } from '../../base/base-form-builder.action';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { BaseAction } from '@memberjunction/actions';

/**
 * Google Forms API response structures
 */
export interface GoogleFormsAnswer {
    questionId: string;
    textAnswers?: {
        answers: Array<{
            value: string;
        }>;
    };
    fileUploadAnswers?: {
        answers: Array<{
            fileId: string;
            fileName: string;
            mimeType: string;
        }>;
    };
    grade?: {
        score: number;
        correct: boolean;
    };
}

export interface GoogleFormsResponseItem {
    responseId: string;
    createTime: string;
    lastSubmittedTime: string;
    respondentEmail?: string;
    answers: Record<string, GoogleFormsAnswer>;
    totalScore?: number;
}

export interface GoogleFormsResponsesResult {
    responses: GoogleFormsResponseItem[];
    nextPageToken?: string;
}

export interface GoogleFormItem {
    questionItem?: {
        question: {
            questionId: string;
            required?: boolean;
            textQuestion?: {
                paragraph?: boolean;
            };
            choiceQuestion?: {
                type?: string;
                options?: Array<{
                    value: string;
                }>;
                shuffle?: boolean;
            };
            scaleQuestion?: {
                low: number;
                high: number;
                lowLabel?: string;
                highLabel?: string;
            };
            dateQuestion?: {
                includeTime?: boolean;
                includeYear?: boolean;
            };
            timeQuestion?: {
                duration?: boolean;
            };
            fileUploadQuestion?: {
                folderId: string;
                types?: string[];
                maxFiles?: number;
                maxFileSize?: string;
            };
            rowQuestion?: {
                title: string;
            };
            grading?: {
                pointValue: number;
                correctAnswers?: {
                    answers: Array<{
                        value: string;
                    }>;
                };
            };
        };
    };
    questionGroupItem?: {
        questions: any[];
        grid?: {
            columns: {
                type: string;
                options: Array<{
                    value: string;
                }>;
            };
        };
    };
    title?: string;
    description?: string;
}

export interface GoogleFormsDetails {
    formId: string;
    info: {
        title: string;
        documentTitle?: string;
        description?: string;
    };
    settings?: {
        quizSettings?: {
            isQuiz?: boolean;
        };
    };
    items?: GoogleFormItem[];
    revisionId?: string;
    responderUri?: string;
    linkedSheetId?: string;
}

/**
 * Base class for all Google Forms actions.
 * Handles Google Forms-specific authentication and API interaction patterns.
 *
 * Note: Google Forms API is read-only - there are no endpoints for creating or updating forms.
 */
@RegisterClass(BaseAction, 'GoogleFormsBaseAction')
export abstract class GoogleFormsBaseAction extends BaseFormBuilderAction {
    protected get formPlatform(): string {
        return 'Google Forms';
    }

    protected get integrationName(): string {
        return 'Google Forms';
    }

    protected get apiBaseUrl(): string {
        return 'https://forms.googleapis.com/v1';
    }

    private axiosInstance: AxiosInstance | null = null;
    private currentAccessToken: string | null = null;

    /**
     * Get axios instance with Google Forms authentication (OAuth 2.0)
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

            // Add response interceptor for rate limiting
            this.axiosInstance.interceptors.response.use(
                (response) => {
                    return response;
                },
                async (error: AxiosError) => {
                    if (error.response?.status === 429) {
                        const retryAfter = error.response.headers['retry-after'];
                        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
                        LogStatus(`Google Forms rate limit hit. Waiting ${waitTime}ms before retry...`);
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
     * Get responses from a Google Form
     */
    protected async getGoogleFormsResponses(
        formId: string,
        accessToken: string,
        options?: {
            pageSize?: number;
            pageToken?: string;
            filter?: string;
        }
    ): Promise<GoogleFormsResponsesResult> {
        try {
            const params: Record<string, any> = {};

            if (options?.pageSize) {
                // Google Forms API max pageSize is 5000
                params.pageSize = Math.min(options.pageSize, 5000);
            }

            if (options?.pageToken) {
                params.pageToken = options.pageToken;
            }

            if (options?.filter) {
                params.filter = options.filter;
            }

            const response = await this.getAxiosInstance(accessToken).get(
                `/forms/${formId}/responses`,
                { params }
            );

            return response.data;
        } catch (error) {
            LogError('Failed to get Google Forms responses:', error);
            throw this.handleGoogleFormsError(error);
        }
    }

    /**
     * Get all responses with automatic pagination using pageToken
     */
    protected async getAllGoogleFormsResponses(
        formId: string,
        accessToken: string,
        options?: {
            filter?: string;
            maxResponses?: number;
        }
    ): Promise<GoogleFormsResponseItem[]> {
        const allResponses: GoogleFormsResponseItem[] = [];
        let pageToken: string | undefined = undefined;
        const maxResponses = options?.maxResponses || 10000;

        try {
            while (true) {
                const result = await this.getGoogleFormsResponses(formId, accessToken, {
                    pageSize: Math.min(5000, maxResponses - allResponses.length),
                    pageToken,
                    filter: options?.filter
                });

                if (result.responses && result.responses.length > 0) {
                    allResponses.push(...result.responses);

                    if (allResponses.length >= maxResponses) {
                        LogStatus(`Reached max responses limit of ${maxResponses}`);
                        break;
                    }
                }

                // Check if there are more pages
                if (!result.nextPageToken || !result.responses || result.responses.length === 0) {
                    break;
                }

                pageToken = result.nextPageToken;
                await this.sleep(100);
            }

            LogStatus(`Retrieved ${allResponses.length} responses from Google Forms`);
            return allResponses;
        } catch (error) {
            LogError('Failed to get all Google Forms responses:', error);
            throw error;
        }
    }

    /**
     * Get a single response by ID
     */
    protected async getSingleGoogleFormsResponse(
        formId: string,
        responseId: string,
        accessToken: string
    ): Promise<GoogleFormsResponseItem> {
        try {
            const response = await this.getAxiosInstance(accessToken).get(
                `/forms/${formId}/responses/${responseId}`
            );

            return response.data;
        } catch (error) {
            LogError('Failed to get single Google Forms response:', error);
            throw this.handleGoogleFormsError(error);
        }
    }

    /**
     * Get form details including questions and settings
     */
    protected async getGoogleFormsDetails(
        formId: string,
        accessToken: string
    ): Promise<GoogleFormsDetails> {
        try {
            const response = await this.getAxiosInstance(accessToken).get(
                `/forms/${formId}`
            );

            return response.data;
        } catch (error) {
            LogError('Failed to get Google Forms details:', error);
            throw this.handleGoogleFormsError(error);
        }
    }

    /**
     * Normalize Google Forms response to common format
     */
    protected normalizeGoogleFormsResponse(gfResponse: GoogleFormsResponseItem, formDetails?: GoogleFormsDetails): FormResponse {
        const answers: FormAnswer[] = [];

        // Build a map of question IDs to question details for better normalization
        const questionMap = new Map<string, { title: string; type: string }>();

        if (formDetails?.items) {
            for (const item of formDetails.items) {
                if (item.questionItem?.question) {
                    const question = item.questionItem.question;
                    let questionType = 'unknown';

                    if (question.textQuestion) {
                        questionType = question.textQuestion.paragraph ? 'paragraph_text' : 'short_text';
                    } else if (question.choiceQuestion) {
                        questionType = question.choiceQuestion.type?.toLowerCase() || 'choice';
                    } else if (question.scaleQuestion) {
                        questionType = 'scale';
                    } else if (question.dateQuestion) {
                        questionType = 'date';
                    } else if (question.timeQuestion) {
                        questionType = 'time';
                    } else if (question.fileUploadQuestion) {
                        questionType = 'file_upload';
                    }

                    questionMap.set(question.questionId, {
                        title: item.title || question.questionId,
                        type: questionType
                    });
                }
            }
        }

        // Process answers
        for (const [questionId, answerData] of Object.entries(gfResponse.answers || {})) {
            const questionInfo = questionMap.get(questionId);
            let answerValue: any;
            let fieldType = questionInfo?.type || 'unknown';
            let question = questionInfo?.title || questionId;

            // Extract answer value based on answer type
            if (answerData.textAnswers?.answers) {
                if (answerData.textAnswers.answers.length === 1) {
                    answerValue = answerData.textAnswers.answers[0].value;
                } else {
                    answerValue = answerData.textAnswers.answers.map(a => a.value);
                }
            } else if (answerData.fileUploadAnswers?.answers) {
                answerValue = answerData.fileUploadAnswers.answers.map(file => ({
                    fileId: file.fileId,
                    fileName: file.fileName,
                    mimeType: file.mimeType
                }));
                fieldType = 'file_upload';
            }

            answers.push({
                fieldId: questionId,
                fieldType,
                question,
                answer: answerValue,
                choices: Array.isArray(answerValue) ? answerValue : undefined
            });
        }

        const submittedAt = new Date(gfResponse.lastSubmittedTime || gfResponse.createTime);
        const completed = !!gfResponse.lastSubmittedTime;

        return {
            responseId: gfResponse.responseId,
            formId: '', // Form ID is not included in response object, needs to be passed separately
            submittedAt,
            completed,
            answerDetails: answers, // For now, use answers as answerDetails since Google Forms doesn't have simpleAnswers
            answers: {}, // Empty object for now - could be implemented later
            metadata: {
                userAgent: gfResponse.respondentEmail,
                platform: 'Google Forms'
            },
            calculatedFields: gfResponse.totalScore !== undefined ? {
                totalScore: gfResponse.totalScore
            } : undefined
        };
    }

    /**
     * Handle Google Forms-specific errors
     */
    protected handleGoogleFormsError(error: any): Error {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            const status = axiosError.response?.status;
            const data = axiosError.response?.data as any;

            if (status === 401) {
                return new Error('Invalid Google Forms access token. Please check your authentication or refresh your OAuth token.');
            } else if (status === 403) {
                return new Error('Insufficient permissions to access this Google Forms resource. Ensure the OAuth token has the required scopes (forms.responses.readonly or forms.readonly).');
            } else if (status === 404) {
                return new Error('Google Form or response not found. Verify the form ID and that the form exists.');
            } else if (status === 429) {
                return new Error('Google Forms API rate limit exceeded. Please try again later.');
            } else if (status === 400) {
                const errorMessage = data?.error?.message || 'Bad request';
                return new Error(`Google Forms API error: ${errorMessage}`);
            } else if (data?.error?.message) {
                return new Error(`Google Forms API error: ${data.error.message}`);
            }
        }

        return error instanceof Error ? error : new Error(String(error));
    }

    /**
     * Sleep helper for rate limiting and pagination delays
     */
    protected sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Format date for Google Forms API (RFC3339 format)
     */
    protected formatGoogleFormsDate(date: Date): string {
        return date.toISOString();
    }

    /**
     * Parse Google Forms date string (RFC3339 format)
     */
    protected parseGoogleFormsDate(dateValue: string): Date {
        return new Date(dateValue);
    }

    /**
     * Extract question information from form details
     * Useful for building comprehensive reports with question titles
     */
    protected extractQuestions(formDetails: GoogleFormsDetails): Array<{ id: string; title: string; type: string; required: boolean }> {
        const questions: Array<{ id: string; title: string; type: string; required: boolean }> = [];

        if (!formDetails.items) {
            return questions;
        }

        for (const item of formDetails.items) {
            if (item.questionItem?.question) {
                const question = item.questionItem.question;
                let questionType = 'unknown';

                if (question.textQuestion) {
                    questionType = question.textQuestion.paragraph ? 'paragraph_text' : 'short_text';
                } else if (question.choiceQuestion) {
                    questionType = question.choiceQuestion.type?.toLowerCase() || 'choice';
                } else if (question.scaleQuestion) {
                    questionType = 'scale';
                } else if (question.dateQuestion) {
                    questionType = 'date';
                } else if (question.timeQuestion) {
                    questionType = 'time';
                } else if (question.fileUploadQuestion) {
                    questionType = 'file_upload';
                }

                questions.push({
                    id: question.questionId,
                    title: item.title || question.questionId,
                    type: questionType,
                    required: question.required || false
                });
            }
        }

        return questions;
    }

    /**
     * Check if a form is a quiz
     */
    protected isQuiz(formDetails: GoogleFormsDetails): boolean {
        return formDetails.settings?.quizSettings?.isQuiz || false;
    }

    /**
     * Build filter string for Google Forms API
     * Filters use a SQL-like syntax: timestamp > "2024-01-01T00:00:00Z"
     */
    protected buildFilter(conditions: {
        timestampAfter?: Date;
        timestampBefore?: Date;
    }): string | undefined {
        const filters: string[] = [];

        if (conditions.timestampAfter) {
            filters.push(`timestamp > "${this.formatGoogleFormsDate(conditions.timestampAfter)}"`);
        }

        if (conditions.timestampBefore) {
            filters.push(`timestamp < "${this.formatGoogleFormsDate(conditions.timestampBefore)}"`);
        }

        return filters.length > 0 ? filters.join(' AND ') : undefined;
    }
}
