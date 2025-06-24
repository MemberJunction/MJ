import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to update an existing contact in HubSpot
 */
@RegisterClass(HubSpotBaseAction, 'UpdateContactAction')
export class UpdateContactAction extends HubSpotBaseAction {
    /**
     * Update an existing contact
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const contactId = this.getParamValue(Params, 'ContactId');
            const email = this.getParamValue(Params, 'Email');
            const firstName = this.getParamValue(Params, 'FirstName');
            const lastName = this.getParamValue(Params, 'LastName');
            const phone = this.getParamValue(Params, 'Phone');
            const company = this.getParamValue(Params, 'Company');
            const jobTitle = this.getParamValue(Params, 'JobTitle');
            const lifecycleStage = this.getParamValue(Params, 'LifecycleStage');
            const leadStatus = this.getParamValue(Params, 'LeadStatus');
            const website = this.getParamValue(Params, 'Website');
            const address = this.getParamValue(Params, 'Address');
            const city = this.getParamValue(Params, 'City');
            const state = this.getParamValue(Params, 'State');
            const zip = this.getParamValue(Params, 'Zip');
            const country = this.getParamValue(Params, 'Country');
            const customProperties = this.getParamValue(Params, 'CustomProperties');
            const clearFields = this.getParamValue(Params, 'ClearFields');
            
            if (!contactId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'ContactId is required',
                    Params
                };
            }

            // Prepare properties to update
            const properties: any = {};

            // Add fields to update (only include if provided)
            if (email !== undefined && email !== null) {
                if (!this.isValidEmail(email)) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: 'Invalid email format',
                        Params
                    };
                }
                properties.email = email;
            }
            if (firstName !== undefined && firstName !== null) properties.firstname = firstName;
            if (lastName !== undefined && lastName !== null) properties.lastname = lastName;
            if (phone !== undefined && phone !== null) properties.phone = this.formatPhoneNumber(phone);
            if (company !== undefined && company !== null) properties.company = company;
            if (jobTitle !== undefined && jobTitle !== null) properties.jobtitle = jobTitle;
            if (lifecycleStage !== undefined && lifecycleStage !== null) properties.lifecyclestage = lifecycleStage;
            if (leadStatus !== undefined && leadStatus !== null) properties.lead_status = leadStatus;
            if (website !== undefined && website !== null) properties.website = website;
            if (address !== undefined && address !== null) properties.address = address;
            if (city !== undefined && city !== null) properties.city = city;
            if (state !== undefined && state !== null) properties.state = state;
            if (zip !== undefined && zip !== null) properties.zip = zip;
            if (country !== undefined && country !== null) properties.country = country;

            // Add custom properties if provided
            if (customProperties && typeof customProperties === 'object') {
                Object.assign(properties, customProperties);
            }

            // Clear specific fields if requested
            if (clearFields && Array.isArray(clearFields)) {
                for (const field of clearFields) {
                    properties[field] = '';
                }
            }

            // Check if there are any properties to update
            if (Object.keys(properties).length === 0) {
                return {
                    Success: false,
                    ResultCode: 'NO_CHANGES',
                    Message: 'No properties provided to update',
                    Params
                };
            }

            // Get current contact data first
            const currentContact = await this.makeHubSpotRequest<any>(
                `objects/contacts/${contactId}`,
                'GET',
                undefined,
                ContextUser
            );

            // Store before state
            const beforeState = this.mapHubSpotProperties(currentContact);

            // Update contact
            const updatedContact = await this.makeHubSpotRequest<any>(
                `objects/contacts/${contactId}`,
                'PATCH',
                { properties },
                ContextUser
            );

            // Format contact details
            const afterState = this.mapHubSpotProperties(updatedContact);

            // Create change summary
            const changes: any[] = [];
            for (const key in properties) {
                if (beforeState[key] !== afterState[key]) {
                    changes.push({
                        field: key,
                        oldValue: beforeState[key],
                        newValue: afterState[key]
                    });
                }
            }

            // Create summary
            const summary = {
                contactId: afterState.id,
                email: afterState.email,
                fullName: `${afterState.firstname || ''} ${afterState.lastname || ''}`.trim(),
                fieldsUpdated: Object.keys(properties).length,
                actualChanges: changes.length,
                changes: changes,
                updatedAt: afterState.updatedAt,
                portalUrl: `https://app.hubspot.com/contacts/${afterState.id}`
            };

            // Update output parameters
            const outputParams = [...Params];
            const beforeStateParam = outputParams.find(p => p.Name === 'BeforeState');
            if (beforeStateParam) beforeStateParam.Value = beforeState;
            const afterStateParam = outputParams.find(p => p.Name === 'AfterState');
            if (afterStateParam) afterStateParam.Value = afterState;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully updated contact ${afterState.email || contactId}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for not found error
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return {
                    Success: false,
                    ResultCode: 'CONTACT_NOT_FOUND',
                    Message: `Contact with ID ${this.getParamValue(Params, 'ContactId')} not found`,
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error updating contact: ${errorMessage}`,
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
                Value: null
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
                Name: 'ClearFields',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'BeforeState',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'AfterState',
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
        return 'Updates an existing contact in HubSpot with change tracking';
    }
}