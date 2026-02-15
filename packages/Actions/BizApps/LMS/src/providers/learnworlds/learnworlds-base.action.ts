import { RegisterClass } from '@memberjunction/global';
import { BaseLMSAction } from '../../base/base-lms.action';
import { UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { BaseAction } from '@memberjunction/actions';

/**
 * Base class for all LearnWorlds LMS actions.
 * Handles LearnWorlds-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'LearnWorldsBaseAction')
export abstract class LearnWorldsBaseAction extends BaseLMSAction {
    protected lmsProvider = 'LearnWorlds';
    protected integrationName = 'LearnWorlds';

    /**
     * LearnWorlds API version
     */
    protected apiVersion = 'v2';

    /**
     * Current action parameters (set by the framework)
     */
    protected params: any;

    /**
     * Makes an authenticated request to LearnWorlds API
     */
    protected async makeLearnWorldsRequest<T = any>(
        endpoint: string,
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
        body?: any,
        contextUser?: UserInfo
    ): Promise<T> {
        if (!contextUser) {
            throw new Error('Context user is required for LearnWorlds API calls');
        }

        // Get company ID from action params
        const companyId = this.getParamValue(this.params, 'CompanyID');
        if (!companyId) {
            throw new Error('CompanyID parameter is required');
        }

        // Get the integration credentials
        const integration = await this.getCompanyIntegration(companyId, contextUser);
        
        // Get API credentials (from env vars or database)
        const credentials = await this.getAPICredentials(integration);
        
        if (!credentials.apiKey) {
            throw new Error('API Key is required for LearnWorlds integration');
        }

        // Get the school domain from ExternalSystemID or environment
        const schoolDomain = integration.ExternalSystemID || this.getCredentialFromEnv(companyId, 'SCHOOL_DOMAIN');
        if (!schoolDomain) {
            throw new Error('School domain not found. Set in CompanyIntegration.ExternalSystemID or environment variable');
        }

        // Build the full URL
        const baseUrl = `https://${schoolDomain}/api/${this.apiVersion}`;
        const fullUrl = `${baseUrl}/${endpoint}`;

        // Prepare headers
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${credentials.apiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Lw-Client': 'MemberJunction'
        };

        try {
            const response = await fetch(fullUrl, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `LearnWorlds API error: ${response.status} ${response.statusText}`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.error) {
                        errorMessage = `LearnWorlds API error: ${errorJson.error.message || errorJson.error}`;
                    } else if (errorJson.message) {
                        errorMessage = `LearnWorlds API error: ${errorJson.message}`;
                    }
                } catch {
                    errorMessage += ` - ${errorText}`;
                }

                throw new Error(errorMessage);
            }

            const result = await response.json();
            return result as T;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`LearnWorlds API request failed: ${error}`);
        }
    }

    /**
     * Makes a paginated request to LearnWorlds API
     */
    protected async makeLearnWorldsPaginatedRequest<T = any>(
        endpoint: string,
        params: Record<string, any> = {},
        contextUser?: UserInfo
    ): Promise<T[]> {
        const results: T[] = [];
        let page = 1;
        let hasMore = true;
        const limit = params.limit || 50;

        while (hasMore) {
            const queryParams = new URLSearchParams({
                ...params,
                page: page.toString(),
                limit: limit.toString()
            });

            const response = await this.makeLearnWorldsRequest<{
                data: T[];
                meta?: {
                    page: number;
                    totalPages: number;
                    totalItems: number;
                };
            }>(`${endpoint}?${queryParams}`, 'GET', undefined, contextUser);

            if (response.data && Array.isArray(response.data)) {
                results.push(...response.data);
            }

            // Check if there are more pages
            if (response.meta && response.meta.page < response.meta.totalPages) {
                page++;
            } else {
                hasMore = false;
            }

            // Respect max results if specified
            const maxResults = this.getParamValue(this.params, 'MaxResults');
            if (maxResults && results.length >= maxResults) {
                return results.slice(0, maxResults);
            }
        }

        return results;
    }

    /**
     * Convert LearnWorlds date format to Date object
     */
    protected parseLearnWorldsDate(dateString: string | number): Date {
        // LearnWorlds sometimes returns timestamps as seconds since epoch
        if (typeof dateString === 'number') {
            return new Date(dateString * 1000);
        }
        return new Date(dateString);
    }

    /**
     * Format date for LearnWorlds API (ISO 8601)
     */
    protected formatLearnWorldsDate(date: Date): string {
        return date.toISOString();
    }

    /**
     * Map LearnWorlds user status to standard status
     */
    protected mapUserStatus(status: string): 'active' | 'inactive' | 'suspended' {
        const statusMap: Record<string, 'active' | 'inactive' | 'suspended'> = {
            'active': 'active',
            'inactive': 'inactive',
            'suspended': 'suspended',
            'blocked': 'suspended'
        };
        
        return statusMap[status.toLowerCase()] || 'inactive';
    }

    /**
     * Map LearnWorlds enrollment status
     */
    protected mapLearnWorldsEnrollmentStatus(enrollment: any): 'active' | 'completed' | 'expired' | 'suspended' {
        if (enrollment.completed) {
            return 'completed';
        }
        if (enrollment.expired) {
            return 'expired';
        }
        if (enrollment.suspended || !enrollment.active) {
            return 'suspended';
        }
        return 'active';
    }

    /**
     * Calculate progress from LearnWorlds data
     */
    protected calculateProgress(progressData: any): {
        percentage: number;
        completedUnits: number;
        totalUnits: number;
        timeSpent: number;
    } {
        return {
            percentage: progressData.percentage || 0,
            completedUnits: progressData.completed_units || 0,
            totalUnits: progressData.total_units || 0,
            timeSpent: progressData.time_spent || 0
        };
    }
}