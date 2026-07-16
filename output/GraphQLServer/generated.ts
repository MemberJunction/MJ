/********************************************************************************
* ALL ENTITIES - TypeGraphQL Type Class Definition - AUTO GENERATED FILE
* Generated Entities and Resolvers for Server
*
*   >>> DO NOT MODIFY THIS FILE!!!!!!!!!!!!
*   >>> YOUR CHANGES WILL BE OVERWRITTEN
*   >>> THE NEXT TIME THIS FILE IS GENERATED
*
**********************************************************************************/
import { Arg, Ctx, Int, Query, Resolver, Field, Float, ObjectType, FieldResolver, Root, InputType, Mutation,
            PubSub, PubSubEngine, ResolverBase, RunViewByIDInput, RunViewByNameInput, RunDynamicViewInput,
            AppContext, KeyValuePairInput, DeleteOptionsInput, GraphQLTimestamp as Timestamp,
            GetReadOnlyProvider, GetReadWriteProvider, RestoreContextInput } from '@memberjunction/server';
import { Metadata, EntityPermissionType, CompositeKey, UserInfo } from '@memberjunction/core'

import { MaxLength } from 'class-validator';
import * as mj_core_schema_server_object_types from '@memberjunction/server'


import { constantcontactaccount_emailsEntity, constantcontactaccount_physical_addressEntity, constantcontactaccount_summaryEntity, constantcontactaccount_user_privilegesEntity, constantcontactactivitiesEntity, constantcontactactivities_contacts_deleteEntity, constantcontactactivities_contacts_file_importEntity, constantcontactactivities_contacts_json_importEntity, constantcontactactivities_contacts_taggings_addEntity, constantcontactactivities_contacts_taggings_removeEntity, constantcontactactivities_contacts_tags_deleteEntity, constantcontactactivities_custom_fields_deleteEntity, constantcontactactivities_list_deleteEntity, constantcontactactivities_list_memberships_addEntity, constantcontactactivities_list_memberships_removeEntity, constantcontactcontact_custom_fieldsEntity, constantcontactcontact_listsEntity, constantcontactcontact_lists_xrefsEntity, constantcontactcontact_reports_activity_summaryEntity, constantcontactcontact_reports_open_and_click_ratesEntity, constantcontactcontact_tagsEntity, constantcontactcontactsEntity, constantcontactcontacts_countsEntity, constantcontactcontacts_sign_up_formEntity, constantcontactcontacts_xrefsEntity, constantcontactemail_campaign_activitiesEntity, constantcontactemail_campaign_activity_non_opener_resendsEntity, constantcontactemail_campaign_activity_previewsEntity, constantcontactemail_campaign_activity_send_historyEntity, constantcontactemail_reports_linksEntity, constantcontactemail_reports_summaryEntity, constantcontactemailsEntity, constantcontactemails_xrefsEntity, constantcontacteventsEntity, constantcontactevents_copyEntity, constantcontactevents_registrationsEntity, constantcontactsegmentsEntity, constantcontactsocial_connectionsEntity, constantcontactsocial_hashtag_groupsEntity, constantcontactsocial_postsEntity, constantcontactsocial_profilesEntity } from 'mj_generatedentities';
    

//****************************************************************************
// ENTITY CLASS for Account Emails
//****************************************************************************
@ObjectType({ description: `GET a Collection of Account Email Addresses` })
export class constantcontactaccountemails_ {
    @Field(() => String, {nullable: true, description: `An email address associated with a Constant Contact account owner.`}) 
    @MaxLength(812)
    email_address?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The confirmation status of the account email address. When you add a new email address to an account, Constant Contact automatically sends an email to that address with a link to confirm it. You can use any account email address with a CONFIRMED status to create an email campaign.`}) 
    @MaxLength(812)
    confirm_status?: string;
        
    @Field(() => String, {nullable: true, description: `Describes who confirmed the email address. Valid values are:
  
  SITE_OWNER — The Constant Contact account owner confirmed the email address.
  SUPPORT — Constant Contact support staff confirmed the email address.
  FORCEVERIFY — Constant Contact confirmed the email address without sending a confirmation email.
  PARTNER — A Constant Contact partner confirmed the email address.`}) 
    @MaxLength(812)
    confirm_source_type?: string;
        
    @Field(() => String, {nullable: true, description: `The date that the email address changed to CONFIRMED status in ISO-8601 format.`}) 
    confirm_time?: string;
        
    @Field(() => String, {nullable: true, description: `The unique ID for an email address in a Constant Contact account.`}) 
    @MaxLength(450)
    email_id?: string;
        
    @Field(() => String, {nullable: true, description: `Specifies the current role of a confirmed email address in an account. Each email address can have multiple roles or no role. Possible role values are:  CONTACT — The contact email for the Constant Contact account owner. Each account can only have one CONTACT role email. BILLING — The billing address for the Constant Contact account. Each account can only have one BILLING role email. JOURNALING — An email address that Constant Contact forwards all sent email campaigns to as part of the`}) 
    roles?: string;
        
    @Field(() => String, {nullable: true, description: `The planned role for an unconfirmed email address. Possible role values are:  CONTACT — The contact email for the Constant Contact account owner. Each account can only have one CONTACT role email. BILLING — The billing address for the Constant Contact account. Each account can only have one BILLING role email. JOURNALING — The email address that Constant Contact forwards all sent email campaigns to as part of the partner journaling compliance feature. REPLY_TO — The contact email used `}) 
    pending_roles?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Account Emails
//****************************************************************************
@InputType()
export class CreateconstantcontactaccountemailsInput {
    @Field(() => String, { nullable: true })
    email_address: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    confirm_status: string | null;

    @Field(() => String, { nullable: true })
    confirm_source_type: string | null;

    @Field(() => String, { nullable: true })
    confirm_time: string | null;

    @Field(() => String, { nullable: true })
    email_id?: string | null;

    @Field(() => String, { nullable: true })
    roles: string | null;

    @Field(() => String, { nullable: true })
    pending_roles: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Account Emails
//****************************************************************************
@InputType()
export class UpdateconstantcontactaccountemailsInput {
    @Field(() => String, { nullable: true })
    email_address?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    confirm_status?: string | null;

    @Field(() => String, { nullable: true })
    confirm_source_type?: string | null;

    @Field(() => String, { nullable: true })
    confirm_time?: string | null;

    @Field(() => String, { nullable: true })
    email_id: string | null;

    @Field(() => String, { nullable: true })
    roles?: string | null;

    @Field(() => String, { nullable: true })
    pending_roles?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Account Emails
//****************************************************************************
@ObjectType()
export class RunconstantcontactaccountemailsViewResult {
    @Field(() => [constantcontactaccountemails_])
    Results: constantcontactaccountemails_[];

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

@Resolver(constantcontactaccountemails_)
export class constantcontactaccountemailsResolver extends ResolverBase {
    @Query(() => RunconstantcontactaccountemailsViewResult)
    async RunconstantcontactaccountemailsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactaccountemailsViewResult)
    async RunconstantcontactaccountemailsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactaccountemailsViewResult)
    async RunconstantcontactaccountemailsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Emails';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactaccountemails_, { nullable: true })
    async constantcontactaccountemails(@Arg('email_id', () => String) email_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactaccountemails_ | null> {
        this.CheckUserReadPermissions('Account Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwAccount_emails')} WHERE ${provider.QuoteIdentifier('email_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [email_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Account Emails', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactaccountemails_)
    async Createconstantcontactaccountemails(
        @Arg('input', () => CreateconstantcontactaccountemailsInput) input: CreateconstantcontactaccountemailsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Emails', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactaccountemails_)
    async Updateconstantcontactaccountemails(
        @Arg('input', () => UpdateconstantcontactaccountemailsInput) input: UpdateconstantcontactaccountemailsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Emails', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactaccountemails_)
    async Deleteconstantcontactaccountemails(@Arg('email_id', () => String) email_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'email_id', Value: email_id}]);
        return this.DeleteRecord('Account Emails', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account Physical Addresses
//****************************************************************************
@ObjectType({ description: `GET the Physical Address for the Account` })
export class constantcontactaccountphysicaladdress_ {
    @Field(() => String, {nullable: true, description: `Line 3 of the organization's street address.`}) 
    @MaxLength(812)
    address_line3?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(450)
    ID?: string;
        
    @Field(() => String, {nullable: true, description: `The city where the organization is located.`}) 
    @MaxLength(812)
    city?: string;
        
    @Field(() => String, {nullable: true, description: `Use if the state where the organization is physically located is not in the United States or Canada. If  country_code is  US or CA, exclude this property from the request body.`}) 
    @MaxLength(812)
    state_name?: string;
        
    @Field(() => String, {nullable: true, description: `The two letter ISO 3166-1 code for the organization's state and only used if the country_code is US or CA. If not, exclude this property from the request body.`}) 
    @MaxLength(812)
    state_code?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Line 1 of the organization's street address.`}) 
    @MaxLength(812)
    address_line1?: string;
        
    @Field(() => String, {nullable: true, description: `Line 2 of the organization's street address.`}) 
    @MaxLength(812)
    address_line2?: string;
        
    @Field(() => String, {nullable: true, description: `The two letter ISO 3166-1 code for the organization's country.`}) 
    @MaxLength(812)
    country_code?: string;
        
    @Field(() => String, {nullable: true, description: `The postal code address (ZIP code) of the organization. This property is required if the state_code is US or CA, otherwise exclude this property from the request body.`}) 
    @MaxLength(812)
    postal_code?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Account Physical Addresses
//****************************************************************************
@InputType()
export class CreateconstantcontactaccountphysicaladdressInput {
    @Field(() => String, { nullable: true })
    address_line3: string | null;

    @Field(() => String, { nullable: true })
    ID?: string | null;

    @Field(() => String, { nullable: true })
    city: string | null;

    @Field(() => String, { nullable: true })
    state_name: string | null;

    @Field(() => String, { nullable: true })
    state_code: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    address_line1: string | null;

    @Field(() => String, { nullable: true })
    address_line2: string | null;

    @Field(() => String, { nullable: true })
    country_code: string | null;

    @Field(() => String, { nullable: true })
    postal_code: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Account Physical Addresses
//****************************************************************************
@InputType()
export class UpdateconstantcontactaccountphysicaladdressInput {
    @Field(() => String, { nullable: true })
    address_line3?: string | null;

    @Field(() => String, { nullable: true })
    ID: string | null;

    @Field(() => String, { nullable: true })
    city?: string | null;

    @Field(() => String, { nullable: true })
    state_name?: string | null;

    @Field(() => String, { nullable: true })
    state_code?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    address_line1?: string | null;

    @Field(() => String, { nullable: true })
    address_line2?: string | null;

    @Field(() => String, { nullable: true })
    country_code?: string | null;

    @Field(() => String, { nullable: true })
    postal_code?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Account Physical Addresses
//****************************************************************************
@ObjectType()
export class RunconstantcontactaccountphysicaladdressViewResult {
    @Field(() => [constantcontactaccountphysicaladdress_])
    Results: constantcontactaccountphysicaladdress_[];

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

@Resolver(constantcontactaccountphysicaladdress_)
export class constantcontactaccountphysicaladdressResolver extends ResolverBase {
    @Query(() => RunconstantcontactaccountphysicaladdressViewResult)
    async RunconstantcontactaccountphysicaladdressViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactaccountphysicaladdressViewResult)
    async RunconstantcontactaccountphysicaladdressViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactaccountphysicaladdressViewResult)
    async RunconstantcontactaccountphysicaladdressDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Physical Addresses';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactaccountphysicaladdress_, { nullable: true })
    async constantcontactaccountphysicaladdress(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactaccountphysicaladdress_ | null> {
        this.CheckUserReadPermissions('Account Physical Addresses', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwAccount_physical_addresses')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Physical Addresses', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Account Physical Addresses', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactaccountphysicaladdress_)
    async Createconstantcontactaccountphysicaladdress(
        @Arg('input', () => CreateconstantcontactaccountphysicaladdressInput) input: CreateconstantcontactaccountphysicaladdressInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Physical Addresses', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactaccountphysicaladdress_)
    async Updateconstantcontactaccountphysicaladdress(
        @Arg('input', () => UpdateconstantcontactaccountphysicaladdressInput) input: UpdateconstantcontactaccountphysicaladdressInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Physical Addresses', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactaccountphysicaladdress_)
    async Deleteconstantcontactaccountphysicaladdress(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Account Physical Addresses', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account Summaries
//****************************************************************************
@ObjectType({ description: `GET a Summary of Account Details` })
export class constantcontactaccountsummary_ {
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The name of the organization that is associated with this account.`}) 
    @MaxLength(812)
    organization_name?: string;
        
    @Field(() => String, {nullable: true, description: `The account owner's last name.`}) 
    @MaxLength(812)
    last_name?: string;
        
    @Field(() => String, {nullable: true, description: `The encoded partner id that identifies which Constant Contact partner provisioned the account.`}) 
    @MaxLength(812)
    encoded_partner_id?: string;
        
    @Field(() => String, {nullable: true, description: `The account owner's contact phone number (up to 25 characters in length).`}) 
    @MaxLength(812)
    contact_phone?: string;
        
    @Field(() => String, {nullable: true, description: `The time zone that is automatically set based on the state_code setting; as defined in the IANA time-zone database (see http://www.iana.org/time-zones).`}) 
    @MaxLength(812)
    time_zone_id?: string;
        
    @Field(() => String, {nullable: true, description: `The uppercase two letter ISO 3166-1 code for the organization's state. This property is required if the country_code is US (United States).`}) 
    @MaxLength(812)
    state_code?: string;
        
    @Field(() => String, {nullable: true, description: `The organization's website URL.`}) 
    @MaxLength(812)
    website?: string;
        
    @Field(() => String, {nullable: true, description: `The readOnly encoded account ID that uniquely identifies the account.`}) 
    @MaxLength(450)
    encoded_account_id?: string;
        
    @Field(() => String, {nullable: true, description: `Email addresses that are associated with the Constant Contact account owner.`}) 
    @MaxLength(812)
    contact_email?: string;
        
    @Field(() => String, {nullable: true, description: `The phone number of the organization that is associated with this account.`}) 
    @MaxLength(812)
    organization_phone?: string;
        
    @Field(() => String, {nullable: true, description: `The account owner's first name.`}) 
    @MaxLength(812)
    first_name?: string;
        
    @Field(() => String, {nullable: true, description: `Used to include an existing company logo in the response body. If a company logo does not exist, nothing is returned in the response body. This property is optional.`}) 
    company_logo?: string;
        
    @Field(() => String, {nullable: true, description: `Physical Address (account_summary).`}) 
    physical_address?: string;
        
    @Field(() => String, {nullable: true, description: `The uppercase two-letter ISO 3166-1 code representing the organization's country.`}) 
    @MaxLength(812)
    country_code?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Account Summaries
//****************************************************************************
@InputType()
export class CreateconstantcontactaccountsummaryInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    organization_name: string | null;

    @Field(() => String, { nullable: true })
    last_name: string | null;

    @Field(() => String, { nullable: true })
    encoded_partner_id: string | null;

    @Field(() => String, { nullable: true })
    contact_phone: string | null;

    @Field(() => String, { nullable: true })
    time_zone_id: string | null;

    @Field(() => String, { nullable: true })
    state_code: string | null;

    @Field(() => String, { nullable: true })
    website: string | null;

    @Field(() => String, { nullable: true })
    encoded_account_id?: string | null;

    @Field(() => String, { nullable: true })
    contact_email: string | null;

    @Field(() => String, { nullable: true })
    organization_phone: string | null;

    @Field(() => String, { nullable: true })
    first_name: string | null;

    @Field(() => String, { nullable: true })
    company_logo: string | null;

    @Field(() => String, { nullable: true })
    physical_address: string | null;

    @Field(() => String, { nullable: true })
    country_code: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Account Summaries
//****************************************************************************
@InputType()
export class UpdateconstantcontactaccountsummaryInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    organization_name?: string | null;

    @Field(() => String, { nullable: true })
    last_name?: string | null;

    @Field(() => String, { nullable: true })
    encoded_partner_id?: string | null;

    @Field(() => String, { nullable: true })
    contact_phone?: string | null;

    @Field(() => String, { nullable: true })
    time_zone_id?: string | null;

    @Field(() => String, { nullable: true })
    state_code?: string | null;

    @Field(() => String, { nullable: true })
    website?: string | null;

    @Field(() => String, { nullable: true })
    encoded_account_id: string | null;

    @Field(() => String, { nullable: true })
    contact_email?: string | null;

    @Field(() => String, { nullable: true })
    organization_phone?: string | null;

    @Field(() => String, { nullable: true })
    first_name?: string | null;

    @Field(() => String, { nullable: true })
    company_logo?: string | null;

    @Field(() => String, { nullable: true })
    physical_address?: string | null;

    @Field(() => String, { nullable: true })
    country_code?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Account Summaries
//****************************************************************************
@ObjectType()
export class RunconstantcontactaccountsummaryViewResult {
    @Field(() => [constantcontactaccountsummary_])
    Results: constantcontactaccountsummary_[];

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

@Resolver(constantcontactaccountsummary_)
export class constantcontactaccountsummaryResolver extends ResolverBase {
    @Query(() => RunconstantcontactaccountsummaryViewResult)
    async RunconstantcontactaccountsummaryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactaccountsummaryViewResult)
    async RunconstantcontactaccountsummaryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactaccountsummaryViewResult)
    async RunconstantcontactaccountsummaryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account Summaries';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactaccountsummary_, { nullable: true })
    async constantcontactaccountsummary(@Arg('encoded_account_id', () => String) encoded_account_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactaccountsummary_ | null> {
        this.CheckUserReadPermissions('Account Summaries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwAccount_summaries')} WHERE ${provider.QuoteIdentifier('encoded_account_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Account Summaries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [encoded_account_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Account Summaries', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactaccountsummary_)
    async Createconstantcontactaccountsummary(
        @Arg('input', () => CreateconstantcontactaccountsummaryInput) input: CreateconstantcontactaccountsummaryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account Summaries', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactaccountsummary_)
    async Updateconstantcontactaccountsummary(
        @Arg('input', () => UpdateconstantcontactaccountsummaryInput) input: UpdateconstantcontactaccountsummaryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account Summaries', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactaccountsummary_)
    async Deleteconstantcontactaccountsummary(@Arg('encoded_account_id', () => String) encoded_account_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'encoded_account_id', Value: encoded_account_id}]);
        return this.DeleteRecord('Account Summaries', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Account User Privileges
//****************************************************************************
@ObjectType({ description: `GET User Privileges` })
export class constantcontactaccountuserprivileges_ {
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies a user privilege in Constant Contact.`}) 
    @MaxLength(450)
    privilege_id?: string;
        
    @Field(() => String, {nullable: true, description: `The name of the Constant Contact user privilege.`}) 
    @MaxLength(812)
    privilege_name?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Account User Privileges
//****************************************************************************
@InputType()
export class CreateconstantcontactaccountuserprivilegesInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    privilege_id?: string | null;

    @Field(() => String, { nullable: true })
    privilege_name: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Account User Privileges
//****************************************************************************
@InputType()
export class UpdateconstantcontactaccountuserprivilegesInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    privilege_id: string | null;

    @Field(() => String, { nullable: true })
    privilege_name?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Account User Privileges
//****************************************************************************
@ObjectType()
export class RunconstantcontactaccountuserprivilegesViewResult {
    @Field(() => [constantcontactaccountuserprivileges_])
    Results: constantcontactaccountuserprivileges_[];

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

@Resolver(constantcontactaccountuserprivileges_)
export class constantcontactaccountuserprivilegesResolver extends ResolverBase {
    @Query(() => RunconstantcontactaccountuserprivilegesViewResult)
    async RunconstantcontactaccountuserprivilegesViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactaccountuserprivilegesViewResult)
    async RunconstantcontactaccountuserprivilegesViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactaccountuserprivilegesViewResult)
    async RunconstantcontactaccountuserprivilegesDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Account User Privileges';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactaccountuserprivileges_, { nullable: true })
    async constantcontactaccountuserprivileges(@Arg('privilege_id', () => String) privilege_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactaccountuserprivileges_ | null> {
        this.CheckUserReadPermissions('Account User Privileges', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwAccount_user_privileges')} WHERE ${provider.QuoteIdentifier('privilege_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Account User Privileges', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [privilege_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Account User Privileges', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactaccountuserprivileges_)
    async Createconstantcontactaccountuserprivileges(
        @Arg('input', () => CreateconstantcontactaccountuserprivilegesInput) input: CreateconstantcontactaccountuserprivilegesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Account User Privileges', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactaccountuserprivileges_)
    async Updateconstantcontactaccountuserprivileges(
        @Arg('input', () => UpdateconstantcontactaccountuserprivilegesInput) input: UpdateconstantcontactaccountuserprivilegesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Account User Privileges', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactaccountuserprivileges_)
    async Deleteconstantcontactaccountuserprivileges(@Arg('privilege_id', () => String) privilege_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'privilege_id', Value: privilege_id}]);
        return this.DeleteRecord('Account User Privileges', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities
//****************************************************************************
@ObjectType({ description: `GET Activity Status Collection` })
export class constantcontactactivities_ {
    @Field(() => String, {nullable: true, description: ` Links (activities).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `Name of the file used for an add_contacts activity.`}) 
    @MaxLength(812)
    source_file_name?: string;
        
    @Field(() => String, {nullable: true, description: `The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we created the activity, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for the activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `Shows the percent done for an activity that we are still processing.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we completed processing the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: `Array of messages describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we last updated the activity, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we began processing the activity request, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitiesInput {
    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    source_file_name: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitiesInput {
    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    source_file_name?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitiesViewResult {
    @Field(() => [constantcontactactivities_])
    Results: constantcontactactivities_[];

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

@Resolver(constantcontactactivities_)
export class constantcontactactivitiesResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitiesViewResult)
    async RunconstantcontactactivitiesViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiesViewResult)
    async RunconstantcontactactivitiesViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiesViewResult)
    async RunconstantcontactactivitiesDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivities_, { nullable: true })
    async constantcontactactivities(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivities_ | null> {
        this.CheckUserReadPermissions('Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivities_)
    async Createconstantcontactactivities(
        @Arg('input', () => CreateconstantcontactactivitiesInput) input: CreateconstantcontactactivitiesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivities_)
    async Updateconstantcontactactivities(
        @Arg('input', () => UpdateconstantcontactactivitiesInput) input: UpdateconstantcontactactivitiesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivities_)
    async Deleteconstantcontactactivities(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities Contacts Deletes
//****************************************************************************
@ObjectType({ description: `Delete Contacts in Bulk` })
export class constantcontactactivitiescontactsdelete_ {
    @Field(() => String, {nullable: true, description: `Timestamp showing when we created the activity, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities_contacts_delete).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we last updated the activity, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_contacts_delete).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we began processing the activity request, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {nullable: true, description: `Shows the percent done for an activity that we are still processing.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `Array of messages describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for the activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we completed processing the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities Contacts Deletes
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitiescontactsdeleteInput {
    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities Contacts Deletes
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitiescontactsdeleteInput {
    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities Contacts Deletes
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitiescontactsdeleteViewResult {
    @Field(() => [constantcontactactivitiescontactsdelete_])
    Results: constantcontactactivitiescontactsdelete_[];

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

@Resolver(constantcontactactivitiescontactsdelete_)
export class constantcontactactivitiescontactsdeleteResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitiescontactsdeleteViewResult)
    async RunconstantcontactactivitiescontactsdeleteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactsdeleteViewResult)
    async RunconstantcontactactivitiescontactsdeleteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactsdeleteViewResult)
    async RunconstantcontactactivitiescontactsdeleteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities Contacts Deletes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitiescontactsdelete_, { nullable: true })
    async constantcontactactivitiescontactsdelete(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitiescontactsdelete_ | null> {
        this.CheckUserReadPermissions('Activities Contacts Deletes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_contacts_deletes')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities Contacts Deletes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities Contacts Deletes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitiescontactsdelete_)
    async Createconstantcontactactivitiescontactsdelete(
        @Arg('input', () => CreateconstantcontactactivitiescontactsdeleteInput) input: CreateconstantcontactactivitiescontactsdeleteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities Contacts Deletes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitiescontactsdelete_)
    async Updateconstantcontactactivitiescontactsdelete(
        @Arg('input', () => UpdateconstantcontactactivitiescontactsdeleteInput) input: UpdateconstantcontactactivitiescontactsdeleteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities Contacts Deletes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitiescontactsdelete_)
    async Deleteconstantcontactactivitiescontactsdelete(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities Contacts Deletes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities Contacts File Imports
//****************************************************************************
@ObjectType({ description: `Import Contacts using a CSV File` })
export class constantcontactactivitiescontactsfileimport_ {
    @Field(() => String, {nullable: true, description: `Array of messages describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true, description: `Shows the percent done for an activity that we are still processing.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we last updated the activity, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `The state of the request:
 
   initialized - request has been received
  processing - request is being processed
  completed - job completed
  cancelled - request was cancelled
  failed - job failed to complete
  timed_out - the request timed out before completing"`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for the activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_contacts_file_import).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we completed processing the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities_contacts_file_import).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we began processing the activity request, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we created the activity, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `Name of the file used for an file_import activity.`}) 
    @MaxLength(812)
    source_file_name?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities Contacts File Imports
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitiescontactsfileimportInput {
    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    source_file_name: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities Contacts File Imports
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitiescontactsfileimportInput {
    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    source_file_name?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities Contacts File Imports
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitiescontactsfileimportViewResult {
    @Field(() => [constantcontactactivitiescontactsfileimport_])
    Results: constantcontactactivitiescontactsfileimport_[];

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

@Resolver(constantcontactactivitiescontactsfileimport_)
export class constantcontactactivitiescontactsfileimportResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitiescontactsfileimportViewResult)
    async RunconstantcontactactivitiescontactsfileimportViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactsfileimportViewResult)
    async RunconstantcontactactivitiescontactsfileimportViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactsfileimportViewResult)
    async RunconstantcontactactivitiescontactsfileimportDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities Contacts File Imports';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitiescontactsfileimport_, { nullable: true })
    async constantcontactactivitiescontactsfileimport(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitiescontactsfileimport_ | null> {
        this.CheckUserReadPermissions('Activities Contacts File Imports', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_contacts_file_imports')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities Contacts File Imports', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities Contacts File Imports', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitiescontactsfileimport_)
    async Createconstantcontactactivitiescontactsfileimport(
        @Arg('input', () => CreateconstantcontactactivitiescontactsfileimportInput) input: CreateconstantcontactactivitiescontactsfileimportInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities Contacts File Imports', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitiescontactsfileimport_)
    async Updateconstantcontactactivitiescontactsfileimport(
        @Arg('input', () => UpdateconstantcontactactivitiescontactsfileimportInput) input: UpdateconstantcontactactivitiescontactsfileimportInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities Contacts File Imports', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitiescontactsfileimport_)
    async Deleteconstantcontactactivitiescontactsfileimport(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities Contacts File Imports', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities Contacts Json Imports
//****************************************************************************
@ObjectType({ description: `Import Contacts using a JSON Payload` })
export class constantcontactactivitiescontactsjsonimport_ {
    @Field(() => String, {nullable: true, description: `Status (activities_contacts_json_import).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we completed processing the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_contacts_json_import).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `Name of the file used for an file_import activity.`}) 
    @MaxLength(812)
    source_file_name?: string;
        
    @Field(() => String, {nullable: true, description: `Shows the percent done for an activity that we are still processing.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we last updated the activity, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we began processing the activity request, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {nullable: true, description: `Array of messages describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for the activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we created the activity, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `The state of the request:
 
   initialized - request has been received
  processing - request is being processed
  completed - job completed
  cancelled - request was cancelled
  failed - job failed to complete
  timed_out - the request timed out before completing"`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities Contacts Json Imports
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitiescontactsjsonimportInput {
    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    source_file_name: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities Contacts Json Imports
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitiescontactsjsonimportInput {
    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    source_file_name?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities Contacts Json Imports
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitiescontactsjsonimportViewResult {
    @Field(() => [constantcontactactivitiescontactsjsonimport_])
    Results: constantcontactactivitiescontactsjsonimport_[];

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

@Resolver(constantcontactactivitiescontactsjsonimport_)
export class constantcontactactivitiescontactsjsonimportResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitiescontactsjsonimportViewResult)
    async RunconstantcontactactivitiescontactsjsonimportViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactsjsonimportViewResult)
    async RunconstantcontactactivitiescontactsjsonimportViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactsjsonimportViewResult)
    async RunconstantcontactactivitiescontactsjsonimportDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities Contacts Json Imports';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitiescontactsjsonimport_, { nullable: true })
    async constantcontactactivitiescontactsjsonimport(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitiescontactsjsonimport_ | null> {
        this.CheckUserReadPermissions('Activities Contacts Json Imports', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_contacts_json_imports')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities Contacts Json Imports', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities Contacts Json Imports', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitiescontactsjsonimport_)
    async Createconstantcontactactivitiescontactsjsonimport(
        @Arg('input', () => CreateconstantcontactactivitiescontactsjsonimportInput) input: CreateconstantcontactactivitiescontactsjsonimportInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities Contacts Json Imports', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitiescontactsjsonimport_)
    async Updateconstantcontactactivitiescontactsjsonimport(
        @Arg('input', () => UpdateconstantcontactactivitiescontactsjsonimportInput) input: UpdateconstantcontactactivitiescontactsjsonimportInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities Contacts Json Imports', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitiescontactsjsonimport_)
    async Deleteconstantcontactactivitiescontactsjsonimport(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities Contacts Json Imports', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities Contacts Taggings Adds
//****************************************************************************
@ObjectType({ description: `Add Tags to Contacts` })
export class constantcontactactivitiescontactstaggingsadd_ {
    @Field(() => String, {nullable: true, description: `Timestamp showing when processing completed for the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when the activity was first requested, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when the activity was last updated, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `The system assigned UUID that uniquely identifies an activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `An array of error message strings describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities_contacts_taggings_add).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `The activity processing state.`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_contacts_taggings_add).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `The processing percent complete for the activity.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when processing started for the activity, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities Contacts Taggings Adds
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitiescontactstaggingsaddInput {
    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities Contacts Taggings Adds
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitiescontactstaggingsaddInput {
    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities Contacts Taggings Adds
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitiescontactstaggingsaddViewResult {
    @Field(() => [constantcontactactivitiescontactstaggingsadd_])
    Results: constantcontactactivitiescontactstaggingsadd_[];

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

@Resolver(constantcontactactivitiescontactstaggingsadd_)
export class constantcontactactivitiescontactstaggingsaddResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitiescontactstaggingsaddViewResult)
    async RunconstantcontactactivitiescontactstaggingsaddViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactstaggingsaddViewResult)
    async RunconstantcontactactivitiescontactstaggingsaddViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactstaggingsaddViewResult)
    async RunconstantcontactactivitiescontactstaggingsaddDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities Contacts Taggings Adds';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitiescontactstaggingsadd_, { nullable: true })
    async constantcontactactivitiescontactstaggingsadd(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitiescontactstaggingsadd_ | null> {
        this.CheckUserReadPermissions('Activities Contacts Taggings Adds', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_contacts_taggings_adds')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities Contacts Taggings Adds', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities Contacts Taggings Adds', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitiescontactstaggingsadd_)
    async Createconstantcontactactivitiescontactstaggingsadd(
        @Arg('input', () => CreateconstantcontactactivitiescontactstaggingsaddInput) input: CreateconstantcontactactivitiescontactstaggingsaddInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities Contacts Taggings Adds', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitiescontactstaggingsadd_)
    async Updateconstantcontactactivitiescontactstaggingsadd(
        @Arg('input', () => UpdateconstantcontactactivitiescontactstaggingsaddInput) input: UpdateconstantcontactactivitiescontactstaggingsaddInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities Contacts Taggings Adds', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitiescontactstaggingsadd_)
    async Deleteconstantcontactactivitiescontactstaggingsadd(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities Contacts Taggings Adds', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities Contacts Taggings Removes
//****************************************************************************
@ObjectType({ description: `Remove Tags from Contacts` })
export class constantcontactactivitiescontactstaggingsremove_ {
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when the activity was first requested, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when processing completed for the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_contacts_taggings_remove).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `The activity processing state.`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: `The system assigned UUID that uniquely identifies an activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `The processing percent complete for the activity.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `An array of error message strings describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when the activity was last updated, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities_contacts_taggings_remove).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when processing started for the activity, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities Contacts Taggings Removes
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitiescontactstaggingsremoveInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities Contacts Taggings Removes
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitiescontactstaggingsremoveInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities Contacts Taggings Removes
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitiescontactstaggingsremoveViewResult {
    @Field(() => [constantcontactactivitiescontactstaggingsremove_])
    Results: constantcontactactivitiescontactstaggingsremove_[];

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

@Resolver(constantcontactactivitiescontactstaggingsremove_)
export class constantcontactactivitiescontactstaggingsremoveResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitiescontactstaggingsremoveViewResult)
    async RunconstantcontactactivitiescontactstaggingsremoveViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactstaggingsremoveViewResult)
    async RunconstantcontactactivitiescontactstaggingsremoveViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactstaggingsremoveViewResult)
    async RunconstantcontactactivitiescontactstaggingsremoveDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities Contacts Taggings Removes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitiescontactstaggingsremove_, { nullable: true })
    async constantcontactactivitiescontactstaggingsremove(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitiescontactstaggingsremove_ | null> {
        this.CheckUserReadPermissions('Activities Contacts Taggings Removes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_contacts_taggings_removes')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities Contacts Taggings Removes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities Contacts Taggings Removes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitiescontactstaggingsremove_)
    async Createconstantcontactactivitiescontactstaggingsremove(
        @Arg('input', () => CreateconstantcontactactivitiescontactstaggingsremoveInput) input: CreateconstantcontactactivitiescontactstaggingsremoveInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities Contacts Taggings Removes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitiescontactstaggingsremove_)
    async Updateconstantcontactactivitiescontactstaggingsremove(
        @Arg('input', () => UpdateconstantcontactactivitiescontactstaggingsremoveInput) input: UpdateconstantcontactactivitiescontactstaggingsremoveInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities Contacts Taggings Removes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitiescontactstaggingsremove_)
    async Deleteconstantcontactactivitiescontactstaggingsremove(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities Contacts Taggings Removes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities Contacts Tags Deletes
//****************************************************************************
@ObjectType({ description: `Delete Tags` })
export class constantcontactactivitiescontactstagsdelete_ {
    @Field(() => String, {nullable: true, description: `Timestamp showing when the activity was last updated, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities_contacts_tags_delete).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `The system assigned UUID that uniquely identifies an activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_contacts_tags_delete).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when processing completed for the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: `The processing percent complete for the activity.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `The activity processing state.`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when processing started for the activity, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `An array of error message strings describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when the activity was first requested, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities Contacts Tags Deletes
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitiescontactstagsdeleteInput {
    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities Contacts Tags Deletes
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitiescontactstagsdeleteInput {
    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities Contacts Tags Deletes
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitiescontactstagsdeleteViewResult {
    @Field(() => [constantcontactactivitiescontactstagsdelete_])
    Results: constantcontactactivitiescontactstagsdelete_[];

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

@Resolver(constantcontactactivitiescontactstagsdelete_)
export class constantcontactactivitiescontactstagsdeleteResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitiescontactstagsdeleteViewResult)
    async RunconstantcontactactivitiescontactstagsdeleteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactstagsdeleteViewResult)
    async RunconstantcontactactivitiescontactstagsdeleteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescontactstagsdeleteViewResult)
    async RunconstantcontactactivitiescontactstagsdeleteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities Contacts Tags Deletes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitiescontactstagsdelete_, { nullable: true })
    async constantcontactactivitiescontactstagsdelete(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitiescontactstagsdelete_ | null> {
        this.CheckUserReadPermissions('Activities Contacts Tags Deletes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_contacts_tags_deletes')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities Contacts Tags Deletes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities Contacts Tags Deletes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitiescontactstagsdelete_)
    async Createconstantcontactactivitiescontactstagsdelete(
        @Arg('input', () => CreateconstantcontactactivitiescontactstagsdeleteInput) input: CreateconstantcontactactivitiescontactstagsdeleteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities Contacts Tags Deletes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitiescontactstagsdelete_)
    async Updateconstantcontactactivitiescontactstagsdelete(
        @Arg('input', () => UpdateconstantcontactactivitiescontactstagsdeleteInput) input: UpdateconstantcontactactivitiescontactstagsdeleteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities Contacts Tags Deletes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitiescontactstagsdelete_)
    async Deleteconstantcontactactivitiescontactstagsdelete(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities Contacts Tags Deletes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities Custom Fields Deletes
//****************************************************************************
@ObjectType({ description: `Delete Custom Fields` })
export class constantcontactactivitiescustomfieldsdelete_ {
    @Field(() => String, {nullable: true, description: `Timestamp showing when we last updated the activity, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_custom_fields_delete).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we began processing the activity request, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we completed processing the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: `Shows the percent done for an activity that we are still processing.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for the activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we created the activity, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Array of messages describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities Custom Fields Deletes
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitiescustomfieldsdeleteInput {
    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities Custom Fields Deletes
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitiescustomfieldsdeleteInput {
    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities Custom Fields Deletes
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitiescustomfieldsdeleteViewResult {
    @Field(() => [constantcontactactivitiescustomfieldsdelete_])
    Results: constantcontactactivitiescustomfieldsdelete_[];

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

@Resolver(constantcontactactivitiescustomfieldsdelete_)
export class constantcontactactivitiescustomfieldsdeleteResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitiescustomfieldsdeleteViewResult)
    async RunconstantcontactactivitiescustomfieldsdeleteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescustomfieldsdeleteViewResult)
    async RunconstantcontactactivitiescustomfieldsdeleteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitiescustomfieldsdeleteViewResult)
    async RunconstantcontactactivitiescustomfieldsdeleteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities Custom Fields Deletes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitiescustomfieldsdelete_, { nullable: true })
    async constantcontactactivitiescustomfieldsdelete(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitiescustomfieldsdelete_ | null> {
        this.CheckUserReadPermissions('Activities Custom Fields Deletes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_custom_fields_deletes')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities Custom Fields Deletes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities Custom Fields Deletes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitiescustomfieldsdelete_)
    async Createconstantcontactactivitiescustomfieldsdelete(
        @Arg('input', () => CreateconstantcontactactivitiescustomfieldsdeleteInput) input: CreateconstantcontactactivitiescustomfieldsdeleteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities Custom Fields Deletes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitiescustomfieldsdelete_)
    async Updateconstantcontactactivitiescustomfieldsdelete(
        @Arg('input', () => UpdateconstantcontactactivitiescustomfieldsdeleteInput) input: UpdateconstantcontactactivitiescustomfieldsdeleteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities Custom Fields Deletes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitiescustomfieldsdelete_)
    async Deleteconstantcontactactivitiescustomfieldsdelete(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities Custom Fields Deletes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities List Deletes
//****************************************************************************
@ObjectType({ description: `Delete Contact Lists` })
export class constantcontactactivitieslistdelete_ {
    @Field(() => String, {nullable: true, description: `Timestamp showing when the activity was first requested, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `The system assigned UUID that uniquely identifies an activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `The activity processing state.`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_list_delete).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when the activity was last updated, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `The processing percent complete for the activity.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when processing started for the activity, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when processing completed for the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: `An array of error message strings describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities_list_delete).`}) 
    status?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities List Deletes
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitieslistdeleteInput {
    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities List Deletes
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitieslistdeleteInput {
    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities List Deletes
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitieslistdeleteViewResult {
    @Field(() => [constantcontactactivitieslistdelete_])
    Results: constantcontactactivitieslistdelete_[];

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

@Resolver(constantcontactactivitieslistdelete_)
export class constantcontactactivitieslistdeleteResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitieslistdeleteViewResult)
    async RunconstantcontactactivitieslistdeleteViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitieslistdeleteViewResult)
    async RunconstantcontactactivitieslistdeleteViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitieslistdeleteViewResult)
    async RunconstantcontactactivitieslistdeleteDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities List Deletes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitieslistdelete_, { nullable: true })
    async constantcontactactivitieslistdelete(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitieslistdelete_ | null> {
        this.CheckUserReadPermissions('Activities List Deletes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_list_deletes')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities List Deletes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities List Deletes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitieslistdelete_)
    async Createconstantcontactactivitieslistdelete(
        @Arg('input', () => CreateconstantcontactactivitieslistdeleteInput) input: CreateconstantcontactactivitieslistdeleteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities List Deletes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitieslistdelete_)
    async Updateconstantcontactactivitieslistdelete(
        @Arg('input', () => UpdateconstantcontactactivitieslistdeleteInput) input: UpdateconstantcontactactivitieslistdeleteInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities List Deletes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitieslistdelete_)
    async Deleteconstantcontactactivitieslistdelete(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities List Deletes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities List Memberships Adds
//****************************************************************************
@ObjectType({ description: `Add Contacts to Lists` })
export class constantcontactactivitieslistmembershipsadd_ {
    @Field(() => String, {nullable: true, description: ` Links (activities_list_memberships_add).`}) 
    _links?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities_list_memberships_add).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we created the activity, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we completed processing the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for the activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `Array of messages describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we began processing the activity request, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {nullable: true, description: `The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: `Shows the percent done for an activity that we are still processing.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we last updated the activity, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities List Memberships Adds
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitieslistmembershipsaddInput {
    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities List Memberships Adds
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitieslistmembershipsaddInput {
    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities List Memberships Adds
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitieslistmembershipsaddViewResult {
    @Field(() => [constantcontactactivitieslistmembershipsadd_])
    Results: constantcontactactivitieslistmembershipsadd_[];

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

@Resolver(constantcontactactivitieslistmembershipsadd_)
export class constantcontactactivitieslistmembershipsaddResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitieslistmembershipsaddViewResult)
    async RunconstantcontactactivitieslistmembershipsaddViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitieslistmembershipsaddViewResult)
    async RunconstantcontactactivitieslistmembershipsaddViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitieslistmembershipsaddViewResult)
    async RunconstantcontactactivitieslistmembershipsaddDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities List Memberships Adds';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitieslistmembershipsadd_, { nullable: true })
    async constantcontactactivitieslistmembershipsadd(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitieslistmembershipsadd_ | null> {
        this.CheckUserReadPermissions('Activities List Memberships Adds', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_list_memberships_adds')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities List Memberships Adds', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities List Memberships Adds', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitieslistmembershipsadd_)
    async Createconstantcontactactivitieslistmembershipsadd(
        @Arg('input', () => CreateconstantcontactactivitieslistmembershipsaddInput) input: CreateconstantcontactactivitieslistmembershipsaddInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities List Memberships Adds', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitieslistmembershipsadd_)
    async Updateconstantcontactactivitieslistmembershipsadd(
        @Arg('input', () => UpdateconstantcontactactivitieslistmembershipsaddInput) input: UpdateconstantcontactactivitieslistmembershipsaddInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities List Memberships Adds', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitieslistmembershipsadd_)
    async Deleteconstantcontactactivitieslistmembershipsadd(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities List Memberships Adds', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Activities List Memberships Removes
//****************************************************************************
@ObjectType({ description: `Remove Contacts from Lists` })
export class constantcontactactivitieslistmembershipsremove_ {
    @Field(() => String, {nullable: true, description: `Array of messages describing the errors that occurred.`}) 
    activity_errors?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we created the activity, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we began processing the activity request, in ISO-8601 format.`}) 
    started_at?: string;
        
    @Field(() => String, {nullable: true, description: `The state of the request:  initialized - request has been received processing - request is being processed completed - job completed cancelled - request was cancelled failed - job failed to complete timed_out - the request timed out before completing"`}) 
    @MaxLength(812)
    state?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for the activity.`}) 
    @MaxLength(450)
    activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we last updated the activity, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `Status (activities_list_memberships_remove).`}) 
    status?: string;
        
    @Field(() => String, {nullable: true, description: `Shows the percent done for an activity that we are still processing.`}) 
    percent_done?: string;
        
    @Field(() => String, {nullable: true, description: `Timestamp showing when we completed processing the activity, in ISO-8601 format.`}) 
    completed_at?: string;
        
    @Field(() => String, {nullable: true, description: ` Links (activities_list_memberships_remove).`}) 
    _links?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Activities List Memberships Removes
//****************************************************************************
@InputType()
export class CreateconstantcontactactivitieslistmembershipsremoveInput {
    @Field(() => String, { nullable: true })
    activity_errors: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    started_at: string | null;

    @Field(() => String, { nullable: true })
    state: string | null;

    @Field(() => String, { nullable: true })
    activity_id?: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    percent_done: string | null;

    @Field(() => String, { nullable: true })
    completed_at: string | null;

    @Field(() => String, { nullable: true })
    _links: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Activities List Memberships Removes
//****************************************************************************
@InputType()
export class UpdateconstantcontactactivitieslistmembershipsremoveInput {
    @Field(() => String, { nullable: true })
    activity_errors?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    started_at?: string | null;

    @Field(() => String, { nullable: true })
    state?: string | null;

    @Field(() => String, { nullable: true })
    activity_id: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    percent_done?: string | null;

    @Field(() => String, { nullable: true })
    completed_at?: string | null;

    @Field(() => String, { nullable: true })
    _links?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Activities List Memberships Removes
//****************************************************************************
@ObjectType()
export class RunconstantcontactactivitieslistmembershipsremoveViewResult {
    @Field(() => [constantcontactactivitieslistmembershipsremove_])
    Results: constantcontactactivitieslistmembershipsremove_[];

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

@Resolver(constantcontactactivitieslistmembershipsremove_)
export class constantcontactactivitieslistmembershipsremoveResolver extends ResolverBase {
    @Query(() => RunconstantcontactactivitieslistmembershipsremoveViewResult)
    async RunconstantcontactactivitieslistmembershipsremoveViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitieslistmembershipsremoveViewResult)
    async RunconstantcontactactivitieslistmembershipsremoveViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactactivitieslistmembershipsremoveViewResult)
    async RunconstantcontactactivitieslistmembershipsremoveDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Activities List Memberships Removes';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactactivitieslistmembershipsremove_, { nullable: true })
    async constantcontactactivitieslistmembershipsremove(@Arg('activity_id', () => String) activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactactivitieslistmembershipsremove_ | null> {
        this.CheckUserReadPermissions('Activities List Memberships Removes', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwActivities_list_memberships_removes')} WHERE ${provider.QuoteIdentifier('activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Activities List Memberships Removes', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Activities List Memberships Removes', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactactivitieslistmembershipsremove_)
    async Createconstantcontactactivitieslistmembershipsremove(
        @Arg('input', () => CreateconstantcontactactivitieslistmembershipsremoveInput) input: CreateconstantcontactactivitieslistmembershipsremoveInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Activities List Memberships Removes', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactactivitieslistmembershipsremove_)
    async Updateconstantcontactactivitieslistmembershipsremove(
        @Arg('input', () => UpdateconstantcontactactivitieslistmembershipsremoveInput) input: UpdateconstantcontactactivitieslistmembershipsremoveInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Activities List Memberships Removes', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactactivitieslistmembershipsremove_)
    async Deleteconstantcontactactivitieslistmembershipsremove(@Arg('activity_id', () => String) activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'activity_id', Value: activity_id}]);
        return this.DeleteRecord('Activities List Memberships Removes', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Custom Fields
//****************************************************************************
@ObjectType({ description: `GET custom_fields Collection` })
export class constantcontactcontactcustomfields_ {
    @Field(() => String, {nullable: true, description: `Date and time that the resource was created, in ISO-8601 format. System generated.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `The custom field name to display in the UI (free-form text).`}) 
    @MaxLength(812)
    label?: string;
        
    @Field(() => String, {nullable: true, description: `For datetime data types, this is the version number associated with the custom field.`}) 
    version?: string;
        
    @Field(() => String, {nullable: true, description: `The unique custom field name constructed from the label by replacing blanks with underscores.`}) 
    @MaxLength(812)
    name?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Choices available for single_select and multi_select type custom fields. The maximum number of elements for radio or checkbox display types is 20. Maximum number of elements for a dropdown is 100.`}) 
    choices?: string;
        
    @Field(() => String, {nullable: true, description: `System generated date and time that the resource was updated, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `Metadata (contact_custom_fields).`}) 
    metadata?: string;
        
    @Field(() => String, {nullable: true, description: `The data value type the custom field accepts.`}) 
    @MaxLength(812)
    type?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated ID that uniquely identifies a custom_field.`}) 
    @MaxLength(450)
    custom_field_id?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Custom Fields
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactcustomfieldsInput {
    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    label: string | null;

    @Field(() => String, { nullable: true })
    version: string | null;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    choices: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    metadata: string | null;

    @Field(() => String, { nullable: true })
    type: string | null;

    @Field(() => String, { nullable: true })
    custom_field_id?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contact Custom Fields
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactcustomfieldsInput {
    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    label?: string | null;

    @Field(() => String, { nullable: true })
    version?: string | null;

    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    choices?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    metadata?: string | null;

    @Field(() => String, { nullable: true })
    type?: string | null;

    @Field(() => String, { nullable: true })
    custom_field_id: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contact Custom Fields
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactcustomfieldsViewResult {
    @Field(() => [constantcontactcontactcustomfields_])
    Results: constantcontactcontactcustomfields_[];

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

@Resolver(constantcontactcontactcustomfields_)
export class constantcontactcontactcustomfieldsResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactcustomfieldsViewResult)
    async RunconstantcontactcontactcustomfieldsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactcustomfieldsViewResult)
    async RunconstantcontactcontactcustomfieldsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactcustomfieldsViewResult)
    async RunconstantcontactcontactcustomfieldsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Custom Fields';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontactcustomfields_, { nullable: true })
    async constantcontactcontactcustomfields(@Arg('custom_field_id', () => String) custom_field_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontactcustomfields_ | null> {
        this.CheckUserReadPermissions('Contact Custom Fields', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_custom_fields')} WHERE ${provider.QuoteIdentifier('custom_field_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Custom Fields', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [custom_field_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Custom Fields', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactcontactcustomfields_)
    async Createconstantcontactcontactcustomfields(
        @Arg('input', () => CreateconstantcontactcontactcustomfieldsInput) input: CreateconstantcontactcontactcustomfieldsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Custom Fields', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontactcustomfields_)
    async Updateconstantcontactcontactcustomfields(
        @Arg('input', () => UpdateconstantcontactcontactcustomfieldsInput) input: UpdateconstantcontactcontactcustomfieldsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Custom Fields', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontactcustomfields_)
    async Deleteconstantcontactcontactcustomfields(@Arg('custom_field_id', () => String) custom_field_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'custom_field_id', Value: custom_field_id}]);
        return this.DeleteRecord('Contact Custom Fields', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Lists
//****************************************************************************
@ObjectType({ description: `GET Lists Collection` })
export class constantcontactcontactlists_ {
    @Field(() => String, {nullable: true, description: `Identifies whether or not the account has favorited the contact list.`}) 
    favorite?: string;
        
    @Field(() => String, {nullable: true, description: `The name given to the contact list`}) 
    @MaxLength(812)
    name?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for the contact list`}) 
    @MaxLength(450)
    list_id?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `System generated date and time that the resource was created, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `Date and time that the list was last updated, in ISO-8601 format. System generated.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `If the list was deleted, this property shows the date and time it was deleted, in ISO-8601 format. System generated.`}) 
    deleted_at?: string;
        
    @Field(() => String, {nullable: true, description: `The total number of contacts that are members in a list. Does not apply to segment type lists.`}) 
    membership_count?: string;
        
    @Field(() => String, {nullable: true, description: `Text describing the list.`}) 
    @MaxLength(812)
    description?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
    @Field(() => [constantcontactcontactlistsxrefs_])
    constantcontactContactListsXrefs_list_idArray: constantcontactcontactlistsxrefs_[]; // Link to constantcontactContactListsXrefs
    
    @Field(() => [constantcontactemailreportslinks_])
    constantcontactEmailReportsLinks_list_idArray: constantcontactemailreportslinks_[]; // Link to constantcontactEmailReportsLinks
    
}

//****************************************************************************
// INPUT TYPE for Contact Lists
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactlistsInput {
    @Field(() => String, { nullable: true })
    favorite: string | null;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    list_id?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    deleted_at: string | null;

    @Field(() => String, { nullable: true })
    membership_count: string | null;

    @Field(() => String, { nullable: true })
    description: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contact Lists
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactlistsInput {
    @Field(() => String, { nullable: true })
    favorite?: string | null;

    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    list_id: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    deleted_at?: string | null;

    @Field(() => String, { nullable: true })
    membership_count?: string | null;

    @Field(() => String, { nullable: true })
    description?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contact Lists
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactlistsViewResult {
    @Field(() => [constantcontactcontactlists_])
    Results: constantcontactcontactlists_[];

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

@Resolver(constantcontactcontactlists_)
export class constantcontactcontactlistsResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactlistsViewResult)
    async RunconstantcontactcontactlistsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactlistsViewResult)
    async RunconstantcontactcontactlistsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactlistsViewResult)
    async RunconstantcontactcontactlistsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Lists';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontactlists_, { nullable: true })
    async constantcontactcontactlists(@Arg('list_id', () => String) list_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontactlists_ | null> {
        this.CheckUserReadPermissions('Contact Lists', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_lists')} WHERE ${provider.QuoteIdentifier('list_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Lists', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [list_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Lists', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [constantcontactcontactlistsxrefs_])
    async constantcontactContactListsXrefs_list_idArray(@Root() constantcontactcontactlists_: constantcontactcontactlists_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Lists Xrefs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_lists_xrefs')} WHERE ${provider.QuoteIdentifier('list_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Lists Xrefs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactcontactlists_.list_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Lists Xrefs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactemailreportslinks_])
    async constantcontactEmailReportsLinks_list_idArray(@Root() constantcontactcontactlists_: constantcontactcontactlists_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Reports Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_reports_links')} WHERE ${provider.QuoteIdentifier('list_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Reports Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactcontactlists_.list_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Reports Links', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => constantcontactcontactlists_)
    async Createconstantcontactcontactlists(
        @Arg('input', () => CreateconstantcontactcontactlistsInput) input: CreateconstantcontactcontactlistsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Lists', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontactlists_)
    async Updateconstantcontactcontactlists(
        @Arg('input', () => UpdateconstantcontactcontactlistsInput) input: UpdateconstantcontactcontactlistsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Lists', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontactlists_)
    async Deleteconstantcontactcontactlists(@Arg('list_id', () => String) list_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'list_id', Value: list_id}]);
        return this.DeleteRecord('Contact Lists', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Lists Xrefs
//****************************************************************************
@ObjectType({ description: `GET a collection of V2 and V3 API List IDs` })
export class constantcontactcontactlistsxrefs_ {
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The V2 API list unique identifier`}) 
    @MaxLength(812)
    sequence_id?: string;
        
    @Field(() => String, {nullable: true, description: `The V3 API list unique identifier`}) 
    @MaxLength(450)
    list_id?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Lists Xrefs
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactlistsxrefsInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    sequence_id: string | null;

    @Field(() => String, { nullable: true })
    list_id?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contact Lists Xrefs
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactlistsxrefsInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    sequence_id?: string | null;

    @Field(() => String, { nullable: true })
    list_id: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contact Lists Xrefs
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactlistsxrefsViewResult {
    @Field(() => [constantcontactcontactlistsxrefs_])
    Results: constantcontactcontactlistsxrefs_[];

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

@Resolver(constantcontactcontactlistsxrefs_)
export class constantcontactcontactlistsxrefsResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactlistsxrefsViewResult)
    async RunconstantcontactcontactlistsxrefsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactlistsxrefsViewResult)
    async RunconstantcontactcontactlistsxrefsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactlistsxrefsViewResult)
    async RunconstantcontactcontactlistsxrefsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Lists Xrefs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontactlistsxrefs_, { nullable: true })
    async constantcontactcontactlistsxrefs(@Arg('list_id', () => String) list_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontactlistsxrefs_ | null> {
        this.CheckUserReadPermissions('Contact Lists Xrefs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_lists_xrefs')} WHERE ${provider.QuoteIdentifier('list_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Lists Xrefs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [list_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Lists Xrefs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactcontactlistsxrefs_)
    async Createconstantcontactcontactlistsxrefs(
        @Arg('input', () => CreateconstantcontactcontactlistsxrefsInput) input: CreateconstantcontactcontactlistsxrefsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Lists Xrefs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontactlistsxrefs_)
    async Updateconstantcontactcontactlistsxrefs(
        @Arg('input', () => UpdateconstantcontactcontactlistsxrefsInput) input: UpdateconstantcontactcontactlistsxrefsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Lists Xrefs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontactlistsxrefs_)
    async Deleteconstantcontactcontactlistsxrefs(@Arg('list_id', () => String) list_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'list_id', Value: list_id}]);
        return this.DeleteRecord('Contact Lists Xrefs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Reports Activity Summaries
//****************************************************************************
@ObjectType({ description: `GET Contact Action Summary` })
export class constantcontactcontactreportsactivitysummary_ {
    @Field(() => String, {nullable: true, description: `The unique id of the activity for an e-mail campaign.`}) 
    @MaxLength(255)
    campaign_activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `The number of times this contact has forwarded this email.`}) 
    @MaxLength(255)
    em_forwards?: string;
        
    @Field(() => String, {nullable: true, description: `The number of times this contact has opted out.`}) 
    @MaxLength(255)
    em_unsubscribes?: string;
        
    @Field(() => String, {nullable: true, description: `The last date at which the email was sent to this contact.`}) 
    start_on?: string;
        
    @Field(() => String, {nullable: true, description: `The number of times this contact has opened this email.`}) 
    @MaxLength(255)
    em_opens?: string;
        
    @Field(() => String, {nullable: true, description: `The number of times the email has bounced for this contact.`}) 
    @MaxLength(255)
    em_bounces?: string;
        
    @Field(() => String, {nullable: true, description: `The number of times this contact has clicked a link in this email.`}) 
    @MaxLength(255)
    em_clicks?: string;
        
    @Field(() => String, {nullable: true, description: `The number of times the email was sent to this contact.`}) 
    @MaxLength(255)
    em_sends?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Reports Activity Summaries
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactreportsactivitysummaryInput {
    @Field(() => String, { nullable: true })
    campaign_activity_id?: string | null;

    @Field(() => String, { nullable: true })
    em_forwards: string | null;

    @Field(() => String, { nullable: true })
    em_unsubscribes: string | null;

    @Field(() => String, { nullable: true })
    start_on: string | null;

    @Field(() => String, { nullable: true })
    em_opens: string | null;

    @Field(() => String, { nullable: true })
    em_bounces: string | null;

    @Field(() => String, { nullable: true })
    em_clicks: string | null;

    @Field(() => String, { nullable: true })
    em_sends: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contact Reports Activity Summaries
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactreportsactivitysummaryInput {
    @Field(() => String, { nullable: true })
    campaign_activity_id: string | null;

    @Field(() => String, { nullable: true })
    em_forwards?: string | null;

    @Field(() => String, { nullable: true })
    em_unsubscribes?: string | null;

    @Field(() => String, { nullable: true })
    start_on?: string | null;

    @Field(() => String, { nullable: true })
    em_opens?: string | null;

    @Field(() => String, { nullable: true })
    em_bounces?: string | null;

    @Field(() => String, { nullable: true })
    em_clicks?: string | null;

    @Field(() => String, { nullable: true })
    em_sends?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contact Reports Activity Summaries
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactreportsactivitysummaryViewResult {
    @Field(() => [constantcontactcontactreportsactivitysummary_])
    Results: constantcontactcontactreportsactivitysummary_[];

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

@Resolver(constantcontactcontactreportsactivitysummary_)
export class constantcontactcontactreportsactivitysummaryResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactreportsactivitysummaryViewResult)
    async RunconstantcontactcontactreportsactivitysummaryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactreportsactivitysummaryViewResult)
    async RunconstantcontactcontactreportsactivitysummaryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactreportsactivitysummaryViewResult)
    async RunconstantcontactcontactreportsactivitysummaryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Reports Activity Summaries';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontactreportsactivitysummary_, { nullable: true })
    async constantcontactcontactreportsactivitysummary(@Arg('campaign_activity_id', () => String) campaign_activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontactreportsactivitysummary_ | null> {
        this.CheckUserReadPermissions('Contact Reports Activity Summaries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_reports_activity_summaries')} WHERE ${provider.QuoteIdentifier('campaign_activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Reports Activity Summaries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [campaign_activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Reports Activity Summaries', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactcontactreportsactivitysummary_)
    async Createconstantcontactcontactreportsactivitysummary(
        @Arg('input', () => CreateconstantcontactcontactreportsactivitysummaryInput) input: CreateconstantcontactcontactreportsactivitysummaryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Reports Activity Summaries', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontactreportsactivitysummary_)
    async Updateconstantcontactcontactreportsactivitysummary(
        @Arg('input', () => UpdateconstantcontactcontactreportsactivitysummaryInput) input: UpdateconstantcontactcontactreportsactivitysummaryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Reports Activity Summaries', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontactreportsactivitysummary_)
    async Deleteconstantcontactcontactreportsactivitysummary(@Arg('campaign_activity_id', () => String) campaign_activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'campaign_activity_id', Value: campaign_activity_id}]);
        return this.DeleteRecord('Contact Reports Activity Summaries', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Reports Open And Click Rates
//****************************************************************************
@ObjectType({ description: `GET Average Open and Click Rates` })
export class constantcontactcontactreportsopenandclickrates_ {
    @Field(() => String, {nullable: true, description: `The unique ID of the contact for which the report is being generated.`}) 
    @MaxLength(255)
    contact_id?: string;
        
    @Field(() => String, {nullable: true, description: `The average rate the contact clicked on links in emails sent to them.`}) 
    @MaxLength(255)
    average_click_rate?: string;
        
    @Field(() => String, {nullable: true, description: `The average rate the contact opened emails sent to them.`}) 
    @MaxLength(255)
    average_open_rate?: string;
        
    @Field(() => String, {nullable: true, description: `The number of activities included in the calculation.`}) 
    @MaxLength(255)
    included_activities_count?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Reports Open And Click Rates
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactreportsopenandclickratesInput {
    @Field(() => String, { nullable: true })
    contact_id?: string | null;

    @Field(() => String, { nullable: true })
    average_click_rate: string | null;

    @Field(() => String, { nullable: true })
    average_open_rate: string | null;

    @Field(() => String, { nullable: true })
    included_activities_count: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contact Reports Open And Click Rates
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactreportsopenandclickratesInput {
    @Field(() => String, { nullable: true })
    contact_id: string | null;

    @Field(() => String, { nullable: true })
    average_click_rate?: string | null;

    @Field(() => String, { nullable: true })
    average_open_rate?: string | null;

    @Field(() => String, { nullable: true })
    included_activities_count?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contact Reports Open And Click Rates
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactreportsopenandclickratesViewResult {
    @Field(() => [constantcontactcontactreportsopenandclickrates_])
    Results: constantcontactcontactreportsopenandclickrates_[];

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

@Resolver(constantcontactcontactreportsopenandclickrates_)
export class constantcontactcontactreportsopenandclickratesResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactreportsopenandclickratesViewResult)
    async RunconstantcontactcontactreportsopenandclickratesViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactreportsopenandclickratesViewResult)
    async RunconstantcontactcontactreportsopenandclickratesViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactreportsopenandclickratesViewResult)
    async RunconstantcontactcontactreportsopenandclickratesDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Reports Open And Click Rates';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontactreportsopenandclickrates_, { nullable: true })
    async constantcontactcontactreportsopenandclickrates(@Arg('contact_id', () => String) contact_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontactreportsopenandclickrates_ | null> {
        this.CheckUserReadPermissions('Contact Reports Open And Click Rates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_reports_open_and_click_rates')} WHERE ${provider.QuoteIdentifier('contact_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Reports Open And Click Rates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [contact_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Reports Open And Click Rates', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactcontactreportsopenandclickrates_)
    async Createconstantcontactcontactreportsopenandclickrates(
        @Arg('input', () => CreateconstantcontactcontactreportsopenandclickratesInput) input: CreateconstantcontactcontactreportsopenandclickratesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Reports Open And Click Rates', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontactreportsopenandclickrates_)
    async Updateconstantcontactcontactreportsopenandclickrates(
        @Arg('input', () => UpdateconstantcontactcontactreportsopenandclickratesInput) input: UpdateconstantcontactcontactreportsopenandclickratesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Reports Open And Click Rates', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontactreportsopenandclickrates_)
    async Deleteconstantcontactcontactreportsopenandclickrates(@Arg('contact_id', () => String) contact_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}]);
        return this.DeleteRecord('Contact Reports Open And Click Rates', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contact Tags
//****************************************************************************
@ObjectType({ description: `GET Details for All Tags` })
export class constantcontactcontacttags_ {
    @Field(() => String, {nullable: true, description: `The unique tag name.`}) 
    @MaxLength(812)
    name?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The source used to tag contacts.`}) 
    @MaxLength(812)
    tag_source?: string;
        
    @Field(() => String, {nullable: true, description: `The ID that uniquely identifies a tag (UUID format)`}) 
    @MaxLength(450)
    tag_id?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated date and time when the tag was created (ISO-8601 format).`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated date and time when the tag was last updated (ISO-8601 format).`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `The total number of contacts who are assigned this tag.`}) 
    contacts_count?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contact Tags
//****************************************************************************
@InputType()
export class CreateconstantcontactcontacttagsInput {
    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    tag_source: string | null;

    @Field(() => String, { nullable: true })
    tag_id?: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    contacts_count: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contact Tags
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontacttagsInput {
    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    tag_source?: string | null;

    @Field(() => String, { nullable: true })
    tag_id: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    contacts_count?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contact Tags
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontacttagsViewResult {
    @Field(() => [constantcontactcontacttags_])
    Results: constantcontactcontacttags_[];

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

@Resolver(constantcontactcontacttags_)
export class constantcontactcontacttagsResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontacttagsViewResult)
    async RunconstantcontactcontacttagsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontacttagsViewResult)
    async RunconstantcontactcontacttagsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontacttagsViewResult)
    async RunconstantcontactcontacttagsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contact Tags';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontacttags_, { nullable: true })
    async constantcontactcontacttags(@Arg('tag_id', () => String) tag_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontacttags_ | null> {
        this.CheckUserReadPermissions('Contact Tags', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_tags')} WHERE ${provider.QuoteIdentifier('tag_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Tags', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [tag_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contact Tags', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactcontacttags_)
    async Createconstantcontactcontacttags(
        @Arg('input', () => CreateconstantcontactcontacttagsInput) input: CreateconstantcontactcontacttagsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contact Tags', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontacttags_)
    async Updateconstantcontactcontacttags(
        @Arg('input', () => UpdateconstantcontactcontacttagsInput) input: UpdateconstantcontactcontacttagsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contact Tags', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontacttags_)
    async Deleteconstantcontactcontacttags(@Arg('tag_id', () => String) tag_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'tag_id', Value: tag_id}]);
        return this.DeleteRecord('Contact Tags', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts
//****************************************************************************
@ObjectType({ description: `GET Contacts Collection` })
export class constantcontactcontacts_ {
    @Field(() => String, {nullable: true, description: `The job title of the contact.`}) 
    @MaxLength(812)
    job_title?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Includes SMS channel and consent details.`}) 
    sms_channel?: string;
        
    @Field(() => String, {nullable: true, description: `Array of tags (tag_id) assigned to the contact, up to a maximum of 50.`}) 
    taggings?: string;
        
    @Field(() => String, {nullable: true, description: `Email Address (contacts).`}) 
    email_address?: string;
        
    @Field(() => String, {nullable: true, description: `Array of up to 50 list_ids to which the contact is subscribed.`}) 
    list_memberships?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies who last updated the contact; valid values are  Contact or Account.`}) 
    @MaxLength(812)
    update_source?: string;
        
    @Field(() => String, {nullable: true, description: `The month value for the contact's birthday. Valid values are from 1 through 12. You must use this property with birthday_month.`}) 
    birthday_month?: string;
        
    @Field(() => String, {nullable: true, description: `The last name of the contact.`}) 
    @MaxLength(812)
    last_name?: string;
        
    @Field(() => String, {nullable: true, description: `System generated date and time that the resource was created, in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `Unique ID for each contact resource`}) 
    @MaxLength(450)
    contact_id?: string;
        
    @Field(() => String, {nullable: true, description: `System generated date and time that the contact was last updated, in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `Describes who added the contact; valid values are Contact or Account. Your integration must accurately identify create_source for compliance reasons; value is set when contact is created.`}) 
    @MaxLength(812)
    create_source?: string;
        
    @Field(() => String, {nullable: true, description: `The first name of the contact.`}) 
    @MaxLength(812)
    first_name?: string;
        
    @Field(() => String, {nullable: true, description: `For deleted contacts (email_address contains opt_out_source and opt_out_date), shows the date of deletion.`}) 
    deleted_at?: string;
        
    @Field(() => String, {nullable: true, description: `The day value for the contact's birthday. Valid values are from 1 through 12. You must use this property with birthday_day.`}) 
    birthday_day?: string;
        
    @Field(() => String, {nullable: true, description: `Array of up to 3 street_addresses subresources.`}) 
    street_addresses?: string;
        
    @Field(() => String, {nullable: true, description: `The name of the company where the contact works.`}) 
    @MaxLength(812)
    company_name?: string;
        
    @Field(() => String, {nullable: true, description: `An array of notes about the contact listed by most recent note first.`}) 
    notes?: string;
        
    @Field(() => String, {nullable: true, description: `Array of up to 25 custom_field subresources.`}) 
    custom_fields?: string;
        
    @Field(() => String, {nullable: true, description: `The anniversary date for the contact. For example, this value could be the date when the contact first became a customer of an organization in Constant Contact. Valid date formats are MM/DD/YYYY, M/D/YYYY, YYYY/MM/DD, YYYY/M/D, YYYY-MM-DD, YYYY-M-D,M-D-YYYY, or M-DD-YYYY.`}) 
    @MaxLength(812)
    anniversary?: string;
        
    @Field(() => String, {nullable: true, description: `Array of up to 3 phone_numbers subresources.`}) 
    phone_numbers?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
    @Field(() => [constantcontacteventsregistrations_])
    constantcontactEventsRegistrations_contact_idArray: constantcontacteventsregistrations_[]; // Link to constantcontactEventsRegistrations
    
    @Field(() => [constantcontactcontactreportsopenandclickrates_])
    constantcontactContactReportsOpenAndClickRates_contact_idArray: constantcontactcontactreportsopenandclickrates_[]; // Link to constantcontactContactReportsOpenAndClickRates
    
    @Field(() => [constantcontactcontactsxrefs_])
    constantcontactContactsXrefs_contact_idArray: constantcontactcontactsxrefs_[]; // Link to constantcontactContactsXrefs
    
    @Field(() => [constantcontactcontactssignupform_])
    constantcontactContactsSignUpForms_contact_idArray: constantcontactcontactssignupform_[]; // Link to constantcontactContactsSignUpForms
    
}

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactsInput {
    @Field(() => String, { nullable: true })
    job_title: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    sms_channel: string | null;

    @Field(() => String, { nullable: true })
    taggings: string | null;

    @Field(() => String, { nullable: true })
    email_address: string | null;

    @Field(() => String, { nullable: true })
    list_memberships: string | null;

    @Field(() => String, { nullable: true })
    update_source: string | null;

    @Field(() => String, { nullable: true })
    birthday_month: string | null;

    @Field(() => String, { nullable: true })
    last_name: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    contact_id?: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    create_source: string | null;

    @Field(() => String, { nullable: true })
    first_name: string | null;

    @Field(() => String, { nullable: true })
    deleted_at: string | null;

    @Field(() => String, { nullable: true })
    birthday_day: string | null;

    @Field(() => String, { nullable: true })
    street_addresses: string | null;

    @Field(() => String, { nullable: true })
    company_name: string | null;

    @Field(() => String, { nullable: true })
    notes: string | null;

    @Field(() => String, { nullable: true })
    custom_fields: string | null;

    @Field(() => String, { nullable: true })
    anniversary: string | null;

    @Field(() => String, { nullable: true })
    phone_numbers: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contacts
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactsInput {
    @Field(() => String, { nullable: true })
    job_title?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    sms_channel?: string | null;

    @Field(() => String, { nullable: true })
    taggings?: string | null;

    @Field(() => String, { nullable: true })
    email_address?: string | null;

    @Field(() => String, { nullable: true })
    list_memberships?: string | null;

    @Field(() => String, { nullable: true })
    update_source?: string | null;

    @Field(() => String, { nullable: true })
    birthday_month?: string | null;

    @Field(() => String, { nullable: true })
    last_name?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    contact_id: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    create_source?: string | null;

    @Field(() => String, { nullable: true })
    first_name?: string | null;

    @Field(() => String, { nullable: true })
    deleted_at?: string | null;

    @Field(() => String, { nullable: true })
    birthday_day?: string | null;

    @Field(() => String, { nullable: true })
    street_addresses?: string | null;

    @Field(() => String, { nullable: true })
    company_name?: string | null;

    @Field(() => String, { nullable: true })
    notes?: string | null;

    @Field(() => String, { nullable: true })
    custom_fields?: string | null;

    @Field(() => String, { nullable: true })
    anniversary?: string | null;

    @Field(() => String, { nullable: true })
    phone_numbers?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contacts
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactsViewResult {
    @Field(() => [constantcontactcontacts_])
    Results: constantcontactcontacts_[];

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

@Resolver(constantcontactcontacts_)
export class constantcontactcontactsResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactsViewResult)
    async RunconstantcontactcontactsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactsViewResult)
    async RunconstantcontactcontactsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactsViewResult)
    async RunconstantcontactcontactsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontacts_, { nullable: true })
    async constantcontactcontacts(@Arg('contact_id', () => String) contact_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontacts_ | null> {
        this.CheckUserReadPermissions('Contacts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContacts')} WHERE ${provider.QuoteIdentifier('contact_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [contact_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [constantcontacteventsregistrations_])
    async constantcontactEventsRegistrations_contact_idArray(@Root() constantcontactcontacts_: constantcontactcontacts_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Events Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEvents_registrations')} WHERE ${provider.QuoteIdentifier('contact_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Events Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactcontacts_.contact_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Events Registrations', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactcontactreportsopenandclickrates_])
    async constantcontactContactReportsOpenAndClickRates_contact_idArray(@Root() constantcontactcontacts_: constantcontactcontacts_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Reports Open And Click Rates', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_reports_open_and_click_rates')} WHERE ${provider.QuoteIdentifier('contact_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Reports Open And Click Rates', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactcontacts_.contact_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Reports Open And Click Rates', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactcontactsxrefs_])
    async constantcontactContactsXrefs_contact_idArray(@Root() constantcontactcontacts_: constantcontactcontacts_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts Xrefs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContacts_xrefs')} WHERE ${provider.QuoteIdentifier('contact_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts Xrefs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactcontacts_.contact_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts Xrefs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactcontactssignupform_])
    async constantcontactContactsSignUpForms_contact_idArray(@Root() constantcontactcontacts_: constantcontactcontacts_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contacts Sign Up Forms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContacts_sign_up_forms')} WHERE ${provider.QuoteIdentifier('contact_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts Sign Up Forms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactcontacts_.contact_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contacts Sign Up Forms', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => constantcontactcontacts_)
    async Createconstantcontactcontacts(
        @Arg('input', () => CreateconstantcontactcontactsInput) input: CreateconstantcontactcontactsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontacts_)
    async Updateconstantcontactcontacts(
        @Arg('input', () => UpdateconstantcontactcontactsInput) input: UpdateconstantcontactcontactsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontacts_)
    async Deleteconstantcontactcontacts(@Arg('contact_id', () => String) contact_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}]);
        return this.DeleteRecord('Contacts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts Counts
//****************************************************************************
@ObjectType({ description: `GET Contact Consent Counts` })
export class constantcontactcontactscounts_ {
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Total number of newly subscribed contacts.`}) 
    new_subscriber?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(450)
    ID?: string;
        
    @Field(() => String, {nullable: true, description: `Total number of contacts explicitly confirmed. Consent is obtained when you explicitly ask your potential contacts for permission to send the email (for example, using a sign-up form) and they agree. After you obtain express consent, it is good forever or until the contact opts out.`}) 
    explicit?: string;
        
    @Field(() => String, {nullable: true, description: `Total number of contacts implicitly confirmed. Consent is inferred based on actions, such as having an existing business relationship (making a purchase or donation, for example). In order to maintain implied consent to comply with CASL a contact must take a business action with you at least once every two years. Under CAN-Spam there is no need to maintain implied consent, it is assumed until the receiver indicates they no longer wish to receive messages.`}) 
    implicit?: string;
        
    @Field(() => String, {nullable: true, description: `Total number of contacts for the account.`}) 
    total?: string;
        
    @Field(() => String, {nullable: true, description: `Total number of contacts pending confirmation. Consent is requested and pending confirmation from the contact.`}) 
    pending?: string;
        
    @Field(() => String, {nullable: true, description: `Total number of unsubscribed contacts. Consent is revoked when a contact has unsubscribed.`}) 
    unsubscribed?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contacts Counts
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactscountsInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    new_subscriber: string | null;

    @Field(() => String, { nullable: true })
    ID?: string | null;

    @Field(() => String, { nullable: true })
    explicit: string | null;

    @Field(() => String, { nullable: true })
    implicit: string | null;

    @Field(() => String, { nullable: true })
    total: string | null;

    @Field(() => String, { nullable: true })
    pending: string | null;

    @Field(() => String, { nullable: true })
    unsubscribed: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contacts Counts
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactscountsInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    new_subscriber?: string | null;

    @Field(() => String, { nullable: true })
    ID: string | null;

    @Field(() => String, { nullable: true })
    explicit?: string | null;

    @Field(() => String, { nullable: true })
    implicit?: string | null;

    @Field(() => String, { nullable: true })
    total?: string | null;

    @Field(() => String, { nullable: true })
    pending?: string | null;

    @Field(() => String, { nullable: true })
    unsubscribed?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contacts Counts
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactscountsViewResult {
    @Field(() => [constantcontactcontactscounts_])
    Results: constantcontactcontactscounts_[];

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

@Resolver(constantcontactcontactscounts_)
export class constantcontactcontactscountsResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactscountsViewResult)
    async RunconstantcontactcontactscountsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactscountsViewResult)
    async RunconstantcontactcontactscountsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactscountsViewResult)
    async RunconstantcontactcontactscountsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts Counts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontactscounts_, { nullable: true })
    async constantcontactcontactscounts(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontactscounts_ | null> {
        this.CheckUserReadPermissions('Contacts Counts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContacts_counts')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts Counts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts Counts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactcontactscounts_)
    async Createconstantcontactcontactscounts(
        @Arg('input', () => CreateconstantcontactcontactscountsInput) input: CreateconstantcontactcontactscountsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts Counts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontactscounts_)
    async Updateconstantcontactcontactscounts(
        @Arg('input', () => UpdateconstantcontactcontactscountsInput) input: UpdateconstantcontactcontactscountsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts Counts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontactscounts_)
    async Deleteconstantcontactcontactscounts(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Contacts Counts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts Sign Up Forms
//****************************************************************************
@ObjectType({ description: `Create or Update a Contact` })
export class constantcontactcontactssignupform_ {
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies if the V3 API created a new contact or updated an existing contact.`}) 
    @MaxLength(812)
    action?: string;
        
    @Field(() => String, {nullable: true, description: `The unique identifier for the contact that the V3 API created or updated.`}) 
    @MaxLength(450)
    contact_id?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contacts Sign Up Forms
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactssignupformInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    action: string | null;

    @Field(() => String, { nullable: true })
    contact_id?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contacts Sign Up Forms
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactssignupformInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    action?: string | null;

    @Field(() => String, { nullable: true })
    contact_id: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contacts Sign Up Forms
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactssignupformViewResult {
    @Field(() => [constantcontactcontactssignupform_])
    Results: constantcontactcontactssignupform_[];

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

@Resolver(constantcontactcontactssignupform_)
export class constantcontactcontactssignupformResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactssignupformViewResult)
    async RunconstantcontactcontactssignupformViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactssignupformViewResult)
    async RunconstantcontactcontactssignupformViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactssignupformViewResult)
    async RunconstantcontactcontactssignupformDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts Sign Up Forms';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontactssignupform_, { nullable: true })
    async constantcontactcontactssignupform(@Arg('contact_id', () => String) contact_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontactssignupform_ | null> {
        this.CheckUserReadPermissions('Contacts Sign Up Forms', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContacts_sign_up_forms')} WHERE ${provider.QuoteIdentifier('contact_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts Sign Up Forms', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [contact_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts Sign Up Forms', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactcontactssignupform_)
    async Createconstantcontactcontactssignupform(
        @Arg('input', () => CreateconstantcontactcontactssignupformInput) input: CreateconstantcontactcontactssignupformInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts Sign Up Forms', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontactssignupform_)
    async Updateconstantcontactcontactssignupform(
        @Arg('input', () => UpdateconstantcontactcontactssignupformInput) input: UpdateconstantcontactcontactssignupformInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts Sign Up Forms', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontactssignupform_)
    async Deleteconstantcontactcontactssignupform(@Arg('contact_id', () => String) contact_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}]);
        return this.DeleteRecord('Contacts Sign Up Forms', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Contacts Xrefs
//****************************************************************************
@ObjectType({ description: `GET a collection of V2 and V3 API contact IDs` })
export class constantcontactcontactsxrefs_ {
    @Field(() => String, {nullable: true, description: `The V3 API contact unique identifier`}) 
    @MaxLength(450)
    contact_id?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The V2 API contact unique identifier`}) 
    @MaxLength(812)
    sequence_id?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Contacts Xrefs
//****************************************************************************
@InputType()
export class CreateconstantcontactcontactsxrefsInput {
    @Field(() => String, { nullable: true })
    contact_id?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    sequence_id: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Contacts Xrefs
//****************************************************************************
@InputType()
export class UpdateconstantcontactcontactsxrefsInput {
    @Field(() => String, { nullable: true })
    contact_id: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    sequence_id?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Contacts Xrefs
//****************************************************************************
@ObjectType()
export class RunconstantcontactcontactsxrefsViewResult {
    @Field(() => [constantcontactcontactsxrefs_])
    Results: constantcontactcontactsxrefs_[];

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

@Resolver(constantcontactcontactsxrefs_)
export class constantcontactcontactsxrefsResolver extends ResolverBase {
    @Query(() => RunconstantcontactcontactsxrefsViewResult)
    async RunconstantcontactcontactsxrefsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactsxrefsViewResult)
    async RunconstantcontactcontactsxrefsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactcontactsxrefsViewResult)
    async RunconstantcontactcontactsxrefsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Contacts Xrefs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactcontactsxrefs_, { nullable: true })
    async constantcontactcontactsxrefs(@Arg('contact_id', () => String) contact_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactcontactsxrefs_ | null> {
        this.CheckUserReadPermissions('Contacts Xrefs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContacts_xrefs')} WHERE ${provider.QuoteIdentifier('contact_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contacts Xrefs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [contact_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Contacts Xrefs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactcontactsxrefs_)
    async Createconstantcontactcontactsxrefs(
        @Arg('input', () => CreateconstantcontactcontactsxrefsInput) input: CreateconstantcontactcontactsxrefsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Contacts Xrefs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactcontactsxrefs_)
    async Updateconstantcontactcontactsxrefs(
        @Arg('input', () => UpdateconstantcontactcontactsxrefsInput) input: UpdateconstantcontactcontactsxrefsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Contacts Xrefs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactcontactsxrefs_)
    async Deleteconstantcontactcontactsxrefs(@Arg('contact_id', () => String) contact_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'contact_id', Value: contact_id}]);
        return this.DeleteRecord('Contacts Xrefs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Campaign Activities
//****************************************************************************
@ObjectType({ description: `GET a Single Email Campaign Activity` })
export class constantcontactemailcampaignactivities_ {
    @Field(() => String, {nullable: true, description: `The current status of the email campaign activity. Valid values are: 
  DRAFT — An email campaign activity that you have created but have not sent to contacts.
  SCHEDULED — An email campaign activity that you have scheduled for Constant Contact to send to contacts.
  EXECUTING — An email campaign activity Constant Contact is currently sending to contacts. Email campaign activities are only in this status briefly.
  DONE — An email campaign activity that you successfully sent to contac`}) 
    @MaxLength(255)
    current_status?: string;
        
    @Field(() => String, {nullable: true, description: `The purpose of the individual campaign activity in the larger email campaign effort. Valid values are: 
  primary_email — The main email marketing campaign that you send to contacts. The primary_email contains the complete email content.
  permalink — A permanent link to a web accessible version of the primary_email content without any personalized email information. For example, permalinks do not contain any of the contact details that you add to the primary_email email content. 
  re`}) 
    @MaxLength(255)
    role?: string;
        
    @Field(() => String, {nullable: true, description: `The permanent link to a web accessible version of the email campaign content without any personalized email information. The permalink URL becomes accessible after you send an email campaign to contacts.`}) 
    @MaxLength(255)
    permalink_url?: string;
        
    @Field(() => String, {nullable: true, description: `The contacts that Constant Contact sends the email campaign activity to as an array of contact list_id values. You cannot use contact lists and segments at the same time in an email campaign activity.`}) 
    contact_list_ids?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies the email layout and design template that the email campaign activity is using as a base.`}) 
    @MaxLength(255)
    template_id?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies a campaign in the V3 API.`}) 
    @MaxLength(255)
    campaign_id?: string;
        
    @Field(() => String, {nullable: true, description: `The HTML or XHTML content for the email campaign activity. Only format_type 1 and 5 (legacy custom code emails or modern custom code emails) can contain html_content.`}) 
    @MaxLength(255)
    html_content?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies the type of email format. Valid values are: 
  1 - A legacy custom code email created using the V2 API, the V3 API, or the legacy UI HTML editor.
  2 - An email created using the second generation email editor UI.
  3 - An email created using the third generation email editor UI. This email editor features an improved drag and drop UI and mobile responsiveness.
  4 - An email created using the fourth generation email editor UI.
  5 - A custom code email created using the V3 `}) 
    @MaxLength(255)
    format_type?: string;
        
    @Field(() => String, {nullable: true, description: `The contacts that Constant Contact sends the email campaign activity to as an array containing a single segment_id value. Only format_type 3, 4, and 5 email campaign activities support segments. You cannot use contact lists and segments at the same time in an email campaign activity.`}) 
    segment_ids?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies a campaign activity in the V3 API.`}) 
    @MaxLength(255)
    campaign_activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `The email "Subject" field for the email campaign activity.`}) 
    @MaxLength(255)
    subject?: string;
        
    @Field(() => String, {nullable: true, description: `The email "From Name" field for the email campaign activity.`}) 
    @MaxLength(255)
    from_name?: string;
        
    @Field(() => String, {nullable: true, description: `The email "From Email" field for the email campaign activity. You must use a confirmed Constant Contact account email address. Make a GET call to /account/emails to return a collection of account emails and their confirmation status.`}) 
    @MaxLength(255)
    from_email?: string;
        
    @Field(() => String, {nullable: true, description: `The email preheader for the email campaign activity. Only format_type 3, 4, and 5 email campaign activities use the preheader property.`}) 
    @MaxLength(255)
    preheader?: string;
        
    @Field(() => String, {nullable: true, description: `The physical address of the organization that is sending the email campaign. Constant Contact displays this information to contacts in the email message footer.`}) 
    physical_address_in_footer?: string;
        
    @Field(() => String, {nullable: true, description: `The email "Reply To Email" field for the email campaign activity. You must use a confirmed Constant Contact account email address. Make a GET call to /account/emails to return a collection of account emails and their confirmation status.`}) 
    @MaxLength(255)
    reply_to_email?: string;
        
    @Field(() => String, {nullable: true, description: `An object that contains optional properties for legacy format type emails (format_type 1 and 2). If you attempt to add a property that does apply to the email format_type, the API will ignore the property.`}) 
    document_properties?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
    @Field(() => [constantcontactemailcampaignactivitypreviews_])
    constantcontactEmailCampaignActivityPreviews_campaign_activity_idArray: constantcontactemailcampaignactivitypreviews_[]; // Link to constantcontactEmailCampaignActivityPreviews
    
    @Field(() => [constantcontactemailsxrefs_])
    constantcontactEmailsXrefs_campaign_activity_idArray: constantcontactemailsxrefs_[]; // Link to constantcontactEmailsXrefs
    
    @Field(() => [constantcontactcontactreportsactivitysummary_])
    constantcontactContactReportsActivitySummaries_campaign_activity_idArray: constantcontactcontactreportsactivitysummary_[]; // Link to constantcontactContactReportsActivitySummaries
    
}

//****************************************************************************
// INPUT TYPE for Email Campaign Activities
//****************************************************************************
@InputType()
export class CreateconstantcontactemailcampaignactivitiesInput {
    @Field(() => String, { nullable: true })
    current_status: string | null;

    @Field(() => String, { nullable: true })
    role: string | null;

    @Field(() => String, { nullable: true })
    permalink_url: string | null;

    @Field(() => String, { nullable: true })
    contact_list_ids: string | null;

    @Field(() => String, { nullable: true })
    template_id: string | null;

    @Field(() => String, { nullable: true })
    campaign_id: string | null;

    @Field(() => String, { nullable: true })
    html_content: string | null;

    @Field(() => String, { nullable: true })
    format_type: string | null;

    @Field(() => String, { nullable: true })
    segment_ids: string | null;

    @Field(() => String, { nullable: true })
    campaign_activity_id?: string | null;

    @Field(() => String, { nullable: true })
    subject: string | null;

    @Field(() => String, { nullable: true })
    from_name: string | null;

    @Field(() => String, { nullable: true })
    from_email: string | null;

    @Field(() => String, { nullable: true })
    preheader: string | null;

    @Field(() => String, { nullable: true })
    physical_address_in_footer: string | null;

    @Field(() => String, { nullable: true })
    reply_to_email: string | null;

    @Field(() => String, { nullable: true })
    document_properties: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Email Campaign Activities
//****************************************************************************
@InputType()
export class UpdateconstantcontactemailcampaignactivitiesInput {
    @Field(() => String, { nullable: true })
    current_status?: string | null;

    @Field(() => String, { nullable: true })
    role?: string | null;

    @Field(() => String, { nullable: true })
    permalink_url?: string | null;

    @Field(() => String, { nullable: true })
    contact_list_ids?: string | null;

    @Field(() => String, { nullable: true })
    template_id?: string | null;

    @Field(() => String, { nullable: true })
    campaign_id?: string | null;

    @Field(() => String, { nullable: true })
    html_content?: string | null;

    @Field(() => String, { nullable: true })
    format_type?: string | null;

    @Field(() => String, { nullable: true })
    segment_ids?: string | null;

    @Field(() => String, { nullable: true })
    campaign_activity_id: string | null;

    @Field(() => String, { nullable: true })
    subject?: string | null;

    @Field(() => String, { nullable: true })
    from_name?: string | null;

    @Field(() => String, { nullable: true })
    from_email?: string | null;

    @Field(() => String, { nullable: true })
    preheader?: string | null;

    @Field(() => String, { nullable: true })
    physical_address_in_footer?: string | null;

    @Field(() => String, { nullable: true })
    reply_to_email?: string | null;

    @Field(() => String, { nullable: true })
    document_properties?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Email Campaign Activities
//****************************************************************************
@ObjectType()
export class RunconstantcontactemailcampaignactivitiesViewResult {
    @Field(() => [constantcontactemailcampaignactivities_])
    Results: constantcontactemailcampaignactivities_[];

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

@Resolver(constantcontactemailcampaignactivities_)
export class constantcontactemailcampaignactivitiesResolver extends ResolverBase {
    @Query(() => RunconstantcontactemailcampaignactivitiesViewResult)
    async RunconstantcontactemailcampaignactivitiesViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailcampaignactivitiesViewResult)
    async RunconstantcontactemailcampaignactivitiesViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailcampaignactivitiesViewResult)
    async RunconstantcontactemailcampaignactivitiesDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Campaign Activities';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactemailcampaignactivities_, { nullable: true })
    async constantcontactemailcampaignactivities(@Arg('campaign_activity_id', () => String) campaign_activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactemailcampaignactivities_ | null> {
        this.CheckUserReadPermissions('Email Campaign Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_campaign_activities')} WHERE ${provider.QuoteIdentifier('campaign_activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Campaign Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [campaign_activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Campaign Activities', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [constantcontactemailcampaignactivitypreviews_])
    async constantcontactEmailCampaignActivityPreviews_campaign_activity_idArray(@Root() constantcontactemailcampaignactivities_: constantcontactemailcampaignactivities_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Campaign Activity Previews', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_campaign_activity_previews')} WHERE ${provider.QuoteIdentifier('campaign_activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Campaign Activity Previews', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemailcampaignactivities_.campaign_activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Campaign Activity Previews', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactemailsxrefs_])
    async constantcontactEmailsXrefs_campaign_activity_idArray(@Root() constantcontactemailcampaignactivities_: constantcontactemailcampaignactivities_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Emails Xrefs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmails_xrefs')} WHERE ${provider.QuoteIdentifier('campaign_activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Emails Xrefs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemailcampaignactivities_.campaign_activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Emails Xrefs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactcontactreportsactivitysummary_])
    async constantcontactContactReportsActivitySummaries_campaign_activity_idArray(@Root() constantcontactemailcampaignactivities_: constantcontactemailcampaignactivities_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Contact Reports Activity Summaries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwContact_reports_activity_summaries')} WHERE ${provider.QuoteIdentifier('campaign_activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Contact Reports Activity Summaries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemailcampaignactivities_.campaign_activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Contact Reports Activity Summaries', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => constantcontactemailcampaignactivities_)
    async Createconstantcontactemailcampaignactivities(
        @Arg('input', () => CreateconstantcontactemailcampaignactivitiesInput) input: CreateconstantcontactemailcampaignactivitiesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Campaign Activities', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactemailcampaignactivities_)
    async Updateconstantcontactemailcampaignactivities(
        @Arg('input', () => UpdateconstantcontactemailcampaignactivitiesInput) input: UpdateconstantcontactemailcampaignactivitiesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Campaign Activities', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactemailcampaignactivities_)
    async Deleteconstantcontactemailcampaignactivities(@Arg('campaign_activity_id', () => String) campaign_activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'campaign_activity_id', Value: campaign_activity_id}]);
        return this.DeleteRecord('Email Campaign Activities', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Campaign Activity Non Opener Resends
//****************************************************************************
@ObjectType({ description: `GET Details for a Resend to Non-openers Campaign Activity` })
export class constantcontactemailcampaignactivitynonopenerresends_ {
    @Field(() => String, {nullable: true, description: `The subject line used when resending the email campaign activity.`}) 
    @MaxLength(255)
    resend_subject?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated date and time (in ISO-8601 format) that the email campaign activity was resent to non-openers (only included in the response results for sent resend activities).`}) 
    resend_date?: string;
        
    @Field(() => String, {nullable: true, description: `The number of days to wait before Constant Contact resends the email. Valid values include 1 to 10 days. This value is only returned in the response results if the resend activity was created with delay_days or the delay_minutes equal to an exact day value.`}) 
    @MaxLength(255)
    delay_days?: string;
        
    @Field(() => String, {nullable: true, description: `The number of minutes to wait before Constant Contact resends the email. There are 1,440 minutes in a day. Valid values includes a minimum of 720 (12 hours) and a maximum of 14,400 minutes (10 days). This property is mutually exclusive with delay_days.`}) 
    @MaxLength(255)
    delay_minutes?: string;
        
    @Field(() => String, {nullable: true, description: `For scheduled or sent resend to non-opener emails, the system generates an ID that identifies the resend to non-openers activity. For draft email campaign resend activities, the system returns DRAFT.`}) 
    @MaxLength(255)
    resend_request_id?: string;
        
    @Field(() => String, {nullable: true, description: `The status of the resend to non-openers campaign activity. The resend_status is only returned in the response results if the campaign activity is either scheduled to be sent or was already sent.`}) 
    @MaxLength(255)
    resend_status?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Email Campaign Activity Non Opener Resends
//****************************************************************************
@InputType()
export class CreateconstantcontactemailcampaignactivitynonopenerresendsInput {
    @Field(() => String, { nullable: true })
    resend_subject: string | null;

    @Field(() => String, { nullable: true })
    resend_date: string | null;

    @Field(() => String, { nullable: true })
    delay_days: string | null;

    @Field(() => String, { nullable: true })
    delay_minutes: string | null;

    @Field(() => String, { nullable: true })
    resend_request_id?: string | null;

    @Field(() => String, { nullable: true })
    resend_status: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Email Campaign Activity Non Opener Resends
//****************************************************************************
@InputType()
export class UpdateconstantcontactemailcampaignactivitynonopenerresendsInput {
    @Field(() => String, { nullable: true })
    resend_subject?: string | null;

    @Field(() => String, { nullable: true })
    resend_date?: string | null;

    @Field(() => String, { nullable: true })
    delay_days?: string | null;

    @Field(() => String, { nullable: true })
    delay_minutes?: string | null;

    @Field(() => String, { nullable: true })
    resend_request_id: string | null;

    @Field(() => String, { nullable: true })
    resend_status?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Email Campaign Activity Non Opener Resends
//****************************************************************************
@ObjectType()
export class RunconstantcontactemailcampaignactivitynonopenerresendsViewResult {
    @Field(() => [constantcontactemailcampaignactivitynonopenerresends_])
    Results: constantcontactemailcampaignactivitynonopenerresends_[];

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

@Resolver(constantcontactemailcampaignactivitynonopenerresends_)
export class constantcontactemailcampaignactivitynonopenerresendsResolver extends ResolverBase {
    @Query(() => RunconstantcontactemailcampaignactivitynonopenerresendsViewResult)
    async RunconstantcontactemailcampaignactivitynonopenerresendsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailcampaignactivitynonopenerresendsViewResult)
    async RunconstantcontactemailcampaignactivitynonopenerresendsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailcampaignactivitynonopenerresendsViewResult)
    async RunconstantcontactemailcampaignactivitynonopenerresendsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Campaign Activity Non Opener Resends';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactemailcampaignactivitynonopenerresends_, { nullable: true })
    async constantcontactemailcampaignactivitynonopenerresends(@Arg('resend_request_id', () => String) resend_request_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactemailcampaignactivitynonopenerresends_ | null> {
        this.CheckUserReadPermissions('Email Campaign Activity Non Opener Resends', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_campaign_activity_non_opener_resends')} WHERE ${provider.QuoteIdentifier('resend_request_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Campaign Activity Non Opener Resends', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [resend_request_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Campaign Activity Non Opener Resends', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactemailcampaignactivitynonopenerresends_)
    async Createconstantcontactemailcampaignactivitynonopenerresends(
        @Arg('input', () => CreateconstantcontactemailcampaignactivitynonopenerresendsInput) input: CreateconstantcontactemailcampaignactivitynonopenerresendsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Campaign Activity Non Opener Resends', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactemailcampaignactivitynonopenerresends_)
    async Updateconstantcontactemailcampaignactivitynonopenerresends(
        @Arg('input', () => UpdateconstantcontactemailcampaignactivitynonopenerresendsInput) input: UpdateconstantcontactemailcampaignactivitynonopenerresendsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Campaign Activity Non Opener Resends', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactemailcampaignactivitynonopenerresends_)
    async Deleteconstantcontactemailcampaignactivitynonopenerresends(@Arg('resend_request_id', () => String) resend_request_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'resend_request_id', Value: resend_request_id}]);
        return this.DeleteRecord('Email Campaign Activity Non Opener Resends', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Campaign Activity Previews
//****************************************************************************
@ObjectType({ description: `GET the HTML Preview of an Email Campaign Activity` })
export class constantcontactemailcampaignactivitypreviews_ {
    @Field(() => String, {nullable: true, description: `The unique ID for an email campaign activity.`}) 
    @MaxLength(255)
    campaign_activity_id?: string;
        
    @Field(() => String, {nullable: true, description: `The email "Reply To Email" field for the email campaign activity.`}) 
    @MaxLength(255)
    reply_to_email?: string;
        
    @Field(() => String, {nullable: true, description: `A plain text preview of the email campaign activity.`}) 
    @MaxLength(255)
    preview_text_content?: string;
        
    @Field(() => String, {nullable: true, description: `The email "Subject" field for the email campaign activity.`}) 
    @MaxLength(255)
    subject?: string;
        
    @Field(() => String, {nullable: true, description: `An HTML preview of the email campaign activity.`}) 
    @MaxLength(255)
    preview_html_content?: string;
        
    @Field(() => String, {nullable: true, description: `The "from name" email header for the email campaign activity.`}) 
    @MaxLength(255)
    from_name?: string;
        
    @Field(() => String, {nullable: true, description: `The email preheader for the email campaign activity. Only format_type 3, 4, and 5 email campaign activities use the preheader property.`}) 
    @MaxLength(255)
    preheader?: string;
        
    @Field(() => String, {nullable: true, description: `The "from email" email header for the email campaign activity.`}) 
    @MaxLength(255)
    from_email?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Email Campaign Activity Previews
//****************************************************************************
@InputType()
export class CreateconstantcontactemailcampaignactivitypreviewsInput {
    @Field(() => String, { nullable: true })
    campaign_activity_id?: string | null;

    @Field(() => String, { nullable: true })
    reply_to_email: string | null;

    @Field(() => String, { nullable: true })
    preview_text_content: string | null;

    @Field(() => String, { nullable: true })
    subject: string | null;

    @Field(() => String, { nullable: true })
    preview_html_content: string | null;

    @Field(() => String, { nullable: true })
    from_name: string | null;

    @Field(() => String, { nullable: true })
    preheader: string | null;

    @Field(() => String, { nullable: true })
    from_email: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Email Campaign Activity Previews
//****************************************************************************
@InputType()
export class UpdateconstantcontactemailcampaignactivitypreviewsInput {
    @Field(() => String, { nullable: true })
    campaign_activity_id: string | null;

    @Field(() => String, { nullable: true })
    reply_to_email?: string | null;

    @Field(() => String, { nullable: true })
    preview_text_content?: string | null;

    @Field(() => String, { nullable: true })
    subject?: string | null;

    @Field(() => String, { nullable: true })
    preview_html_content?: string | null;

    @Field(() => String, { nullable: true })
    from_name?: string | null;

    @Field(() => String, { nullable: true })
    preheader?: string | null;

    @Field(() => String, { nullable: true })
    from_email?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Email Campaign Activity Previews
//****************************************************************************
@ObjectType()
export class RunconstantcontactemailcampaignactivitypreviewsViewResult {
    @Field(() => [constantcontactemailcampaignactivitypreviews_])
    Results: constantcontactemailcampaignactivitypreviews_[];

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

@Resolver(constantcontactemailcampaignactivitypreviews_)
export class constantcontactemailcampaignactivitypreviewsResolver extends ResolverBase {
    @Query(() => RunconstantcontactemailcampaignactivitypreviewsViewResult)
    async RunconstantcontactemailcampaignactivitypreviewsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailcampaignactivitypreviewsViewResult)
    async RunconstantcontactemailcampaignactivitypreviewsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailcampaignactivitypreviewsViewResult)
    async RunconstantcontactemailcampaignactivitypreviewsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Campaign Activity Previews';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactemailcampaignactivitypreviews_, { nullable: true })
    async constantcontactemailcampaignactivitypreviews(@Arg('campaign_activity_id', () => String) campaign_activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactemailcampaignactivitypreviews_ | null> {
        this.CheckUserReadPermissions('Email Campaign Activity Previews', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_campaign_activity_previews')} WHERE ${provider.QuoteIdentifier('campaign_activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Campaign Activity Previews', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [campaign_activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Campaign Activity Previews', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactemailcampaignactivitypreviews_)
    async Createconstantcontactemailcampaignactivitypreviews(
        @Arg('input', () => CreateconstantcontactemailcampaignactivitypreviewsInput) input: CreateconstantcontactemailcampaignactivitypreviewsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Campaign Activity Previews', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactemailcampaignactivitypreviews_)
    async Updateconstantcontactemailcampaignactivitypreviews(
        @Arg('input', () => UpdateconstantcontactemailcampaignactivitypreviewsInput) input: UpdateconstantcontactemailcampaignactivitypreviewsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Campaign Activity Previews', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactemailcampaignactivitypreviews_)
    async Deleteconstantcontactemailcampaignactivitypreviews(@Arg('campaign_activity_id', () => String) campaign_activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'campaign_activity_id', Value: campaign_activity_id}]);
        return this.DeleteRecord('Email Campaign Activity Previews', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Campaign Activity Send Histories
//****************************************************************************
@ObjectType({ description: `GET the Send History of an Email Campaign Activity` })
export class constantcontactemailcampaignactivitysendhistory_ {
    @Field(() => String, {nullable: true, description: `The send status for the email campaign activity. Valid values are:  
  COMPLETED: Constant Contact successfully sent the email campaign activity.
  ERRORED: Constant Contact encountered an error when sending the email campaign activity.`}) 
    @MaxLength(255)
    send_status?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated date and time that Constant Contact sent the email campaign activity to contacts in ISO-8601 format.`}) 
    run_date?: string;
        
    @Field(() => String, {nullable: true, description: `The reason why the send attempt completed or encountered an error. This method returns 0 if Constant Contact successfully sent the email campaign activity to contacts. Possible reason_code values are: 
      0 — Constant Contact successfully sent the email to contacts.
      1 — An error occurred when sending this email. Try scheduling it again, or contact Customer Support.
      2 — We were unable to send the email. Please contact our Account Review Team for more information.
      3 `}) 
    @MaxLength(255)
    reason_code?: string;
        
    @Field(() => String, {nullable: true, description: `The contacts lists that Constant Contact sent email campaign activity to as an array of contact list_id strings.`}) 
    contact_list_ids?: string;
        
    @Field(() => String, {nullable: true, description: `Uniquely identifies each send history object using the number of times that you sent the email campaign activity as a sequence starting at 1. For example, when you send a specific email campaign activity twice this method returns an object with a send_id of 1 for the first send and an object with a send_id of 2 for the second send.`}) 
    @MaxLength(255)
    send_id?: string;
        
    @Field(() => String, {nullable: true, description: `The number of contacts that Constant Contact sent this email campaign activity to. This property is specific to each send history object. When you resend an email campaign activity, Constant Contact only sends it to new contacts in the contact lists or segments you are using.`}) 
    @MaxLength(255)
    count?: string;
        
    @Field(() => String, {nullable: true, description: `The contact segments that Constant Contact sent the email campaign activity to as an array of segment_id integers.`}) 
    segment_ids?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Email Campaign Activity Send Histories
//****************************************************************************
@InputType()
export class CreateconstantcontactemailcampaignactivitysendhistoryInput {
    @Field(() => String, { nullable: true })
    send_status: string | null;

    @Field(() => String, { nullable: true })
    run_date: string | null;

    @Field(() => String, { nullable: true })
    reason_code: string | null;

    @Field(() => String, { nullable: true })
    contact_list_ids: string | null;

    @Field(() => String, { nullable: true })
    send_id?: string | null;

    @Field(() => String, { nullable: true })
    count: string | null;

    @Field(() => String, { nullable: true })
    segment_ids: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Email Campaign Activity Send Histories
//****************************************************************************
@InputType()
export class UpdateconstantcontactemailcampaignactivitysendhistoryInput {
    @Field(() => String, { nullable: true })
    send_status?: string | null;

    @Field(() => String, { nullable: true })
    run_date?: string | null;

    @Field(() => String, { nullable: true })
    reason_code?: string | null;

    @Field(() => String, { nullable: true })
    contact_list_ids?: string | null;

    @Field(() => String, { nullable: true })
    send_id: string | null;

    @Field(() => String, { nullable: true })
    count?: string | null;

    @Field(() => String, { nullable: true })
    segment_ids?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Email Campaign Activity Send Histories
//****************************************************************************
@ObjectType()
export class RunconstantcontactemailcampaignactivitysendhistoryViewResult {
    @Field(() => [constantcontactemailcampaignactivitysendhistory_])
    Results: constantcontactemailcampaignactivitysendhistory_[];

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

@Resolver(constantcontactemailcampaignactivitysendhistory_)
export class constantcontactemailcampaignactivitysendhistoryResolver extends ResolverBase {
    @Query(() => RunconstantcontactemailcampaignactivitysendhistoryViewResult)
    async RunconstantcontactemailcampaignactivitysendhistoryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailcampaignactivitysendhistoryViewResult)
    async RunconstantcontactemailcampaignactivitysendhistoryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailcampaignactivitysendhistoryViewResult)
    async RunconstantcontactemailcampaignactivitysendhistoryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Campaign Activity Send Histories';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactemailcampaignactivitysendhistory_, { nullable: true })
    async constantcontactemailcampaignactivitysendhistory(@Arg('send_id', () => String) send_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactemailcampaignactivitysendhistory_ | null> {
        this.CheckUserReadPermissions('Email Campaign Activity Send Histories', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_campaign_activity_send_histories')} WHERE ${provider.QuoteIdentifier('send_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Campaign Activity Send Histories', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [send_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Campaign Activity Send Histories', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactemailcampaignactivitysendhistory_)
    async Createconstantcontactemailcampaignactivitysendhistory(
        @Arg('input', () => CreateconstantcontactemailcampaignactivitysendhistoryInput) input: CreateconstantcontactemailcampaignactivitysendhistoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Campaign Activity Send Histories', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactemailcampaignactivitysendhistory_)
    async Updateconstantcontactemailcampaignactivitysendhistory(
        @Arg('input', () => UpdateconstantcontactemailcampaignactivitysendhistoryInput) input: UpdateconstantcontactemailcampaignactivitysendhistoryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Campaign Activity Send Histories', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactemailcampaignactivitysendhistory_)
    async Deleteconstantcontactemailcampaignactivitysendhistory(@Arg('send_id', () => String) send_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'send_id', Value: send_id}]);
        return this.DeleteRecord('Email Campaign Activity Send Histories', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Reports Links
//****************************************************************************
@ObjectType({ description: `GET an Email Links Report` })
export class constantcontactemailreportslinks_ {
    @Field(() => String, {nullable: true, description: `The ID for a unique link URL in an email campaign activity.`}) 
    @MaxLength(255)
    url_id?: string;
        
    @Field(() => String, {nullable: true, description: `The URL of a link in an email campaign activity. This URL is not normalized and appears the same as the URL in the email campaign activity.`}) 
    @MaxLength(255)
    link_url?: string;
        
    @Field(() => String, {nullable: true, description: `If the link uses the click segmentation feature, this property contains the action that contacts trigger when they click the link. Currently the only available action is add, which adds contacts that click the link to a contact list.`}) 
    @MaxLength(255)
    list_action?: string;
        
    @Field(() => String, {nullable: true, description: `The number of unique contacts that clicked the link.`}) 
    @MaxLength(255)
    unique_clicks?: string;
        
    @Field(() => String, {nullable: true, description: `If the link uses the click segmentation feature, this property contains the contact list linked with the list_action property.`}) 
    @MaxLength(255)
    list_id?: string;
        
    @Field(() => String, {nullable: true, description: `Link tags are not currently available in email campaigns. By default, this method combines results for duplicate link URLs. Link tags will allow users to get a separate link click report for each unique link_tag value they use, even if URLs are not unique.`}) 
    @MaxLength(255)
    link_tag?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Email Reports Links
//****************************************************************************
@InputType()
export class CreateconstantcontactemailreportslinksInput {
    @Field(() => String, { nullable: true })
    url_id?: string | null;

    @Field(() => String, { nullable: true })
    link_url: string | null;

    @Field(() => String, { nullable: true })
    list_action: string | null;

    @Field(() => String, { nullable: true })
    unique_clicks: string | null;

    @Field(() => String, { nullable: true })
    list_id: string | null;

    @Field(() => String, { nullable: true })
    link_tag: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Email Reports Links
//****************************************************************************
@InputType()
export class UpdateconstantcontactemailreportslinksInput {
    @Field(() => String, { nullable: true })
    url_id: string | null;

    @Field(() => String, { nullable: true })
    link_url?: string | null;

    @Field(() => String, { nullable: true })
    list_action?: string | null;

    @Field(() => String, { nullable: true })
    unique_clicks?: string | null;

    @Field(() => String, { nullable: true })
    list_id?: string | null;

    @Field(() => String, { nullable: true })
    link_tag?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Email Reports Links
//****************************************************************************
@ObjectType()
export class RunconstantcontactemailreportslinksViewResult {
    @Field(() => [constantcontactemailreportslinks_])
    Results: constantcontactemailreportslinks_[];

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

@Resolver(constantcontactemailreportslinks_)
export class constantcontactemailreportslinksResolver extends ResolverBase {
    @Query(() => RunconstantcontactemailreportslinksViewResult)
    async RunconstantcontactemailreportslinksViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailreportslinksViewResult)
    async RunconstantcontactemailreportslinksViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailreportslinksViewResult)
    async RunconstantcontactemailreportslinksDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Reports Links';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactemailreportslinks_, { nullable: true })
    async constantcontactemailreportslinks(@Arg('url_id', () => String) url_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactemailreportslinks_ | null> {
        this.CheckUserReadPermissions('Email Reports Links', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_reports_links')} WHERE ${provider.QuoteIdentifier('url_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Reports Links', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [url_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Reports Links', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactemailreportslinks_)
    async Createconstantcontactemailreportslinks(
        @Arg('input', () => CreateconstantcontactemailreportslinksInput) input: CreateconstantcontactemailreportslinksInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Reports Links', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactemailreportslinks_)
    async Updateconstantcontactemailreportslinks(
        @Arg('input', () => UpdateconstantcontactemailreportslinksInput) input: UpdateconstantcontactemailreportslinksInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Reports Links', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactemailreportslinks_)
    async Deleteconstantcontactemailreportslinks(@Arg('url_id', () => String) url_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'url_id', Value: url_id}]);
        return this.DeleteRecord('Email Reports Links', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Email Reports Summaries
//****************************************************************************
@ObjectType({ description: `GET an Email Campaigns Summary Report` })
export class constantcontactemailreportssummary_ {
    @Field(() => String, {nullable: true, description: `The total number of times each unique contact interacted with a tracked email campaign activity.`}) 
    unique_counts?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies the email campaign type.`}) 
    @MaxLength(812)
    campaign_type?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The ID that uniquely identifies an email campaign.`}) 
    @MaxLength(450)
    campaign_id?: string;
        
    @Field(() => String, {nullable: true, description: `The date and time that the email campaign was last sent.`}) 
    last_sent_date?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Email Reports Summaries
//****************************************************************************
@InputType()
export class CreateconstantcontactemailreportssummaryInput {
    @Field(() => String, { nullable: true })
    unique_counts: string | null;

    @Field(() => String, { nullable: true })
    campaign_type: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    campaign_id?: string | null;

    @Field(() => String, { nullable: true })
    last_sent_date: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Email Reports Summaries
//****************************************************************************
@InputType()
export class UpdateconstantcontactemailreportssummaryInput {
    @Field(() => String, { nullable: true })
    unique_counts?: string | null;

    @Field(() => String, { nullable: true })
    campaign_type?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    campaign_id: string | null;

    @Field(() => String, { nullable: true })
    last_sent_date?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Email Reports Summaries
//****************************************************************************
@ObjectType()
export class RunconstantcontactemailreportssummaryViewResult {
    @Field(() => [constantcontactemailreportssummary_])
    Results: constantcontactemailreportssummary_[];

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

@Resolver(constantcontactemailreportssummary_)
export class constantcontactemailreportssummaryResolver extends ResolverBase {
    @Query(() => RunconstantcontactemailreportssummaryViewResult)
    async RunconstantcontactemailreportssummaryViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailreportssummaryViewResult)
    async RunconstantcontactemailreportssummaryViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailreportssummaryViewResult)
    async RunconstantcontactemailreportssummaryDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Email Reports Summaries';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactemailreportssummary_, { nullable: true })
    async constantcontactemailreportssummary(@Arg('campaign_id', () => String) campaign_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactemailreportssummary_ | null> {
        this.CheckUserReadPermissions('Email Reports Summaries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_reports_summaries')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Reports Summaries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Email Reports Summaries', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactemailreportssummary_)
    async Createconstantcontactemailreportssummary(
        @Arg('input', () => CreateconstantcontactemailreportssummaryInput) input: CreateconstantcontactemailreportssummaryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Email Reports Summaries', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactemailreportssummary_)
    async Updateconstantcontactemailreportssummary(
        @Arg('input', () => UpdateconstantcontactemailreportssummaryInput) input: UpdateconstantcontactemailreportssummaryInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Email Reports Summaries', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactemailreportssummary_)
    async Deleteconstantcontactemailreportssummary(@Arg('campaign_id', () => String) campaign_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'campaign_id', Value: campaign_id}]);
        return this.DeleteRecord('Email Reports Summaries', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Emails
//****************************************************************************
@ObjectType({ description: `GET a Collection of Email Campaigns` })
export class constantcontactemails_ {
    @Field(() => String, {nullable: true, description: `Identifies the type of campaign that you select when creating the campaign. Newsletter and Custom Code email campaigns are the primary types.`}) 
    @MaxLength(812)
    type?: string;
        
    @Field(() => String, {nullable: true, description: `The code used to identify the email campaign \`type\`. 
   1  (Default) 
   2  (Bulk Email) 
   10 (Newsletter) 
   11 (Announcement) 
   12 (Product/Service News) 
   14 (Business Letter) 
   15 (Card) 
   16 (Press release)
   17 (Flyer) 
   18 (Feedback Request) 
   19 (Ratings and Reviews) 
   20 (Event Announcement) 
   21 (Simple Coupon) 
   22 (Sale Promotion) 
   23 (Product Promotion) 
   24 (Membership Drive) 
   25 (Fundraiser) 
   26 (Custom Code Email)
   57 (A/B Test)`}) 
    type_code?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The current status of the email campaign. Valid values are: 
  Draft — An email campaign that you have created but have not sent to contacts.
  Scheduled — An email campaign that you have scheduled for Constant Contact to send to contacts.
  Executing — An email campaign that Constant Contact is currently sending to contacts. Email campaign activities are only in this status briefly.
  Done — An email campaign that you successfully sent to contacts.
  Error — An email campaign activity`}) 
    @MaxLength(812)
    current_status?: string;
        
    @Field(() => String, {nullable: true, description: `Lists the role and unique activity ID of each campaign activity that is associated with an Email Campaign.`}) 
    campaign_activities?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated date and time showing when the campaign was last updated. This string is read only and is in ISO-8601 format.`}) 
    updated_at?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated date and time that this email campaign was created. This string is readonly and is in ISO-8601 format.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `The unique ID used to identify the email campaign (UUID format).`}) 
    @MaxLength(450)
    campaign_id?: string;
        
    @Field(() => String, {nullable: true, description: `The descriptive name the user provides to identify this campaign. Campaign names must be unique for each account ID.`}) 
    @MaxLength(812)
    name?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
    @Field(() => [constantcontactemailreportssummary_])
    constantcontactEmailReportsSummaries_campaign_idArray: constantcontactemailreportssummary_[]; // Link to constantcontactEmailReportsSummaries
    
    @Field(() => [constantcontactemailsxrefs_])
    constantcontactEmailsXrefs_campaign_idArray: constantcontactemailsxrefs_[]; // Link to constantcontactEmailsXrefs
    
    @Field(() => [constantcontacteventscopy_])
    constantcontactEventsCopies_campaign_idArray: constantcontacteventscopy_[]; // Link to constantcontactEventsCopies
    
    @Field(() => [constantcontactsocialposts_])
    constantcontactSocialPosts_campaign_idArray: constantcontactsocialposts_[]; // Link to constantcontactSocialPosts
    
    @Field(() => [constantcontactevents_])
    constantcontactEvents_campaign_idArray: constantcontactevents_[]; // Link to constantcontactEvents
    
    @Field(() => [constantcontactemailcampaignactivities_])
    constantcontactEmailCampaignActivities_campaign_idArray: constantcontactemailcampaignactivities_[]; // Link to constantcontactEmailCampaignActivities
    
}

//****************************************************************************
// INPUT TYPE for Emails
//****************************************************************************
@InputType()
export class CreateconstantcontactemailsInput {
    @Field(() => String, { nullable: true })
    type: string | null;

    @Field(() => String, { nullable: true })
    type_code: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    current_status: string | null;

    @Field(() => String, { nullable: true })
    campaign_activities: string | null;

    @Field(() => String, { nullable: true })
    updated_at: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    campaign_id?: string | null;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Emails
//****************************************************************************
@InputType()
export class UpdateconstantcontactemailsInput {
    @Field(() => String, { nullable: true })
    type?: string | null;

    @Field(() => String, { nullable: true })
    type_code?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    current_status?: string | null;

    @Field(() => String, { nullable: true })
    campaign_activities?: string | null;

    @Field(() => String, { nullable: true })
    updated_at?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    campaign_id: string | null;

    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Emails
//****************************************************************************
@ObjectType()
export class RunconstantcontactemailsViewResult {
    @Field(() => [constantcontactemails_])
    Results: constantcontactemails_[];

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

@Resolver(constantcontactemails_)
export class constantcontactemailsResolver extends ResolverBase {
    @Query(() => RunconstantcontactemailsViewResult)
    async RunconstantcontactemailsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailsViewResult)
    async RunconstantcontactemailsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailsViewResult)
    async RunconstantcontactemailsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Emails';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactemails_, { nullable: true })
    async constantcontactemails(@Arg('campaign_id', () => String) campaign_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactemails_ | null> {
        this.CheckUserReadPermissions('Emails', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmails')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Emails', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Emails', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [constantcontactemailreportssummary_])
    async constantcontactEmailReportsSummaries_campaign_idArray(@Root() constantcontactemails_: constantcontactemails_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Reports Summaries', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_reports_summaries')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Reports Summaries', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemails_.campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Reports Summaries', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactemailsxrefs_])
    async constantcontactEmailsXrefs_campaign_idArray(@Root() constantcontactemails_: constantcontactemails_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Emails Xrefs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmails_xrefs')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Emails Xrefs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemails_.campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Emails Xrefs', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontacteventscopy_])
    async constantcontactEventsCopies_campaign_idArray(@Root() constantcontactemails_: constantcontactemails_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Events Copies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEvents_copies')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Events Copies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemails_.campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Events Copies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactsocialposts_])
    async constantcontactSocialPosts_campaign_idArray(@Root() constantcontactemails_: constantcontactemails_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Social Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwSocial_posts')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Social Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemails_.campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Social Posts', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactevents_])
    async constantcontactEvents_campaign_idArray(@Root() constantcontactemails_: constantcontactemails_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEvents')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemails_.campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Events', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @FieldResolver(() => [constantcontactemailcampaignactivities_])
    async constantcontactEmailCampaignActivities_campaign_idArray(@Root() constantcontactemails_: constantcontactemails_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Email Campaign Activities', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmail_campaign_activities')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Email Campaign Activities', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactemails_.campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Email Campaign Activities', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => constantcontactemails_)
    async Createconstantcontactemails(
        @Arg('input', () => CreateconstantcontactemailsInput) input: CreateconstantcontactemailsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Emails', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactemails_)
    async Updateconstantcontactemails(
        @Arg('input', () => UpdateconstantcontactemailsInput) input: UpdateconstantcontactemailsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Emails', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactemails_)
    async Deleteconstantcontactemails(@Arg('campaign_id', () => String) campaign_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'campaign_id', Value: campaign_id}]);
        return this.DeleteRecord('Emails', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Emails Xrefs
//****************************************************************************
@ObjectType({ description: `GET a Collection of V2 and V3 API Email Campaign Identifiers` })
export class constantcontactemailsxrefs_ {
    @Field(() => String, {nullable: true, description: `Identifies an email campaign in the V2 API.`}) 
    @MaxLength(812)
    v2_email_campaign_id?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies a campaign in the V3 API. In the V3 API, each campaign contains one or more activities. For more information, see V3 Email Campaign Resource Changes.`}) 
    @MaxLength(812)
    campaign_id?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies a campaign activity in the V3 API. In the V3 API, each campaign contains one or more activities. Email type activities represent the detailed information in an email and contain properties like from_email and from_name. For more information, see V3 Campaign Resource Changes.`}) 
    @MaxLength(450)
    campaign_activity_id?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Emails Xrefs
//****************************************************************************
@InputType()
export class CreateconstantcontactemailsxrefsInput {
    @Field(() => String, { nullable: true })
    v2_email_campaign_id: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    campaign_id: string | null;

    @Field(() => String, { nullable: true })
    campaign_activity_id?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Emails Xrefs
//****************************************************************************
@InputType()
export class UpdateconstantcontactemailsxrefsInput {
    @Field(() => String, { nullable: true })
    v2_email_campaign_id?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    campaign_id?: string | null;

    @Field(() => String, { nullable: true })
    campaign_activity_id: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Emails Xrefs
//****************************************************************************
@ObjectType()
export class RunconstantcontactemailsxrefsViewResult {
    @Field(() => [constantcontactemailsxrefs_])
    Results: constantcontactemailsxrefs_[];

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

@Resolver(constantcontactemailsxrefs_)
export class constantcontactemailsxrefsResolver extends ResolverBase {
    @Query(() => RunconstantcontactemailsxrefsViewResult)
    async RunconstantcontactemailsxrefsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailsxrefsViewResult)
    async RunconstantcontactemailsxrefsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactemailsxrefsViewResult)
    async RunconstantcontactemailsxrefsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Emails Xrefs';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactemailsxrefs_, { nullable: true })
    async constantcontactemailsxrefs(@Arg('campaign_activity_id', () => String) campaign_activity_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactemailsxrefs_ | null> {
        this.CheckUserReadPermissions('Emails Xrefs', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEmails_xrefs')} WHERE ${provider.QuoteIdentifier('campaign_activity_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Emails Xrefs', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [campaign_activity_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Emails Xrefs', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactemailsxrefs_)
    async Createconstantcontactemailsxrefs(
        @Arg('input', () => CreateconstantcontactemailsxrefsInput) input: CreateconstantcontactemailsxrefsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Emails Xrefs', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactemailsxrefs_)
    async Updateconstantcontactemailsxrefs(
        @Arg('input', () => UpdateconstantcontactemailsxrefsInput) input: UpdateconstantcontactemailsxrefsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Emails Xrefs', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactemailsxrefs_)
    async Deleteconstantcontactemailsxrefs(@Arg('campaign_activity_id', () => String) campaign_activity_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'campaign_activity_id', Value: campaign_activity_id}]);
        return this.DeleteRecord('Emails Xrefs', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Events
//****************************************************************************
@ObjectType({ description: `GET a collection of events.` })
export class constantcontactevents_ {
    @Field(() => String, {nullable: true, description: `Display or hide the event end time on the registration form and registration confirmation message.`}) 
    display_end_time_flag?: string;
        
    @Field(() => String, {nullable: true, description: `The system assigned ID that uniquely identifies the event and is identical to the \`event_id\`.`}) 
    @MaxLength(812)
    campaign_id?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The date the event starts.`}) 
    @MaxLength(812)
    event_start?: string;
        
    @Field(() => String, {nullable: true, description: `The event registration URL.`}) 
    @MaxLength(812)
    registration_url?: string;
        
    @Field(() => String, {nullable: true, description: `Display or hide event contact information on the registration form and registration confirmation message.`}) 
    display_contact_flag?: string;
        
    @Field(() => String, {nullable: true, description: `The online meeting information for a virtual event.`}) 
    online_meeting?: string;
        
    @Field(() => String, {nullable: true, description: `The ID that uniquely identifies the event.`}) 
    @MaxLength(450)
    event_id?: string;
        
    @Field(() => String, {nullable: true, description: `Display the event on the Event Calendar.`}) 
    display_on_calendar_flag?: string;
        
    @Field(() => String, {nullable: true, description: `Specifies if the event is physical and/or virtual, or to be determined.`}) 
    @MaxLength(812)
    location_type?: string;
        
    @Field(() => String, {nullable: true, description: `Event Settings (events).`}) 
    event_settings?: string;
        
    @Field(() => String, {nullable: true, description: `The short code to use for the event.`}) 
    @MaxLength(812)
    event_code?: string;
        
    @Field(() => String, {nullable: true, description: `The event calendar URL.`}) 
    @MaxLength(812)
    event_calendar_url?: string;
        
    @Field(() => String, {nullable: true, description: `List of event promotions.`}) 
    event_promotions?: string;
        
    @Field(() => String, {nullable: true, description: `The accepted currency for payments. Required for events collecting payments ['AUD','BRL','CAD','CHF','CZK','DKK','EUR','GBP','HKD','HUF','ILS','JPY','MXN','MYR','NOK','NZD','PHP','PLN','RUB','SEK','SGD','THB','TRY','TWD','USD']`}) 
    @MaxLength(812)
    currency_type?: string;
        
    @Field(() => String, {nullable: true, description: `Provides the event description.`}) 
    @MaxLength(900)
    description?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies the event type.`}) 
    @MaxLength(812)
    event_type?: string;
        
    @Field(() => String, {nullable: true, description: `The time the event was cancelled, in ISO format. Read-only.`}) 
    @MaxLength(812)
    cancelled_time?: string;
        
    @Field(() => String, {nullable: true, description: `The encrypted SOId.`}) 
    @MaxLength(812)
    eso?: string;
        
    @Field(() => String, {nullable: true, description: `The title for the event. The title does not have to be unique for an account.`}) 
    @MaxLength(812)
    title?: string;
        
    @Field(() => String, {nullable: true, description: `The abbreviation to use to indicate the time zone where the event takes place.`}) 
    @MaxLength(812)
    time_zone_abbreviation?: string;
        
    @Field(() => String, {nullable: true, description: `The contact information associated with the event.`}) 
    contact?: string;
        
    @Field(() => String, {nullable: true, description: `Default Track (events).`}) 
    default_track?: string;
        
    @Field(() => String, {nullable: true, description: `The time the event was published, in ISO format.`}) 
    @MaxLength(812)
    active_time?: string;
        
    @Field(() => String, {nullable: true, description: `The date and time the event was last modified.`}) 
    @MaxLength(812)
    last_update_time?: string;
        
    @Field(() => String, {nullable: true, description: `If \`true\`, sends an email to the event owner when a registration is made.`}) 
    notify_owner_on_reg?: string;
        
    @Field(() => String, {nullable: true, description: `The time the event was deleted, in ISO format. Read-only.`}) 
    @MaxLength(812)
    deleted_time?: string;
        
    @Field(() => String, {nullable: true, description: `The date the event ends.`}) 
    @MaxLength(812)
    event_end?: string;
        
    @Field(() => String, {nullable: true, description: `Includes additional event information.`}) 
    event_metadata?: string;
        
    @Field(() => String, {nullable: true, description: `The name of the event, has to be unique for the account.`}) 
    @MaxLength(812)
    name?: string;
        
    @Field(() => String, {nullable: true, description: `List of failed campaign activities.`}) 
    failed_campaign_activities?: string;
        
    @Field(() => String, {nullable: true, description: `Specifies the event's current status.`}) 
    @MaxLength(812)
    status?: string;
        
    @Field(() => String, {nullable: true, description: `The time zone where the event takes place.`}) 
    @MaxLength(812)
    time_zone?: string;
        
    @Field(() => String, {nullable: true, description: `The time the event was created, in ISO format. Read-only.`}) 
    @MaxLength(812)
    create_time?: string;
        
    @Field(() => String, {nullable: true, description: `Address (events).`}) 
    address?: string;
        
    @Field(() => String, {nullable: true, description: `The event widget URL.`}) 
    @MaxLength(812)
    event_widget_url?: string;
        
    @Field(() => String, {nullable: true, description: `Display the time zone on the registration form and registration confirmation message.`}) 
    display_time_zone_flag?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
    @Field(() => [constantcontacteventscopy_])
    constantcontactEventsCopies_event_idArray: constantcontacteventscopy_[]; // Link to constantcontactEventsCopies
    
}

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class CreateconstantcontacteventsInput {
    @Field(() => String, { nullable: true })
    display_end_time_flag: string | null;

    @Field(() => String, { nullable: true })
    campaign_id: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    event_start: string | null;

    @Field(() => String, { nullable: true })
    registration_url: string | null;

    @Field(() => String, { nullable: true })
    display_contact_flag: string | null;

    @Field(() => String, { nullable: true })
    online_meeting: string | null;

    @Field(() => String, { nullable: true })
    event_id?: string | null;

    @Field(() => String, { nullable: true })
    display_on_calendar_flag: string | null;

    @Field(() => String, { nullable: true })
    location_type: string | null;

    @Field(() => String, { nullable: true })
    event_settings: string | null;

    @Field(() => String, { nullable: true })
    event_code: string | null;

    @Field(() => String, { nullable: true })
    event_calendar_url: string | null;

    @Field(() => String, { nullable: true })
    event_promotions: string | null;

    @Field(() => String, { nullable: true })
    currency_type: string | null;

    @Field(() => String, { nullable: true })
    description: string | null;

    @Field(() => String, { nullable: true })
    event_type: string | null;

    @Field(() => String, { nullable: true })
    cancelled_time: string | null;

    @Field(() => String, { nullable: true })
    eso: string | null;

    @Field(() => String, { nullable: true })
    title: string | null;

    @Field(() => String, { nullable: true })
    time_zone_abbreviation: string | null;

    @Field(() => String, { nullable: true })
    contact: string | null;

    @Field(() => String, { nullable: true })
    default_track: string | null;

    @Field(() => String, { nullable: true })
    active_time: string | null;

    @Field(() => String, { nullable: true })
    last_update_time: string | null;

    @Field(() => String, { nullable: true })
    notify_owner_on_reg: string | null;

    @Field(() => String, { nullable: true })
    deleted_time: string | null;

    @Field(() => String, { nullable: true })
    event_end: string | null;

    @Field(() => String, { nullable: true })
    event_metadata: string | null;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    failed_campaign_activities: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    time_zone: string | null;

    @Field(() => String, { nullable: true })
    create_time: string | null;

    @Field(() => String, { nullable: true })
    address: string | null;

    @Field(() => String, { nullable: true })
    event_widget_url: string | null;

    @Field(() => String, { nullable: true })
    display_time_zone_flag: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Events
//****************************************************************************
@InputType()
export class UpdateconstantcontacteventsInput {
    @Field(() => String, { nullable: true })
    display_end_time_flag?: string | null;

    @Field(() => String, { nullable: true })
    campaign_id?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    event_start?: string | null;

    @Field(() => String, { nullable: true })
    registration_url?: string | null;

    @Field(() => String, { nullable: true })
    display_contact_flag?: string | null;

    @Field(() => String, { nullable: true })
    online_meeting?: string | null;

    @Field(() => String, { nullable: true })
    event_id: string | null;

    @Field(() => String, { nullable: true })
    display_on_calendar_flag?: string | null;

    @Field(() => String, { nullable: true })
    location_type?: string | null;

    @Field(() => String, { nullable: true })
    event_settings?: string | null;

    @Field(() => String, { nullable: true })
    event_code?: string | null;

    @Field(() => String, { nullable: true })
    event_calendar_url?: string | null;

    @Field(() => String, { nullable: true })
    event_promotions?: string | null;

    @Field(() => String, { nullable: true })
    currency_type?: string | null;

    @Field(() => String, { nullable: true })
    description?: string | null;

    @Field(() => String, { nullable: true })
    event_type?: string | null;

    @Field(() => String, { nullable: true })
    cancelled_time?: string | null;

    @Field(() => String, { nullable: true })
    eso?: string | null;

    @Field(() => String, { nullable: true })
    title?: string | null;

    @Field(() => String, { nullable: true })
    time_zone_abbreviation?: string | null;

    @Field(() => String, { nullable: true })
    contact?: string | null;

    @Field(() => String, { nullable: true })
    default_track?: string | null;

    @Field(() => String, { nullable: true })
    active_time?: string | null;

    @Field(() => String, { nullable: true })
    last_update_time?: string | null;

    @Field(() => String, { nullable: true })
    notify_owner_on_reg?: string | null;

    @Field(() => String, { nullable: true })
    deleted_time?: string | null;

    @Field(() => String, { nullable: true })
    event_end?: string | null;

    @Field(() => String, { nullable: true })
    event_metadata?: string | null;

    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    failed_campaign_activities?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    time_zone?: string | null;

    @Field(() => String, { nullable: true })
    create_time?: string | null;

    @Field(() => String, { nullable: true })
    address?: string | null;

    @Field(() => String, { nullable: true })
    event_widget_url?: string | null;

    @Field(() => String, { nullable: true })
    display_time_zone_flag?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Events
//****************************************************************************
@ObjectType()
export class RunconstantcontacteventsViewResult {
    @Field(() => [constantcontactevents_])
    Results: constantcontactevents_[];

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

@Resolver(constantcontactevents_)
export class constantcontacteventsResolver extends ResolverBase {
    @Query(() => RunconstantcontacteventsViewResult)
    async RunconstantcontacteventsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontacteventsViewResult)
    async RunconstantcontacteventsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontacteventsViewResult)
    async RunconstantcontacteventsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactevents_, { nullable: true })
    async constantcontactevents(@Arg('event_id', () => String) event_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactevents_ | null> {
        this.CheckUserReadPermissions('Events', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEvents')} WHERE ${provider.QuoteIdentifier('event_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Events', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [event_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Events', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @FieldResolver(() => [constantcontacteventscopy_])
    async constantcontactEventsCopies_event_idArray(@Root() constantcontactevents_: constantcontactevents_, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine) {
        this.CheckUserReadPermissions('Events Copies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEvents_copies')} WHERE ${provider.QuoteIdentifier('event_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Events Copies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [constantcontactevents_.event_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.ArrayMapFieldNamesToCodeNames('Events Copies', rows, this.GetUserFromPayload(userPayload));
        return result;
    }
        
    @Mutation(() => constantcontactevents_)
    async Createconstantcontactevents(
        @Arg('input', () => CreateconstantcontacteventsInput) input: CreateconstantcontacteventsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Events', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactevents_)
    async Updateconstantcontactevents(
        @Arg('input', () => UpdateconstantcontacteventsInput) input: UpdateconstantcontacteventsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Events', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactevents_)
    async Deleteconstantcontactevents(@Arg('event_id', () => String) event_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'event_id', Value: event_id}]);
        return this.DeleteRecord('Events', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Events Copies
//****************************************************************************
@ObjectType({ description: `POST (copy) an existing event.` })
export class constantcontacteventscopy_ {
    @Field(() => String, {nullable: true, description: `Specifies the event's current status.`}) 
    @MaxLength(255)
    status?: string;
        
    @Field(() => String, {nullable: true, description: `The date the event ends.`}) 
    @MaxLength(255)
    event_end?: string;
        
    @Field(() => String, {nullable: true, description: `Specifies if the event is physical and/or virtual, or to be determined.`}) 
    @MaxLength(255)
    location_type?: string;
        
    @Field(() => String, {nullable: true, description: `Display the event on the Event Calendar.`}) 
    display_on_calendar_flag?: string;
        
    @Field(() => String, {nullable: true, description: `The date and time the event was last modified.`}) 
    @MaxLength(255)
    last_update_time?: string;
        
    @Field(() => String, {nullable: true, description: `The contact information associated with the event.`}) 
    contact?: string;
        
    @Field(() => String, {nullable: true, description: `Display the time zone on the registration form and registration confirmation message.`}) 
    display_time_zone_flag?: string;
        
    @Field(() => String, {nullable: true, description: `The time zone where the event takes place.`}) 
    @MaxLength(255)
    time_zone?: string;
        
    @Field(() => String, {nullable: true, description: `The event widget URL.`}) 
    @MaxLength(255)
    event_widget_url?: string;
        
    @Field(() => String, {nullable: true, description: `Address (events_copy).`}) 
    address?: string;
        
    @Field(() => String, {nullable: true, description: `If \`true\`, sends an email to the event owner when a registration is made.`}) 
    notify_owner_on_reg?: string;
        
    @Field(() => String, {nullable: true, description: `Includes additional event information.`}) 
    event_metadata?: string;
        
    @Field(() => String, {nullable: true, description: `The date the event starts.`}) 
    @MaxLength(255)
    event_start?: string;
        
    @Field(() => String, {nullable: true, description: `Identifies the event type.`}) 
    @MaxLength(255)
    event_type?: string;
        
    @Field(() => String, {nullable: true, description: `The time the event was created, in ISO format. Read-only.`}) 
    @MaxLength(255)
    create_time?: string;
        
    @Field(() => String, {nullable: true, description: `The event calendar URL.`}) 
    @MaxLength(255)
    event_calendar_url?: string;
        
    @Field(() => String, {nullable: true, description: `The short code to use for the event.`}) 
    @MaxLength(255)
    event_code?: string;
        
    @Field(() => String, {nullable: true, description: `Default Track (events_copy).`}) 
    default_track?: string;
        
    @Field(() => String, {nullable: true, description: `The event registration URL.`}) 
    @MaxLength(255)
    registration_url?: string;
        
    @Field(() => String, {nullable: true, description: `Event Settings (events_copy).`}) 
    event_settings?: string;
        
    @Field(() => String, {nullable: true, description: `The name of the event, has to be unique for the account.`}) 
    @MaxLength(400)
    name?: string;
        
    @Field(() => String, {nullable: true, description: `The title for the event. The title does not have to be unique for an account.`}) 
    @MaxLength(400)
    title?: string;
        
    @Field(() => String, {nullable: true, description: `The online meeting information for a virtual event.`}) 
    online_meeting?: string;
        
    @Field(() => String, {nullable: true, description: `Provides the event description.`}) 
    @MaxLength(900)
    description?: string;
        
    @Field(() => String, {nullable: true, description: `The ID that uniquely identifies the event.`}) 
    @MaxLength(255)
    event_id?: string;
        
    @Field(() => String, {nullable: true, description: `The accepted currency for payments. Required for events collecting payments ['AUD','BRL','CAD','CHF','CZK','DKK','EUR','GBP','HKD','HUF','ILS','JPY','MXN','MYR','NOK','NZD','PHP','PLN','RUB','SEK','SGD','THB','TRY','TWD','USD']`}) 
    @MaxLength(255)
    currency_type?: string;
        
    @Field(() => String, {nullable: true, description: `List of failed campaign activities.`}) 
    failed_campaign_activities?: string;
        
    @Field(() => String, {nullable: true, description: `The time the event was deleted, in ISO format. Read-only.`}) 
    @MaxLength(255)
    deleted_time?: string;
        
    @Field(() => String, {nullable: true, description: `Display or hide event contact information on the registration form and registration confirmation message.`}) 
    display_contact_flag?: string;
        
    @Field(() => String, {nullable: true, description: `The time the event was published, in ISO format.`}) 
    @MaxLength(255)
    active_time?: string;
        
    @Field(() => String, {nullable: true, description: `The system assigned ID that uniquely identifies the event and is identical to the \`event_id\`.`}) 
    @MaxLength(255)
    campaign_id?: string;
        
    @Field(() => String, {nullable: true, description: `Display or hide the event end time on the registration form and registration confirmation message.`}) 
    display_end_time_flag?: string;
        
    @Field(() => String, {nullable: true, description: `List of event promotions.`}) 
    event_promotions?: string;
        
    @Field(() => String, {nullable: true, description: `The time the event was cancelled, in ISO format. Read-only.`}) 
    @MaxLength(255)
    cancelled_time?: string;
        
    @Field(() => String, {nullable: true, description: `The encrypted SOId.`}) 
    @MaxLength(255)
    eso?: string;
        
    @Field(() => String, {nullable: true, description: `The abbreviation to use to indicate the time zone where the event takes place.`}) 
    @MaxLength(255)
    time_zone_abbreviation?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Events Copies
//****************************************************************************
@InputType()
export class CreateconstantcontacteventscopyInput {
    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    event_end: string | null;

    @Field(() => String, { nullable: true })
    location_type: string | null;

    @Field(() => String, { nullable: true })
    display_on_calendar_flag: string | null;

    @Field(() => String, { nullable: true })
    last_update_time: string | null;

    @Field(() => String, { nullable: true })
    contact: string | null;

    @Field(() => String, { nullable: true })
    display_time_zone_flag: string | null;

    @Field(() => String, { nullable: true })
    time_zone: string | null;

    @Field(() => String, { nullable: true })
    event_widget_url: string | null;

    @Field(() => String, { nullable: true })
    address: string | null;

    @Field(() => String, { nullable: true })
    notify_owner_on_reg: string | null;

    @Field(() => String, { nullable: true })
    event_metadata: string | null;

    @Field(() => String, { nullable: true })
    event_start: string | null;

    @Field(() => String, { nullable: true })
    event_type: string | null;

    @Field(() => String, { nullable: true })
    create_time: string | null;

    @Field(() => String, { nullable: true })
    event_calendar_url: string | null;

    @Field(() => String, { nullable: true })
    event_code: string | null;

    @Field(() => String, { nullable: true })
    default_track: string | null;

    @Field(() => String, { nullable: true })
    registration_url: string | null;

    @Field(() => String, { nullable: true })
    event_settings: string | null;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    title: string | null;

    @Field(() => String, { nullable: true })
    online_meeting: string | null;

    @Field(() => String, { nullable: true })
    description: string | null;

    @Field(() => String, { nullable: true })
    event_id?: string | null;

    @Field(() => String, { nullable: true })
    currency_type: string | null;

    @Field(() => String, { nullable: true })
    failed_campaign_activities: string | null;

    @Field(() => String, { nullable: true })
    deleted_time: string | null;

    @Field(() => String, { nullable: true })
    display_contact_flag: string | null;

    @Field(() => String, { nullable: true })
    active_time: string | null;

    @Field(() => String, { nullable: true })
    campaign_id: string | null;

    @Field(() => String, { nullable: true })
    display_end_time_flag: string | null;

    @Field(() => String, { nullable: true })
    event_promotions: string | null;

    @Field(() => String, { nullable: true })
    cancelled_time: string | null;

    @Field(() => String, { nullable: true })
    eso: string | null;

    @Field(() => String, { nullable: true })
    time_zone_abbreviation: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Events Copies
//****************************************************************************
@InputType()
export class UpdateconstantcontacteventscopyInput {
    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    event_end?: string | null;

    @Field(() => String, { nullable: true })
    location_type?: string | null;

    @Field(() => String, { nullable: true })
    display_on_calendar_flag?: string | null;

    @Field(() => String, { nullable: true })
    last_update_time?: string | null;

    @Field(() => String, { nullable: true })
    contact?: string | null;

    @Field(() => String, { nullable: true })
    display_time_zone_flag?: string | null;

    @Field(() => String, { nullable: true })
    time_zone?: string | null;

    @Field(() => String, { nullable: true })
    event_widget_url?: string | null;

    @Field(() => String, { nullable: true })
    address?: string | null;

    @Field(() => String, { nullable: true })
    notify_owner_on_reg?: string | null;

    @Field(() => String, { nullable: true })
    event_metadata?: string | null;

    @Field(() => String, { nullable: true })
    event_start?: string | null;

    @Field(() => String, { nullable: true })
    event_type?: string | null;

    @Field(() => String, { nullable: true })
    create_time?: string | null;

    @Field(() => String, { nullable: true })
    event_calendar_url?: string | null;

    @Field(() => String, { nullable: true })
    event_code?: string | null;

    @Field(() => String, { nullable: true })
    default_track?: string | null;

    @Field(() => String, { nullable: true })
    registration_url?: string | null;

    @Field(() => String, { nullable: true })
    event_settings?: string | null;

    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    title?: string | null;

    @Field(() => String, { nullable: true })
    online_meeting?: string | null;

    @Field(() => String, { nullable: true })
    description?: string | null;

    @Field(() => String, { nullable: true })
    event_id: string | null;

    @Field(() => String, { nullable: true })
    currency_type?: string | null;

    @Field(() => String, { nullable: true })
    failed_campaign_activities?: string | null;

    @Field(() => String, { nullable: true })
    deleted_time?: string | null;

    @Field(() => String, { nullable: true })
    display_contact_flag?: string | null;

    @Field(() => String, { nullable: true })
    active_time?: string | null;

    @Field(() => String, { nullable: true })
    campaign_id?: string | null;

    @Field(() => String, { nullable: true })
    display_end_time_flag?: string | null;

    @Field(() => String, { nullable: true })
    event_promotions?: string | null;

    @Field(() => String, { nullable: true })
    cancelled_time?: string | null;

    @Field(() => String, { nullable: true })
    eso?: string | null;

    @Field(() => String, { nullable: true })
    time_zone_abbreviation?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Events Copies
//****************************************************************************
@ObjectType()
export class RunconstantcontacteventscopyViewResult {
    @Field(() => [constantcontacteventscopy_])
    Results: constantcontacteventscopy_[];

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

@Resolver(constantcontacteventscopy_)
export class constantcontacteventscopyResolver extends ResolverBase {
    @Query(() => RunconstantcontacteventscopyViewResult)
    async RunconstantcontacteventscopyViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontacteventscopyViewResult)
    async RunconstantcontacteventscopyViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontacteventscopyViewResult)
    async RunconstantcontacteventscopyDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events Copies';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontacteventscopy_, { nullable: true })
    async constantcontacteventscopy(@Arg('event_id', () => String) event_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontacteventscopy_ | null> {
        this.CheckUserReadPermissions('Events Copies', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEvents_copies')} WHERE ${provider.QuoteIdentifier('event_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Events Copies', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [event_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Events Copies', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontacteventscopy_)
    async Createconstantcontacteventscopy(
        @Arg('input', () => CreateconstantcontacteventscopyInput) input: CreateconstantcontacteventscopyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Events Copies', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontacteventscopy_)
    async Updateconstantcontacteventscopy(
        @Arg('input', () => UpdateconstantcontacteventscopyInput) input: UpdateconstantcontacteventscopyInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Events Copies', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontacteventscopy_)
    async Deleteconstantcontacteventscopy(@Arg('event_id', () => String) event_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'event_id', Value: event_id}]);
        return this.DeleteRecord('Events Copies', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Events Registrations
//****************************************************************************
@ObjectType({ description: `Get a list of registrations for an event.` })
export class constantcontacteventsregistrations_ {
    @Field(() => String, {nullable: true, description: `The total number of tickets eligible for checkin.`}) 
    @MaxLength(255)
    eligible_checkin_tickets?: string;
        
    @Field(() => String, {nullable: true, description: `The event registration date, in ISO format.`}) 
    registration_date?: string;
        
    @Field(() => String, {nullable: true, description: `Provides the current registration status; REGISTERED, PENDING, CANCELED, EXPIRED, IN_PROGRESS, FAILED.`}) 
    @MaxLength(255)
    registration_status?: string;
        
    @Field(() => String, {nullable: true, description: `Provides the status of eligible checkin tickets.`}) 
    @MaxLength(255)
    checkin_status?: string;
        
    @Field(() => String, {nullable: true, description: `Contact (events_registrations).`}) 
    contact?: string;
        
    @Field(() => String, {nullable: true, description: `The unique ID used to identify a contact.`}) 
    @MaxLength(255)
    contact_id?: string;
        
    @Field(() => String, {nullable: true, description: `The unique ID used to identify an event registration.`}) 
    @MaxLength(255)
    registration_id?: string;
        
    @Field(() => String, {nullable: true, description: `Determines if the physical tickets should display or not display.`}) 
    display_physical_tickets?: string;
        
    @Field(() => String, {nullable: true, description: `Tickets (events_registrations).`}) 
    tickets?: string;
        
    @Field(() => String, {nullable: true, description: `Order Summary (events_registrations).`}) 
    order_summary?: string;
        
    @Field(() => String, {nullable: true, description: `The total number of tickets assigned to a given registration_id.`}) 
    @MaxLength(255)
    checkedIn_tickets?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Events Registrations
//****************************************************************************
@InputType()
export class CreateconstantcontacteventsregistrationsInput {
    @Field(() => String, { nullable: true })
    eligible_checkin_tickets: string | null;

    @Field(() => String, { nullable: true })
    registration_date: string | null;

    @Field(() => String, { nullable: true })
    registration_status: string | null;

    @Field(() => String, { nullable: true })
    checkin_status: string | null;

    @Field(() => String, { nullable: true })
    contact: string | null;

    @Field(() => String, { nullable: true })
    contact_id: string | null;

    @Field(() => String, { nullable: true })
    registration_id?: string | null;

    @Field(() => String, { nullable: true })
    display_physical_tickets: string | null;

    @Field(() => String, { nullable: true })
    tickets: string | null;

    @Field(() => String, { nullable: true })
    order_summary: string | null;

    @Field(() => String, { nullable: true })
    checkedIn_tickets: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Events Registrations
//****************************************************************************
@InputType()
export class UpdateconstantcontacteventsregistrationsInput {
    @Field(() => String, { nullable: true })
    eligible_checkin_tickets?: string | null;

    @Field(() => String, { nullable: true })
    registration_date?: string | null;

    @Field(() => String, { nullable: true })
    registration_status?: string | null;

    @Field(() => String, { nullable: true })
    checkin_status?: string | null;

    @Field(() => String, { nullable: true })
    contact?: string | null;

    @Field(() => String, { nullable: true })
    contact_id?: string | null;

    @Field(() => String, { nullable: true })
    registration_id: string | null;

    @Field(() => String, { nullable: true })
    display_physical_tickets?: string | null;

    @Field(() => String, { nullable: true })
    tickets?: string | null;

    @Field(() => String, { nullable: true })
    order_summary?: string | null;

    @Field(() => String, { nullable: true })
    checkedIn_tickets?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Events Registrations
//****************************************************************************
@ObjectType()
export class RunconstantcontacteventsregistrationsViewResult {
    @Field(() => [constantcontacteventsregistrations_])
    Results: constantcontacteventsregistrations_[];

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

@Resolver(constantcontacteventsregistrations_)
export class constantcontacteventsregistrationsResolver extends ResolverBase {
    @Query(() => RunconstantcontacteventsregistrationsViewResult)
    async RunconstantcontacteventsregistrationsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontacteventsregistrationsViewResult)
    async RunconstantcontacteventsregistrationsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontacteventsregistrationsViewResult)
    async RunconstantcontacteventsregistrationsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Events Registrations';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontacteventsregistrations_, { nullable: true })
    async constantcontacteventsregistrations(@Arg('registration_id', () => String) registration_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontacteventsregistrations_ | null> {
        this.CheckUserReadPermissions('Events Registrations', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwEvents_registrations')} WHERE ${provider.QuoteIdentifier('registration_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Events Registrations', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [registration_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Events Registrations', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontacteventsregistrations_)
    async Createconstantcontacteventsregistrations(
        @Arg('input', () => CreateconstantcontacteventsregistrationsInput) input: CreateconstantcontacteventsregistrationsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Events Registrations', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontacteventsregistrations_)
    async Updateconstantcontacteventsregistrations(
        @Arg('input', () => UpdateconstantcontacteventsregistrationsInput) input: UpdateconstantcontacteventsregistrationsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Events Registrations', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontacteventsregistrations_)
    async Deleteconstantcontacteventsregistrations(@Arg('registration_id', () => String) registration_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'registration_id', Value: registration_id}]);
        return this.DeleteRecord('Events Registrations', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Segments
//****************************************************************************
@ObjectType({ description: `GET all Segments` })
export class constantcontactsegments_ {
    @Field(() => String, {nullable: true, description: `The system generated date and time (ISO-8601) that the segment's name or  segment_criteria was last updated.`}) 
    edited_at?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated date and time (ISO-8601) that the segment was created.`}) 
    created_at?: string;
        
    @Field(() => String, {nullable: true, description: `The segment's contact selection criteria formatted as single-string escaped JSON.`}) 
    segment_criteria?: string;
        
    @Field(() => String, {nullable: true, description: `The system generated number that uniquely identifies the segment.`}) 
    @MaxLength(450)
    segment_id?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The segment's unique descriptive name.`}) 
    @MaxLength(812)
    name?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Segments
//****************************************************************************
@InputType()
export class CreateconstantcontactsegmentsInput {
    @Field(() => String, { nullable: true })
    edited_at: string | null;

    @Field(() => String, { nullable: true })
    created_at: string | null;

    @Field(() => String, { nullable: true })
    segment_criteria: string | null;

    @Field(() => String, { nullable: true })
    segment_id?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Segments
//****************************************************************************
@InputType()
export class UpdateconstantcontactsegmentsInput {
    @Field(() => String, { nullable: true })
    edited_at?: string | null;

    @Field(() => String, { nullable: true })
    created_at?: string | null;

    @Field(() => String, { nullable: true })
    segment_criteria?: string | null;

    @Field(() => String, { nullable: true })
    segment_id: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Segments
//****************************************************************************
@ObjectType()
export class RunconstantcontactsegmentsViewResult {
    @Field(() => [constantcontactsegments_])
    Results: constantcontactsegments_[];

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

@Resolver(constantcontactsegments_)
export class constantcontactsegmentsResolver extends ResolverBase {
    @Query(() => RunconstantcontactsegmentsViewResult)
    async RunconstantcontactsegmentsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsegmentsViewResult)
    async RunconstantcontactsegmentsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsegmentsViewResult)
    async RunconstantcontactsegmentsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Segments';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactsegments_, { nullable: true })
    async constantcontactsegments(@Arg('segment_id', () => String) segment_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactsegments_ | null> {
        this.CheckUserReadPermissions('Segments', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwSegments')} WHERE ${provider.QuoteIdentifier('segment_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Segments', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [segment_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Segments', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactsegments_)
    async Createconstantcontactsegments(
        @Arg('input', () => CreateconstantcontactsegmentsInput) input: CreateconstantcontactsegmentsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Segments', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactsegments_)
    async Updateconstantcontactsegments(
        @Arg('input', () => UpdateconstantcontactsegmentsInput) input: UpdateconstantcontactsegmentsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Segments', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactsegments_)
    async Deleteconstantcontactsegments(@Arg('segment_id', () => String) segment_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'segment_id', Value: segment_id}]);
        return this.DeleteRecord('Segments', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Social Connections
//****************************************************************************
@ObjectType({ description: `GET social network connections` })
export class constantcontactsocialconnections_ {
    @Field(() => String, {nullable: true, description: `Account information for this connection.`}) 
    account_info?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(450)
    ID?: string;
        
    @Field(() => String, {nullable: true, description: `Status details for this connection.`}) 
    connection_status?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Social Connections
//****************************************************************************
@InputType()
export class CreateconstantcontactsocialconnectionsInput {
    @Field(() => String, { nullable: true })
    account_info: string | null;

    @Field(() => String, { nullable: true })
    ID?: string | null;

    @Field(() => String, { nullable: true })
    connection_status: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Social Connections
//****************************************************************************
@InputType()
export class UpdateconstantcontactsocialconnectionsInput {
    @Field(() => String, { nullable: true })
    account_info?: string | null;

    @Field(() => String, { nullable: true })
    ID: string | null;

    @Field(() => String, { nullable: true })
    connection_status?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Social Connections
//****************************************************************************
@ObjectType()
export class RunconstantcontactsocialconnectionsViewResult {
    @Field(() => [constantcontactsocialconnections_])
    Results: constantcontactsocialconnections_[];

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

@Resolver(constantcontactsocialconnections_)
export class constantcontactsocialconnectionsResolver extends ResolverBase {
    @Query(() => RunconstantcontactsocialconnectionsViewResult)
    async RunconstantcontactsocialconnectionsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsocialconnectionsViewResult)
    async RunconstantcontactsocialconnectionsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsocialconnectionsViewResult)
    async RunconstantcontactsocialconnectionsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Social Connections';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactsocialconnections_, { nullable: true })
    async constantcontactsocialconnections(@Arg('ID', () => String) ID: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactsocialconnections_ | null> {
        this.CheckUserReadPermissions('Social Connections', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwSocial_connections')} WHERE ${provider.QuoteIdentifier('ID')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Social Connections', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [ID], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Social Connections', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactsocialconnections_)
    async Createconstantcontactsocialconnections(
        @Arg('input', () => CreateconstantcontactsocialconnectionsInput) input: CreateconstantcontactsocialconnectionsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Social Connections', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactsocialconnections_)
    async Updateconstantcontactsocialconnections(
        @Arg('input', () => UpdateconstantcontactsocialconnectionsInput) input: UpdateconstantcontactsocialconnectionsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Social Connections', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactsocialconnections_)
    async Deleteconstantcontactsocialconnections(@Arg('ID', () => String) ID: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'ID', Value: ID}]);
        return this.DeleteRecord('Social Connections', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Social Hashtag Groups
//****************************************************************************
@ObjectType({ description: `GET hashtag groups` })
export class constantcontactsocialhashtaggroups_ {
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The human-readable name for this group. This name will be sanitized before saving, which may include trimming whitespace, truncation, and/or removing invalid characters. If the sanitized name results in a blank string, it will not be able to be saved, and any create or update operation will fail.The name is currently limited to a maximum of 150 characters, but the effective length may be shorter, depending on whether special characters (such as emoji) are used.`}) 
    hashtag_group_name?: string;
        
    @Field(() => String, {nullable: true, description: `The list of hashtag names for this group. Hashtag names do not include any leading '#' character. They can only consist of alphanumeric characters and '_' (underscore). The hashtag name cannot begin or end with an underscore. Hashtag names may begin with a letter or a number, and may consist of only numbers. Hashtag names are currently limited to a maximum of 30 characters.The list order is preserved. If duplicates exist, they will be removed when saving, and the first occurrence will `}) 
    hashtag_names?: string;
        
    @Field(() => String, {nullable: true, description: `Unique identifier for this hashtag group. Automatically generated on creation and returned in all responses.`}) 
    @MaxLength(450)
    hashtag_group_id?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Social Hashtag Groups
//****************************************************************************
@InputType()
export class CreateconstantcontactsocialhashtaggroupsInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    hashtag_group_name: string | null;

    @Field(() => String, { nullable: true })
    hashtag_names: string | null;

    @Field(() => String, { nullable: true })
    hashtag_group_id?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Social Hashtag Groups
//****************************************************************************
@InputType()
export class UpdateconstantcontactsocialhashtaggroupsInput {
    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    hashtag_group_name?: string | null;

    @Field(() => String, { nullable: true })
    hashtag_names?: string | null;

    @Field(() => String, { nullable: true })
    hashtag_group_id: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Social Hashtag Groups
//****************************************************************************
@ObjectType()
export class RunconstantcontactsocialhashtaggroupsViewResult {
    @Field(() => [constantcontactsocialhashtaggroups_])
    Results: constantcontactsocialhashtaggroups_[];

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

@Resolver(constantcontactsocialhashtaggroups_)
export class constantcontactsocialhashtaggroupsResolver extends ResolverBase {
    @Query(() => RunconstantcontactsocialhashtaggroupsViewResult)
    async RunconstantcontactsocialhashtaggroupsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsocialhashtaggroupsViewResult)
    async RunconstantcontactsocialhashtaggroupsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsocialhashtaggroupsViewResult)
    async RunconstantcontactsocialhashtaggroupsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Social Hashtag Groups';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactsocialhashtaggroups_, { nullable: true })
    async constantcontactsocialhashtaggroups(@Arg('hashtag_group_id', () => String) hashtag_group_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactsocialhashtaggroups_ | null> {
        this.CheckUserReadPermissions('Social Hashtag Groups', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwSocial_hashtag_groups')} WHERE ${provider.QuoteIdentifier('hashtag_group_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Social Hashtag Groups', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [hashtag_group_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Social Hashtag Groups', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactsocialhashtaggroups_)
    async Createconstantcontactsocialhashtaggroups(
        @Arg('input', () => CreateconstantcontactsocialhashtaggroupsInput) input: CreateconstantcontactsocialhashtaggroupsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Social Hashtag Groups', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactsocialhashtaggroups_)
    async Updateconstantcontactsocialhashtaggroups(
        @Arg('input', () => UpdateconstantcontactsocialhashtaggroupsInput) input: UpdateconstantcontactsocialhashtaggroupsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Social Hashtag Groups', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactsocialhashtaggroups_)
    async Deleteconstantcontactsocialhashtaggroups(@Arg('hashtag_group_id', () => String) hashtag_group_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'hashtag_group_id', Value: hashtag_group_id}]);
        return this.DeleteRecord('Social Hashtag Groups', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Social Posts
//****************************************************************************
@ObjectType({ description: `POST (create) a social media post` })
export class constantcontactsocialposts_ {
    @Field(() => String, {nullable: true, description: `Unique identifier for the post campaign. Generated by the server on creation. Use this value to reference the post in subsequent requests.`}) 
    @MaxLength(450)
    campaign_id?: string;
        
    @Field(() => String, {nullable: true, description: `The date and time to publish the post, in ISO-8601 format. Only set when status is SCHEDULED.`}) 
    @MaxLength(812)
    scheduled_time?: string;
        
    @Field(() => String, {nullable: true, description: `Campaign name for this post. The value provided on creation is sanitized before saving, so the returned value may not exactly match what was sent.`}) 
    @MaxLength(812)
    name?: string;
        
    @Field(() => String, {nullable: true, description: `The list of per-profile posts that make up this campaign.`}) 
    profile_posts?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The current status of the post. Possible values include:

  DRAFT — saved without being scheduled for publication
  SCHEDULED — scheduled for future publication at scheduled_time
  EXECUTING — currently being published
  ACTIVE — the post has been published and is active on the social network
  PAUSED — publication has been paused
  SUSPENDED — publication has been suspended
  REMOVED — the post has been removed
  DONE — publication has completed
  ERROR — publication encountered an er`}) 
    @MaxLength(812)
    status?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Social Posts
//****************************************************************************
@InputType()
export class CreateconstantcontactsocialpostsInput {
    @Field(() => String, { nullable: true })
    campaign_id?: string | null;

    @Field(() => String, { nullable: true })
    scheduled_time: string | null;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    profile_posts: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    status: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Social Posts
//****************************************************************************
@InputType()
export class UpdateconstantcontactsocialpostsInput {
    @Field(() => String, { nullable: true })
    campaign_id: string | null;

    @Field(() => String, { nullable: true })
    scheduled_time?: string | null;

    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    profile_posts?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    status?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Social Posts
//****************************************************************************
@ObjectType()
export class RunconstantcontactsocialpostsViewResult {
    @Field(() => [constantcontactsocialposts_])
    Results: constantcontactsocialposts_[];

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

@Resolver(constantcontactsocialposts_)
export class constantcontactsocialpostsResolver extends ResolverBase {
    @Query(() => RunconstantcontactsocialpostsViewResult)
    async RunconstantcontactsocialpostsViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsocialpostsViewResult)
    async RunconstantcontactsocialpostsViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsocialpostsViewResult)
    async RunconstantcontactsocialpostsDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Social Posts';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactsocialposts_, { nullable: true })
    async constantcontactsocialposts(@Arg('campaign_id', () => String) campaign_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactsocialposts_ | null> {
        this.CheckUserReadPermissions('Social Posts', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwSocial_posts')} WHERE ${provider.QuoteIdentifier('campaign_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Social Posts', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [campaign_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Social Posts', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactsocialposts_)
    async Createconstantcontactsocialposts(
        @Arg('input', () => CreateconstantcontactsocialpostsInput) input: CreateconstantcontactsocialpostsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Social Posts', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactsocialposts_)
    async Updateconstantcontactsocialposts(
        @Arg('input', () => UpdateconstantcontactsocialpostsInput) input: UpdateconstantcontactsocialpostsInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Social Posts', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactsocialposts_)
    async Deleteconstantcontactsocialposts(@Arg('campaign_id', () => String) campaign_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'campaign_id', Value: campaign_id}]);
        return this.DeleteRecord('Social Posts', key, options, provider, userPayload, pubSub);
    }
    
}

//****************************************************************************
// ENTITY CLASS for Social Profiles
//****************************************************************************
@ObjectType({ description: `GET social media profiles` })
export class constantcontactsocialprofiles_ {
    @Field(() => String, {nullable: true, description: `The social network-specific identifier for this profile.`}) 
    @MaxLength(812)
    network_profile_id?: string;
        
    @Field(() => String, {nullable: true, description: `The profile's handle on the social network (for example, an Instagram or TikTok username). May be null if the network does not expose a separate handle (for example, Facebook).`}) 
    @MaxLength(812)
    handle?: string;
        
    @Field(() => String, {nullable: true, description: `Network-specific settings for the profile. Only populated when the request includes include=accessible and settings are available for the network. Currently, only TikTok provides settings: "content": {
  "comment_disabled": Boolean,
  "duet_disabled": Boolean,
  "stitch_disabled": Boolean,
  "max_video_post_duration_sec": Integer
}`}) 
    settings?: string;
        
    @Field(() => String, {nullable: true, description: `Whether the profile is currently accessible for posting. Publishing a post will fail if its profile is not currently accessible. Only populated when the GET request includes the query parameter include=accessible.`}) 
    accessible?: string;
        
    @Field(() => String, {nullable: true, description: `URL of the profile's image or avatar.`}) 
    @MaxLength(812)
    image_url?: string;
        
    @Field(() => String, {nullable: true}) 
    @MaxLength(812)
    mj_e2e_custom_attr?: string;
        
    @Field(() => String, {nullable: true, description: `The social network this profile belongs to.`}) 
    @MaxLength(812)
    network?: string;
        
    @Field(() => String, {nullable: true, description: `The social network-specific identifier for the user who owns this profile.`}) 
    @MaxLength(812)
    network_user_id?: string;
        
    @Field(() => String, {nullable: true, description: `Unique identifier for this profile. Use this value in the profile_id field of a ProfilePost when creating a post.`}) 
    @MaxLength(450)
    profile_id?: string;
        
    @Field(() => String, {nullable: true, description: `Whether this profile is currently connected. You can only create and publish posts with connected profiles.`}) 
    connected?: string;
        
    @Field(() => String, {nullable: true, description: `Account Info (social_profiles).`}) 
    account_info?: string;
        
    @Field(() => String, {nullable: true, description: `Display name of the profile.`}) 
    @MaxLength(812)
    name?: string;
        
    @Field(() => String, {nullable: true, description: `URL to the profile on the social network.`}) 
    @MaxLength(812)
    url?: string;
        
    @Field(() => String, {description: `Current sync status: Active, Archived, or Error`}) 
    @MaxLength(50)
    _mj__integration_SyncStatus: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp of the last successful sync for this record`}) 
    _mj__integration_LastSyncedAt?: Date;
        
    @Field(() => String, {nullable: true, description: `The external record values as of the last successful sync, serialized as JSON. The last-known external state, kept independent of local edits, used to detect changes without a watermark and as the common ancestor for field-level merge (combine) on bidirectional push.`}) 
    _mj__integration_LastSyncedSnapshot?: string;
        
    @Field(() => String, {nullable: true, description: `Human-readable detail when SyncStatus is Error or Conflict (the conflicting fields and values, or the apply error). NULL when Active.`}) 
    _mj__integration_SyncMessage?: string;
        
    @Field(() => String, {nullable: true, description: `SHA-256 (hex) of the last-synced external field values. Lets the engine detect changes and skip re-loading/re-writing unchanged records for sources that have no usable watermark (e.g. YourMembership, which re-fetches every record each sync).`}) 
    @MaxLength(64)
    _mj__integration_ContentHash?: string;
        
    @Field(() => String, {nullable: true, description: `Backend staging (system) column: JSON of source fields a record returned that have no field map yet — the extra keys this table has no column for. A post-sync Runtime-Schema-Updation pass promotes pervasive keys to real columns and clears them here. Not user-facing metadata; transient until promotion.`}) 
    _mj__integration_CustomOverflow?: string;
        
    @Field(() => String, {nullable: true, description: `The external system’s version/etag/modified token for the last-synced state, used for optimistic-concurrency (OCC) detection on bidirectional push. Null when the source exposes no version token.`}) 
    @MaxLength(255)
    _mj__integration_ExternalVersion?: string;
        
    @Field(() => String, {nullable: true, description: `The watermark / last-modified value observed for THIS record on the last sync (per-record, independent of the entity-map-level CompanyIntegrationSyncWatermark).`}) 
    @MaxLength(255)
    _mj__integration_LastSeenModifiedValue?: string;
        
    @Field(() => Date, {nullable: true, description: `Timestamp this record was last confirmed against the source system. Lets a reconcile find records not seen recently (delete-detection candidates).`}) 
    _mj__integration_LastReconciledAt?: Date;
        
    @Field(() => String, {nullable: true, description: `Which side last wrote this row: "Pull" (external→MJ) or "Push" (MJ→external). Informs conflict handling and audit.`}) 
    @MaxLength(10)
    _mj__integration_LastWriterDirection?: string;
        
    @Field(() => Boolean, {description: `Explicit soft-delete flag, set when the record is detected as deleted/archived upstream. A queryable tombstone, distinct from the SyncStatus="Archived" text status.`}) 
    _mj__integration_IsTombstoned: boolean;
        
    @Field(() => Date, {nullable: true, description: `Timestamp the upstream deletion was detected (set alongside IsTombstoned). Null while the record is live.`}) 
    _mj__integration_DeletedDetectedAt?: Date;
        
    @Field(() => Date) 
    _mj__CreatedAt: Date;
        
    @Field(() => Date) 
    _mj__UpdatedAt: Date;
        
}

//****************************************************************************
// INPUT TYPE for Social Profiles
//****************************************************************************
@InputType()
export class CreateconstantcontactsocialprofilesInput {
    @Field(() => String, { nullable: true })
    network_profile_id: string | null;

    @Field(() => String, { nullable: true })
    handle: string | null;

    @Field(() => String, { nullable: true })
    settings: string | null;

    @Field(() => String, { nullable: true })
    accessible: string | null;

    @Field(() => String, { nullable: true })
    image_url: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr: string | null;

    @Field(() => String, { nullable: true })
    network: string | null;

    @Field(() => String, { nullable: true })
    network_user_id: string | null;

    @Field(() => String, { nullable: true })
    profile_id?: string | null;

    @Field(() => String, { nullable: true })
    connected: string | null;

    @Field(() => String, { nullable: true })
    account_info: string | null;

    @Field(() => String, { nullable: true })
    name: string | null;

    @Field(() => String, { nullable: true })
    url: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt: Date | null;

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    

//****************************************************************************
// INPUT TYPE for Social Profiles
//****************************************************************************
@InputType()
export class UpdateconstantcontactsocialprofilesInput {
    @Field(() => String, { nullable: true })
    network_profile_id?: string | null;

    @Field(() => String, { nullable: true })
    handle?: string | null;

    @Field(() => String, { nullable: true })
    settings?: string | null;

    @Field(() => String, { nullable: true })
    accessible?: string | null;

    @Field(() => String, { nullable: true })
    image_url?: string | null;

    @Field(() => String, { nullable: true })
    mj_e2e_custom_attr?: string | null;

    @Field(() => String, { nullable: true })
    network?: string | null;

    @Field(() => String, { nullable: true })
    network_user_id?: string | null;

    @Field(() => String, { nullable: true })
    profile_id: string | null;

    @Field(() => String, { nullable: true })
    connected?: string | null;

    @Field(() => String, { nullable: true })
    account_info?: string | null;

    @Field(() => String, { nullable: true })
    name?: string | null;

    @Field(() => String, { nullable: true })
    url?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncStatus?: string;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastSyncedAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSyncedSnapshot?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_SyncMessage?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ContentHash?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_CustomOverflow?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_ExternalVersion?: string | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastSeenModifiedValue?: string | null;

    @Field(() => Date, { nullable: true })
    _mj__integration_LastReconciledAt?: Date | null;

    @Field(() => String, { nullable: true })
    _mj__integration_LastWriterDirection?: string | null;

    @Field(() => Boolean, { nullable: true })
    _mj__integration_IsTombstoned?: boolean;

    @Field(() => Date, { nullable: true })
    _mj__integration_DeletedDetectedAt?: Date | null;

    @Field(() => [KeyValuePairInput], { nullable: true })
    OldValues___?: KeyValuePairInput[];

    @Field(() => RestoreContextInput, { nullable: true })
    RestoreContext___?: RestoreContextInput;
}
    
//****************************************************************************
// RESOLVER for Social Profiles
//****************************************************************************
@ObjectType()
export class RunconstantcontactsocialprofilesViewResult {
    @Field(() => [constantcontactsocialprofiles_])
    Results: constantcontactsocialprofiles_[];

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

@Resolver(constantcontactsocialprofiles_)
export class constantcontactsocialprofilesResolver extends ResolverBase {
    @Query(() => RunconstantcontactsocialprofilesViewResult)
    async RunconstantcontactsocialprofilesViewByID(@Arg('input', () => RunViewByIDInput) input: RunViewByIDInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByIDGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsocialprofilesViewResult)
    async RunconstantcontactsocialprofilesViewByName(@Arg('input', () => RunViewByNameInput) input: RunViewByNameInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        return super.RunViewByNameGeneric(input, provider, userPayload, pubSub);
    }

    @Query(() => RunconstantcontactsocialprofilesViewResult)
    async RunconstantcontactsocialprofilesDynamicView(@Arg('input', () => RunDynamicViewInput) input: RunDynamicViewInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        input.EntityName = 'Social Profiles';
        return super.RunDynamicViewGeneric(input, provider, userPayload, pubSub);
    }
    @Query(() => constantcontactsocialprofiles_, { nullable: true })
    async constantcontactsocialprofiles(@Arg('profile_id', () => String) profile_id: string, @Ctx() { userPayload, providers }: AppContext, @PubSub() pubSub: PubSubEngine): Promise<constantcontactsocialprofiles_ | null> {
        this.CheckUserReadPermissions('Social Profiles', userPayload);
        const provider = GetReadOnlyProvider(providers, { allowFallbackToReadWrite: true });
        const sSQL = `SELECT * FROM ${provider.QuoteSchemaAndView('constant_contact', 'vwSocial_profiles')} WHERE ${provider.QuoteIdentifier('profile_id')}=${provider.BuildParameterPlaceholder(0)} ` + this.getRowLevelSecurityWhereClause(provider, 'Social Profiles', userPayload, EntityPermissionType.Read, 'AND');
        const rows = await provider.ExecuteSQL(sSQL, [profile_id], undefined, this.GetUserFromPayload(userPayload));
        const result = await this.MapFieldNamesToCodeNames('Social Profiles', rows && rows.length > 0 ? rows[0] : null, this.GetUserFromPayload(userPayload));
        return result;
    }
    
    @Mutation(() => constantcontactsocialprofiles_)
    async Createconstantcontactsocialprofiles(
        @Arg('input', () => CreateconstantcontactsocialprofilesInput) input: CreateconstantcontactsocialprofilesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.CreateRecord('Social Profiles', input, provider, userPayload, pubSub)
    }
        
    @Mutation(() => constantcontactsocialprofiles_)
    async Updateconstantcontactsocialprofiles(
        @Arg('input', () => UpdateconstantcontactsocialprofilesInput) input: UpdateconstantcontactsocialprofilesInput,
        @Ctx() { providers, userPayload }: AppContext,
        @PubSub() pubSub: PubSubEngine
    ) {
        const provider = GetReadWriteProvider(providers);
        return this.UpdateRecord('Social Profiles', input, provider, userPayload, pubSub);
    }
    
    @Mutation(() => constantcontactsocialprofiles_)
    async Deleteconstantcontactsocialprofiles(@Arg('profile_id', () => String) profile_id: string, @Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput, @Ctx() { providers, userPayload }: AppContext, @PubSub() pubSub: PubSubEngine) {
        const provider = GetReadWriteProvider(providers);
        const key = new CompositeKey([{FieldName: 'profile_id', Value: profile_id}]);
        return this.DeleteRecord('Social Profiles', key, options, provider, userPayload, pubSub);
    }
    
}