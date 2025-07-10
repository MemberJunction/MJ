import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to search for companies in HubSpot
 */
@RegisterClass(BaseAction, 'SearchCompaniesAction')
export class SearchCompaniesAction extends HubSpotBaseAction {
    /**
     * Search for companies
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract parameters
            const searchQuery = this.getParamValue(Params, 'SearchQuery');
            const name = this.getParamValue(Params, 'Name');
            const domain = this.getParamValue(Params, 'Domain');
            const industry = this.getParamValue(Params, 'Industry');
            const city = this.getParamValue(Params, 'City');
            const state = this.getParamValue(Params, 'State');
            const country = this.getParamValue(Params, 'Country');
            const lifecycleStage = this.getParamValue(Params, 'LifecycleStage');
            const minEmployees = this.getParamValue(Params, 'MinEmployees');
            const maxEmployees = this.getParamValue(Params, 'MaxEmployees');
            const minRevenue = this.getParamValue(Params, 'MinRevenue');
            const maxRevenue = this.getParamValue(Params, 'MaxRevenue');
            const ownerId = this.getParamValue(Params, 'OwnerId');
            const createdAfter = this.getParamValue(Params, 'CreatedAfter');
            const createdBefore = this.getParamValue(Params, 'CreatedBefore');
            const updatedAfter = this.getParamValue(Params, 'UpdatedAfter');
            const updatedBefore = this.getParamValue(Params, 'UpdatedBefore');
            const customFilters = this.getParamValue(Params, 'CustomFilters');
            const limit = this.getParamValue(Params, 'Limit') || 100;
            const after = this.getParamValue(Params, 'After');
            const properties = this.getParamValue(Params, 'Properties');
            const sorts = this.getParamValue(Params, 'Sorts');

            // Build filters
            const filters: any[] = [];

            // Add search query if provided
            if (searchQuery) {
                filters.push({
                    propertyName: 'name',
                    operator: 'CONTAINS_TOKEN',
                    value: searchQuery
                });
            }

            // Add specific filters
            if (name) {
                filters.push({
                    propertyName: 'name',
                    operator: 'CONTAINS_TOKEN',
                    value: name
                });
            }

            if (domain) {
                filters.push({
                    propertyName: 'domain',
                    operator: 'CONTAINS_TOKEN',
                    value: domain
                });
            }

            if (industry) {
                filters.push({
                    propertyName: 'industry',
                    operator: 'EQ',
                    value: industry
                });
            }

            if (city) {
                filters.push({
                    propertyName: 'city',
                    operator: 'EQ',
                    value: city
                });
            }

            if (state) {
                filters.push({
                    propertyName: 'state',
                    operator: 'EQ',
                    value: state
                });
            }

            if (country) {
                filters.push({
                    propertyName: 'country',
                    operator: 'EQ',
                    value: country
                });
            }

            if (lifecycleStage) {
                filters.push({
                    propertyName: 'lifecyclestage',
                    operator: 'EQ',
                    value: lifecycleStage
                });
            }

            if (minEmployees != null) {
                filters.push({
                    propertyName: 'numberofemployees',
                    operator: 'GTE',
                    value: minEmployees.toString()
                });
            }

            if (maxEmployees != null) {
                filters.push({
                    propertyName: 'numberofemployees',
                    operator: 'LTE',
                    value: maxEmployees.toString()
                });
            }

            if (minRevenue != null) {
                filters.push({
                    propertyName: 'annualrevenue',
                    operator: 'GTE',
                    value: minRevenue.toString()
                });
            }

            if (maxRevenue != null) {
                filters.push({
                    propertyName: 'annualrevenue',
                    operator: 'LTE',
                    value: maxRevenue.toString()
                });
            }

            if (ownerId) {
                filters.push({
                    propertyName: 'hubspot_owner_id',
                    operator: 'EQ',
                    value: ownerId
                });
            }

            // Date filters
            if (createdAfter) {
                filters.push({
                    propertyName: 'createdate',
                    operator: 'GTE',
                    value: new Date(createdAfter).getTime().toString()
                });
            }

            if (createdBefore) {
                filters.push({
                    propertyName: 'createdate',
                    operator: 'LTE',
                    value: new Date(createdBefore).getTime().toString()
                });
            }

            if (updatedAfter) {
                filters.push({
                    propertyName: 'lastmodifieddate',
                    operator: 'GTE',
                    value: new Date(updatedAfter).getTime().toString()
                });
            }

            if (updatedBefore) {
                filters.push({
                    propertyName: 'lastmodifieddate',
                    operator: 'LTE',
                    value: new Date(updatedBefore).getTime().toString()
                });
            }

            // Add custom filters if provided
            if (customFilters && Array.isArray(customFilters)) {
                filters.push(...customFilters);
            }

            // Build request body
            const requestBody: any = {
                limit: Math.min(limit, 100), // HubSpot max is 100
                properties: properties || ['name', 'domain', 'industry', 'city', 'state', 'country', 
                                         'lifecyclestage', 'numberofemployees', 'annualrevenue', 
                                         'createdate', 'lastmodifieddate', 'hubspot_owner_id']
            };

            // Add filters if any
            if (filters.length > 0) {
                requestBody.filterGroups = [{
                    filters: filters
                }];
            }

            // Add sorting if provided
            if (sorts && Array.isArray(sorts)) {
                requestBody.sorts = sorts;
            } else {
                // Default sort by last modified date descending
                requestBody.sorts = [{
                    propertyName: 'lastmodifieddate',
                    direction: 'DESCENDING'
                }];
            }

            // Add pagination if provided
            if (after) {
                requestBody.after = after;
            }

            // Search companies
            const searchResult = await this.makeHubSpotRequest<any>(
                'objects/companies/search',
                'POST',
                requestBody,
                ContextUser
            );

            // Process results
            const companies = searchResult.results.map((company: any) => 
                this.mapHubSpotProperties(company)
            );

            // Calculate statistics
            const stats = {
                totalResults: searchResult.total || companies.length,
                returnedResults: companies.length,
                hasMore: searchResult.paging && searchResult.paging.next ? true : false,
                nextCursor: searchResult.paging?.next?.after || null,
                avgEmployees: companies.length > 0 
                    ? Math.round(companies.reduce((sum: number, c: any) => sum + (c.numberofemployees || 0), 0) / companies.length) 
                    : 0,
                avgRevenue: companies.length > 0 
                    ? Math.round(companies.reduce((sum: number, c: any) => sum + (c.annualrevenue || 0), 0) / companies.length) 
                    : 0,
                industries: [...new Set(companies.map((c: any) => c.industry).filter(Boolean))],
                states: [...new Set(companies.map((c: any) => c.state).filter(Boolean))],
                countries: [...new Set(companies.map((c: any) => c.country).filter(Boolean))]
            };

            // Create summary
            const summary = {
                query: searchQuery || 'Custom filters',
                totalFound: stats.totalResults,
                returned: stats.returnedResults,
                hasMore: stats.hasMore,
                nextCursor: stats.nextCursor,
                filters: {
                    name,
                    domain,
                    industry,
                    city,
                    state,
                    country,
                    lifecycleStage,
                    minEmployees,
                    maxEmployees,
                    minRevenue,
                    maxRevenue,
                    ownerId,
                    createdAfter,
                    createdBefore,
                    updatedAfter,
                    updatedBefore,
                    customFiltersCount: customFilters ? customFilters.length : 0
                },
                statistics: stats
            };

            // Update output parameters
            const outputParams = [...Params];
            const companiesParam = outputParams.find(p => p.Name === 'Companies');
            if (companiesParam) companiesParam.Value = companies;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const statisticsParam = outputParams.find(p => p.Name === 'Statistics');
            if (statisticsParam) statisticsParam.Value = stats;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${stats.totalResults} companies, returned ${stats.returnedResults}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error searching companies: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonCRMParams();
        const specificParams: ActionParam[] = [
            {
                Name: 'SearchQuery',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Name',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Domain',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Industry',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'City',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'State',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Country',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'LifecycleStage',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinEmployees',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxEmployees',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinRevenue',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxRevenue',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OwnerId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CreatedAfter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CreatedBefore',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UpdatedAfter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UpdatedBefore',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CustomFilters',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Limit',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'After',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Properties',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Sorts',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Companies',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Statistics',
                Type: 'Output',
                Value: null
            }
        ];
        return [...baseParams, ...specificParams];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Searches for companies in HubSpot using various filters and criteria';
    }
}