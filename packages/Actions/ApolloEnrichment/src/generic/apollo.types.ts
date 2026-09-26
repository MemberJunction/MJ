import { IMetadataProvider, UserInfo } from "@memberjunction/core";

export type ProcessPersonRecordGroupParams = {
    Records: Record<string, any>[];
    Startrow: number;
    GroupLength: number;
    Md: IMetadataProvider;
    CurrentUser: UserInfo;
    EntityName: string;
    EmailField: string;
    FirstNameField: string;
    LastNameField: string;
    TitleField: string;
    EnrichedAtField: string;
    ProfilePictureURLField?: string;
    AccountNameField?: string;
    DomainField?: string;  
    LinkedInField?: string;
    TwitterField?: string;
    FacebookField?: string;
    EmploymentHistoryEntityName?: string;
    EmploymentHistoryContactIDFieldName?: string;
    EmploymentHistoryOrganizationFieldName?: string;
    EmploymentHistoryTitleFieldName?: string;
    EducationHistoryEntityName?: string;
    EducationHistoryContactIDFieldName?: string;
    EducationHistoryInstitutionFieldName?: string;
    EducationHistoryDegreeFieldName?: string;
};

export type ApolloBulkPeopleRequest = {

    /**
     * The API key for the Apollo.io request (required)
     */
    api_key: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The list of people to enrich (required)
     */
    details: ApolloBulkPeopleRequestDetail[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * Flag to reveal personal emails (optional) 
     * 
     * Default false
     * 
     * Note: Personal emails will not be revealed for GDPR compliant regions
     */
    reveal_personal_emails?: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * Flag to reveal phone number (optional)
     * 
     *  Default false. 
     * 
     * If you set to this true, Apollo will asynchronously verify direct dials for you, and you must specify a Webhook callback URL.
     */
    reveal_phone_numbers?: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Webhook callback URL for sending 'reveal_phone_number' response (optional) 
     * 
     * This parameter is required if you request direct dials via "reveal_phone_number"
     */
    webhook_url?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
};

export type ApolloBulkPeopleRequestDetail = {
    /**
    * The person's first name (optional)
    */
    first_name?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The person's last name (optional)
     */
    last_name?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The person's full name (optional)
     */
    name?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The person's email (optional)
     */
    email?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The person's md5 or sha256 hashed email (optional)
     */
    hased_email?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The person's company name (optional)
     */
    organization_name?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The person's company domain (optional)
     */
    domain?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The person's ID obtained from the search endpoint (optional)
     */
    id?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention

    /**
     * The person's linkedin URL (optional)
     */
    linkedin_url?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
};

export type ApolloBulkPeopleResponse = {
    status: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    error_code: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    error_message: string,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    total_requested_enrichments: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    unique_enriched_records: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    missing_records: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    credits_consumed: number,  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    matches: Array<SearchPeopleResponsePerson | null>;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
};

export type ContactEntityFields = {
    EntityName: string;
    EmailField: string;
    AccountIDField: string;
    EnrichedAtField: string;
    FirstNameField: string;
    LastNameField: string;
    TitleField: string;
    EmailSourceField: string;
    ActivityCountField: string;
    FacebookField?: string;
    LinkedInField?: string;
    TwitterField?: string;
    ProfilePictureURLField?: string;
};

export type ContactEducationHistoryEntityFields = {
    EntityName: string;
    ContactIDField: string;
    InstitutionField: string;
    DegreeField: string;
    GradeLevelField: string;
    StartDateField: string;
    EndDateField: string;
    IsCurrentField: string;
};

export type TechnologyCategoryEntityFields = {
    EntityName: string;
    NameField: string;
    IDField: string;
};

export type AccountTechnologyEntityFields = {
    EntityName: string;
    AccountIDField: string;
    TechnologyIDField: string;
    TechnologyField: string;
    CategoryField: string;
    EndedUseAtField: string;
};

export type AccountEntityFields = {
    EntityName: string;
    DomainField: string;
    AccountIDField: string;
    EnrichedAtField: string;
    Filter: string;
    CityField?: string;
    StateProvinceField?: string;
    PostalCodeField?: string;
    DescriptionField?: string;
    PhoneNumberField?: string;
    CountryField?: string;
    LinkedInField?: string;
    LogoURLField?: string;
    FacebookField?: string;
    TwitterField?: string;
    AddressField?: string;
}

export type ProcessSingleDomainParams = {
    Record: Record<string, any>;
    AccountEntity: AccountEntityFields;
    AccountTechnologyEntity: AccountTechnologyEntityFields | null;
    TechnologyCategoryEntity: TechnologyCategoryEntityFields | null;
    ContactEntity: ContactEntityFields | null;
    ContactEducationHistoryEntity: ContactEducationHistoryEntityFields | null;
};

export type OrganizationEnrichmentRequest = {
    /**
     * The company domain
     * @example "apollo.io"
     */
    domain: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
};

export type OrganizationEnrichmentResponse = {
    /**
     * The company domain
     * @example "apollo.io"
     */
    organization: OrganizationEnrichmentOrganization  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
};

export type OrganizationEnrichmentOrganization = {
    id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    name: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    website_url: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    blog_url: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    angellist_url: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    linkedin_url: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    twitter_url: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    facebook_url: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    primary_phone: Record<'number' | 'source', string>,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    languages: string[],  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    alexa_ranking: number,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    phone: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    linkedin_uid: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    founded_year: number,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    publicly_traded_symbol: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    publicly_traded_exchange: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    logo_url: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    crunchbase_url: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    primary_domain: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    industry: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    keywords: string[],  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    estimated_num_employees: number,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    snippets_loaded: boolean,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    industry_tag_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    retail_location_count: number,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    raw_address: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    street_address: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    city: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    state: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    postal_code: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    country: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    owned_by_organization_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    suborganizations: string[],  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    num_suborganizations: number,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    seo_description: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    short_description: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    annual_revenue_printed: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    annual_revenue: number,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    total_funding: number,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    total_funding_printed: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    latest_funding_round_date: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    latest_funding_stage: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    funding_events: Record<'id' | 'date' | 'news_url' | 'type' | 'investors' | 'amount' | 'currency', string>[],  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    technology_names: string[],  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    current_technologies: Record<'uid' | 'name' | 'category', string>[],  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    account_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    account: Record<string, any>,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    departmental_head_count: Record<string, number>  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
};

export type OrganizationEnrichmentOrganizationAccount = {
    id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    domain: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    name: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    team_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    organization_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    account_stage_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    source: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    original_source: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    owner_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    created_at: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    phone: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    phone_status: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    test_predictive_score: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    hubspot_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    salesforce_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    crm_owner_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    parent_account_id: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    sanitized_phone: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    account_playbook_statuses: string[],  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    existence_level: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    label_ids: string[],  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    typed_custom_fields: Record<string, any>,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    modality: string,  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    persona_counts: Record<string, number>  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
};

export type TechnologyMap = {
    category: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    uid: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
};

export type SearchPeopleResponse = {
    breadcrumbs: Record<string, any>[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    partial_results_only: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    disable_eu_prospecting: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    partial_results_limit: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    pagination: {  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        page: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        per_page: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        total_entries: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        total_pages: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    };
    contacts: Record<string, any>[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    people: SearchPeopleResponsePerson[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
};

export type SearchPeopleResponsePerson = {
    id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    first_name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    last_name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    linkedin_url: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    title: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    email_status: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    photo_url: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    twitter_url: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    github_url: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    facebook_url: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    extrapolated_email_confidence: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    headline: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    email: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    employment_history: EmploymentHistory[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    state: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    city: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    country: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    organization_id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    organization: OrganizationEnrichmentOrganization;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    account_id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    account: OrganizationEnrichmentOrganizationAccount;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    departments: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    subdepartments: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    functions: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    seniority: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
};

export type EmploymentHistory = {
    current: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    degree: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    description: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    emails: any;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    end_date: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    start_date: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    grade_level: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    organization_id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    organization_name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    title: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
};