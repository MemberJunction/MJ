import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get all deals associated with a contact in HubSpot
 */
@RegisterClass(HubSpotBaseAction, 'GetDealsByContactAction')
export class GetDealsByContactAction extends HubSpotBaseAction {
    /**
     * Get all deals for a specific contact
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const contactId = this.getParamValue(Params, 'ContactId');
            const includeDetails = this.getParamValue(Params, 'IncludeDetails') ?? true;
            const onlyOpen = this.getParamValue(Params, 'OnlyOpen') ?? false;
            const sortBy = this.getParamValue(Params, 'SortBy') || 'closedate';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'DESC';
            
            if (!contactId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Contact ID is required',
                    Params
                };
            }

            // First, get the contact to verify it exists and get basic info
            let contact;
            try {
                contact = await this.makeHubSpotRequest<any>(
                    `objects/contacts/${contactId}?properties=firstname,lastname,email,company`,
                    'GET',
                    undefined,
                    ContextUser
                );
            } catch (error) {
                return {
                    Success: false,
                    ResultCode: 'CONTACT_NOT_FOUND',
                    Message: `Contact with ID ${contactId} not found`,
                    Params
                };
            }

            // Get associated deals
            const associations = await this.makeHubSpotRequest<any>(
                `objects/contacts/${contactId}/associations/deals`,
                'GET',
                undefined,
                ContextUser
            );

            // Extract deal IDs
            const dealIds = associations.results.map((assoc: any) => assoc.id);

            if (dealIds.length === 0) {
                // No deals found
                const contactInfo = this.mapHubSpotProperties(contact);
                const summary = {
                    contactId: contactId,
                    contactName: `${contactInfo.firstname || ''} ${contactInfo.lastname || ''}`.trim(),
                    contactEmail: contactInfo.email,
                    totalDeals: 0,
                    openDeals: 0,
                    closedWonDeals: 0,
                    closedLostDeals: 0,
                    totalValue: 0,
                    wonValue: 0,
                    averageDealSize: 0,
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
                    Message: `No deals found for contact ${contactInfo.email || contactId}`,
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
                            'hs_is_closed_won', 'closed_won_reason', 'closed_lost_reason'
                        ]
                    }))
                };

                const batchResponse = await this.makeHubSpotRequest<any>(
                    'objects/deals/batch/read',
                    'POST',
                    batchRequest,
                    ContextUser
                );

                deals = batchResponse.results.map((deal: any) => this.mapHubSpotProperties(deal));
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
            const contactInfo = this.mapHubSpotProperties(contact);
            const stats = {
                totalDeals: deals.length,
                openDeals: 0,
                closedWonDeals: 0,
                closedLostDeals: 0,
                totalValue: 0,
                wonValue: 0,
                lostValue: 0,
                openValue: 0,
                averageDealSize: 0,
                averageTimeToClose: 0,
                stageBreakdown: {} as Record<string, number>,
                pipelineBreakdown: {} as Record<string, number>
            };

            // Calculate statistics if we have details
            if (includeDetails) {
                let totalDaysToClose = 0;
                let closedDealsCount = 0;

                deals.forEach((deal: any) => {
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
                            stats.openValue += amount;
                        }
                    }

                    // Track stages and pipelines
                    if (deal.dealstage) {
                        stats.stageBreakdown[deal.dealstage] = (stats.stageBreakdown[deal.dealstage] || 0) + 1;
                    }
                    if (deal.pipeline) {
                        stats.pipelineBreakdown[deal.pipeline] = (stats.pipelineBreakdown[deal.pipeline] || 0) + 1;
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
                contactId: contactId,
                contactName: `${contactInfo.firstname || ''} ${contactInfo.lastname || ''}`.trim(),
                contactEmail: contactInfo.email,
                contactCompany: contactInfo.company,
                ...stats,
                winRate: stats.closedWonDeals > 0 ? (stats.closedWonDeals / (stats.closedWonDeals + stats.closedLostDeals)) * 100 : 0
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
                Message: `Found ${deals.length} deals for contact ${contactInfo.email || contactId}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error retrieving deals for contact: ${errorMessage}`,
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
                Name: 'ContactId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeDetails',
                Type: 'Input',
                Value: true
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
        return 'Retrieves all deals associated with a specific contact including detailed statistics';
    }
}