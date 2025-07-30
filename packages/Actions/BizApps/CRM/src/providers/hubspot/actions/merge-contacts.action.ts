import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to merge duplicate contacts in HubSpot
 */
@RegisterClass(BaseAction, 'MergeContactsAction')
export class MergeContactsAction extends HubSpotBaseAction {
    /**
     * Merge duplicate contacts
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const primaryContactId = this.getParamValue(Params, 'PrimaryContactId');
            const secondaryContactIds = this.getParamValue(Params, 'SecondaryContactIds');
            const primaryEmail = this.getParamValue(Params, 'PrimaryEmail');
            const secondaryEmails = this.getParamValue(Params, 'SecondaryEmails');
            const mergeStrategy = this.getParamValue(Params, 'MergeStrategy') || 'NEWEST';
            
            // Validate input
            if (!primaryContactId && !primaryEmail) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Either PrimaryContactId or PrimaryEmail is required',
                    Params
                };
            }

            if (!secondaryContactIds && !secondaryEmails) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Either SecondaryContactIds or SecondaryEmails is required',
                    Params
                };
            }

            // Resolve contact IDs if emails provided
            let primaryId = primaryContactId;
            let secondaryIds = secondaryContactIds || [];

            // Get primary contact ID from email if needed
            if (!primaryId && primaryEmail) {
                const primarySearch = await this.searchHubSpotObjects<any>(
                    'contacts',
                    [{
                        propertyName: 'email',
                        operator: 'EQ',
                        value: primaryEmail
                    }],
                    ['email', 'firstname', 'lastname'],
                    ContextUser
                );

                if (primarySearch.length === 0) {
                    return {
                        Success: false,
                        ResultCode: 'PRIMARY_NOT_FOUND',
                        Message: `Primary contact with email ${primaryEmail} not found`,
                        Params
                    };
                }

                primaryId = primarySearch[0].id;
            }

            // Get secondary contact IDs from emails if needed
            if (secondaryEmails && (!secondaryIds || secondaryIds.length === 0)) {
                const emailList = Array.isArray(secondaryEmails) ? secondaryEmails : [secondaryEmails];
                secondaryIds = [];

                for (const email of emailList) {
                    const secondarySearch = await this.searchHubSpotObjects<any>(
                        'contacts',
                        [{
                            propertyName: 'email',
                            operator: 'EQ',
                            value: email
                        }],
                        ['email', 'firstname', 'lastname'],
                        ContextUser
                    );

                    if (secondarySearch.length > 0) {
                        secondaryIds.push(secondarySearch[0].id);
                    }
                }

                if (secondaryIds.length === 0) {
                    return {
                        Success: false,
                        ResultCode: 'SECONDARY_NOT_FOUND',
                        Message: 'No secondary contacts found with provided emails',
                        Params
                    };
                }
            }

            // Ensure secondaryIds is an array
            if (!Array.isArray(secondaryIds)) {
                secondaryIds = [secondaryIds];
            }

            // Get details of all contacts before merge
            const primaryBefore = await this.makeHubSpotRequest<any>(
                `objects/contacts/${primaryId}`,
                'GET',
                undefined,
                ContextUser
            );

            const secondaryDetailsBefore = [];
            for (const secondaryId of secondaryIds) {
                try {
                    const contact = await this.makeHubSpotRequest<any>(
                        `objects/contacts/${secondaryId}`,
                        'GET',
                        undefined,
                        ContextUser
                    );
                    secondaryDetailsBefore.push(this.mapHubSpotProperties(contact));
                } catch (error) {
                    // Contact might not exist, skip
                }
            }

            // Perform the merge
            const mergeBody = {
                objectIdToMerge: secondaryIds[0], // HubSpot v3 API merges one at a time
                mergeProperties: mergeStrategy === 'NEWEST'
            };

            // Track merge results
            const mergeResults = [];
            const failedMerges = [];

            // Merge each secondary contact
            for (const secondaryId of secondaryIds) {
                try {
                    await this.makeHubSpotRequest<any>(
                        `objects/contacts/merge`,
                        'POST',
                        {
                            primaryObjectId: primaryId,
                            objectIdToMerge: secondaryId
                        },
                        ContextUser
                    );

                    mergeResults.push({
                        secondaryId: secondaryId,
                        success: true,
                        message: 'Successfully merged'
                    });
                } catch (mergeError) {
                    const errorMessage = mergeError instanceof Error ? mergeError.message : 'Unknown error';
                    failedMerges.push({
                        secondaryId: secondaryId,
                        success: false,
                        error: errorMessage
                    });
                }
            }

            // Get the merged contact details
            const primaryAfter = await this.makeHubSpotRequest<any>(
                `objects/contacts/${primaryId}`,
                'GET',
                undefined,
                ContextUser
            );

            const mergedContactDetails = this.mapHubSpotProperties(primaryAfter);

            // Create summary
            const summary = {
                primaryContactId: primaryId,
                mergedContactEmail: mergedContactDetails.email,
                mergedContactName: `${mergedContactDetails.firstname || ''} ${mergedContactDetails.lastname || ''}`.trim(),
                totalContactsMerged: mergeResults.length + 1, // Including primary
                successfulMerges: mergeResults.length,
                failedMerges: failedMerges.length,
                mergeStrategy: mergeStrategy,
                timestamp: new Date().toISOString(),
                portalUrl: `https://app.hubspot.com/contacts/${primaryId}`
            };

            // Update output parameters
            const outputParams = [...Params];
            const primaryBeforeParam = outputParams.find(p => p.Name === 'PrimaryContactBefore');
            if (primaryBeforeParam) primaryBeforeParam.Value = this.mapHubSpotProperties(primaryBefore);
            const secondaryContactsParam = outputParams.find(p => p.Name === 'SecondaryContactsBefore');
            if (secondaryContactsParam) secondaryContactsParam.Value = secondaryDetailsBefore;
            const mergedContactParam = outputParams.find(p => p.Name === 'MergedContact');
            if (mergedContactParam) mergedContactParam.Value = mergedContactDetails;
            const mergeResultsParam = outputParams.find(p => p.Name === 'MergeResults');
            if (mergeResultsParam) mergeResultsParam.Value = mergeResults;
            const failedMergesParam = outputParams.find(p => p.Name === 'FailedMerges');
            if (failedMergesParam) failedMergesParam.Value = failedMerges;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            if (failedMerges.length > 0 && mergeResults.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MERGE_FAILED',
                    Message: 'All merge operations failed',
                    Params: outputParams
                };
            }

            const resultMessage = failedMerges.length > 0
                ? `Merged ${mergeResults.length} of ${secondaryIds.length} contacts into primary contact`
                : `Successfully merged ${mergeResults.length} contacts into primary contact`;

            return {
                Success: true,
                ResultCode: failedMerges.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
                Message: resultMessage,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for specific error types
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return {
                    Success: false,
                    ResultCode: 'CONTACT_NOT_FOUND',
                    Message: 'One or more contacts not found',
                    Params
                };
            }

            if (errorMessage.includes('409') || errorMessage.includes('conflict')) {
                return {
                    Success: false,
                    ResultCode: 'MERGE_CONFLICT',
                    Message: 'Merge conflict - contacts may have already been merged',
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error merging contacts: ${errorMessage}`,
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
                Name: 'PrimaryContactId',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SecondaryContactIds',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PrimaryEmail',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SecondaryEmails',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MergeStrategy',
                Type: 'Input',
                Value: 'NEWEST'
            },
            {
                Name: 'PrimaryContactBefore',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'SecondaryContactsBefore',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'MergedContact',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'MergeResults',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'FailedMerges',
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
        return 'Merges duplicate contacts in HubSpot, combining their data and associations';
    }
}