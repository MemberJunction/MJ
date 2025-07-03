import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get all deals associated with a company in HubSpot
 */
@RegisterClass(BaseAction, 'GetDealsByCompanyAction')
export class GetDealsByCompanyAction extends HubSpotBaseAction {
    /**
     * Get all deals for a specific company
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const companyId = this.getParamValue(Params, 'HubSpotCompanyId');
            const includeDetails = this.getParamValue(Params, 'IncludeDetails') ?? true;
            const groupByContact = this.getParamValue(Params, 'GroupByContact') ?? false;
            const onlyOpen = this.getParamValue(Params, 'OnlyOpen') ?? false;
            const sortBy = this.getParamValue(Params, 'SortBy') || 'closedate';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'DESC';
            
            if (!companyId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'HubSpot Company ID is required',
                    Params
                };
            }

            // First, get the company to verify it exists and get basic info
            let company;
            try {
                company = await this.makeHubSpotRequest<any>(
                    `objects/companies/${companyId}?properties=name,domain,industry,numberofemployees,annualrevenue`,
                    'GET',
                    undefined,
                    ContextUser
                );
            } catch (error) {
                return {
                    Success: false,
                    ResultCode: 'COMPANY_NOT_FOUND',
                    Message: `Company with ID ${companyId} not found`,
                    Params
                };
            }

            // Get associated deals
            const associations = await this.makeHubSpotRequest<any>(
                `objects/companies/${companyId}/associations/deals`,
                'GET',
                undefined,
                ContextUser
            );

            // Extract deal IDs
            const dealIds = associations.results.map((assoc: any) => assoc.id);

            if (dealIds.length === 0) {
                // No deals found
                const companyInfo = this.mapHubSpotProperties(company);
                const summary = {
                    companyId: companyId,
                    companyName: companyInfo.name,
                    companyDomain: companyInfo.domain,
                    totalDeals: 0,
                    openDeals: 0,
                    closedWonDeals: 0,
                    closedLostDeals: 0,
                    totalValue: 0,
                    wonValue: 0,
                    potentialValue: 0,
                    deals: []
                };

                const outputParams = [...Params];
                const dealsParam = outputParams.find(p => p.Name === 'Deals');
                if (dealsParam) dealsParam.Value = [];
                const summaryParam = outputParams.find(p => p.Name === 'Summary');
                if (summaryParam) summaryParam.Value = summary;

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `No deals found for company ${companyInfo.name || companyId}`,
                    Params: outputParams
                };
            }

            // Get deal details if requested
            let deals: any[] = [];
            if (includeDetails) {
                // Batch request for all deals
                const batchRequest = {
                    inputs: dealIds.map((id: string) => ({
                        id: id,
                        properties: [
                            'dealname', 'dealstage', 'pipeline', 'amount', 'closedate',
                            'dealtype', 'hs_priority', 'hubspot_owner_id', 'createdate',
                            'hs_lastmodifieddate', 'description', 'hs_is_closed',
                            'hs_is_closed_won', 'closed_won_reason', 'closed_lost_reason',
                            'hs_forecast_category', 'hs_forecast_probability'
                        ],
                        associations: groupByContact ? ['contacts'] : []
                    }))
                };

                const batchResponse = await this.makeHubSpotRequest<any>(
                    'objects/deals/batch/read',
                    'POST',
                    batchRequest,
                    ContextUser
                );

                deals = batchResponse.results.map((deal: any) => {
                    const dealData = this.mapHubSpotProperties(deal);
                    
                    // Add contact associations if requested
                    if (groupByContact && deal.associations?.contacts) {
                        dealData.contactIds = deal.associations.contacts.results.map((c: any) => c.id);
                    }
                    
                    return dealData;
                });
            } else {
                // Just return basic deal info
                deals = dealIds.map((id: string) => ({ id }));
            }

            // Filter open deals if requested
            if (onlyOpen && includeDetails) {
                deals = deals.filter(deal => !deal.hs_is_closed || deal.hs_is_closed === 'false');
            }

            // Sort deals
            if (includeDetails && sortBy) {
                deals.sort((a, b) => {
                    const aValue = a[sortBy] || '';
                    const bValue = b[sortBy] || '';
                    
                    if (sortOrder === 'ASC') {
                        return aValue > bValue ? 1 : -1;
                    } else {
                        return aValue < bValue ? 1 : -1;
                    }
                });
            }

            // Calculate summary statistics
            const companyInfo = this.mapHubSpotProperties(company);
            const stats = {
                totalDeals: deals.length,
                openDeals: 0,
                closedWonDeals: 0,
                closedLostDeals: 0,
                totalValue: 0,
                wonValue: 0,
                lostValue: 0,
                potentialValue: 0,
                forecastValue: 0,
                averageDealSize: 0,
                averageTimeToClose: 0,
                stageBreakdown: {} as Record<string, number>,
                pipelineBreakdown: {} as Record<string, number>,
                forecastCategories: {} as Record<string, number>,
                ownerBreakdown: {} as Record<string, number>
            };

            // Group by contact if requested
            let groupedDeals: Record<string, any[]> = {};
            
            // Calculate statistics if we have details
            if (includeDetails) {
                let totalDaysToClose = 0;
                let closedDealsCount = 0;

                deals.forEach((deal: any) => {
                    // Group by contact if requested
                    if (groupByContact && deal.contactIds) {
                        deal.contactIds.forEach((contactId: string) => {
                            if (!groupedDeals[contactId]) {
                                groupedDeals[contactId] = [];
                            }
                            groupedDeals[contactId].push(deal);
                        });
                    }

                    // Count deal states
                    if (deal.hs_is_closed_won === 'true') {
                        stats.closedWonDeals++;
                    } else if (deal.hs_is_closed === 'true') {
                        stats.closedLostDeals++;
                    } else {
                        stats.openDeals++;
                    }

                    // Sum values
                    if (deal.amount) {
                        const amount = parseFloat(deal.amount);
                        stats.totalValue += amount;
                        
                        if (deal.hs_is_closed_won === 'true') {
                            stats.wonValue += amount;
                        } else if (deal.hs_is_closed === 'true') {
                            stats.lostValue += amount;
                        } else {
                            stats.potentialValue += amount;
                            
                            // Calculate forecast value based on probability
                            if (deal.hs_forecast_probability) {
                                const probability = parseFloat(deal.hs_forecast_probability) / 100;
                                stats.forecastValue += amount * probability;
                            }
                        }
                    }

                    // Track stages and pipelines
                    if (deal.dealstage) {
                        stats.stageBreakdown[deal.dealstage] = (stats.stageBreakdown[deal.dealstage] || 0) + 1;
                    }
                    if (deal.pipeline) {
                        stats.pipelineBreakdown[deal.pipeline] = (stats.pipelineBreakdown[deal.pipeline] || 0) + 1;
                    }
                    if (deal.hs_forecast_category) {
                        stats.forecastCategories[deal.hs_forecast_category] = (stats.forecastCategories[deal.hs_forecast_category] || 0) + 1;
                    }
                    if (deal.hubspot_owner_id) {
                        stats.ownerBreakdown[deal.hubspot_owner_id] = (stats.ownerBreakdown[deal.hubspot_owner_id] || 0) + 1;
                    }

                    // Calculate time to close for closed deals
                    if (deal.hs_is_closed === 'true' && deal.createdate && deal.closedate) {
                        const createDate = new Date(deal.createdate);
                        const closeDate = new Date(deal.closedate);
                        const daysToClose = Math.floor((closeDate.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24));
                        totalDaysToClose += daysToClose;
                        closedDealsCount++;
                    }
                });

                // Calculate averages
                if (deals.length > 0) {
                    stats.averageDealSize = stats.totalValue / deals.length;
                }
                if (closedDealsCount > 0) {
                    stats.averageTimeToClose = totalDaysToClose / closedDealsCount;
                }
            }

            // Create summary
            const summary = {
                companyId: companyId,
                companyName: companyInfo.name,
                companyDomain: companyInfo.domain,
                companyIndustry: companyInfo.industry,
                companySize: companyInfo.numberofemployees,
                companyRevenue: companyInfo.annualrevenue,
                ...stats,
                winRate: stats.closedWonDeals > 0 ? (stats.closedWonDeals / (stats.closedWonDeals + stats.closedLostDeals)) * 100 : 0,
                dealsByContact: groupByContact ? groupedDeals : null
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
                Message: `Found ${deals.length} deals for company ${companyInfo.name || companyId}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error retrieving deals for company: ${errorMessage}`,
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
                Name: 'HubSpotCompanyId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeDetails',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'GroupByContact',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'OnlyOpen',
                Type: 'Input',
                Value: false
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
        return 'Retrieves all deals associated with a specific company including detailed statistics and forecasting';
    }
}