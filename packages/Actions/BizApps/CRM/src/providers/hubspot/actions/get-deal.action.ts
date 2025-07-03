import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to retrieve deal details from HubSpot
 */
@RegisterClass(BaseAction, 'GetDealAction')
export class GetDealAction extends HubSpotBaseAction {
    /**
     * Get deal details by ID
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const dealId = this.getParamValue(Params, 'DealId');
            const includeAssociations = this.getParamValue(Params, 'IncludeAssociations') ?? true;
            const includeTimeline = this.getParamValue(Params, 'IncludeTimeline') ?? false;
            
            if (!dealId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Deal ID is required',
                    Params
                };
            }

            // Build query parameters
            const queryParams: string[] = [];
            
            // Always include all properties
            queryParams.push('properties=*');
            
            // Add associations if requested
            if (includeAssociations) {
                queryParams.push('associations=contacts,companies,line_items,quotes');
            }

            const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

            // Get deal details
            const deal = await this.makeHubSpotRequest<any>(
                `objects/deals/${dealId}${queryString}`,
                'GET',
                undefined,
                ContextUser
            );

            // Format deal details
            const dealDetails = this.mapHubSpotProperties(deal);

            // Process associations if included
            let associations = null;
            if (includeAssociations && deal.associations) {
                associations = {
                    contacts: [],
                    companies: [],
                    lineItems: [],
                    quotes: []
                };

                // Process contact associations
                if (deal.associations.contacts) {
                    associations.contacts = deal.associations.contacts.results.map((assoc: any) => ({
                        id: assoc.id,
                        type: assoc.type
                    }));
                }

                // Process company associations
                if (deal.associations.companies) {
                    associations.companies = deal.associations.companies.results.map((assoc: any) => ({
                        id: assoc.id,
                        type: assoc.type
                    }));
                }

                // Process line item associations
                if (deal.associations.line_items) {
                    associations.lineItems = deal.associations.line_items.results.map((assoc: any) => ({
                        id: assoc.id,
                        type: assoc.type
                    }));
                }

                // Process quote associations
                if (deal.associations.quotes) {
                    associations.quotes = deal.associations.quotes.results.map((assoc: any) => ({
                        id: assoc.id,
                        type: assoc.type
                    }));
                }
            }

            // Get timeline events if requested
            let timeline = null;
            if (includeTimeline) {
                try {
                    const timelineResponse = await this.makeHubSpotRequest<any>(
                        `objects/deals/${dealId}/timeline`,
                        'GET',
                        undefined,
                        ContextUser
                    );
                    
                    timeline = timelineResponse.results.map((event: any) => ({
                        id: event.id,
                        eventType: event.eventType,
                        occurredAt: event.occurredAt,
                        properties: event.properties
                    }));
                } catch (timelineError) {
                    // Timeline API might not be available for all accounts
                    console.warn('Unable to fetch timeline:', timelineError);
                }
            }

            // Calculate deal metrics
            const metrics = {
                daysOpen: null as number | null,
                daysInCurrentStage: null as number | null,
                isOverdue: false,
                probability: null as number | null
            };

            // Calculate days open
            if (dealDetails.createdAt) {
                const createdDate = new Date(dealDetails.createdAt);
                const now = new Date();
                metrics.daysOpen = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
            }

            // Check if overdue
            if (dealDetails.closedate) {
                const closeDate = new Date(dealDetails.closedate);
                const now = new Date();
                metrics.isOverdue = closeDate < now && !['closedwon', 'closedlost'].includes(dealDetails.dealstage?.toLowerCase() || '');
            }

            // Create summary
            const summary = {
                dealId: dealDetails.id,
                dealName: dealDetails.dealname,
                dealStage: dealDetails.dealstage,
                pipeline: dealDetails.pipeline,
                amount: dealDetails.amount,
                closeDate: dealDetails.closedate,
                dealType: dealDetails.dealtype,
                priority: dealDetails.hs_priority,
                owner: dealDetails.hubspot_owner_id,
                createdAt: dealDetails.createdAt,
                updatedAt: dealDetails.updatedAt,
                portalUrl: `https://app.hubspot.com/contacts/${this.getParamValue(Params, 'CompanyID')}/deal/${dealDetails.id}`,
                associations: associations,
                timeline: timeline,
                metrics: metrics
            };

            // Update output parameters
            const outputParams = [...Params];
            const dealDetailsParam = outputParams.find(p => p.Name === 'DealDetails');
            if (dealDetailsParam) dealDetailsParam.Value = dealDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved deal "${dealDetails.dealname}"`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for not found error
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return {
                    Success: false,
                    ResultCode: 'DEAL_NOT_FOUND',
                    Message: `Deal with ID ${this.getParamValue(Params, 'DealId')} not found`,
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error retrieving deal: ${errorMessage}`,
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
                Name: 'DealId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeAssociations',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeTimeline',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'DealDetails',
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
        return 'Retrieves complete deal information from HubSpot including associations and timeline';
    }
}