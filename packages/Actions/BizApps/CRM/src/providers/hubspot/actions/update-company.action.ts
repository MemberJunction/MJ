import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to update an existing company in HubSpot
 */
@RegisterClass(BaseAction, 'UpdateCompanyAction')
export class UpdateCompanyAction extends HubSpotBaseAction {
    /**
     * Update an existing company
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const companyId = this.getParamValue(Params, 'CompanyId');
            const name = this.getParamValue(Params, 'Name');
            const domain = this.getParamValue(Params, 'Domain');
            const industry = this.getParamValue(Params, 'Industry');
            const description = this.getParamValue(Params, 'Description');
            const phone = this.getParamValue(Params, 'Phone');
            const website = this.getParamValue(Params, 'Website');
            const address = this.getParamValue(Params, 'Address');
            const city = this.getParamValue(Params, 'City');
            const state = this.getParamValue(Params, 'State');
            const zip = this.getParamValue(Params, 'Zip');
            const country = this.getParamValue(Params, 'Country');
            const numberOfEmployees = this.getParamValue(Params, 'NumberOfEmployees');
            const annualRevenue = this.getParamValue(Params, 'AnnualRevenue');
            const type = this.getParamValue(Params, 'Type');
            const lifecycleStage = this.getParamValue(Params, 'LifecycleStage');
            const ownerId = this.getParamValue(Params, 'OwnerId');
            const customProperties = this.getParamValue(Params, 'CustomProperties');
            
            if (!companyId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'CompanyId is required',
                    Params
                };
            }

            // Prepare update properties - only include fields that have values
            const properties: any = {};

            // Add fields only if they have values (not null or undefined)
            if (name != null) properties.name = name;
            if (domain != null) properties.domain = domain;
            if (industry != null) properties.industry = industry;
            if (description != null) properties.description = description;
            if (phone != null) properties.phone = this.formatPhoneNumber(phone);
            if (website != null) properties.website = website;
            if (address != null) properties.address = address;
            if (city != null) properties.city = city;
            if (state != null) properties.state = state;
            if (zip != null) properties.zip = zip;
            if (country != null) properties.country = country;
            if (numberOfEmployees != null) properties.numberofemployees = numberOfEmployees;
            if (annualRevenue != null) properties.annualrevenue = annualRevenue;
            if (type != null) properties.type = type;
            if (lifecycleStage != null) properties.lifecyclestage = lifecycleStage;
            if (ownerId != null) properties.hubspot_owner_id = ownerId;

            // Add custom properties if provided
            if (customProperties && typeof customProperties === 'object') {
                Object.assign(properties, customProperties);
            }

            // Check if there are any properties to update
            if (Object.keys(properties).length === 0) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'No properties provided to update',
                    Params
                };
            }

            // Get current company data
            const currentCompany = await this.makeHubSpotRequest<any>(
                `objects/companies/${companyId}`,
                'GET',
                null,
                ContextUser
            );

            // Update company
            const updatedCompany = await this.makeHubSpotRequest<any>(
                `objects/companies/${companyId}`,
                'PATCH',
                { properties },
                ContextUser
            );

            // Format company details
            const companyDetails = this.mapHubSpotProperties(updatedCompany);
            const previousDetails = this.mapHubSpotProperties(currentCompany);

            // Create summary of changes
            const changes: any = {};
            for (const key of Object.keys(properties)) {
                const oldValue = previousDetails[key];
                const newValue = companyDetails[key];
                if (oldValue !== newValue) {
                    changes[key] = {
                        from: oldValue,
                        to: newValue
                    };
                }
            }

            // Create summary
            const summary = {
                companyId: companyDetails.id,
                name: companyDetails.name,
                domain: companyDetails.domain,
                industry: companyDetails.industry,
                lifecycleStage: companyDetails.lifecyclestage,
                numberOfEmployees: companyDetails.numberofemployees,
                annualRevenue: companyDetails.annualrevenue,
                updatedAt: companyDetails.updatedAt,
                portalUrl: `https://app.hubspot.com/contacts/${companyDetails.id}`,
                changes: changes,
                fieldsUpdated: Object.keys(changes).length
            };

            // Update output parameters
            const outputParams = [...Params];
            const companyDetailsParam = outputParams.find(p => p.Name === 'CompanyDetails');
            if (companyDetailsParam) companyDetailsParam.Value = companyDetails;
            const previousDetailsParam = outputParams.find(p => p.Name === 'PreviousDetails');
            if (previousDetailsParam) previousDetailsParam.Value = previousDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully updated company ${companyDetails.name}. Updated ${summary.fieldsUpdated} field(s)`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for not found error
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `Company with ID ${this.getParamValue(Params, 'CompanyId')} not found`,
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error updating company: ${errorMessage}`,
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
                Name: 'CompanyId',
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
                Name: 'Description',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Phone',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Website',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Address',
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
                Name: 'Zip',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Country',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'NumberOfEmployees',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'AnnualRevenue',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Type',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'LifecycleStage',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OwnerId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CustomProperties',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CompanyDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'PreviousDetails',
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
        return 'Updates an existing company in HubSpot with provided properties';
    }
}