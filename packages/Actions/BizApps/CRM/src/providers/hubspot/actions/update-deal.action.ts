import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to update an existing deal in HubSpot
 */
@RegisterClass(BaseAction, 'UpdateDealAction')
export class UpdateDealAction extends HubSpotBaseAction {
    /**
     * Update a deal's information
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const dealId = this.getParamValue(Params, 'DealId');
            const dealName = this.getParamValue(Params, 'DealName');
            const dealStage = this.getParamValue(Params, 'DealStage');
            const pipelineId = this.getParamValue(Params, 'PipelineId');
            const amount = this.getParamValue(Params, 'Amount');
            const closeDate = this.getParamValue(Params, 'CloseDate');
            const dealType = this.getParamValue(Params, 'DealType');
            const priority = this.getParamValue(Params, 'Priority');
            const description = this.getParamValue(Params, 'Description');
            const closedWonReason = this.getParamValue(Params, 'ClosedWonReason');
            const closedLostReason = this.getParamValue(Params, 'ClosedLostReason');
            const customProperties = this.getParamValue(Params, 'CustomProperties');
            
            if (!dealId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Deal ID is required',
                    Params
                };
            }

            // Get current deal details first
            let currentDeal;
            try {
                currentDeal = await this.makeHubSpotRequest<any>(
                    `objects/deals/${dealId}`,
                    'GET',
                    undefined,
                    ContextUser
                );
            } catch (error) {
                return {
                    Success: false,
                    ResultCode: 'DEAL_NOT_FOUND',
                    Message: `Deal with ID ${dealId} not found`,
                    Params
                };
            }

            // Prepare update properties
            const properties: any = {};

            // Add fields that have been provided
            if (dealName !== null && dealName !== undefined) properties.dealname = dealName;
            if (dealStage !== null && dealStage !== undefined) properties.dealstage = dealStage;
            if (pipelineId !== null && pipelineId !== undefined) properties.pipeline = pipelineId;
            if (amount !== null && amount !== undefined) properties.amount = parseFloat(amount.toString());
            if (closeDate !== null && closeDate !== undefined) {
                const closeDateMs = new Date(closeDate).getTime();
                properties.closedate = closeDateMs;
            }
            if (dealType !== null && dealType !== undefined) properties.dealtype = dealType;
            if (priority !== null && priority !== undefined) properties.hs_priority = priority;
            if (description !== null && description !== undefined) properties.description = description;
            if (closedWonReason !== null && closedWonReason !== undefined) properties.closed_won_reason = closedWonReason;
            if (closedLostReason !== null && closedLostReason !== undefined) properties.closed_lost_reason = closedLostReason;

            // Add custom properties if provided
            if (customProperties && typeof customProperties === 'object') {
                Object.assign(properties, customProperties);
            }

            // Check if there are any properties to update
            if (Object.keys(properties).length === 0) {
                return {
                    Success: false,
                    ResultCode: 'NO_UPDATES',
                    Message: 'No properties provided to update',
                    Params
                };
            }

            // Update the deal
            const updatedDeal = await this.makeHubSpotRequest<any>(
                `objects/deals/${dealId}`,
                'PATCH',
                { properties },
                ContextUser
            );

            // Format deal details
            const dealDetails = this.mapHubSpotProperties(updatedDeal);
            const previousDetails = this.mapHubSpotProperties(currentDeal);

            // Create change summary
            const changes: any[] = [];
            for (const key in properties) {
                const fieldName = this.getHubSpotFieldDisplayName(key);
                const oldValue = previousDetails[key];
                const newValue = properties[key];
                if (oldValue !== newValue) {
                    changes.push({
                        field: fieldName,
                        oldValue: oldValue,
                        newValue: newValue
                    });
                }
            }

            // Create summary
            const summary = {
                dealId: dealDetails.id,
                dealName: dealDetails.dealname,
                dealStage: dealDetails.dealstage,
                pipeline: dealDetails.pipeline,
                amount: dealDetails.amount,
                closeDate: dealDetails.closedate,
                updatedAt: dealDetails.updatedAt,
                portalUrl: `https://app.hubspot.com/contacts/${this.getParamValue(Params, 'CompanyID')}/deal/${dealDetails.id}`,
                changes: changes,
                totalChanges: changes.length
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
                Message: `Successfully updated deal "${dealDetails.dealname}" with ${changes.length} changes`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error updating deal: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get display name for HubSpot field
     */
    private getHubSpotFieldDisplayName(fieldKey: string): string {
        const fieldMap: Record<string, string> = {
            'dealname': 'Deal Name',
            'dealstage': 'Deal Stage',
            'pipeline': 'Pipeline',
            'amount': 'Amount',
            'closedate': 'Close Date',
            'dealtype': 'Deal Type',
            'hs_priority': 'Priority',
            'description': 'Description',
            'closed_won_reason': 'Closed Won Reason',
            'closed_lost_reason': 'Closed Lost Reason'
        };
        return fieldMap[fieldKey] || fieldKey;
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
                Name: 'DealName',
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
                Name: 'Amount',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CloseDate',
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
                Name: 'Description',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ClosedWonReason',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ClosedLostReason',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CustomProperties',
                Type: 'Input',
                Value: null
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
        return 'Updates an existing deal in HubSpot with change tracking';
    }
}