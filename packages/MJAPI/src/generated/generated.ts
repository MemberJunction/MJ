/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
* GENERATED: 9/17/2024, 1:27:03 PM
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import { DataSource } from 'typeorm';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { CourseEntity, CoursePartEntity, PersonEntity, PersonEducationHistoryEntity, PersonEmploymentHistoryEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Courses
//****************************************************************************
@ObjectType()
export class Course_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Name?: string;
        
    @Field({nullable: true}) 
    Description?: string;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    WebLink?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field(() => [CoursePart_])
    CourseParts_CourseIDArray: CoursePart_[]; // Link to CourseParts
    
}

//****************************************************************************
// INPUT TYPE for Courses
//****************************************************************************
@InputType()
export class CreateCourseInput {
    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    WebLink?: string;
}
    

//****************************************************************************
// INPUT TYPE for Courses
//****************************************************************************
@InputType()
export class UpdateCourseInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

    @Field({ nullable: true })
    Description?: string;

    @Field({ nullable: true })
    WebLink?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Courses
//****************************************************************************
@ObjectType()
export class RunCourseViewResult {
    @Field(() => [Course_])
    Results: Course_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Course_)
export class CourseResolver extends ResolverBase {
    @Query(() => RunCourseViewResult)
    async RunCourseViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCourseViewResult)
    async RunCourseViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCourseViewResult)
    async RunCourseDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Courses';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Course_, { nullable: true })
    async Course(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Course_ | null> {
        this.CheckUserReadPermissions('Courses', userPayload);
        const sSQL = `SELECT * FROM [ATD].[vwCourses] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Courses', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Courses', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [CoursePart_])
    async CourseParts_CourseIDArray(@Root() course_: Course_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Course Parts', userPayload);
        const sSQL = `SELECT * FROM [ATD].[vwCourseParts] WHERE [CourseID]=${course_.ID} ` + this.getRowLevelSecurityWhereClause('Course Parts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Course Parts', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Course_)
    async CreateCourse(
        @Arg('input', () => CreateCourseInput) input: CreateCourseInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Courses', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Course_)
    async UpdateCourse(
        @Arg('input', () => UpdateCourseInput) input: UpdateCourseInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Courses', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Course_)
    async DeleteCourse(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Courses', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Course Parts
//****************************************************************************
@ObjectType()
export class CoursePart_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    @MaxLength(255)
    Name?: string;
        
    @Field(() => Int, {nullable: true}) 
    CourseID?: number;
        
    @Field({nullable: true}) 
    Text?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Course Parts
//****************************************************************************
@InputType()
export class CreateCoursePartInput {
    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    CourseID?: number;

    @Field({ nullable: true })
    Text?: string;
}
    

//****************************************************************************
// INPUT TYPE for Course Parts
//****************************************************************************
@InputType()
export class UpdateCoursePartInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    Name?: string;

    @Field(() => Int, { nullable: true })
    CourseID?: number;

    @Field({ nullable: true })
    Text?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Course Parts
//****************************************************************************
@ObjectType()
export class RunCoursePartViewResult {
    @Field(() => [CoursePart_])
    Results: CoursePart_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(CoursePart_)
export class CoursePartResolver extends ResolverBase {
    @Query(() => RunCoursePartViewResult)
    async RunCoursePartViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCoursePartViewResult)
    async RunCoursePartViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunCoursePartViewResult)
    async RunCoursePartDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Course Parts';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => CoursePart_, { nullable: true })
    async CoursePart(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<CoursePart_ | null> {
        this.CheckUserReadPermissions('Course Parts', userPayload);
        const sSQL = `SELECT * FROM [ATD].[vwCourseParts] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Course Parts', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Course Parts', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => CoursePart_)
    async CreateCoursePart(
        @Arg('input', () => CreateCoursePartInput) input: CreateCoursePartInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Course Parts', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => CoursePart_)
    async UpdateCoursePart(
        @Arg('input', () => UpdateCoursePartInput) input: UpdateCoursePartInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Course Parts', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => CoursePart_)
    async DeleteCoursePart(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Course Parts', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Persons
//****************************************************************************
@ObjectType()
export class Person_ {
    @Field(() => Int) 
    ID: number;
        
    @Field({nullable: true}) 
    first_name?: string;
        
    @Field({nullable: true}) 
    timezone?: string;
        
    @Field({nullable: true}) 
    city?: string;
        
    @Field({nullable: true}) 
    email?: string;
        
    @Field({nullable: true}) 
    session_count?: string;
        
    @Field({nullable: true}) 
    first_session?: string;
        
    @Field({nullable: true}) 
    last_session?: string;
        
    @Field({nullable: true}) 
    in_app_purchase_total?: string;
        
    @Field({nullable: true}) 
    unsubscribed_from_emails_at?: string;
        
    @Field({nullable: true}) 
    active_resource_center_members_last_6_months?: string;
        
    @Field({nullable: true}) 
    allowPhone?: string;
        
    @Field({nullable: true}) 
    allowSolicitation?: string;
        
    @Field({nullable: true}) 
    aud_awards_website_and_webcasts?: string;
        
    @Field({nullable: true}) 
    aud_change_management_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_ci_aptd_high_interest?: string;
        
    @Field({nullable: true}) 
    aud_ci_aptd_prep_purchases?: string;
        
    @Field({nullable: true}) 
    aud_ci_aptd_web_interest?: string;
        
    @Field({nullable: true}) 
    aud_ci_bok_purchases?: string;
        
    @Field({nullable: true}) 
    aud_ci_cplp_interest_group?: string;
        
    @Field({nullable: true}) 
    aud_ci_general_certification_interest_group?: string;
        
    @Field({nullable: true}) 
    aud_ci_masters_more_than_6_mo?: string;
        
    @Field({nullable: true}) 
    aud_con_atd_yale_2020_purchased?: string;
        
    @Field({nullable: true}) 
    aud_con_core_42020_chicago_purchased?: string;
        
    @Field({nullable: true}) 
    aud_con_core_4_2020_chicago_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_core_4_2020_nashville_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_core_4_2020_nashville_purchased?: string;
        
    @Field({nullable: true}) 
    aud_con_core_4_2020_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_dir_job_function?: string;
        
    @Field({nullable: true}) 
    aud_con_edu_tk_2020_precon_pages_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_gov_wf_2020_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_gov_wf_2020_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_consideration_target?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_eb_last_chance_openers?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_email_clickers?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_email_opened?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_purchased?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_reg_page_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_team_target?: string;
        
    @Field({nullable: true}) 
    aud_con_ice_2020_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_mbr_lapsed_10_31_19?: string;
        
    @Field({nullable: true}) 
    aud_con_org_dev_2020_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_org_dev_2020_purchased?: string;
        
    @Field({nullable: true}) 
    aud_con_org_dev_2020_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_purchase_last_6_months?: string;
        
    @Field({nullable: true}) 
    aud_con_sell_2020_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_sell_2020_purchased?: string;
        
    @Field({nullable: true}) 
    aud_con_sell_2020_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_consideration_target?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_email_clickers?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_email_opened?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_mbr_bundle?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_medina_wkshp_registrants?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_medina_workshop_page_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_plustk_2020_purchased?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_purchased?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_reg_page_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_registrant_feedback_email_opens?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_2020_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_tk_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_vc_2_2020_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_virtual_2020_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_virtual_conference_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_con_west_coast_states?: string;
        
    @Field({nullable: true}) 
    aud_con_yale_2020_cart_abandonment?: string;
        
    @Field({nullable: true}) 
    aud_con_yale_2020_dir_job_function?: string;
        
    @Field({nullable: true}) 
    aud_con_yale_2020_email_clickers?: string;
        
    @Field({nullable: true}) 
    aud_con_yale_2020_website_visitors?: string;
        
    @Field({nullable: true}) 
    aud_conf_vc_2_telemarketing_hot_leads?: string;
        
    @Field({nullable: true}) 
    aud_ctdo_next?: string;
        
    @Field({nullable: true}) 
    aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers?: string;
        
    @Field({nullable: true}) 
    aud_edu_allmasterprograms_pagevisitors_last_6_mo?: string;
        
    @Field({nullable: true}) 
    aud_edu_catalog_2020_virtual_downloads?: string;
        
    @Field({nullable: true}) 
    aud_edu_form_catalog_2020?: string;
        
    @Field({nullable: true}) 
    aud_edu_ice_precon_2020_target_audience?: string;
        
    @Field({nullable: true}) 
    aud_edu_in_person_course_purchasers_last_365_days?: string;
        
    @Field({nullable: true}) 
    aud_edu_or_con_purchasers_cyber_week_2021?: string;
        
    @Field({nullable: true}) 
    aud_edu_page_visits_all?: string;
        
    @Field({nullable: true}) 
    aud_edu_precon_2020_purchased?: string;
        
    @Field({nullable: true}) 
    aud_edu_purchased_cert?: string;
        
    @Field({nullable: true}) 
    aud_edu_purchased_cert_14_days?: string;
        
    @Field({nullable: true}) 
    aud_edu_purchased_cert_6_mos?: string;
        
    @Field({nullable: true}) 
    aud_edu_purchased_tc_last_6_m_os?: string;
        
    @Field({nullable: true}) 
    aud_edu_tdbok_interest?: string;
        
    @Field({nullable: true}) 
    aud_edu_tk_precon_purchased?: string;
        
    @Field({nullable: true}) 
    aud_ent_ice_2020_teams_purchased?: string;
        
    @Field({nullable: true}) 
    aud_ent_td_leader_nl_4_times?: string;
        
    @Field({nullable: true}) 
    aud_expiring_member?: string;
        
    @Field({nullable: true}) 
    aud_global_international_members?: string;
        
    @Field({nullable: true}) 
    aud_global_perspectives_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_government_newsletter?: string;
        
    @Field({nullable: true}) 
    aud_healthcare_news_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_instructional_design_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_is_member?: string;
        
    @Field({nullable: true}) 
    aud_leadership_development_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_learning_technologies_engagement?: string;
        
    @Field({nullable: true}) 
    aud_management_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_mbr_acq_interest?: string;
        
    @Field({nullable: true}) 
    aud_mbr_acq_interest_decades?: string;
        
    @Field({nullable: true}) 
    aud_mbr_acq_interest_decades_updated?: string;
        
    @Field({nullable: true}) 
    aud_mbr_benefits_available?: string;
        
    @Field({nullable: true}) 
    aud_mbr_claimed_all_benefits?: string;
        
    @Field({nullable: true}) 
    aud_mbr_claimed_atleast_one_benefit?: string;
        
    @Field({nullable: true}) 
    aud_mbr_expiring_30_days_not_renewed?: string;
        
    @Field({nullable: true}) 
    aud_mbr_expiring_next_90_days?: string;
        
    @Field({nullable: true}) 
    aud_mbr_low_engage_6_mo?: string;
        
    @Field({nullable: true}) 
    aud_mbr_non_expiring?: string;
        
    @Field({nullable: true}) 
    aud_mbr_order_completed_allod?: string;
        
    @Field({nullable: true}) 
    aud_mbr_tdw_exp_nov_2020?: string;
        
    @Field({nullable: true}) 
    aud_mbr_zero_benefits?: string;
        
    @Field({nullable: true}) 
    aud_mbr_zero_benefits_used?: string;
        
    @Field({nullable: true}) 
    aud_mbrshp_purchased_last_90_days?: string;
        
    @Field({nullable: true}) 
    aud_member_benefits_center_tab_clicked?: string;
        
    @Field({nullable: true}) 
    aud_member_newsletter_openers?: string;
        
    @Field({nullable: true}) 
    aud_members_onboarding?: string;
        
    @Field({nullable: true}) 
    aud_members_with_available_benefits?: string;
        
    @Field({nullable: true}) 
    aud_my_career_engagement?: string;
        
    @Field({nullable: true}) 
    aud_my_career_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_net_new?: string;
        
    @Field({nullable: true}) 
    aud_nonmembers?: string;
        
    @Field({nullable: true}) 
    aud_performance_consulting_improvement_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_preference_change_management?: string;
        
    @Field({nullable: true}) 
    aud_pubs_smr_sale_2020_target?: string;
        
    @Field({nullable: true}) 
    aud_pubs_workshop_2022_purchasers?: string;
        
    @Field({nullable: true}) 
    aud_purchased_books_starting_with_11_71_19_70?: string;
        
    @Field({nullable: true}) 
    aud_sales_enablement_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_sales_force_working_leads?: string;
        
    @Field({nullable: true}) 
    aud_sso_created_or_is_member?: string;
        
    @Field({nullable: true}) 
    aud_talent_management_narrow_engagement?: string;
        
    @Field({nullable: true}) 
    aud_talent_management_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_td_executive_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_topic_engagement_science_of_learning?: string;
        
    @Field({nullable: true}) 
    aud_training_delivery_topic_engagement?: string;
        
    @Field({nullable: true}) 
    aud_unengaged_users?: string;
        
    @Field({nullable: true}) 
    aud_virtual_fall_2020_core_4?: string;
        
    @Field({nullable: true}) 
    aud_virtual_fall_2020_future_of_work?: string;
        
    @Field({nullable: true}) 
    aud_virtual_fall_2020_org_dev?: string;
        
    @Field({nullable: true}) 
    aud_webcast_email_engagement?: string;
        
    @Field({nullable: true}) 
    automatedNewsletters?: string;
        
    @Field({nullable: true}) 
    c_active_chapter_leader?: string;
        
    @Field({nullable: true}) 
    c_aptd_holder?: string;
        
    @Field({nullable: true}) 
    c_capability?: string;
        
    @Field({nullable: true}) 
    c_capability_model_assessment_completion?: string;
        
    @Field({nullable: true}) 
    c_chapter?: string;
        
    @Field({nullable: true}) 
    c_closest_chapter_direction?: string;
        
    @Field({nullable: true}) 
    c_closest_chapter_name?: string;
        
    @Field({nullable: true}) 
    c_closest_chapter_state?: string;
        
    @Field({nullable: true}) 
    c_consecutive_years_as_member?: string;
        
    @Field({nullable: true}) 
    c_cptd_holder?: string;
        
    @Field({nullable: true}) 
    c_edu_page_title_list_7_days?: string;
        
    @Field({nullable: true}) 
    c_edu_products_purchased?: string;
        
    @Field({nullable: true}) 
    c_education_pages_list?: string;
        
    @Field({nullable: true}) 
    c_education_program_completed_last6months?: string;
        
    @Field({nullable: true}) 
    c_email_links_clicked?: string;
        
    @Field({nullable: true}) 
    c_enterprise_company?: string;
        
    @Field({nullable: true}) 
    c_enterprise_memberhip_acquisition_type?: string;
        
    @Field({nullable: true}) 
    c_enterprise_membership_period_begin?: string;
        
    @Field({nullable: true}) 
    c_enterprise_membership_period_end?: string;
        
    @Field({nullable: true}) 
    c_enterprise_membership_renewal_date?: string;
        
    @Field({nullable: true}) 
    c_enterprise_membership_retention_stage?: string;
        
    @Field({nullable: true}) 
    c_enterprise_order_date?: string;
        
    @Field({nullable: true}) 
    c_expire_chapter_leader_30_day?: string;
        
    @Field({nullable: true}) 
    c_forms_submitted?: string;
        
    @Field({nullable: true}) 
    c_initial_membership_date?: string;
        
    @Field({nullable: true}) 
    c_is_closest_chapter_member?: string;
        
    @Field({nullable: true}) 
    c_is_enterprise_member?: string;
        
    @Field({nullable: true}) 
    c_is_member?: string;
        
    @Field({nullable: true}) 
    c_is_power_member?: string;
        
    @Field({nullable: true}) 
    c_is_senior_membership?: string;
        
    @Field({nullable: true}) 
    c_is_student_membership?: string;
        
    @Field({nullable: true}) 
    c_job_title_group?: string;
        
    @Field({nullable: true}) 
    c_learning_plan_created?: string;
        
    @Field({nullable: true}) 
    c_member_subtype?: string;
        
    @Field({nullable: true}) 
    c_member_type?: string;
        
    @Field({nullable: true}) 
    c_memberhip_retention_type?: string;
        
    @Field({nullable: true}) 
    c_membership_acquisition_type?: string;
        
    @Field({nullable: true}) 
    c_membership_auto_renew?: string;
        
    @Field({nullable: true}) 
    c_membership_bundle?: string;
        
    @Field({nullable: true}) 
    c_membership_conference_value_seeker?: string;
        
    @Field({nullable: true}) 
    c_membership_education_value_seeker?: string;
        
    @Field({nullable: true}) 
    c_membership_is_comp?: string;
        
    @Field({nullable: true}) 
    c_membership_is_internal?: string;
        
    @Field({nullable: true}) 
    c_membership_period_begin?: string;
        
    @Field({nullable: true}) 
    c_membership_period_end?: string;
        
    @Field({nullable: true}) 
    c_membership_pro_or_plus?: string;
        
    @Field({nullable: true}) 
    c_membership_product?: string;
        
    @Field({nullable: true}) 
    c_membership_rate_code?: string;
        
    @Field({nullable: true}) 
    c_membership_renewal_date?: string;
        
    @Field({nullable: true}) 
    c_membership_renewed_in?: string;
        
    @Field({nullable: true}) 
    c_membership_retention_stage?: string;
        
    @Field({nullable: true}) 
    c_membership_type_code?: string;
        
    @Field({nullable: true}) 
    c_most_engaged_topic_web?: string;
        
    @Field({nullable: true}) 
    c_onboarding_member?: string;
        
    @Field({nullable: true}) 
    c_pages_visited?: string;
        
    @Field({nullable: true}) 
    c_pages_visited_topics?: string;
        
    @Field({nullable: true}) 
    c_product_purchase_topics?: string;
        
    @Field({nullable: true}) 
    c_products_purchased?: string;
        
    @Field({nullable: true}) 
    c_products_purchased_by_name?: string;
        
    @Field({nullable: true}) 
    c_research_benefits_used?: string;
        
    @Field({nullable: true}) 
    c_sfmc_newsletter_engagement?: string;
        
    @Field({nullable: true}) 
    c_terminate_at_end?: string;
        
    @Field({nullable: true}) 
    c_topics_followed?: string;
        
    @Field({nullable: true}) 
    c_webcast?: string;
        
    @Field({nullable: true}) 
    c_webcast_first_attendance_date?: string;
        
    @Field({nullable: true}) 
    c_webcast_first_registration_date?: string;
        
    @Field({nullable: true}) 
    c_webcast_id?: string;
        
    @Field({nullable: true}) 
    c_webcast_last_attendance_date?: string;
        
    @Field({nullable: true}) 
    c_webcast_last_registration_date?: string;
        
    @Field({nullable: true}) 
    c_webcast_name?: string;
        
    @Field({nullable: true}) 
    c_webcast_primary_tags?: string;
        
    @Field({nullable: true}) 
    c_webcasts_attended?: string;
        
    @Field({nullable: true}) 
    c_weeks_to_expire?: string;
        
    @Field({nullable: true}) 
    c_wish_list_product_codes?: string;
        
    @Field({nullable: true}) 
    c_with_list_product_codes?: string;
        
    @Field({nullable: true}) 
    c_within_60_mile_radius_of_city?: string;
        
    @Field({nullable: true}) 
    campaignName?: string;
        
    @Field({nullable: true}) 
    capabilitiesModelFirstTimeUsed?: string;
        
    @Field({nullable: true}) 
    capabilitiesModelLastTimeUsed?: string;
        
    @Field({nullable: true}) 
    cartAbandonmentProducts?: string;
        
    @Field({nullable: true}) 
    city2?: string;
        
    @Field({nullable: true}) 
    clearbit_company_category_industry?: string;
        
    @Field({nullable: true}) 
    clearbit_company_category_industry_group?: string;
        
    @Field({nullable: true}) 
    clearbit_company_category_naics_code?: string;
        
    @Field({nullable: true}) 
    clearbit_company_category_sector?: string;
        
    @Field({nullable: true}) 
    clearbit_company_category_sic_code?: string;
        
    @Field({nullable: true}) 
    clearbit_company_category_sub_industry?: string;
        
    @Field({nullable: true}) 
    clearbit_company_geo_city?: string;
        
    @Field({nullable: true}) 
    clearbit_company_geo_country?: string;
        
    @Field({nullable: true}) 
    clearbit_company_geo_country_code?: string;
        
    @Field({nullable: true}) 
    clearbit_company_geo_postal_code?: string;
        
    @Field({nullable: true}) 
    clearbit_company_geo_state?: string;
        
    @Field({nullable: true}) 
    clearbit_company_geo_state_code?: string;
        
    @Field({nullable: true}) 
    clearbit_company_geo_street_name?: string;
        
    @Field({nullable: true}) 
    clearbit_company_geo_street_number?: string;
        
    @Field({nullable: true}) 
    clearbit_company_legal_name?: string;
        
    @Field({nullable: true}) 
    clearbit_company_metrics_annual_revenue?: string;
        
    @Field({nullable: true}) 
    clearbit_company_metrics_employees?: string;
        
    @Field({nullable: true}) 
    clearbit_company_metrics_employees_range?: string;
        
    @Field({nullable: true}) 
    clearbit_company_metrics_estimated_annual_revenue?: string;
        
    @Field({nullable: true}) 
    clearbit_company_name?: string;
        
    @Field({nullable: true}) 
    clearbit_company_tags?: string;
        
    @Field({nullable: true}) 
    clearbit_company_type?: string;
        
    @Field({nullable: true}) 
    clearbit_person_employment_role?: string;
        
    @Field({nullable: true}) 
    clearbit_person_employment_seniority?: string;
        
    @Field({nullable: true}) 
    clearbit_person_employment_title?: string;
        
    @Field({nullable: true}) 
    clearbit_person_geo_city?: string;
        
    @Field({nullable: true}) 
    clearbit_person_geo_country?: string;
        
    @Field({nullable: true}) 
    clearbit_person_geo_country_code?: string;
        
    @Field({nullable: true}) 
    clearbit_person_geo_state?: string;
        
    @Field({nullable: true}) 
    clearbit_person_geo_state_code?: string;
        
    @Field({nullable: true}) 
    company?: string;
        
    @Field({nullable: true}) 
    companySizeCode?: string;
        
    @Field({nullable: true}) 
    companyname?: string;
        
    @Field({nullable: true}) 
    conferenceRegistrations?: string;
        
    @Field({nullable: true}) 
    countryCode?: string;
        
    @Field({nullable: true}) 
    created?: string;
        
    @Field({nullable: true}) 
    createdAt?: string;
        
    @Field({nullable: true}) 
    ctdoSubscriber?: string;
        
    @Field({nullable: true}) 
    directReportCountCode?: string;
        
    @Field({nullable: true}) 
    educationProducts?: string;
        
    @Field({nullable: true}) 
    emailPreferences?: string;
        
    @Field({nullable: true}) 
    industryCode?: string;
        
    @Field({nullable: true}) 
    isChapterLeader?: string;
        
    @Field({nullable: true}) 
    isChapterMember?: string;
        
    @Field({nullable: true}) 
    isEmailVerified?: string;
        
    @Field({nullable: true}) 
    isEnterpriseMember?: string;
        
    @Field({nullable: true}) 
    isFacilitator?: string;
        
    @Field({nullable: true}) 
    isInterestedAutoRenewOffer?: string;
        
    @Field({nullable: true}) 
    isMember?: string;
        
    @Field({nullable: true}) 
    isNewAndFirstTimeMember?: string;
        
    @Field({nullable: true}) 
    is_member?: string;
        
    @Field({nullable: true}) 
    is_partner?: string;
        
    @Field({nullable: true}) 
    jobFunctionCode?: string;
        
    @Field({nullable: true}) 
    jobTitle?: string;
        
    @Field({nullable: true}) 
    mainActiveProducts?: string;
        
    @Field({nullable: true}) 
    order_count?: string;
        
    @Field({nullable: true}) 
    personify_product_code?: string;
        
    @Field({nullable: true}) 
    postalCode?: string;
        
    @Field({nullable: true}) 
    productSubscriptions?: string;
        
    @Field({nullable: true}) 
    profilePercentageCompleted?: string;
        
    @Field({nullable: true}) 
    roleCode?: string;
        
    @Field({nullable: true}) 
    state?: string;
        
    @Field({nullable: true}) 
    tdAtWorkSubscriber?: string;
        
    @Field({nullable: true}) 
    teamSize?: string;
        
    @Field({nullable: true}) 
    title?: string;
        
    @Field({nullable: true}) 
    topicsFollowed?: string;
        
    @Field({nullable: true}) 
    tpmSubscriber?: string;
        
    @Field({nullable: true}) 
    trainingBudgetCode?: string;
        
    @Field({nullable: true}) 
    created_at?: string;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
    @Field({nullable: true}) 
    @MaxLength(510)
    TestEmail?: string;
        
    @Field(() => [PersonEducationHistory_])
    PersonEducationHistories_PersonIDArray: PersonEducationHistory_[]; // Link to PersonEducationHistories
    
    @Field(() => [PersonEmploymentHistory_])
    PersonEmploymentHistories_PersonIDArray: PersonEmploymentHistory_[]; // Link to PersonEmploymentHistories
    
}

//****************************************************************************
// INPUT TYPE for Persons
//****************************************************************************
@InputType()
export class CreatePersonInput {
    @Field({ nullable: true })
    first_name?: string;

    @Field({ nullable: true })
    timezone?: string;

    @Field({ nullable: true })
    city?: string;

    @Field({ nullable: true })
    email?: string;

    @Field({ nullable: true })
    session_count?: string;

    @Field({ nullable: true })
    first_session?: string;

    @Field({ nullable: true })
    last_session?: string;

    @Field({ nullable: true })
    in_app_purchase_total?: string;

    @Field({ nullable: true })
    unsubscribed_from_emails_at?: string;

    @Field({ nullable: true })
    active_resource_center_members_last_6_months?: string;

    @Field({ nullable: true })
    allowPhone?: string;

    @Field({ nullable: true })
    allowSolicitation?: string;

    @Field({ nullable: true })
    aud_awards_website_and_webcasts?: string;

    @Field({ nullable: true })
    aud_change_management_topic_engagement?: string;

    @Field({ nullable: true })
    aud_ci_aptd_high_interest?: string;

    @Field({ nullable: true })
    aud_ci_aptd_prep_purchases?: string;

    @Field({ nullable: true })
    aud_ci_aptd_web_interest?: string;

    @Field({ nullable: true })
    aud_ci_bok_purchases?: string;

    @Field({ nullable: true })
    aud_ci_cplp_interest_group?: string;

    @Field({ nullable: true })
    aud_ci_general_certification_interest_group?: string;

    @Field({ nullable: true })
    aud_ci_masters_more_than_6_mo?: string;

    @Field({ nullable: true })
    aud_con_atd_yale_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_core_42020_chicago_purchased?: string;

    @Field({ nullable: true })
    aud_con_core_4_2020_chicago_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_core_4_2020_nashville_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_core_4_2020_nashville_purchased?: string;

    @Field({ nullable: true })
    aud_con_core_4_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_dir_job_function?: string;

    @Field({ nullable: true })
    aud_con_edu_tk_2020_precon_pages_visitors?: string;

    @Field({ nullable: true })
    aud_con_gov_wf_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_gov_wf_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_consideration_target?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_eb_last_chance_openers?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_email_clickers?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_email_opened?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_reg_page_visitors?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_team_target?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_mbr_lapsed_10_31_19?: string;

    @Field({ nullable: true })
    aud_con_org_dev_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_org_dev_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_org_dev_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_purchase_last_6_months?: string;

    @Field({ nullable: true })
    aud_con_sell_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_sell_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_sell_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_consideration_target?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_email_clickers?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_email_opened?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_mbr_bundle?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_medina_wkshp_registrants?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_medina_workshop_page_visitors?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_plustk_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_reg_page_visitors?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_registrant_feedback_email_opens?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_tk_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_vc_2_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_virtual_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_virtual_conference_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_west_coast_states?: string;

    @Field({ nullable: true })
    aud_con_yale_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_yale_2020_dir_job_function?: string;

    @Field({ nullable: true })
    aud_con_yale_2020_email_clickers?: string;

    @Field({ nullable: true })
    aud_con_yale_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_conf_vc_2_telemarketing_hot_leads?: string;

    @Field({ nullable: true })
    aud_ctdo_next?: string;

    @Field({ nullable: true })
    aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers?: string;

    @Field({ nullable: true })
    aud_edu_allmasterprograms_pagevisitors_last_6_mo?: string;

    @Field({ nullable: true })
    aud_edu_catalog_2020_virtual_downloads?: string;

    @Field({ nullable: true })
    aud_edu_form_catalog_2020?: string;

    @Field({ nullable: true })
    aud_edu_ice_precon_2020_target_audience?: string;

    @Field({ nullable: true })
    aud_edu_in_person_course_purchasers_last_365_days?: string;

    @Field({ nullable: true })
    aud_edu_or_con_purchasers_cyber_week_2021?: string;

    @Field({ nullable: true })
    aud_edu_page_visits_all?: string;

    @Field({ nullable: true })
    aud_edu_precon_2020_purchased?: string;

    @Field({ nullable: true })
    aud_edu_purchased_cert?: string;

    @Field({ nullable: true })
    aud_edu_purchased_cert_14_days?: string;

    @Field({ nullable: true })
    aud_edu_purchased_cert_6_mos?: string;

    @Field({ nullable: true })
    aud_edu_purchased_tc_last_6_m_os?: string;

    @Field({ nullable: true })
    aud_edu_tdbok_interest?: string;

    @Field({ nullable: true })
    aud_edu_tk_precon_purchased?: string;

    @Field({ nullable: true })
    aud_ent_ice_2020_teams_purchased?: string;

    @Field({ nullable: true })
    aud_ent_td_leader_nl_4_times?: string;

    @Field({ nullable: true })
    aud_expiring_member?: string;

    @Field({ nullable: true })
    aud_global_international_members?: string;

    @Field({ nullable: true })
    aud_global_perspectives_topic_engagement?: string;

    @Field({ nullable: true })
    aud_government_newsletter?: string;

    @Field({ nullable: true })
    aud_healthcare_news_topic_engagement?: string;

    @Field({ nullable: true })
    aud_instructional_design_topic_engagement?: string;

    @Field({ nullable: true })
    aud_is_member?: string;

    @Field({ nullable: true })
    aud_leadership_development_topic_engagement?: string;

    @Field({ nullable: true })
    aud_learning_technologies_engagement?: string;

    @Field({ nullable: true })
    aud_management_topic_engagement?: string;

    @Field({ nullable: true })
    aud_mbr_acq_interest?: string;

    @Field({ nullable: true })
    aud_mbr_acq_interest_decades?: string;

    @Field({ nullable: true })
    aud_mbr_acq_interest_decades_updated?: string;

    @Field({ nullable: true })
    aud_mbr_benefits_available?: string;

    @Field({ nullable: true })
    aud_mbr_claimed_all_benefits?: string;

    @Field({ nullable: true })
    aud_mbr_claimed_atleast_one_benefit?: string;

    @Field({ nullable: true })
    aud_mbr_expiring_30_days_not_renewed?: string;

    @Field({ nullable: true })
    aud_mbr_expiring_next_90_days?: string;

    @Field({ nullable: true })
    aud_mbr_low_engage_6_mo?: string;

    @Field({ nullable: true })
    aud_mbr_non_expiring?: string;

    @Field({ nullable: true })
    aud_mbr_order_completed_allod?: string;

    @Field({ nullable: true })
    aud_mbr_tdw_exp_nov_2020?: string;

    @Field({ nullable: true })
    aud_mbr_zero_benefits?: string;

    @Field({ nullable: true })
    aud_mbr_zero_benefits_used?: string;

    @Field({ nullable: true })
    aud_mbrshp_purchased_last_90_days?: string;

    @Field({ nullable: true })
    aud_member_benefits_center_tab_clicked?: string;

    @Field({ nullable: true })
    aud_member_newsletter_openers?: string;

    @Field({ nullable: true })
    aud_members_onboarding?: string;

    @Field({ nullable: true })
    aud_members_with_available_benefits?: string;

    @Field({ nullable: true })
    aud_my_career_engagement?: string;

    @Field({ nullable: true })
    aud_my_career_topic_engagement?: string;

    @Field({ nullable: true })
    aud_net_new?: string;

    @Field({ nullable: true })
    aud_nonmembers?: string;

    @Field({ nullable: true })
    aud_performance_consulting_improvement_topic_engagement?: string;

    @Field({ nullable: true })
    aud_preference_change_management?: string;

    @Field({ nullable: true })
    aud_pubs_smr_sale_2020_target?: string;

    @Field({ nullable: true })
    aud_pubs_workshop_2022_purchasers?: string;

    @Field({ nullable: true })
    aud_purchased_books_starting_with_11_71_19_70?: string;

    @Field({ nullable: true })
    aud_sales_enablement_topic_engagement?: string;

    @Field({ nullable: true })
    aud_sales_force_working_leads?: string;

    @Field({ nullable: true })
    aud_sso_created_or_is_member?: string;

    @Field({ nullable: true })
    aud_talent_management_narrow_engagement?: string;

    @Field({ nullable: true })
    aud_talent_management_topic_engagement?: string;

    @Field({ nullable: true })
    aud_td_executive_topic_engagement?: string;

    @Field({ nullable: true })
    aud_topic_engagement_science_of_learning?: string;

    @Field({ nullable: true })
    aud_training_delivery_topic_engagement?: string;

    @Field({ nullable: true })
    aud_unengaged_users?: string;

    @Field({ nullable: true })
    aud_virtual_fall_2020_core_4?: string;

    @Field({ nullable: true })
    aud_virtual_fall_2020_future_of_work?: string;

    @Field({ nullable: true })
    aud_virtual_fall_2020_org_dev?: string;

    @Field({ nullable: true })
    aud_webcast_email_engagement?: string;

    @Field({ nullable: true })
    automatedNewsletters?: string;

    @Field({ nullable: true })
    c_active_chapter_leader?: string;

    @Field({ nullable: true })
    c_aptd_holder?: string;

    @Field({ nullable: true })
    c_capability?: string;

    @Field({ nullable: true })
    c_capability_model_assessment_completion?: string;

    @Field({ nullable: true })
    c_chapter?: string;

    @Field({ nullable: true })
    c_closest_chapter_direction?: string;

    @Field({ nullable: true })
    c_closest_chapter_name?: string;

    @Field({ nullable: true })
    c_closest_chapter_state?: string;

    @Field({ nullable: true })
    c_consecutive_years_as_member?: string;

    @Field({ nullable: true })
    c_cptd_holder?: string;

    @Field({ nullable: true })
    c_edu_page_title_list_7_days?: string;

    @Field({ nullable: true })
    c_edu_products_purchased?: string;

    @Field({ nullable: true })
    c_education_pages_list?: string;

    @Field({ nullable: true })
    c_education_program_completed_last6months?: string;

    @Field({ nullable: true })
    c_email_links_clicked?: string;

    @Field({ nullable: true })
    c_enterprise_company?: string;

    @Field({ nullable: true })
    c_enterprise_memberhip_acquisition_type?: string;

    @Field({ nullable: true })
    c_enterprise_membership_period_begin?: string;

    @Field({ nullable: true })
    c_enterprise_membership_period_end?: string;

    @Field({ nullable: true })
    c_enterprise_membership_renewal_date?: string;

    @Field({ nullable: true })
    c_enterprise_membership_retention_stage?: string;

    @Field({ nullable: true })
    c_enterprise_order_date?: string;

    @Field({ nullable: true })
    c_expire_chapter_leader_30_day?: string;

    @Field({ nullable: true })
    c_forms_submitted?: string;

    @Field({ nullable: true })
    c_initial_membership_date?: string;

    @Field({ nullable: true })
    c_is_closest_chapter_member?: string;

    @Field({ nullable: true })
    c_is_enterprise_member?: string;

    @Field({ nullable: true })
    c_is_member?: string;

    @Field({ nullable: true })
    c_is_power_member?: string;

    @Field({ nullable: true })
    c_is_senior_membership?: string;

    @Field({ nullable: true })
    c_is_student_membership?: string;

    @Field({ nullable: true })
    c_job_title_group?: string;

    @Field({ nullable: true })
    c_learning_plan_created?: string;

    @Field({ nullable: true })
    c_member_subtype?: string;

    @Field({ nullable: true })
    c_member_type?: string;

    @Field({ nullable: true })
    c_memberhip_retention_type?: string;

    @Field({ nullable: true })
    c_membership_acquisition_type?: string;

    @Field({ nullable: true })
    c_membership_auto_renew?: string;

    @Field({ nullable: true })
    c_membership_bundle?: string;

    @Field({ nullable: true })
    c_membership_conference_value_seeker?: string;

    @Field({ nullable: true })
    c_membership_education_value_seeker?: string;

    @Field({ nullable: true })
    c_membership_is_comp?: string;

    @Field({ nullable: true })
    c_membership_is_internal?: string;

    @Field({ nullable: true })
    c_membership_period_begin?: string;

    @Field({ nullable: true })
    c_membership_period_end?: string;

    @Field({ nullable: true })
    c_membership_pro_or_plus?: string;

    @Field({ nullable: true })
    c_membership_product?: string;

    @Field({ nullable: true })
    c_membership_rate_code?: string;

    @Field({ nullable: true })
    c_membership_renewal_date?: string;

    @Field({ nullable: true })
    c_membership_renewed_in?: string;

    @Field({ nullable: true })
    c_membership_retention_stage?: string;

    @Field({ nullable: true })
    c_membership_type_code?: string;

    @Field({ nullable: true })
    c_most_engaged_topic_web?: string;

    @Field({ nullable: true })
    c_onboarding_member?: string;

    @Field({ nullable: true })
    c_pages_visited?: string;

    @Field({ nullable: true })
    c_pages_visited_topics?: string;

    @Field({ nullable: true })
    c_product_purchase_topics?: string;

    @Field({ nullable: true })
    c_products_purchased?: string;

    @Field({ nullable: true })
    c_products_purchased_by_name?: string;

    @Field({ nullable: true })
    c_research_benefits_used?: string;

    @Field({ nullable: true })
    c_sfmc_newsletter_engagement?: string;

    @Field({ nullable: true })
    c_terminate_at_end?: string;

    @Field({ nullable: true })
    c_topics_followed?: string;

    @Field({ nullable: true })
    c_webcast?: string;

    @Field({ nullable: true })
    c_webcast_first_attendance_date?: string;

    @Field({ nullable: true })
    c_webcast_first_registration_date?: string;

    @Field({ nullable: true })
    c_webcast_id?: string;

    @Field({ nullable: true })
    c_webcast_last_attendance_date?: string;

    @Field({ nullable: true })
    c_webcast_last_registration_date?: string;

    @Field({ nullable: true })
    c_webcast_name?: string;

    @Field({ nullable: true })
    c_webcast_primary_tags?: string;

    @Field({ nullable: true })
    c_webcasts_attended?: string;

    @Field({ nullable: true })
    c_weeks_to_expire?: string;

    @Field({ nullable: true })
    c_wish_list_product_codes?: string;

    @Field({ nullable: true })
    c_with_list_product_codes?: string;

    @Field({ nullable: true })
    c_within_60_mile_radius_of_city?: string;

    @Field({ nullable: true })
    campaignName?: string;

    @Field({ nullable: true })
    capabilitiesModelFirstTimeUsed?: string;

    @Field({ nullable: true })
    capabilitiesModelLastTimeUsed?: string;

    @Field({ nullable: true })
    cartAbandonmentProducts?: string;

    @Field({ nullable: true })
    city2?: string;

    @Field({ nullable: true })
    clearbit_company_category_industry?: string;

    @Field({ nullable: true })
    clearbit_company_category_industry_group?: string;

    @Field({ nullable: true })
    clearbit_company_category_naics_code?: string;

    @Field({ nullable: true })
    clearbit_company_category_sector?: string;

    @Field({ nullable: true })
    clearbit_company_category_sic_code?: string;

    @Field({ nullable: true })
    clearbit_company_category_sub_industry?: string;

    @Field({ nullable: true })
    clearbit_company_geo_city?: string;

    @Field({ nullable: true })
    clearbit_company_geo_country?: string;

    @Field({ nullable: true })
    clearbit_company_geo_country_code?: string;

    @Field({ nullable: true })
    clearbit_company_geo_postal_code?: string;

    @Field({ nullable: true })
    clearbit_company_geo_state?: string;

    @Field({ nullable: true })
    clearbit_company_geo_state_code?: string;

    @Field({ nullable: true })
    clearbit_company_geo_street_name?: string;

    @Field({ nullable: true })
    clearbit_company_geo_street_number?: string;

    @Field({ nullable: true })
    clearbit_company_legal_name?: string;

    @Field({ nullable: true })
    clearbit_company_metrics_annual_revenue?: string;

    @Field({ nullable: true })
    clearbit_company_metrics_employees?: string;

    @Field({ nullable: true })
    clearbit_company_metrics_employees_range?: string;

    @Field({ nullable: true })
    clearbit_company_metrics_estimated_annual_revenue?: string;

    @Field({ nullable: true })
    clearbit_company_name?: string;

    @Field({ nullable: true })
    clearbit_company_tags?: string;

    @Field({ nullable: true })
    clearbit_company_type?: string;

    @Field({ nullable: true })
    clearbit_person_employment_role?: string;

    @Field({ nullable: true })
    clearbit_person_employment_seniority?: string;

    @Field({ nullable: true })
    clearbit_person_employment_title?: string;

    @Field({ nullable: true })
    clearbit_person_geo_city?: string;

    @Field({ nullable: true })
    clearbit_person_geo_country?: string;

    @Field({ nullable: true })
    clearbit_person_geo_country_code?: string;

    @Field({ nullable: true })
    clearbit_person_geo_state?: string;

    @Field({ nullable: true })
    clearbit_person_geo_state_code?: string;

    @Field({ nullable: true })
    company?: string;

    @Field({ nullable: true })
    companySizeCode?: string;

    @Field({ nullable: true })
    companyname?: string;

    @Field({ nullable: true })
    conferenceRegistrations?: string;

    @Field({ nullable: true })
    countryCode?: string;

    @Field({ nullable: true })
    created?: string;

    @Field({ nullable: true })
    createdAt?: string;

    @Field({ nullable: true })
    ctdoSubscriber?: string;

    @Field({ nullable: true })
    directReportCountCode?: string;

    @Field({ nullable: true })
    educationProducts?: string;

    @Field({ nullable: true })
    emailPreferences?: string;

    @Field({ nullable: true })
    industryCode?: string;

    @Field({ nullable: true })
    isChapterLeader?: string;

    @Field({ nullable: true })
    isChapterMember?: string;

    @Field({ nullable: true })
    isEmailVerified?: string;

    @Field({ nullable: true })
    isEnterpriseMember?: string;

    @Field({ nullable: true })
    isFacilitator?: string;

    @Field({ nullable: true })
    isInterestedAutoRenewOffer?: string;

    @Field({ nullable: true })
    isMember?: string;

    @Field({ nullable: true })
    isNewAndFirstTimeMember?: string;

    @Field({ nullable: true })
    is_member?: string;

    @Field({ nullable: true })
    is_partner?: string;

    @Field({ nullable: true })
    jobFunctionCode?: string;

    @Field({ nullable: true })
    jobTitle?: string;

    @Field({ nullable: true })
    mainActiveProducts?: string;

    @Field({ nullable: true })
    order_count?: string;

    @Field({ nullable: true })
    personify_product_code?: string;

    @Field({ nullable: true })
    postalCode?: string;

    @Field({ nullable: true })
    productSubscriptions?: string;

    @Field({ nullable: true })
    profilePercentageCompleted?: string;

    @Field({ nullable: true })
    roleCode?: string;

    @Field({ nullable: true })
    state?: string;

    @Field({ nullable: true })
    tdAtWorkSubscriber?: string;

    @Field({ nullable: true })
    teamSize?: string;

    @Field({ nullable: true })
    title?: string;

    @Field({ nullable: true })
    topicsFollowed?: string;

    @Field({ nullable: true })
    tpmSubscriber?: string;

    @Field({ nullable: true })
    trainingBudgetCode?: string;

    @Field({ nullable: true })
    created_at?: string;

    @Field({ nullable: true })
    TestEmail?: string;
}
    

//****************************************************************************
// INPUT TYPE for Persons
//****************************************************************************
@InputType()
export class UpdatePersonInput {
    @Field(() => Int)
    ID: number;

    @Field({ nullable: true })
    first_name?: string;

    @Field({ nullable: true })
    timezone?: string;

    @Field({ nullable: true })
    city?: string;

    @Field({ nullable: true })
    email?: string;

    @Field({ nullable: true })
    session_count?: string;

    @Field({ nullable: true })
    first_session?: string;

    @Field({ nullable: true })
    last_session?: string;

    @Field({ nullable: true })
    in_app_purchase_total?: string;

    @Field({ nullable: true })
    unsubscribed_from_emails_at?: string;

    @Field({ nullable: true })
    active_resource_center_members_last_6_months?: string;

    @Field({ nullable: true })
    allowPhone?: string;

    @Field({ nullable: true })
    allowSolicitation?: string;

    @Field({ nullable: true })
    aud_awards_website_and_webcasts?: string;

    @Field({ nullable: true })
    aud_change_management_topic_engagement?: string;

    @Field({ nullable: true })
    aud_ci_aptd_high_interest?: string;

    @Field({ nullable: true })
    aud_ci_aptd_prep_purchases?: string;

    @Field({ nullable: true })
    aud_ci_aptd_web_interest?: string;

    @Field({ nullable: true })
    aud_ci_bok_purchases?: string;

    @Field({ nullable: true })
    aud_ci_cplp_interest_group?: string;

    @Field({ nullable: true })
    aud_ci_general_certification_interest_group?: string;

    @Field({ nullable: true })
    aud_ci_masters_more_than_6_mo?: string;

    @Field({ nullable: true })
    aud_con_atd_yale_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_core_42020_chicago_purchased?: string;

    @Field({ nullable: true })
    aud_con_core_4_2020_chicago_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_core_4_2020_nashville_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_core_4_2020_nashville_purchased?: string;

    @Field({ nullable: true })
    aud_con_core_4_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_dir_job_function?: string;

    @Field({ nullable: true })
    aud_con_edu_tk_2020_precon_pages_visitors?: string;

    @Field({ nullable: true })
    aud_con_gov_wf_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_gov_wf_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_consideration_target?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_eb_last_chance_openers?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_email_clickers?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_email_opened?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_reg_page_visitors?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_team_target?: string;

    @Field({ nullable: true })
    aud_con_ice_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_mbr_lapsed_10_31_19?: string;

    @Field({ nullable: true })
    aud_con_org_dev_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_org_dev_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_org_dev_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_purchase_last_6_months?: string;

    @Field({ nullable: true })
    aud_con_sell_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_sell_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_sell_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_consideration_target?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_email_clickers?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_email_opened?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_mbr_bundle?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_medina_wkshp_registrants?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_medina_workshop_page_visitors?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_plustk_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_purchased?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_reg_page_visitors?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_registrant_feedback_email_opens?: string;

    @Field({ nullable: true })
    aud_con_tk_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_tk_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_vc_2_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_virtual_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_virtual_conference_website_visitors?: string;

    @Field({ nullable: true })
    aud_con_west_coast_states?: string;

    @Field({ nullable: true })
    aud_con_yale_2020_cart_abandonment?: string;

    @Field({ nullable: true })
    aud_con_yale_2020_dir_job_function?: string;

    @Field({ nullable: true })
    aud_con_yale_2020_email_clickers?: string;

    @Field({ nullable: true })
    aud_con_yale_2020_website_visitors?: string;

    @Field({ nullable: true })
    aud_conf_vc_2_telemarketing_hot_leads?: string;

    @Field({ nullable: true })
    aud_ctdo_next?: string;

    @Field({ nullable: true })
    aud_edu_allmasterprograms_pagevisitors_last_12_mo_less_masters_purchasers?: string;

    @Field({ nullable: true })
    aud_edu_allmasterprograms_pagevisitors_last_6_mo?: string;

    @Field({ nullable: true })
    aud_edu_catalog_2020_virtual_downloads?: string;

    @Field({ nullable: true })
    aud_edu_form_catalog_2020?: string;

    @Field({ nullable: true })
    aud_edu_ice_precon_2020_target_audience?: string;

    @Field({ nullable: true })
    aud_edu_in_person_course_purchasers_last_365_days?: string;

    @Field({ nullable: true })
    aud_edu_or_con_purchasers_cyber_week_2021?: string;

    @Field({ nullable: true })
    aud_edu_page_visits_all?: string;

    @Field({ nullable: true })
    aud_edu_precon_2020_purchased?: string;

    @Field({ nullable: true })
    aud_edu_purchased_cert?: string;

    @Field({ nullable: true })
    aud_edu_purchased_cert_14_days?: string;

    @Field({ nullable: true })
    aud_edu_purchased_cert_6_mos?: string;

    @Field({ nullable: true })
    aud_edu_purchased_tc_last_6_m_os?: string;

    @Field({ nullable: true })
    aud_edu_tdbok_interest?: string;

    @Field({ nullable: true })
    aud_edu_tk_precon_purchased?: string;

    @Field({ nullable: true })
    aud_ent_ice_2020_teams_purchased?: string;

    @Field({ nullable: true })
    aud_ent_td_leader_nl_4_times?: string;

    @Field({ nullable: true })
    aud_expiring_member?: string;

    @Field({ nullable: true })
    aud_global_international_members?: string;

    @Field({ nullable: true })
    aud_global_perspectives_topic_engagement?: string;

    @Field({ nullable: true })
    aud_government_newsletter?: string;

    @Field({ nullable: true })
    aud_healthcare_news_topic_engagement?: string;

    @Field({ nullable: true })
    aud_instructional_design_topic_engagement?: string;

    @Field({ nullable: true })
    aud_is_member?: string;

    @Field({ nullable: true })
    aud_leadership_development_topic_engagement?: string;

    @Field({ nullable: true })
    aud_learning_technologies_engagement?: string;

    @Field({ nullable: true })
    aud_management_topic_engagement?: string;

    @Field({ nullable: true })
    aud_mbr_acq_interest?: string;

    @Field({ nullable: true })
    aud_mbr_acq_interest_decades?: string;

    @Field({ nullable: true })
    aud_mbr_acq_interest_decades_updated?: string;

    @Field({ nullable: true })
    aud_mbr_benefits_available?: string;

    @Field({ nullable: true })
    aud_mbr_claimed_all_benefits?: string;

    @Field({ nullable: true })
    aud_mbr_claimed_atleast_one_benefit?: string;

    @Field({ nullable: true })
    aud_mbr_expiring_30_days_not_renewed?: string;

    @Field({ nullable: true })
    aud_mbr_expiring_next_90_days?: string;

    @Field({ nullable: true })
    aud_mbr_low_engage_6_mo?: string;

    @Field({ nullable: true })
    aud_mbr_non_expiring?: string;

    @Field({ nullable: true })
    aud_mbr_order_completed_allod?: string;

    @Field({ nullable: true })
    aud_mbr_tdw_exp_nov_2020?: string;

    @Field({ nullable: true })
    aud_mbr_zero_benefits?: string;

    @Field({ nullable: true })
    aud_mbr_zero_benefits_used?: string;

    @Field({ nullable: true })
    aud_mbrshp_purchased_last_90_days?: string;

    @Field({ nullable: true })
    aud_member_benefits_center_tab_clicked?: string;

    @Field({ nullable: true })
    aud_member_newsletter_openers?: string;

    @Field({ nullable: true })
    aud_members_onboarding?: string;

    @Field({ nullable: true })
    aud_members_with_available_benefits?: string;

    @Field({ nullable: true })
    aud_my_career_engagement?: string;

    @Field({ nullable: true })
    aud_my_career_topic_engagement?: string;

    @Field({ nullable: true })
    aud_net_new?: string;

    @Field({ nullable: true })
    aud_nonmembers?: string;

    @Field({ nullable: true })
    aud_performance_consulting_improvement_topic_engagement?: string;

    @Field({ nullable: true })
    aud_preference_change_management?: string;

    @Field({ nullable: true })
    aud_pubs_smr_sale_2020_target?: string;

    @Field({ nullable: true })
    aud_pubs_workshop_2022_purchasers?: string;

    @Field({ nullable: true })
    aud_purchased_books_starting_with_11_71_19_70?: string;

    @Field({ nullable: true })
    aud_sales_enablement_topic_engagement?: string;

    @Field({ nullable: true })
    aud_sales_force_working_leads?: string;

    @Field({ nullable: true })
    aud_sso_created_or_is_member?: string;

    @Field({ nullable: true })
    aud_talent_management_narrow_engagement?: string;

    @Field({ nullable: true })
    aud_talent_management_topic_engagement?: string;

    @Field({ nullable: true })
    aud_td_executive_topic_engagement?: string;

    @Field({ nullable: true })
    aud_topic_engagement_science_of_learning?: string;

    @Field({ nullable: true })
    aud_training_delivery_topic_engagement?: string;

    @Field({ nullable: true })
    aud_unengaged_users?: string;

    @Field({ nullable: true })
    aud_virtual_fall_2020_core_4?: string;

    @Field({ nullable: true })
    aud_virtual_fall_2020_future_of_work?: string;

    @Field({ nullable: true })
    aud_virtual_fall_2020_org_dev?: string;

    @Field({ nullable: true })
    aud_webcast_email_engagement?: string;

    @Field({ nullable: true })
    automatedNewsletters?: string;

    @Field({ nullable: true })
    c_active_chapter_leader?: string;

    @Field({ nullable: true })
    c_aptd_holder?: string;

    @Field({ nullable: true })
    c_capability?: string;

    @Field({ nullable: true })
    c_capability_model_assessment_completion?: string;

    @Field({ nullable: true })
    c_chapter?: string;

    @Field({ nullable: true })
    c_closest_chapter_direction?: string;

    @Field({ nullable: true })
    c_closest_chapter_name?: string;

    @Field({ nullable: true })
    c_closest_chapter_state?: string;

    @Field({ nullable: true })
    c_consecutive_years_as_member?: string;

    @Field({ nullable: true })
    c_cptd_holder?: string;

    @Field({ nullable: true })
    c_edu_page_title_list_7_days?: string;

    @Field({ nullable: true })
    c_edu_products_purchased?: string;

    @Field({ nullable: true })
    c_education_pages_list?: string;

    @Field({ nullable: true })
    c_education_program_completed_last6months?: string;

    @Field({ nullable: true })
    c_email_links_clicked?: string;

    @Field({ nullable: true })
    c_enterprise_company?: string;

    @Field({ nullable: true })
    c_enterprise_memberhip_acquisition_type?: string;

    @Field({ nullable: true })
    c_enterprise_membership_period_begin?: string;

    @Field({ nullable: true })
    c_enterprise_membership_period_end?: string;

    @Field({ nullable: true })
    c_enterprise_membership_renewal_date?: string;

    @Field({ nullable: true })
    c_enterprise_membership_retention_stage?: string;

    @Field({ nullable: true })
    c_enterprise_order_date?: string;

    @Field({ nullable: true })
    c_expire_chapter_leader_30_day?: string;

    @Field({ nullable: true })
    c_forms_submitted?: string;

    @Field({ nullable: true })
    c_initial_membership_date?: string;

    @Field({ nullable: true })
    c_is_closest_chapter_member?: string;

    @Field({ nullable: true })
    c_is_enterprise_member?: string;

    @Field({ nullable: true })
    c_is_member?: string;

    @Field({ nullable: true })
    c_is_power_member?: string;

    @Field({ nullable: true })
    c_is_senior_membership?: string;

    @Field({ nullable: true })
    c_is_student_membership?: string;

    @Field({ nullable: true })
    c_job_title_group?: string;

    @Field({ nullable: true })
    c_learning_plan_created?: string;

    @Field({ nullable: true })
    c_member_subtype?: string;

    @Field({ nullable: true })
    c_member_type?: string;

    @Field({ nullable: true })
    c_memberhip_retention_type?: string;

    @Field({ nullable: true })
    c_membership_acquisition_type?: string;

    @Field({ nullable: true })
    c_membership_auto_renew?: string;

    @Field({ nullable: true })
    c_membership_bundle?: string;

    @Field({ nullable: true })
    c_membership_conference_value_seeker?: string;

    @Field({ nullable: true })
    c_membership_education_value_seeker?: string;

    @Field({ nullable: true })
    c_membership_is_comp?: string;

    @Field({ nullable: true })
    c_membership_is_internal?: string;

    @Field({ nullable: true })
    c_membership_period_begin?: string;

    @Field({ nullable: true })
    c_membership_period_end?: string;

    @Field({ nullable: true })
    c_membership_pro_or_plus?: string;

    @Field({ nullable: true })
    c_membership_product?: string;

    @Field({ nullable: true })
    c_membership_rate_code?: string;

    @Field({ nullable: true })
    c_membership_renewal_date?: string;

    @Field({ nullable: true })
    c_membership_renewed_in?: string;

    @Field({ nullable: true })
    c_membership_retention_stage?: string;

    @Field({ nullable: true })
    c_membership_type_code?: string;

    @Field({ nullable: true })
    c_most_engaged_topic_web?: string;

    @Field({ nullable: true })
    c_onboarding_member?: string;

    @Field({ nullable: true })
    c_pages_visited?: string;

    @Field({ nullable: true })
    c_pages_visited_topics?: string;

    @Field({ nullable: true })
    c_product_purchase_topics?: string;

    @Field({ nullable: true })
    c_products_purchased?: string;

    @Field({ nullable: true })
    c_products_purchased_by_name?: string;

    @Field({ nullable: true })
    c_research_benefits_used?: string;

    @Field({ nullable: true })
    c_sfmc_newsletter_engagement?: string;

    @Field({ nullable: true })
    c_terminate_at_end?: string;

    @Field({ nullable: true })
    c_topics_followed?: string;

    @Field({ nullable: true })
    c_webcast?: string;

    @Field({ nullable: true })
    c_webcast_first_attendance_date?: string;

    @Field({ nullable: true })
    c_webcast_first_registration_date?: string;

    @Field({ nullable: true })
    c_webcast_id?: string;

    @Field({ nullable: true })
    c_webcast_last_attendance_date?: string;

    @Field({ nullable: true })
    c_webcast_last_registration_date?: string;

    @Field({ nullable: true })
    c_webcast_name?: string;

    @Field({ nullable: true })
    c_webcast_primary_tags?: string;

    @Field({ nullable: true })
    c_webcasts_attended?: string;

    @Field({ nullable: true })
    c_weeks_to_expire?: string;

    @Field({ nullable: true })
    c_wish_list_product_codes?: string;

    @Field({ nullable: true })
    c_with_list_product_codes?: string;

    @Field({ nullable: true })
    c_within_60_mile_radius_of_city?: string;

    @Field({ nullable: true })
    campaignName?: string;

    @Field({ nullable: true })
    capabilitiesModelFirstTimeUsed?: string;

    @Field({ nullable: true })
    capabilitiesModelLastTimeUsed?: string;

    @Field({ nullable: true })
    cartAbandonmentProducts?: string;

    @Field({ nullable: true })
    city2?: string;

    @Field({ nullable: true })
    clearbit_company_category_industry?: string;

    @Field({ nullable: true })
    clearbit_company_category_industry_group?: string;

    @Field({ nullable: true })
    clearbit_company_category_naics_code?: string;

    @Field({ nullable: true })
    clearbit_company_category_sector?: string;

    @Field({ nullable: true })
    clearbit_company_category_sic_code?: string;

    @Field({ nullable: true })
    clearbit_company_category_sub_industry?: string;

    @Field({ nullable: true })
    clearbit_company_geo_city?: string;

    @Field({ nullable: true })
    clearbit_company_geo_country?: string;

    @Field({ nullable: true })
    clearbit_company_geo_country_code?: string;

    @Field({ nullable: true })
    clearbit_company_geo_postal_code?: string;

    @Field({ nullable: true })
    clearbit_company_geo_state?: string;

    @Field({ nullable: true })
    clearbit_company_geo_state_code?: string;

    @Field({ nullable: true })
    clearbit_company_geo_street_name?: string;

    @Field({ nullable: true })
    clearbit_company_geo_street_number?: string;

    @Field({ nullable: true })
    clearbit_company_legal_name?: string;

    @Field({ nullable: true })
    clearbit_company_metrics_annual_revenue?: string;

    @Field({ nullable: true })
    clearbit_company_metrics_employees?: string;

    @Field({ nullable: true })
    clearbit_company_metrics_employees_range?: string;

    @Field({ nullable: true })
    clearbit_company_metrics_estimated_annual_revenue?: string;

    @Field({ nullable: true })
    clearbit_company_name?: string;

    @Field({ nullable: true })
    clearbit_company_tags?: string;

    @Field({ nullable: true })
    clearbit_company_type?: string;

    @Field({ nullable: true })
    clearbit_person_employment_role?: string;

    @Field({ nullable: true })
    clearbit_person_employment_seniority?: string;

    @Field({ nullable: true })
    clearbit_person_employment_title?: string;

    @Field({ nullable: true })
    clearbit_person_geo_city?: string;

    @Field({ nullable: true })
    clearbit_person_geo_country?: string;

    @Field({ nullable: true })
    clearbit_person_geo_country_code?: string;

    @Field({ nullable: true })
    clearbit_person_geo_state?: string;

    @Field({ nullable: true })
    clearbit_person_geo_state_code?: string;

    @Field({ nullable: true })
    company?: string;

    @Field({ nullable: true })
    companySizeCode?: string;

    @Field({ nullable: true })
    companyname?: string;

    @Field({ nullable: true })
    conferenceRegistrations?: string;

    @Field({ nullable: true })
    countryCode?: string;

    @Field({ nullable: true })
    created?: string;

    @Field({ nullable: true })
    createdAt?: string;

    @Field({ nullable: true })
    ctdoSubscriber?: string;

    @Field({ nullable: true })
    directReportCountCode?: string;

    @Field({ nullable: true })
    educationProducts?: string;

    @Field({ nullable: true })
    emailPreferences?: string;

    @Field({ nullable: true })
    industryCode?: string;

    @Field({ nullable: true })
    isChapterLeader?: string;

    @Field({ nullable: true })
    isChapterMember?: string;

    @Field({ nullable: true })
    isEmailVerified?: string;

    @Field({ nullable: true })
    isEnterpriseMember?: string;

    @Field({ nullable: true })
    isFacilitator?: string;

    @Field({ nullable: true })
    isInterestedAutoRenewOffer?: string;

    @Field({ nullable: true })
    isMember?: string;

    @Field({ nullable: true })
    isNewAndFirstTimeMember?: string;

    @Field({ nullable: true })
    is_member?: string;

    @Field({ nullable: true })
    is_partner?: string;

    @Field({ nullable: true })
    jobFunctionCode?: string;

    @Field({ nullable: true })
    jobTitle?: string;

    @Field({ nullable: true })
    mainActiveProducts?: string;

    @Field({ nullable: true })
    order_count?: string;

    @Field({ nullable: true })
    personify_product_code?: string;

    @Field({ nullable: true })
    postalCode?: string;

    @Field({ nullable: true })
    productSubscriptions?: string;

    @Field({ nullable: true })
    profilePercentageCompleted?: string;

    @Field({ nullable: true })
    roleCode?: string;

    @Field({ nullable: true })
    state?: string;

    @Field({ nullable: true })
    tdAtWorkSubscriber?: string;

    @Field({ nullable: true })
    teamSize?: string;

    @Field({ nullable: true })
    title?: string;

    @Field({ nullable: true })
    topicsFollowed?: string;

    @Field({ nullable: true })
    tpmSubscriber?: string;

    @Field({ nullable: true })
    trainingBudgetCode?: string;

    @Field({ nullable: true })
    created_at?: string;

    @Field({ nullable: true })
    TestEmail?: string;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Persons
//****************************************************************************
@ObjectType()
export class RunPersonViewResult {
    @Field(() => [Person_])
    Results: Person_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(Person_)
export class PersonResolver extends ResolverBase {
    @Query(() => RunPersonViewResult)
    async RunPersonViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonViewResult)
    async RunPersonViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonViewResult)
    async RunPersonDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Persons';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => Person_, { nullable: true })
    async Person(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<Person_ | null> {
        this.CheckUserReadPermissions('Persons', userPayload);
        const sSQL = `SELECT * FROM [ATD].[vwPersons] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Persons', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Persons', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @FieldResolver(() => [PersonEducationHistory_])
    async PersonEducationHistories_PersonIDArray(@Root() person_: Person_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Person Education Histories', userPayload);
        const sSQL = `SELECT * FROM [ATD].[vwPersonEducationHistories] WHERE [PersonID]=${person_.ID} ` + this.getRowLevelSecurityWhereClause('Person Education Histories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Person Education Histories', await dataSource.query(sSQL));
        return result;
    }
        
    @FieldResolver(() => [PersonEmploymentHistory_])
    async PersonEmploymentHistories_PersonIDArray(@Root() person_: Person_, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Person Employment Histories', userPayload);
        const sSQL = `SELECT * FROM [ATD].[vwPersonEmploymentHistories] WHERE [PersonID]=${person_.ID} ` + this.getRowLevelSecurityWhereClause('Person Employment Histories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.ArrayMapFieldNamesToCodeNames('Person Employment Histories', await dataSource.query(sSQL));
        return result;
    }
        
    @Mutation(() => Person_)
    async CreatePerson(
        @Arg('input', () => CreatePersonInput) input: CreatePersonInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Persons', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => Person_)
    async UpdatePerson(
        @Arg('input', () => UpdatePersonInput) input: UpdatePersonInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Persons', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => Person_)
    async DeletePerson(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Persons', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Person Education Histories
//****************************************************************************
@ObjectType()
export class PersonEducationHistory_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    PersonID: number;
        
    @Field() 
    @MaxLength(100)
    Institution: string;
        
    @Field() 
    @MaxLength(100)
    Degree: string;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    StartedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    EndedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Major?: string;
        
    @Field({nullable: true}) 
    @MaxLength(100)
    Kind?: string;
        
    @Field(() => Int, {nullable: true}) 
    GradeLevel?: number;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Person Education Histories
//****************************************************************************
@InputType()
export class CreatePersonEducationHistoryInput {
    @Field(() => Int)
    PersonID: number;

    @Field()
    Institution: string;

    @Field()
    Degree: string;

    @Field({ nullable: true })
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field({ nullable: true })
    Major?: string;

    @Field({ nullable: true })
    Kind?: string;

    @Field(() => Int, { nullable: true })
    GradeLevel?: number;

    @Field()
    CreatedAt: Date;

    @Field()
    UpdatedAt: Date;
}
    

//****************************************************************************
// INPUT TYPE for Person Education Histories
//****************************************************************************
@InputType()
export class UpdatePersonEducationHistoryInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    PersonID: number;

    @Field()
    Institution: string;

    @Field()
    Degree: string;

    @Field({ nullable: true })
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field({ nullable: true })
    Major?: string;

    @Field({ nullable: true })
    Kind?: string;

    @Field(() => Int, { nullable: true })
    GradeLevel?: number;

    @Field()
    CreatedAt: Date;

    @Field()
    UpdatedAt: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Person Education Histories
//****************************************************************************
@ObjectType()
export class RunPersonEducationHistoryViewResult {
    @Field(() => [PersonEducationHistory_])
    Results: PersonEducationHistory_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(PersonEducationHistory_)
export class PersonEducationHistoryResolver extends ResolverBase {
    @Query(() => RunPersonEducationHistoryViewResult)
    async RunPersonEducationHistoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonEducationHistoryViewResult)
    async RunPersonEducationHistoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonEducationHistoryViewResult)
    async RunPersonEducationHistoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Person Education Histories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => PersonEducationHistory_, { nullable: true })
    async PersonEducationHistory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<PersonEducationHistory_ | null> {
        this.CheckUserReadPermissions('Person Education Histories', userPayload);
        const sSQL = `SELECT * FROM [ATD].[vwPersonEducationHistories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Person Education Histories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Person Education Histories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => PersonEducationHistory_)
    async CreatePersonEducationHistory(
        @Arg('input', () => CreatePersonEducationHistoryInput) input: CreatePersonEducationHistoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Person Education Histories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => PersonEducationHistory_)
    async UpdatePersonEducationHistory(
        @Arg('input', () => UpdatePersonEducationHistoryInput) input: UpdatePersonEducationHistoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Person Education Histories', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => PersonEducationHistory_)
    async DeletePersonEducationHistory(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Person Education Histories', key, options, dataSource, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Person Employment Histories
//****************************************************************************
@ObjectType()
export class PersonEmploymentHistory_ {
    @Field(() => Int) 
    ID: number;
        
    @Field(() => Int) 
    PersonID: number;
        
    @Field(() => Boolean) 
    IsCurrent: boolean;
        
    @Field() 
    @MaxLength(200)
    Title: string;
        
    @Field() 
    @MaxLength(100)
    Organization: string;
        
    @Field(() => Int, {nullable: true}) 
    AccountID?: number;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    StartedAt?: Date;
        
    @Field({nullable: true}) 
    @MaxLength(8)
    EndedAt?: Date;
        
    @Field() 
    @MaxLength(8)
    CreatedAt: Date;
        
    @Field() 
    @MaxLength(8)
    UpdatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__CreatedAt: Date;
        
    @Field() 
    @MaxLength(10)
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Person Employment Histories
//****************************************************************************
@InputType()
export class CreatePersonEmploymentHistoryInput {
    @Field(() => Int)
    PersonID: number;

    @Field(() => Boolean)
    IsCurrent: boolean;

    @Field()
    Title: string;

    @Field()
    Organization: string;

    @Field(() => Int, { nullable: true })
    AccountID?: number;

    @Field({ nullable: true })
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field()
    CreatedAt: Date;

    @Field()
    UpdatedAt: Date;
}
    

//****************************************************************************
// INPUT TYPE for Person Employment Histories
//****************************************************************************
@InputType()
export class UpdatePersonEmploymentHistoryInput {
    @Field(() => Int)
    ID: number;

    @Field(() => Int)
    PersonID: number;

    @Field(() => Boolean)
    IsCurrent: boolean;

    @Field()
    Title: string;

    @Field()
    Organization: string;

    @Field(() => Int, { nullable: true })
    AccountID?: number;

    @Field({ nullable: true })
    StartedAt?: Date;

    @Field({ nullable: true })
    EndedAt?: Date;

    @Field()
    CreatedAt: Date;

    @Field()
    UpdatedAt: Date;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];
}
    
//****************************************************************************
// RESOLVER for Person Employment Histories
//****************************************************************************
@ObjectType()
export class RunPersonEmploymentHistoryViewResult {
    @Field(() => [PersonEmploymentHistory_])
    Results: PersonEmploymentHistory_[];

    @Field(() => String, {nullable: true})
    UserViewRunID?: string;

    @Field(() => Int, {nullable: true})
    RowCount: number;

    @Field(() => Int, {nullable: true})
    TotalRowCount: number;

    @Field(() => Int, {nullable: true})
    ExecutionTime: number;

    @Field({nullable: true})
    ErrorMessage?: string;

    @Field(() => Boolean, {nullable: false})
    Success: boolean;
}

@Resolver(PersonEmploymentHistory_)
export class PersonEmploymentHistoryResolver extends ResolverBase {
    @Query(() => RunPersonEmploymentHistoryViewResult)
    async RunPersonEmploymentHistoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByIDGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonEmploymentHistoryViewResult)
    async RunPersonEmploymentHistoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        return super.RunViewByNameGeneric(input, dataSource, userPayload, pubSub);
    }

    @Query(() => RunPersonEmploymentHistoryViewResult)
    async RunPersonEmploymentHistoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        input.EntityName = 'Person Employment Histories';
        return super.RunDynamicViewGeneric(input, dataSource, userPayload, pubSub);
    }
    @Query(() => PersonEmploymentHistory_, { nullable: true })
    async PersonEmploymentHistory(@Arg('ID', () => Int) ID: number, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<PersonEmploymentHistory_ | null> {
        this.CheckUserReadPermissions('Person Employment Histories', userPayload);
        const sSQL = `SELECT * FROM [ATD].[vwPersonEmploymentHistories] WHERE [ID]=${ID} ` + this.getRowLevelSecurityWhereClause('Person Employment Histories', userPayload, EntityPermissionType.Read, 'AND');
        const result = this.MapFieldNamesToCodeNames('Person Employment Histories', await dataSource.query(sSQL).then((r) => r && r.length > 0 ? r[0] : {}))
        return result;
    }
    
    @Mutation(() => PersonEmploymentHistory_)
    async CreatePersonEmploymentHistory(
        @Arg('input', () => CreatePersonEmploymentHistoryInput) input: CreatePersonEmploymentHistoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.CreateRecord('Person Employment Histories', input, dataSource, userPayload, pubSub)
    }
        
    @Mutation(() => PersonEmploymentHistory_)
    async UpdatePersonEmploymentHistory(
        @Arg('input', () => UpdatePersonEmploymentHistoryInput) input: UpdatePersonEmploymentHistoryInput,
        @Ctx() { dataSource, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        return this.UpdateRecord('Person Employment Histories', input, dataSource, userPayload, pubSub);
    }
    
    @Mutation(() => PersonEmploymentHistory_)
    async DeletePersonEmploymentHistory(@Arg('ID', () => Int) ID: number, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { dataSource, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Person Employment Histories', key, options, dataSource, userPayload, pubSub);
    }
    
}