import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to create a new contact in HubSpot
 */
@RegisterClass(HubSpotBaseAction, 'CreateContactAction')
export class CreateContactAction extends HubSpotBaseAction {
    /**
     * Create a new contact
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const email = this.getParamValue(Params, 'Email');
            const firstName = this.getParamValue(Params, 'FirstName');
            const lastName = this.getParamValue(Params, 'LastName');
            const phone = this.getParamValue(Params, 'Phone');
            const company = this.getParamValue(Params, 'Company');
            const jobTitle = this.getParamValue(Params, 'JobTitle');
            const lifecycleStage = this.getParamValue(Params, 'LifecycleStage') || 'lead';
            const leadStatus = this.getParamValue(Params, 'LeadStatus');
            const website = this.getParamValue(Params, 'Website');
            const address = this.getParamValue(Params, 'Address');
            const city = this.getParamValue(Params, 'City');
            const state = this.getParamValue(Params, 'State');
            const zip = this.getParamValue(Params, 'Zip');
            const country = this.getParamValue(Params, 'Country');
            const customProperties = this.getParamValue(Params, 'CustomProperties');
            const associateWithCompanyId = this.getParamValue(Params, 'AssociateWithCompanyId');
            
            if (!email) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Email is required',
                    Params
                };
            }

            // Validate email format
            if (!this.isValidEmail(email)) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Invalid email format',
                    Params
                };
            }

            // Prepare contact properties
            const properties: any = {
                email: email,
                lifecyclestage: lifecycleStage
            };

            // Add optional fields
            if (firstName) properties.firstname = firstName;
            if (lastName) properties.lastname = lastName;
            if (phone) properties.phone = this.formatPhoneNumber(phone);
            if (company) properties.company = company;
            if (jobTitle) properties.jobtitle = jobTitle;
            if (leadStatus) properties.lead_status = leadStatus;
            if (website) properties.website = website;
            if (address) properties.address = address;
            if (city) properties.city = city;
            if (state) properties.state = state;
            if (zip) properties.zip = zip;
            if (country) properties.country = country;

            // Add custom properties if provided
            if (customProperties && typeof customProperties === 'object') {
                Object.assign(properties, customProperties);
            }

            // Create contact
            const newContact = await this.makeHubSpotRequest<any>(
                'objects/contacts',
                'POST',
                { properties },
                ContextUser
            );

            // Format contact details
            const contactDetails = this.mapHubSpotProperties(newContact);

            // Associate with company if requested
            let associationResult = null;
            if (associateWithCompanyId) {
                try {
                    await this.associateObjects(
                        'contacts',
                        newContact.id,
                        'companies',
                        associateWithCompanyId,
                        undefined,
                        ContextUser
                    );
                    associationResult = {
                        success: true,
                        companyId: associateWithCompanyId,
                        message: 'Successfully associated contact with company'
                    };
                } catch (assocError) {
                    associationResult = {
                        success: false,
                        companyId: associateWithCompanyId,
                        error: assocError instanceof Error ? assocError.message : 'Association failed'
                    };
                }
            }

            // Create summary
            const summary = {
                contactId: contactDetails.id,
                email: contactDetails.email,
                fullName: `${contactDetails.firstname || ''} ${contactDetails.lastname || ''}`.trim(),
                lifecycleStage: contactDetails.lifecyclestage,
                company: contactDetails.company,
                createdAt: contactDetails.createdAt,
                portalUrl: `https://app.hubspot.com/contacts/${contactDetails.id}`,
                associationResult: associationResult
            };

            // Update output parameters
            const outputParams = [...Params];
            const contactDetailsParam = outputParams.find(p => p.Name === 'ContactDetails');
            if (contactDetailsParam) contactDetailsParam.Value = contactDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created contact ${contactDetails.email}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for duplicate contact error
            if (errorMessage.includes('Contact already exists') || errorMessage.includes('CONFLICT')) {
                return {
                    Success: false,
                    ResultCode: 'DUPLICATE_CONTACT',
                    Message: `Contact with email ${this.getParamValue(Params, 'Email')} already exists`,
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error creating contact: ${errorMessage}`,
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
                Name: 'Email',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'FirstName',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'LastName',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Phone',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Company',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'JobTitle',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'LifecycleStage',
                Type: 'Input',
                Value: 'lead'
            },
            {
                Name: 'LeadStatus',
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
                Name: 'CustomProperties',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'AssociateWithCompanyId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ContactDetails',
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
        return 'Creates a new contact in HubSpot with optional company association';
    }
}