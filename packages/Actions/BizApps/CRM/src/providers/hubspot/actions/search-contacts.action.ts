import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to search contacts in HubSpot by various criteria
 */
@RegisterClass(HubSpotBaseAction, 'SearchContactsAction')
export class SearchContactsAction extends HubSpotBaseAction {
    /**
     * Search contacts by criteria
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract and validate parameters
            const searchTerm = this.getParamValue(Params, 'SearchTerm');
            const filters = this.getParamValue(Params, 'Filters');
            const email = this.getParamValue(Params, 'Email');
            const firstName = this.getParamValue(Params, 'FirstName');
            const lastName = this.getParamValue(Params, 'LastName');
            const company = this.getParamValue(Params, 'Company');
            const lifecycleStage = this.getParamValue(Params, 'LifecycleStage');
            const leadStatus = this.getParamValue(Params, 'LeadStatus');
            const createdAfter = this.getParamValue(Params, 'CreatedAfter');
            const createdBefore = this.getParamValue(Params, 'CreatedBefore');
            const updatedAfter = this.getParamValue(Params, 'UpdatedAfter');
            const updatedBefore = this.getParamValue(Params, 'UpdatedBefore');
            const includeProperties = this.getParamValue(Params, 'IncludeProperties');
            const sortBy = this.getParamValue(Params, 'SortBy') || 'createdate';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'DESC';
            const limit = this.getParamValue(Params, 'Limit') || 100;
            const includeArchived = this.getParamValue(Params, 'IncludeArchived') || false;
            
            // Build search filters
            const searchFilters: any[] = [];

            // Add custom filters if provided
            if (filters && Array.isArray(filters)) {
                searchFilters.push(...filters);
            }

            // Add specific field filters
            if (email) {
                searchFilters.push({
                    propertyName: 'email',
                    operator: 'CONTAINS_TOKEN',
                    value: email
                });
            }

            if (firstName) {
                searchFilters.push({
                    propertyName: 'firstname',
                    operator: 'CONTAINS_TOKEN',
                    value: firstName
                });
            }

            if (lastName) {
                searchFilters.push({
                    propertyName: 'lastname',
                    operator: 'CONTAINS_TOKEN',
                    value: lastName
                });
            }

            if (company) {
                searchFilters.push({
                    propertyName: 'company',
                    operator: 'CONTAINS_TOKEN',
                    value: company
                });
            }

            if (lifecycleStage) {
                searchFilters.push({
                    propertyName: 'lifecyclestage',
                    operator: 'EQ',
                    value: lifecycleStage
                });
            }

            if (leadStatus) {
                searchFilters.push({
                    propertyName: 'lead_status',
                    operator: 'EQ',
                    value: leadStatus
                });
            }

            if (createdAfter) {
                searchFilters.push({
                    propertyName: 'createdate',
                    operator: 'GTE',
                    value: new Date(createdAfter).getTime().toString()
                });
            }

            if (createdBefore) {
                searchFilters.push({
                    propertyName: 'createdate',
                    operator: 'LTE',
                    value: new Date(createdBefore).getTime().toString()
                });
            }

            if (updatedAfter) {
                searchFilters.push({
                    propertyName: 'lastmodifieddate',
                    operator: 'GTE',
                    value: new Date(updatedAfter).getTime().toString()
                });
            }

            if (updatedBefore) {
                searchFilters.push({
                    propertyName: 'lastmodifieddate',
                    operator: 'LTE',
                    value: new Date(updatedBefore).getTime().toString()
                });
            }

            // Use general search term if no specific filters
            if (searchTerm && searchFilters.length === 0) {
                // Search across multiple fields
                searchFilters.push({
                    propertyName: 'email',
                    operator: 'CONTAINS_TOKEN',
                    value: searchTerm
                });
            }

            // Build search body
            const searchBody: any = {
                limit: Math.min(limit, 100), // HubSpot max is 100 per request
                after: 0,
                sorts: [{
                    propertyName: sortBy,
                    direction: sortOrder
                }]
            };

            // Add properties to include
            if (includeProperties && Array.isArray(includeProperties)) {
                searchBody.properties = includeProperties;
            }

            // Add filters if any
            if (searchFilters.length > 0) {
                searchBody.filterGroups = [{
                    filters: searchFilters
                }];
            }

            // Handle archived contacts
            if (!includeArchived) {
                if (!searchBody.filterGroups) {
                    searchBody.filterGroups = [];
                }
                searchBody.filterGroups.push({
                    filters: [{
                        propertyName: 'archived',
                        operator: 'EQ',
                        value: 'false'
                    }]
                });
            }

            // Perform search
            const response = await this.makeHubSpotRequest<any>(
                'objects/contacts/search',
                'POST',
                searchBody,
                ContextUser
            );

            const contacts = response.results || [];

            // Format contact results
            const formattedContacts = contacts.map((contact: any) => {
                const props = this.mapHubSpotProperties(contact);
                return {
                    id: props.id,
                    email: props.email,
                    firstName: props.firstname,
                    lastName: props.lastname,
                    fullName: `${props.firstname || ''} ${props.lastname || ''}`.trim(),
                    company: props.company,
                    lifecycleStage: props.lifecyclestage,
                    leadStatus: props.lead_status,
                    createdAt: props.createdAt,
                    updatedAt: props.updatedAt,
                    archived: props.archived
                };
            });

            // Create summary
            const summary = {
                totalResults: contacts.length,
                hasMore: response.paging?.next?.after ? true : false,
                searchCriteria: {
                    searchTerm: searchTerm,
                    filters: searchFilters.length,
                    sortBy: sortBy,
                    sortOrder: sortOrder,
                    includeArchived: includeArchived
                },
                resultStats: {
                    byLifecycleStage: this.groupBy(formattedContacts, 'lifecycleStage'),
                    byLeadStatus: this.groupBy(formattedContacts, 'leadStatus'),
                    archived: formattedContacts.filter(c => c.archived).length,
                    active: formattedContacts.filter(c => !c.archived).length
                }
            };

            // Update output parameters
            const outputParams = [...Params];
            const contactsParam = outputParams.find(p => p.Name === 'Contacts');
            if (contactsParam) contactsParam.Value = formattedContacts;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const pagingParam = outputParams.find(p => p.Name === 'PagingInfo');
            if (pagingParam) pagingParam.Value = response.paging;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${formattedContacts.length} contacts matching criteria`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error searching contacts: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Helper to group array by property
     */
    private groupBy(array: any[], key: string): Record<string, number> {
        return array.reduce((result, item) => {
            const value = item[key] || 'unknown';
            result[value] = (result[value] || 0) + 1;
            return result;
        }, {} as Record<string, number>);
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonCRMParams();
        const specificParams: ActionParam[] = [
            {
                Name: 'SearchTerm',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Filters',
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
                Name: 'Company',
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
                Name: 'CreatedAfter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CreatedBefore',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UpdatedAfter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UpdatedBefore',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeProperties',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'createdate'
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'DESC'
            },
            {
                Name: 'Limit',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'IncludeArchived',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'Contacts',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'PagingInfo',
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
        return 'Searches contacts in HubSpot using flexible criteria with sorting and filtering';
    }
}