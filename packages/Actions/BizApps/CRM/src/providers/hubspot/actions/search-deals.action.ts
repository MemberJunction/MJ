import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to search for deals in HubSpot
 */
@RegisterClass(BaseAction, 'SearchDealsAction')
export class SearchDealsAction extends HubSpotBaseAction {
    /**
     * Search for deals using various criteria
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract search parameters
            const searchTerm = this.getParamValue(Params, 'SearchTerm');
            const dealStage = this.getParamValue(Params, 'DealStage');
            const pipelineId = this.getParamValue(Params, 'PipelineId');
            const minAmount = this.getParamValue(Params, 'MinAmount');
            const maxAmount = this.getParamValue(Params, 'MaxAmount');
            const closeDateAfter = this.getParamValue(Params, 'CloseDateAfter');
            const closeDateBefore = this.getParamValue(Params, 'CloseDateBefore');
            const dealType = this.getParamValue(Params, 'DealType');
            const priority = this.getParamValue(Params, 'Priority');
            const ownerId = this.getParamValue(Params, 'OwnerId');
            const includeArchived = this.getParamValue(Params, 'IncludeArchived') ?? false;
            const limit = this.getParamValue(Params, 'Limit') || 100;
            const sortBy = this.getParamValue(Params, 'SortBy') || 'closedate';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'DESC';

            // Build filter groups
            const filterGroups: any[] = [];
            const filters: any[] = [];

            // Add search term filter
            if (searchTerm) {
                filters.push({
                    propertyName: 'dealname',
                    operator: 'CONTAINS_TOKEN',
                    value: searchTerm
                });
            }

            // Add deal stage filter
            if (dealStage) {
                filters.push({
                    propertyName: 'dealstage',
                    operator: 'EQ',
                    value: dealStage
                });
            }

            // Add pipeline filter
            if (pipelineId) {
                filters.push({
                    propertyName: 'pipeline',
                    operator: 'EQ',
                    value: pipelineId
                });
            }

            // Add amount range filters
            if (minAmount !== null && minAmount !== undefined) {
                filters.push({
                    propertyName: 'amount',
                    operator: 'GTE',
                    value: minAmount.toString()
                });
            }

            if (maxAmount !== null && maxAmount !== undefined) {
                filters.push({
                    propertyName: 'amount',
                    operator: 'LTE',
                    value: maxAmount.toString()
                });
            }

            // Add close date range filters
            if (closeDateAfter) {
                const dateMs = new Date(closeDateAfter).getTime();
                filters.push({
                    propertyName: 'closedate',
                    operator: 'GTE',
                    value: dateMs.toString()
                });
            }

            if (closeDateBefore) {
                const dateMs = new Date(closeDateBefore).getTime();
                filters.push({
                    propertyName: 'closedate',
                    operator: 'LTE',
                    value: dateMs.toString()
                });
            }

            // Add deal type filter
            if (dealType) {
                filters.push({
                    propertyName: 'dealtype',
                    operator: 'EQ',
                    value: dealType
                });
            }

            // Add priority filter
            if (priority) {
                filters.push({
                    propertyName: 'hs_priority',
                    operator: 'EQ',
                    value: priority
                });
            }

            // Add owner filter
            if (ownerId) {
                filters.push({
                    propertyName: 'hubspot_owner_id',
                    operator: 'EQ',
                    value: ownerId
                });
            }

            // Add archived filter
            if (!includeArchived) {
                filters.push({
                    propertyName: 'hs_is_archived',
                    operator: 'EQ',
                    value: 'false'
                });
            }

            // Add filters to filter group
            if (filters.length > 0) {
                filterGroups.push({ filters });
            }

            // Prepare search request
            const searchRequest: any = {
                filterGroups: filterGroups,
                sorts: [{
                    propertyName: sortBy,
                    direction: sortOrder
                }],
                properties: [
                    'dealname', 'dealstage', 'pipeline', 'amount', 'closedate',
                    'dealtype', 'hs_priority', 'hubspot_owner_id', 'createdate',
                    'hs_lastmodifieddate', 'description', 'hs_object_id'
                ],
                limit: Math.min(limit, 100), // HubSpot max is 100
                after: 0
            };

            // Execute search
            const searchResults = await this.makeHubSpotRequest<any>(
                'objects/deals/search',
                'POST',
                searchRequest,
                ContextUser
            );

            // Process results
            const deals = searchResults.results.map((deal: any) => this.mapHubSpotProperties(deal));

            // Calculate summary statistics
            const stats = {
                totalResults: searchResults.total,
                returnedCount: deals.length,
                totalAmount: 0,
                averageAmount: 0,
                stageBreakdown: {} as Record<string, number>,
                pipelineBreakdown: {} as Record<string, number>,
                overdueCount: 0
            };

            // Calculate statistics
            const now = new Date();
            deals.forEach((deal: any) => {
                // Sum amounts
                if (deal.amount) {
                    stats.totalAmount += parseFloat(deal.amount);
                }

                // Count by stage
                if (deal.dealstage) {
                    stats.stageBreakdown[deal.dealstage] = (stats.stageBreakdown[deal.dealstage] || 0) + 1;
                }

                // Count by pipeline
                if (deal.pipeline) {
                    stats.pipelineBreakdown[deal.pipeline] = (stats.pipelineBreakdown[deal.pipeline] || 0) + 1;
                }

                // Check if overdue
                if (deal.closedate) {
                    const closeDate = new Date(deal.closedate);
                    if (closeDate < now && !['closedwon', 'closedlost'].includes(deal.dealstage?.toLowerCase() || '')) {
                        stats.overdueCount++;
                    }
                }
            });

            // Calculate average amount
            if (deals.length > 0 && stats.totalAmount > 0) {
                stats.averageAmount = stats.totalAmount / deals.length;
            }

            // Create summary
            const summary = {
                searchCriteria: {
                    searchTerm,
                    dealStage,
                    pipelineId,
                    amountRange: { min: minAmount, max: maxAmount },
                    dateRange: { after: closeDateAfter, before: closeDateBefore },
                    dealType,
                    priority,
                    ownerId
                },
                statistics: stats,
                hasMore: searchResults.total > deals.length,
                nextPageToken: searchResults.paging?.next?.after || null
            };

            // Update output parameters
            const outputParams = [...Params];
            const dealsParam = outputParams.find(p => p.Name === 'Deals');
            if (dealsParam) dealsParam.Value = deals;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${deals.length} deals out of ${searchResults.total} total`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error searching deals: ${errorMessage}`,
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
                Name: 'SearchTerm',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DealStage',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PipelineId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinAmount',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxAmount',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CloseDateAfter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CloseDateBefore',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DealType',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Priority',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OwnerId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeArchived',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'Limit',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'closedate'
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'DESC'
            },
            {
                Name: 'Deals',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
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
        return 'Searches for deals in HubSpot using multiple criteria with statistics';
    }
}