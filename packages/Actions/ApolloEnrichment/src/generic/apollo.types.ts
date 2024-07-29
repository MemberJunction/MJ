import { Metadata, UserInfo } from "@memberjunction/core";

export type ProcessPersonRecordGroupParams = {
    Records: any[];
    Startrow: number;
    GroupLength: number;
    Md: Metadata;
    CurrentUser: UserInfo;
    EntityName: string;
    EmailField: string;
    FirstNameField: string;
    LastNameField: string;
    AccountNameField: string;
    EnrichedAtField: string;
    DomainField?: string;  
    LinkedInField?: string;
};

export type ApollowBulkPeopleRequest = {

    /**
     * The API key for the Apollo.io request (required)
     */
    api_key: string;

    /**
     * The list of people to enrich (required)
     */
    details: ApollowBulkPeopleRequestDetail[];

    /**
     * Flag to reveal personal emails (optional) 
     * 
     * Default false
     * 
     * Note: Personal emails will not be revealed for GDPR compliant regions
     */
    reveal_personal_emails?: boolean;

    /**
     * Flag to reveal phone number (optional)
     * 
     *  Default false. 
     * 
     * If you set to this true, Apollo will asynchronously verify direct dials for you, and you must specify a Webhook callback URL.
     */
    reveal_phone_numbers?: boolean;
    
    /**
     * Webhook callback URL for sending 'reveal_phone_number' response (optional) 
     * 
     * This parameter is required if you request direct dials via "reveal_phone_number"
     */
    webhook_url?: string;
};

export type ApollowBulkPeopleRequestDetail = {
    /**
    * The person's first name (optional)
    */
    first_name?: string;

    /**
     * The person's last name (optional)
     */
    last_name?: string;

    /**
     * The person's full name (optional)
     */
    name?: string;

    /**
     * The person's email (optional)
     */
    email?: string;

    /**
     * The person's md5 or sha256 hashed email (optional)
     */
    hased_email?: string;

    /**
     * The person's company name (optional)
     */
    organization_name?: string;

    /**
     * The person's company domain (optional)
     */
    domain?: string;

    /**
     * The person's ID obtained from the search endpoint (optional)
     */
    id?: string;

    /**
     * The person's linkedin URL (optional)
     */
    linkedin_url?: string;
};

export type ApollowBulkPeopleResponse = {
    status: string;
    error_code: number,
    error_message: string,
    total_requested_enrichments: number,
    unique_enriched_records: number,
    missing_records: number,
    credits_consumed: number,
    matches: Record<string, any>[];
};

export type ProcessSingleDomainParams = {
    Record: Record<string, any>;
    EntityName: string;
    DomainParamName: string;
    AccountIDName: string;
    EnrichedAtField: string;
    CityFieldNameName?: string;
    StateProvinceFieldName?: string;
    PostalCodeFieldName?: string;
    DescriptionFieldName?: string;
    PhoneNumberFieldName?: string;
    CountryFieldName?: string;
    LinkedInFieldName?: string;
    LogoURLFieldName?: string;
    FacebookFieldName?: string;
    TwitterFieldName?: string;
    AddressFieldName?: string;

    ContactEntityName: string;
    ContactEntityEmailFieldName: string;
    ContactEntityAccountIDFieldName: string;
    ContactEntityFirstNameFieldName: string;
    ContactEntityActivityCountFieldName: string;
    ContactEntityEmailSourceFieldName: string;
    ContactEntityLastNameFieldName: string;
    ContactEntityTitleFieldName: string;
    ContactEntityFacebookFieldName: string;
    ContactEntityLinkedInFieldName: string;
    ContactEntityTwitterFieldName: string;
    ContactEntityPhotoFieldName: string;
    ContactEntityLastEnrichedAtFieldName: string;

    ContactEducationHistoryEntityName: string;
    ContactEducationHistoryEntityContactIDFieldName: string;
    ContactEducationHistoryEntityInstitutionFieldName: string;
    ContactEducationHistoryEntityDegreeFieldName: string;
    ContactEducationHistoryEntityGradeLevelFieldName: string;
    ContactEducationHistoryEntityStartDateFieldName: string;
    ContactEducationHistoryEntityEndDateFieldName: string;
    ContactEducationHistoryEntityIsCurrentFieldName: string;
};

export type OrganizationEnrichmentRequest = {
    /**
     * The company domain
     * @example "apollo.io"
     */
    domain: string;
};

export type OrganizationEnrichmentResponse = {
    /**
     * The company domain
     * @example "apollo.io"
     */
    organization: OrganizationEnrichmentOrgainzation
};

export type OrganizationEnrichmentOrgainzation = {
    id: string, 
    name: string,
    website_url: string,
    blog_url: string,
    angellist_url: string,
    linkedin_url: string,
    twitter_url: string,
    facebook_url: string,
    primary_phone: Record<'number' | 'source', string>,
    languages: string[],
    alexa_ranking: number,
    phone: string,
    linkedin_uid: string,
    founded_year: number,
    publicly_traded_symbol: string,
    publicly_traded_exchange: string,
    logo_url: string,
    crunchbase_url: string,
    primary_domain: string,
    industry: string,
    keywords: string[],
    estimated_num_employees: number,
    snippets_loaded: boolean,
    industry_tag_id: string,
    retail_location_count: number,
    raw_address: string,
    street_address: string,
    city: string,
    state: string,
    postal_code: string,
    country: string,
    owned_by_organization_id: string,
    suborganizations: string[],
    num_suborganizations: number,
    seo_description: string,
    short_description: string,
    annual_revenue_printed: string,
    annual_revenue: number,
    total_funding: number,
    total_funding_printed: string,
    latest_funding_round_date: string,
    latest_funding_stage: string,
    funding_events: Record<'id' | 'date' | 'news_url' | 'type' | 'investors' | 'amount' | 'currency', string>[],
    technology_names: string[],
    current_technologies: Record<'uid' | 'name' | 'category', string>[],
    account_id: string,
    account: Record<string, any>,
    departmental_head_count: Record<string, number>
};

export type OrganizationEnrichmentOrgainzationAccount = {
    id: string,
    domain: string,
    name: string,
    team_id: string,
    organization_id: string,
    account_stage_id: string,
    source: string,
    original_source: string,
    owner_id: string,
    created_at: string,
    phone: string,
    phone_status: string,
    test_predictive_score: string,
    hubspot_id: string,
    salesforce_id: string,
    crm_owner_id: string,
    parent_account_id: string,
    sanitized_phone: string,
    account_playbook_statuses: string[],
    existence_level: string,
    label_ids: string[],
    typed_custom_fields: Record<string, any>,
    modality: string,
    persona_counts: Record<string, number>
};

export type TechnologyMap = {
    category: string;
    name: string;
    uid: string;
};

export type SearchPeopleResponse = {
    breadcrumbs: Record<string, any>[];
    partial_results_only: boolean;
    disable_eu_prospecting: boolean;
    partial_results_limit: number;
    pagination: {
        page: number;
        per_page: number;
        total_entries: number;
        total_pages: number;
    };
    contacts: Record<string, any>[];
    people: SearchPeopleResponsePerson[];
};

export type SearchPeopleResponsePerson = {
    id: string;
    first_name: string;
    last_name: string;
    name: string;
    linkedin_url: string;
    title: string;
    email_status: string;
    photo_url: string;
    twitter_url: string;
    github_url: string;
    facebook_url: string;
    extrapolated_email_confidence: string;
    headline: string;
    email: string;
    employment_history: EmploymentHistory[];
    state: string;
    city: string;
    country: string;
    organization_id: string;
    organization: OrganizationEnrichmentOrgainzation;
    account_id: string;
    account: OrganizationEnrichmentOrgainzationAccount;
    departments: string[];
    subdepartments: string[];
    functions: string[];
    seniority: string;
};

export type EmploymentHistory = {
    current: boolean;
    degree: string;
    description: string;
    emails: any;
    end_date: string;
    start_date: string;
    grade_level: string;
    organization_id: string;
    organization_name: string;
    title: string;    
};
