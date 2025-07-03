import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to create a new deal in HubSpot
 */
@RegisterClass(BaseAction, 'CreateDealAction')
export class CreateDealAction extends HubSpotBaseAction {
    /**
     * Create a new deal
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const dealName = this.getParamValue(Params, 'DealName');
            const dealStage = this.getParamValue(Params, 'DealStage');
            const pipelineId = this.getParamValue(Params, 'PipelineId');
            const amount = this.getParamValue(Params, 'Amount');
            const closeDate = this.getParamValue(Params, 'CloseDate');
            const dealType = this.getParamValue(Params, 'DealType');
            const priority = this.getParamValue(Params, 'Priority');
            const description = this.getParamValue(Params, 'Description');
            const customProperties = this.getParamValue(Params, 'CustomProperties');
            const associateWithContactIds = this.getParamValue(Params, 'AssociateWithContactIds');
            const associateWithCompanyIds = this.getParamValue(Params, 'AssociateWithCompanyIds');
            
            if (!dealName) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Deal name is required',
                    Params
                };
            }

            // Prepare deal properties
            const properties: any = {
                dealname: dealName
            };

            // Add optional fields
            if (dealStage) properties.dealstage = dealStage;
            if (pipelineId) properties.pipeline = pipelineId;
            if (amount) properties.amount = parseFloat(amount.toString());
            if (closeDate) {
                // Convert to milliseconds timestamp if needed
                const closeDateMs = new Date(closeDate).getTime();
                properties.closedate = closeDateMs;
            }
            if (dealType) properties.dealtype = dealType;
            if (priority) properties.hs_priority = priority;
            if (description) properties.description = description;

            // Add custom properties if provided
            if (customProperties && typeof customProperties === 'object') {
                Object.assign(properties, customProperties);
            }

            // Create deal
            const newDeal = await this.makeHubSpotRequest<any>(
                'objects/deals',
                'POST',
                { properties },
                ContextUser
            );

            // Format deal details
            const dealDetails = this.mapHubSpotProperties(newDeal);

            // Associate with contacts and companies
            const associations: any[] = [];
            
            // Associate with contacts
            if (associateWithContactIds) {
                const contactIds = Array.isArray(associateWithContactIds) 
                    ? associateWithContactIds 
                    : associateWithContactIds.split(',').map((id: string) => id.trim());
                
                for (const contactId of contactIds) {
                    try {
                        await this.associateObjects(
                            'deals',
                            newDeal.id,
                            'contacts',
                            contactId,
                            undefined,
                            ContextUser
                        );
                        associations.push({
                            type: 'contact',
                            id: contactId,
                            success: true
                        });
                    } catch (error) {
                        associations.push({
                            type: 'contact',
                            id: contactId,
                            success: false,
                            error: error instanceof Error ? error.message : 'Association failed'
                        });
                    }
                }
            }

            // Associate with companies
            if (associateWithCompanyIds) {
                const companyIds = Array.isArray(associateWithCompanyIds) 
                    ? associateWithCompanyIds 
                    : associateWithCompanyIds.split(',').map((id: string) => id.trim());
                
                for (const companyId of companyIds) {
                    try {
                        await this.associateObjects(
                            'deals',
                            newDeal.id,
                            'companies',
                            companyId,
                            undefined,
                            ContextUser
                        );
                        associations.push({
                            type: 'company',
                            id: companyId,
                            success: true
                        });
                    } catch (error) {
                        associations.push({
                            type: 'company',
                            id: companyId,
                            success: false,
                            error: error instanceof Error ? error.message : 'Association failed'
                        });
                    }
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
                createdAt: dealDetails.createdAt,
                portalUrl: `https://app.hubspot.com/contacts/${this.getParamValue(Params, 'CompanyID')}/deal/${dealDetails.id}`,
                associations: associations
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
                Message: `Successfully created deal "${dealDetails.dealname}"`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error creating deal: ${errorMessage}`,
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
                Name: 'CustomProperties',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'AssociateWithContactIds',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'AssociateWithCompanyIds',
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
        return 'Creates a new deal in HubSpot with optional contact and company associations';
    }
}