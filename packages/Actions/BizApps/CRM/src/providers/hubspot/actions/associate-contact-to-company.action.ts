import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to associate contacts with companies in HubSpot
 */
@RegisterClass(BaseAction, 'AssociateContactToCompanyAction')
export class AssociateContactToCompanyAction extends HubSpotBaseAction {
    /**
     * Associate contacts with companies
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract parameters
            const contactIds = this.getParamValue(Params, 'ContactIds');
            const companyId = this.getParamValue(Params, 'CompanyId');
            const associationType = this.getParamValue(Params, 'AssociationType') || 'contact_to_company';
            const isPrimary = this.getParamValue(Params, 'IsPrimary') || false;
            const jobTitle = this.getParamValue(Params, 'JobTitle');
            const removeExisting = this.getParamValue(Params, 'RemoveExisting') || false;
            const updateContactCompany = this.getParamValue(Params, 'UpdateContactCompany') || true;

            // Validate required parameters
            if (!contactIds || (Array.isArray(contactIds) && contactIds.length === 0)) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'ContactIds is required and must be an array with at least one ID',
                    Params
                };
            }

            if (!companyId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'CompanyId is required',
                    Params
                };
            }

            // Ensure contactIds is an array
            const contactIdArray = Array.isArray(contactIds) ? contactIds : [contactIds];

            // Get company details first
            const company = await this.makeHubSpotRequest<any>(
                `objects/companies/${companyId}`,
                'GET',
                null,
                ContextUser
            );
            const companyDetails = this.mapHubSpotProperties(company);

            // Process each contact
            const results: any[] = [];
            let successCount = 0;
            let failureCount = 0;

            for (const contactId of contactIdArray) {
                try {
                    // Get contact details
                    const contact = await this.makeHubSpotRequest<any>(
                        `objects/contacts/${contactId}`,
                        'GET',
                        null,
                        ContextUser
                    );
                    const contactDetails = this.mapHubSpotProperties(contact);

                    // Remove existing company associations if requested
                    if (removeExisting) {
                        try {
                            // Get current associations
                            const currentAssociations = await this.makeHubSpotRequest<any>(
                                `objects/contacts/${contactId}/associations/companies`,
                                'GET',
                                null,
                                ContextUser
                            );

                            // Remove each existing association
                            if (currentAssociations && currentAssociations.results) {
                                for (const assoc of currentAssociations.results) {
                                    await this.makeHubSpotRequest<any>(
                                        `objects/contacts/${contactId}/associations/companies/${assoc.id}/${assoc.type || associationType}`,
                                        'DELETE',
                                        null,
                                        ContextUser
                                    );
                                }
                            }
                        } catch (removeError) {
                            // Continue even if removal fails
                            console.warn(`Failed to remove existing associations for contact ${contactId}:`, removeError);
                        }
                    }

                    // Create the association
                    await this.associateObjects(
                        'contacts',
                        contactId,
                        'companies',
                        companyId,
                        associationType,
                        ContextUser
                    );

                    // Update contact properties if requested
                    if (updateContactCompany) {
                        const updateProps: any = {
                            company: companyDetails.name
                        };
                        
                        if (jobTitle) {
                            updateProps.jobtitle = jobTitle;
                        }

                        await this.makeHubSpotRequest<any>(
                            `objects/contacts/${contactId}`,
                            'PATCH',
                            { properties: updateProps },
                            ContextUser
                        );
                    }

                    // Mark as primary if requested (requires specific association type)
                    let primaryStatus = null;
                    if (isPrimary) {
                        try {
                            // Set as primary company for the contact
                            await this.makeHubSpotRequest<any>(
                                `objects/contacts/${contactId}/associations/companies/${companyId}/labels`,
                                'PUT',
                                { labels: ['primary'] },
                                ContextUser
                            );
                            primaryStatus = 'Set as primary';
                        } catch (primaryError) {
                            primaryStatus = 'Failed to set as primary';
                        }
                    }

                    results.push({
                        contactId: contactId,
                        contactName: `${contactDetails.firstname || ''} ${contactDetails.lastname || ''}`.trim() || contactDetails.email,
                        success: true,
                        message: 'Successfully associated',
                        primaryStatus: primaryStatus
                    });
                    successCount++;

                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    results.push({
                        contactId: contactId,
                        success: false,
                        error: errorMessage
                    });
                    failureCount++;
                }
            }

            // Create summary
            const summary = {
                companyId: companyId,
                companyName: companyDetails.name,
                companyDomain: companyDetails.domain,
                totalContacts: contactIdArray.length,
                successCount: successCount,
                failureCount: failureCount,
                associationType: associationType,
                isPrimary: isPrimary,
                removedExisting: removeExisting,
                updatedContactCompany: updateContactCompany,
                results: results
            };

            // Update output parameters
            const outputParams = [...Params];
            const resultsParam = outputParams.find(p => p.Name === 'Results');
            if (resultsParam) resultsParam.Value = results;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const companyDetailsParam = outputParams.find(p => p.Name === 'CompanyDetails');
            if (companyDetailsParam) companyDetailsParam.Value = companyDetails;

            // Determine overall success
            const overallSuccess = successCount > 0;
            const resultCode = failureCount === 0 ? 'SUCCESS' : (successCount === 0 ? 'ERROR' : 'PARTIAL_SUCCESS');
            const message = failureCount === 0 
                ? `Successfully associated ${successCount} contact(s) with company ${companyDetails.name}`
                : `Associated ${successCount} of ${contactIdArray.length} contact(s) with company ${companyDetails.name}. ${failureCount} failed.`;

            return {
                Success: overallSuccess,
                ResultCode: resultCode,
                Message: message,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for company not found
            if (errorMessage.includes('404') && errorMessage.includes('companies')) {
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
                Message: `Error associating contacts with company: ${errorMessage}`,
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
                Name: 'ContactIds',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CompanyId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'AssociationType',
                Type: 'Input',
                Value: 'contact_to_company'
            },
            {
                Name: 'IsPrimary',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'JobTitle',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'RemoveExisting',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'UpdateContactCompany',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'Results',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'CompanyDetails',
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
        return 'Associates one or more contacts with a company in HubSpot';
    }
}