import { BaseEntity, EntitySaveOptions, CompositeKey } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity Course Parts
 */
export const CoursePartSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullish().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: varchar(255)`),
    CourseID: z.number().nullish().describe(`
        * * Field Name: CourseID
        * * Display Name: Course ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Courses (vwCourses.ID)`),
    Text: z.string().nullish().describe(`
        * * Field Name: Text
        * * Display Name: Text
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type CoursePartEntityType = z.infer<typeof CoursePartSchema>;

/**
 * zod schema definition for the entity Courses
 */
export const CourseSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    Name: z.string().nullish().describe(`
        * * Field Name: Name
        * * Display Name: Name
        * * SQL Data Type: varchar(255)`),
    Description: z.string().nullish().describe(`
        * * Field Name: Description
        * * Display Name: Description
        * * SQL Data Type: nvarchar(MAX)`),
    WebLink: z.string().nullish().describe(`
        * * Field Name: WebLink
        * * Display Name: Web Link
        * * SQL Data Type: varchar(255)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type CourseEntityType = z.infer<typeof CourseSchema>;

/**
 * zod schema definition for the entity Person Education Histories
 */
export const PersonEducationHistorySchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    PersonID: z.number().describe(`
        * * Field Name: PersonID
        * * Display Name: Person ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Persons (vwPersons.ID)`),
    Institution: z.string().describe(`
        * * Field Name: Institution
        * * Display Name: Institution
        * * SQL Data Type: nvarchar(50)`),
    Degree: z.string().describe(`
        * * Field Name: Degree
        * * Display Name: Degree
        * * SQL Data Type: nvarchar(50)`),
    StartedAt: z.date().nullish().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime`),
    Major: z.string().nullish().describe(`
        * * Field Name: Major
        * * Display Name: Major
        * * SQL Data Type: nvarchar(50)`),
    Kind: z.string().nullish().describe(`
        * * Field Name: Kind
        * * Display Name: Kind
        * * SQL Data Type: nvarchar(50)`),
    GradeLevel: z.number().nullish().describe(`
        * * Field Name: GradeLevel
        * * Display Name: Grade Level
        * * SQL Data Type: int`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    UpdatedAt: z.date().describe(`
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type PersonEducationHistoryEntityType = z.infer<typeof PersonEducationHistorySchema>;

/**
 * zod schema definition for the entity Person Employment Histories
 */
export const PersonEmploymentHistorySchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    PersonID: z.number().describe(`
        * * Field Name: PersonID
        * * Display Name: Person ID
        * * SQL Data Type: int
        * * Related Entity/Foreign Key: Persons (vwPersons.ID)`),
    IsCurrent: z.boolean().describe(`
        * * Field Name: IsCurrent
        * * Display Name: Is Current
        * * SQL Data Type: bit
        * * Default Value: 0`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(100)`),
    Organization: z.string().describe(`
        * * Field Name: Organization
        * * Display Name: Organization
        * * SQL Data Type: nvarchar(50)`),
    AccountID: z.number().nullish().describe(`
        * * Field Name: AccountID
        * * Display Name: Account ID
        * * SQL Data Type: int`),
    StartedAt: z.date().nullish().describe(`
        * * Field Name: StartedAt
        * * Display Name: Started At
        * * SQL Data Type: datetime`),
    EndedAt: z.date().nullish().describe(`
        * * Field Name: EndedAt
        * * Display Name: Ended At
        * * SQL Data Type: datetime`),
    CreatedAt: z.date().describe(`
        * * Field Name: CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    UpdatedAt: z.date().describe(`
        * * Field Name: UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetime
        * * Default Value: getdate()`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type PersonEmploymentHistoryEntityType = z.infer<typeof PersonEmploymentHistorySchema>;

/**
 * zod schema definition for the entity Persons
 */
export const PersonSchema = z.object({
    ID: z.number().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: int`),
    first_name: z.string().nullish().describe(`
        * * Field Name: first_name
        * * Display Name: first _name
        * * SQL Data Type: nvarchar(MAX)`),
    timezone: z.string().nullish().describe(`
        * * Field Name: timezone
        * * Display Name: timezone
        * * SQL Data Type: nvarchar(MAX)`),
    city: z.string().nullish().describe(`
        * * Field Name: city
        * * Display Name: city
        * * SQL Data Type: nvarchar(MAX)`),
    email: z.string().nullish().describe(`
        * * Field Name: email
        * * Display Name: email
        * * SQL Data Type: nvarchar(MAX)`),
    session_count: z.string().nullish().describe(`
        * * Field Name: session_count
        * * Display Name: session _count
        * * SQL Data Type: nvarchar(MAX)`),
    first_session: z.string().nullish().describe(`
        * * Field Name: first_session
        * * Display Name: first _session
        * * SQL Data Type: nvarchar(MAX)`),
    last_session: z.string().nullish().describe(`
        * * Field Name: last_session
        * * Display Name: last _session
        * * SQL Data Type: nvarchar(MAX)`),
    in_app_purchase_total: z.string().nullish().describe(`
        * * Field Name: in_app_purchase_total
        * * Display Name: in _app _purchase _total
        * * SQL Data Type: nvarchar(MAX)`),
    unsubscribed_from_emails_at: z.string().nullish().describe(`
        * * Field Name: unsubscribed_from_emails_at
        * * Display Name: unsubscribed _from _emails _at
        * * SQL Data Type: nvarchar(MAX)`),
    active_resource_center_members_last_6_months: z.string().nullish().describe(`
        * * Field Name: active_resource_center_members_last_6_months
        * * Display Name: active _resource _center _members _last _6_months
        * * SQL Data Type: nvarchar(MAX)`),
    allowPhone: z.string().nullish().describe(`
        * * Field Name: allowPhone
        * * Display Name: allow Phone
        * * SQL Data Type: nvarchar(MAX)`),
    allowSolicitation: z.string().nullish().describe(`
        * * Field Name: allowSolicitation
        * * Display Name: allow Solicitation
        * * SQL Data Type: nvarchar(MAX)`),
    aud_awards_website_and_webcasts: z.string().nullish().describe(`
        * * Field Name: aud_awards_website_and_webcasts
        * * Display Name: aud _awards _website _and _webcasts
        * * SQL Data Type: nvarchar(MAX)`),
    aud_change_management_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_change_management_topic_engagement
        * * Display Name: aud _change _management _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ci_aptd_high_interest: z.string().nullish().describe(`
        * * Field Name: aud_ci_aptd_high_interest
        * * Display Name: aud _ci _aptd _high _interest
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ci_aptd_prep_purchases: z.string().nullish().describe(`
        * * Field Name: aud_ci_aptd_prep_purchases
        * * Display Name: aud _ci _aptd _prep _purchases
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ci_aptd_web_interest: z.string().nullish().describe(`
        * * Field Name: aud_ci_aptd_web_interest
        * * Display Name: aud _ci _aptd _web _interest
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ci_bok_purchases: z.string().nullish().describe(`
        * * Field Name: aud_ci_bok_purchases
        * * Display Name: aud _ci _bok _purchases
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ci_cplp_interest_group: z.string().nullish().describe(`
        * * Field Name: aud_ci_cplp_interest_group
        * * Display Name: aud _ci _cplp _interest _group
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ci_general_certification_interest_group: z.string().nullish().describe(`
        * * Field Name: aud_ci_general_certification_interest_group
        * * Display Name: aud _ci _general _certification _interest _group
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ci_masters_more_than_6_mo: z.string().nullish().describe(`
        * * Field Name: aud_ci_masters_more_than_6_mo
        * * Display Name: aud _ci _masters _more _than _6_mo
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_atd_yale_2020_purchased: z.string().nullish().describe(`
        * * Field Name: aud_con_atd_yale_2020_purchased
        * * Display Name: aud _con _atd _yale _2020_purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_core_42020_chicago_purchased: z.string().nullish().describe(`
        * * Field Name: aud_con_core_42020_chicago_purchased
        * * Display Name: aud _con _core _42020_chicago _purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_core_4_2020_chicago_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_core_4_2020_chicago_cart_abandonment
        * * Display Name: aud _con _core _4_2020_chicago _cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_core_4_2020_nashville_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_core_4_2020_nashville_cart_abandonment
        * * Display Name: aud _con _core _4_2020_nashville _cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_core_4_2020_nashville_purchased: z.string().nullish().describe(`
        * * Field Name: aud_con_core_4_2020_nashville_purchased
        * * Display Name: aud _con _core _4_2020_nashville _purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_core_4_2020_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_core_4_2020_website_visitors
        * * Display Name: aud _con _core _4_2020_website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_dir_job_function: z.string().nullish().describe(`
        * * Field Name: aud_con_dir_job_function
        * * Display Name: aud _con _dir _job _function
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_edu_tk_2020_precon_pages_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_edu_tk_2020_precon_pages_visitors
        * * Display Name: aud _con _edu _tk _2020_precon _pages _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_gov_wf_2020_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_gov_wf_2020_cart_abandonment
        * * Display Name: aud _con _gov _wf _2020_cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_gov_wf_2020_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_gov_wf_2020_website_visitors
        * * Display Name: aud _con _gov _wf _2020_website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_cart_abandonment
        * * Display Name: aud _con _ice _2020_cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_consideration_target: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_consideration_target
        * * Display Name: aud _con _ice _2020_consideration _target
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_eb_last_chance_openers: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_eb_last_chance_openers
        * * Display Name: aud _con _ice _2020_eb _last _chance _openers
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_email_clickers: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_email_clickers
        * * Display Name: aud _con _ice _2020_email _clickers
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_email_opened: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_email_opened
        * * Display Name: aud _con _ice _2020_email _opened
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_purchased: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_purchased
        * * Display Name: aud _con _ice _2020_purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_reg_page_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_reg_page_visitors
        * * Display Name: aud _con _ice _2020_reg _page _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_team_target: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_team_target
        * * Display Name: aud _con _ice _2020_team _target
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_ice_2020_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_ice_2020_website_visitors
        * * Display Name: aud _con _ice _2020_website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_mbr_lapsed_10_31_19: z.string().nullish().describe(`
        * * Field Name: aud_con_mbr_lapsed_10_31_19
        * * Display Name: aud _con _mbr _lapsed _10_31_19
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_org_dev_2020_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_org_dev_2020_cart_abandonment
        * * Display Name: aud _con _org _dev _2020_cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_org_dev_2020_purchased: z.string().nullish().describe(`
        * * Field Name: aud_con_org_dev_2020_purchased
        * * Display Name: aud _con _org _dev _2020_purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_org_dev_2020_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_org_dev_2020_website_visitors
        * * Display Name: aud _con _org _dev _2020_website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_purchase_last_6_months: z.string().nullish().describe(`
        * * Field Name: aud_con_purchase_last_6_months
        * * Display Name: aud _con _purchase _last _6_months
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_sell_2020_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_sell_2020_cart_abandonment
        * * Display Name: aud _con _sell _2020_cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_sell_2020_purchased: z.string().nullish().describe(`
        * * Field Name: aud_con_sell_2020_purchased
        * * Display Name: aud _con _sell _2020_purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_sell_2020_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_sell_2020_website_visitors
        * * Display Name: aud _con _sell _2020_website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_consideration_target: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_consideration_target
        * * Display Name: aud _con _tk _2020_consideration _target
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_email_clickers: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_email_clickers
        * * Display Name: aud _con _tk _2020_email _clickers
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_email_opened: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_email_opened
        * * Display Name: aud _con _tk _2020_email _opened
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_mbr_bundle: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_mbr_bundle
        * * Display Name: aud _con _tk _2020_mbr _bundle
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_medina_wkshp_registrants: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_medina_wkshp_registrants
        * * Display Name: aud _con _tk _2020_medina _wkshp _registrants
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_medina_workshop_page_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_medina_workshop_page_visitors
        * * Display Name: aud _con _tk _2020_medina _workshop _page _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_plustk_2020_purchased: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_plustk_2020_purchased
        * * Display Name: aud _con _tk _2020_plustk _2020_purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_purchased: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_purchased
        * * Display Name: aud _con _tk _2020_purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_reg_page_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_reg_page_visitors
        * * Display Name: aud _con _tk _2020_reg _page _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_registrant_feedback_email_opens: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_registrant_feedback_email_opens
        * * Display Name: aud _con _tk _2020_registrant _feedback _email _opens
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_2020_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_2020_website_visitors
        * * Display Name: aud _con _tk _2020_website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_tk_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_tk_cart_abandonment
        * * Display Name: aud _con _tk _cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_vc_2_2020_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_vc_2_2020_cart_abandonment
        * * Display Name: aud _con _vc _2_2020_cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_virtual_2020_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_virtual_2020_website_visitors
        * * Display Name: aud _con _virtual _2020_website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_virtual_conference_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_virtual_conference_website_visitors
        * * Display Name: aud _con _virtual _conference _website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_west_coast_states: z.string().nullish().describe(`
        * * Field Name: aud_con_west_coast_states
        * * Display Name: aud _con _west _coast _states
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_yale_2020_cart_abandonment: z.string().nullish().describe(`
        * * Field Name: aud_con_yale_2020_cart_abandonment
        * * Display Name: aud _con _yale _2020_cart _abandonment
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_yale_2020_dir_job_function: z.string().nullish().describe(`
        * * Field Name: aud_con_yale_2020_dir_job_function
        * * Display Name: aud _con _yale _2020_dir _job _function
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_yale_2020_email_clickers: z.string().nullish().describe(`
        * * Field Name: aud_con_yale_2020_email_clickers
        * * Display Name: aud _con _yale _2020_email _clickers
        * * SQL Data Type: nvarchar(MAX)`),
    aud_con_yale_2020_website_visitors: z.string().nullish().describe(`
        * * Field Name: aud_con_yale_2020_website_visitors
        * * Display Name: aud _con _yale _2020_website _visitors
        * * SQL Data Type: nvarchar(MAX)`),
    aud_conf_vc_2_telemarketing_hot_leads: z.string().nullish().describe(`
        * * Field Name: aud_conf_vc_2_telemarketing_hot_leads
        * * Display Name: aud _conf _vc _2_telemarketing _hot _leads
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ctdo_next: z.string().nullish().describe(`
        * * Field Name: aud_ctdo_next
        * * Display Name: aud _ctdo _next
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers: z.string().nullish().describe(`
        * * Field Name: aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers
        * * Display Name: aud _edu _allmasterprograms _pagevisitors _last _12_mo _less _masters _purchasers
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_allmasterprograms_pagevisitors_last_6_mo: z.string().nullish().describe(`
        * * Field Name: aud_edu_allmasterprograms_pagevisitors_last_6_mo
        * * Display Name: aud _edu _allmasterprograms _pagevisitors _last _6_mo
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_catalog_2020_virtual_downloads: z.string().nullish().describe(`
        * * Field Name: aud_edu_catalog_2020_virtual_downloads
        * * Display Name: aud _edu _catalog _2020_virtual _downloads
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_form_catalog_2020: z.string().nullish().describe(`
        * * Field Name: aud_edu_form_catalog_2020
        * * Display Name: aud _edu _form _catalog _2020
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_ice_precon_2020_target_audience: z.string().nullish().describe(`
        * * Field Name: aud_edu_ice_precon_2020_target_audience
        * * Display Name: aud _edu _ice _precon _2020_target _audience
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_in_person_course_purchasers_last_365_days: z.string().nullish().describe(`
        * * Field Name: aud_edu_in_person_course_purchasers_last_365_days
        * * Display Name: aud _edu _in _person _course _purchasers _last _365_days
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_or_con_purchasers_cyber_week_2021: z.string().nullish().describe(`
        * * Field Name: aud_edu_or_con_purchasers_cyber_week_2021
        * * Display Name: aud _edu _or _con _purchasers _cyber _week _2021
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_page_visits_all: z.string().nullish().describe(`
        * * Field Name: aud_edu_page_visits_all
        * * Display Name: aud _edu _page _visits _all
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_precon_2020_purchased: z.string().nullish().describe(`
        * * Field Name: aud_edu_precon_2020_purchased
        * * Display Name: aud _edu _precon _2020_purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_purchased_cert: z.string().nullish().describe(`
        * * Field Name: aud_edu_purchased_cert
        * * Display Name: aud _edu _purchased _cert
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_purchased_cert_14_days: z.string().nullish().describe(`
        * * Field Name: aud_edu_purchased_cert_14_days
        * * Display Name: aud _edu _purchased _cert _14_days
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_purchased_cert_6_mos: z.string().nullish().describe(`
        * * Field Name: aud_edu_purchased_cert_6_mos
        * * Display Name: aud _edu _purchased _cert _6_mos
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_purchased_tc_last_6_m_os: z.string().nullish().describe(`
        * * Field Name: aud_edu_purchased_tc_last_6_m_os
        * * Display Name: aud _edu _purchased _tc _last _6_m _os
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_tdbok_interest: z.string().nullish().describe(`
        * * Field Name: aud_edu_tdbok_interest
        * * Display Name: aud _edu _tdbok _interest
        * * SQL Data Type: nvarchar(MAX)`),
    aud_edu_tk_precon_purchased: z.string().nullish().describe(`
        * * Field Name: aud_edu_tk_precon_purchased
        * * Display Name: aud _edu _tk _precon _purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ent_ice_2020_teams_purchased: z.string().nullish().describe(`
        * * Field Name: aud_ent_ice_2020_teams_purchased
        * * Display Name: aud _ent _ice _2020_teams _purchased
        * * SQL Data Type: nvarchar(MAX)`),
    aud_ent_td_leader_nl_4_times: z.string().nullish().describe(`
        * * Field Name: aud_ent_td_leader_nl_4_times
        * * Display Name: aud _ent _td _leader _nl _4_times
        * * SQL Data Type: nvarchar(MAX)`),
    aud_expiring_member: z.string().nullish().describe(`
        * * Field Name: aud_expiring_member
        * * Display Name: aud _expiring _member
        * * SQL Data Type: nvarchar(MAX)`),
    aud_global_international_members: z.string().nullish().describe(`
        * * Field Name: aud_global_international_members
        * * Display Name: aud _global _international _members
        * * SQL Data Type: nvarchar(MAX)`),
    aud_global_perspectives_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_global_perspectives_topic_engagement
        * * Display Name: aud _global _perspectives _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_government_newsletter: z.string().nullish().describe(`
        * * Field Name: aud_government_newsletter
        * * Display Name: aud _government _newsletter
        * * SQL Data Type: nvarchar(MAX)`),
    aud_healthcare_news_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_healthcare_news_topic_engagement
        * * Display Name: aud _healthcare _news _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_instructional_design_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_instructional_design_topic_engagement
        * * Display Name: aud _instructional _design _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_is_member: z.string().nullish().describe(`
        * * Field Name: aud_is_member
        * * Display Name: aud _is _member
        * * SQL Data Type: nvarchar(MAX)`),
    aud_leadership_development_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_leadership_development_topic_engagement
        * * Display Name: aud _leadership _development _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_learning_technologies_engagement: z.string().nullish().describe(`
        * * Field Name: aud_learning_technologies_engagement
        * * Display Name: aud _learning _technologies _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_management_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_management_topic_engagement
        * * Display Name: aud _management _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_acq_interest: z.string().nullish().describe(`
        * * Field Name: aud_mbr_acq_interest
        * * Display Name: aud _mbr _acq _interest
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_acq_interest_decades: z.string().nullish().describe(`
        * * Field Name: aud_mbr_acq_interest_decades
        * * Display Name: aud _mbr _acq _interest _decades
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_acq_interest_decades_updated: z.string().nullish().describe(`
        * * Field Name: aud_mbr_acq_interest_decades_updated
        * * Display Name: aud _mbr _acq _interest _decades _updated
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_benefits_available: z.string().nullish().describe(`
        * * Field Name: aud_mbr_benefits_available
        * * Display Name: aud _mbr _benefits _available
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_claimed_all_benefits: z.string().nullish().describe(`
        * * Field Name: aud_mbr_claimed_all_benefits
        * * Display Name: aud _mbr _claimed _all _benefits
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_claimed_atleast_one_benefit: z.string().nullish().describe(`
        * * Field Name: aud_mbr_claimed_atleast_one_benefit
        * * Display Name: aud _mbr _claimed _atleast _one _benefit
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_expiring_30_days_not_renewed: z.string().nullish().describe(`
        * * Field Name: aud_mbr_expiring_30_days_not_renewed
        * * Display Name: aud _mbr _expiring _30_days _not _renewed
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_expiring_next_90_days: z.string().nullish().describe(`
        * * Field Name: aud_mbr_expiring_next_90_days
        * * Display Name: aud _mbr _expiring _next _90_days
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_low_engage_6_mo: z.string().nullish().describe(`
        * * Field Name: aud_mbr_low_engage_6_mo
        * * Display Name: aud _mbr _low _engage _6_mo
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_non_expiring: z.string().nullish().describe(`
        * * Field Name: aud_mbr_non_expiring
        * * Display Name: aud _mbr _non _expiring
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_order_completed_allod: z.string().nullish().describe(`
        * * Field Name: aud_mbr_order_completed_allod
        * * Display Name: aud _mbr _order _completed _allod
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_tdw_exp_nov_2020: z.string().nullish().describe(`
        * * Field Name: aud_mbr_tdw_exp_nov_2020
        * * Display Name: aud _mbr _tdw _exp _nov _2020
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_zero_benefits: z.string().nullish().describe(`
        * * Field Name: aud_mbr_zero_benefits
        * * Display Name: aud _mbr _zero _benefits
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbr_zero_benefits_used: z.string().nullish().describe(`
        * * Field Name: aud_mbr_zero_benefits_used
        * * Display Name: aud _mbr _zero _benefits _used
        * * SQL Data Type: nvarchar(MAX)`),
    aud_mbrshp_purchased_last_90_days: z.string().nullish().describe(`
        * * Field Name: aud_mbrshp_purchased_last_90_days
        * * Display Name: aud _mbrshp _purchased _last _90_days
        * * SQL Data Type: nvarchar(MAX)`),
    aud_member_benefits_center_tab_clicked: z.string().nullish().describe(`
        * * Field Name: aud_member_benefits_center_tab_clicked
        * * Display Name: aud _member _benefits _center _tab _clicked
        * * SQL Data Type: nvarchar(MAX)`),
    aud_member_newsletter_openers: z.string().nullish().describe(`
        * * Field Name: aud_member_newsletter_openers
        * * Display Name: aud _member _newsletter _openers
        * * SQL Data Type: nvarchar(MAX)`),
    aud_members_onboarding: z.string().nullish().describe(`
        * * Field Name: aud_members_onboarding
        * * Display Name: aud _members _onboarding
        * * SQL Data Type: nvarchar(MAX)`),
    aud_members_with_available_benefits: z.string().nullish().describe(`
        * * Field Name: aud_members_with_available_benefits
        * * Display Name: aud _members _with _available _benefits
        * * SQL Data Type: nvarchar(MAX)`),
    aud_my_career_engagement: z.string().nullish().describe(`
        * * Field Name: aud_my_career_engagement
        * * Display Name: aud _my _career _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_my_career_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_my_career_topic_engagement
        * * Display Name: aud _my _career _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_net_new: z.string().nullish().describe(`
        * * Field Name: aud_net_new
        * * Display Name: aud _net _new
        * * SQL Data Type: nvarchar(MAX)`),
    aud_nonmembers: z.string().nullish().describe(`
        * * Field Name: aud_nonmembers
        * * Display Name: aud _nonmembers
        * * SQL Data Type: nvarchar(MAX)`),
    aud_performance_consulting_improvement_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_performance_consulting_improvement_topic_engagement
        * * Display Name: aud _performance _consulting _improvement _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_preference_change_management: z.string().nullish().describe(`
        * * Field Name: aud_preference_change_management
        * * Display Name: aud _preference _change _management
        * * SQL Data Type: nvarchar(MAX)`),
    aud_pubs_smr_sale_2020_target: z.string().nullish().describe(`
        * * Field Name: aud_pubs_smr_sale_2020_target
        * * Display Name: aud _pubs _smr _sale _2020_target
        * * SQL Data Type: nvarchar(MAX)`),
    aud_pubs_workshop_2022_purchasers: z.string().nullish().describe(`
        * * Field Name: aud_pubs_workshop_2022_purchasers
        * * Display Name: aud _pubs _workshop _2022_purchasers
        * * SQL Data Type: nvarchar(MAX)`),
    aud_purchased_books_starting_with_11_71_19_70: z.string().nullish().describe(`
        * * Field Name: aud_purchased_books_starting_with_11_71_19_70
        * * Display Name: aud _purchased _books _starting _with _11_71_19_70
        * * SQL Data Type: nvarchar(MAX)`),
    aud_sales_enablement_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_sales_enablement_topic_engagement
        * * Display Name: aud _sales _enablement _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_sales_force_working_leads: z.string().nullish().describe(`
        * * Field Name: aud_sales_force_working_leads
        * * Display Name: aud _sales _force _working _leads
        * * SQL Data Type: nvarchar(MAX)`),
    aud_sso_created_or_is_member: z.string().nullish().describe(`
        * * Field Name: aud_sso_created_or_is_member
        * * Display Name: aud _sso _created _or _is _member
        * * SQL Data Type: nvarchar(MAX)`),
    aud_talent_management_narrow_engagement: z.string().nullish().describe(`
        * * Field Name: aud_talent_management_narrow_engagement
        * * Display Name: aud _talent _management _narrow _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_talent_management_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_talent_management_topic_engagement
        * * Display Name: aud _talent _management _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_td_executive_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_td_executive_topic_engagement
        * * Display Name: aud _td _executive _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_topic_engagement_science_of_learning: z.string().nullish().describe(`
        * * Field Name: aud_topic_engagement_science_of_learning
        * * Display Name: aud _topic _engagement _science _of _learning
        * * SQL Data Type: nvarchar(MAX)`),
    aud_training_delivery_topic_engagement: z.string().nullish().describe(`
        * * Field Name: aud_training_delivery_topic_engagement
        * * Display Name: aud _training _delivery _topic _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    aud_unengaged_users: z.string().nullish().describe(`
        * * Field Name: aud_unengaged_users
        * * Display Name: aud _unengaged _users
        * * SQL Data Type: nvarchar(MAX)`),
    aud_virtual_fall_2020_core_4: z.string().nullish().describe(`
        * * Field Name: aud_virtual_fall_2020_core_4
        * * Display Name: aud _virtual _fall _2020_core _4
        * * SQL Data Type: nvarchar(MAX)`),
    aud_virtual_fall_2020_future_of_work: z.string().nullish().describe(`
        * * Field Name: aud_virtual_fall_2020_future_of_work
        * * Display Name: aud _virtual _fall _2020_future _of _work
        * * SQL Data Type: nvarchar(MAX)`),
    aud_virtual_fall_2020_org_dev: z.string().nullish().describe(`
        * * Field Name: aud_virtual_fall_2020_org_dev
        * * Display Name: aud _virtual _fall _2020_org _dev
        * * SQL Data Type: nvarchar(MAX)`),
    aud_webcast_email_engagement: z.string().nullish().describe(`
        * * Field Name: aud_webcast_email_engagement
        * * Display Name: aud _webcast _email _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    automatedNewsletters: z.string().nullish().describe(`
        * * Field Name: automatedNewsletters
        * * Display Name: automated Newsletters
        * * SQL Data Type: nvarchar(MAX)`),
    c_active_chapter_leader: z.string().nullish().describe(`
        * * Field Name: c_active_chapter_leader
        * * Display Name: c _active _chapter _leader
        * * SQL Data Type: nvarchar(MAX)`),
    c_aptd_holder: z.string().nullish().describe(`
        * * Field Name: c_aptd_holder
        * * Display Name: c _aptd _holder
        * * SQL Data Type: nvarchar(MAX)`),
    c_capability: z.string().nullish().describe(`
        * * Field Name: c_capability
        * * Display Name: c _capability
        * * SQL Data Type: nvarchar(MAX)`),
    c_capability_model_assessment_completion: z.string().nullish().describe(`
        * * Field Name: c_capability_model_assessment_completion
        * * Display Name: c _capability _model _assessment _completion
        * * SQL Data Type: nvarchar(MAX)`),
    c_chapter: z.string().nullish().describe(`
        * * Field Name: c_chapter
        * * Display Name: c _chapter
        * * SQL Data Type: nvarchar(MAX)`),
    c_closest_chapter_direction: z.string().nullish().describe(`
        * * Field Name: c_closest_chapter_direction
        * * Display Name: c _closest _chapter _direction
        * * SQL Data Type: nvarchar(MAX)`),
    c_closest_chapter_name: z.string().nullish().describe(`
        * * Field Name: c_closest_chapter_name
        * * Display Name: c _closest _chapter _name
        * * SQL Data Type: nvarchar(MAX)`),
    c_closest_chapter_state: z.string().nullish().describe(`
        * * Field Name: c_closest_chapter_state
        * * Display Name: c _closest _chapter _state
        * * SQL Data Type: nvarchar(MAX)`),
    c_consecutive_years_as_member: z.string().nullish().describe(`
        * * Field Name: c_consecutive_years_as_member
        * * Display Name: c _consecutive _years _as _member
        * * SQL Data Type: nvarchar(MAX)`),
    c_cptd_holder: z.string().nullish().describe(`
        * * Field Name: c_cptd_holder
        * * Display Name: c _cptd _holder
        * * SQL Data Type: nvarchar(MAX)`),
    c_edu_page_title_list_7_days: z.string().nullish().describe(`
        * * Field Name: c_edu_page_title_list_7_days
        * * Display Name: c _edu _page _title _list _7_days
        * * SQL Data Type: nvarchar(MAX)`),
    c_edu_products_purchased: z.string().nullish().describe(`
        * * Field Name: c_edu_products_purchased
        * * Display Name: c _edu _products _purchased
        * * SQL Data Type: nvarchar(MAX)`),
    c_education_pages_list: z.string().nullish().describe(`
        * * Field Name: c_education_pages_list
        * * Display Name: c _education _pages _list
        * * SQL Data Type: nvarchar(MAX)`),
    c_education_program_completed_last6months: z.string().nullish().describe(`
        * * Field Name: c_education_program_completed_last6months
        * * Display Name: c _education _program _completed _last 6months
        * * SQL Data Type: nvarchar(MAX)`),
    c_email_links_clicked: z.string().nullish().describe(`
        * * Field Name: c_email_links_clicked
        * * Display Name: c _email _links _clicked
        * * SQL Data Type: nvarchar(MAX)`),
    c_enterprise_company: z.string().nullish().describe(`
        * * Field Name: c_enterprise_company
        * * Display Name: c _enterprise _company
        * * SQL Data Type: nvarchar(MAX)`),
    c_enterprise_memberhip_acquisition_type: z.string().nullish().describe(`
        * * Field Name: c_enterprise_memberhip_acquisition_type
        * * Display Name: c _enterprise _memberhip _acquisition _type
        * * SQL Data Type: nvarchar(MAX)`),
    c_enterprise_membership_period_begin: z.string().nullish().describe(`
        * * Field Name: c_enterprise_membership_period_begin
        * * Display Name: c _enterprise _membership _period _begin
        * * SQL Data Type: nvarchar(MAX)`),
    c_enterprise_membership_period_end: z.string().nullish().describe(`
        * * Field Name: c_enterprise_membership_period_end
        * * Display Name: c _enterprise _membership _period _end
        * * SQL Data Type: nvarchar(MAX)`),
    c_enterprise_membership_renewal_date: z.string().nullish().describe(`
        * * Field Name: c_enterprise_membership_renewal_date
        * * Display Name: c _enterprise _membership _renewal _date
        * * SQL Data Type: nvarchar(MAX)`),
    c_enterprise_membership_retention_stage: z.string().nullish().describe(`
        * * Field Name: c_enterprise_membership_retention_stage
        * * Display Name: c _enterprise _membership _retention _stage
        * * SQL Data Type: nvarchar(MAX)`),
    c_enterprise_order_date: z.string().nullish().describe(`
        * * Field Name: c_enterprise_order_date
        * * Display Name: c _enterprise _order _date
        * * SQL Data Type: nvarchar(MAX)`),
    c_expire_chapter_leader_30_day: z.string().nullish().describe(`
        * * Field Name: c_expire_chapter_leader_30_day
        * * Display Name: c _expire _chapter _leader _30_day
        * * SQL Data Type: nvarchar(MAX)`),
    c_forms_submitted: z.string().nullish().describe(`
        * * Field Name: c_forms_submitted
        * * Display Name: c _forms _submitted
        * * SQL Data Type: nvarchar(MAX)`),
    c_initial_membership_date: z.string().nullish().describe(`
        * * Field Name: c_initial_membership_date
        * * Display Name: c _initial _membership _date
        * * SQL Data Type: nvarchar(MAX)`),
    c_is_closest_chapter_member: z.string().nullish().describe(`
        * * Field Name: c_is_closest_chapter_member
        * * Display Name: c _is _closest _chapter _member
        * * SQL Data Type: nvarchar(MAX)`),
    c_is_enterprise_member: z.string().nullish().describe(`
        * * Field Name: c_is_enterprise_member
        * * Display Name: c _is _enterprise _member
        * * SQL Data Type: nvarchar(MAX)`),
    c_is_member: z.string().nullish().describe(`
        * * Field Name: c_is_member
        * * Display Name: c _is _member
        * * SQL Data Type: nvarchar(MAX)`),
    c_is_power_member: z.string().nullish().describe(`
        * * Field Name: c_is_power_member
        * * Display Name: c _is _power _member
        * * SQL Data Type: nvarchar(MAX)`),
    c_is_senior_membership: z.string().nullish().describe(`
        * * Field Name: c_is_senior_membership
        * * Display Name: c _is _senior _membership
        * * SQL Data Type: nvarchar(MAX)`),
    c_is_student_membership: z.string().nullish().describe(`
        * * Field Name: c_is_student_membership
        * * Display Name: c _is _student _membership
        * * SQL Data Type: nvarchar(MAX)`),
    c_job_title_group: z.string().nullish().describe(`
        * * Field Name: c_job_title_group
        * * Display Name: c _job _title _group
        * * SQL Data Type: nvarchar(MAX)`),
    c_learning_plan_created: z.string().nullish().describe(`
        * * Field Name: c_learning_plan_created
        * * Display Name: c _learning _plan _created
        * * SQL Data Type: nvarchar(MAX)`),
    c_member_subtype: z.string().nullish().describe(`
        * * Field Name: c_member_subtype
        * * Display Name: c _member _subtype
        * * SQL Data Type: nvarchar(MAX)`),
    c_member_type: z.string().nullish().describe(`
        * * Field Name: c_member_type
        * * Display Name: c _member _type
        * * SQL Data Type: nvarchar(MAX)`),
    c_memberhip_retention_type: z.string().nullish().describe(`
        * * Field Name: c_memberhip_retention_type
        * * Display Name: c _memberhip _retention _type
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_acquisition_type: z.string().nullish().describe(`
        * * Field Name: c_membership_acquisition_type
        * * Display Name: c _membership _acquisition _type
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_auto_renew: z.string().nullish().describe(`
        * * Field Name: c_membership_auto_renew
        * * Display Name: c _membership _auto _renew
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_bundle: z.string().nullish().describe(`
        * * Field Name: c_membership_bundle
        * * Display Name: c _membership _bundle
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_conference_value_seeker: z.string().nullish().describe(`
        * * Field Name: c_membership_conference_value_seeker
        * * Display Name: c _membership _conference _value _seeker
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_education_value_seeker: z.string().nullish().describe(`
        * * Field Name: c_membership_education_value_seeker
        * * Display Name: c _membership _education _value _seeker
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_is_comp: z.string().nullish().describe(`
        * * Field Name: c_membership_is_comp
        * * Display Name: c _membership _is _comp
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_is_internal: z.string().nullish().describe(`
        * * Field Name: c_membership_is_internal
        * * Display Name: c _membership _is _internal
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_period_begin: z.string().nullish().describe(`
        * * Field Name: c_membership_period_begin
        * * Display Name: c _membership _period _begin
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_period_end: z.string().nullish().describe(`
        * * Field Name: c_membership_period_end
        * * Display Name: c _membership _period _end
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_pro_or_plus: z.string().nullish().describe(`
        * * Field Name: c_membership_pro_or_plus
        * * Display Name: c _membership _pro _or _plus
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_product: z.string().nullish().describe(`
        * * Field Name: c_membership_product
        * * Display Name: c _membership _product
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_rate_code: z.string().nullish().describe(`
        * * Field Name: c_membership_rate_code
        * * Display Name: c _membership _rate _code
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_renewal_date: z.string().nullish().describe(`
        * * Field Name: c_membership_renewal_date
        * * Display Name: c _membership _renewal _date
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_renewed_in: z.string().nullish().describe(`
        * * Field Name: c_membership_renewed_in
        * * Display Name: c _membership _renewed _in
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_retention_stage: z.string().nullish().describe(`
        * * Field Name: c_membership_retention_stage
        * * Display Name: c _membership _retention _stage
        * * SQL Data Type: nvarchar(MAX)`),
    c_membership_type_code: z.string().nullish().describe(`
        * * Field Name: c_membership_type_code
        * * Display Name: c _membership _type _code
        * * SQL Data Type: nvarchar(MAX)`),
    c_most_engaged_topic_web: z.string().nullish().describe(`
        * * Field Name: c_most_engaged_topic_web
        * * Display Name: c _most _engaged _topic _web
        * * SQL Data Type: nvarchar(MAX)`),
    c_onboarding_member: z.string().nullish().describe(`
        * * Field Name: c_onboarding_member
        * * Display Name: c _onboarding _member
        * * SQL Data Type: nvarchar(MAX)`),
    c_pages_visited: z.string().nullish().describe(`
        * * Field Name: c_pages_visited
        * * Display Name: c _pages _visited
        * * SQL Data Type: nvarchar(MAX)`),
    c_pages_visited_topics: z.string().nullish().describe(`
        * * Field Name: c_pages_visited_topics
        * * Display Name: c _pages _visited _topics
        * * SQL Data Type: nvarchar(MAX)`),
    c_product_purchase_topics: z.string().nullish().describe(`
        * * Field Name: c_product_purchase_topics
        * * Display Name: c _product _purchase _topics
        * * SQL Data Type: nvarchar(MAX)`),
    c_products_purchased: z.string().nullish().describe(`
        * * Field Name: c_products_purchased
        * * Display Name: c _products _purchased
        * * SQL Data Type: nvarchar(MAX)`),
    c_products_purchased_by_name: z.string().nullish().describe(`
        * * Field Name: c_products_purchased_by_name
        * * Display Name: c _products _purchased _by _name
        * * SQL Data Type: nvarchar(MAX)`),
    c_research_benefits_used: z.string().nullish().describe(`
        * * Field Name: c_research_benefits_used
        * * Display Name: c _research _benefits _used
        * * SQL Data Type: nvarchar(MAX)`),
    c_sfmc_newsletter_engagement: z.string().nullish().describe(`
        * * Field Name: c_sfmc_newsletter_engagement
        * * Display Name: c _sfmc _newsletter _engagement
        * * SQL Data Type: nvarchar(MAX)`),
    c_terminate_at_end: z.string().nullish().describe(`
        * * Field Name: c_terminate_at_end
        * * Display Name: c _terminate _at _end
        * * SQL Data Type: nvarchar(MAX)`),
    c_topics_followed: z.string().nullish().describe(`
        * * Field Name: c_topics_followed
        * * Display Name: c _topics _followed
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcast: z.string().nullish().describe(`
        * * Field Name: c_webcast
        * * Display Name: c _webcast
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcast_first_attendance_date: z.string().nullish().describe(`
        * * Field Name: c_webcast_first_attendance_date
        * * Display Name: c _webcast _first _attendance _date
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcast_first_registration_date: z.string().nullish().describe(`
        * * Field Name: c_webcast_first_registration_date
        * * Display Name: c _webcast _first _registration _date
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcast_id: z.string().nullish().describe(`
        * * Field Name: c_webcast_id
        * * Display Name: c _webcast _id
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcast_last_attendance_date: z.string().nullish().describe(`
        * * Field Name: c_webcast_last_attendance_date
        * * Display Name: c _webcast _last _attendance _date
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcast_last_registration_date: z.string().nullish().describe(`
        * * Field Name: c_webcast_last_registration_date
        * * Display Name: c _webcast _last _registration _date
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcast_name: z.string().nullish().describe(`
        * * Field Name: c_webcast_name
        * * Display Name: c _webcast _name
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcast_primary_tags: z.string().nullish().describe(`
        * * Field Name: c_webcast_primary_tags
        * * Display Name: c _webcast _primary _tags
        * * SQL Data Type: nvarchar(MAX)`),
    c_webcasts_attended: z.string().nullish().describe(`
        * * Field Name: c_webcasts_attended
        * * Display Name: c _webcasts _attended
        * * SQL Data Type: nvarchar(MAX)`),
    c_weeks_to_expire: z.string().nullish().describe(`
        * * Field Name: c_weeks_to_expire
        * * Display Name: c _weeks _to _expire
        * * SQL Data Type: nvarchar(MAX)`),
    c_wish_list_product_codes: z.string().nullish().describe(`
        * * Field Name: c_wish_list_product_codes
        * * Display Name: c _wish _list _product _codes
        * * SQL Data Type: nvarchar(MAX)`),
    c_with_list_product_codes: z.string().nullish().describe(`
        * * Field Name: c_with_list_product_codes
        * * Display Name: c _with _list _product _codes
        * * SQL Data Type: nvarchar(MAX)`),
    c_within_60_mile_radius_of_city: z.string().nullish().describe(`
        * * Field Name: c_within_60_mile_radius_of_city
        * * Display Name: c _within _60_mile _radius _of _city
        * * SQL Data Type: nvarchar(MAX)`),
    campaignName: z.string().nullish().describe(`
        * * Field Name: campaignName
        * * Display Name: campaign Name
        * * SQL Data Type: nvarchar(MAX)`),
    capabilitiesModelFirstTimeUsed: z.string().nullish().describe(`
        * * Field Name: capabilitiesModelFirstTimeUsed
        * * Display Name: capabilities Model First Time Used
        * * SQL Data Type: nvarchar(MAX)`),
    capabilitiesModelLastTimeUsed: z.string().nullish().describe(`
        * * Field Name: capabilitiesModelLastTimeUsed
        * * Display Name: capabilities Model Last Time Used
        * * SQL Data Type: nvarchar(MAX)`),
    cartAbandonmentProducts: z.string().nullish().describe(`
        * * Field Name: cartAbandonmentProducts
        * * Display Name: cart Abandonment Products
        * * SQL Data Type: nvarchar(MAX)`),
    city2: z.string().nullish().describe(`
        * * Field Name: city2
        * * Display Name: city 2
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_category_industry: z.string().nullish().describe(`
        * * Field Name: clearbit_company_category_industry
        * * Display Name: clearbit _company _category _industry
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_category_industry_group: z.string().nullish().describe(`
        * * Field Name: clearbit_company_category_industry_group
        * * Display Name: clearbit _company _category _industry _group
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_category_naics_code: z.string().nullish().describe(`
        * * Field Name: clearbit_company_category_naics_code
        * * Display Name: clearbit _company _category _naics _code
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_category_sector: z.string().nullish().describe(`
        * * Field Name: clearbit_company_category_sector
        * * Display Name: clearbit _company _category _sector
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_category_sic_code: z.string().nullish().describe(`
        * * Field Name: clearbit_company_category_sic_code
        * * Display Name: clearbit _company _category _sic _code
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_category_sub_industry: z.string().nullish().describe(`
        * * Field Name: clearbit_company_category_sub_industry
        * * Display Name: clearbit _company _category _sub _industry
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_geo_city: z.string().nullish().describe(`
        * * Field Name: clearbit_company_geo_city
        * * Display Name: clearbit _company _geo _city
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_geo_country: z.string().nullish().describe(`
        * * Field Name: clearbit_company_geo_country
        * * Display Name: clearbit _company _geo _country
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_geo_country_code: z.string().nullish().describe(`
        * * Field Name: clearbit_company_geo_country_code
        * * Display Name: clearbit _company _geo _country _code
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_geo_postal_code: z.string().nullish().describe(`
        * * Field Name: clearbit_company_geo_postal_code
        * * Display Name: clearbit _company _geo _postal _code
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_geo_state: z.string().nullish().describe(`
        * * Field Name: clearbit_company_geo_state
        * * Display Name: clearbit _company _geo _state
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_geo_state_code: z.string().nullish().describe(`
        * * Field Name: clearbit_company_geo_state_code
        * * Display Name: clearbit _company _geo _state _code
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_geo_street_name: z.string().nullish().describe(`
        * * Field Name: clearbit_company_geo_street_name
        * * Display Name: clearbit _company _geo _street _name
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_geo_street_number: z.string().nullish().describe(`
        * * Field Name: clearbit_company_geo_street_number
        * * Display Name: clearbit _company _geo _street _number
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_legal_name: z.string().nullish().describe(`
        * * Field Name: clearbit_company_legal_name
        * * Display Name: clearbit _company _legal _name
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_metrics_annual_revenue: z.string().nullish().describe(`
        * * Field Name: clearbit_company_metrics_annual_revenue
        * * Display Name: clearbit _company _metrics _annual _revenue
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_metrics_employees: z.string().nullish().describe(`
        * * Field Name: clearbit_company_metrics_employees
        * * Display Name: clearbit _company _metrics _employees
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_metrics_employees_range: z.string().nullish().describe(`
        * * Field Name: clearbit_company_metrics_employees_range
        * * Display Name: clearbit _company _metrics _employees _range
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_metrics_estimated_annual_revenue: z.string().nullish().describe(`
        * * Field Name: clearbit_company_metrics_estimated_annual_revenue
        * * Display Name: clearbit _company _metrics _estimated _annual _revenue
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_name: z.string().nullish().describe(`
        * * Field Name: clearbit_company_name
        * * Display Name: clearbit _company _name
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_tags: z.string().nullish().describe(`
        * * Field Name: clearbit_company_tags
        * * Display Name: clearbit _company _tags
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_company_type: z.string().nullish().describe(`
        * * Field Name: clearbit_company_type
        * * Display Name: clearbit _company _type
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_person_employment_role: z.string().nullish().describe(`
        * * Field Name: clearbit_person_employment_role
        * * Display Name: clearbit _person _employment _role
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_person_employment_seniority: z.string().nullish().describe(`
        * * Field Name: clearbit_person_employment_seniority
        * * Display Name: clearbit _person _employment _seniority
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_person_employment_title: z.string().nullish().describe(`
        * * Field Name: clearbit_person_employment_title
        * * Display Name: clearbit _person _employment _title
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_person_geo_city: z.string().nullish().describe(`
        * * Field Name: clearbit_person_geo_city
        * * Display Name: clearbit _person _geo _city
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_person_geo_country: z.string().nullish().describe(`
        * * Field Name: clearbit_person_geo_country
        * * Display Name: clearbit _person _geo _country
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_person_geo_country_code: z.string().nullish().describe(`
        * * Field Name: clearbit_person_geo_country_code
        * * Display Name: clearbit _person _geo _country _code
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_person_geo_state: z.string().nullish().describe(`
        * * Field Name: clearbit_person_geo_state
        * * Display Name: clearbit _person _geo _state
        * * SQL Data Type: nvarchar(MAX)`),
    clearbit_person_geo_state_code: z.string().nullish().describe(`
        * * Field Name: clearbit_person_geo_state_code
        * * Display Name: clearbit _person _geo _state _code
        * * SQL Data Type: nvarchar(MAX)`),
    company: z.string().nullish().describe(`
        * * Field Name: company
        * * Display Name: company
        * * SQL Data Type: nvarchar(MAX)`),
    companySizeCode: z.string().nullish().describe(`
        * * Field Name: companySizeCode
        * * Display Name: company Size Code
        * * SQL Data Type: nvarchar(MAX)`),
    companyname: z.string().nullish().describe(`
        * * Field Name: companyname
        * * Display Name: companyname
        * * SQL Data Type: nvarchar(MAX)`),
    conferenceRegistrations: z.string().nullish().describe(`
        * * Field Name: conferenceRegistrations
        * * Display Name: conference Registrations
        * * SQL Data Type: nvarchar(MAX)`),
    countryCode: z.string().nullish().describe(`
        * * Field Name: countryCode
        * * Display Name: country Code
        * * SQL Data Type: nvarchar(MAX)`),
    created: z.string().nullish().describe(`
        * * Field Name: created
        * * Display Name: created
        * * SQL Data Type: nvarchar(MAX)`),
    createdAt: z.string().nullish().describe(`
        * * Field Name: createdAt
        * * Display Name: created At
        * * SQL Data Type: nvarchar(MAX)`),
    ctdoSubscriber: z.string().nullish().describe(`
        * * Field Name: ctdoSubscriber
        * * Display Name: ctdo Subscriber
        * * SQL Data Type: nvarchar(MAX)`),
    directReportCountCode: z.string().nullish().describe(`
        * * Field Name: directReportCountCode
        * * Display Name: direct Report Count Code
        * * SQL Data Type: nvarchar(MAX)`),
    educationProducts: z.string().nullish().describe(`
        * * Field Name: educationProducts
        * * Display Name: education Products
        * * SQL Data Type: nvarchar(MAX)`),
    emailPreferences: z.string().nullish().describe(`
        * * Field Name: emailPreferences
        * * Display Name: email Preferences
        * * SQL Data Type: nvarchar(MAX)`),
    industryCode: z.string().nullish().describe(`
        * * Field Name: industryCode
        * * Display Name: industry Code
        * * SQL Data Type: nvarchar(MAX)`),
    isChapterLeader: z.string().nullish().describe(`
        * * Field Name: isChapterLeader
        * * Display Name: is Chapter Leader
        * * SQL Data Type: nvarchar(MAX)`),
    isChapterMember: z.string().nullish().describe(`
        * * Field Name: isChapterMember
        * * Display Name: is Chapter Member
        * * SQL Data Type: nvarchar(MAX)`),
    isEmailVerified: z.string().nullish().describe(`
        * * Field Name: isEmailVerified
        * * Display Name: is Email Verified
        * * SQL Data Type: nvarchar(MAX)`),
    isEnterpriseMember: z.string().nullish().describe(`
        * * Field Name: isEnterpriseMember
        * * Display Name: is Enterprise Member
        * * SQL Data Type: nvarchar(MAX)`),
    isFacilitator: z.string().nullish().describe(`
        * * Field Name: isFacilitator
        * * Display Name: is Facilitator
        * * SQL Data Type: nvarchar(MAX)`),
    isInterestedAutoRenewOffer: z.string().nullish().describe(`
        * * Field Name: isInterestedAutoRenewOffer
        * * Display Name: is Interested Auto Renew Offer
        * * SQL Data Type: nvarchar(MAX)`),
    isMember: z.string().nullish().describe(`
        * * Field Name: isMember
        * * Display Name: is Member
        * * SQL Data Type: nvarchar(MAX)`),
    isNewAndFirstTimeMember: z.string().nullish().describe(`
        * * Field Name: isNewAndFirstTimeMember
        * * Display Name: is New And First Time Member
        * * SQL Data Type: nvarchar(MAX)`),
    is_member: z.string().nullish().describe(`
        * * Field Name: is_member
        * * Display Name: is _member
        * * SQL Data Type: nvarchar(MAX)`),
    is_partner: z.string().nullish().describe(`
        * * Field Name: is_partner
        * * Display Name: is _partner
        * * SQL Data Type: nvarchar(MAX)`),
    jobFunctionCode: z.string().nullish().describe(`
        * * Field Name: jobFunctionCode
        * * Display Name: job Function Code
        * * SQL Data Type: nvarchar(MAX)`),
    jobTitle: z.string().nullish().describe(`
        * * Field Name: jobTitle
        * * Display Name: job Title
        * * SQL Data Type: nvarchar(MAX)`),
    mainActiveProducts: z.string().nullish().describe(`
        * * Field Name: mainActiveProducts
        * * Display Name: main Active Products
        * * SQL Data Type: nvarchar(MAX)`),
    order_count: z.string().nullish().describe(`
        * * Field Name: order_count
        * * Display Name: order _count
        * * SQL Data Type: nvarchar(MAX)`),
    personify_product_code: z.string().nullish().describe(`
        * * Field Name: personify_product_code
        * * Display Name: personify _product _code
        * * SQL Data Type: nvarchar(MAX)`),
    postalCode: z.string().nullish().describe(`
        * * Field Name: postalCode
        * * Display Name: postal Code
        * * SQL Data Type: nvarchar(MAX)`),
    productSubscriptions: z.string().nullish().describe(`
        * * Field Name: productSubscriptions
        * * Display Name: product Subscriptions
        * * SQL Data Type: nvarchar(MAX)`),
    profilePercentageCompleted: z.string().nullish().describe(`
        * * Field Name: profilePercentageCompleted
        * * Display Name: profile Percentage Completed
        * * SQL Data Type: nvarchar(MAX)`),
    roleCode: z.string().nullish().describe(`
        * * Field Name: roleCode
        * * Display Name: role Code
        * * SQL Data Type: nvarchar(MAX)`),
    state: z.string().nullish().describe(`
        * * Field Name: state
        * * Display Name: state
        * * SQL Data Type: nvarchar(MAX)`),
    tdAtWorkSubscriber: z.string().nullish().describe(`
        * * Field Name: tdAtWorkSubscriber
        * * Display Name: td At Work Subscriber
        * * SQL Data Type: nvarchar(MAX)`),
    teamSize: z.string().nullish().describe(`
        * * Field Name: teamSize
        * * Display Name: team Size
        * * SQL Data Type: nvarchar(MAX)`),
    title: z.string().nullish().describe(`
        * * Field Name: title
        * * Display Name: title
        * * SQL Data Type: nvarchar(MAX)`),
    topicsFollowed: z.string().nullish().describe(`
        * * Field Name: topicsFollowed
        * * Display Name: topics Followed
        * * SQL Data Type: nvarchar(MAX)`),
    tpmSubscriber: z.string().nullish().describe(`
        * * Field Name: tpmSubscriber
        * * Display Name: tpm Subscriber
        * * SQL Data Type: nvarchar(MAX)`),
    trainingBudgetCode: z.string().nullish().describe(`
        * * Field Name: trainingBudgetCode
        * * Display Name: training Budget Code
        * * SQL Data Type: nvarchar(MAX)`),
    created_at: z.string().nullish().describe(`
        * * Field Name: created_at
        * * Display Name: created _at
        * * SQL Data Type: nvarchar(MAX)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    TestEmail: z.string().nullish().describe(`
        * * Field Name: TestEmail
        * * Display Name: Test Email
        * * SQL Data Type: nvarchar(255)`),
});

export type PersonEntityType = z.infer<typeof PersonSchema>;
 
 

/**
 * Course Parts - strongly typed entity sub-class
 * * Schema: ATD
 * * Base Table: CoursePart
 * * Base View: vwCourseParts
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Course Parts')
export class CoursePartEntity extends BaseEntity<CoursePartEntityType> {
    /**
    * Loads the Course Parts record from the database
    * @param ID: number - primary key value to load the Course Parts record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CoursePartEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: varchar(255)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: CourseID
    * * Display Name: Course ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Courses (vwCourses.ID)
    */
    get CourseID(): number | null {
        return this.Get('CourseID');
    }
    set CourseID(value: number | null) {
        this.Set('CourseID', value);
    }

    /**
    * * Field Name: Text
    * * Display Name: Text
    * * SQL Data Type: nvarchar(MAX)
    */
    get Text(): string | null {
        return this.Get('Text');
    }
    set Text(value: string | null) {
        this.Set('Text', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Courses - strongly typed entity sub-class
 * * Schema: ATD
 * * Base Table: Course
 * * Base View: vwCourses
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Courses')
export class CourseEntity extends BaseEntity<CourseEntityType> {
    /**
    * Loads the Courses record from the database
    * @param ID: number - primary key value to load the Courses record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof CourseEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: Name
    * * Display Name: Name
    * * SQL Data Type: varchar(255)
    */
    get Name(): string | null {
        return this.Get('Name');
    }
    set Name(value: string | null) {
        this.Set('Name', value);
    }

    /**
    * * Field Name: Description
    * * Display Name: Description
    * * SQL Data Type: nvarchar(MAX)
    */
    get Description(): string | null {
        return this.Get('Description');
    }
    set Description(value: string | null) {
        this.Set('Description', value);
    }

    /**
    * * Field Name: WebLink
    * * Display Name: Web Link
    * * SQL Data Type: varchar(255)
    */
    get WebLink(): string | null {
        return this.Get('WebLink');
    }
    set WebLink(value: string | null) {
        this.Set('WebLink', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Person Education Histories - strongly typed entity sub-class
 * * Schema: ATD
 * * Base Table: PersonEducationHistory
 * * Base View: vwPersonEducationHistories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Person Education Histories')
export class PersonEducationHistoryEntity extends BaseEntity<PersonEducationHistoryEntityType> {
    /**
    * Loads the Person Education Histories record from the database
    * @param ID: number - primary key value to load the Person Education Histories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PersonEducationHistoryEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Persons (vwPersons.ID)
    */
    get PersonID(): number {
        return this.Get('PersonID');
    }
    set PersonID(value: number) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: Institution
    * * Display Name: Institution
    * * SQL Data Type: nvarchar(50)
    */
    get Institution(): string {
        return this.Get('Institution');
    }
    set Institution(value: string) {
        this.Set('Institution', value);
    }

    /**
    * * Field Name: Degree
    * * Display Name: Degree
    * * SQL Data Type: nvarchar(50)
    */
    get Degree(): string {
        return this.Get('Degree');
    }
    set Degree(value: string) {
        this.Set('Degree', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    */
    get StartedAt(): Date | null {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    */
    get EndedAt(): Date | null {
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: Major
    * * Display Name: Major
    * * SQL Data Type: nvarchar(50)
    */
    get Major(): string | null {
        return this.Get('Major');
    }
    set Major(value: string | null) {
        this.Set('Major', value);
    }

    /**
    * * Field Name: Kind
    * * Display Name: Kind
    * * SQL Data Type: nvarchar(50)
    */
    get Kind(): string | null {
        return this.Get('Kind');
    }
    set Kind(value: string | null) {
        this.Set('Kind', value);
    }

    /**
    * * Field Name: GradeLevel
    * * Display Name: Grade Level
    * * SQL Data Type: int
    */
    get GradeLevel(): number | null {
        return this.Get('GradeLevel');
    }
    set GradeLevel(value: number | null) {
        this.Set('GradeLevel', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get UpdatedAt(): Date {
        return this.Get('UpdatedAt');
    }
    set UpdatedAt(value: Date) {
        this.Set('UpdatedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Person Employment Histories - strongly typed entity sub-class
 * * Schema: ATD
 * * Base Table: PersonEmploymentHistory
 * * Base View: vwPersonEmploymentHistories
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Person Employment Histories')
export class PersonEmploymentHistoryEntity extends BaseEntity<PersonEmploymentHistoryEntityType> {
    /**
    * Loads the Person Employment Histories record from the database
    * @param ID: number - primary key value to load the Person Employment Histories record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PersonEmploymentHistoryEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person ID
    * * SQL Data Type: int
    * * Related Entity/Foreign Key: Persons (vwPersons.ID)
    */
    get PersonID(): number {
        return this.Get('PersonID');
    }
    set PersonID(value: number) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: IsCurrent
    * * Display Name: Is Current
    * * SQL Data Type: bit
    * * Default Value: 0
    */
    get IsCurrent(): boolean {
        return this.Get('IsCurrent');
    }
    set IsCurrent(value: boolean) {
        this.Set('IsCurrent', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(100)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Organization
    * * Display Name: Organization
    * * SQL Data Type: nvarchar(50)
    */
    get Organization(): string {
        return this.Get('Organization');
    }
    set Organization(value: string) {
        this.Set('Organization', value);
    }

    /**
    * * Field Name: AccountID
    * * Display Name: Account ID
    * * SQL Data Type: int
    */
    get AccountID(): number | null {
        return this.Get('AccountID');
    }
    set AccountID(value: number | null) {
        this.Set('AccountID', value);
    }

    /**
    * * Field Name: StartedAt
    * * Display Name: Started At
    * * SQL Data Type: datetime
    */
    get StartedAt(): Date | null {
        return this.Get('StartedAt');
    }
    set StartedAt(value: Date | null) {
        this.Set('StartedAt', value);
    }

    /**
    * * Field Name: EndedAt
    * * Display Name: Ended At
    * * SQL Data Type: datetime
    */
    get EndedAt(): Date | null {
        return this.Get('EndedAt');
    }
    set EndedAt(value: Date | null) {
        this.Set('EndedAt', value);
    }

    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedAt(): Date {
        return this.Get('CreatedAt');
    }
    set CreatedAt(value: Date) {
        this.Set('CreatedAt', value);
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get UpdatedAt(): Date {
        return this.Get('UpdatedAt');
    }
    set UpdatedAt(value: Date) {
        this.Set('UpdatedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * Persons - strongly typed entity sub-class
 * * Schema: ATD
 * * Base Table: Person
 * * Base View: vwPersons
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Persons')
export class PersonEntity extends BaseEntity<PersonEntityType> {
    /**
    * Loads the Persons record from the database
    * @param ID: number - primary key value to load the Persons record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof PersonEntity
    * @method
    * @override
    */
    public async Load(ID: number, EntityRelationshipsToLoad: string[] = null) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: int
    */
    get ID(): number {
        return this.Get('ID');
    }

    /**
    * * Field Name: first_name
    * * Display Name: first _name
    * * SQL Data Type: nvarchar(MAX)
    */
    get first_name(): string | null {
        return this.Get('first_name');
    }
    set first_name(value: string | null) {
        this.Set('first_name', value);
    }

    /**
    * * Field Name: timezone
    * * Display Name: timezone
    * * SQL Data Type: nvarchar(MAX)
    */
    get timezone(): string | null {
        return this.Get('timezone');
    }
    set timezone(value: string | null) {
        this.Set('timezone', value);
    }

    /**
    * * Field Name: city
    * * Display Name: city
    * * SQL Data Type: nvarchar(MAX)
    */
    get city(): string | null {
        return this.Get('city');
    }
    set city(value: string | null) {
        this.Set('city', value);
    }

    /**
    * * Field Name: email
    * * Display Name: email
    * * SQL Data Type: nvarchar(MAX)
    */
    get email(): string | null {
        return this.Get('email');
    }
    set email(value: string | null) {
        this.Set('email', value);
    }

    /**
    * * Field Name: session_count
    * * Display Name: session _count
    * * SQL Data Type: nvarchar(MAX)
    */
    get session_count(): string | null {
        return this.Get('session_count');
    }
    set session_count(value: string | null) {
        this.Set('session_count', value);
    }

    /**
    * * Field Name: first_session
    * * Display Name: first _session
    * * SQL Data Type: nvarchar(MAX)
    */
    get first_session(): string | null {
        return this.Get('first_session');
    }
    set first_session(value: string | null) {
        this.Set('first_session', value);
    }

    /**
    * * Field Name: last_session
    * * Display Name: last _session
    * * SQL Data Type: nvarchar(MAX)
    */
    get last_session(): string | null {
        return this.Get('last_session');
    }
    set last_session(value: string | null) {
        this.Set('last_session', value);
    }

    /**
    * * Field Name: in_app_purchase_total
    * * Display Name: in _app _purchase _total
    * * SQL Data Type: nvarchar(MAX)
    */
    get in_app_purchase_total(): string | null {
        return this.Get('in_app_purchase_total');
    }
    set in_app_purchase_total(value: string | null) {
        this.Set('in_app_purchase_total', value);
    }

    /**
    * * Field Name: unsubscribed_from_emails_at
    * * Display Name: unsubscribed _from _emails _at
    * * SQL Data Type: nvarchar(MAX)
    */
    get unsubscribed_from_emails_at(): string | null {
        return this.Get('unsubscribed_from_emails_at');
    }
    set unsubscribed_from_emails_at(value: string | null) {
        this.Set('unsubscribed_from_emails_at', value);
    }

    /**
    * * Field Name: active_resource_center_members_last_6_months
    * * Display Name: active _resource _center _members _last _6_months
    * * SQL Data Type: nvarchar(MAX)
    */
    get active_resource_center_members_last_6_months(): string | null {
        return this.Get('active_resource_center_members_last_6_months');
    }
    set active_resource_center_members_last_6_months(value: string | null) {
        this.Set('active_resource_center_members_last_6_months', value);
    }

    /**
    * * Field Name: allowPhone
    * * Display Name: allow Phone
    * * SQL Data Type: nvarchar(MAX)
    */
    get allowPhone(): string | null {
        return this.Get('allowPhone');
    }
    set allowPhone(value: string | null) {
        this.Set('allowPhone', value);
    }

    /**
    * * Field Name: allowSolicitation
    * * Display Name: allow Solicitation
    * * SQL Data Type: nvarchar(MAX)
    */
    get allowSolicitation(): string | null {
        return this.Get('allowSolicitation');
    }
    set allowSolicitation(value: string | null) {
        this.Set('allowSolicitation', value);
    }

    /**
    * * Field Name: aud_awards_website_and_webcasts
    * * Display Name: aud _awards _website _and _webcasts
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_awards_website_and_webcasts(): string | null {
        return this.Get('aud_awards_website_and_webcasts');
    }
    set aud_awards_website_and_webcasts(value: string | null) {
        this.Set('aud_awards_website_and_webcasts', value);
    }

    /**
    * * Field Name: aud_change_management_topic_engagement
    * * Display Name: aud _change _management _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_change_management_topic_engagement(): string | null {
        return this.Get('aud_change_management_topic_engagement');
    }
    set aud_change_management_topic_engagement(value: string | null) {
        this.Set('aud_change_management_topic_engagement', value);
    }

    /**
    * * Field Name: aud_ci_aptd_high_interest
    * * Display Name: aud _ci _aptd _high _interest
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ci_aptd_high_interest(): string | null {
        return this.Get('aud_ci_aptd_high_interest');
    }
    set aud_ci_aptd_high_interest(value: string | null) {
        this.Set('aud_ci_aptd_high_interest', value);
    }

    /**
    * * Field Name: aud_ci_aptd_prep_purchases
    * * Display Name: aud _ci _aptd _prep _purchases
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ci_aptd_prep_purchases(): string | null {
        return this.Get('aud_ci_aptd_prep_purchases');
    }
    set aud_ci_aptd_prep_purchases(value: string | null) {
        this.Set('aud_ci_aptd_prep_purchases', value);
    }

    /**
    * * Field Name: aud_ci_aptd_web_interest
    * * Display Name: aud _ci _aptd _web _interest
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ci_aptd_web_interest(): string | null {
        return this.Get('aud_ci_aptd_web_interest');
    }
    set aud_ci_aptd_web_interest(value: string | null) {
        this.Set('aud_ci_aptd_web_interest', value);
    }

    /**
    * * Field Name: aud_ci_bok_purchases
    * * Display Name: aud _ci _bok _purchases
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ci_bok_purchases(): string | null {
        return this.Get('aud_ci_bok_purchases');
    }
    set aud_ci_bok_purchases(value: string | null) {
        this.Set('aud_ci_bok_purchases', value);
    }

    /**
    * * Field Name: aud_ci_cplp_interest_group
    * * Display Name: aud _ci _cplp _interest _group
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ci_cplp_interest_group(): string | null {
        return this.Get('aud_ci_cplp_interest_group');
    }
    set aud_ci_cplp_interest_group(value: string | null) {
        this.Set('aud_ci_cplp_interest_group', value);
    }

    /**
    * * Field Name: aud_ci_general_certification_interest_group
    * * Display Name: aud _ci _general _certification _interest _group
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ci_general_certification_interest_group(): string | null {
        return this.Get('aud_ci_general_certification_interest_group');
    }
    set aud_ci_general_certification_interest_group(value: string | null) {
        this.Set('aud_ci_general_certification_interest_group', value);
    }

    /**
    * * Field Name: aud_ci_masters_more_than_6_mo
    * * Display Name: aud _ci _masters _more _than _6_mo
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ci_masters_more_than_6_mo(): string | null {
        return this.Get('aud_ci_masters_more_than_6_mo');
    }
    set aud_ci_masters_more_than_6_mo(value: string | null) {
        this.Set('aud_ci_masters_more_than_6_mo', value);
    }

    /**
    * * Field Name: aud_con_atd_yale_2020_purchased
    * * Display Name: aud _con _atd _yale _2020_purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_atd_yale_2020_purchased(): string | null {
        return this.Get('aud_con_atd_yale_2020_purchased');
    }
    set aud_con_atd_yale_2020_purchased(value: string | null) {
        this.Set('aud_con_atd_yale_2020_purchased', value);
    }

    /**
    * * Field Name: aud_con_core_42020_chicago_purchased
    * * Display Name: aud _con _core _42020_chicago _purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_core_42020_chicago_purchased(): string | null {
        return this.Get('aud_con_core_42020_chicago_purchased');
    }
    set aud_con_core_42020_chicago_purchased(value: string | null) {
        this.Set('aud_con_core_42020_chicago_purchased', value);
    }

    /**
    * * Field Name: aud_con_core_4_2020_chicago_cart_abandonment
    * * Display Name: aud _con _core _4_2020_chicago _cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_core_4_2020_chicago_cart_abandonment(): string | null {
        return this.Get('aud_con_core_4_2020_chicago_cart_abandonment');
    }
    set aud_con_core_4_2020_chicago_cart_abandonment(value: string | null) {
        this.Set('aud_con_core_4_2020_chicago_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_core_4_2020_nashville_cart_abandonment
    * * Display Name: aud _con _core _4_2020_nashville _cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_core_4_2020_nashville_cart_abandonment(): string | null {
        return this.Get('aud_con_core_4_2020_nashville_cart_abandonment');
    }
    set aud_con_core_4_2020_nashville_cart_abandonment(value: string | null) {
        this.Set('aud_con_core_4_2020_nashville_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_core_4_2020_nashville_purchased
    * * Display Name: aud _con _core _4_2020_nashville _purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_core_4_2020_nashville_purchased(): string | null {
        return this.Get('aud_con_core_4_2020_nashville_purchased');
    }
    set aud_con_core_4_2020_nashville_purchased(value: string | null) {
        this.Set('aud_con_core_4_2020_nashville_purchased', value);
    }

    /**
    * * Field Name: aud_con_core_4_2020_website_visitors
    * * Display Name: aud _con _core _4_2020_website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_core_4_2020_website_visitors(): string | null {
        return this.Get('aud_con_core_4_2020_website_visitors');
    }
    set aud_con_core_4_2020_website_visitors(value: string | null) {
        this.Set('aud_con_core_4_2020_website_visitors', value);
    }

    /**
    * * Field Name: aud_con_dir_job_function
    * * Display Name: aud _con _dir _job _function
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_dir_job_function(): string | null {
        return this.Get('aud_con_dir_job_function');
    }
    set aud_con_dir_job_function(value: string | null) {
        this.Set('aud_con_dir_job_function', value);
    }

    /**
    * * Field Name: aud_con_edu_tk_2020_precon_pages_visitors
    * * Display Name: aud _con _edu _tk _2020_precon _pages _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_edu_tk_2020_precon_pages_visitors(): string | null {
        return this.Get('aud_con_edu_tk_2020_precon_pages_visitors');
    }
    set aud_con_edu_tk_2020_precon_pages_visitors(value: string | null) {
        this.Set('aud_con_edu_tk_2020_precon_pages_visitors', value);
    }

    /**
    * * Field Name: aud_con_gov_wf_2020_cart_abandonment
    * * Display Name: aud _con _gov _wf _2020_cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_gov_wf_2020_cart_abandonment(): string | null {
        return this.Get('aud_con_gov_wf_2020_cart_abandonment');
    }
    set aud_con_gov_wf_2020_cart_abandonment(value: string | null) {
        this.Set('aud_con_gov_wf_2020_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_gov_wf_2020_website_visitors
    * * Display Name: aud _con _gov _wf _2020_website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_gov_wf_2020_website_visitors(): string | null {
        return this.Get('aud_con_gov_wf_2020_website_visitors');
    }
    set aud_con_gov_wf_2020_website_visitors(value: string | null) {
        this.Set('aud_con_gov_wf_2020_website_visitors', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_cart_abandonment
    * * Display Name: aud _con _ice _2020_cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_cart_abandonment(): string | null {
        return this.Get('aud_con_ice_2020_cart_abandonment');
    }
    set aud_con_ice_2020_cart_abandonment(value: string | null) {
        this.Set('aud_con_ice_2020_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_consideration_target
    * * Display Name: aud _con _ice _2020_consideration _target
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_consideration_target(): string | null {
        return this.Get('aud_con_ice_2020_consideration_target');
    }
    set aud_con_ice_2020_consideration_target(value: string | null) {
        this.Set('aud_con_ice_2020_consideration_target', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_eb_last_chance_openers
    * * Display Name: aud _con _ice _2020_eb _last _chance _openers
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_eb_last_chance_openers(): string | null {
        return this.Get('aud_con_ice_2020_eb_last_chance_openers');
    }
    set aud_con_ice_2020_eb_last_chance_openers(value: string | null) {
        this.Set('aud_con_ice_2020_eb_last_chance_openers', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_email_clickers
    * * Display Name: aud _con _ice _2020_email _clickers
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_email_clickers(): string | null {
        return this.Get('aud_con_ice_2020_email_clickers');
    }
    set aud_con_ice_2020_email_clickers(value: string | null) {
        this.Set('aud_con_ice_2020_email_clickers', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_email_opened
    * * Display Name: aud _con _ice _2020_email _opened
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_email_opened(): string | null {
        return this.Get('aud_con_ice_2020_email_opened');
    }
    set aud_con_ice_2020_email_opened(value: string | null) {
        this.Set('aud_con_ice_2020_email_opened', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_purchased
    * * Display Name: aud _con _ice _2020_purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_purchased(): string | null {
        return this.Get('aud_con_ice_2020_purchased');
    }
    set aud_con_ice_2020_purchased(value: string | null) {
        this.Set('aud_con_ice_2020_purchased', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_reg_page_visitors
    * * Display Name: aud _con _ice _2020_reg _page _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_reg_page_visitors(): string | null {
        return this.Get('aud_con_ice_2020_reg_page_visitors');
    }
    set aud_con_ice_2020_reg_page_visitors(value: string | null) {
        this.Set('aud_con_ice_2020_reg_page_visitors', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_team_target
    * * Display Name: aud _con _ice _2020_team _target
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_team_target(): string | null {
        return this.Get('aud_con_ice_2020_team_target');
    }
    set aud_con_ice_2020_team_target(value: string | null) {
        this.Set('aud_con_ice_2020_team_target', value);
    }

    /**
    * * Field Name: aud_con_ice_2020_website_visitors
    * * Display Name: aud _con _ice _2020_website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_ice_2020_website_visitors(): string | null {
        return this.Get('aud_con_ice_2020_website_visitors');
    }
    set aud_con_ice_2020_website_visitors(value: string | null) {
        this.Set('aud_con_ice_2020_website_visitors', value);
    }

    /**
    * * Field Name: aud_con_mbr_lapsed_10_31_19
    * * Display Name: aud _con _mbr _lapsed _10_31_19
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_mbr_lapsed_10_31_19(): string | null {
        return this.Get('aud_con_mbr_lapsed_10_31_19');
    }
    set aud_con_mbr_lapsed_10_31_19(value: string | null) {
        this.Set('aud_con_mbr_lapsed_10_31_19', value);
    }

    /**
    * * Field Name: aud_con_org_dev_2020_cart_abandonment
    * * Display Name: aud _con _org _dev _2020_cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_org_dev_2020_cart_abandonment(): string | null {
        return this.Get('aud_con_org_dev_2020_cart_abandonment');
    }
    set aud_con_org_dev_2020_cart_abandonment(value: string | null) {
        this.Set('aud_con_org_dev_2020_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_org_dev_2020_purchased
    * * Display Name: aud _con _org _dev _2020_purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_org_dev_2020_purchased(): string | null {
        return this.Get('aud_con_org_dev_2020_purchased');
    }
    set aud_con_org_dev_2020_purchased(value: string | null) {
        this.Set('aud_con_org_dev_2020_purchased', value);
    }

    /**
    * * Field Name: aud_con_org_dev_2020_website_visitors
    * * Display Name: aud _con _org _dev _2020_website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_org_dev_2020_website_visitors(): string | null {
        return this.Get('aud_con_org_dev_2020_website_visitors');
    }
    set aud_con_org_dev_2020_website_visitors(value: string | null) {
        this.Set('aud_con_org_dev_2020_website_visitors', value);
    }

    /**
    * * Field Name: aud_con_purchase_last_6_months
    * * Display Name: aud _con _purchase _last _6_months
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_purchase_last_6_months(): string | null {
        return this.Get('aud_con_purchase_last_6_months');
    }
    set aud_con_purchase_last_6_months(value: string | null) {
        this.Set('aud_con_purchase_last_6_months', value);
    }

    /**
    * * Field Name: aud_con_sell_2020_cart_abandonment
    * * Display Name: aud _con _sell _2020_cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_sell_2020_cart_abandonment(): string | null {
        return this.Get('aud_con_sell_2020_cart_abandonment');
    }
    set aud_con_sell_2020_cart_abandonment(value: string | null) {
        this.Set('aud_con_sell_2020_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_sell_2020_purchased
    * * Display Name: aud _con _sell _2020_purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_sell_2020_purchased(): string | null {
        return this.Get('aud_con_sell_2020_purchased');
    }
    set aud_con_sell_2020_purchased(value: string | null) {
        this.Set('aud_con_sell_2020_purchased', value);
    }

    /**
    * * Field Name: aud_con_sell_2020_website_visitors
    * * Display Name: aud _con _sell _2020_website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_sell_2020_website_visitors(): string | null {
        return this.Get('aud_con_sell_2020_website_visitors');
    }
    set aud_con_sell_2020_website_visitors(value: string | null) {
        this.Set('aud_con_sell_2020_website_visitors', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_consideration_target
    * * Display Name: aud _con _tk _2020_consideration _target
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_consideration_target(): string | null {
        return this.Get('aud_con_tk_2020_consideration_target');
    }
    set aud_con_tk_2020_consideration_target(value: string | null) {
        this.Set('aud_con_tk_2020_consideration_target', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_email_clickers
    * * Display Name: aud _con _tk _2020_email _clickers
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_email_clickers(): string | null {
        return this.Get('aud_con_tk_2020_email_clickers');
    }
    set aud_con_tk_2020_email_clickers(value: string | null) {
        this.Set('aud_con_tk_2020_email_clickers', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_email_opened
    * * Display Name: aud _con _tk _2020_email _opened
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_email_opened(): string | null {
        return this.Get('aud_con_tk_2020_email_opened');
    }
    set aud_con_tk_2020_email_opened(value: string | null) {
        this.Set('aud_con_tk_2020_email_opened', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_mbr_bundle
    * * Display Name: aud _con _tk _2020_mbr _bundle
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_mbr_bundle(): string | null {
        return this.Get('aud_con_tk_2020_mbr_bundle');
    }
    set aud_con_tk_2020_mbr_bundle(value: string | null) {
        this.Set('aud_con_tk_2020_mbr_bundle', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_medina_wkshp_registrants
    * * Display Name: aud _con _tk _2020_medina _wkshp _registrants
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_medina_wkshp_registrants(): string | null {
        return this.Get('aud_con_tk_2020_medina_wkshp_registrants');
    }
    set aud_con_tk_2020_medina_wkshp_registrants(value: string | null) {
        this.Set('aud_con_tk_2020_medina_wkshp_registrants', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_medina_workshop_page_visitors
    * * Display Name: aud _con _tk _2020_medina _workshop _page _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_medina_workshop_page_visitors(): string | null {
        return this.Get('aud_con_tk_2020_medina_workshop_page_visitors');
    }
    set aud_con_tk_2020_medina_workshop_page_visitors(value: string | null) {
        this.Set('aud_con_tk_2020_medina_workshop_page_visitors', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_plustk_2020_purchased
    * * Display Name: aud _con _tk _2020_plustk _2020_purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_plustk_2020_purchased(): string | null {
        return this.Get('aud_con_tk_2020_plustk_2020_purchased');
    }
    set aud_con_tk_2020_plustk_2020_purchased(value: string | null) {
        this.Set('aud_con_tk_2020_plustk_2020_purchased', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_purchased
    * * Display Name: aud _con _tk _2020_purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_purchased(): string | null {
        return this.Get('aud_con_tk_2020_purchased');
    }
    set aud_con_tk_2020_purchased(value: string | null) {
        this.Set('aud_con_tk_2020_purchased', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_reg_page_visitors
    * * Display Name: aud _con _tk _2020_reg _page _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_reg_page_visitors(): string | null {
        return this.Get('aud_con_tk_2020_reg_page_visitors');
    }
    set aud_con_tk_2020_reg_page_visitors(value: string | null) {
        this.Set('aud_con_tk_2020_reg_page_visitors', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_registrant_feedback_email_opens
    * * Display Name: aud _con _tk _2020_registrant _feedback _email _opens
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_registrant_feedback_email_opens(): string | null {
        return this.Get('aud_con_tk_2020_registrant_feedback_email_opens');
    }
    set aud_con_tk_2020_registrant_feedback_email_opens(value: string | null) {
        this.Set('aud_con_tk_2020_registrant_feedback_email_opens', value);
    }

    /**
    * * Field Name: aud_con_tk_2020_website_visitors
    * * Display Name: aud _con _tk _2020_website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_2020_website_visitors(): string | null {
        return this.Get('aud_con_tk_2020_website_visitors');
    }
    set aud_con_tk_2020_website_visitors(value: string | null) {
        this.Set('aud_con_tk_2020_website_visitors', value);
    }

    /**
    * * Field Name: aud_con_tk_cart_abandonment
    * * Display Name: aud _con _tk _cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_tk_cart_abandonment(): string | null {
        return this.Get('aud_con_tk_cart_abandonment');
    }
    set aud_con_tk_cart_abandonment(value: string | null) {
        this.Set('aud_con_tk_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_vc_2_2020_cart_abandonment
    * * Display Name: aud _con _vc _2_2020_cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_vc_2_2020_cart_abandonment(): string | null {
        return this.Get('aud_con_vc_2_2020_cart_abandonment');
    }
    set aud_con_vc_2_2020_cart_abandonment(value: string | null) {
        this.Set('aud_con_vc_2_2020_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_virtual_2020_website_visitors
    * * Display Name: aud _con _virtual _2020_website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_virtual_2020_website_visitors(): string | null {
        return this.Get('aud_con_virtual_2020_website_visitors');
    }
    set aud_con_virtual_2020_website_visitors(value: string | null) {
        this.Set('aud_con_virtual_2020_website_visitors', value);
    }

    /**
    * * Field Name: aud_con_virtual_conference_website_visitors
    * * Display Name: aud _con _virtual _conference _website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_virtual_conference_website_visitors(): string | null {
        return this.Get('aud_con_virtual_conference_website_visitors');
    }
    set aud_con_virtual_conference_website_visitors(value: string | null) {
        this.Set('aud_con_virtual_conference_website_visitors', value);
    }

    /**
    * * Field Name: aud_con_west_coast_states
    * * Display Name: aud _con _west _coast _states
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_west_coast_states(): string | null {
        return this.Get('aud_con_west_coast_states');
    }
    set aud_con_west_coast_states(value: string | null) {
        this.Set('aud_con_west_coast_states', value);
    }

    /**
    * * Field Name: aud_con_yale_2020_cart_abandonment
    * * Display Name: aud _con _yale _2020_cart _abandonment
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_yale_2020_cart_abandonment(): string | null {
        return this.Get('aud_con_yale_2020_cart_abandonment');
    }
    set aud_con_yale_2020_cart_abandonment(value: string | null) {
        this.Set('aud_con_yale_2020_cart_abandonment', value);
    }

    /**
    * * Field Name: aud_con_yale_2020_dir_job_function
    * * Display Name: aud _con _yale _2020_dir _job _function
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_yale_2020_dir_job_function(): string | null {
        return this.Get('aud_con_yale_2020_dir_job_function');
    }
    set aud_con_yale_2020_dir_job_function(value: string | null) {
        this.Set('aud_con_yale_2020_dir_job_function', value);
    }

    /**
    * * Field Name: aud_con_yale_2020_email_clickers
    * * Display Name: aud _con _yale _2020_email _clickers
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_yale_2020_email_clickers(): string | null {
        return this.Get('aud_con_yale_2020_email_clickers');
    }
    set aud_con_yale_2020_email_clickers(value: string | null) {
        this.Set('aud_con_yale_2020_email_clickers', value);
    }

    /**
    * * Field Name: aud_con_yale_2020_website_visitors
    * * Display Name: aud _con _yale _2020_website _visitors
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_con_yale_2020_website_visitors(): string | null {
        return this.Get('aud_con_yale_2020_website_visitors');
    }
    set aud_con_yale_2020_website_visitors(value: string | null) {
        this.Set('aud_con_yale_2020_website_visitors', value);
    }

    /**
    * * Field Name: aud_conf_vc_2_telemarketing_hot_leads
    * * Display Name: aud _conf _vc _2_telemarketing _hot _leads
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_conf_vc_2_telemarketing_hot_leads(): string | null {
        return this.Get('aud_conf_vc_2_telemarketing_hot_leads');
    }
    set aud_conf_vc_2_telemarketing_hot_leads(value: string | null) {
        this.Set('aud_conf_vc_2_telemarketing_hot_leads', value);
    }

    /**
    * * Field Name: aud_ctdo_next
    * * Display Name: aud _ctdo _next
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ctdo_next(): string | null {
        return this.Get('aud_ctdo_next');
    }
    set aud_ctdo_next(value: string | null) {
        this.Set('aud_ctdo_next', value);
    }

    /**
    * * Field Name: aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers
    * * Display Name: aud _edu _allmasterprograms _pagevisitors _last _12_mo _less _masters _purchasers
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers(): string | null {
        return this.Get('aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers');
    }
    set aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers(value: string | null) {
        this.Set('aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers', value);
    }

    /**
    * * Field Name: aud_edu_allmasterprograms_pagevisitors_last_6_mo
    * * Display Name: aud _edu _allmasterprograms _pagevisitors _last _6_mo
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_allmasterprograms_pagevisitors_last_6_mo(): string | null {
        return this.Get('aud_edu_allmasterprograms_pagevisitors_last_6_mo');
    }
    set aud_edu_allmasterprograms_pagevisitors_last_6_mo(value: string | null) {
        this.Set('aud_edu_allmasterprograms_pagevisitors_last_6_mo', value);
    }

    /**
    * * Field Name: aud_edu_catalog_2020_virtual_downloads
    * * Display Name: aud _edu _catalog _2020_virtual _downloads
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_catalog_2020_virtual_downloads(): string | null {
        return this.Get('aud_edu_catalog_2020_virtual_downloads');
    }
    set aud_edu_catalog_2020_virtual_downloads(value: string | null) {
        this.Set('aud_edu_catalog_2020_virtual_downloads', value);
    }

    /**
    * * Field Name: aud_edu_form_catalog_2020
    * * Display Name: aud _edu _form _catalog _2020
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_form_catalog_2020(): string | null {
        return this.Get('aud_edu_form_catalog_2020');
    }
    set aud_edu_form_catalog_2020(value: string | null) {
        this.Set('aud_edu_form_catalog_2020', value);
    }

    /**
    * * Field Name: aud_edu_ice_precon_2020_target_audience
    * * Display Name: aud _edu _ice _precon _2020_target _audience
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_ice_precon_2020_target_audience(): string | null {
        return this.Get('aud_edu_ice_precon_2020_target_audience');
    }
    set aud_edu_ice_precon_2020_target_audience(value: string | null) {
        this.Set('aud_edu_ice_precon_2020_target_audience', value);
    }

    /**
    * * Field Name: aud_edu_in_person_course_purchasers_last_365_days
    * * Display Name: aud _edu _in _person _course _purchasers _last _365_days
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_in_person_course_purchasers_last_365_days(): string | null {
        return this.Get('aud_edu_in_person_course_purchasers_last_365_days');
    }
    set aud_edu_in_person_course_purchasers_last_365_days(value: string | null) {
        this.Set('aud_edu_in_person_course_purchasers_last_365_days', value);
    }

    /**
    * * Field Name: aud_edu_or_con_purchasers_cyber_week_2021
    * * Display Name: aud _edu _or _con _purchasers _cyber _week _2021
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_or_con_purchasers_cyber_week_2021(): string | null {
        return this.Get('aud_edu_or_con_purchasers_cyber_week_2021');
    }
    set aud_edu_or_con_purchasers_cyber_week_2021(value: string | null) {
        this.Set('aud_edu_or_con_purchasers_cyber_week_2021', value);
    }

    /**
    * * Field Name: aud_edu_page_visits_all
    * * Display Name: aud _edu _page _visits _all
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_page_visits_all(): string | null {
        return this.Get('aud_edu_page_visits_all');
    }
    set aud_edu_page_visits_all(value: string | null) {
        this.Set('aud_edu_page_visits_all', value);
    }

    /**
    * * Field Name: aud_edu_precon_2020_purchased
    * * Display Name: aud _edu _precon _2020_purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_precon_2020_purchased(): string | null {
        return this.Get('aud_edu_precon_2020_purchased');
    }
    set aud_edu_precon_2020_purchased(value: string | null) {
        this.Set('aud_edu_precon_2020_purchased', value);
    }

    /**
    * * Field Name: aud_edu_purchased_cert
    * * Display Name: aud _edu _purchased _cert
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_purchased_cert(): string | null {
        return this.Get('aud_edu_purchased_cert');
    }
    set aud_edu_purchased_cert(value: string | null) {
        this.Set('aud_edu_purchased_cert', value);
    }

    /**
    * * Field Name: aud_edu_purchased_cert_14_days
    * * Display Name: aud _edu _purchased _cert _14_days
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_purchased_cert_14_days(): string | null {
        return this.Get('aud_edu_purchased_cert_14_days');
    }
    set aud_edu_purchased_cert_14_days(value: string | null) {
        this.Set('aud_edu_purchased_cert_14_days', value);
    }

    /**
    * * Field Name: aud_edu_purchased_cert_6_mos
    * * Display Name: aud _edu _purchased _cert _6_mos
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_purchased_cert_6_mos(): string | null {
        return this.Get('aud_edu_purchased_cert_6_mos');
    }
    set aud_edu_purchased_cert_6_mos(value: string | null) {
        this.Set('aud_edu_purchased_cert_6_mos', value);
    }

    /**
    * * Field Name: aud_edu_purchased_tc_last_6_m_os
    * * Display Name: aud _edu _purchased _tc _last _6_m _os
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_purchased_tc_last_6_m_os(): string | null {
        return this.Get('aud_edu_purchased_tc_last_6_m_os');
    }
    set aud_edu_purchased_tc_last_6_m_os(value: string | null) {
        this.Set('aud_edu_purchased_tc_last_6_m_os', value);
    }

    /**
    * * Field Name: aud_edu_tdbok_interest
    * * Display Name: aud _edu _tdbok _interest
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_tdbok_interest(): string | null {
        return this.Get('aud_edu_tdbok_interest');
    }
    set aud_edu_tdbok_interest(value: string | null) {
        this.Set('aud_edu_tdbok_interest', value);
    }

    /**
    * * Field Name: aud_edu_tk_precon_purchased
    * * Display Name: aud _edu _tk _precon _purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_edu_tk_precon_purchased(): string | null {
        return this.Get('aud_edu_tk_precon_purchased');
    }
    set aud_edu_tk_precon_purchased(value: string | null) {
        this.Set('aud_edu_tk_precon_purchased', value);
    }

    /**
    * * Field Name: aud_ent_ice_2020_teams_purchased
    * * Display Name: aud _ent _ice _2020_teams _purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ent_ice_2020_teams_purchased(): string | null {
        return this.Get('aud_ent_ice_2020_teams_purchased');
    }
    set aud_ent_ice_2020_teams_purchased(value: string | null) {
        this.Set('aud_ent_ice_2020_teams_purchased', value);
    }

    /**
    * * Field Name: aud_ent_td_leader_nl_4_times
    * * Display Name: aud _ent _td _leader _nl _4_times
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_ent_td_leader_nl_4_times(): string | null {
        return this.Get('aud_ent_td_leader_nl_4_times');
    }
    set aud_ent_td_leader_nl_4_times(value: string | null) {
        this.Set('aud_ent_td_leader_nl_4_times', value);
    }

    /**
    * * Field Name: aud_expiring_member
    * * Display Name: aud _expiring _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_expiring_member(): string | null {
        return this.Get('aud_expiring_member');
    }
    set aud_expiring_member(value: string | null) {
        this.Set('aud_expiring_member', value);
    }

    /**
    * * Field Name: aud_global_international_members
    * * Display Name: aud _global _international _members
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_global_international_members(): string | null {
        return this.Get('aud_global_international_members');
    }
    set aud_global_international_members(value: string | null) {
        this.Set('aud_global_international_members', value);
    }

    /**
    * * Field Name: aud_global_perspectives_topic_engagement
    * * Display Name: aud _global _perspectives _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_global_perspectives_topic_engagement(): string | null {
        return this.Get('aud_global_perspectives_topic_engagement');
    }
    set aud_global_perspectives_topic_engagement(value: string | null) {
        this.Set('aud_global_perspectives_topic_engagement', value);
    }

    /**
    * * Field Name: aud_government_newsletter
    * * Display Name: aud _government _newsletter
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_government_newsletter(): string | null {
        return this.Get('aud_government_newsletter');
    }
    set aud_government_newsletter(value: string | null) {
        this.Set('aud_government_newsletter', value);
    }

    /**
    * * Field Name: aud_healthcare_news_topic_engagement
    * * Display Name: aud _healthcare _news _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_healthcare_news_topic_engagement(): string | null {
        return this.Get('aud_healthcare_news_topic_engagement');
    }
    set aud_healthcare_news_topic_engagement(value: string | null) {
        this.Set('aud_healthcare_news_topic_engagement', value);
    }

    /**
    * * Field Name: aud_instructional_design_topic_engagement
    * * Display Name: aud _instructional _design _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_instructional_design_topic_engagement(): string | null {
        return this.Get('aud_instructional_design_topic_engagement');
    }
    set aud_instructional_design_topic_engagement(value: string | null) {
        this.Set('aud_instructional_design_topic_engagement', value);
    }

    /**
    * * Field Name: aud_is_member
    * * Display Name: aud _is _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_is_member(): string | null {
        return this.Get('aud_is_member');
    }
    set aud_is_member(value: string | null) {
        this.Set('aud_is_member', value);
    }

    /**
    * * Field Name: aud_leadership_development_topic_engagement
    * * Display Name: aud _leadership _development _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_leadership_development_topic_engagement(): string | null {
        return this.Get('aud_leadership_development_topic_engagement');
    }
    set aud_leadership_development_topic_engagement(value: string | null) {
        this.Set('aud_leadership_development_topic_engagement', value);
    }

    /**
    * * Field Name: aud_learning_technologies_engagement
    * * Display Name: aud _learning _technologies _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_learning_technologies_engagement(): string | null {
        return this.Get('aud_learning_technologies_engagement');
    }
    set aud_learning_technologies_engagement(value: string | null) {
        this.Set('aud_learning_technologies_engagement', value);
    }

    /**
    * * Field Name: aud_management_topic_engagement
    * * Display Name: aud _management _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_management_topic_engagement(): string | null {
        return this.Get('aud_management_topic_engagement');
    }
    set aud_management_topic_engagement(value: string | null) {
        this.Set('aud_management_topic_engagement', value);
    }

    /**
    * * Field Name: aud_mbr_acq_interest
    * * Display Name: aud _mbr _acq _interest
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_acq_interest(): string | null {
        return this.Get('aud_mbr_acq_interest');
    }
    set aud_mbr_acq_interest(value: string | null) {
        this.Set('aud_mbr_acq_interest', value);
    }

    /**
    * * Field Name: aud_mbr_acq_interest_decades
    * * Display Name: aud _mbr _acq _interest _decades
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_acq_interest_decades(): string | null {
        return this.Get('aud_mbr_acq_interest_decades');
    }
    set aud_mbr_acq_interest_decades(value: string | null) {
        this.Set('aud_mbr_acq_interest_decades', value);
    }

    /**
    * * Field Name: aud_mbr_acq_interest_decades_updated
    * * Display Name: aud _mbr _acq _interest _decades _updated
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_acq_interest_decades_updated(): string | null {
        return this.Get('aud_mbr_acq_interest_decades_updated');
    }
    set aud_mbr_acq_interest_decades_updated(value: string | null) {
        this.Set('aud_mbr_acq_interest_decades_updated', value);
    }

    /**
    * * Field Name: aud_mbr_benefits_available
    * * Display Name: aud _mbr _benefits _available
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_benefits_available(): string | null {
        return this.Get('aud_mbr_benefits_available');
    }
    set aud_mbr_benefits_available(value: string | null) {
        this.Set('aud_mbr_benefits_available', value);
    }

    /**
    * * Field Name: aud_mbr_claimed_all_benefits
    * * Display Name: aud _mbr _claimed _all _benefits
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_claimed_all_benefits(): string | null {
        return this.Get('aud_mbr_claimed_all_benefits');
    }
    set aud_mbr_claimed_all_benefits(value: string | null) {
        this.Set('aud_mbr_claimed_all_benefits', value);
    }

    /**
    * * Field Name: aud_mbr_claimed_atleast_one_benefit
    * * Display Name: aud _mbr _claimed _atleast _one _benefit
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_claimed_atleast_one_benefit(): string | null {
        return this.Get('aud_mbr_claimed_atleast_one_benefit');
    }
    set aud_mbr_claimed_atleast_one_benefit(value: string | null) {
        this.Set('aud_mbr_claimed_atleast_one_benefit', value);
    }

    /**
    * * Field Name: aud_mbr_expiring_30_days_not_renewed
    * * Display Name: aud _mbr _expiring _30_days _not _renewed
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_expiring_30_days_not_renewed(): string | null {
        return this.Get('aud_mbr_expiring_30_days_not_renewed');
    }
    set aud_mbr_expiring_30_days_not_renewed(value: string | null) {
        this.Set('aud_mbr_expiring_30_days_not_renewed', value);
    }

    /**
    * * Field Name: aud_mbr_expiring_next_90_days
    * * Display Name: aud _mbr _expiring _next _90_days
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_expiring_next_90_days(): string | null {
        return this.Get('aud_mbr_expiring_next_90_days');
    }
    set aud_mbr_expiring_next_90_days(value: string | null) {
        this.Set('aud_mbr_expiring_next_90_days', value);
    }

    /**
    * * Field Name: aud_mbr_low_engage_6_mo
    * * Display Name: aud _mbr _low _engage _6_mo
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_low_engage_6_mo(): string | null {
        return this.Get('aud_mbr_low_engage_6_mo');
    }
    set aud_mbr_low_engage_6_mo(value: string | null) {
        this.Set('aud_mbr_low_engage_6_mo', value);
    }

    /**
    * * Field Name: aud_mbr_non_expiring
    * * Display Name: aud _mbr _non _expiring
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_non_expiring(): string | null {
        return this.Get('aud_mbr_non_expiring');
    }
    set aud_mbr_non_expiring(value: string | null) {
        this.Set('aud_mbr_non_expiring', value);
    }

    /**
    * * Field Name: aud_mbr_order_completed_allod
    * * Display Name: aud _mbr _order _completed _allod
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_order_completed_allod(): string | null {
        return this.Get('aud_mbr_order_completed_allod');
    }
    set aud_mbr_order_completed_allod(value: string | null) {
        this.Set('aud_mbr_order_completed_allod', value);
    }

    /**
    * * Field Name: aud_mbr_tdw_exp_nov_2020
    * * Display Name: aud _mbr _tdw _exp _nov _2020
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_tdw_exp_nov_2020(): string | null {
        return this.Get('aud_mbr_tdw_exp_nov_2020');
    }
    set aud_mbr_tdw_exp_nov_2020(value: string | null) {
        this.Set('aud_mbr_tdw_exp_nov_2020', value);
    }

    /**
    * * Field Name: aud_mbr_zero_benefits
    * * Display Name: aud _mbr _zero _benefits
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_zero_benefits(): string | null {
        return this.Get('aud_mbr_zero_benefits');
    }
    set aud_mbr_zero_benefits(value: string | null) {
        this.Set('aud_mbr_zero_benefits', value);
    }

    /**
    * * Field Name: aud_mbr_zero_benefits_used
    * * Display Name: aud _mbr _zero _benefits _used
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbr_zero_benefits_used(): string | null {
        return this.Get('aud_mbr_zero_benefits_used');
    }
    set aud_mbr_zero_benefits_used(value: string | null) {
        this.Set('aud_mbr_zero_benefits_used', value);
    }

    /**
    * * Field Name: aud_mbrshp_purchased_last_90_days
    * * Display Name: aud _mbrshp _purchased _last _90_days
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_mbrshp_purchased_last_90_days(): string | null {
        return this.Get('aud_mbrshp_purchased_last_90_days');
    }
    set aud_mbrshp_purchased_last_90_days(value: string | null) {
        this.Set('aud_mbrshp_purchased_last_90_days', value);
    }

    /**
    * * Field Name: aud_member_benefits_center_tab_clicked
    * * Display Name: aud _member _benefits _center _tab _clicked
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_member_benefits_center_tab_clicked(): string | null {
        return this.Get('aud_member_benefits_center_tab_clicked');
    }
    set aud_member_benefits_center_tab_clicked(value: string | null) {
        this.Set('aud_member_benefits_center_tab_clicked', value);
    }

    /**
    * * Field Name: aud_member_newsletter_openers
    * * Display Name: aud _member _newsletter _openers
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_member_newsletter_openers(): string | null {
        return this.Get('aud_member_newsletter_openers');
    }
    set aud_member_newsletter_openers(value: string | null) {
        this.Set('aud_member_newsletter_openers', value);
    }

    /**
    * * Field Name: aud_members_onboarding
    * * Display Name: aud _members _onboarding
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_members_onboarding(): string | null {
        return this.Get('aud_members_onboarding');
    }
    set aud_members_onboarding(value: string | null) {
        this.Set('aud_members_onboarding', value);
    }

    /**
    * * Field Name: aud_members_with_available_benefits
    * * Display Name: aud _members _with _available _benefits
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_members_with_available_benefits(): string | null {
        return this.Get('aud_members_with_available_benefits');
    }
    set aud_members_with_available_benefits(value: string | null) {
        this.Set('aud_members_with_available_benefits', value);
    }

    /**
    * * Field Name: aud_my_career_engagement
    * * Display Name: aud _my _career _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_my_career_engagement(): string | null {
        return this.Get('aud_my_career_engagement');
    }
    set aud_my_career_engagement(value: string | null) {
        this.Set('aud_my_career_engagement', value);
    }

    /**
    * * Field Name: aud_my_career_topic_engagement
    * * Display Name: aud _my _career _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_my_career_topic_engagement(): string | null {
        return this.Get('aud_my_career_topic_engagement');
    }
    set aud_my_career_topic_engagement(value: string | null) {
        this.Set('aud_my_career_topic_engagement', value);
    }

    /**
    * * Field Name: aud_net_new
    * * Display Name: aud _net _new
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_net_new(): string | null {
        return this.Get('aud_net_new');
    }
    set aud_net_new(value: string | null) {
        this.Set('aud_net_new', value);
    }

    /**
    * * Field Name: aud_nonmembers
    * * Display Name: aud _nonmembers
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_nonmembers(): string | null {
        return this.Get('aud_nonmembers');
    }
    set aud_nonmembers(value: string | null) {
        this.Set('aud_nonmembers', value);
    }

    /**
    * * Field Name: aud_performance_consulting_improvement_topic_engagement
    * * Display Name: aud _performance _consulting _improvement _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_performance_consulting_improvement_topic_engagement(): string | null {
        return this.Get('aud_performance_consulting_improvement_topic_engagement');
    }
    set aud_performance_consulting_improvement_topic_engagement(value: string | null) {
        this.Set('aud_performance_consulting_improvement_topic_engagement', value);
    }

    /**
    * * Field Name: aud_preference_change_management
    * * Display Name: aud _preference _change _management
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_preference_change_management(): string | null {
        return this.Get('aud_preference_change_management');
    }
    set aud_preference_change_management(value: string | null) {
        this.Set('aud_preference_change_management', value);
    }

    /**
    * * Field Name: aud_pubs_smr_sale_2020_target
    * * Display Name: aud _pubs _smr _sale _2020_target
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_pubs_smr_sale_2020_target(): string | null {
        return this.Get('aud_pubs_smr_sale_2020_target');
    }
    set aud_pubs_smr_sale_2020_target(value: string | null) {
        this.Set('aud_pubs_smr_sale_2020_target', value);
    }

    /**
    * * Field Name: aud_pubs_workshop_2022_purchasers
    * * Display Name: aud _pubs _workshop _2022_purchasers
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_pubs_workshop_2022_purchasers(): string | null {
        return this.Get('aud_pubs_workshop_2022_purchasers');
    }
    set aud_pubs_workshop_2022_purchasers(value: string | null) {
        this.Set('aud_pubs_workshop_2022_purchasers', value);
    }

    /**
    * * Field Name: aud_purchased_books_starting_with_11_71_19_70
    * * Display Name: aud _purchased _books _starting _with _11_71_19_70
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_purchased_books_starting_with_11_71_19_70(): string | null {
        return this.Get('aud_purchased_books_starting_with_11_71_19_70');
    }
    set aud_purchased_books_starting_with_11_71_19_70(value: string | null) {
        this.Set('aud_purchased_books_starting_with_11_71_19_70', value);
    }

    /**
    * * Field Name: aud_sales_enablement_topic_engagement
    * * Display Name: aud _sales _enablement _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_sales_enablement_topic_engagement(): string | null {
        return this.Get('aud_sales_enablement_topic_engagement');
    }
    set aud_sales_enablement_topic_engagement(value: string | null) {
        this.Set('aud_sales_enablement_topic_engagement', value);
    }

    /**
    * * Field Name: aud_sales_force_working_leads
    * * Display Name: aud _sales _force _working _leads
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_sales_force_working_leads(): string | null {
        return this.Get('aud_sales_force_working_leads');
    }
    set aud_sales_force_working_leads(value: string | null) {
        this.Set('aud_sales_force_working_leads', value);
    }

    /**
    * * Field Name: aud_sso_created_or_is_member
    * * Display Name: aud _sso _created _or _is _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_sso_created_or_is_member(): string | null {
        return this.Get('aud_sso_created_or_is_member');
    }
    set aud_sso_created_or_is_member(value: string | null) {
        this.Set('aud_sso_created_or_is_member', value);
    }

    /**
    * * Field Name: aud_talent_management_narrow_engagement
    * * Display Name: aud _talent _management _narrow _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_talent_management_narrow_engagement(): string | null {
        return this.Get('aud_talent_management_narrow_engagement');
    }
    set aud_talent_management_narrow_engagement(value: string | null) {
        this.Set('aud_talent_management_narrow_engagement', value);
    }

    /**
    * * Field Name: aud_talent_management_topic_engagement
    * * Display Name: aud _talent _management _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_talent_management_topic_engagement(): string | null {
        return this.Get('aud_talent_management_topic_engagement');
    }
    set aud_talent_management_topic_engagement(value: string | null) {
        this.Set('aud_talent_management_topic_engagement', value);
    }

    /**
    * * Field Name: aud_td_executive_topic_engagement
    * * Display Name: aud _td _executive _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_td_executive_topic_engagement(): string | null {
        return this.Get('aud_td_executive_topic_engagement');
    }
    set aud_td_executive_topic_engagement(value: string | null) {
        this.Set('aud_td_executive_topic_engagement', value);
    }

    /**
    * * Field Name: aud_topic_engagement_science_of_learning
    * * Display Name: aud _topic _engagement _science _of _learning
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_topic_engagement_science_of_learning(): string | null {
        return this.Get('aud_topic_engagement_science_of_learning');
    }
    set aud_topic_engagement_science_of_learning(value: string | null) {
        this.Set('aud_topic_engagement_science_of_learning', value);
    }

    /**
    * * Field Name: aud_training_delivery_topic_engagement
    * * Display Name: aud _training _delivery _topic _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_training_delivery_topic_engagement(): string | null {
        return this.Get('aud_training_delivery_topic_engagement');
    }
    set aud_training_delivery_topic_engagement(value: string | null) {
        this.Set('aud_training_delivery_topic_engagement', value);
    }

    /**
    * * Field Name: aud_unengaged_users
    * * Display Name: aud _unengaged _users
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_unengaged_users(): string | null {
        return this.Get('aud_unengaged_users');
    }
    set aud_unengaged_users(value: string | null) {
        this.Set('aud_unengaged_users', value);
    }

    /**
    * * Field Name: aud_virtual_fall_2020_core_4
    * * Display Name: aud _virtual _fall _2020_core _4
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_virtual_fall_2020_core_4(): string | null {
        return this.Get('aud_virtual_fall_2020_core_4');
    }
    set aud_virtual_fall_2020_core_4(value: string | null) {
        this.Set('aud_virtual_fall_2020_core_4', value);
    }

    /**
    * * Field Name: aud_virtual_fall_2020_future_of_work
    * * Display Name: aud _virtual _fall _2020_future _of _work
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_virtual_fall_2020_future_of_work(): string | null {
        return this.Get('aud_virtual_fall_2020_future_of_work');
    }
    set aud_virtual_fall_2020_future_of_work(value: string | null) {
        this.Set('aud_virtual_fall_2020_future_of_work', value);
    }

    /**
    * * Field Name: aud_virtual_fall_2020_org_dev
    * * Display Name: aud _virtual _fall _2020_org _dev
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_virtual_fall_2020_org_dev(): string | null {
        return this.Get('aud_virtual_fall_2020_org_dev');
    }
    set aud_virtual_fall_2020_org_dev(value: string | null) {
        this.Set('aud_virtual_fall_2020_org_dev', value);
    }

    /**
    * * Field Name: aud_webcast_email_engagement
    * * Display Name: aud _webcast _email _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get aud_webcast_email_engagement(): string | null {
        return this.Get('aud_webcast_email_engagement');
    }
    set aud_webcast_email_engagement(value: string | null) {
        this.Set('aud_webcast_email_engagement', value);
    }

    /**
    * * Field Name: automatedNewsletters
    * * Display Name: automated Newsletters
    * * SQL Data Type: nvarchar(MAX)
    */
    get automatedNewsletters(): string | null {
        return this.Get('automatedNewsletters');
    }
    set automatedNewsletters(value: string | null) {
        this.Set('automatedNewsletters', value);
    }

    /**
    * * Field Name: c_active_chapter_leader
    * * Display Name: c _active _chapter _leader
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_active_chapter_leader(): string | null {
        return this.Get('c_active_chapter_leader');
    }
    set c_active_chapter_leader(value: string | null) {
        this.Set('c_active_chapter_leader', value);
    }

    /**
    * * Field Name: c_aptd_holder
    * * Display Name: c _aptd _holder
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_aptd_holder(): string | null {
        return this.Get('c_aptd_holder');
    }
    set c_aptd_holder(value: string | null) {
        this.Set('c_aptd_holder', value);
    }

    /**
    * * Field Name: c_capability
    * * Display Name: c _capability
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_capability(): string | null {
        return this.Get('c_capability');
    }
    set c_capability(value: string | null) {
        this.Set('c_capability', value);
    }

    /**
    * * Field Name: c_capability_model_assessment_completion
    * * Display Name: c _capability _model _assessment _completion
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_capability_model_assessment_completion(): string | null {
        return this.Get('c_capability_model_assessment_completion');
    }
    set c_capability_model_assessment_completion(value: string | null) {
        this.Set('c_capability_model_assessment_completion', value);
    }

    /**
    * * Field Name: c_chapter
    * * Display Name: c _chapter
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_chapter(): string | null {
        return this.Get('c_chapter');
    }
    set c_chapter(value: string | null) {
        this.Set('c_chapter', value);
    }

    /**
    * * Field Name: c_closest_chapter_direction
    * * Display Name: c _closest _chapter _direction
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_closest_chapter_direction(): string | null {
        return this.Get('c_closest_chapter_direction');
    }
    set c_closest_chapter_direction(value: string | null) {
        this.Set('c_closest_chapter_direction', value);
    }

    /**
    * * Field Name: c_closest_chapter_name
    * * Display Name: c _closest _chapter _name
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_closest_chapter_name(): string | null {
        return this.Get('c_closest_chapter_name');
    }
    set c_closest_chapter_name(value: string | null) {
        this.Set('c_closest_chapter_name', value);
    }

    /**
    * * Field Name: c_closest_chapter_state
    * * Display Name: c _closest _chapter _state
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_closest_chapter_state(): string | null {
        return this.Get('c_closest_chapter_state');
    }
    set c_closest_chapter_state(value: string | null) {
        this.Set('c_closest_chapter_state', value);
    }

    /**
    * * Field Name: c_consecutive_years_as_member
    * * Display Name: c _consecutive _years _as _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_consecutive_years_as_member(): string | null {
        return this.Get('c_consecutive_years_as_member');
    }
    set c_consecutive_years_as_member(value: string | null) {
        this.Set('c_consecutive_years_as_member', value);
    }

    /**
    * * Field Name: c_cptd_holder
    * * Display Name: c _cptd _holder
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_cptd_holder(): string | null {
        return this.Get('c_cptd_holder');
    }
    set c_cptd_holder(value: string | null) {
        this.Set('c_cptd_holder', value);
    }

    /**
    * * Field Name: c_edu_page_title_list_7_days
    * * Display Name: c _edu _page _title _list _7_days
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_edu_page_title_list_7_days(): string | null {
        return this.Get('c_edu_page_title_list_7_days');
    }
    set c_edu_page_title_list_7_days(value: string | null) {
        this.Set('c_edu_page_title_list_7_days', value);
    }

    /**
    * * Field Name: c_edu_products_purchased
    * * Display Name: c _edu _products _purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_edu_products_purchased(): string | null {
        return this.Get('c_edu_products_purchased');
    }
    set c_edu_products_purchased(value: string | null) {
        this.Set('c_edu_products_purchased', value);
    }

    /**
    * * Field Name: c_education_pages_list
    * * Display Name: c _education _pages _list
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_education_pages_list(): string | null {
        return this.Get('c_education_pages_list');
    }
    set c_education_pages_list(value: string | null) {
        this.Set('c_education_pages_list', value);
    }

    /**
    * * Field Name: c_education_program_completed_last6months
    * * Display Name: c _education _program _completed _last 6months
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_education_program_completed_last6months(): string | null {
        return this.Get('c_education_program_completed_last6months');
    }
    set c_education_program_completed_last6months(value: string | null) {
        this.Set('c_education_program_completed_last6months', value);
    }

    /**
    * * Field Name: c_email_links_clicked
    * * Display Name: c _email _links _clicked
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_email_links_clicked(): string | null {
        return this.Get('c_email_links_clicked');
    }
    set c_email_links_clicked(value: string | null) {
        this.Set('c_email_links_clicked', value);
    }

    /**
    * * Field Name: c_enterprise_company
    * * Display Name: c _enterprise _company
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_enterprise_company(): string | null {
        return this.Get('c_enterprise_company');
    }
    set c_enterprise_company(value: string | null) {
        this.Set('c_enterprise_company', value);
    }

    /**
    * * Field Name: c_enterprise_memberhip_acquisition_type
    * * Display Name: c _enterprise _memberhip _acquisition _type
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_enterprise_memberhip_acquisition_type(): string | null {
        return this.Get('c_enterprise_memberhip_acquisition_type');
    }
    set c_enterprise_memberhip_acquisition_type(value: string | null) {
        this.Set('c_enterprise_memberhip_acquisition_type', value);
    }

    /**
    * * Field Name: c_enterprise_membership_period_begin
    * * Display Name: c _enterprise _membership _period _begin
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_enterprise_membership_period_begin(): string | null {
        return this.Get('c_enterprise_membership_period_begin');
    }
    set c_enterprise_membership_period_begin(value: string | null) {
        this.Set('c_enterprise_membership_period_begin', value);
    }

    /**
    * * Field Name: c_enterprise_membership_period_end
    * * Display Name: c _enterprise _membership _period _end
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_enterprise_membership_period_end(): string | null {
        return this.Get('c_enterprise_membership_period_end');
    }
    set c_enterprise_membership_period_end(value: string | null) {
        this.Set('c_enterprise_membership_period_end', value);
    }

    /**
    * * Field Name: c_enterprise_membership_renewal_date
    * * Display Name: c _enterprise _membership _renewal _date
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_enterprise_membership_renewal_date(): string | null {
        return this.Get('c_enterprise_membership_renewal_date');
    }
    set c_enterprise_membership_renewal_date(value: string | null) {
        this.Set('c_enterprise_membership_renewal_date', value);
    }

    /**
    * * Field Name: c_enterprise_membership_retention_stage
    * * Display Name: c _enterprise _membership _retention _stage
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_enterprise_membership_retention_stage(): string | null {
        return this.Get('c_enterprise_membership_retention_stage');
    }
    set c_enterprise_membership_retention_stage(value: string | null) {
        this.Set('c_enterprise_membership_retention_stage', value);
    }

    /**
    * * Field Name: c_enterprise_order_date
    * * Display Name: c _enterprise _order _date
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_enterprise_order_date(): string | null {
        return this.Get('c_enterprise_order_date');
    }
    set c_enterprise_order_date(value: string | null) {
        this.Set('c_enterprise_order_date', value);
    }

    /**
    * * Field Name: c_expire_chapter_leader_30_day
    * * Display Name: c _expire _chapter _leader _30_day
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_expire_chapter_leader_30_day(): string | null {
        return this.Get('c_expire_chapter_leader_30_day');
    }
    set c_expire_chapter_leader_30_day(value: string | null) {
        this.Set('c_expire_chapter_leader_30_day', value);
    }

    /**
    * * Field Name: c_forms_submitted
    * * Display Name: c _forms _submitted
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_forms_submitted(): string | null {
        return this.Get('c_forms_submitted');
    }
    set c_forms_submitted(value: string | null) {
        this.Set('c_forms_submitted', value);
    }

    /**
    * * Field Name: c_initial_membership_date
    * * Display Name: c _initial _membership _date
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_initial_membership_date(): string | null {
        return this.Get('c_initial_membership_date');
    }
    set c_initial_membership_date(value: string | null) {
        this.Set('c_initial_membership_date', value);
    }

    /**
    * * Field Name: c_is_closest_chapter_member
    * * Display Name: c _is _closest _chapter _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_is_closest_chapter_member(): string | null {
        return this.Get('c_is_closest_chapter_member');
    }
    set c_is_closest_chapter_member(value: string | null) {
        this.Set('c_is_closest_chapter_member', value);
    }

    /**
    * * Field Name: c_is_enterprise_member
    * * Display Name: c _is _enterprise _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_is_enterprise_member(): string | null {
        return this.Get('c_is_enterprise_member');
    }
    set c_is_enterprise_member(value: string | null) {
        this.Set('c_is_enterprise_member', value);
    }

    /**
    * * Field Name: c_is_member
    * * Display Name: c _is _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_is_member(): string | null {
        return this.Get('c_is_member');
    }
    set c_is_member(value: string | null) {
        this.Set('c_is_member', value);
    }

    /**
    * * Field Name: c_is_power_member
    * * Display Name: c _is _power _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_is_power_member(): string | null {
        return this.Get('c_is_power_member');
    }
    set c_is_power_member(value: string | null) {
        this.Set('c_is_power_member', value);
    }

    /**
    * * Field Name: c_is_senior_membership
    * * Display Name: c _is _senior _membership
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_is_senior_membership(): string | null {
        return this.Get('c_is_senior_membership');
    }
    set c_is_senior_membership(value: string | null) {
        this.Set('c_is_senior_membership', value);
    }

    /**
    * * Field Name: c_is_student_membership
    * * Display Name: c _is _student _membership
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_is_student_membership(): string | null {
        return this.Get('c_is_student_membership');
    }
    set c_is_student_membership(value: string | null) {
        this.Set('c_is_student_membership', value);
    }

    /**
    * * Field Name: c_job_title_group
    * * Display Name: c _job _title _group
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_job_title_group(): string | null {
        return this.Get('c_job_title_group');
    }
    set c_job_title_group(value: string | null) {
        this.Set('c_job_title_group', value);
    }

    /**
    * * Field Name: c_learning_plan_created
    * * Display Name: c _learning _plan _created
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_learning_plan_created(): string | null {
        return this.Get('c_learning_plan_created');
    }
    set c_learning_plan_created(value: string | null) {
        this.Set('c_learning_plan_created', value);
    }

    /**
    * * Field Name: c_member_subtype
    * * Display Name: c _member _subtype
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_member_subtype(): string | null {
        return this.Get('c_member_subtype');
    }
    set c_member_subtype(value: string | null) {
        this.Set('c_member_subtype', value);
    }

    /**
    * * Field Name: c_member_type
    * * Display Name: c _member _type
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_member_type(): string | null {
        return this.Get('c_member_type');
    }
    set c_member_type(value: string | null) {
        this.Set('c_member_type', value);
    }

    /**
    * * Field Name: c_memberhip_retention_type
    * * Display Name: c _memberhip _retention _type
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_memberhip_retention_type(): string | null {
        return this.Get('c_memberhip_retention_type');
    }
    set c_memberhip_retention_type(value: string | null) {
        this.Set('c_memberhip_retention_type', value);
    }

    /**
    * * Field Name: c_membership_acquisition_type
    * * Display Name: c _membership _acquisition _type
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_acquisition_type(): string | null {
        return this.Get('c_membership_acquisition_type');
    }
    set c_membership_acquisition_type(value: string | null) {
        this.Set('c_membership_acquisition_type', value);
    }

    /**
    * * Field Name: c_membership_auto_renew
    * * Display Name: c _membership _auto _renew
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_auto_renew(): string | null {
        return this.Get('c_membership_auto_renew');
    }
    set c_membership_auto_renew(value: string | null) {
        this.Set('c_membership_auto_renew', value);
    }

    /**
    * * Field Name: c_membership_bundle
    * * Display Name: c _membership _bundle
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_bundle(): string | null {
        return this.Get('c_membership_bundle');
    }
    set c_membership_bundle(value: string | null) {
        this.Set('c_membership_bundle', value);
    }

    /**
    * * Field Name: c_membership_conference_value_seeker
    * * Display Name: c _membership _conference _value _seeker
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_conference_value_seeker(): string | null {
        return this.Get('c_membership_conference_value_seeker');
    }
    set c_membership_conference_value_seeker(value: string | null) {
        this.Set('c_membership_conference_value_seeker', value);
    }

    /**
    * * Field Name: c_membership_education_value_seeker
    * * Display Name: c _membership _education _value _seeker
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_education_value_seeker(): string | null {
        return this.Get('c_membership_education_value_seeker');
    }
    set c_membership_education_value_seeker(value: string | null) {
        this.Set('c_membership_education_value_seeker', value);
    }

    /**
    * * Field Name: c_membership_is_comp
    * * Display Name: c _membership _is _comp
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_is_comp(): string | null {
        return this.Get('c_membership_is_comp');
    }
    set c_membership_is_comp(value: string | null) {
        this.Set('c_membership_is_comp', value);
    }

    /**
    * * Field Name: c_membership_is_internal
    * * Display Name: c _membership _is _internal
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_is_internal(): string | null {
        return this.Get('c_membership_is_internal');
    }
    set c_membership_is_internal(value: string | null) {
        this.Set('c_membership_is_internal', value);
    }

    /**
    * * Field Name: c_membership_period_begin
    * * Display Name: c _membership _period _begin
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_period_begin(): string | null {
        return this.Get('c_membership_period_begin');
    }
    set c_membership_period_begin(value: string | null) {
        this.Set('c_membership_period_begin', value);
    }

    /**
    * * Field Name: c_membership_period_end
    * * Display Name: c _membership _period _end
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_period_end(): string | null {
        return this.Get('c_membership_period_end');
    }
    set c_membership_period_end(value: string | null) {
        this.Set('c_membership_period_end', value);
    }

    /**
    * * Field Name: c_membership_pro_or_plus
    * * Display Name: c _membership _pro _or _plus
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_pro_or_plus(): string | null {
        return this.Get('c_membership_pro_or_plus');
    }
    set c_membership_pro_or_plus(value: string | null) {
        this.Set('c_membership_pro_or_plus', value);
    }

    /**
    * * Field Name: c_membership_product
    * * Display Name: c _membership _product
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_product(): string | null {
        return this.Get('c_membership_product');
    }
    set c_membership_product(value: string | null) {
        this.Set('c_membership_product', value);
    }

    /**
    * * Field Name: c_membership_rate_code
    * * Display Name: c _membership _rate _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_rate_code(): string | null {
        return this.Get('c_membership_rate_code');
    }
    set c_membership_rate_code(value: string | null) {
        this.Set('c_membership_rate_code', value);
    }

    /**
    * * Field Name: c_membership_renewal_date
    * * Display Name: c _membership _renewal _date
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_renewal_date(): string | null {
        return this.Get('c_membership_renewal_date');
    }
    set c_membership_renewal_date(value: string | null) {
        this.Set('c_membership_renewal_date', value);
    }

    /**
    * * Field Name: c_membership_renewed_in
    * * Display Name: c _membership _renewed _in
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_renewed_in(): string | null {
        return this.Get('c_membership_renewed_in');
    }
    set c_membership_renewed_in(value: string | null) {
        this.Set('c_membership_renewed_in', value);
    }

    /**
    * * Field Name: c_membership_retention_stage
    * * Display Name: c _membership _retention _stage
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_retention_stage(): string | null {
        return this.Get('c_membership_retention_stage');
    }
    set c_membership_retention_stage(value: string | null) {
        this.Set('c_membership_retention_stage', value);
    }

    /**
    * * Field Name: c_membership_type_code
    * * Display Name: c _membership _type _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_membership_type_code(): string | null {
        return this.Get('c_membership_type_code');
    }
    set c_membership_type_code(value: string | null) {
        this.Set('c_membership_type_code', value);
    }

    /**
    * * Field Name: c_most_engaged_topic_web
    * * Display Name: c _most _engaged _topic _web
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_most_engaged_topic_web(): string | null {
        return this.Get('c_most_engaged_topic_web');
    }
    set c_most_engaged_topic_web(value: string | null) {
        this.Set('c_most_engaged_topic_web', value);
    }

    /**
    * * Field Name: c_onboarding_member
    * * Display Name: c _onboarding _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_onboarding_member(): string | null {
        return this.Get('c_onboarding_member');
    }
    set c_onboarding_member(value: string | null) {
        this.Set('c_onboarding_member', value);
    }

    /**
    * * Field Name: c_pages_visited
    * * Display Name: c _pages _visited
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_pages_visited(): string | null {
        return this.Get('c_pages_visited');
    }
    set c_pages_visited(value: string | null) {
        this.Set('c_pages_visited', value);
    }

    /**
    * * Field Name: c_pages_visited_topics
    * * Display Name: c _pages _visited _topics
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_pages_visited_topics(): string | null {
        return this.Get('c_pages_visited_topics');
    }
    set c_pages_visited_topics(value: string | null) {
        this.Set('c_pages_visited_topics', value);
    }

    /**
    * * Field Name: c_product_purchase_topics
    * * Display Name: c _product _purchase _topics
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_product_purchase_topics(): string | null {
        return this.Get('c_product_purchase_topics');
    }
    set c_product_purchase_topics(value: string | null) {
        this.Set('c_product_purchase_topics', value);
    }

    /**
    * * Field Name: c_products_purchased
    * * Display Name: c _products _purchased
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_products_purchased(): string | null {
        return this.Get('c_products_purchased');
    }
    set c_products_purchased(value: string | null) {
        this.Set('c_products_purchased', value);
    }

    /**
    * * Field Name: c_products_purchased_by_name
    * * Display Name: c _products _purchased _by _name
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_products_purchased_by_name(): string | null {
        return this.Get('c_products_purchased_by_name');
    }
    set c_products_purchased_by_name(value: string | null) {
        this.Set('c_products_purchased_by_name', value);
    }

    /**
    * * Field Name: c_research_benefits_used
    * * Display Name: c _research _benefits _used
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_research_benefits_used(): string | null {
        return this.Get('c_research_benefits_used');
    }
    set c_research_benefits_used(value: string | null) {
        this.Set('c_research_benefits_used', value);
    }

    /**
    * * Field Name: c_sfmc_newsletter_engagement
    * * Display Name: c _sfmc _newsletter _engagement
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_sfmc_newsletter_engagement(): string | null {
        return this.Get('c_sfmc_newsletter_engagement');
    }
    set c_sfmc_newsletter_engagement(value: string | null) {
        this.Set('c_sfmc_newsletter_engagement', value);
    }

    /**
    * * Field Name: c_terminate_at_end
    * * Display Name: c _terminate _at _end
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_terminate_at_end(): string | null {
        return this.Get('c_terminate_at_end');
    }
    set c_terminate_at_end(value: string | null) {
        this.Set('c_terminate_at_end', value);
    }

    /**
    * * Field Name: c_topics_followed
    * * Display Name: c _topics _followed
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_topics_followed(): string | null {
        return this.Get('c_topics_followed');
    }
    set c_topics_followed(value: string | null) {
        this.Set('c_topics_followed', value);
    }

    /**
    * * Field Name: c_webcast
    * * Display Name: c _webcast
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcast(): string | null {
        return this.Get('c_webcast');
    }
    set c_webcast(value: string | null) {
        this.Set('c_webcast', value);
    }

    /**
    * * Field Name: c_webcast_first_attendance_date
    * * Display Name: c _webcast _first _attendance _date
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcast_first_attendance_date(): string | null {
        return this.Get('c_webcast_first_attendance_date');
    }
    set c_webcast_first_attendance_date(value: string | null) {
        this.Set('c_webcast_first_attendance_date', value);
    }

    /**
    * * Field Name: c_webcast_first_registration_date
    * * Display Name: c _webcast _first _registration _date
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcast_first_registration_date(): string | null {
        return this.Get('c_webcast_first_registration_date');
    }
    set c_webcast_first_registration_date(value: string | null) {
        this.Set('c_webcast_first_registration_date', value);
    }

    /**
    * * Field Name: c_webcast_id
    * * Display Name: c _webcast _id
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcast_id(): string | null {
        return this.Get('c_webcast_id');
    }
    set c_webcast_id(value: string | null) {
        this.Set('c_webcast_id', value);
    }

    /**
    * * Field Name: c_webcast_last_attendance_date
    * * Display Name: c _webcast _last _attendance _date
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcast_last_attendance_date(): string | null {
        return this.Get('c_webcast_last_attendance_date');
    }
    set c_webcast_last_attendance_date(value: string | null) {
        this.Set('c_webcast_last_attendance_date', value);
    }

    /**
    * * Field Name: c_webcast_last_registration_date
    * * Display Name: c _webcast _last _registration _date
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcast_last_registration_date(): string | null {
        return this.Get('c_webcast_last_registration_date');
    }
    set c_webcast_last_registration_date(value: string | null) {
        this.Set('c_webcast_last_registration_date', value);
    }

    /**
    * * Field Name: c_webcast_name
    * * Display Name: c _webcast _name
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcast_name(): string | null {
        return this.Get('c_webcast_name');
    }
    set c_webcast_name(value: string | null) {
        this.Set('c_webcast_name', value);
    }

    /**
    * * Field Name: c_webcast_primary_tags
    * * Display Name: c _webcast _primary _tags
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcast_primary_tags(): string | null {
        return this.Get('c_webcast_primary_tags');
    }
    set c_webcast_primary_tags(value: string | null) {
        this.Set('c_webcast_primary_tags', value);
    }

    /**
    * * Field Name: c_webcasts_attended
    * * Display Name: c _webcasts _attended
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_webcasts_attended(): string | null {
        return this.Get('c_webcasts_attended');
    }
    set c_webcasts_attended(value: string | null) {
        this.Set('c_webcasts_attended', value);
    }

    /**
    * * Field Name: c_weeks_to_expire
    * * Display Name: c _weeks _to _expire
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_weeks_to_expire(): string | null {
        return this.Get('c_weeks_to_expire');
    }
    set c_weeks_to_expire(value: string | null) {
        this.Set('c_weeks_to_expire', value);
    }

    /**
    * * Field Name: c_wish_list_product_codes
    * * Display Name: c _wish _list _product _codes
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_wish_list_product_codes(): string | null {
        return this.Get('c_wish_list_product_codes');
    }
    set c_wish_list_product_codes(value: string | null) {
        this.Set('c_wish_list_product_codes', value);
    }

    /**
    * * Field Name: c_with_list_product_codes
    * * Display Name: c _with _list _product _codes
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_with_list_product_codes(): string | null {
        return this.Get('c_with_list_product_codes');
    }
    set c_with_list_product_codes(value: string | null) {
        this.Set('c_with_list_product_codes', value);
    }

    /**
    * * Field Name: c_within_60_mile_radius_of_city
    * * Display Name: c _within _60_mile _radius _of _city
    * * SQL Data Type: nvarchar(MAX)
    */
    get c_within_60_mile_radius_of_city(): string | null {
        return this.Get('c_within_60_mile_radius_of_city');
    }
    set c_within_60_mile_radius_of_city(value: string | null) {
        this.Set('c_within_60_mile_radius_of_city', value);
    }

    /**
    * * Field Name: campaignName
    * * Display Name: campaign Name
    * * SQL Data Type: nvarchar(MAX)
    */
    get campaignName(): string | null {
        return this.Get('campaignName');
    }
    set campaignName(value: string | null) {
        this.Set('campaignName', value);
    }

    /**
    * * Field Name: capabilitiesModelFirstTimeUsed
    * * Display Name: capabilities Model First Time Used
    * * SQL Data Type: nvarchar(MAX)
    */
    get capabilitiesModelFirstTimeUsed(): string | null {
        return this.Get('capabilitiesModelFirstTimeUsed');
    }
    set capabilitiesModelFirstTimeUsed(value: string | null) {
        this.Set('capabilitiesModelFirstTimeUsed', value);
    }

    /**
    * * Field Name: capabilitiesModelLastTimeUsed
    * * Display Name: capabilities Model Last Time Used
    * * SQL Data Type: nvarchar(MAX)
    */
    get capabilitiesModelLastTimeUsed(): string | null {
        return this.Get('capabilitiesModelLastTimeUsed');
    }
    set capabilitiesModelLastTimeUsed(value: string | null) {
        this.Set('capabilitiesModelLastTimeUsed', value);
    }

    /**
    * * Field Name: cartAbandonmentProducts
    * * Display Name: cart Abandonment Products
    * * SQL Data Type: nvarchar(MAX)
    */
    get cartAbandonmentProducts(): string | null {
        return this.Get('cartAbandonmentProducts');
    }
    set cartAbandonmentProducts(value: string | null) {
        this.Set('cartAbandonmentProducts', value);
    }

    /**
    * * Field Name: city2
    * * Display Name: city 2
    * * SQL Data Type: nvarchar(MAX)
    */
    get city2(): string | null {
        return this.Get('city2');
    }
    set city2(value: string | null) {
        this.Set('city2', value);
    }

    /**
    * * Field Name: clearbit_company_category_industry
    * * Display Name: clearbit _company _category _industry
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_category_industry(): string | null {
        return this.Get('clearbit_company_category_industry');
    }
    set clearbit_company_category_industry(value: string | null) {
        this.Set('clearbit_company_category_industry', value);
    }

    /**
    * * Field Name: clearbit_company_category_industry_group
    * * Display Name: clearbit _company _category _industry _group
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_category_industry_group(): string | null {
        return this.Get('clearbit_company_category_industry_group');
    }
    set clearbit_company_category_industry_group(value: string | null) {
        this.Set('clearbit_company_category_industry_group', value);
    }

    /**
    * * Field Name: clearbit_company_category_naics_code
    * * Display Name: clearbit _company _category _naics _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_category_naics_code(): string | null {
        return this.Get('clearbit_company_category_naics_code');
    }
    set clearbit_company_category_naics_code(value: string | null) {
        this.Set('clearbit_company_category_naics_code', value);
    }

    /**
    * * Field Name: clearbit_company_category_sector
    * * Display Name: clearbit _company _category _sector
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_category_sector(): string | null {
        return this.Get('clearbit_company_category_sector');
    }
    set clearbit_company_category_sector(value: string | null) {
        this.Set('clearbit_company_category_sector', value);
    }

    /**
    * * Field Name: clearbit_company_category_sic_code
    * * Display Name: clearbit _company _category _sic _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_category_sic_code(): string | null {
        return this.Get('clearbit_company_category_sic_code');
    }
    set clearbit_company_category_sic_code(value: string | null) {
        this.Set('clearbit_company_category_sic_code', value);
    }

    /**
    * * Field Name: clearbit_company_category_sub_industry
    * * Display Name: clearbit _company _category _sub _industry
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_category_sub_industry(): string | null {
        return this.Get('clearbit_company_category_sub_industry');
    }
    set clearbit_company_category_sub_industry(value: string | null) {
        this.Set('clearbit_company_category_sub_industry', value);
    }

    /**
    * * Field Name: clearbit_company_geo_city
    * * Display Name: clearbit _company _geo _city
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_geo_city(): string | null {
        return this.Get('clearbit_company_geo_city');
    }
    set clearbit_company_geo_city(value: string | null) {
        this.Set('clearbit_company_geo_city', value);
    }

    /**
    * * Field Name: clearbit_company_geo_country
    * * Display Name: clearbit _company _geo _country
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_geo_country(): string | null {
        return this.Get('clearbit_company_geo_country');
    }
    set clearbit_company_geo_country(value: string | null) {
        this.Set('clearbit_company_geo_country', value);
    }

    /**
    * * Field Name: clearbit_company_geo_country_code
    * * Display Name: clearbit _company _geo _country _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_geo_country_code(): string | null {
        return this.Get('clearbit_company_geo_country_code');
    }
    set clearbit_company_geo_country_code(value: string | null) {
        this.Set('clearbit_company_geo_country_code', value);
    }

    /**
    * * Field Name: clearbit_company_geo_postal_code
    * * Display Name: clearbit _company _geo _postal _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_geo_postal_code(): string | null {
        return this.Get('clearbit_company_geo_postal_code');
    }
    set clearbit_company_geo_postal_code(value: string | null) {
        this.Set('clearbit_company_geo_postal_code', value);
    }

    /**
    * * Field Name: clearbit_company_geo_state
    * * Display Name: clearbit _company _geo _state
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_geo_state(): string | null {
        return this.Get('clearbit_company_geo_state');
    }
    set clearbit_company_geo_state(value: string | null) {
        this.Set('clearbit_company_geo_state', value);
    }

    /**
    * * Field Name: clearbit_company_geo_state_code
    * * Display Name: clearbit _company _geo _state _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_geo_state_code(): string | null {
        return this.Get('clearbit_company_geo_state_code');
    }
    set clearbit_company_geo_state_code(value: string | null) {
        this.Set('clearbit_company_geo_state_code', value);
    }

    /**
    * * Field Name: clearbit_company_geo_street_name
    * * Display Name: clearbit _company _geo _street _name
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_geo_street_name(): string | null {
        return this.Get('clearbit_company_geo_street_name');
    }
    set clearbit_company_geo_street_name(value: string | null) {
        this.Set('clearbit_company_geo_street_name', value);
    }

    /**
    * * Field Name: clearbit_company_geo_street_number
    * * Display Name: clearbit _company _geo _street _number
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_geo_street_number(): string | null {
        return this.Get('clearbit_company_geo_street_number');
    }
    set clearbit_company_geo_street_number(value: string | null) {
        this.Set('clearbit_company_geo_street_number', value);
    }

    /**
    * * Field Name: clearbit_company_legal_name
    * * Display Name: clearbit _company _legal _name
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_legal_name(): string | null {
        return this.Get('clearbit_company_legal_name');
    }
    set clearbit_company_legal_name(value: string | null) {
        this.Set('clearbit_company_legal_name', value);
    }

    /**
    * * Field Name: clearbit_company_metrics_annual_revenue
    * * Display Name: clearbit _company _metrics _annual _revenue
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_metrics_annual_revenue(): string | null {
        return this.Get('clearbit_company_metrics_annual_revenue');
    }
    set clearbit_company_metrics_annual_revenue(value: string | null) {
        this.Set('clearbit_company_metrics_annual_revenue', value);
    }

    /**
    * * Field Name: clearbit_company_metrics_employees
    * * Display Name: clearbit _company _metrics _employees
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_metrics_employees(): string | null {
        return this.Get('clearbit_company_metrics_employees');
    }
    set clearbit_company_metrics_employees(value: string | null) {
        this.Set('clearbit_company_metrics_employees', value);
    }

    /**
    * * Field Name: clearbit_company_metrics_employees_range
    * * Display Name: clearbit _company _metrics _employees _range
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_metrics_employees_range(): string | null {
        return this.Get('clearbit_company_metrics_employees_range');
    }
    set clearbit_company_metrics_employees_range(value: string | null) {
        this.Set('clearbit_company_metrics_employees_range', value);
    }

    /**
    * * Field Name: clearbit_company_metrics_estimated_annual_revenue
    * * Display Name: clearbit _company _metrics _estimated _annual _revenue
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_metrics_estimated_annual_revenue(): string | null {
        return this.Get('clearbit_company_metrics_estimated_annual_revenue');
    }
    set clearbit_company_metrics_estimated_annual_revenue(value: string | null) {
        this.Set('clearbit_company_metrics_estimated_annual_revenue', value);
    }

    /**
    * * Field Name: clearbit_company_name
    * * Display Name: clearbit _company _name
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_name(): string | null {
        return this.Get('clearbit_company_name');
    }
    set clearbit_company_name(value: string | null) {
        this.Set('clearbit_company_name', value);
    }

    /**
    * * Field Name: clearbit_company_tags
    * * Display Name: clearbit _company _tags
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_tags(): string | null {
        return this.Get('clearbit_company_tags');
    }
    set clearbit_company_tags(value: string | null) {
        this.Set('clearbit_company_tags', value);
    }

    /**
    * * Field Name: clearbit_company_type
    * * Display Name: clearbit _company _type
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_company_type(): string | null {
        return this.Get('clearbit_company_type');
    }
    set clearbit_company_type(value: string | null) {
        this.Set('clearbit_company_type', value);
    }

    /**
    * * Field Name: clearbit_person_employment_role
    * * Display Name: clearbit _person _employment _role
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_person_employment_role(): string | null {
        return this.Get('clearbit_person_employment_role');
    }
    set clearbit_person_employment_role(value: string | null) {
        this.Set('clearbit_person_employment_role', value);
    }

    /**
    * * Field Name: clearbit_person_employment_seniority
    * * Display Name: clearbit _person _employment _seniority
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_person_employment_seniority(): string | null {
        return this.Get('clearbit_person_employment_seniority');
    }
    set clearbit_person_employment_seniority(value: string | null) {
        this.Set('clearbit_person_employment_seniority', value);
    }

    /**
    * * Field Name: clearbit_person_employment_title
    * * Display Name: clearbit _person _employment _title
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_person_employment_title(): string | null {
        return this.Get('clearbit_person_employment_title');
    }
    set clearbit_person_employment_title(value: string | null) {
        this.Set('clearbit_person_employment_title', value);
    }

    /**
    * * Field Name: clearbit_person_geo_city
    * * Display Name: clearbit _person _geo _city
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_person_geo_city(): string | null {
        return this.Get('clearbit_person_geo_city');
    }
    set clearbit_person_geo_city(value: string | null) {
        this.Set('clearbit_person_geo_city', value);
    }

    /**
    * * Field Name: clearbit_person_geo_country
    * * Display Name: clearbit _person _geo _country
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_person_geo_country(): string | null {
        return this.Get('clearbit_person_geo_country');
    }
    set clearbit_person_geo_country(value: string | null) {
        this.Set('clearbit_person_geo_country', value);
    }

    /**
    * * Field Name: clearbit_person_geo_country_code
    * * Display Name: clearbit _person _geo _country _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_person_geo_country_code(): string | null {
        return this.Get('clearbit_person_geo_country_code');
    }
    set clearbit_person_geo_country_code(value: string | null) {
        this.Set('clearbit_person_geo_country_code', value);
    }

    /**
    * * Field Name: clearbit_person_geo_state
    * * Display Name: clearbit _person _geo _state
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_person_geo_state(): string | null {
        return this.Get('clearbit_person_geo_state');
    }
    set clearbit_person_geo_state(value: string | null) {
        this.Set('clearbit_person_geo_state', value);
    }

    /**
    * * Field Name: clearbit_person_geo_state_code
    * * Display Name: clearbit _person _geo _state _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get clearbit_person_geo_state_code(): string | null {
        return this.Get('clearbit_person_geo_state_code');
    }
    set clearbit_person_geo_state_code(value: string | null) {
        this.Set('clearbit_person_geo_state_code', value);
    }

    /**
    * * Field Name: company
    * * Display Name: company
    * * SQL Data Type: nvarchar(MAX)
    */
    get company(): string | null {
        return this.Get('company');
    }
    set company(value: string | null) {
        this.Set('company', value);
    }

    /**
    * * Field Name: companySizeCode
    * * Display Name: company Size Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get companySizeCode(): string | null {
        return this.Get('companySizeCode');
    }
    set companySizeCode(value: string | null) {
        this.Set('companySizeCode', value);
    }

    /**
    * * Field Name: companyname
    * * Display Name: companyname
    * * SQL Data Type: nvarchar(MAX)
    */
    get companyname(): string | null {
        return this.Get('companyname');
    }
    set companyname(value: string | null) {
        this.Set('companyname', value);
    }

    /**
    * * Field Name: conferenceRegistrations
    * * Display Name: conference Registrations
    * * SQL Data Type: nvarchar(MAX)
    */
    get conferenceRegistrations(): string | null {
        return this.Get('conferenceRegistrations');
    }
    set conferenceRegistrations(value: string | null) {
        this.Set('conferenceRegistrations', value);
    }

    /**
    * * Field Name: countryCode
    * * Display Name: country Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get countryCode(): string | null {
        return this.Get('countryCode');
    }
    set countryCode(value: string | null) {
        this.Set('countryCode', value);
    }

    /**
    * * Field Name: created
    * * Display Name: created
    * * SQL Data Type: nvarchar(MAX)
    */
    get created(): string | null {
        return this.Get('created');
    }
    set created(value: string | null) {
        this.Set('created', value);
    }

    /**
    * * Field Name: createdAt
    * * Display Name: created At
    * * SQL Data Type: nvarchar(MAX)
    */
    get createdAt(): string | null {
        return this.Get('createdAt');
    }
    set createdAt(value: string | null) {
        this.Set('createdAt', value);
    }

    /**
    * * Field Name: ctdoSubscriber
    * * Display Name: ctdo Subscriber
    * * SQL Data Type: nvarchar(MAX)
    */
    get ctdoSubscriber(): string | null {
        return this.Get('ctdoSubscriber');
    }
    set ctdoSubscriber(value: string | null) {
        this.Set('ctdoSubscriber', value);
    }

    /**
    * * Field Name: directReportCountCode
    * * Display Name: direct Report Count Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get directReportCountCode(): string | null {
        return this.Get('directReportCountCode');
    }
    set directReportCountCode(value: string | null) {
        this.Set('directReportCountCode', value);
    }

    /**
    * * Field Name: educationProducts
    * * Display Name: education Products
    * * SQL Data Type: nvarchar(MAX)
    */
    get educationProducts(): string | null {
        return this.Get('educationProducts');
    }
    set educationProducts(value: string | null) {
        this.Set('educationProducts', value);
    }

    /**
    * * Field Name: emailPreferences
    * * Display Name: email Preferences
    * * SQL Data Type: nvarchar(MAX)
    */
    get emailPreferences(): string | null {
        return this.Get('emailPreferences');
    }
    set emailPreferences(value: string | null) {
        this.Set('emailPreferences', value);
    }

    /**
    * * Field Name: industryCode
    * * Display Name: industry Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get industryCode(): string | null {
        return this.Get('industryCode');
    }
    set industryCode(value: string | null) {
        this.Set('industryCode', value);
    }

    /**
    * * Field Name: isChapterLeader
    * * Display Name: is Chapter Leader
    * * SQL Data Type: nvarchar(MAX)
    */
    get isChapterLeader(): string | null {
        return this.Get('isChapterLeader');
    }
    set isChapterLeader(value: string | null) {
        this.Set('isChapterLeader', value);
    }

    /**
    * * Field Name: isChapterMember
    * * Display Name: is Chapter Member
    * * SQL Data Type: nvarchar(MAX)
    */
    get isChapterMember(): string | null {
        return this.Get('isChapterMember');
    }
    set isChapterMember(value: string | null) {
        this.Set('isChapterMember', value);
    }

    /**
    * * Field Name: isEmailVerified
    * * Display Name: is Email Verified
    * * SQL Data Type: nvarchar(MAX)
    */
    get isEmailVerified(): string | null {
        return this.Get('isEmailVerified');
    }
    set isEmailVerified(value: string | null) {
        this.Set('isEmailVerified', value);
    }

    /**
    * * Field Name: isEnterpriseMember
    * * Display Name: is Enterprise Member
    * * SQL Data Type: nvarchar(MAX)
    */
    get isEnterpriseMember(): string | null {
        return this.Get('isEnterpriseMember');
    }
    set isEnterpriseMember(value: string | null) {
        this.Set('isEnterpriseMember', value);
    }

    /**
    * * Field Name: isFacilitator
    * * Display Name: is Facilitator
    * * SQL Data Type: nvarchar(MAX)
    */
    get isFacilitator(): string | null {
        return this.Get('isFacilitator');
    }
    set isFacilitator(value: string | null) {
        this.Set('isFacilitator', value);
    }

    /**
    * * Field Name: isInterestedAutoRenewOffer
    * * Display Name: is Interested Auto Renew Offer
    * * SQL Data Type: nvarchar(MAX)
    */
    get isInterestedAutoRenewOffer(): string | null {
        return this.Get('isInterestedAutoRenewOffer');
    }
    set isInterestedAutoRenewOffer(value: string | null) {
        this.Set('isInterestedAutoRenewOffer', value);
    }

    /**
    * * Field Name: isMember
    * * Display Name: is Member
    * * SQL Data Type: nvarchar(MAX)
    */
    get isMember(): string | null {
        return this.Get('isMember');
    }
    set isMember(value: string | null) {
        this.Set('isMember', value);
    }

    /**
    * * Field Name: isNewAndFirstTimeMember
    * * Display Name: is New And First Time Member
    * * SQL Data Type: nvarchar(MAX)
    */
    get isNewAndFirstTimeMember(): string | null {
        return this.Get('isNewAndFirstTimeMember');
    }
    set isNewAndFirstTimeMember(value: string | null) {
        this.Set('isNewAndFirstTimeMember', value);
    }

    /**
    * * Field Name: is_member
    * * Display Name: is _member
    * * SQL Data Type: nvarchar(MAX)
    */
    get is_member(): string | null {
        return this.Get('is_member');
    }
    set is_member(value: string | null) {
        this.Set('is_member', value);
    }

    /**
    * * Field Name: is_partner
    * * Display Name: is _partner
    * * SQL Data Type: nvarchar(MAX)
    */
    get is_partner(): string | null {
        return this.Get('is_partner');
    }
    set is_partner(value: string | null) {
        this.Set('is_partner', value);
    }

    /**
    * * Field Name: jobFunctionCode
    * * Display Name: job Function Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get jobFunctionCode(): string | null {
        return this.Get('jobFunctionCode');
    }
    set jobFunctionCode(value: string | null) {
        this.Set('jobFunctionCode', value);
    }

    /**
    * * Field Name: jobTitle
    * * Display Name: job Title
    * * SQL Data Type: nvarchar(MAX)
    */
    get jobTitle(): string | null {
        return this.Get('jobTitle');
    }
    set jobTitle(value: string | null) {
        this.Set('jobTitle', value);
    }

    /**
    * * Field Name: mainActiveProducts
    * * Display Name: main Active Products
    * * SQL Data Type: nvarchar(MAX)
    */
    get mainActiveProducts(): string | null {
        return this.Get('mainActiveProducts');
    }
    set mainActiveProducts(value: string | null) {
        this.Set('mainActiveProducts', value);
    }

    /**
    * * Field Name: order_count
    * * Display Name: order _count
    * * SQL Data Type: nvarchar(MAX)
    */
    get order_count(): string | null {
        return this.Get('order_count');
    }
    set order_count(value: string | null) {
        this.Set('order_count', value);
    }

    /**
    * * Field Name: personify_product_code
    * * Display Name: personify _product _code
    * * SQL Data Type: nvarchar(MAX)
    */
    get personify_product_code(): string | null {
        return this.Get('personify_product_code');
    }
    set personify_product_code(value: string | null) {
        this.Set('personify_product_code', value);
    }

    /**
    * * Field Name: postalCode
    * * Display Name: postal Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get postalCode(): string | null {
        return this.Get('postalCode');
    }
    set postalCode(value: string | null) {
        this.Set('postalCode', value);
    }

    /**
    * * Field Name: productSubscriptions
    * * Display Name: product Subscriptions
    * * SQL Data Type: nvarchar(MAX)
    */
    get productSubscriptions(): string | null {
        return this.Get('productSubscriptions');
    }
    set productSubscriptions(value: string | null) {
        this.Set('productSubscriptions', value);
    }

    /**
    * * Field Name: profilePercentageCompleted
    * * Display Name: profile Percentage Completed
    * * SQL Data Type: nvarchar(MAX)
    */
    get profilePercentageCompleted(): string | null {
        return this.Get('profilePercentageCompleted');
    }
    set profilePercentageCompleted(value: string | null) {
        this.Set('profilePercentageCompleted', value);
    }

    /**
    * * Field Name: roleCode
    * * Display Name: role Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get roleCode(): string | null {
        return this.Get('roleCode');
    }
    set roleCode(value: string | null) {
        this.Set('roleCode', value);
    }

    /**
    * * Field Name: state
    * * Display Name: state
    * * SQL Data Type: nvarchar(MAX)
    */
    get state(): string | null {
        return this.Get('state');
    }
    set state(value: string | null) {
        this.Set('state', value);
    }

    /**
    * * Field Name: tdAtWorkSubscriber
    * * Display Name: td At Work Subscriber
    * * SQL Data Type: nvarchar(MAX)
    */
    get tdAtWorkSubscriber(): string | null {
        return this.Get('tdAtWorkSubscriber');
    }
    set tdAtWorkSubscriber(value: string | null) {
        this.Set('tdAtWorkSubscriber', value);
    }

    /**
    * * Field Name: teamSize
    * * Display Name: team Size
    * * SQL Data Type: nvarchar(MAX)
    */
    get teamSize(): string | null {
        return this.Get('teamSize');
    }
    set teamSize(value: string | null) {
        this.Set('teamSize', value);
    }

    /**
    * * Field Name: title
    * * Display Name: title
    * * SQL Data Type: nvarchar(MAX)
    */
    get title(): string | null {
        return this.Get('title');
    }
    set title(value: string | null) {
        this.Set('title', value);
    }

    /**
    * * Field Name: topicsFollowed
    * * Display Name: topics Followed
    * * SQL Data Type: nvarchar(MAX)
    */
    get topicsFollowed(): string | null {
        return this.Get('topicsFollowed');
    }
    set topicsFollowed(value: string | null) {
        this.Set('topicsFollowed', value);
    }

    /**
    * * Field Name: tpmSubscriber
    * * Display Name: tpm Subscriber
    * * SQL Data Type: nvarchar(MAX)
    */
    get tpmSubscriber(): string | null {
        return this.Get('tpmSubscriber');
    }
    set tpmSubscriber(value: string | null) {
        this.Set('tpmSubscriber', value);
    }

    /**
    * * Field Name: trainingBudgetCode
    * * Display Name: training Budget Code
    * * SQL Data Type: nvarchar(MAX)
    */
    get trainingBudgetCode(): string | null {
        return this.Get('trainingBudgetCode');
    }
    set trainingBudgetCode(value: string | null) {
        this.Set('trainingBudgetCode', value);
    }

    /**
    * * Field Name: created_at
    * * Display Name: created _at
    * * SQL Data Type: nvarchar(MAX)
    */
    get created_at(): string | null {
        return this.Get('created_at');
    }
    set created_at(value: string | null) {
        this.Set('created_at', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }

    /**
    * * Field Name: TestEmail
    * * Display Name: Test Email
    * * SQL Data Type: nvarchar(255)
    */
    get TestEmail(): string | null {
        return this.Get('TestEmail');
    }
    set TestEmail(value: string | null) {
        this.Set('TestEmail', value);
    }
}
