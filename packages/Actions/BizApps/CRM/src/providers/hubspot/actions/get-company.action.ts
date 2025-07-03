import { RegisterClass } from '@memberjunction/global';
import { HubSpotBaseAction } from '../hubspot-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get a company from HubSpot by ID or domain
 */
@RegisterClass(BaseAction, 'GetCompanyAction')
export class GetCompanyAction extends HubSpotBaseAction {
    /**
     * Get a company by ID or domain
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params; // Set params for base class to use
        
        try {
            // Extract parameters
            const companyId = this.getParamValue(Params, 'CompanyId');
            const domain = this.getParamValue(Params, 'Domain');
            const includeProperties = this.getParamValue(Params, 'IncludeProperties');
            const includeAssociations = this.getParamValue(Params, 'IncludeAssociations');
            const includeContacts = this.getParamValue(Params, 'IncludeContacts');
            const includeDeals = this.getParamValue(Params, 'IncludeDeals');
            
            if (!companyId && !domain) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Either CompanyId or Domain is required',
                    Params
                };
            }

            let company: any;

            if (companyId) {
                // Get company by ID
                const queryParams: string[] = [];
                
                // Add properties to retrieve
                if (includeProperties && Array.isArray(includeProperties)) {
                    queryParams.push(`properties=${includeProperties.join(',')}`);
                }
                
                // Add associations if requested
                const associations: string[] = [];
                if (includeAssociations || includeContacts) associations.push('contacts');
                if (includeAssociations || includeDeals) associations.push('deals');
                if (associations.length > 0) {
                    queryParams.push(`associations=${associations.join(',')}`);
                }
                
                const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
                
                company = await this.makeHubSpotRequest<any>(
                    `objects/companies/${companyId}${query}`,
                    'GET',
                    null,
                    ContextUser
                );
            } else {
                // Search by domain
                const searchResult = await this.makeHubSpotRequest<any>(
                    'objects/companies/search',
                    'POST',
                    {
                        filterGroups: [{
                            filters: [{
                                propertyName: 'domain',
                                operator: 'EQ',
                                value: domain
                            }]
                        }],
                        properties: includeProperties || [],
                        limit: 1
                    },
                    ContextUser
                );

                if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
                    return {
                        Success: false,
                        ResultCode: 'NOT_FOUND',
                        Message: `No company found with domain ${domain}`,
                        Params
                    };
                }

                company = searchResult.results[0];

                // Get associations if requested
                if ((includeAssociations || includeContacts || includeDeals) && company.id) {
                    const associations: string[] = [];
                    if (includeAssociations || includeContacts) associations.push('contacts');
                    if (includeAssociations || includeDeals) associations.push('deals');
                    
                    company = await this.makeHubSpotRequest<any>(
                        `objects/companies/${company.id}?associations=${associations.join(',')}`,
                        'GET',
                        null,
                        ContextUser
                    );
                }
            }

            // Format company details
            const companyDetails = this.mapHubSpotProperties(company);

            // Process associations if included
            let contactAssociations = null;
            let dealAssociations = null;

            if (company.associations) {
                if (company.associations.contacts && includeContacts) {
                    contactAssociations = company.associations.contacts.results.map((assoc: any) => ({
                        id: assoc.id,
                        type: assoc.type
                    }));
                }
                if (company.associations.deals && includeDeals) {
                    dealAssociations = company.associations.deals.results.map((assoc: any) => ({
                        id: assoc.id,
                        type: assoc.type
                    }));
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
                website: companyDetails.website,
                phone: companyDetails.phone,
                city: companyDetails.city,
                state: companyDetails.state,
                country: companyDetails.country,
                ownerId: companyDetails.hubspot_owner_id,
                createdAt: companyDetails.createdAt,
                updatedAt: companyDetails.updatedAt,
                portalUrl: `https://app.hubspot.com/contacts/${companyDetails.id}`,
                contactCount: contactAssociations ? contactAssociations.length : 0,
                dealCount: dealAssociations ? dealAssociations.length : 0
            };

            // Update output parameters
            const outputParams = [...Params];
            const companyDetailsParam = outputParams.find(p => p.Name === 'CompanyDetails');
            if (companyDetailsParam) companyDetailsParam.Value = companyDetails;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const contactAssociationsParam = outputParams.find(p => p.Name === 'ContactAssociations');
            if (contactAssociationsParam) contactAssociationsParam.Value = contactAssociations;
            const dealAssociationsParam = outputParams.find(p => p.Name === 'DealAssociations');
            if (dealAssociationsParam) dealAssociationsParam.Value = dealAssociations;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved company ${companyDetails.name}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // Check for not found error
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `Company not found`,
                    Params
                };
            }

            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Error retrieving company: ${errorMessage}`,
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
                Name: 'Domain',
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
                Value: false
            },
            {
                Name: 'IncludeContacts',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'IncludeDeals',
                Type: 'Input',
                Value: false
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
            },
            {
                Name: 'ContactAssociations',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'DealAssociations',
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
        return 'Retrieves a company from HubSpot by ID or domain with optional associations';
    }
}