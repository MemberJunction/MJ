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
}

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