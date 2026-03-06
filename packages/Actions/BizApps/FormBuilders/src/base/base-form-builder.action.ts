import { ActionParam } from '@memberjunction/actions-base';
import { BaseAction, OAuth2Manager } from '@memberjunction/actions';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';

/**
 * Common response structure for form submissions
 */
export interface FormResponse {
    responseId: string;
    formId: string;
    submittedAt: Date;
    completed: boolean;
    answerDetails: FormAnswer[]; // Renamed from answers - detailed array with field info
    answers?: Record<string, any>; // Renamed from simpleAnswers - flat object with question titles as keys
    metadata?: {
        browser?: string;
        platform?: string;
        referer?: string;
        userAgent?: string;
    };
    calculatedFields?: Record<string, any>;
    hiddenFields?: Record<string, any>;
}

/**
 * Structure for individual form answers
 */
export interface FormAnswer {
    fieldId: string;
    fieldType: string;
    question: string;
    answer: any;
    choices?: string[];
}

/**
 * Statistics structure for form responses
 */
export interface FormStatistics {
    totalResponses: number;
    completedResponses: number;
    partialResponses: number;
    completionRate: number;
    averageCompletionTime?: number;
    responsesByDate?: Record<string, number>;
    topAnswers?: Record<string, Array<{ answer: string; count: number }>> | Array<{ answer: string; count: number }>;
}

/**
 * Base class for all form builder-related actions.
 * Provides common functionality and patterns for interacting with form/survey platforms.
 */
@RegisterClass(BaseAction, 'BaseFormBuilderAction')
export abstract class BaseFormBuilderAction extends BaseAction {
    /**
     * The form platform this action is designed for (e.g., 'Typeform', 'Google Forms', etc.)
     */
    protected abstract formPlatform: string;

    /**
     * The integration name to look up in the Integration entity
     */
    protected abstract integrationName: string;

    /**
     * Cached company integration for the current execution
     */
    private _companyIntegration: MJCompanyIntegrationEntity | null = null;

    /**
     * Common form builder parameters that many actions will need.
     * CompanyID is required for secure credential lookup.
     * FormID is the platform-specific form identifier.
     */
    protected getCommonFormParams(): ActionParam[] {
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
            }
        ];
    }

    /**
     * Gets the company integration record for the specified company and form platform
     */
    protected async getCompanyIntegration(companyId: string, contextUser: UserInfo): Promise<MJCompanyIntegrationEntity> {
        if (this._companyIntegration && UUIDsEqual(this._companyIntegration.CompanyID, companyId)) {
            return this._companyIntegration;
        }

        const rv = new RunView();
        const result = await rv.RunView<MJCompanyIntegrationEntity>({
            EntityName: 'MJ: Company Integrations',
            ExtraFilter: `CompanyID = '${companyId}' AND Integration.Name = '${this.integrationName}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to retrieve company integration: ${result.ErrorMessage}`);
        }

        if (!result.Results || result.Results.length === 0) {
            throw new Error(`No ${this.integrationName} integration found for company ${companyId}. Please configure the integration first.`);
        }

        this._companyIntegration = result.Results[0];
        return this._companyIntegration;
    }

    /**
     * Gets credentials from environment variables
     * Format: BIZAPPS_{PROVIDER}_{COMPANY_ID}_{CREDENTIAL_TYPE}
     * Example: BIZAPPS_TYPEFORM_12345_API_TOKEN
     *
     * Falls back to: BIZAPPS_{PROVIDER}_{CREDENTIAL_TYPE} if no company-specific credential found
     * Example fallback: BIZAPPS_TYPEFORM_API_TOKEN
     */
    protected getCredentialFromEnv(companyId: string, credentialType: string): string | undefined {
        const platformKey = this.formPlatform.toUpperCase().replace(/\s+/g, '_');

        // Try company-specific credential first
        if (companyId) {
            const companyEnvKey = `BIZAPPS_${platformKey}_${companyId}_${credentialType.toUpperCase()}`;
            const companyCredential = process.env[companyEnvKey];
            if (companyCredential) {
                return companyCredential;
            }
        }

        // Fall back to default credential (no company ID)
        const defaultEnvKey = `BIZAPPS_${platformKey}_${credentialType.toUpperCase()}`;
        return process.env[defaultEnvKey];
    }

    /**
     * Gets API credentials - first tries environment variables, then falls back to database
     */
    protected async getAPICredentials(integration: MJCompanyIntegrationEntity): Promise<{ apiToken?: string; apiKey?: string; accessToken?: string }> {
        const companyId = integration.CompanyID;

        const envApiToken = this.getCredentialFromEnv(companyId, 'API_TOKEN');
        const envApiKey = this.getCredentialFromEnv(companyId, 'API_KEY');
        const envAccessToken = this.getCredentialFromEnv(companyId, 'ACCESS_TOKEN');

        if (envApiToken || envApiKey || envAccessToken) {
            return {
                apiToken: envApiToken,
                apiKey: envApiKey,
                accessToken: envAccessToken
            };
        }

        if (!integration.APIKey && !integration.AccessToken) {
            throw new Error(`No API credentials found for ${this.integrationName} integration. Please set environment variables or configure in database.`);
        }

        return {
            apiToken: integration.APIKey || undefined,
            apiKey: integration.APIKey || undefined,
            accessToken: integration.AccessToken || undefined
        };
    }

    /**
     * Helper to securely retrieve API token for a company.
     * This method should be used by all form builder actions instead of accepting tokens as parameters.
     *
     * @param companyId - The MemberJunction company ID (required)
     * @param contextUser - The user context for database queries
     * @returns The API token for the specified company
     * @throws Error if no credentials are found or company integration is not configured
     */
    protected async getSecureAPIToken(companyId: string | null | undefined, contextUser: UserInfo): Promise<string> {
        // Try environment variables first (faster, no database query needed)
        const envToken = this.getCredentialFromEnv(companyId || '', 'API_TOKEN') ||
                        this.getCredentialFromEnv(companyId || '', 'ACCESS_TOKEN') ||
                        this.getCredentialFromEnv(companyId || '', 'API_KEY');

        if (envToken) {
            return envToken;
        }

        // Fall back to database lookup if companyId provided
        if (companyId) {
            const integration = await this.getCompanyIntegration(companyId, contextUser);
            const credentials = await this.getAPICredentials(integration);

            const token = credentials.apiToken || credentials.accessToken || credentials.apiKey;
            if (token) {
                return token;
            }
        }

        // No credentials found
        const platformKey = this.formPlatform.toUpperCase().replace(/\s+/g, '_');
        const envVarSuggestion = companyId
            ? `BIZAPPS_${platformKey}_${companyId}_API_TOKEN or BIZAPPS_${platformKey}_API_TOKEN`
            : `BIZAPPS_${platformKey}_API_TOKEN`;

        throw new Error(`No API token found for ${this.integrationName} integration. Please set environment variable ${envVarSuggestion} or configure in Company Integrations table.`);
    }

    /**
     * Creates an OAuth2Manager instance for the specified company.
     * Override this method in provider-specific base classes to configure OAuth2 endpoints.
     *
     * @param companyId - The MemberJunction company ID
     * @param contextUser - The user context
     * @returns OAuth2Manager instance or null if OAuth2 is not configured
     */
    protected async createOAuth2Manager(companyId: string, contextUser: UserInfo): Promise<OAuth2Manager | null> {
        // Check for OAuth2 credentials in environment variables
        const platformKey = this.formPlatform.toUpperCase().replace(/\s+/g, '_');
        const clientId = process.env[`BIZAPPS_${platformKey}_CLIENT_ID`];
        const clientSecret = process.env[`BIZAPPS_${platformKey}_CLIENT_SECRET`];

        if (!clientId || !clientSecret) {
            return null; // OAuth2 not configured
        }

        // Subclasses should override this method to provide proper endpoints
        throw new Error(`OAuth2 endpoints not configured for ${this.formPlatform}. Override createOAuth2Manager() in your provider base class.`);
    }

    /**
     * Helper to get parameter value with type safety
     */
    protected getParamValue(params: ActionParam[], paramName: string): any {
        const param = params.find(p => p.Name === paramName);
        return param?.Value;
    }

    /**
     * Standard date format for form platforms (ISO 8601)
     */
    protected formatFormDate(date: Date): string {
        return date.toISOString();
    }

    /**
     * Parse date from form platform format
     */
    protected parseFormDate(dateString: string | number): Date {
        if (typeof dateString === 'number') {
            return new Date(dateString * 1000);
        }
        return new Date(dateString);
    }

    /**
     * Calculate completion rate percentage
     */
    protected calculateCompletionRate(completed: number, total: number): number {
        if (total === 0) return 0;
        return Math.round((completed / total) * 100 * 100) / 100;
    }

    /**
     * Format duration in seconds to human readable format
     */
    protected formatDuration(seconds: number): string {
        if (seconds < 60) {
            return `${seconds}s`;
        }

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.round(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        }
        return `${minutes}m ${secs}s`;
    }

    /**
     * Helper to build consistent error messages for form operations
     */
    protected buildFormErrorMessage(operation: string, details: string, systemError?: any): string {
        let message = `Form operation failed: ${operation}. ${details}`;
        if (systemError) {
            message += ` System error: ${systemError.message || systemError}`;
        }
        return message;
    }

    /**
     * Extract email addresses from response answers
     */
    protected extractEmailFromResponses(responses: FormResponse[]): string[] {
        const emails: string[] = [];
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for (const response of responses) {
            for (const answer of response.answerDetails) {
                if (answer.fieldType === 'email' ||
                    (typeof answer.answer === 'string' && emailRegex.test(answer.answer))) {
                    emails.push(answer.answer);
                }
            }
        }

        return [...new Set(emails)];
    }

    /**
     * Group responses by date
     */
    protected groupResponsesByDate(responses: FormResponse[]): Record<string, number> {
        const grouped: Record<string, number> = {};

        for (const response of responses) {
            const dateKey = response.submittedAt.toISOString().split('T')[0];
            grouped[dateKey] = (grouped[dateKey] || 0) + 1;
        }

        return grouped;
    }

    /**
     * Calculate average completion time from responses
     */
    protected calculateAverageCompletionTime(responses: FormResponse[]): number | undefined {
        const completionTimes: number[] = [];

        for (const response of responses) {
            if (response.metadata && response.metadata.userAgent) {
                const calcField = response.calculatedFields?.completion_time;
                if (calcField) {
                    completionTimes.push(calcField);
                }
            }
        }

        if (completionTimes.length === 0) {
            return undefined;
        }

        const sum = completionTimes.reduce((a, b) => a + b, 0);
        return Math.round(sum / completionTimes.length);
    }

    /**
     * Find most common answers for choice fields
     */
    protected findTopAnswers(
        responses: FormResponse[],
        fieldId: string,
        limit: number = 10
    ): Array<{ answer: string; count: number }> {
        const answerCounts: Record<string, number> = {};

        for (const response of responses) {
            const answer = response.answers.find(a => a.fieldId === fieldId);
            if (answer && answer.answer) {
                const answerStr = Array.isArray(answer.answer)
                    ? answer.answer.join(', ')
                    : String(answer.answer);
                answerCounts[answerStr] = (answerCounts[answerStr] || 0) + 1;
            }
        }

        return Object.entries(answerCounts)
            .map(([answer, count]) => ({ answer, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Convert responses to CSV format
     */
    protected convertToCSV(
        responses: FormResponse[],
        includeMetadata: boolean = false,
        delimiter: string = ','
    ): { csv: string; headers: string[] } {
        if (responses.length === 0) {
            return { csv: '', headers: [] };
        }

        const allFieldIds = new Set<string>();
        for (const response of responses) {
            response.answers.forEach(a => allFieldIds.add(a.fieldId));
        }

        const headers = [
            'Response ID',
            'Form ID',
            'Submitted At',
            'Completed',
            ...Array.from(allFieldIds)
        ];

        if (includeMetadata) {
            headers.push('Browser', 'Platform', 'Referer', 'User Agent');
        }

        const escapeCSV = (value: any): string => {
            if (value === null || value === undefined) return '';
            const str = String(value);
            if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = responses.map(response => {
            const row = [
                escapeCSV(response.responseId),
                escapeCSV(response.formId),
                escapeCSV(response.submittedAt.toISOString()),
                escapeCSV(response.completed)
            ];

            for (const fieldId of allFieldIds) {
                const answer = response.answers.find(a => a.fieldId === fieldId);
                if (answer) {
                    const value = Array.isArray(answer.answer)
                        ? answer.answer.join('; ')
                        : answer.answer;
                    row.push(escapeCSV(value));
                } else {
                    row.push('');
                }
            }

            if (includeMetadata) {
                row.push(
                    escapeCSV(response.metadata?.browser),
                    escapeCSV(response.metadata?.platform),
                    escapeCSV(response.metadata?.referer),
                    escapeCSV(response.metadata?.userAgent)
                );
            }

            return row.join(delimiter);
        });

        const csv = [headers.join(delimiter), ...rows].join('\n');
        return { csv, headers };
    }
}
