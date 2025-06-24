import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get a contact from HubSpot by ID or email
 */
@RegisterClass(HubSpotBaseAction, 'GetContactAction')
export class GetContactAction extends HubSpotBaseAction {
    /**
     * Get a contact by ID or email
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const contactId = this.getParamValue(Params, 'ContactId');
            const email = this.getParamValue(Params, 'Email');
            const includeProperties = this.getParamValue(Params, 'IncludeProperties');
            const includeAssociations = this.getParamValue(Params, 'IncludeAssociations');
            const includeMemberships = this.getParamValue(Params, 'IncludeMemberships');
            
            if (!contactId && !email) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Either ContactId or Email is required',
                    Params
                };
            }

            if (contactId && email) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Provide either ContactId or Email, not both',
                    Params
                };
            }

            let contact: any;

            if (contactId) {
                // Get by ID
                const queryParams = new URLSearchParams();
                
                // Add properties to include
                if (includeProperties && Array.isArray(includeProperties)) {
                    queryParams.set('properties', includeProperties.join(','));
                }
                
                // Add associations to include
                if (includeAssociations && Array.isArray(includeAssociations)) {
                    queryParams.set('associations', includeAssociations.join(','));
                }

                const endpoint = `objects/contacts/${contactId}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
                contact = await this.makeHubSpotRequest<any>(
                    endpoint,
                    'GET',
                    undefined,
                    ContextUser
                );
            } else {
                // Search by email
                const searchResults = await this.searchHubSpotObjects<any>(
                    'contacts',
                    [{
                        propertyName: 'email',
                        operator: 'EQ',
                        value: email
                    }],
                    includeProperties,
                    ContextUser
                );

                if (searchResults.length === 0) {
                    return {
                        Success: false,
                        ResultCode: 'CONTACT_NOT_FOUND',
                        Message: `No contact found with email ${email}`,
                        Params
                    };
                }

                contact = searchResults[0];
            }

            // Format contact details
            const contactDetails = this.mapHubSpotProperties(contact);

            // Get associations if requested
            let associations = null;
            if (includeAssociations && contact.associations) {
                associations = contact.associations;
            }

            // Get list memberships if requested
            let memberships = null;
            if (includeMemberships) {
                try {
                    const membershipResponse = await this.makeHubSpotRequest<any>(
                        `objects/contacts/${contact.id}/memberships`,
                        'GET',
                        undefined,
                        ContextUser
                    );
                    memberships = membershipResponse.results || [];
                } catch (membershipError) {
                    // Non-critical error, continue without memberships
                    memberships = {
                        error: 'Failed to retrieve memberships',
                        message: membershipError instanceof Error ? membershipError.message : 'Unknown error'
                    };
                }
            }

            // Create summary
            const summary = {
                contactId: contactDetails.id,
                email: contactDetails.email,
                fullName: `${contactDetails.firstname || ''} ${contactDetails.lastname || ''}`.trim(),
                company: contactDetails.company,
                lifecycleStage: contactDetails.lifecyclestage,
                leadStatus: contactDetails.lead_status,
                createdAt: contactDetails.createdAt,
                updatedAt: contactDetails.updatedAt,
                isArchived: contactDetails.archived,
                portalUrl: `https://app.hubspot.com/contacts/${contactDetails.id}`,
                hasAssociations: associations ? Object.keys(associations).length > 0 : false,
                membershipCount: Array.isArray(memberships) ? memberships.length : 0
            };

            // Update output parameters
            const outputParams = [...Params];
            const contactDetailsParam = outputParams.find(p => p.Name === 'ContactDetails');
            if (contactDetailsParam) contactDetailsParam.Value = contactDetails;
            const associationsParam = outputParams.find(p => p.Name === 'Associations');
            if (associationsParam) associationsParam.Value = associations;
            const membershipsParam = outputParams.find(p => p.Name === 'Memberships');
            if (membershipsParam) membershipsParam.Value = memberships;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved contact ${contactDetails.email || contactDetails.id}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for not found error
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return {
                    Success: false,
                    ResultCode: 'CONTACT_NOT_FOUND',
                    Message: `Contact not found`,
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error retrieving contact: ${errorMessage}`,
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
                Name: 'Email',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeProperties',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeAssociations',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeMemberships',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'ContactDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Associations',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Memberships',
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
        return 'Retrieves a contact from HubSpot by ID or email with optional associations and memberships';
    }
}