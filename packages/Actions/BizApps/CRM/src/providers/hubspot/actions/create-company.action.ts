import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to create a new company in HubSpot
 */
@RegisterClass(HubSpotBaseAction, 'CreateCompanyAction')
export class CreateCompanyAction extends HubSpotBaseAction {
    /**
     * Create a new company
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
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
            const lifecycleStage = this.getParamValue(Params, 'LifecycleStage') || 'lead';
            const ownerId = this.getParamValue(Params, 'OwnerId');
            const customProperties = this.getParamValue(Params, 'CustomProperties');
            const associateWithContactIds = this.getParamValue(Params, 'AssociateWithContactIds');
            
            if (!name) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Company name is required',
                    Params
                };
            }

            // Prepare company properties
            const properties: any = {
                name: name,
                lifecyclestage: lifecycleStage
            };

            // Add optional fields
            if (domain) properties.domain = domain;
            if (industry) properties.industry = industry;
            if (description) properties.description = description;
            if (phone) properties.phone = this.formatPhoneNumber(phone);
            if (website) properties.website = website;
            if (address) properties.address = address;
            if (city) properties.city = city;
            if (state) properties.state = state;
            if (zip) properties.zip = zip;
            if (country) properties.country = country;
            if (numberOfEmployees) properties.numberofemployees = numberOfEmployees;
            if (annualRevenue) properties.annualrevenue = annualRevenue;
            if (type) properties.type = type;
            if (ownerId) properties.hubspot_owner_id = ownerId;

            // Add custom properties if provided
            if (customProperties && typeof customProperties === 'object') {
                Object.assign(properties, customProperties);
            }

            // Create company
            const newCompany = await this.makeHubSpotRequest<any>(
                'objects/companies',
                'POST',
                { properties },
                ContextUser
            );

            // Format company details
            const companyDetails = this.mapHubSpotProperties(newCompany);

            // Associate with contacts if requested
            let associationResults = null;
            if (associateWithContactIds && Array.isArray(associateWithContactIds)) {
                associationResults = [];
                for (const contactId of associateWithContactIds) {
                    try {
                        await this.associateObjects(
                            'companies',
                            newCompany.id,
                            'contacts',
                            contactId,
                            undefined,
                            ContextUser
                        );
                        associationResults.push({
                            success: true,
                            contactId: contactId,
                            message: 'Successfully associated'
                        });
                    } catch (assocError) {
                        associationResults.push({
                            success: false,
                            contactId: contactId,
                            error: assocError instanceof Error ? assocError.message : 'Association failed'
                        });
                    }
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
                createdAt: companyDetails.createdAt,
                portalUrl: `https://app.hubspot.com/contacts/${companyDetails.id}`,
                associationResults: associationResults
            };

            // Update output parameters
            const outputParams = [...Params];
            const companyDetailsParam = outputParams.find(p => p.Name === 'CompanyDetails');
            if (companyDetailsParam) companyDetailsParam.Value = companyDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created company ${companyDetails.name}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for duplicate company error
            if (errorMessage.includes('Company already exists') || errorMessage.includes('CONFLICT')) {
                return {
                    Success: false,
                    ResultCode: 'DUPLICATE_COMPANY',
                    Message: `Company with name ${this.getParamValue(Params, 'Name')} may already exist`,
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error creating company: ${errorMessage}`,
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
                Value: 'lead'
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
                Name: 'AssociateWithContactIds',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CompanyDetails',
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
        return 'Creates a new company in HubSpot with optional contact associations';
    }
}