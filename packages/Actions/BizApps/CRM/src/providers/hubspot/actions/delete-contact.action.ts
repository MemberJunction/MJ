import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to delete/archive a contact in HubSpot
 */
@RegisterClass(HubSpotBaseAction, 'DeleteContactAction')
export class DeleteContactAction extends HubSpotBaseAction {
    /**
     * Delete/archive a contact
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const contactId = this.getParamValue(Params, 'ContactId');
            const email = this.getParamValue(Params, 'Email');
            const permanentDelete = this.getParamValue(Params, 'PermanentDelete') || false;
            const archiveOnly = this.getParamValue(Params, 'ArchiveOnly') || true;
            
            if (!contactId && !email) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Either ContactId or Email is required',
                    Params
                };
            }

            let contactToDelete: any;
            let actualContactId: string;

            // If email provided, search for contact first
            if (email && !contactId) {
                const searchResults = await this.searchHubSpotObjects<any>(
                    'contacts',
                    [{
                        propertyName: 'email',
                        operator: 'EQ',
                        value: email
                    }],
                    ['email', 'firstname', 'lastname', 'company'],
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

                if (searchResults.length > 1) {
                    return {
                        Success: false,
                        ResultCode: 'MULTIPLE_CONTACTS_FOUND',
                        Message: `Multiple contacts found with email ${email}. Please use ContactId instead.`,
                        Params
                    };
                }

                contactToDelete = searchResults[0];
                actualContactId = contactToDelete.id;
            } else {
                actualContactId = contactId;
                
                // Get contact details before deletion
                try {
                    contactToDelete = await this.makeHubSpotRequest<any>(
                        `objects/contacts/${actualContactId}`,
                        'GET',
                        undefined,
                        ContextUser
                    );
                } catch (getError: any) {
                    if (getError.message.includes('404')) {
                        return {
                            Success: false,
                            ResultCode: 'CONTACT_NOT_FOUND',
                            Message: `Contact with ID ${actualContactId} not found`,
                            Params
                        };
                    }
                    throw getError;
                }
            }

            // Store contact details before deletion
            const contactDetails = this.mapHubSpotProperties(contactToDelete);
            const deletionTime = new Date().toISOString();

            // Perform deletion based on parameters
            if (permanentDelete && !archiveOnly) {
                // Permanent deletion (GDPR compliant)
                await this.makeHubSpotRequest<any>(
                    `objects/contacts/${actualContactId}/gdpr-delete`,
                    'POST',
                    undefined,
                    ContextUser
                );
            } else {
                // Archive contact (soft delete)
                await this.makeHubSpotRequest<any>(
                    `objects/contacts/${actualContactId}`,
                    'DELETE',
                    undefined,
                    ContextUser
                );
            }

            // Create deletion summary
            const summary = {
                contactId: actualContactId,
                email: contactDetails.email,
                fullName: `${contactDetails.firstname || ''} ${contactDetails.lastname || ''}`.trim(),
                company: contactDetails.company,
                deletionType: permanentDelete && !archiveOnly ? 'permanent' : 'archived',
                deletedAt: deletionTime,
                wasActive: !contactDetails.archived,
                lifecycleStageAtDeletion: contactDetails.lifecyclestage,
                createdAt: contactDetails.createdAt,
                lastModifiedAt: contactDetails.updatedAt
            };

            // Update output parameters
            const outputParams = [...Params];
            const deletedContactParam = outputParams.find(p => p.Name === 'DeletedContact');
            if (deletedContactParam) deletedContactParam.Value = contactDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            const message = permanentDelete && !archiveOnly 
                ? `Permanently deleted contact ${contactDetails.email || actualContactId}`
                : `Archived contact ${contactDetails.email || actualContactId}`;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: message,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for specific error types
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return {
                    Success: false,
                    ResultCode: 'CONTACT_NOT_FOUND',
                    Message: 'Contact not found',
                    Params
                };
            }

            if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
                return {
                    Success: false,
                    ResultCode: 'PERMISSION_DENIED',
                    Message: 'Permission denied to delete this contact',
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error deleting contact: ${errorMessage}`,
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
                Name: 'PermanentDelete',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'ArchiveOnly',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'DeletedContact',
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
        return 'Deletes or archives a contact in HubSpot by ID or email with GDPR compliance options';
    }
}