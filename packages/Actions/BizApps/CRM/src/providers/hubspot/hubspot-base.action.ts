import { RegisterClass } from '@memberjunction/global';
import { BaseCRMAction } from '../../base/base-crm.action';
import { UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import { BaseAction } from '@memberjunction/actions';

/**
 * Base class for all HubSpot CRM actions.
 * Handles HubSpot-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'HubSpotBaseAction')
export abstract class HubSpotBaseAction extends BaseCRMAction {
    protected crmProvider = 'HubSpot';
    protected integrationName = 'HubSpot';

    /**
     * HubSpot API version
     */
    protected apiVersion = 'v3';

    /**
     * Current action parameters (set by the framework)
     */
    protected params: any;

    /**
     * Makes an authenticated request to HubSpot API
     */
    protected async makeHubSpotRequest<T = any>(
        endpoint: string,
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
        body?: any,
        contextUser?: UserInfo
    ): Promise<T> {
        if (!contextUser) {
            throw new Error('Context user is required for HubSpot API calls');
        }

        // Get company ID from action params
        const companyId = this.getParamValue(this.params, 'CompanyID');
        if (!companyId) {
            throw new Error('CompanyID parameter is required');
        }

        // Get the integration credentials
        const integration = await this.getCompanyIntegration(companyId, contextUser);
        
        // Get API credentials
        const credentials = await this.getAPICredentials(integration);
        
        if (!credentials.accessToken && !credentials.apiKey) {
            throw new Error('Access Token or API Key is required for HubSpot integration');
        }

        // Build the full URL
        const baseUrl = `https://api.hubapi.com/crm/${this.apiVersion}`;
        const fullUrl = `${baseUrl}/${endpoint}`;

        // Prepare headers
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        // Use access token if available (OAuth), otherwise use API key
        if (credentials.accessToken) {
            headers['Authorization'] = `Bearer ${credentials.accessToken}`;
        } else if (credentials.apiKey) {
            // For private app key, it's passed as a query parameter
            const url = new URL(fullUrl);
            url.searchParams.set('hapikey', credentials.apiKey);
        }

        try {
            const response = await fetch(fullUrl, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `HubSpot API error: ${response.status} ${response.statusText}`;
                
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.message) {
                        errorMessage = `HubSpot API error: ${errorJson.message}`;
                    } else if (errorJson.errors) {
                        errorMessage = `HubSpot API error: ${errorJson.errors.map((e: any) => e.message).join(', ')}`;
                    }
                } catch {
                    errorMessage += ` - ${errorText}`;
                }

                throw new Error(errorMessage);
            }

            // Handle empty responses (like DELETE operations)
            if (response.status === 204 || response.headers.get('content-length') === '0') {
                return {} as T;
            }

            const result = await response.json();
            return result as T;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(`HubSpot API request failed: ${error}`);
        }
    }

    /**
     * Makes a paginated request to HubSpot API using cursor-based pagination
     */
    protected async makeHubSpotPaginatedRequest<T = any>(
        endpoint: string,
        params: Record<string, any> = {},
        contextUser?: UserInfo
    ): Promise<T[]> {
        const results: T[] = [];
        let after: string | undefined;
        const limit = params.limit || 100;
        
        // Get max results if specified
        const maxResults = this.getParamValue(this.params, 'MaxResults');

        while (true) {
            const queryParams = new URLSearchParams({
                ...params,
                limit: limit.toString()
            });

            if (after) {
                queryParams.set('after', after);
            }

            const response = await this.makeHubSpotRequest<{
                results: T[];
                paging?: {
                    next?: {
                        after: string;
                        link?: string;
                    };
                };
            }>(`${endpoint}?${queryParams}`, 'GET', undefined, contextUser);

            if (response.results && Array.isArray(response.results)) {
                results.push(...response.results);
            }

            // Check if we've reached max results
            if (maxResults && results.length >= maxResults) {
                return results.slice(0, maxResults);
            }

            // Check for more pages
            if (response.paging?.next?.after) {
                after = response.paging.next.after;
            } else {
                break;
            }
        }

        return results;
    }

    /**
     * Search HubSpot objects using the search API
     */
    protected async searchHubSpotObjects<T = any>(
        objectType: string,
        filters: Array<{
            propertyName: string;
            operator: string;
            value: string;
        }>,
        properties?: string[],
        contextUser?: UserInfo
    ): Promise<T[]> {
        const searchBody = {
            filterGroups: [{
                filters: filters
            }],
            properties: properties || [],
            limit: 100
        };

        const response = await this.makeHubSpotRequest<{
            results: T[];
            paging?: any;
        }>(`objects/${objectType}/search`, 'POST', searchBody, contextUser);

        return response.results || [];
    }

    /**
     * Batch create objects in HubSpot
     */
    protected async batchCreateHubSpotObjects<T = any>(
        objectType: string,
        objects: Array<{ properties: Record<string, any> }>,
        contextUser?: UserInfo
    ): Promise<T[]> {
        const batchBody = {
            inputs: objects
        };

        const response = await this.makeHubSpotRequest<{
            results: T[];
        }>(`objects/${objectType}/batch/create`, 'POST', batchBody, contextUser);

        return response.results || [];
    }

    /**
     * Batch update objects in HubSpot
     */
    protected async batchUpdateHubSpotObjects<T = any>(
        objectType: string,
        updates: Array<{ id: string; properties: Record<string, any> }>,
        contextUser?: UserInfo
    ): Promise<T[]> {
        const batchBody = {
            inputs: updates
        };

        const response = await this.makeHubSpotRequest<{
            results: T[];
        }>(`objects/${objectType}/batch/update`, 'POST', batchBody, contextUser);

        return response.results || [];
    }

    /**
     * Associate objects in HubSpot
     */
    protected async associateObjects(
        fromObjectType: string,
        fromObjectId: string,
        toObjectType: string,
        toObjectId: string,
        associationType?: string,
        contextUser?: UserInfo
    ): Promise<void> {
        const associationSpec = associationType || `${fromObjectType}_to_${toObjectType}`;
        
        await this.makeHubSpotRequest(
            `objects/${fromObjectType}/${fromObjectId}/associations/${toObjectType}/${toObjectId}/${associationSpec}`,
            'PUT',
            undefined,
            contextUser
        );
    }

    /**
     * Convert HubSpot timestamp to Date
     */
    protected parseHubSpotDate(timestamp: string | number): Date {
        // HubSpot returns timestamps as ISO strings or milliseconds
        if (typeof timestamp === 'number') {
            return new Date(timestamp);
        }
        return new Date(timestamp);
    }

    /**
     * Format date for HubSpot (ISO string or milliseconds)
     */
    protected formatHubSpotDate(date: Date): string {
        return date.toISOString();
    }

    /**
     * Map HubSpot object properties to a standard format
     */
    protected mapHubSpotProperties(hubspotObject: any): any {
        return {
            id: hubspotObject.id,
            ...hubspotObject.properties,
            createdAt: hubspotObject.createdAt,
            updatedAt: hubspotObject.updatedAt,
            archived: hubspotObject.archived
        };
    }

    /**
     * Get HubSpot association type IDs
     * Based on HubSpot's default association type IDs
     */
    protected getAssociationTypeId(fromType: string, toType: string): number {
        const associationMap: Record<string, number> = {
            'contact_to_company': 1,
            'company_to_contact': 2,
            'deal_to_contact': 3,
            'contact_to_deal': 4,
            'deal_to_company': 5,
            'company_to_deal': 6,
            'company_to_engagement': 7,
            'engagement_to_company': 8,
            'contact_to_engagement': 9,
            'engagement_to_contact': 10,
            'deal_to_engagement': 11,
            'engagement_to_deal': 12,
            'parent_company_to_child_company': 13,
            'child_company_to_parent_company': 14,
            'contact_to_ticket': 15,
            'ticket_to_contact': 16,
            'ticket_to_engagement': 17,
            'engagement_to_ticket': 18,
            'deal_to_line_item': 19,
            'line_item_to_deal': 20
        };

        const key = `${fromType}_to_${toType}`;
        return associationMap[key] || 1;
    }
}