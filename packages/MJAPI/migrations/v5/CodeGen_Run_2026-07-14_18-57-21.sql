/* Set soft PK for constant_contact.account_emails.email_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9F5BCE34-13B5-463F-A66C-40BD2D0F7827' AND [Name] = 'email_id';

/* Set soft PK for constant_contact.account_summary.encoded_account_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '63721B56-84CF-4294-9DFE-3648CCF63A96' AND [Name] = 'encoded_account_id';

/* Set soft PK for constant_contact.account_user_privileges.privilege_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A5F61D12-1A75-4323-B0A9-97AEF9C43813' AND [Name] = 'privilege_id';

/* Set soft PK for constant_contact.activities.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6F2AE9C1-9811-4BC4-B7EF-2E1E9EC1EC6B' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_delete.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '7473CB77-31C1-4AEC-9959-FCD2EB8A88E5' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_file_import.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8ADAE93D-67BC-4BB8-954F-699803AF68A6' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_json_import.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F60BA024-6D49-47A9-9BCA-C639432B30B3' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_taggings_add.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '40816253-066E-40BE-A410-4183032DC86C' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_taggings_remove.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '89AEB9E4-2E03-47E0-91BD-44CDD0ADFBB7' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_tags_delete.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '164434C9-51B3-4F3F-BE4E-2E1E2B1ACDDC' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_custom_fields_delete.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CBFDCEAA-1032-4CA6-AF08-525D984299A6' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_list_delete.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '19E29B68-A02F-4D68-8351-2B21894C1470' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_list_memberships_add.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D86ECFE1-C46A-4F2A-AA2D-B2E8050C9623' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_list_memberships_remove.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AE91ABE1-4472-41B2-9D66-0103CC24303C' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.contact_custom_fields.custom_field_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F4B21450-1123-47E3-A13E-94AC39923878' AND [Name] = 'custom_field_id';

/* Set soft PK for constant_contact.contact_lists.list_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '100AA80E-3D80-4093-8E02-949C67466745' AND [Name] = 'list_id';

/* Set soft PK for constant_contact.contact_lists_xrefs.list_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '53DBB968-EFB7-4C19-BC74-2E5B5CB8809D' AND [Name] = 'list_id';

/* Set soft FK for constant_contact.contact_lists_xrefs.list_id → contact_lists.list_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '100AA80E-3D80-4093-8E02-949C67466745',
                                    [RelatedEntityFieldName] = 'list_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '53DBB968-EFB7-4C19-BC74-2E5B5CB8809D' AND [Name] = 'list_id';

/* Set soft PK for constant_contact.contact_reports_activity_summary.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '7485038F-7367-49CC-9373-B2CFC57053D0' AND [Name] = 'campaign_activity_id';

/* Set soft FK for constant_contact.contact_reports_activity_summary.campaign_activity_id → email_campaign_activities.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB',
                                    [RelatedEntityFieldName] = 'campaign_activity_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '7485038F-7367-49CC-9373-B2CFC57053D0' AND [Name] = 'campaign_activity_id';

/* Set soft PK for constant_contact.contact_reports_open_and_click_rates.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '35129D80-B072-44EF-B806-7512334BB417' AND [Name] = 'contact_id';

/* Set soft FK for constant_contact.contact_reports_open_and_click_rates.contact_id → contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A',
                                    [RelatedEntityFieldName] = 'contact_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '35129D80-B072-44EF-B806-7512334BB417' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.contact_tags.tag_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '234F9892-7FEB-4B72-965F-98C14FB6C161' AND [Name] = 'tag_id';

/* Set soft PK for constant_contact.contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.contacts_sign_up_form.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '702F7EAD-E6E8-4B44-A73B-749B65343A92' AND [Name] = 'contact_id';

/* Set soft FK for constant_contact.contacts_sign_up_form.contact_id → contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A',
                                    [RelatedEntityFieldName] = 'contact_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '702F7EAD-E6E8-4B44-A73B-749B65343A92' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.contacts_xrefs.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BC4BBBBC-517D-4F9E-AD00-453181C5CD19' AND [Name] = 'contact_id';

/* Set soft FK for constant_contact.contacts_xrefs.contact_id → contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A',
                                    [RelatedEntityFieldName] = 'contact_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'BC4BBBBC-517D-4F9E-AD00-453181C5CD19' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.email_campaign_activities.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB' AND [Name] = 'campaign_activity_id';

/* Set soft FK for constant_contact.email_campaign_activities.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.email_campaign_activity_non_opener_resends.resend_request_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1F31F7C8-10D0-4D01-AEAB-57456DCD9432' AND [Name] = 'resend_request_id';

/* Set soft PK for constant_contact.email_campaign_activity_previews.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8930C0D6-1A03-4EDC-BE7F-078AA597601E' AND [Name] = 'campaign_activity_id';

/* Set soft FK for constant_contact.email_campaign_activity_previews.campaign_activity_id → email_campaign_activities.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB',
                                    [RelatedEntityFieldName] = 'campaign_activity_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8930C0D6-1A03-4EDC-BE7F-078AA597601E' AND [Name] = 'campaign_activity_id';

/* Set soft PK for constant_contact.email_campaign_activity_send_history.send_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '78395832-1CD4-4E73-9ABA-F23AE29A0BF3' AND [Name] = 'send_id';

/* Set soft PK for constant_contact.email_reports_links.url_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F8B58DEF-F48A-40A0-999F-687C47056363' AND [Name] = 'url_id';

/* Set soft FK for constant_contact.email_reports_links.list_id → contact_lists.list_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '100AA80E-3D80-4093-8E02-949C67466745',
                                    [RelatedEntityFieldName] = 'list_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F8B58DEF-F48A-40A0-999F-687C47056363' AND [Name] = 'list_id';

/* Set soft PK for constant_contact.email_reports_summary.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'ED05582C-F3EE-466E-8334-080D8CB97A36' AND [Name] = 'campaign_id';

/* Set soft FK for constant_contact.email_reports_summary.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'ED05582C-F3EE-466E-8334-080D8CB97A36' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.emails_xrefs.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C9B6B694-4FCF-40FB-A121-9BE389309BF2' AND [Name] = 'campaign_activity_id';

/* Set soft FK for constant_contact.emails_xrefs.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C9B6B694-4FCF-40FB-A121-9BE389309BF2' AND [Name] = 'campaign_id';

/* Set soft FK for constant_contact.emails_xrefs.campaign_activity_id → email_campaign_activities.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB',
                                    [RelatedEntityFieldName] = 'campaign_activity_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C9B6B694-4FCF-40FB-A121-9BE389309BF2' AND [Name] = 'campaign_activity_id';

/* Set soft PK for constant_contact.events.event_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1278100A-1FFA-4FED-821B-07ED594AA030' AND [Name] = 'event_id';

/* Set soft FK for constant_contact.events.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '1278100A-1FFA-4FED-821B-07ED594AA030' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.events_copy.event_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3F8099A2-22D1-4FE1-93BC-7F258CC6BE79' AND [Name] = 'event_id';

/* Set soft FK for constant_contact.events_copy.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3F8099A2-22D1-4FE1-93BC-7F258CC6BE79' AND [Name] = 'campaign_id';

/* Set soft FK for constant_contact.events_copy.event_id → events.event_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '1278100A-1FFA-4FED-821B-07ED594AA030',
                                    [RelatedEntityFieldName] = 'event_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3F8099A2-22D1-4FE1-93BC-7F258CC6BE79' AND [Name] = 'event_id';

/* Set soft PK for constant_contact.events_registrations.registration_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '46100EE6-A169-43FE-AB53-B4BC7271A80D' AND [Name] = 'registration_id';

/* Set soft FK for constant_contact.events_registrations.contact_id → contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A',
                                    [RelatedEntityFieldName] = 'contact_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '46100EE6-A169-43FE-AB53-B4BC7271A80D' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.segments.segment_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A18D417B-3C0C-49EE-B8DE-DD8A0C3FB84D' AND [Name] = 'segment_id';

/* Set soft PK for constant_contact.social_hashtag_groups.hashtag_group_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4890B232-F660-4084-B095-93BFA72A6A93' AND [Name] = 'hashtag_group_id';

/* Set soft PK for constant_contact.social_posts.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F892A77C-9F35-41E7-BC1F-C8FAEBDC55B4' AND [Name] = 'campaign_id';

/* Set soft FK for constant_contact.social_posts.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F892A77C-9F35-41E7-BC1F-C8FAEBDC55B4' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.social_profiles.profile_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FDF7F92F-3502-4F48-8F2C-B319CCF3F219' AND [Name] = 'profile_id';

/* Set soft PK for constant_contact.account_physical_address.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '19820673-C51F-453C-86F7-610069A80010' AND [Name] = 'ID';

/* Set soft PK for constant_contact.contacts_counts.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C86AC417-6B27-4C9E-AF68-C7965CABE5BE' AND [Name] = 'ID';

/* Set soft PK for constant_contact.social_connections.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E7F69D0A-ABC8-49EB-A449-581AC6D4500B' AND [Name] = 'ID';

/* Index for Foreign Keys for account_emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Emails
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for account_physical_address */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Physical Addresses
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for account_summary */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Summaries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for account_user_privileges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account User Privileges
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Account Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Emails
-- Item: vwAccount_emails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Account Emails
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  account_emails
-----               PRIMARY KEY: email_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwAccount_emails]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwAccount_emails];
GO

CREATE VIEW [constant_contact].[vwAccount_emails]
AS
SELECT
    a.*
FROM
    [constant_contact].[account_emails] AS a
GO
GRANT SELECT ON [constant_contact].[vwAccount_emails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Account Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Emails
-- Item: Permissions for vwAccount_emails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwAccount_emails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Account Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Emails
-- Item: spCreateaccount_emails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR account_emails
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateaccount_emails]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateaccount_emails];
GO

CREATE PROCEDURE [constant_contact].[spCreateaccount_emails]
    @confirm_source_type_Clear bit = 0,
    @confirm_source_type nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @email_address_Clear bit = 0,
    @email_address nvarchar(812) = NULL,
    @confirm_status_Clear bit = 0,
    @confirm_status nvarchar(812) = NULL,
    @roles_Clear bit = 0,
    @roles nvarchar(MAX) = NULL,
    @confirm_time_Clear bit = 0,
    @confirm_time nvarchar(MAX) = NULL,
    @pending_roles_Clear bit = 0,
    @pending_roles nvarchar(MAX) = NULL,
    @email_id nvarchar(450) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[account_emails]
        (
            [confirm_source_type],
                [mj_e2e_custom_attr],
                [email_address],
                [confirm_status],
                [roles],
                [confirm_time],
                [pending_roles],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [email_id]
        )
    VALUES
        (
            CASE WHEN @confirm_source_type_Clear = 1 THEN NULL ELSE ISNULL(@confirm_source_type, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @email_address_Clear = 1 THEN NULL ELSE ISNULL(@email_address, NULL) END,
                CASE WHEN @confirm_status_Clear = 1 THEN NULL ELSE ISNULL(@confirm_status, NULL) END,
                CASE WHEN @roles_Clear = 1 THEN NULL ELSE ISNULL(@roles, NULL) END,
                CASE WHEN @confirm_time_Clear = 1 THEN NULL ELSE ISNULL(@confirm_time, NULL) END,
                CASE WHEN @pending_roles_Clear = 1 THEN NULL ELSE ISNULL(@pending_roles, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @email_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwAccount_emails] WHERE [email_id] = @email_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateaccount_emails] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Account Emails */

GRANT EXECUTE ON [constant_contact].[spCreateaccount_emails] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Account Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Emails
-- Item: spUpdateaccount_emails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR account_emails
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateaccount_emails]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateaccount_emails];
GO

CREATE PROCEDURE [constant_contact].[spUpdateaccount_emails]
    @confirm_source_type_Clear bit = 0,
    @confirm_source_type nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @email_address_Clear bit = 0,
    @email_address nvarchar(812) = NULL,
    @confirm_status_Clear bit = 0,
    @confirm_status nvarchar(812) = NULL,
    @roles_Clear bit = 0,
    @roles nvarchar(MAX) = NULL,
    @confirm_time_Clear bit = 0,
    @confirm_time nvarchar(MAX) = NULL,
    @pending_roles_Clear bit = 0,
    @pending_roles nvarchar(MAX) = NULL,
    @email_id nvarchar(450),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[account_emails]
    SET
        [confirm_source_type] = CASE WHEN @confirm_source_type_Clear = 1 THEN NULL ELSE ISNULL(@confirm_source_type, [confirm_source_type]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [email_address] = CASE WHEN @email_address_Clear = 1 THEN NULL ELSE ISNULL(@email_address, [email_address]) END,
        [confirm_status] = CASE WHEN @confirm_status_Clear = 1 THEN NULL ELSE ISNULL(@confirm_status, [confirm_status]) END,
        [roles] = CASE WHEN @roles_Clear = 1 THEN NULL ELSE ISNULL(@roles, [roles]) END,
        [confirm_time] = CASE WHEN @confirm_time_Clear = 1 THEN NULL ELSE ISNULL(@confirm_time, [confirm_time]) END,
        [pending_roles] = CASE WHEN @pending_roles_Clear = 1 THEN NULL ELSE ISNULL(@pending_roles, [pending_roles]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [email_id] = @email_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwAccount_emails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwAccount_emails]
                                    WHERE
                                        [email_id] = @email_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateaccount_emails] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the account_emails table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateaccount_emails]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateaccount_emails];
GO
CREATE TRIGGER [constant_contact].trgUpdateaccount_emails
ON [constant_contact].[account_emails]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[account_emails]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[account_emails] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[email_id] = I.[email_id];
END;
GO

/* spUpdate Permissions for Account Emails */

GRANT EXECUTE ON [constant_contact].[spUpdateaccount_emails] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Account Physical Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Physical Addresses
-- Item: vwAccount_physical_addresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Account Physical Addresses
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  account_physical_address
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwAccount_physical_addresses]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwAccount_physical_addresses];
GO

CREATE VIEW [constant_contact].[vwAccount_physical_addresses]
AS
SELECT
    a.*
FROM
    [constant_contact].[account_physical_address] AS a
GO
GRANT SELECT ON [constant_contact].[vwAccount_physical_addresses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Account Physical Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Physical Addresses
-- Item: Permissions for vwAccount_physical_addresses
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwAccount_physical_addresses] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Account Physical Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Physical Addresses
-- Item: spCreateaccount_physical_address
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR account_physical_address
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateaccount_physical_address]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateaccount_physical_address];
GO

CREATE PROCEDURE [constant_contact].[spCreateaccount_physical_address]
    @city_Clear bit = 0,
    @city nvarchar(812) = NULL,
    @address_line1_Clear bit = 0,
    @address_line1 nvarchar(812) = NULL,
    @country_code_Clear bit = 0,
    @country_code nvarchar(812) = NULL,
    @state_code_Clear bit = 0,
    @state_code nvarchar(812) = NULL,
    @address_line3_Clear bit = 0,
    @address_line3 nvarchar(812) = NULL,
    @ID nvarchar(450) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @postal_code_Clear bit = 0,
    @postal_code nvarchar(812) = NULL,
    @address_line2_Clear bit = 0,
    @address_line2 nvarchar(812) = NULL,
    @state_name_Clear bit = 0,
    @state_name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[account_physical_address]
        (
            [city],
                [address_line1],
                [country_code],
                [state_code],
                [address_line3],
                [mj_e2e_custom_attr],
                [postal_code],
                [address_line2],
                [state_name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [ID]
        )
    VALUES
        (
            CASE WHEN @city_Clear = 1 THEN NULL ELSE ISNULL(@city, NULL) END,
                CASE WHEN @address_line1_Clear = 1 THEN NULL ELSE ISNULL(@address_line1, NULL) END,
                CASE WHEN @country_code_Clear = 1 THEN NULL ELSE ISNULL(@country_code, NULL) END,
                CASE WHEN @state_code_Clear = 1 THEN NULL ELSE ISNULL(@state_code, NULL) END,
                CASE WHEN @address_line3_Clear = 1 THEN NULL ELSE ISNULL(@address_line3, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @postal_code_Clear = 1 THEN NULL ELSE ISNULL(@postal_code, NULL) END,
                CASE WHEN @address_line2_Clear = 1 THEN NULL ELSE ISNULL(@address_line2, NULL) END,
                CASE WHEN @state_name_Clear = 1 THEN NULL ELSE ISNULL(@state_name, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @ID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwAccount_physical_addresses] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateaccount_physical_address] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Account Physical Addresses */

GRANT EXECUTE ON [constant_contact].[spCreateaccount_physical_address] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Account Physical Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Physical Addresses
-- Item: spUpdateaccount_physical_address
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR account_physical_address
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateaccount_physical_address]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateaccount_physical_address];
GO

CREATE PROCEDURE [constant_contact].[spUpdateaccount_physical_address]
    @city_Clear bit = 0,
    @city nvarchar(812) = NULL,
    @address_line1_Clear bit = 0,
    @address_line1 nvarchar(812) = NULL,
    @country_code_Clear bit = 0,
    @country_code nvarchar(812) = NULL,
    @state_code_Clear bit = 0,
    @state_code nvarchar(812) = NULL,
    @address_line3_Clear bit = 0,
    @address_line3 nvarchar(812) = NULL,
    @ID nvarchar(450),
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @postal_code_Clear bit = 0,
    @postal_code nvarchar(812) = NULL,
    @address_line2_Clear bit = 0,
    @address_line2 nvarchar(812) = NULL,
    @state_name_Clear bit = 0,
    @state_name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[account_physical_address]
    SET
        [city] = CASE WHEN @city_Clear = 1 THEN NULL ELSE ISNULL(@city, [city]) END,
        [address_line1] = CASE WHEN @address_line1_Clear = 1 THEN NULL ELSE ISNULL(@address_line1, [address_line1]) END,
        [country_code] = CASE WHEN @country_code_Clear = 1 THEN NULL ELSE ISNULL(@country_code, [country_code]) END,
        [state_code] = CASE WHEN @state_code_Clear = 1 THEN NULL ELSE ISNULL(@state_code, [state_code]) END,
        [address_line3] = CASE WHEN @address_line3_Clear = 1 THEN NULL ELSE ISNULL(@address_line3, [address_line3]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [postal_code] = CASE WHEN @postal_code_Clear = 1 THEN NULL ELSE ISNULL(@postal_code, [postal_code]) END,
        [address_line2] = CASE WHEN @address_line2_Clear = 1 THEN NULL ELSE ISNULL(@address_line2, [address_line2]) END,
        [state_name] = CASE WHEN @state_name_Clear = 1 THEN NULL ELSE ISNULL(@state_name, [state_name]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwAccount_physical_addresses] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwAccount_physical_addresses]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateaccount_physical_address] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the account_physical_address table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateaccount_physical_address]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateaccount_physical_address];
GO
CREATE TRIGGER [constant_contact].trgUpdateaccount_physical_address
ON [constant_contact].[account_physical_address]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[account_physical_address]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[account_physical_address] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Account Physical Addresses */

GRANT EXECUTE ON [constant_contact].[spUpdateaccount_physical_address] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Account Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Summaries
-- Item: vwAccount_summaries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Account Summaries
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  account_summary
-----               PRIMARY KEY: encoded_account_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwAccount_summaries]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwAccount_summaries];
GO

CREATE VIEW [constant_contact].[vwAccount_summaries]
AS
SELECT
    a.*
FROM
    [constant_contact].[account_summary] AS a
GO
GRANT SELECT ON [constant_contact].[vwAccount_summaries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Account Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Summaries
-- Item: Permissions for vwAccount_summaries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwAccount_summaries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Account Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Summaries
-- Item: spCreateaccount_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR account_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateaccount_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateaccount_summary];
GO

CREATE PROCEDURE [constant_contact].[spCreateaccount_summary]
    @company_logo_Clear bit = 0,
    @company_logo nvarchar(MAX) = NULL,
    @physical_address_Clear bit = 0,
    @physical_address nvarchar(MAX) = NULL,
    @encoded_partner_id_Clear bit = 0,
    @encoded_partner_id nvarchar(812) = NULL,
    @organization_phone_Clear bit = 0,
    @organization_phone nvarchar(812) = NULL,
    @organization_name_Clear bit = 0,
    @organization_name nvarchar(812) = NULL,
    @state_code_Clear bit = 0,
    @state_code nvarchar(812) = NULL,
    @country_code_Clear bit = 0,
    @country_code nvarchar(812) = NULL,
    @encoded_account_id nvarchar(450) = NULL,
    @time_zone_id_Clear bit = 0,
    @time_zone_id nvarchar(812) = NULL,
    @website_Clear bit = 0,
    @website nvarchar(812) = NULL,
    @contact_phone_Clear bit = 0,
    @contact_phone nvarchar(812) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(812) = NULL,
    @contact_email_Clear bit = 0,
    @contact_email nvarchar(812) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[account_summary]
        (
            [company_logo],
                [physical_address],
                [encoded_partner_id],
                [organization_phone],
                [organization_name],
                [state_code],
                [country_code],
                [time_zone_id],
                [website],
                [contact_phone],
                [last_name],
                [contact_email],
                [first_name],
                [mj_e2e_custom_attr],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [encoded_account_id]
        )
    VALUES
        (
            CASE WHEN @company_logo_Clear = 1 THEN NULL ELSE ISNULL(@company_logo, NULL) END,
                CASE WHEN @physical_address_Clear = 1 THEN NULL ELSE ISNULL(@physical_address, NULL) END,
                CASE WHEN @encoded_partner_id_Clear = 1 THEN NULL ELSE ISNULL(@encoded_partner_id, NULL) END,
                CASE WHEN @organization_phone_Clear = 1 THEN NULL ELSE ISNULL(@organization_phone, NULL) END,
                CASE WHEN @organization_name_Clear = 1 THEN NULL ELSE ISNULL(@organization_name, NULL) END,
                CASE WHEN @state_code_Clear = 1 THEN NULL ELSE ISNULL(@state_code, NULL) END,
                CASE WHEN @country_code_Clear = 1 THEN NULL ELSE ISNULL(@country_code, NULL) END,
                CASE WHEN @time_zone_id_Clear = 1 THEN NULL ELSE ISNULL(@time_zone_id, NULL) END,
                CASE WHEN @website_Clear = 1 THEN NULL ELSE ISNULL(@website, NULL) END,
                CASE WHEN @contact_phone_Clear = 1 THEN NULL ELSE ISNULL(@contact_phone, NULL) END,
                CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, NULL) END,
                CASE WHEN @contact_email_Clear = 1 THEN NULL ELSE ISNULL(@contact_email, NULL) END,
                CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @encoded_account_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwAccount_summaries] WHERE [encoded_account_id] = @encoded_account_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateaccount_summary] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Account Summaries */

GRANT EXECUTE ON [constant_contact].[spCreateaccount_summary] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Account Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Summaries
-- Item: spUpdateaccount_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR account_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateaccount_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateaccount_summary];
GO

CREATE PROCEDURE [constant_contact].[spUpdateaccount_summary]
    @company_logo_Clear bit = 0,
    @company_logo nvarchar(MAX) = NULL,
    @physical_address_Clear bit = 0,
    @physical_address nvarchar(MAX) = NULL,
    @encoded_partner_id_Clear bit = 0,
    @encoded_partner_id nvarchar(812) = NULL,
    @organization_phone_Clear bit = 0,
    @organization_phone nvarchar(812) = NULL,
    @organization_name_Clear bit = 0,
    @organization_name nvarchar(812) = NULL,
    @state_code_Clear bit = 0,
    @state_code nvarchar(812) = NULL,
    @country_code_Clear bit = 0,
    @country_code nvarchar(812) = NULL,
    @encoded_account_id nvarchar(450),
    @time_zone_id_Clear bit = 0,
    @time_zone_id nvarchar(812) = NULL,
    @website_Clear bit = 0,
    @website nvarchar(812) = NULL,
    @contact_phone_Clear bit = 0,
    @contact_phone nvarchar(812) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(812) = NULL,
    @contact_email_Clear bit = 0,
    @contact_email nvarchar(812) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[account_summary]
    SET
        [company_logo] = CASE WHEN @company_logo_Clear = 1 THEN NULL ELSE ISNULL(@company_logo, [company_logo]) END,
        [physical_address] = CASE WHEN @physical_address_Clear = 1 THEN NULL ELSE ISNULL(@physical_address, [physical_address]) END,
        [encoded_partner_id] = CASE WHEN @encoded_partner_id_Clear = 1 THEN NULL ELSE ISNULL(@encoded_partner_id, [encoded_partner_id]) END,
        [organization_phone] = CASE WHEN @organization_phone_Clear = 1 THEN NULL ELSE ISNULL(@organization_phone, [organization_phone]) END,
        [organization_name] = CASE WHEN @organization_name_Clear = 1 THEN NULL ELSE ISNULL(@organization_name, [organization_name]) END,
        [state_code] = CASE WHEN @state_code_Clear = 1 THEN NULL ELSE ISNULL(@state_code, [state_code]) END,
        [country_code] = CASE WHEN @country_code_Clear = 1 THEN NULL ELSE ISNULL(@country_code, [country_code]) END,
        [time_zone_id] = CASE WHEN @time_zone_id_Clear = 1 THEN NULL ELSE ISNULL(@time_zone_id, [time_zone_id]) END,
        [website] = CASE WHEN @website_Clear = 1 THEN NULL ELSE ISNULL(@website, [website]) END,
        [contact_phone] = CASE WHEN @contact_phone_Clear = 1 THEN NULL ELSE ISNULL(@contact_phone, [contact_phone]) END,
        [last_name] = CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, [last_name]) END,
        [contact_email] = CASE WHEN @contact_email_Clear = 1 THEN NULL ELSE ISNULL(@contact_email, [contact_email]) END,
        [first_name] = CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, [first_name]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [encoded_account_id] = @encoded_account_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwAccount_summaries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwAccount_summaries]
                                    WHERE
                                        [encoded_account_id] = @encoded_account_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateaccount_summary] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the account_summary table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateaccount_summary]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateaccount_summary];
GO
CREATE TRIGGER [constant_contact].trgUpdateaccount_summary
ON [constant_contact].[account_summary]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[account_summary]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[account_summary] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[encoded_account_id] = I.[encoded_account_id];
END;
GO

/* spUpdate Permissions for Account Summaries */

GRANT EXECUTE ON [constant_contact].[spUpdateaccount_summary] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Account User Privileges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account User Privileges
-- Item: vwAccount_user_privileges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Account User Privileges
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  account_user_privileges
-----               PRIMARY KEY: privilege_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwAccount_user_privileges]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwAccount_user_privileges];
GO

CREATE VIEW [constant_contact].[vwAccount_user_privileges]
AS
SELECT
    a.*
FROM
    [constant_contact].[account_user_privileges] AS a
GO
GRANT SELECT ON [constant_contact].[vwAccount_user_privileges] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Account User Privileges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account User Privileges
-- Item: Permissions for vwAccount_user_privileges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwAccount_user_privileges] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Account User Privileges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account User Privileges
-- Item: spCreateaccount_user_privileges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR account_user_privileges
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateaccount_user_privileges]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateaccount_user_privileges];
GO

CREATE PROCEDURE [constant_contact].[spCreateaccount_user_privileges]
    @privilege_name_Clear bit = 0,
    @privilege_name nvarchar(812) = NULL,
    @privilege_id nvarchar(450) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[account_user_privileges]
        (
            [privilege_name],
                [mj_e2e_custom_attr],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [privilege_id]
        )
    VALUES
        (
            CASE WHEN @privilege_name_Clear = 1 THEN NULL ELSE ISNULL(@privilege_name, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @privilege_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwAccount_user_privileges] WHERE [privilege_id] = @privilege_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateaccount_user_privileges] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Account User Privileges */

GRANT EXECUTE ON [constant_contact].[spCreateaccount_user_privileges] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Account User Privileges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account User Privileges
-- Item: spUpdateaccount_user_privileges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR account_user_privileges
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateaccount_user_privileges]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateaccount_user_privileges];
GO

CREATE PROCEDURE [constant_contact].[spUpdateaccount_user_privileges]
    @privilege_name_Clear bit = 0,
    @privilege_name nvarchar(812) = NULL,
    @privilege_id nvarchar(450),
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[account_user_privileges]
    SET
        [privilege_name] = CASE WHEN @privilege_name_Clear = 1 THEN NULL ELSE ISNULL(@privilege_name, [privilege_name]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [privilege_id] = @privilege_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwAccount_user_privileges] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwAccount_user_privileges]
                                    WHERE
                                        [privilege_id] = @privilege_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateaccount_user_privileges] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the account_user_privileges table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateaccount_user_privileges]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateaccount_user_privileges];
GO
CREATE TRIGGER [constant_contact].trgUpdateaccount_user_privileges
ON [constant_contact].[account_user_privileges]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[account_user_privileges]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[account_user_privileges] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[privilege_id] = I.[privilege_id];
END;
GO

/* spUpdate Permissions for Account User Privileges */

GRANT EXECUTE ON [constant_contact].[spUpdateaccount_user_privileges] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities];
GO

CREATE VIEW [constant_contact].[vwActivities]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: Permissions for vwActivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spCreateactivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities]
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @source_file_name_Clear bit = 0,
    @source_file_name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities]
        (
            [created_at],
                [mj_e2e_custom_attr],
                [percent_done],
                [updated_at],
                [started_at],
                [completed_at],
                [state],
                [status],
                [_links],
                [activity_errors],
                [source_file_name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @source_file_name_Clear = 1 THEN NULL ELSE ISNULL(@source_file_name, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities */

GRANT EXECUTE ON [constant_contact].[spCreateactivities] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spUpdateactivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities]
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @source_file_name_Clear bit = 0,
    @source_file_name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities]
    SET
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [source_file_name] = CASE WHEN @source_file_name_Clear = 1 THEN NULL ELSE ISNULL(@source_file_name, [source_file_name]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities
ON [constant_contact].[activities]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Account Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Emails
-- Item: spDeleteaccount_emails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR account_emails
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteaccount_emails]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteaccount_emails];
GO

CREATE PROCEDURE [constant_contact].[spDeleteaccount_emails]
    @email_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[account_emails]
    WHERE
        [email_id] = @email_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [email_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @email_id AS [email_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteaccount_emails] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Account Emails */

GRANT EXECUTE ON [constant_contact].[spDeleteaccount_emails] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Account Physical Addresses */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Physical Addresses
-- Item: spDeleteaccount_physical_address
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR account_physical_address
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteaccount_physical_address]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteaccount_physical_address];
GO

CREATE PROCEDURE [constant_contact].[spDeleteaccount_physical_address]
    @ID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[account_physical_address]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteaccount_physical_address] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Account Physical Addresses */

GRANT EXECUTE ON [constant_contact].[spDeleteaccount_physical_address] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Account Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account Summaries
-- Item: spDeleteaccount_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR account_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteaccount_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteaccount_summary];
GO

CREATE PROCEDURE [constant_contact].[spDeleteaccount_summary]
    @encoded_account_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[account_summary]
    WHERE
        [encoded_account_id] = @encoded_account_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [encoded_account_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @encoded_account_id AS [encoded_account_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteaccount_summary] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Account Summaries */

GRANT EXECUTE ON [constant_contact].[spDeleteaccount_summary] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Account User Privileges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Account User Privileges
-- Item: spDeleteaccount_user_privileges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR account_user_privileges
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteaccount_user_privileges]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteaccount_user_privileges];
GO

CREATE PROCEDURE [constant_contact].[spDeleteaccount_user_privileges]
    @privilege_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[account_user_privileges]
    WHERE
        [privilege_id] = @privilege_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [privilege_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @privilege_id AS [privilege_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteaccount_user_privileges] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Account User Privileges */

GRANT EXECUTE ON [constant_contact].[spDeleteaccount_user_privileges] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities
-- Item: spDeleteactivities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for activities_contacts_delete */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Deletes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities_contacts_file_import */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts File Imports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities_contacts_json_import */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Json Imports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities_contacts_taggings_add */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Adds
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities_contacts_taggings_remove */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Removes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Activities Contacts Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Deletes
-- Item: vwActivities_contacts_deletes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities Contacts Deletes
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_contacts_delete
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_contacts_deletes]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_contacts_deletes];
GO

CREATE VIEW [constant_contact].[vwActivities_contacts_deletes]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_contacts_delete] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_contacts_deletes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities Contacts Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Deletes
-- Item: Permissions for vwActivities_contacts_deletes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_contacts_deletes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities Contacts Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Deletes
-- Item: spCreateactivities_contacts_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_contacts_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_contacts_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_contacts_delete];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_contacts_delete]
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @activity_id nvarchar(450) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_contacts_delete]
        (
            [_links],
                [created_at],
                [mj_e2e_custom_attr],
                [started_at],
                [completed_at],
                [state],
                [updated_at],
                [status],
                [percent_done],
                [activity_errors],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_contacts_deletes] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_delete] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities Contacts Deletes */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_delete] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities Contacts Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Deletes
-- Item: spUpdateactivities_contacts_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_contacts_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_contacts_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_contacts_delete];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_contacts_delete]
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @activity_id nvarchar(450),
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_delete]
    SET
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_contacts_deletes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_contacts_deletes]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_delete] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_contacts_delete table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_contacts_delete]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_contacts_delete];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_contacts_delete
ON [constant_contact].[activities_contacts_delete]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_delete]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_contacts_delete] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities Contacts Deletes */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_delete] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities Contacts File Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts File Imports
-- Item: vwActivities_contacts_file_imports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities Contacts File Imports
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_contacts_file_import
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_contacts_file_imports]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_contacts_file_imports];
GO

CREATE VIEW [constant_contact].[vwActivities_contacts_file_imports]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_contacts_file_import] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_contacts_file_imports] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities Contacts File Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts File Imports
-- Item: Permissions for vwActivities_contacts_file_imports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_contacts_file_imports] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities Contacts File Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts File Imports
-- Item: spCreateactivities_contacts_file_import
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_contacts_file_import
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_contacts_file_import]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_contacts_file_import];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_contacts_file_import]
    @source_file_name_Clear bit = 0,
    @source_file_name nvarchar(812) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_contacts_file_import]
        (
            [source_file_name],
                [state],
                [updated_at],
                [mj_e2e_custom_attr],
                [started_at],
                [status],
                [created_at],
                [percent_done],
                [_links],
                [completed_at],
                [activity_errors],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @source_file_name_Clear = 1 THEN NULL ELSE ISNULL(@source_file_name, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_contacts_file_imports] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_file_import] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities Contacts File Imports */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_file_import] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities Contacts File Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts File Imports
-- Item: spUpdateactivities_contacts_file_import
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_contacts_file_import
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_contacts_file_import]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_contacts_file_import];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_contacts_file_import]
    @source_file_name_Clear bit = 0,
    @source_file_name nvarchar(812) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_file_import]
    SET
        [source_file_name] = CASE WHEN @source_file_name_Clear = 1 THEN NULL ELSE ISNULL(@source_file_name, [source_file_name]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_contacts_file_imports] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_contacts_file_imports]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_file_import] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_contacts_file_import table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_contacts_file_import]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_contacts_file_import];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_contacts_file_import
ON [constant_contact].[activities_contacts_file_import]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_file_import]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_contacts_file_import] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities Contacts File Imports */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_file_import] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities Contacts Json Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Json Imports
-- Item: vwActivities_contacts_json_imports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities Contacts Json Imports
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_contacts_json_import
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_contacts_json_imports]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_contacts_json_imports];
GO

CREATE VIEW [constant_contact].[vwActivities_contacts_json_imports]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_contacts_json_import] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_contacts_json_imports] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities Contacts Json Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Json Imports
-- Item: Permissions for vwActivities_contacts_json_imports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_contacts_json_imports] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities Contacts Json Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Json Imports
-- Item: spCreateactivities_contacts_json_import
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_contacts_json_import
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_contacts_json_import]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_contacts_json_import];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_contacts_json_import]
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @source_file_name_Clear bit = 0,
    @source_file_name nvarchar(812) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_contacts_json_import]
        (
            [updated_at],
                [completed_at],
                [activity_errors],
                [status],
                [created_at],
                [mj_e2e_custom_attr],
                [_links],
                [source_file_name],
                [state],
                [percent_done],
                [started_at],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @source_file_name_Clear = 1 THEN NULL ELSE ISNULL(@source_file_name, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_contacts_json_imports] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_json_import] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities Contacts Json Imports */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_json_import] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities Contacts Json Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Json Imports
-- Item: spUpdateactivities_contacts_json_import
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_contacts_json_import
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_contacts_json_import]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_contacts_json_import];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_contacts_json_import]
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @source_file_name_Clear bit = 0,
    @source_file_name nvarchar(812) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_json_import]
    SET
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [source_file_name] = CASE WHEN @source_file_name_Clear = 1 THEN NULL ELSE ISNULL(@source_file_name, [source_file_name]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_contacts_json_imports] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_contacts_json_imports]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_json_import] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_contacts_json_import table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_contacts_json_import]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_contacts_json_import];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_contacts_json_import
ON [constant_contact].[activities_contacts_json_import]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_json_import]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_contacts_json_import] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities Contacts Json Imports */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_json_import] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities Contacts Taggings Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Adds
-- Item: vwActivities_contacts_taggings_adds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities Contacts Taggings Adds
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_contacts_taggings_add
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_contacts_taggings_adds]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_contacts_taggings_adds];
GO

CREATE VIEW [constant_contact].[vwActivities_contacts_taggings_adds]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_contacts_taggings_add] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_contacts_taggings_adds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities Contacts Taggings Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Adds
-- Item: Permissions for vwActivities_contacts_taggings_adds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_contacts_taggings_adds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities Contacts Taggings Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Adds
-- Item: spCreateactivities_contacts_taggings_add
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_contacts_taggings_add
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_contacts_taggings_add]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_contacts_taggings_add];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_contacts_taggings_add]
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_contacts_taggings_add]
        (
            [started_at],
                [mj_e2e_custom_attr],
                [_links],
                [updated_at],
                [activity_errors],
                [completed_at],
                [percent_done],
                [created_at],
                [status],
                [state],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_contacts_taggings_adds] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_taggings_add] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities Contacts Taggings Adds */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_taggings_add] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities Contacts Taggings Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Adds
-- Item: spUpdateactivities_contacts_taggings_add
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_contacts_taggings_add
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_contacts_taggings_add]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_contacts_taggings_add];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_contacts_taggings_add]
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_taggings_add]
    SET
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_contacts_taggings_adds] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_contacts_taggings_adds]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_taggings_add] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_contacts_taggings_add table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_contacts_taggings_add]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_contacts_taggings_add];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_contacts_taggings_add
ON [constant_contact].[activities_contacts_taggings_add]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_taggings_add]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_contacts_taggings_add] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities Contacts Taggings Adds */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_taggings_add] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities Contacts Taggings Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Removes
-- Item: vwActivities_contacts_taggings_removes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities Contacts Taggings Removes
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_contacts_taggings_remove
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_contacts_taggings_removes]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_contacts_taggings_removes];
GO

CREATE VIEW [constant_contact].[vwActivities_contacts_taggings_removes]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_contacts_taggings_remove] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_contacts_taggings_removes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities Contacts Taggings Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Removes
-- Item: Permissions for vwActivities_contacts_taggings_removes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_contacts_taggings_removes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities Contacts Taggings Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Removes
-- Item: spCreateactivities_contacts_taggings_remove
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_contacts_taggings_remove
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_contacts_taggings_remove]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_contacts_taggings_remove];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_contacts_taggings_remove]
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_contacts_taggings_remove]
        (
            [activity_errors],
                [updated_at],
                [mj_e2e_custom_attr],
                [completed_at],
                [state],
                [_links],
                [created_at],
                [percent_done],
                [status],
                [started_at],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_contacts_taggings_removes] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_taggings_remove] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities Contacts Taggings Removes */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_taggings_remove] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities Contacts Taggings Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Removes
-- Item: spUpdateactivities_contacts_taggings_remove
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_contacts_taggings_remove
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_contacts_taggings_remove]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_contacts_taggings_remove];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_contacts_taggings_remove]
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_taggings_remove]
    SET
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_contacts_taggings_removes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_contacts_taggings_removes]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_taggings_remove] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_contacts_taggings_remove table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_contacts_taggings_remove]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_contacts_taggings_remove];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_contacts_taggings_remove
ON [constant_contact].[activities_contacts_taggings_remove]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_taggings_remove]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_contacts_taggings_remove] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities Contacts Taggings Removes */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_taggings_remove] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities Contacts Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Deletes
-- Item: spDeleteactivities_contacts_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_contacts_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_contacts_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_contacts_delete];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_contacts_delete]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_contacts_delete]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_delete] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities Contacts Deletes */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_delete] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities Contacts File Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts File Imports
-- Item: spDeleteactivities_contacts_file_import
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_contacts_file_import
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_contacts_file_import]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_contacts_file_import];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_contacts_file_import]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_contacts_file_import]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_file_import] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities Contacts File Imports */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_file_import] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities Contacts Json Imports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Json Imports
-- Item: spDeleteactivities_contacts_json_import
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_contacts_json_import
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_contacts_json_import]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_contacts_json_import];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_contacts_json_import]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_contacts_json_import]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_json_import] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities Contacts Json Imports */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_json_import] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities Contacts Taggings Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Adds
-- Item: spDeleteactivities_contacts_taggings_add
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_contacts_taggings_add
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_contacts_taggings_add]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_contacts_taggings_add];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_contacts_taggings_add]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_contacts_taggings_add]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_taggings_add] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities Contacts Taggings Adds */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_taggings_add] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities Contacts Taggings Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Taggings Removes
-- Item: spDeleteactivities_contacts_taggings_remove
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_contacts_taggings_remove
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_contacts_taggings_remove]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_contacts_taggings_remove];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_contacts_taggings_remove]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_contacts_taggings_remove]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_taggings_remove] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities Contacts Taggings Removes */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_taggings_remove] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for activities_contacts_tags_delete */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Tags Deletes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities_custom_fields_delete */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Custom Fields Deletes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities_list_delete */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Deletes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities_list_memberships_add */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Adds
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for activities_list_memberships_remove */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Removes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Activities Contacts Tags Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Tags Deletes
-- Item: vwActivities_contacts_tags_deletes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities Contacts Tags Deletes
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_contacts_tags_delete
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_contacts_tags_deletes]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_contacts_tags_deletes];
GO

CREATE VIEW [constant_contact].[vwActivities_contacts_tags_deletes]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_contacts_tags_delete] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_contacts_tags_deletes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities Contacts Tags Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Tags Deletes
-- Item: Permissions for vwActivities_contacts_tags_deletes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_contacts_tags_deletes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities Contacts Tags Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Tags Deletes
-- Item: spCreateactivities_contacts_tags_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_contacts_tags_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_contacts_tags_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_contacts_tags_delete];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_contacts_tags_delete]
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_contacts_tags_delete]
        (
            [mj_e2e_custom_attr],
                [state],
                [_links],
                [completed_at],
                [status],
                [updated_at],
                [created_at],
                [percent_done],
                [activity_errors],
                [started_at],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_contacts_tags_deletes] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_tags_delete] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities Contacts Tags Deletes */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_contacts_tags_delete] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities Contacts Tags Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Tags Deletes
-- Item: spUpdateactivities_contacts_tags_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_contacts_tags_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_contacts_tags_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_contacts_tags_delete];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_contacts_tags_delete]
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_tags_delete]
    SET
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_contacts_tags_deletes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_contacts_tags_deletes]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_tags_delete] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_contacts_tags_delete table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_contacts_tags_delete]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_contacts_tags_delete];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_contacts_tags_delete
ON [constant_contact].[activities_contacts_tags_delete]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_contacts_tags_delete]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_contacts_tags_delete] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities Contacts Tags Deletes */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_contacts_tags_delete] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities Custom Fields Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Custom Fields Deletes
-- Item: vwActivities_custom_fields_deletes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities Custom Fields Deletes
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_custom_fields_delete
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_custom_fields_deletes]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_custom_fields_deletes];
GO

CREATE VIEW [constant_contact].[vwActivities_custom_fields_deletes]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_custom_fields_delete] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_custom_fields_deletes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities Custom Fields Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Custom Fields Deletes
-- Item: Permissions for vwActivities_custom_fields_deletes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_custom_fields_deletes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities Custom Fields Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Custom Fields Deletes
-- Item: spCreateactivities_custom_fields_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_custom_fields_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_custom_fields_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_custom_fields_delete];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_custom_fields_delete]
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_custom_fields_delete]
        (
            [_links],
                [completed_at],
                [percent_done],
                [created_at],
                [state],
                [updated_at],
                [mj_e2e_custom_attr],
                [activity_errors],
                [started_at],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_custom_fields_deletes] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_custom_fields_delete] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities Custom Fields Deletes */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_custom_fields_delete] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities Custom Fields Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Custom Fields Deletes
-- Item: spUpdateactivities_custom_fields_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_custom_fields_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_custom_fields_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_custom_fields_delete];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_custom_fields_delete]
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_custom_fields_delete]
    SET
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_custom_fields_deletes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_custom_fields_deletes]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_custom_fields_delete] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_custom_fields_delete table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_custom_fields_delete]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_custom_fields_delete];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_custom_fields_delete
ON [constant_contact].[activities_custom_fields_delete]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_custom_fields_delete]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_custom_fields_delete] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities Custom Fields Deletes */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_custom_fields_delete] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities List Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Deletes
-- Item: vwActivities_list_deletes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities List Deletes
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_list_delete
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_list_deletes]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_list_deletes];
GO

CREATE VIEW [constant_contact].[vwActivities_list_deletes]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_list_delete] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_list_deletes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities List Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Deletes
-- Item: Permissions for vwActivities_list_deletes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_list_deletes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities List Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Deletes
-- Item: spCreateactivities_list_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_list_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_list_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_list_delete];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_list_delete]
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_list_delete]
        (
            [updated_at],
                [activity_errors],
                [state],
                [status],
                [mj_e2e_custom_attr],
                [completed_at],
                [started_at],
                [percent_done],
                [_links],
                [created_at],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_list_deletes] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_list_delete] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities List Deletes */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_list_delete] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities List Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Deletes
-- Item: spUpdateactivities_list_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_list_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_list_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_list_delete];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_list_delete]
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_list_delete]
    SET
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_list_deletes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_list_deletes]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_list_delete] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_list_delete table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_list_delete]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_list_delete];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_list_delete
ON [constant_contact].[activities_list_delete]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_list_delete]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_list_delete] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities List Deletes */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_list_delete] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities List Memberships Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Adds
-- Item: vwActivities_list_memberships_adds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities List Memberships Adds
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_list_memberships_add
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_list_memberships_adds]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_list_memberships_adds];
GO

CREATE VIEW [constant_contact].[vwActivities_list_memberships_adds]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_list_memberships_add] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_list_memberships_adds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities List Memberships Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Adds
-- Item: Permissions for vwActivities_list_memberships_adds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_list_memberships_adds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities List Memberships Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Adds
-- Item: spCreateactivities_list_memberships_add
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_list_memberships_add
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_list_memberships_add]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_list_memberships_add];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_list_memberships_add]
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_list_memberships_add]
        (
            [percent_done],
                [updated_at],
                [mj_e2e_custom_attr],
                [_links],
                [status],
                [started_at],
                [created_at],
                [activity_errors],
                [completed_at],
                [state],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_list_memberships_adds] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_list_memberships_add] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities List Memberships Adds */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_list_memberships_add] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities List Memberships Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Adds
-- Item: spUpdateactivities_list_memberships_add
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_list_memberships_add
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_list_memberships_add]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_list_memberships_add];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_list_memberships_add]
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_list_memberships_add]
    SET
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_list_memberships_adds] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_list_memberships_adds]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_list_memberships_add] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_list_memberships_add table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_list_memberships_add]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_list_memberships_add];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_list_memberships_add
ON [constant_contact].[activities_list_memberships_add]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_list_memberships_add]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_list_memberships_add] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities List Memberships Adds */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_list_memberships_add] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Activities List Memberships Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Removes
-- Item: vwActivities_list_memberships_removes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Activities List Memberships Removes
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  activities_list_memberships_remove
-----               PRIMARY KEY: activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwActivities_list_memberships_removes]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwActivities_list_memberships_removes];
GO

CREATE VIEW [constant_contact].[vwActivities_list_memberships_removes]
AS
SELECT
    a.*
FROM
    [constant_contact].[activities_list_memberships_remove] AS a
GO
GRANT SELECT ON [constant_contact].[vwActivities_list_memberships_removes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Activities List Memberships Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Removes
-- Item: Permissions for vwActivities_list_memberships_removes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwActivities_list_memberships_removes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Activities List Memberships Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Removes
-- Item: spCreateactivities_list_memberships_remove
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR activities_list_memberships_remove
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateactivities_list_memberships_remove]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateactivities_list_memberships_remove];
GO

CREATE PROCEDURE [constant_contact].[spCreateactivities_list_memberships_remove]
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450) = NULL,
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[activities_list_memberships_remove]
        (
            [_links],
                [activity_errors],
                [updated_at],
                [status],
                [percent_done],
                [completed_at],
                [started_at],
                [state],
                [mj_e2e_custom_attr],
                [created_at],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [activity_id]
        )
    VALUES
        (
            CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, NULL) END,
                CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, NULL) END,
                CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, NULL) END,
                CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, NULL) END,
                CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwActivities_list_memberships_removes] WHERE [activity_id] = @activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateactivities_list_memberships_remove] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Activities List Memberships Removes */

GRANT EXECUTE ON [constant_contact].[spCreateactivities_list_memberships_remove] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Activities List Memberships Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Removes
-- Item: spUpdateactivities_list_memberships_remove
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR activities_list_memberships_remove
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateactivities_list_memberships_remove]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateactivities_list_memberships_remove];
GO

CREATE PROCEDURE [constant_contact].[spUpdateactivities_list_memberships_remove]
    @_links_Clear bit = 0,
    @_links nvarchar(MAX) = NULL,
    @activity_errors_Clear bit = 0,
    @activity_errors nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(MAX) = NULL,
    @activity_id nvarchar(450),
    @percent_done_Clear bit = 0,
    @percent_done nvarchar(MAX) = NULL,
    @completed_at_Clear bit = 0,
    @completed_at nvarchar(MAX) = NULL,
    @started_at_Clear bit = 0,
    @started_at nvarchar(MAX) = NULL,
    @state_Clear bit = 0,
    @state nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_list_memberships_remove]
    SET
        [_links] = CASE WHEN @_links_Clear = 1 THEN NULL ELSE ISNULL(@_links, [_links]) END,
        [activity_errors] = CASE WHEN @activity_errors_Clear = 1 THEN NULL ELSE ISNULL(@activity_errors, [activity_errors]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [percent_done] = CASE WHEN @percent_done_Clear = 1 THEN NULL ELSE ISNULL(@percent_done, [percent_done]) END,
        [completed_at] = CASE WHEN @completed_at_Clear = 1 THEN NULL ELSE ISNULL(@completed_at, [completed_at]) END,
        [started_at] = CASE WHEN @started_at_Clear = 1 THEN NULL ELSE ISNULL(@started_at, [started_at]) END,
        [state] = CASE WHEN @state_Clear = 1 THEN NULL ELSE ISNULL(@state, [state]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [activity_id] = @activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwActivities_list_memberships_removes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwActivities_list_memberships_removes]
                                    WHERE
                                        [activity_id] = @activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_list_memberships_remove] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the activities_list_memberships_remove table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateactivities_list_memberships_remove]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateactivities_list_memberships_remove];
GO
CREATE TRIGGER [constant_contact].trgUpdateactivities_list_memberships_remove
ON [constant_contact].[activities_list_memberships_remove]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[activities_list_memberships_remove]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[activities_list_memberships_remove] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[activity_id] = I.[activity_id];
END;
GO

/* spUpdate Permissions for Activities List Memberships Removes */

GRANT EXECUTE ON [constant_contact].[spUpdateactivities_list_memberships_remove] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities Contacts Tags Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Contacts Tags Deletes
-- Item: spDeleteactivities_contacts_tags_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_contacts_tags_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_contacts_tags_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_contacts_tags_delete];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_contacts_tags_delete]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_contacts_tags_delete]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_tags_delete] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities Contacts Tags Deletes */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_contacts_tags_delete] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities Custom Fields Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities Custom Fields Deletes
-- Item: spDeleteactivities_custom_fields_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_custom_fields_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_custom_fields_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_custom_fields_delete];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_custom_fields_delete]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_custom_fields_delete]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_custom_fields_delete] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities Custom Fields Deletes */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_custom_fields_delete] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities List Deletes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Deletes
-- Item: spDeleteactivities_list_delete
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_list_delete
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_list_delete]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_list_delete];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_list_delete]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_list_delete]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_list_delete] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities List Deletes */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_list_delete] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities List Memberships Adds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Adds
-- Item: spDeleteactivities_list_memberships_add
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_list_memberships_add
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_list_memberships_add]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_list_memberships_add];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_list_memberships_add]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_list_memberships_add]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_list_memberships_add] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities List Memberships Adds */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_list_memberships_add] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Activities List Memberships Removes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Activities List Memberships Removes
-- Item: spDeleteactivities_list_memberships_remove
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR activities_list_memberships_remove
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteactivities_list_memberships_remove]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteactivities_list_memberships_remove];
GO

CREATE PROCEDURE [constant_contact].[spDeleteactivities_list_memberships_remove]
    @activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[activities_list_memberships_remove]
    WHERE
        [activity_id] = @activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @activity_id AS [activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteactivities_list_memberships_remove] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Activities List Memberships Removes */

GRANT EXECUTE ON [constant_contact].[spDeleteactivities_list_memberships_remove] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for contact_custom_fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Custom Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for contact_lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for contact_lists_xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists Xrefs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key list_id in table contact_lists_xrefs
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_contact_lists_xrefs_list_id' 
    AND object_id = OBJECT_ID('[constant_contact].[contact_lists_xrefs]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_contact_lists_xrefs_list_id ON [constant_contact].[contact_lists_xrefs] ([list_id]);

/* Index for Foreign Keys for contact_reports_activity_summary */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Activity Summaries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key campaign_activity_id in table contact_reports_activity_summary
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_contact_reports_activity_summary_campaign_activity_id' 
    AND object_id = OBJECT_ID('[constant_contact].[contact_reports_activity_summary]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_contact_reports_activity_summary_campaign_activity_id ON [constant_contact].[contact_reports_activity_summary] ([campaign_activity_id]);

/* Index for Foreign Keys for contact_reports_open_and_click_rates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Open And Click Rates
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key contact_id in table contact_reports_open_and_click_rates
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_contact_reports_open_and_click_rates_contact_id' 
    AND object_id = OBJECT_ID('[constant_contact].[contact_reports_open_and_click_rates]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_contact_reports_open_and_click_rates_contact_id ON [constant_contact].[contact_reports_open_and_click_rates] ([contact_id]);

/* Base View SQL for Contact Custom Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Custom Fields
-- Item: vwContact_custom_fields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Custom Fields
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contact_custom_fields
-----               PRIMARY KEY: custom_field_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContact_custom_fields]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContact_custom_fields];
GO

CREATE VIEW [constant_contact].[vwContact_custom_fields]
AS
SELECT
    c.*
FROM
    [constant_contact].[contact_custom_fields] AS c
GO
GRANT SELECT ON [constant_contact].[vwContact_custom_fields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contact Custom Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Custom Fields
-- Item: Permissions for vwContact_custom_fields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContact_custom_fields] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contact Custom Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Custom Fields
-- Item: spCreatecontact_custom_fields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contact_custom_fields
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontact_custom_fields]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontact_custom_fields];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontact_custom_fields]
    @custom_field_id nvarchar(450) = NULL,
    @choices_Clear bit = 0,
    @choices nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @metadata_Clear bit = 0,
    @metadata nvarchar(MAX) = NULL,
    @version_Clear bit = 0,
    @version nvarchar(MAX) = NULL,
    @label_Clear bit = 0,
    @label nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contact_custom_fields]
        (
            [choices],
                [updated_at],
                [metadata],
                [version],
                [label],
                [created_at],
                [mj_e2e_custom_attr],
                [type],
                [name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [custom_field_id]
        )
    VALUES
        (
            CASE WHEN @choices_Clear = 1 THEN NULL ELSE ISNULL(@choices, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @metadata_Clear = 1 THEN NULL ELSE ISNULL(@metadata, NULL) END,
                CASE WHEN @version_Clear = 1 THEN NULL ELSE ISNULL(@version, NULL) END,
                CASE WHEN @label_Clear = 1 THEN NULL ELSE ISNULL(@label, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @custom_field_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContact_custom_fields] WHERE [custom_field_id] = @custom_field_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontact_custom_fields] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contact Custom Fields */

GRANT EXECUTE ON [constant_contact].[spCreatecontact_custom_fields] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contact Custom Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Custom Fields
-- Item: spUpdatecontact_custom_fields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contact_custom_fields
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontact_custom_fields]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontact_custom_fields];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontact_custom_fields]
    @custom_field_id nvarchar(450),
    @choices_Clear bit = 0,
    @choices nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @metadata_Clear bit = 0,
    @metadata nvarchar(MAX) = NULL,
    @version_Clear bit = 0,
    @version nvarchar(MAX) = NULL,
    @label_Clear bit = 0,
    @label nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_custom_fields]
    SET
        [choices] = CASE WHEN @choices_Clear = 1 THEN NULL ELSE ISNULL(@choices, [choices]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [metadata] = CASE WHEN @metadata_Clear = 1 THEN NULL ELSE ISNULL(@metadata, [metadata]) END,
        [version] = CASE WHEN @version_Clear = 1 THEN NULL ELSE ISNULL(@version, [version]) END,
        [label] = CASE WHEN @label_Clear = 1 THEN NULL ELSE ISNULL(@label, [label]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [custom_field_id] = @custom_field_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContact_custom_fields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContact_custom_fields]
                                    WHERE
                                        [custom_field_id] = @custom_field_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_custom_fields] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contact_custom_fields table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontact_custom_fields]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontact_custom_fields];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontact_custom_fields
ON [constant_contact].[contact_custom_fields]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_custom_fields]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contact_custom_fields] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[custom_field_id] = I.[custom_field_id];
END;
GO

/* spUpdate Permissions for Contact Custom Fields */

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_custom_fields] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contact Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists
-- Item: vwContact_lists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Lists
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contact_lists
-----               PRIMARY KEY: list_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContact_lists]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContact_lists];
GO

CREATE VIEW [constant_contact].[vwContact_lists]
AS
SELECT
    c.*
FROM
    [constant_contact].[contact_lists] AS c
GO
GRANT SELECT ON [constant_contact].[vwContact_lists] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contact Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists
-- Item: Permissions for vwContact_lists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContact_lists] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contact Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists
-- Item: spCreatecontact_lists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contact_lists
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontact_lists]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontact_lists];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontact_lists]
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @membership_count_Clear bit = 0,
    @membership_count nvarchar(MAX) = NULL,
    @list_id nvarchar(450) = NULL,
    @favorite_Clear bit = 0,
    @favorite nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @deleted_at_Clear bit = 0,
    @deleted_at nvarchar(MAX) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contact_lists]
        (
            [mj_e2e_custom_attr],
                [description],
                [created_at],
                [membership_count],
                [favorite],
                [updated_at],
                [deleted_at],
                [name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [list_id]
        )
    VALUES
        (
            CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @membership_count_Clear = 1 THEN NULL ELSE ISNULL(@membership_count, NULL) END,
                CASE WHEN @favorite_Clear = 1 THEN NULL ELSE ISNULL(@favorite, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @deleted_at_Clear = 1 THEN NULL ELSE ISNULL(@deleted_at, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @list_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContact_lists] WHERE [list_id] = @list_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontact_lists] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contact Lists */

GRANT EXECUTE ON [constant_contact].[spCreatecontact_lists] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contact Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists
-- Item: spUpdatecontact_lists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contact_lists
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontact_lists]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontact_lists];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontact_lists]
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @membership_count_Clear bit = 0,
    @membership_count nvarchar(MAX) = NULL,
    @list_id nvarchar(450),
    @favorite_Clear bit = 0,
    @favorite nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @deleted_at_Clear bit = 0,
    @deleted_at nvarchar(MAX) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_lists]
    SET
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [membership_count] = CASE WHEN @membership_count_Clear = 1 THEN NULL ELSE ISNULL(@membership_count, [membership_count]) END,
        [favorite] = CASE WHEN @favorite_Clear = 1 THEN NULL ELSE ISNULL(@favorite, [favorite]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [deleted_at] = CASE WHEN @deleted_at_Clear = 1 THEN NULL ELSE ISNULL(@deleted_at, [deleted_at]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [list_id] = @list_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContact_lists] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContact_lists]
                                    WHERE
                                        [list_id] = @list_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_lists] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contact_lists table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontact_lists]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontact_lists];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontact_lists
ON [constant_contact].[contact_lists]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_lists]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contact_lists] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[list_id] = I.[list_id];
END;
GO

/* spUpdate Permissions for Contact Lists */

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_lists] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contact Lists Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists Xrefs
-- Item: vwContact_lists_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Lists Xrefs
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contact_lists_xrefs
-----               PRIMARY KEY: list_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContact_lists_xrefs]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContact_lists_xrefs];
GO

CREATE VIEW [constant_contact].[vwContact_lists_xrefs]
AS
SELECT
    c.*
FROM
    [constant_contact].[contact_lists_xrefs] AS c
GO
GRANT SELECT ON [constant_contact].[vwContact_lists_xrefs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contact Lists Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists Xrefs
-- Item: Permissions for vwContact_lists_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContact_lists_xrefs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contact Lists Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists Xrefs
-- Item: spCreatecontact_lists_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contact_lists_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontact_lists_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontact_lists_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontact_lists_xrefs]
    @sequence_id_Clear bit = 0,
    @sequence_id nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @list_id nvarchar(450) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contact_lists_xrefs]
        (
            [sequence_id],
                [mj_e2e_custom_attr],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [list_id]
        )
    VALUES
        (
            CASE WHEN @sequence_id_Clear = 1 THEN NULL ELSE ISNULL(@sequence_id, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @list_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContact_lists_xrefs] WHERE [list_id] = @list_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontact_lists_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contact Lists Xrefs */

GRANT EXECUTE ON [constant_contact].[spCreatecontact_lists_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contact Lists Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists Xrefs
-- Item: spUpdatecontact_lists_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contact_lists_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontact_lists_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontact_lists_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontact_lists_xrefs]
    @sequence_id_Clear bit = 0,
    @sequence_id nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @list_id nvarchar(450),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_lists_xrefs]
    SET
        [sequence_id] = CASE WHEN @sequence_id_Clear = 1 THEN NULL ELSE ISNULL(@sequence_id, [sequence_id]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [list_id] = @list_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContact_lists_xrefs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContact_lists_xrefs]
                                    WHERE
                                        [list_id] = @list_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_lists_xrefs] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contact_lists_xrefs table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontact_lists_xrefs]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontact_lists_xrefs];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontact_lists_xrefs
ON [constant_contact].[contact_lists_xrefs]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_lists_xrefs]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contact_lists_xrefs] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[list_id] = I.[list_id];
END;
GO

/* spUpdate Permissions for Contact Lists Xrefs */

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_lists_xrefs] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contact Reports Activity Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Activity Summaries
-- Item: vwContact_reports_activity_summaries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Reports Activity Summaries
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contact_reports_activity_summary
-----               PRIMARY KEY: campaign_activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContact_reports_activity_summaries]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContact_reports_activity_summaries];
GO

CREATE VIEW [constant_contact].[vwContact_reports_activity_summaries]
AS
SELECT
    c.*
FROM
    [constant_contact].[contact_reports_activity_summary] AS c
GO
GRANT SELECT ON [constant_contact].[vwContact_reports_activity_summaries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contact Reports Activity Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Activity Summaries
-- Item: Permissions for vwContact_reports_activity_summaries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContact_reports_activity_summaries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contact Reports Activity Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Activity Summaries
-- Item: spCreatecontact_reports_activity_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contact_reports_activity_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontact_reports_activity_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontact_reports_activity_summary];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontact_reports_activity_summary]
    @em_unsubscribes_Clear bit = 0,
    @em_unsubscribes nvarchar(255) = NULL,
    @em_opens_Clear bit = 0,
    @em_opens nvarchar(255) = NULL,
    @em_clicks_Clear bit = 0,
    @em_clicks nvarchar(255) = NULL,
    @campaign_activity_id nvarchar(255) = NULL,
    @em_forwards_Clear bit = 0,
    @em_forwards nvarchar(255) = NULL,
    @em_sends_Clear bit = 0,
    @em_sends nvarchar(255) = NULL,
    @em_bounces_Clear bit = 0,
    @em_bounces nvarchar(255) = NULL,
    @start_on_Clear bit = 0,
    @start_on nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contact_reports_activity_summary]
        (
            [em_unsubscribes],
                [em_opens],
                [em_clicks],
                [em_forwards],
                [em_sends],
                [em_bounces],
                [start_on],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [campaign_activity_id]
        )
    VALUES
        (
            CASE WHEN @em_unsubscribes_Clear = 1 THEN NULL ELSE ISNULL(@em_unsubscribes, NULL) END,
                CASE WHEN @em_opens_Clear = 1 THEN NULL ELSE ISNULL(@em_opens, NULL) END,
                CASE WHEN @em_clicks_Clear = 1 THEN NULL ELSE ISNULL(@em_clicks, NULL) END,
                CASE WHEN @em_forwards_Clear = 1 THEN NULL ELSE ISNULL(@em_forwards, NULL) END,
                CASE WHEN @em_sends_Clear = 1 THEN NULL ELSE ISNULL(@em_sends, NULL) END,
                CASE WHEN @em_bounces_Clear = 1 THEN NULL ELSE ISNULL(@em_bounces, NULL) END,
                CASE WHEN @start_on_Clear = 1 THEN NULL ELSE ISNULL(@start_on, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @campaign_activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContact_reports_activity_summaries] WHERE [campaign_activity_id] = @campaign_activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontact_reports_activity_summary] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contact Reports Activity Summaries */

GRANT EXECUTE ON [constant_contact].[spCreatecontact_reports_activity_summary] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contact Reports Activity Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Activity Summaries
-- Item: spUpdatecontact_reports_activity_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contact_reports_activity_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontact_reports_activity_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontact_reports_activity_summary];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontact_reports_activity_summary]
    @em_unsubscribes_Clear bit = 0,
    @em_unsubscribes nvarchar(255) = NULL,
    @em_opens_Clear bit = 0,
    @em_opens nvarchar(255) = NULL,
    @em_clicks_Clear bit = 0,
    @em_clicks nvarchar(255) = NULL,
    @campaign_activity_id nvarchar(255),
    @em_forwards_Clear bit = 0,
    @em_forwards nvarchar(255) = NULL,
    @em_sends_Clear bit = 0,
    @em_sends nvarchar(255) = NULL,
    @em_bounces_Clear bit = 0,
    @em_bounces nvarchar(255) = NULL,
    @start_on_Clear bit = 0,
    @start_on nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_reports_activity_summary]
    SET
        [em_unsubscribes] = CASE WHEN @em_unsubscribes_Clear = 1 THEN NULL ELSE ISNULL(@em_unsubscribes, [em_unsubscribes]) END,
        [em_opens] = CASE WHEN @em_opens_Clear = 1 THEN NULL ELSE ISNULL(@em_opens, [em_opens]) END,
        [em_clicks] = CASE WHEN @em_clicks_Clear = 1 THEN NULL ELSE ISNULL(@em_clicks, [em_clicks]) END,
        [em_forwards] = CASE WHEN @em_forwards_Clear = 1 THEN NULL ELSE ISNULL(@em_forwards, [em_forwards]) END,
        [em_sends] = CASE WHEN @em_sends_Clear = 1 THEN NULL ELSE ISNULL(@em_sends, [em_sends]) END,
        [em_bounces] = CASE WHEN @em_bounces_Clear = 1 THEN NULL ELSE ISNULL(@em_bounces, [em_bounces]) END,
        [start_on] = CASE WHEN @start_on_Clear = 1 THEN NULL ELSE ISNULL(@start_on, [start_on]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [campaign_activity_id] = @campaign_activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContact_reports_activity_summaries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContact_reports_activity_summaries]
                                    WHERE
                                        [campaign_activity_id] = @campaign_activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_reports_activity_summary] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contact_reports_activity_summary table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontact_reports_activity_summary]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontact_reports_activity_summary];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontact_reports_activity_summary
ON [constant_contact].[contact_reports_activity_summary]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_reports_activity_summary]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contact_reports_activity_summary] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[campaign_activity_id] = I.[campaign_activity_id];
END;
GO

/* spUpdate Permissions for Contact Reports Activity Summaries */

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_reports_activity_summary] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contact Reports Open And Click Rates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Open And Click Rates
-- Item: vwContact_reports_open_and_click_rates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Reports Open And Click Rates
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contact_reports_open_and_click_rates
-----               PRIMARY KEY: contact_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContact_reports_open_and_click_rates]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContact_reports_open_and_click_rates];
GO

CREATE VIEW [constant_contact].[vwContact_reports_open_and_click_rates]
AS
SELECT
    c.*
FROM
    [constant_contact].[contact_reports_open_and_click_rates] AS c
GO
GRANT SELECT ON [constant_contact].[vwContact_reports_open_and_click_rates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contact Reports Open And Click Rates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Open And Click Rates
-- Item: Permissions for vwContact_reports_open_and_click_rates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContact_reports_open_and_click_rates] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contact Reports Open And Click Rates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Open And Click Rates
-- Item: spCreatecontact_reports_open_and_click_rates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contact_reports_open_and_click_rates
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontact_reports_open_and_click_rates]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontact_reports_open_and_click_rates];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontact_reports_open_and_click_rates]
    @included_activities_count_Clear bit = 0,
    @included_activities_count nvarchar(255) = NULL,
    @contact_id nvarchar(255) = NULL,
    @average_open_rate_Clear bit = 0,
    @average_open_rate nvarchar(255) = NULL,
    @average_click_rate_Clear bit = 0,
    @average_click_rate nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contact_reports_open_and_click_rates]
        (
            [included_activities_count],
                [average_open_rate],
                [average_click_rate],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [contact_id]
        )
    VALUES
        (
            CASE WHEN @included_activities_count_Clear = 1 THEN NULL ELSE ISNULL(@included_activities_count, NULL) END,
                CASE WHEN @average_open_rate_Clear = 1 THEN NULL ELSE ISNULL(@average_open_rate, NULL) END,
                CASE WHEN @average_click_rate_Clear = 1 THEN NULL ELSE ISNULL(@average_click_rate, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @contact_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContact_reports_open_and_click_rates] WHERE [contact_id] = @contact_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontact_reports_open_and_click_rates] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contact Reports Open And Click Rates */

GRANT EXECUTE ON [constant_contact].[spCreatecontact_reports_open_and_click_rates] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contact Reports Open And Click Rates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Open And Click Rates
-- Item: spUpdatecontact_reports_open_and_click_rates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contact_reports_open_and_click_rates
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontact_reports_open_and_click_rates]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontact_reports_open_and_click_rates];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontact_reports_open_and_click_rates]
    @included_activities_count_Clear bit = 0,
    @included_activities_count nvarchar(255) = NULL,
    @contact_id nvarchar(255),
    @average_open_rate_Clear bit = 0,
    @average_open_rate nvarchar(255) = NULL,
    @average_click_rate_Clear bit = 0,
    @average_click_rate nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_reports_open_and_click_rates]
    SET
        [included_activities_count] = CASE WHEN @included_activities_count_Clear = 1 THEN NULL ELSE ISNULL(@included_activities_count, [included_activities_count]) END,
        [average_open_rate] = CASE WHEN @average_open_rate_Clear = 1 THEN NULL ELSE ISNULL(@average_open_rate, [average_open_rate]) END,
        [average_click_rate] = CASE WHEN @average_click_rate_Clear = 1 THEN NULL ELSE ISNULL(@average_click_rate, [average_click_rate]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [contact_id] = @contact_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContact_reports_open_and_click_rates] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContact_reports_open_and_click_rates]
                                    WHERE
                                        [contact_id] = @contact_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_reports_open_and_click_rates] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contact_reports_open_and_click_rates table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontact_reports_open_and_click_rates]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontact_reports_open_and_click_rates];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontact_reports_open_and_click_rates
ON [constant_contact].[contact_reports_open_and_click_rates]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_reports_open_and_click_rates]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contact_reports_open_and_click_rates] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[contact_id] = I.[contact_id];
END;
GO

/* spUpdate Permissions for Contact Reports Open And Click Rates */

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_reports_open_and_click_rates] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contact Custom Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Custom Fields
-- Item: spDeletecontact_custom_fields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contact_custom_fields
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontact_custom_fields]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontact_custom_fields];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontact_custom_fields]
    @custom_field_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contact_custom_fields]
    WHERE
        [custom_field_id] = @custom_field_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [custom_field_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @custom_field_id AS [custom_field_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontact_custom_fields] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contact Custom Fields */

GRANT EXECUTE ON [constant_contact].[spDeletecontact_custom_fields] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contact Lists */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists
-- Item: spDeletecontact_lists
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contact_lists
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontact_lists]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontact_lists];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontact_lists]
    @list_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contact_lists]
    WHERE
        [list_id] = @list_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [list_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @list_id AS [list_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontact_lists] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contact Lists */

GRANT EXECUTE ON [constant_contact].[spDeletecontact_lists] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contact Lists Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Lists Xrefs
-- Item: spDeletecontact_lists_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contact_lists_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontact_lists_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontact_lists_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontact_lists_xrefs]
    @list_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contact_lists_xrefs]
    WHERE
        [list_id] = @list_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [list_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @list_id AS [list_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontact_lists_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contact Lists Xrefs */

GRANT EXECUTE ON [constant_contact].[spDeletecontact_lists_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contact Reports Activity Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Activity Summaries
-- Item: spDeletecontact_reports_activity_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contact_reports_activity_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontact_reports_activity_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontact_reports_activity_summary];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontact_reports_activity_summary]
    @campaign_activity_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contact_reports_activity_summary]
    WHERE
        [campaign_activity_id] = @campaign_activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [campaign_activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @campaign_activity_id AS [campaign_activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontact_reports_activity_summary] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contact Reports Activity Summaries */

GRANT EXECUTE ON [constant_contact].[spDeletecontact_reports_activity_summary] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contact Reports Open And Click Rates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Reports Open And Click Rates
-- Item: spDeletecontact_reports_open_and_click_rates
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contact_reports_open_and_click_rates
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontact_reports_open_and_click_rates]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontact_reports_open_and_click_rates];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontact_reports_open_and_click_rates]
    @contact_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contact_reports_open_and_click_rates]
    WHERE
        [contact_id] = @contact_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [contact_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @contact_id AS [contact_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontact_reports_open_and_click_rates] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contact Reports Open And Click Rates */

GRANT EXECUTE ON [constant_contact].[spDeletecontact_reports_open_and_click_rates] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for contact_tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for contacts_counts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Counts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for contacts_sign_up_form */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Sign Up Forms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key contact_id in table contacts_sign_up_form
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_contacts_sign_up_form_contact_id' 
    AND object_id = OBJECT_ID('[constant_contact].[contacts_sign_up_form]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_contacts_sign_up_form_contact_id ON [constant_contact].[contacts_sign_up_form] ([contact_id]);

/* Index for Foreign Keys for contacts_xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Xrefs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key contact_id in table contacts_xrefs
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_contacts_xrefs_contact_id' 
    AND object_id = OBJECT_ID('[constant_contact].[contacts_xrefs]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_contacts_xrefs_contact_id ON [constant_contact].[contacts_xrefs] ([contact_id]);

/* Base View SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: vwContact_tags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contact Tags
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contact_tags
-----               PRIMARY KEY: tag_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContact_tags]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContact_tags];
GO

CREATE VIEW [constant_contact].[vwContact_tags]
AS
SELECT
    c.*
FROM
    [constant_contact].[contact_tags] AS c
GO
GRANT SELECT ON [constant_contact].[vwContact_tags] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: Permissions for vwContact_tags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContact_tags] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spCreatecontact_tags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contact_tags
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontact_tags]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontact_tags];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontact_tags]
    @tag_source_Clear bit = 0,
    @tag_source nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @tag_id nvarchar(450) = NULL,
    @contacts_count_Clear bit = 0,
    @contacts_count nvarchar(MAX) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contact_tags]
        (
            [tag_source],
                [mj_e2e_custom_attr],
                [created_at],
                [contacts_count],
                [name],
                [updated_at],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [tag_id]
        )
    VALUES
        (
            CASE WHEN @tag_source_Clear = 1 THEN NULL ELSE ISNULL(@tag_source, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @contacts_count_Clear = 1 THEN NULL ELSE ISNULL(@contacts_count, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @tag_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContact_tags] WHERE [tag_id] = @tag_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontact_tags] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contact Tags */

GRANT EXECUTE ON [constant_contact].[spCreatecontact_tags] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spUpdatecontact_tags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contact_tags
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontact_tags]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontact_tags];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontact_tags]
    @tag_source_Clear bit = 0,
    @tag_source nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @tag_id nvarchar(450),
    @contacts_count_Clear bit = 0,
    @contacts_count nvarchar(MAX) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_tags]
    SET
        [tag_source] = CASE WHEN @tag_source_Clear = 1 THEN NULL ELSE ISNULL(@tag_source, [tag_source]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [contacts_count] = CASE WHEN @contacts_count_Clear = 1 THEN NULL ELSE ISNULL(@contacts_count, [contacts_count]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [tag_id] = @tag_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContact_tags] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContact_tags]
                                    WHERE
                                        [tag_id] = @tag_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_tags] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contact_tags table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontact_tags]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontact_tags];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontact_tags
ON [constant_contact].[contact_tags]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contact_tags]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contact_tags] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[tag_id] = I.[tag_id];
END;
GO

/* spUpdate Permissions for Contact Tags */

GRANT EXECUTE ON [constant_contact].[spUpdatecontact_tags] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contacts
-----               PRIMARY KEY: contact_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContacts]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContacts];
GO

CREATE VIEW [constant_contact].[vwContacts]
AS
SELECT
    c.*
FROM
    [constant_contact].[contacts] AS c
GO
GRANT SELECT ON [constant_contact].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: Permissions for vwContacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spCreatecontacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contacts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontacts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontacts];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontacts]
    @notes_Clear bit = 0,
    @notes nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @job_title_Clear bit = 0,
    @job_title nvarchar(812) = NULL,
    @taggings_Clear bit = 0,
    @taggings nvarchar(MAX) = NULL,
    @company_name_Clear bit = 0,
    @company_name nvarchar(812) = NULL,
    @create_source_Clear bit = 0,
    @create_source nvarchar(812) = NULL,
    @anniversary_Clear bit = 0,
    @anniversary nvarchar(812) = NULL,
    @birthday_day_Clear bit = 0,
    @birthday_day nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @deleted_at_Clear bit = 0,
    @deleted_at nvarchar(MAX) = NULL,
    @email_address_Clear bit = 0,
    @email_address nvarchar(MAX) = NULL,
    @update_source_Clear bit = 0,
    @update_source nvarchar(812) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(812) = NULL,
    @birthday_month_Clear bit = 0,
    @birthday_month nvarchar(MAX) = NULL,
    @list_memberships_Clear bit = 0,
    @list_memberships nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @contact_id nvarchar(450) = NULL,
    @last_name_Clear bit = 0,
    @last_name nvarchar(812) = NULL,
    @custom_fields_Clear bit = 0,
    @custom_fields nvarchar(MAX) = NULL,
    @sms_channel_Clear bit = 0,
    @sms_channel nvarchar(MAX) = NULL,
    @phone_numbers_Clear bit = 0,
    @phone_numbers nvarchar(MAX) = NULL,
    @street_addresses_Clear bit = 0,
    @street_addresses nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contacts]
        (
            [notes],
                [mj_e2e_custom_attr],
                [job_title],
                [taggings],
                [company_name],
                [create_source],
                [anniversary],
                [birthday_day],
                [created_at],
                [deleted_at],
                [email_address],
                [update_source],
                [first_name],
                [birthday_month],
                [list_memberships],
                [updated_at],
                [last_name],
                [custom_fields],
                [sms_channel],
                [phone_numbers],
                [street_addresses],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [contact_id]
        )
    VALUES
        (
            CASE WHEN @notes_Clear = 1 THEN NULL ELSE ISNULL(@notes, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @job_title_Clear = 1 THEN NULL ELSE ISNULL(@job_title, NULL) END,
                CASE WHEN @taggings_Clear = 1 THEN NULL ELSE ISNULL(@taggings, NULL) END,
                CASE WHEN @company_name_Clear = 1 THEN NULL ELSE ISNULL(@company_name, NULL) END,
                CASE WHEN @create_source_Clear = 1 THEN NULL ELSE ISNULL(@create_source, NULL) END,
                CASE WHEN @anniversary_Clear = 1 THEN NULL ELSE ISNULL(@anniversary, NULL) END,
                CASE WHEN @birthday_day_Clear = 1 THEN NULL ELSE ISNULL(@birthday_day, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @deleted_at_Clear = 1 THEN NULL ELSE ISNULL(@deleted_at, NULL) END,
                CASE WHEN @email_address_Clear = 1 THEN NULL ELSE ISNULL(@email_address, NULL) END,
                CASE WHEN @update_source_Clear = 1 THEN NULL ELSE ISNULL(@update_source, NULL) END,
                CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, NULL) END,
                CASE WHEN @birthday_month_Clear = 1 THEN NULL ELSE ISNULL(@birthday_month, NULL) END,
                CASE WHEN @list_memberships_Clear = 1 THEN NULL ELSE ISNULL(@list_memberships, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, NULL) END,
                CASE WHEN @custom_fields_Clear = 1 THEN NULL ELSE ISNULL(@custom_fields, NULL) END,
                CASE WHEN @sms_channel_Clear = 1 THEN NULL ELSE ISNULL(@sms_channel, NULL) END,
                CASE WHEN @phone_numbers_Clear = 1 THEN NULL ELSE ISNULL(@phone_numbers, NULL) END,
                CASE WHEN @street_addresses_Clear = 1 THEN NULL ELSE ISNULL(@street_addresses, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @contact_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContacts] WHERE [contact_id] = @contact_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontacts] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contacts */

GRANT EXECUTE ON [constant_contact].[spCreatecontacts] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spUpdatecontacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contacts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontacts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontacts];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontacts]
    @notes_Clear bit = 0,
    @notes nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @job_title_Clear bit = 0,
    @job_title nvarchar(812) = NULL,
    @taggings_Clear bit = 0,
    @taggings nvarchar(MAX) = NULL,
    @company_name_Clear bit = 0,
    @company_name nvarchar(812) = NULL,
    @create_source_Clear bit = 0,
    @create_source nvarchar(812) = NULL,
    @anniversary_Clear bit = 0,
    @anniversary nvarchar(812) = NULL,
    @birthday_day_Clear bit = 0,
    @birthday_day nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @deleted_at_Clear bit = 0,
    @deleted_at nvarchar(MAX) = NULL,
    @email_address_Clear bit = 0,
    @email_address nvarchar(MAX) = NULL,
    @update_source_Clear bit = 0,
    @update_source nvarchar(812) = NULL,
    @first_name_Clear bit = 0,
    @first_name nvarchar(812) = NULL,
    @birthday_month_Clear bit = 0,
    @birthday_month nvarchar(MAX) = NULL,
    @list_memberships_Clear bit = 0,
    @list_memberships nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @contact_id nvarchar(450),
    @last_name_Clear bit = 0,
    @last_name nvarchar(812) = NULL,
    @custom_fields_Clear bit = 0,
    @custom_fields nvarchar(MAX) = NULL,
    @sms_channel_Clear bit = 0,
    @sms_channel nvarchar(MAX) = NULL,
    @phone_numbers_Clear bit = 0,
    @phone_numbers nvarchar(MAX) = NULL,
    @street_addresses_Clear bit = 0,
    @street_addresses nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contacts]
    SET
        [notes] = CASE WHEN @notes_Clear = 1 THEN NULL ELSE ISNULL(@notes, [notes]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [job_title] = CASE WHEN @job_title_Clear = 1 THEN NULL ELSE ISNULL(@job_title, [job_title]) END,
        [taggings] = CASE WHEN @taggings_Clear = 1 THEN NULL ELSE ISNULL(@taggings, [taggings]) END,
        [company_name] = CASE WHEN @company_name_Clear = 1 THEN NULL ELSE ISNULL(@company_name, [company_name]) END,
        [create_source] = CASE WHEN @create_source_Clear = 1 THEN NULL ELSE ISNULL(@create_source, [create_source]) END,
        [anniversary] = CASE WHEN @anniversary_Clear = 1 THEN NULL ELSE ISNULL(@anniversary, [anniversary]) END,
        [birthday_day] = CASE WHEN @birthday_day_Clear = 1 THEN NULL ELSE ISNULL(@birthday_day, [birthday_day]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [deleted_at] = CASE WHEN @deleted_at_Clear = 1 THEN NULL ELSE ISNULL(@deleted_at, [deleted_at]) END,
        [email_address] = CASE WHEN @email_address_Clear = 1 THEN NULL ELSE ISNULL(@email_address, [email_address]) END,
        [update_source] = CASE WHEN @update_source_Clear = 1 THEN NULL ELSE ISNULL(@update_source, [update_source]) END,
        [first_name] = CASE WHEN @first_name_Clear = 1 THEN NULL ELSE ISNULL(@first_name, [first_name]) END,
        [birthday_month] = CASE WHEN @birthday_month_Clear = 1 THEN NULL ELSE ISNULL(@birthday_month, [birthday_month]) END,
        [list_memberships] = CASE WHEN @list_memberships_Clear = 1 THEN NULL ELSE ISNULL(@list_memberships, [list_memberships]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [last_name] = CASE WHEN @last_name_Clear = 1 THEN NULL ELSE ISNULL(@last_name, [last_name]) END,
        [custom_fields] = CASE WHEN @custom_fields_Clear = 1 THEN NULL ELSE ISNULL(@custom_fields, [custom_fields]) END,
        [sms_channel] = CASE WHEN @sms_channel_Clear = 1 THEN NULL ELSE ISNULL(@sms_channel, [sms_channel]) END,
        [phone_numbers] = CASE WHEN @phone_numbers_Clear = 1 THEN NULL ELSE ISNULL(@phone_numbers, [phone_numbers]) END,
        [street_addresses] = CASE WHEN @street_addresses_Clear = 1 THEN NULL ELSE ISNULL(@street_addresses, [street_addresses]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [contact_id] = @contact_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContacts]
                                    WHERE
                                        [contact_id] = @contact_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontacts] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contacts table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontacts]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontacts];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontacts
ON [constant_contact].[contacts]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contacts]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contacts] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[contact_id] = I.[contact_id];
END;
GO

/* spUpdate Permissions for Contacts */

GRANT EXECUTE ON [constant_contact].[spUpdatecontacts] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contacts Counts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Counts
-- Item: vwContacts_counts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts Counts
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contacts_counts
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContacts_counts]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContacts_counts];
GO

CREATE VIEW [constant_contact].[vwContacts_counts]
AS
SELECT
    c.*
FROM
    [constant_contact].[contacts_counts] AS c
GO
GRANT SELECT ON [constant_contact].[vwContacts_counts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contacts Counts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Counts
-- Item: Permissions for vwContacts_counts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContacts_counts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contacts Counts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Counts
-- Item: spCreatecontacts_counts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contacts_counts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontacts_counts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontacts_counts];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontacts_counts]
    @pending_Clear bit = 0,
    @pending nvarchar(MAX) = NULL,
    @explicit_Clear bit = 0,
    @explicit nvarchar(MAX) = NULL,
    @total_Clear bit = 0,
    @total nvarchar(MAX) = NULL,
    @ID nvarchar(450) = NULL,
    @unsubscribed_Clear bit = 0,
    @unsubscribed nvarchar(MAX) = NULL,
    @new_subscriber_Clear bit = 0,
    @new_subscriber nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @implicit_Clear bit = 0,
    @implicit nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contacts_counts]
        (
            [pending],
                [explicit],
                [total],
                [unsubscribed],
                [new_subscriber],
                [mj_e2e_custom_attr],
                [implicit],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [ID]
        )
    VALUES
        (
            CASE WHEN @pending_Clear = 1 THEN NULL ELSE ISNULL(@pending, NULL) END,
                CASE WHEN @explicit_Clear = 1 THEN NULL ELSE ISNULL(@explicit, NULL) END,
                CASE WHEN @total_Clear = 1 THEN NULL ELSE ISNULL(@total, NULL) END,
                CASE WHEN @unsubscribed_Clear = 1 THEN NULL ELSE ISNULL(@unsubscribed, NULL) END,
                CASE WHEN @new_subscriber_Clear = 1 THEN NULL ELSE ISNULL(@new_subscriber, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @implicit_Clear = 1 THEN NULL ELSE ISNULL(@implicit, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @ID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContacts_counts] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontacts_counts] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contacts Counts */

GRANT EXECUTE ON [constant_contact].[spCreatecontacts_counts] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contacts Counts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Counts
-- Item: spUpdatecontacts_counts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contacts_counts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontacts_counts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontacts_counts];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontacts_counts]
    @pending_Clear bit = 0,
    @pending nvarchar(MAX) = NULL,
    @explicit_Clear bit = 0,
    @explicit nvarchar(MAX) = NULL,
    @total_Clear bit = 0,
    @total nvarchar(MAX) = NULL,
    @ID nvarchar(450),
    @unsubscribed_Clear bit = 0,
    @unsubscribed nvarchar(MAX) = NULL,
    @new_subscriber_Clear bit = 0,
    @new_subscriber nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @implicit_Clear bit = 0,
    @implicit nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contacts_counts]
    SET
        [pending] = CASE WHEN @pending_Clear = 1 THEN NULL ELSE ISNULL(@pending, [pending]) END,
        [explicit] = CASE WHEN @explicit_Clear = 1 THEN NULL ELSE ISNULL(@explicit, [explicit]) END,
        [total] = CASE WHEN @total_Clear = 1 THEN NULL ELSE ISNULL(@total, [total]) END,
        [unsubscribed] = CASE WHEN @unsubscribed_Clear = 1 THEN NULL ELSE ISNULL(@unsubscribed, [unsubscribed]) END,
        [new_subscriber] = CASE WHEN @new_subscriber_Clear = 1 THEN NULL ELSE ISNULL(@new_subscriber, [new_subscriber]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [implicit] = CASE WHEN @implicit_Clear = 1 THEN NULL ELSE ISNULL(@implicit, [implicit]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContacts_counts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContacts_counts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontacts_counts] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contacts_counts table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontacts_counts]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontacts_counts];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontacts_counts
ON [constant_contact].[contacts_counts]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contacts_counts]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contacts_counts] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Contacts Counts */

GRANT EXECUTE ON [constant_contact].[spUpdatecontacts_counts] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contacts Sign Up Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Sign Up Forms
-- Item: vwContacts_sign_up_forms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts Sign Up Forms
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contacts_sign_up_form
-----               PRIMARY KEY: contact_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContacts_sign_up_forms]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContacts_sign_up_forms];
GO

CREATE VIEW [constant_contact].[vwContacts_sign_up_forms]
AS
SELECT
    c.*
FROM
    [constant_contact].[contacts_sign_up_form] AS c
GO
GRANT SELECT ON [constant_contact].[vwContacts_sign_up_forms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contacts Sign Up Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Sign Up Forms
-- Item: Permissions for vwContacts_sign_up_forms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContacts_sign_up_forms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contacts Sign Up Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Sign Up Forms
-- Item: spCreatecontacts_sign_up_form
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contacts_sign_up_form
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontacts_sign_up_form]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontacts_sign_up_form];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontacts_sign_up_form]
    @action_Clear bit = 0,
    @action nvarchar(812) = NULL,
    @contact_id nvarchar(450) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contacts_sign_up_form]
        (
            [action],
                [mj_e2e_custom_attr],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [contact_id]
        )
    VALUES
        (
            CASE WHEN @action_Clear = 1 THEN NULL ELSE ISNULL(@action, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @contact_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContacts_sign_up_forms] WHERE [contact_id] = @contact_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontacts_sign_up_form] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contacts Sign Up Forms */

GRANT EXECUTE ON [constant_contact].[spCreatecontacts_sign_up_form] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contacts Sign Up Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Sign Up Forms
-- Item: spUpdatecontacts_sign_up_form
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contacts_sign_up_form
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontacts_sign_up_form]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontacts_sign_up_form];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontacts_sign_up_form]
    @action_Clear bit = 0,
    @action nvarchar(812) = NULL,
    @contact_id nvarchar(450),
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contacts_sign_up_form]
    SET
        [action] = CASE WHEN @action_Clear = 1 THEN NULL ELSE ISNULL(@action, [action]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [contact_id] = @contact_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContacts_sign_up_forms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContacts_sign_up_forms]
                                    WHERE
                                        [contact_id] = @contact_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontacts_sign_up_form] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contacts_sign_up_form table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontacts_sign_up_form]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontacts_sign_up_form];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontacts_sign_up_form
ON [constant_contact].[contacts_sign_up_form]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contacts_sign_up_form]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contacts_sign_up_form] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[contact_id] = I.[contact_id];
END;
GO

/* spUpdate Permissions for Contacts Sign Up Forms */

GRANT EXECUTE ON [constant_contact].[spUpdatecontacts_sign_up_form] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Contacts Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Xrefs
-- Item: vwContacts_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Contacts Xrefs
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  contacts_xrefs
-----               PRIMARY KEY: contact_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwContacts_xrefs]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwContacts_xrefs];
GO

CREATE VIEW [constant_contact].[vwContacts_xrefs]
AS
SELECT
    c.*
FROM
    [constant_contact].[contacts_xrefs] AS c
GO
GRANT SELECT ON [constant_contact].[vwContacts_xrefs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Contacts Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Xrefs
-- Item: Permissions for vwContacts_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwContacts_xrefs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Contacts Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Xrefs
-- Item: spCreatecontacts_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR contacts_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatecontacts_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatecontacts_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spCreatecontacts_xrefs]
    @sequence_id_Clear bit = 0,
    @sequence_id nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @contact_id nvarchar(450) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[contacts_xrefs]
        (
            [sequence_id],
                [mj_e2e_custom_attr],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [contact_id]
        )
    VALUES
        (
            CASE WHEN @sequence_id_Clear = 1 THEN NULL ELSE ISNULL(@sequence_id, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @contact_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwContacts_xrefs] WHERE [contact_id] = @contact_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatecontacts_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Contacts Xrefs */

GRANT EXECUTE ON [constant_contact].[spCreatecontacts_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Contacts Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Xrefs
-- Item: spUpdatecontacts_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR contacts_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatecontacts_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatecontacts_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spUpdatecontacts_xrefs]
    @sequence_id_Clear bit = 0,
    @sequence_id nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @contact_id nvarchar(450),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contacts_xrefs]
    SET
        [sequence_id] = CASE WHEN @sequence_id_Clear = 1 THEN NULL ELSE ISNULL(@sequence_id, [sequence_id]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [contact_id] = @contact_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwContacts_xrefs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwContacts_xrefs]
                                    WHERE
                                        [contact_id] = @contact_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatecontacts_xrefs] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the contacts_xrefs table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatecontacts_xrefs]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatecontacts_xrefs];
GO
CREATE TRIGGER [constant_contact].trgUpdatecontacts_xrefs
ON [constant_contact].[contacts_xrefs]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[contacts_xrefs]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[contacts_xrefs] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[contact_id] = I.[contact_id];
END;
GO

/* spUpdate Permissions for Contacts Xrefs */

GRANT EXECUTE ON [constant_contact].[spUpdatecontacts_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contact Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contact Tags
-- Item: spDeletecontact_tags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contact_tags
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontact_tags]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontact_tags];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontact_tags]
    @tag_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contact_tags]
    WHERE
        [tag_id] = @tag_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [tag_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @tag_id AS [tag_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontact_tags] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contact Tags */

GRANT EXECUTE ON [constant_contact].[spDeletecontact_tags] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts
-- Item: spDeletecontacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contacts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontacts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontacts];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontacts]
    @contact_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contacts]
    WHERE
        [contact_id] = @contact_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [contact_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @contact_id AS [contact_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontacts] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contacts */

GRANT EXECUTE ON [constant_contact].[spDeletecontacts] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contacts Counts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Counts
-- Item: spDeletecontacts_counts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contacts_counts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontacts_counts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontacts_counts];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontacts_counts]
    @ID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contacts_counts]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontacts_counts] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contacts Counts */

GRANT EXECUTE ON [constant_contact].[spDeletecontacts_counts] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contacts Sign Up Forms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Sign Up Forms
-- Item: spDeletecontacts_sign_up_form
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contacts_sign_up_form
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontacts_sign_up_form]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontacts_sign_up_form];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontacts_sign_up_form]
    @contact_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contacts_sign_up_form]
    WHERE
        [contact_id] = @contact_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [contact_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @contact_id AS [contact_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontacts_sign_up_form] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contacts Sign Up Forms */

GRANT EXECUTE ON [constant_contact].[spDeletecontacts_sign_up_form] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Contacts Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Contacts Xrefs
-- Item: spDeletecontacts_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR contacts_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletecontacts_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletecontacts_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spDeletecontacts_xrefs]
    @contact_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[contacts_xrefs]
    WHERE
        [contact_id] = @contact_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [contact_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @contact_id AS [contact_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletecontacts_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Contacts Xrefs */

GRANT EXECUTE ON [constant_contact].[spDeletecontacts_xrefs] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for email_campaign_activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key campaign_id in table email_campaign_activities
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_email_campaign_activities_campaign_id' 
    AND object_id = OBJECT_ID('[constant_contact].[email_campaign_activities]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_email_campaign_activities_campaign_id ON [constant_contact].[email_campaign_activities] ([campaign_id]);

/* Index for Foreign Keys for email_campaign_activity_non_opener_resends */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Non Opener Resends
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for email_campaign_activity_previews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Previews
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key campaign_activity_id in table email_campaign_activity_previews
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_email_campaign_activity_previews_campaign_activity_id' 
    AND object_id = OBJECT_ID('[constant_contact].[email_campaign_activity_previews]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_email_campaign_activity_previews_campaign_activity_id ON [constant_contact].[email_campaign_activity_previews] ([campaign_activity_id]);

/* Index for Foreign Keys for email_campaign_activity_send_history */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Send Histories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for email_reports_links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key list_id in table email_reports_links
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_email_reports_links_list_id' 
    AND object_id = OBJECT_ID('[constant_contact].[email_reports_links]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_email_reports_links_list_id ON [constant_contact].[email_reports_links] ([list_id]);

/* Base View SQL for Email Campaign Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activities
-- Item: vwEmail_campaign_activities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Campaign Activities
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  email_campaign_activities
-----               PRIMARY KEY: campaign_activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEmail_campaign_activities]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEmail_campaign_activities];
GO

CREATE VIEW [constant_contact].[vwEmail_campaign_activities]
AS
SELECT
    e.*
FROM
    [constant_contact].[email_campaign_activities] AS e
GO
GRANT SELECT ON [constant_contact].[vwEmail_campaign_activities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Campaign Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activities
-- Item: Permissions for vwEmail_campaign_activities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEmail_campaign_activities] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Campaign Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activities
-- Item: spCreateemail_campaign_activities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR email_campaign_activities
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateemail_campaign_activities]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateemail_campaign_activities];
GO

CREATE PROCEDURE [constant_contact].[spCreateemail_campaign_activities]
    @from_name_Clear bit = 0,
    @from_name nvarchar(255) = NULL,
    @reply_to_email_Clear bit = 0,
    @reply_to_email nvarchar(255) = NULL,
    @template_id_Clear bit = 0,
    @template_id nvarchar(255) = NULL,
    @campaign_id_Clear bit = 0,
    @campaign_id nvarchar(255) = NULL,
    @subject_Clear bit = 0,
    @subject nvarchar(255) = NULL,
    @from_email_Clear bit = 0,
    @from_email nvarchar(255) = NULL,
    @html_content_Clear bit = 0,
    @html_content nvarchar(255) = NULL,
    @role_Clear bit = 0,
    @role nvarchar(255) = NULL,
    @current_status_Clear bit = 0,
    @current_status nvarchar(255) = NULL,
    @campaign_activity_id nvarchar(255) = NULL,
    @physical_address_in_footer_Clear bit = 0,
    @physical_address_in_footer nvarchar(MAX) = NULL,
    @permalink_url_Clear bit = 0,
    @permalink_url nvarchar(255) = NULL,
    @contact_list_ids_Clear bit = 0,
    @contact_list_ids nvarchar(MAX) = NULL,
    @preheader_Clear bit = 0,
    @preheader nvarchar(255) = NULL,
    @document_properties_Clear bit = 0,
    @document_properties nvarchar(MAX) = NULL,
    @format_type_Clear bit = 0,
    @format_type nvarchar(255) = NULL,
    @segment_ids_Clear bit = 0,
    @segment_ids nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[email_campaign_activities]
        (
            [from_name],
                [reply_to_email],
                [template_id],
                [campaign_id],
                [subject],
                [from_email],
                [html_content],
                [role],
                [current_status],
                [physical_address_in_footer],
                [permalink_url],
                [contact_list_ids],
                [preheader],
                [document_properties],
                [format_type],
                [segment_ids],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [campaign_activity_id]
        )
    VALUES
        (
            CASE WHEN @from_name_Clear = 1 THEN NULL ELSE ISNULL(@from_name, NULL) END,
                CASE WHEN @reply_to_email_Clear = 1 THEN NULL ELSE ISNULL(@reply_to_email, NULL) END,
                CASE WHEN @template_id_Clear = 1 THEN NULL ELSE ISNULL(@template_id, NULL) END,
                CASE WHEN @campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@campaign_id, NULL) END,
                CASE WHEN @subject_Clear = 1 THEN NULL ELSE ISNULL(@subject, NULL) END,
                CASE WHEN @from_email_Clear = 1 THEN NULL ELSE ISNULL(@from_email, NULL) END,
                CASE WHEN @html_content_Clear = 1 THEN NULL ELSE ISNULL(@html_content, NULL) END,
                CASE WHEN @role_Clear = 1 THEN NULL ELSE ISNULL(@role, NULL) END,
                CASE WHEN @current_status_Clear = 1 THEN NULL ELSE ISNULL(@current_status, NULL) END,
                CASE WHEN @physical_address_in_footer_Clear = 1 THEN NULL ELSE ISNULL(@physical_address_in_footer, NULL) END,
                CASE WHEN @permalink_url_Clear = 1 THEN NULL ELSE ISNULL(@permalink_url, NULL) END,
                CASE WHEN @contact_list_ids_Clear = 1 THEN NULL ELSE ISNULL(@contact_list_ids, NULL) END,
                CASE WHEN @preheader_Clear = 1 THEN NULL ELSE ISNULL(@preheader, NULL) END,
                CASE WHEN @document_properties_Clear = 1 THEN NULL ELSE ISNULL(@document_properties, NULL) END,
                CASE WHEN @format_type_Clear = 1 THEN NULL ELSE ISNULL(@format_type, NULL) END,
                CASE WHEN @segment_ids_Clear = 1 THEN NULL ELSE ISNULL(@segment_ids, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @campaign_activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEmail_campaign_activities] WHERE [campaign_activity_id] = @campaign_activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateemail_campaign_activities] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Campaign Activities */

GRANT EXECUTE ON [constant_contact].[spCreateemail_campaign_activities] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Campaign Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activities
-- Item: spUpdateemail_campaign_activities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR email_campaign_activities
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateemail_campaign_activities]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateemail_campaign_activities];
GO

CREATE PROCEDURE [constant_contact].[spUpdateemail_campaign_activities]
    @from_name_Clear bit = 0,
    @from_name nvarchar(255) = NULL,
    @reply_to_email_Clear bit = 0,
    @reply_to_email nvarchar(255) = NULL,
    @template_id_Clear bit = 0,
    @template_id nvarchar(255) = NULL,
    @campaign_id_Clear bit = 0,
    @campaign_id nvarchar(255) = NULL,
    @subject_Clear bit = 0,
    @subject nvarchar(255) = NULL,
    @from_email_Clear bit = 0,
    @from_email nvarchar(255) = NULL,
    @html_content_Clear bit = 0,
    @html_content nvarchar(255) = NULL,
    @role_Clear bit = 0,
    @role nvarchar(255) = NULL,
    @current_status_Clear bit = 0,
    @current_status nvarchar(255) = NULL,
    @campaign_activity_id nvarchar(255),
    @physical_address_in_footer_Clear bit = 0,
    @physical_address_in_footer nvarchar(MAX) = NULL,
    @permalink_url_Clear bit = 0,
    @permalink_url nvarchar(255) = NULL,
    @contact_list_ids_Clear bit = 0,
    @contact_list_ids nvarchar(MAX) = NULL,
    @preheader_Clear bit = 0,
    @preheader nvarchar(255) = NULL,
    @document_properties_Clear bit = 0,
    @document_properties nvarchar(MAX) = NULL,
    @format_type_Clear bit = 0,
    @format_type nvarchar(255) = NULL,
    @segment_ids_Clear bit = 0,
    @segment_ids nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_campaign_activities]
    SET
        [from_name] = CASE WHEN @from_name_Clear = 1 THEN NULL ELSE ISNULL(@from_name, [from_name]) END,
        [reply_to_email] = CASE WHEN @reply_to_email_Clear = 1 THEN NULL ELSE ISNULL(@reply_to_email, [reply_to_email]) END,
        [template_id] = CASE WHEN @template_id_Clear = 1 THEN NULL ELSE ISNULL(@template_id, [template_id]) END,
        [campaign_id] = CASE WHEN @campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@campaign_id, [campaign_id]) END,
        [subject] = CASE WHEN @subject_Clear = 1 THEN NULL ELSE ISNULL(@subject, [subject]) END,
        [from_email] = CASE WHEN @from_email_Clear = 1 THEN NULL ELSE ISNULL(@from_email, [from_email]) END,
        [html_content] = CASE WHEN @html_content_Clear = 1 THEN NULL ELSE ISNULL(@html_content, [html_content]) END,
        [role] = CASE WHEN @role_Clear = 1 THEN NULL ELSE ISNULL(@role, [role]) END,
        [current_status] = CASE WHEN @current_status_Clear = 1 THEN NULL ELSE ISNULL(@current_status, [current_status]) END,
        [physical_address_in_footer] = CASE WHEN @physical_address_in_footer_Clear = 1 THEN NULL ELSE ISNULL(@physical_address_in_footer, [physical_address_in_footer]) END,
        [permalink_url] = CASE WHEN @permalink_url_Clear = 1 THEN NULL ELSE ISNULL(@permalink_url, [permalink_url]) END,
        [contact_list_ids] = CASE WHEN @contact_list_ids_Clear = 1 THEN NULL ELSE ISNULL(@contact_list_ids, [contact_list_ids]) END,
        [preheader] = CASE WHEN @preheader_Clear = 1 THEN NULL ELSE ISNULL(@preheader, [preheader]) END,
        [document_properties] = CASE WHEN @document_properties_Clear = 1 THEN NULL ELSE ISNULL(@document_properties, [document_properties]) END,
        [format_type] = CASE WHEN @format_type_Clear = 1 THEN NULL ELSE ISNULL(@format_type, [format_type]) END,
        [segment_ids] = CASE WHEN @segment_ids_Clear = 1 THEN NULL ELSE ISNULL(@segment_ids, [segment_ids]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [campaign_activity_id] = @campaign_activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEmail_campaign_activities] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEmail_campaign_activities]
                                    WHERE
                                        [campaign_activity_id] = @campaign_activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateemail_campaign_activities] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the email_campaign_activities table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateemail_campaign_activities]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateemail_campaign_activities];
GO
CREATE TRIGGER [constant_contact].trgUpdateemail_campaign_activities
ON [constant_contact].[email_campaign_activities]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_campaign_activities]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[email_campaign_activities] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[campaign_activity_id] = I.[campaign_activity_id];
END;
GO

/* spUpdate Permissions for Email Campaign Activities */

GRANT EXECUTE ON [constant_contact].[spUpdateemail_campaign_activities] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Email Campaign Activity Non Opener Resends */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Non Opener Resends
-- Item: vwEmail_campaign_activity_non_opener_resends
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Campaign Activity Non Opener Resends
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  email_campaign_activity_non_opener_resends
-----               PRIMARY KEY: resend_request_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEmail_campaign_activity_non_opener_resends]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEmail_campaign_activity_non_opener_resends];
GO

CREATE VIEW [constant_contact].[vwEmail_campaign_activity_non_opener_resends]
AS
SELECT
    e.*
FROM
    [constant_contact].[email_campaign_activity_non_opener_resends] AS e
GO
GRANT SELECT ON [constant_contact].[vwEmail_campaign_activity_non_opener_resends] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Campaign Activity Non Opener Resends */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Non Opener Resends
-- Item: Permissions for vwEmail_campaign_activity_non_opener_resends
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEmail_campaign_activity_non_opener_resends] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Campaign Activity Non Opener Resends */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Non Opener Resends
-- Item: spCreateemail_campaign_activity_non_opener_resends
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR email_campaign_activity_non_opener_resends
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateemail_campaign_activity_non_opener_resends]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateemail_campaign_activity_non_opener_resends];
GO

CREATE PROCEDURE [constant_contact].[spCreateemail_campaign_activity_non_opener_resends]
    @resend_date_Clear bit = 0,
    @resend_date nvarchar(255) = NULL,
    @delay_days_Clear bit = 0,
    @delay_days nvarchar(255) = NULL,
    @resend_status_Clear bit = 0,
    @resend_status nvarchar(255) = NULL,
    @delay_minutes_Clear bit = 0,
    @delay_minutes nvarchar(255) = NULL,
    @resend_request_id nvarchar(255) = NULL,
    @resend_subject_Clear bit = 0,
    @resend_subject nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[email_campaign_activity_non_opener_resends]
        (
            [resend_date],
                [delay_days],
                [resend_status],
                [delay_minutes],
                [resend_subject],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [resend_request_id]
        )
    VALUES
        (
            CASE WHEN @resend_date_Clear = 1 THEN NULL ELSE ISNULL(@resend_date, NULL) END,
                CASE WHEN @delay_days_Clear = 1 THEN NULL ELSE ISNULL(@delay_days, NULL) END,
                CASE WHEN @resend_status_Clear = 1 THEN NULL ELSE ISNULL(@resend_status, NULL) END,
                CASE WHEN @delay_minutes_Clear = 1 THEN NULL ELSE ISNULL(@delay_minutes, NULL) END,
                CASE WHEN @resend_subject_Clear = 1 THEN NULL ELSE ISNULL(@resend_subject, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @resend_request_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEmail_campaign_activity_non_opener_resends] WHERE [resend_request_id] = @resend_request_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateemail_campaign_activity_non_opener_resends] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Campaign Activity Non Opener Resends */

GRANT EXECUTE ON [constant_contact].[spCreateemail_campaign_activity_non_opener_resends] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Campaign Activity Non Opener Resends */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Non Opener Resends
-- Item: spUpdateemail_campaign_activity_non_opener_resends
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR email_campaign_activity_non_opener_resends
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateemail_campaign_activity_non_opener_resends]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateemail_campaign_activity_non_opener_resends];
GO

CREATE PROCEDURE [constant_contact].[spUpdateemail_campaign_activity_non_opener_resends]
    @resend_date_Clear bit = 0,
    @resend_date nvarchar(255) = NULL,
    @delay_days_Clear bit = 0,
    @delay_days nvarchar(255) = NULL,
    @resend_status_Clear bit = 0,
    @resend_status nvarchar(255) = NULL,
    @delay_minutes_Clear bit = 0,
    @delay_minutes nvarchar(255) = NULL,
    @resend_request_id nvarchar(255),
    @resend_subject_Clear bit = 0,
    @resend_subject nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_campaign_activity_non_opener_resends]
    SET
        [resend_date] = CASE WHEN @resend_date_Clear = 1 THEN NULL ELSE ISNULL(@resend_date, [resend_date]) END,
        [delay_days] = CASE WHEN @delay_days_Clear = 1 THEN NULL ELSE ISNULL(@delay_days, [delay_days]) END,
        [resend_status] = CASE WHEN @resend_status_Clear = 1 THEN NULL ELSE ISNULL(@resend_status, [resend_status]) END,
        [delay_minutes] = CASE WHEN @delay_minutes_Clear = 1 THEN NULL ELSE ISNULL(@delay_minutes, [delay_minutes]) END,
        [resend_subject] = CASE WHEN @resend_subject_Clear = 1 THEN NULL ELSE ISNULL(@resend_subject, [resend_subject]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [resend_request_id] = @resend_request_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEmail_campaign_activity_non_opener_resends] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEmail_campaign_activity_non_opener_resends]
                                    WHERE
                                        [resend_request_id] = @resend_request_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateemail_campaign_activity_non_opener_resends] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the email_campaign_activity_non_opener_resends table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateemail_campaign_activity_non_opener_resends]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateemail_campaign_activity_non_opener_resends];
GO
CREATE TRIGGER [constant_contact].trgUpdateemail_campaign_activity_non_opener_resends
ON [constant_contact].[email_campaign_activity_non_opener_resends]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_campaign_activity_non_opener_resends]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[email_campaign_activity_non_opener_resends] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[resend_request_id] = I.[resend_request_id];
END;
GO

/* spUpdate Permissions for Email Campaign Activity Non Opener Resends */

GRANT EXECUTE ON [constant_contact].[spUpdateemail_campaign_activity_non_opener_resends] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Email Campaign Activity Previews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Previews
-- Item: vwEmail_campaign_activity_previews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Campaign Activity Previews
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  email_campaign_activity_previews
-----               PRIMARY KEY: campaign_activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEmail_campaign_activity_previews]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEmail_campaign_activity_previews];
GO

CREATE VIEW [constant_contact].[vwEmail_campaign_activity_previews]
AS
SELECT
    e.*
FROM
    [constant_contact].[email_campaign_activity_previews] AS e
GO
GRANT SELECT ON [constant_contact].[vwEmail_campaign_activity_previews] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Campaign Activity Previews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Previews
-- Item: Permissions for vwEmail_campaign_activity_previews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEmail_campaign_activity_previews] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Campaign Activity Previews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Previews
-- Item: spCreateemail_campaign_activity_previews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR email_campaign_activity_previews
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateemail_campaign_activity_previews]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateemail_campaign_activity_previews];
GO

CREATE PROCEDURE [constant_contact].[spCreateemail_campaign_activity_previews]
    @preview_html_content_Clear bit = 0,
    @preview_html_content nvarchar(255) = NULL,
    @preview_text_content_Clear bit = 0,
    @preview_text_content nvarchar(255) = NULL,
    @subject_Clear bit = 0,
    @subject nvarchar(255) = NULL,
    @campaign_activity_id nvarchar(255) = NULL,
    @from_name_Clear bit = 0,
    @from_name nvarchar(255) = NULL,
    @preheader_Clear bit = 0,
    @preheader nvarchar(255) = NULL,
    @from_email_Clear bit = 0,
    @from_email nvarchar(255) = NULL,
    @reply_to_email_Clear bit = 0,
    @reply_to_email nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[email_campaign_activity_previews]
        (
            [preview_html_content],
                [preview_text_content],
                [subject],
                [from_name],
                [preheader],
                [from_email],
                [reply_to_email],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [campaign_activity_id]
        )
    VALUES
        (
            CASE WHEN @preview_html_content_Clear = 1 THEN NULL ELSE ISNULL(@preview_html_content, NULL) END,
                CASE WHEN @preview_text_content_Clear = 1 THEN NULL ELSE ISNULL(@preview_text_content, NULL) END,
                CASE WHEN @subject_Clear = 1 THEN NULL ELSE ISNULL(@subject, NULL) END,
                CASE WHEN @from_name_Clear = 1 THEN NULL ELSE ISNULL(@from_name, NULL) END,
                CASE WHEN @preheader_Clear = 1 THEN NULL ELSE ISNULL(@preheader, NULL) END,
                CASE WHEN @from_email_Clear = 1 THEN NULL ELSE ISNULL(@from_email, NULL) END,
                CASE WHEN @reply_to_email_Clear = 1 THEN NULL ELSE ISNULL(@reply_to_email, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @campaign_activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEmail_campaign_activity_previews] WHERE [campaign_activity_id] = @campaign_activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateemail_campaign_activity_previews] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Campaign Activity Previews */

GRANT EXECUTE ON [constant_contact].[spCreateemail_campaign_activity_previews] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Campaign Activity Previews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Previews
-- Item: spUpdateemail_campaign_activity_previews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR email_campaign_activity_previews
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateemail_campaign_activity_previews]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateemail_campaign_activity_previews];
GO

CREATE PROCEDURE [constant_contact].[spUpdateemail_campaign_activity_previews]
    @preview_html_content_Clear bit = 0,
    @preview_html_content nvarchar(255) = NULL,
    @preview_text_content_Clear bit = 0,
    @preview_text_content nvarchar(255) = NULL,
    @subject_Clear bit = 0,
    @subject nvarchar(255) = NULL,
    @campaign_activity_id nvarchar(255),
    @from_name_Clear bit = 0,
    @from_name nvarchar(255) = NULL,
    @preheader_Clear bit = 0,
    @preheader nvarchar(255) = NULL,
    @from_email_Clear bit = 0,
    @from_email nvarchar(255) = NULL,
    @reply_to_email_Clear bit = 0,
    @reply_to_email nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_campaign_activity_previews]
    SET
        [preview_html_content] = CASE WHEN @preview_html_content_Clear = 1 THEN NULL ELSE ISNULL(@preview_html_content, [preview_html_content]) END,
        [preview_text_content] = CASE WHEN @preview_text_content_Clear = 1 THEN NULL ELSE ISNULL(@preview_text_content, [preview_text_content]) END,
        [subject] = CASE WHEN @subject_Clear = 1 THEN NULL ELSE ISNULL(@subject, [subject]) END,
        [from_name] = CASE WHEN @from_name_Clear = 1 THEN NULL ELSE ISNULL(@from_name, [from_name]) END,
        [preheader] = CASE WHEN @preheader_Clear = 1 THEN NULL ELSE ISNULL(@preheader, [preheader]) END,
        [from_email] = CASE WHEN @from_email_Clear = 1 THEN NULL ELSE ISNULL(@from_email, [from_email]) END,
        [reply_to_email] = CASE WHEN @reply_to_email_Clear = 1 THEN NULL ELSE ISNULL(@reply_to_email, [reply_to_email]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [campaign_activity_id] = @campaign_activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEmail_campaign_activity_previews] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEmail_campaign_activity_previews]
                                    WHERE
                                        [campaign_activity_id] = @campaign_activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateemail_campaign_activity_previews] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the email_campaign_activity_previews table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateemail_campaign_activity_previews]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateemail_campaign_activity_previews];
GO
CREATE TRIGGER [constant_contact].trgUpdateemail_campaign_activity_previews
ON [constant_contact].[email_campaign_activity_previews]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_campaign_activity_previews]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[email_campaign_activity_previews] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[campaign_activity_id] = I.[campaign_activity_id];
END;
GO

/* spUpdate Permissions for Email Campaign Activity Previews */

GRANT EXECUTE ON [constant_contact].[spUpdateemail_campaign_activity_previews] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Email Campaign Activity Send Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Send Histories
-- Item: vwEmail_campaign_activity_send_histories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Campaign Activity Send Histories
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  email_campaign_activity_send_history
-----               PRIMARY KEY: send_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEmail_campaign_activity_send_histories]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEmail_campaign_activity_send_histories];
GO

CREATE VIEW [constant_contact].[vwEmail_campaign_activity_send_histories]
AS
SELECT
    e.*
FROM
    [constant_contact].[email_campaign_activity_send_history] AS e
GO
GRANT SELECT ON [constant_contact].[vwEmail_campaign_activity_send_histories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Campaign Activity Send Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Send Histories
-- Item: Permissions for vwEmail_campaign_activity_send_histories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEmail_campaign_activity_send_histories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Campaign Activity Send Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Send Histories
-- Item: spCreateemail_campaign_activity_send_history
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR email_campaign_activity_send_history
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateemail_campaign_activity_send_history]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateemail_campaign_activity_send_history];
GO

CREATE PROCEDURE [constant_contact].[spCreateemail_campaign_activity_send_history]
    @run_date_Clear bit = 0,
    @run_date nvarchar(255) = NULL,
    @segment_ids_Clear bit = 0,
    @segment_ids nvarchar(MAX) = NULL,
    @count_Clear bit = 0,
    @count nvarchar(255) = NULL,
    @send_id nvarchar(255) = NULL,
    @contact_list_ids_Clear bit = 0,
    @contact_list_ids nvarchar(MAX) = NULL,
    @reason_code_Clear bit = 0,
    @reason_code nvarchar(255) = NULL,
    @send_status_Clear bit = 0,
    @send_status nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[email_campaign_activity_send_history]
        (
            [run_date],
                [segment_ids],
                [count],
                [contact_list_ids],
                [reason_code],
                [send_status],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [send_id]
        )
    VALUES
        (
            CASE WHEN @run_date_Clear = 1 THEN NULL ELSE ISNULL(@run_date, NULL) END,
                CASE WHEN @segment_ids_Clear = 1 THEN NULL ELSE ISNULL(@segment_ids, NULL) END,
                CASE WHEN @count_Clear = 1 THEN NULL ELSE ISNULL(@count, NULL) END,
                CASE WHEN @contact_list_ids_Clear = 1 THEN NULL ELSE ISNULL(@contact_list_ids, NULL) END,
                CASE WHEN @reason_code_Clear = 1 THEN NULL ELSE ISNULL(@reason_code, NULL) END,
                CASE WHEN @send_status_Clear = 1 THEN NULL ELSE ISNULL(@send_status, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @send_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEmail_campaign_activity_send_histories] WHERE [send_id] = @send_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateemail_campaign_activity_send_history] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Campaign Activity Send Histories */

GRANT EXECUTE ON [constant_contact].[spCreateemail_campaign_activity_send_history] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Campaign Activity Send Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Send Histories
-- Item: spUpdateemail_campaign_activity_send_history
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR email_campaign_activity_send_history
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateemail_campaign_activity_send_history]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateemail_campaign_activity_send_history];
GO

CREATE PROCEDURE [constant_contact].[spUpdateemail_campaign_activity_send_history]
    @run_date_Clear bit = 0,
    @run_date nvarchar(255) = NULL,
    @segment_ids_Clear bit = 0,
    @segment_ids nvarchar(MAX) = NULL,
    @count_Clear bit = 0,
    @count nvarchar(255) = NULL,
    @send_id nvarchar(255),
    @contact_list_ids_Clear bit = 0,
    @contact_list_ids nvarchar(MAX) = NULL,
    @reason_code_Clear bit = 0,
    @reason_code nvarchar(255) = NULL,
    @send_status_Clear bit = 0,
    @send_status nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_campaign_activity_send_history]
    SET
        [run_date] = CASE WHEN @run_date_Clear = 1 THEN NULL ELSE ISNULL(@run_date, [run_date]) END,
        [segment_ids] = CASE WHEN @segment_ids_Clear = 1 THEN NULL ELSE ISNULL(@segment_ids, [segment_ids]) END,
        [count] = CASE WHEN @count_Clear = 1 THEN NULL ELSE ISNULL(@count, [count]) END,
        [contact_list_ids] = CASE WHEN @contact_list_ids_Clear = 1 THEN NULL ELSE ISNULL(@contact_list_ids, [contact_list_ids]) END,
        [reason_code] = CASE WHEN @reason_code_Clear = 1 THEN NULL ELSE ISNULL(@reason_code, [reason_code]) END,
        [send_status] = CASE WHEN @send_status_Clear = 1 THEN NULL ELSE ISNULL(@send_status, [send_status]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [send_id] = @send_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEmail_campaign_activity_send_histories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEmail_campaign_activity_send_histories]
                                    WHERE
                                        [send_id] = @send_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateemail_campaign_activity_send_history] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the email_campaign_activity_send_history table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateemail_campaign_activity_send_history]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateemail_campaign_activity_send_history];
GO
CREATE TRIGGER [constant_contact].trgUpdateemail_campaign_activity_send_history
ON [constant_contact].[email_campaign_activity_send_history]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_campaign_activity_send_history]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[email_campaign_activity_send_history] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[send_id] = I.[send_id];
END;
GO

/* spUpdate Permissions for Email Campaign Activity Send Histories */

GRANT EXECUTE ON [constant_contact].[spUpdateemail_campaign_activity_send_history] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Email Reports Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Links
-- Item: vwEmail_reports_links
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Reports Links
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  email_reports_links
-----               PRIMARY KEY: url_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEmail_reports_links]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEmail_reports_links];
GO

CREATE VIEW [constant_contact].[vwEmail_reports_links]
AS
SELECT
    e.*
FROM
    [constant_contact].[email_reports_links] AS e
GO
GRANT SELECT ON [constant_contact].[vwEmail_reports_links] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Reports Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Links
-- Item: Permissions for vwEmail_reports_links
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEmail_reports_links] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Reports Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Links
-- Item: spCreateemail_reports_links
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR email_reports_links
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateemail_reports_links]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateemail_reports_links];
GO

CREATE PROCEDURE [constant_contact].[spCreateemail_reports_links]
    @url_id nvarchar(255) = NULL,
    @unique_clicks_Clear bit = 0,
    @unique_clicks nvarchar(255) = NULL,
    @list_action_Clear bit = 0,
    @list_action nvarchar(255) = NULL,
    @link_tag_Clear bit = 0,
    @link_tag nvarchar(255) = NULL,
    @list_id_Clear bit = 0,
    @list_id nvarchar(255) = NULL,
    @link_url_Clear bit = 0,
    @link_url nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[email_reports_links]
        (
            [unique_clicks],
                [list_action],
                [link_tag],
                [list_id],
                [link_url],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [url_id]
        )
    VALUES
        (
            CASE WHEN @unique_clicks_Clear = 1 THEN NULL ELSE ISNULL(@unique_clicks, NULL) END,
                CASE WHEN @list_action_Clear = 1 THEN NULL ELSE ISNULL(@list_action, NULL) END,
                CASE WHEN @link_tag_Clear = 1 THEN NULL ELSE ISNULL(@link_tag, NULL) END,
                CASE WHEN @list_id_Clear = 1 THEN NULL ELSE ISNULL(@list_id, NULL) END,
                CASE WHEN @link_url_Clear = 1 THEN NULL ELSE ISNULL(@link_url, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @url_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEmail_reports_links] WHERE [url_id] = @url_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateemail_reports_links] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Reports Links */

GRANT EXECUTE ON [constant_contact].[spCreateemail_reports_links] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Reports Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Links
-- Item: spUpdateemail_reports_links
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR email_reports_links
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateemail_reports_links]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateemail_reports_links];
GO

CREATE PROCEDURE [constant_contact].[spUpdateemail_reports_links]
    @url_id nvarchar(255),
    @unique_clicks_Clear bit = 0,
    @unique_clicks nvarchar(255) = NULL,
    @list_action_Clear bit = 0,
    @list_action nvarchar(255) = NULL,
    @link_tag_Clear bit = 0,
    @link_tag nvarchar(255) = NULL,
    @list_id_Clear bit = 0,
    @list_id nvarchar(255) = NULL,
    @link_url_Clear bit = 0,
    @link_url nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_reports_links]
    SET
        [unique_clicks] = CASE WHEN @unique_clicks_Clear = 1 THEN NULL ELSE ISNULL(@unique_clicks, [unique_clicks]) END,
        [list_action] = CASE WHEN @list_action_Clear = 1 THEN NULL ELSE ISNULL(@list_action, [list_action]) END,
        [link_tag] = CASE WHEN @link_tag_Clear = 1 THEN NULL ELSE ISNULL(@link_tag, [link_tag]) END,
        [list_id] = CASE WHEN @list_id_Clear = 1 THEN NULL ELSE ISNULL(@list_id, [list_id]) END,
        [link_url] = CASE WHEN @link_url_Clear = 1 THEN NULL ELSE ISNULL(@link_url, [link_url]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [url_id] = @url_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEmail_reports_links] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEmail_reports_links]
                                    WHERE
                                        [url_id] = @url_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateemail_reports_links] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the email_reports_links table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateemail_reports_links]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateemail_reports_links];
GO
CREATE TRIGGER [constant_contact].trgUpdateemail_reports_links
ON [constant_contact].[email_reports_links]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_reports_links]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[email_reports_links] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[url_id] = I.[url_id];
END;
GO

/* spUpdate Permissions for Email Reports Links */

GRANT EXECUTE ON [constant_contact].[spUpdateemail_reports_links] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Campaign Activities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activities
-- Item: spDeleteemail_campaign_activities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR email_campaign_activities
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteemail_campaign_activities]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteemail_campaign_activities];
GO

CREATE PROCEDURE [constant_contact].[spDeleteemail_campaign_activities]
    @campaign_activity_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[email_campaign_activities]
    WHERE
        [campaign_activity_id] = @campaign_activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [campaign_activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @campaign_activity_id AS [campaign_activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteemail_campaign_activities] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Campaign Activities */

GRANT EXECUTE ON [constant_contact].[spDeleteemail_campaign_activities] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Campaign Activity Non Opener Resends */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Non Opener Resends
-- Item: spDeleteemail_campaign_activity_non_opener_resends
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR email_campaign_activity_non_opener_resends
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteemail_campaign_activity_non_opener_resends]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteemail_campaign_activity_non_opener_resends];
GO

CREATE PROCEDURE [constant_contact].[spDeleteemail_campaign_activity_non_opener_resends]
    @resend_request_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[email_campaign_activity_non_opener_resends]
    WHERE
        [resend_request_id] = @resend_request_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [resend_request_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @resend_request_id AS [resend_request_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteemail_campaign_activity_non_opener_resends] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Campaign Activity Non Opener Resends */

GRANT EXECUTE ON [constant_contact].[spDeleteemail_campaign_activity_non_opener_resends] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Campaign Activity Previews */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Previews
-- Item: spDeleteemail_campaign_activity_previews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR email_campaign_activity_previews
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteemail_campaign_activity_previews]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteemail_campaign_activity_previews];
GO

CREATE PROCEDURE [constant_contact].[spDeleteemail_campaign_activity_previews]
    @campaign_activity_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[email_campaign_activity_previews]
    WHERE
        [campaign_activity_id] = @campaign_activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [campaign_activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @campaign_activity_id AS [campaign_activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteemail_campaign_activity_previews] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Campaign Activity Previews */

GRANT EXECUTE ON [constant_contact].[spDeleteemail_campaign_activity_previews] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Campaign Activity Send Histories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Campaign Activity Send Histories
-- Item: spDeleteemail_campaign_activity_send_history
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR email_campaign_activity_send_history
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteemail_campaign_activity_send_history]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteemail_campaign_activity_send_history];
GO

CREATE PROCEDURE [constant_contact].[spDeleteemail_campaign_activity_send_history]
    @send_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[email_campaign_activity_send_history]
    WHERE
        [send_id] = @send_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [send_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @send_id AS [send_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteemail_campaign_activity_send_history] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Campaign Activity Send Histories */

GRANT EXECUTE ON [constant_contact].[spDeleteemail_campaign_activity_send_history] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Reports Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Links
-- Item: spDeleteemail_reports_links
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR email_reports_links
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteemail_reports_links]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteemail_reports_links];
GO

CREATE PROCEDURE [constant_contact].[spDeleteemail_reports_links]
    @url_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[email_reports_links]
    WHERE
        [url_id] = @url_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [url_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @url_id AS [url_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteemail_reports_links] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Reports Links */

GRANT EXECUTE ON [constant_contact].[spDeleteemail_reports_links] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for email_reports_summary */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Summaries
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key campaign_id in table email_reports_summary
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_email_reports_summary_campaign_id' 
    AND object_id = OBJECT_ID('[constant_contact].[email_reports_summary]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_email_reports_summary_campaign_id ON [constant_contact].[email_reports_summary] ([campaign_id]);

/* Index for Foreign Keys for emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for emails_xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails Xrefs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key campaign_id in table emails_xrefs
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_emails_xrefs_campaign_id' 
    AND object_id = OBJECT_ID('[constant_contact].[emails_xrefs]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_emails_xrefs_campaign_id ON [constant_contact].[emails_xrefs] ([campaign_id]);

-- Index for foreign key campaign_activity_id in table emails_xrefs
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_emails_xrefs_campaign_activity_id' 
    AND object_id = OBJECT_ID('[constant_contact].[emails_xrefs]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_emails_xrefs_campaign_activity_id ON [constant_contact].[emails_xrefs] ([campaign_activity_id]);

/* Index for Foreign Keys for events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key campaign_id in table events
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_events_campaign_id' 
    AND object_id = OBJECT_ID('[constant_contact].[events]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_events_campaign_id ON [constant_contact].[events] ([campaign_id]);

/* Index for Foreign Keys for events_copy */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Copies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key campaign_id in table events_copy
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_events_copy_campaign_id' 
    AND object_id = OBJECT_ID('[constant_contact].[events_copy]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_events_copy_campaign_id ON [constant_contact].[events_copy] ([campaign_id]);

-- Index for foreign key event_id in table events_copy
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_events_copy_event_id' 
    AND object_id = OBJECT_ID('[constant_contact].[events_copy]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_events_copy_event_id ON [constant_contact].[events_copy] ([event_id]);

/* Base View SQL for Email Reports Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Summaries
-- Item: vwEmail_reports_summaries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Email Reports Summaries
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  email_reports_summary
-----               PRIMARY KEY: campaign_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEmail_reports_summaries]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEmail_reports_summaries];
GO

CREATE VIEW [constant_contact].[vwEmail_reports_summaries]
AS
SELECT
    e.*
FROM
    [constant_contact].[email_reports_summary] AS e
GO
GRANT SELECT ON [constant_contact].[vwEmail_reports_summaries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Email Reports Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Summaries
-- Item: Permissions for vwEmail_reports_summaries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEmail_reports_summaries] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Email Reports Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Summaries
-- Item: spCreateemail_reports_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR email_reports_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateemail_reports_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateemail_reports_summary];
GO

CREATE PROCEDURE [constant_contact].[spCreateemail_reports_summary]
    @unique_counts_Clear bit = 0,
    @unique_counts nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @campaign_id nvarchar(450) = NULL,
    @last_sent_date_Clear bit = 0,
    @last_sent_date nvarchar(MAX) = NULL,
    @campaign_type_Clear bit = 0,
    @campaign_type nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[email_reports_summary]
        (
            [unique_counts],
                [mj_e2e_custom_attr],
                [last_sent_date],
                [campaign_type],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [campaign_id]
        )
    VALUES
        (
            CASE WHEN @unique_counts_Clear = 1 THEN NULL ELSE ISNULL(@unique_counts, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @last_sent_date_Clear = 1 THEN NULL ELSE ISNULL(@last_sent_date, NULL) END,
                CASE WHEN @campaign_type_Clear = 1 THEN NULL ELSE ISNULL(@campaign_type, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @campaign_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEmail_reports_summaries] WHERE [campaign_id] = @campaign_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateemail_reports_summary] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Email Reports Summaries */

GRANT EXECUTE ON [constant_contact].[spCreateemail_reports_summary] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Email Reports Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Summaries
-- Item: spUpdateemail_reports_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR email_reports_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateemail_reports_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateemail_reports_summary];
GO

CREATE PROCEDURE [constant_contact].[spUpdateemail_reports_summary]
    @unique_counts_Clear bit = 0,
    @unique_counts nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @campaign_id nvarchar(450),
    @last_sent_date_Clear bit = 0,
    @last_sent_date nvarchar(MAX) = NULL,
    @campaign_type_Clear bit = 0,
    @campaign_type nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_reports_summary]
    SET
        [unique_counts] = CASE WHEN @unique_counts_Clear = 1 THEN NULL ELSE ISNULL(@unique_counts, [unique_counts]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [last_sent_date] = CASE WHEN @last_sent_date_Clear = 1 THEN NULL ELSE ISNULL(@last_sent_date, [last_sent_date]) END,
        [campaign_type] = CASE WHEN @campaign_type_Clear = 1 THEN NULL ELSE ISNULL(@campaign_type, [campaign_type]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [campaign_id] = @campaign_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEmail_reports_summaries] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEmail_reports_summaries]
                                    WHERE
                                        [campaign_id] = @campaign_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateemail_reports_summary] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the email_reports_summary table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateemail_reports_summary]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateemail_reports_summary];
GO
CREATE TRIGGER [constant_contact].trgUpdateemail_reports_summary
ON [constant_contact].[email_reports_summary]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[email_reports_summary]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[email_reports_summary] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[campaign_id] = I.[campaign_id];
END;
GO

/* spUpdate Permissions for Email Reports Summaries */

GRANT EXECUTE ON [constant_contact].[spUpdateemail_reports_summary] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: vwEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Emails
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  emails
-----               PRIMARY KEY: campaign_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEmails]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEmails];
GO

CREATE VIEW [constant_contact].[vwEmails]
AS
SELECT
    e.*
FROM
    [constant_contact].[emails] AS e
GO
GRANT SELECT ON [constant_contact].[vwEmails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: Permissions for vwEmails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEmails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spCreateemails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR emails
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateemails]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateemails];
GO

CREATE PROCEDURE [constant_contact].[spCreateemails]
    @campaign_id nvarchar(450) = NULL,
    @type_Clear bit = 0,
    @type nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @type_code_Clear bit = 0,
    @type_code nvarchar(MAX) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @campaign_activities_Clear bit = 0,
    @campaign_activities nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @current_status_Clear bit = 0,
    @current_status nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[emails]
        (
            [type],
                [created_at],
                [mj_e2e_custom_attr],
                [type_code],
                [name],
                [campaign_activities],
                [updated_at],
                [current_status],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [campaign_id]
        )
    VALUES
        (
            CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @type_code_Clear = 1 THEN NULL ELSE ISNULL(@type_code, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @campaign_activities_Clear = 1 THEN NULL ELSE ISNULL(@campaign_activities, NULL) END,
                CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, NULL) END,
                CASE WHEN @current_status_Clear = 1 THEN NULL ELSE ISNULL(@current_status, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @campaign_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEmails] WHERE [campaign_id] = @campaign_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateemails] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Emails */

GRANT EXECUTE ON [constant_contact].[spCreateemails] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spUpdateemails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR emails
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateemails]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateemails];
GO

CREATE PROCEDURE [constant_contact].[spUpdateemails]
    @campaign_id nvarchar(450),
    @type_Clear bit = 0,
    @type nvarchar(812) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @type_code_Clear bit = 0,
    @type_code nvarchar(MAX) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @campaign_activities_Clear bit = 0,
    @campaign_activities nvarchar(MAX) = NULL,
    @updated_at_Clear bit = 0,
    @updated_at nvarchar(MAX) = NULL,
    @current_status_Clear bit = 0,
    @current_status nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[emails]
    SET
        [type] = CASE WHEN @type_Clear = 1 THEN NULL ELSE ISNULL(@type, [type]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [type_code] = CASE WHEN @type_code_Clear = 1 THEN NULL ELSE ISNULL(@type_code, [type_code]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [campaign_activities] = CASE WHEN @campaign_activities_Clear = 1 THEN NULL ELSE ISNULL(@campaign_activities, [campaign_activities]) END,
        [updated_at] = CASE WHEN @updated_at_Clear = 1 THEN NULL ELSE ISNULL(@updated_at, [updated_at]) END,
        [current_status] = CASE WHEN @current_status_Clear = 1 THEN NULL ELSE ISNULL(@current_status, [current_status]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [campaign_id] = @campaign_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEmails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEmails]
                                    WHERE
                                        [campaign_id] = @campaign_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateemails] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the emails table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateemails]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateemails];
GO
CREATE TRIGGER [constant_contact].trgUpdateemails
ON [constant_contact].[emails]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[emails]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[emails] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[campaign_id] = I.[campaign_id];
END;
GO

/* spUpdate Permissions for Emails */

GRANT EXECUTE ON [constant_contact].[spUpdateemails] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Emails Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails Xrefs
-- Item: vwEmails_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Emails Xrefs
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  emails_xrefs
-----               PRIMARY KEY: campaign_activity_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEmails_xrefs]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEmails_xrefs];
GO

CREATE VIEW [constant_contact].[vwEmails_xrefs]
AS
SELECT
    e.*
FROM
    [constant_contact].[emails_xrefs] AS e
GO
GRANT SELECT ON [constant_contact].[vwEmails_xrefs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Emails Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails Xrefs
-- Item: Permissions for vwEmails_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEmails_xrefs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Emails Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails Xrefs
-- Item: spCreateemails_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR emails_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateemails_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateemails_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spCreateemails_xrefs]
    @campaign_id_Clear bit = 0,
    @campaign_id nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @campaign_activity_id nvarchar(450) = NULL,
    @v2_email_campaign_id_Clear bit = 0,
    @v2_email_campaign_id nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[emails_xrefs]
        (
            [campaign_id],
                [mj_e2e_custom_attr],
                [v2_email_campaign_id],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [campaign_activity_id]
        )
    VALUES
        (
            CASE WHEN @campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@campaign_id, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @v2_email_campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@v2_email_campaign_id, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @campaign_activity_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEmails_xrefs] WHERE [campaign_activity_id] = @campaign_activity_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateemails_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Emails Xrefs */

GRANT EXECUTE ON [constant_contact].[spCreateemails_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Emails Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails Xrefs
-- Item: spUpdateemails_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR emails_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateemails_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateemails_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spUpdateemails_xrefs]
    @campaign_id_Clear bit = 0,
    @campaign_id nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @campaign_activity_id nvarchar(450),
    @v2_email_campaign_id_Clear bit = 0,
    @v2_email_campaign_id nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[emails_xrefs]
    SET
        [campaign_id] = CASE WHEN @campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@campaign_id, [campaign_id]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [v2_email_campaign_id] = CASE WHEN @v2_email_campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@v2_email_campaign_id, [v2_email_campaign_id]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [campaign_activity_id] = @campaign_activity_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEmails_xrefs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEmails_xrefs]
                                    WHERE
                                        [campaign_activity_id] = @campaign_activity_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateemails_xrefs] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the emails_xrefs table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateemails_xrefs]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateemails_xrefs];
GO
CREATE TRIGGER [constant_contact].trgUpdateemails_xrefs
ON [constant_contact].[emails_xrefs]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[emails_xrefs]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[emails_xrefs] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[campaign_activity_id] = I.[campaign_activity_id];
END;
GO

/* spUpdate Permissions for Emails Xrefs */

GRANT EXECUTE ON [constant_contact].[spUpdateemails_xrefs] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Events
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  events
-----               PRIMARY KEY: event_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEvents]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEvents];
GO

CREATE VIEW [constant_contact].[vwEvents]
AS
SELECT
    e.*
FROM
    [constant_contact].[events] AS e
GO
GRANT SELECT ON [constant_contact].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: Permissions for vwEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spCreateevents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR events
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateevents]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateevents];
GO

CREATE PROCEDURE [constant_contact].[spCreateevents]
    @event_code_Clear bit = 0,
    @event_code nvarchar(812) = NULL,
    @event_settings_Clear bit = 0,
    @event_settings nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(812) = NULL,
    @cancelled_time_Clear bit = 0,
    @cancelled_time nvarchar(812) = NULL,
    @create_time_Clear bit = 0,
    @create_time nvarchar(812) = NULL,
    @event_id nvarchar(450) = NULL,
    @contact_Clear bit = 0,
    @contact nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(812) = NULL,
    @registration_url_Clear bit = 0,
    @registration_url nvarchar(812) = NULL,
    @eso_Clear bit = 0,
    @eso nvarchar(812) = NULL,
    @event_calendar_url_Clear bit = 0,
    @event_calendar_url nvarchar(812) = NULL,
    @event_type_Clear bit = 0,
    @event_type nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @time_zone_Clear bit = 0,
    @time_zone nvarchar(812) = NULL,
    @event_metadata_Clear bit = 0,
    @event_metadata nvarchar(MAX) = NULL,
    @event_promotions_Clear bit = 0,
    @event_promotions nvarchar(MAX) = NULL,
    @time_zone_abbreviation_Clear bit = 0,
    @time_zone_abbreviation nvarchar(812) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(900) = NULL,
    @notify_owner_on_reg_Clear bit = 0,
    @notify_owner_on_reg nvarchar(MAX) = NULL,
    @location_type_Clear bit = 0,
    @location_type nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @failed_campaign_activities_Clear bit = 0,
    @failed_campaign_activities nvarchar(MAX) = NULL,
    @display_contact_flag_Clear bit = 0,
    @display_contact_flag nvarchar(MAX) = NULL,
    @active_time_Clear bit = 0,
    @active_time nvarchar(812) = NULL,
    @event_widget_url_Clear bit = 0,
    @event_widget_url nvarchar(812) = NULL,
    @last_update_time_Clear bit = 0,
    @last_update_time nvarchar(812) = NULL,
    @display_end_time_flag_Clear bit = 0,
    @display_end_time_flag nvarchar(MAX) = NULL,
    @event_end_Clear bit = 0,
    @event_end nvarchar(812) = NULL,
    @online_meeting_Clear bit = 0,
    @online_meeting nvarchar(MAX) = NULL,
    @currency_type_Clear bit = 0,
    @currency_type nvarchar(812) = NULL,
    @display_on_calendar_flag_Clear bit = 0,
    @display_on_calendar_flag nvarchar(MAX) = NULL,
    @default_track_Clear bit = 0,
    @default_track nvarchar(MAX) = NULL,
    @campaign_id_Clear bit = 0,
    @campaign_id nvarchar(812) = NULL,
    @display_time_zone_flag_Clear bit = 0,
    @display_time_zone_flag nvarchar(MAX) = NULL,
    @deleted_time_Clear bit = 0,
    @deleted_time nvarchar(812) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(MAX) = NULL,
    @event_start_Clear bit = 0,
    @event_start nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[events]
        (
            [event_code],
                [event_settings],
                [status],
                [cancelled_time],
                [create_time],
                [contact],
                [title],
                [registration_url],
                [eso],
                [event_calendar_url],
                [event_type],
                [mj_e2e_custom_attr],
                [time_zone],
                [event_metadata],
                [event_promotions],
                [time_zone_abbreviation],
                [description],
                [notify_owner_on_reg],
                [location_type],
                [name],
                [failed_campaign_activities],
                [display_contact_flag],
                [active_time],
                [event_widget_url],
                [last_update_time],
                [display_end_time_flag],
                [event_end],
                [online_meeting],
                [currency_type],
                [display_on_calendar_flag],
                [default_track],
                [campaign_id],
                [display_time_zone_flag],
                [deleted_time],
                [address],
                [event_start],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [event_id]
        )
    VALUES
        (
            CASE WHEN @event_code_Clear = 1 THEN NULL ELSE ISNULL(@event_code, NULL) END,
                CASE WHEN @event_settings_Clear = 1 THEN NULL ELSE ISNULL(@event_settings, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @cancelled_time_Clear = 1 THEN NULL ELSE ISNULL(@cancelled_time, NULL) END,
                CASE WHEN @create_time_Clear = 1 THEN NULL ELSE ISNULL(@create_time, NULL) END,
                CASE WHEN @contact_Clear = 1 THEN NULL ELSE ISNULL(@contact, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @registration_url_Clear = 1 THEN NULL ELSE ISNULL(@registration_url, NULL) END,
                CASE WHEN @eso_Clear = 1 THEN NULL ELSE ISNULL(@eso, NULL) END,
                CASE WHEN @event_calendar_url_Clear = 1 THEN NULL ELSE ISNULL(@event_calendar_url, NULL) END,
                CASE WHEN @event_type_Clear = 1 THEN NULL ELSE ISNULL(@event_type, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @time_zone_Clear = 1 THEN NULL ELSE ISNULL(@time_zone, NULL) END,
                CASE WHEN @event_metadata_Clear = 1 THEN NULL ELSE ISNULL(@event_metadata, NULL) END,
                CASE WHEN @event_promotions_Clear = 1 THEN NULL ELSE ISNULL(@event_promotions, NULL) END,
                CASE WHEN @time_zone_abbreviation_Clear = 1 THEN NULL ELSE ISNULL(@time_zone_abbreviation, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @notify_owner_on_reg_Clear = 1 THEN NULL ELSE ISNULL(@notify_owner_on_reg, NULL) END,
                CASE WHEN @location_type_Clear = 1 THEN NULL ELSE ISNULL(@location_type, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @failed_campaign_activities_Clear = 1 THEN NULL ELSE ISNULL(@failed_campaign_activities, NULL) END,
                CASE WHEN @display_contact_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_contact_flag, NULL) END,
                CASE WHEN @active_time_Clear = 1 THEN NULL ELSE ISNULL(@active_time, NULL) END,
                CASE WHEN @event_widget_url_Clear = 1 THEN NULL ELSE ISNULL(@event_widget_url, NULL) END,
                CASE WHEN @last_update_time_Clear = 1 THEN NULL ELSE ISNULL(@last_update_time, NULL) END,
                CASE WHEN @display_end_time_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_end_time_flag, NULL) END,
                CASE WHEN @event_end_Clear = 1 THEN NULL ELSE ISNULL(@event_end, NULL) END,
                CASE WHEN @online_meeting_Clear = 1 THEN NULL ELSE ISNULL(@online_meeting, NULL) END,
                CASE WHEN @currency_type_Clear = 1 THEN NULL ELSE ISNULL(@currency_type, NULL) END,
                CASE WHEN @display_on_calendar_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_on_calendar_flag, NULL) END,
                CASE WHEN @default_track_Clear = 1 THEN NULL ELSE ISNULL(@default_track, NULL) END,
                CASE WHEN @campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@campaign_id, NULL) END,
                CASE WHEN @display_time_zone_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_time_zone_flag, NULL) END,
                CASE WHEN @deleted_time_Clear = 1 THEN NULL ELSE ISNULL(@deleted_time, NULL) END,
                CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, NULL) END,
                CASE WHEN @event_start_Clear = 1 THEN NULL ELSE ISNULL(@event_start, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @event_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEvents] WHERE [event_id] = @event_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateevents] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Events */

GRANT EXECUTE ON [constant_contact].[spCreateevents] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spUpdateevents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR events
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateevents]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateevents];
GO

CREATE PROCEDURE [constant_contact].[spUpdateevents]
    @event_code_Clear bit = 0,
    @event_code nvarchar(812) = NULL,
    @event_settings_Clear bit = 0,
    @event_settings nvarchar(MAX) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(812) = NULL,
    @cancelled_time_Clear bit = 0,
    @cancelled_time nvarchar(812) = NULL,
    @create_time_Clear bit = 0,
    @create_time nvarchar(812) = NULL,
    @event_id nvarchar(450),
    @contact_Clear bit = 0,
    @contact nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(812) = NULL,
    @registration_url_Clear bit = 0,
    @registration_url nvarchar(812) = NULL,
    @eso_Clear bit = 0,
    @eso nvarchar(812) = NULL,
    @event_calendar_url_Clear bit = 0,
    @event_calendar_url nvarchar(812) = NULL,
    @event_type_Clear bit = 0,
    @event_type nvarchar(812) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @time_zone_Clear bit = 0,
    @time_zone nvarchar(812) = NULL,
    @event_metadata_Clear bit = 0,
    @event_metadata nvarchar(MAX) = NULL,
    @event_promotions_Clear bit = 0,
    @event_promotions nvarchar(MAX) = NULL,
    @time_zone_abbreviation_Clear bit = 0,
    @time_zone_abbreviation nvarchar(812) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(900) = NULL,
    @notify_owner_on_reg_Clear bit = 0,
    @notify_owner_on_reg nvarchar(MAX) = NULL,
    @location_type_Clear bit = 0,
    @location_type nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @failed_campaign_activities_Clear bit = 0,
    @failed_campaign_activities nvarchar(MAX) = NULL,
    @display_contact_flag_Clear bit = 0,
    @display_contact_flag nvarchar(MAX) = NULL,
    @active_time_Clear bit = 0,
    @active_time nvarchar(812) = NULL,
    @event_widget_url_Clear bit = 0,
    @event_widget_url nvarchar(812) = NULL,
    @last_update_time_Clear bit = 0,
    @last_update_time nvarchar(812) = NULL,
    @display_end_time_flag_Clear bit = 0,
    @display_end_time_flag nvarchar(MAX) = NULL,
    @event_end_Clear bit = 0,
    @event_end nvarchar(812) = NULL,
    @online_meeting_Clear bit = 0,
    @online_meeting nvarchar(MAX) = NULL,
    @currency_type_Clear bit = 0,
    @currency_type nvarchar(812) = NULL,
    @display_on_calendar_flag_Clear bit = 0,
    @display_on_calendar_flag nvarchar(MAX) = NULL,
    @default_track_Clear bit = 0,
    @default_track nvarchar(MAX) = NULL,
    @campaign_id_Clear bit = 0,
    @campaign_id nvarchar(812) = NULL,
    @display_time_zone_flag_Clear bit = 0,
    @display_time_zone_flag nvarchar(MAX) = NULL,
    @deleted_time_Clear bit = 0,
    @deleted_time nvarchar(812) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(MAX) = NULL,
    @event_start_Clear bit = 0,
    @event_start nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[events]
    SET
        [event_code] = CASE WHEN @event_code_Clear = 1 THEN NULL ELSE ISNULL(@event_code, [event_code]) END,
        [event_settings] = CASE WHEN @event_settings_Clear = 1 THEN NULL ELSE ISNULL(@event_settings, [event_settings]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [cancelled_time] = CASE WHEN @cancelled_time_Clear = 1 THEN NULL ELSE ISNULL(@cancelled_time, [cancelled_time]) END,
        [create_time] = CASE WHEN @create_time_Clear = 1 THEN NULL ELSE ISNULL(@create_time, [create_time]) END,
        [contact] = CASE WHEN @contact_Clear = 1 THEN NULL ELSE ISNULL(@contact, [contact]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [registration_url] = CASE WHEN @registration_url_Clear = 1 THEN NULL ELSE ISNULL(@registration_url, [registration_url]) END,
        [eso] = CASE WHEN @eso_Clear = 1 THEN NULL ELSE ISNULL(@eso, [eso]) END,
        [event_calendar_url] = CASE WHEN @event_calendar_url_Clear = 1 THEN NULL ELSE ISNULL(@event_calendar_url, [event_calendar_url]) END,
        [event_type] = CASE WHEN @event_type_Clear = 1 THEN NULL ELSE ISNULL(@event_type, [event_type]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [time_zone] = CASE WHEN @time_zone_Clear = 1 THEN NULL ELSE ISNULL(@time_zone, [time_zone]) END,
        [event_metadata] = CASE WHEN @event_metadata_Clear = 1 THEN NULL ELSE ISNULL(@event_metadata, [event_metadata]) END,
        [event_promotions] = CASE WHEN @event_promotions_Clear = 1 THEN NULL ELSE ISNULL(@event_promotions, [event_promotions]) END,
        [time_zone_abbreviation] = CASE WHEN @time_zone_abbreviation_Clear = 1 THEN NULL ELSE ISNULL(@time_zone_abbreviation, [time_zone_abbreviation]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [notify_owner_on_reg] = CASE WHEN @notify_owner_on_reg_Clear = 1 THEN NULL ELSE ISNULL(@notify_owner_on_reg, [notify_owner_on_reg]) END,
        [location_type] = CASE WHEN @location_type_Clear = 1 THEN NULL ELSE ISNULL(@location_type, [location_type]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [failed_campaign_activities] = CASE WHEN @failed_campaign_activities_Clear = 1 THEN NULL ELSE ISNULL(@failed_campaign_activities, [failed_campaign_activities]) END,
        [display_contact_flag] = CASE WHEN @display_contact_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_contact_flag, [display_contact_flag]) END,
        [active_time] = CASE WHEN @active_time_Clear = 1 THEN NULL ELSE ISNULL(@active_time, [active_time]) END,
        [event_widget_url] = CASE WHEN @event_widget_url_Clear = 1 THEN NULL ELSE ISNULL(@event_widget_url, [event_widget_url]) END,
        [last_update_time] = CASE WHEN @last_update_time_Clear = 1 THEN NULL ELSE ISNULL(@last_update_time, [last_update_time]) END,
        [display_end_time_flag] = CASE WHEN @display_end_time_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_end_time_flag, [display_end_time_flag]) END,
        [event_end] = CASE WHEN @event_end_Clear = 1 THEN NULL ELSE ISNULL(@event_end, [event_end]) END,
        [online_meeting] = CASE WHEN @online_meeting_Clear = 1 THEN NULL ELSE ISNULL(@online_meeting, [online_meeting]) END,
        [currency_type] = CASE WHEN @currency_type_Clear = 1 THEN NULL ELSE ISNULL(@currency_type, [currency_type]) END,
        [display_on_calendar_flag] = CASE WHEN @display_on_calendar_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_on_calendar_flag, [display_on_calendar_flag]) END,
        [default_track] = CASE WHEN @default_track_Clear = 1 THEN NULL ELSE ISNULL(@default_track, [default_track]) END,
        [campaign_id] = CASE WHEN @campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@campaign_id, [campaign_id]) END,
        [display_time_zone_flag] = CASE WHEN @display_time_zone_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_time_zone_flag, [display_time_zone_flag]) END,
        [deleted_time] = CASE WHEN @deleted_time_Clear = 1 THEN NULL ELSE ISNULL(@deleted_time, [deleted_time]) END,
        [address] = CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, [address]) END,
        [event_start] = CASE WHEN @event_start_Clear = 1 THEN NULL ELSE ISNULL(@event_start, [event_start]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [event_id] = @event_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEvents]
                                    WHERE
                                        [event_id] = @event_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateevents] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the events table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateevents]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateevents];
GO
CREATE TRIGGER [constant_contact].trgUpdateevents
ON [constant_contact].[events]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[events]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[events] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[event_id] = I.[event_id];
END;
GO

/* spUpdate Permissions for Events */

GRANT EXECUTE ON [constant_contact].[spUpdateevents] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Events Copies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Copies
-- Item: vwEvents_copies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Events Copies
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  events_copy
-----               PRIMARY KEY: event_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEvents_copies]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEvents_copies];
GO

CREATE VIEW [constant_contact].[vwEvents_copies]
AS
SELECT
    e.*
FROM
    [constant_contact].[events_copy] AS e
GO
GRANT SELECT ON [constant_contact].[vwEvents_copies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Events Copies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Copies
-- Item: Permissions for vwEvents_copies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEvents_copies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Events Copies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Copies
-- Item: spCreateevents_copy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR events_copy
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateevents_copy]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateevents_copy];
GO

CREATE PROCEDURE [constant_contact].[spCreateevents_copy]
    @failed_campaign_activities_Clear bit = 0,
    @failed_campaign_activities nvarchar(MAX) = NULL,
    @cancelled_time_Clear bit = 0,
    @cancelled_time nvarchar(255) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(MAX) = NULL,
    @notify_owner_on_reg_Clear bit = 0,
    @notify_owner_on_reg nvarchar(255) = NULL,
    @last_update_time_Clear bit = 0,
    @last_update_time nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(400) = NULL,
    @event_end_Clear bit = 0,
    @event_end nvarchar(255) = NULL,
    @event_start_Clear bit = 0,
    @event_start nvarchar(255) = NULL,
    @event_settings_Clear bit = 0,
    @event_settings nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(400) = NULL,
    @event_widget_url_Clear bit = 0,
    @event_widget_url nvarchar(255) = NULL,
    @active_time_Clear bit = 0,
    @active_time nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(900) = NULL,
    @campaign_id_Clear bit = 0,
    @campaign_id nvarchar(255) = NULL,
    @event_type_Clear bit = 0,
    @event_type nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @display_on_calendar_flag_Clear bit = 0,
    @display_on_calendar_flag nvarchar(255) = NULL,
    @event_calendar_url_Clear bit = 0,
    @event_calendar_url nvarchar(255) = NULL,
    @eso_Clear bit = 0,
    @eso nvarchar(255) = NULL,
    @create_time_Clear bit = 0,
    @create_time nvarchar(255) = NULL,
    @online_meeting_Clear bit = 0,
    @online_meeting nvarchar(MAX) = NULL,
    @event_metadata_Clear bit = 0,
    @event_metadata nvarchar(MAX) = NULL,
    @event_id nvarchar(255) = NULL,
    @contact_Clear bit = 0,
    @contact nvarchar(MAX) = NULL,
    @deleted_time_Clear bit = 0,
    @deleted_time nvarchar(255) = NULL,
    @event_code_Clear bit = 0,
    @event_code nvarchar(255) = NULL,
    @display_time_zone_flag_Clear bit = 0,
    @display_time_zone_flag nvarchar(255) = NULL,
    @event_promotions_Clear bit = 0,
    @event_promotions nvarchar(MAX) = NULL,
    @display_contact_flag_Clear bit = 0,
    @display_contact_flag nvarchar(255) = NULL,
    @time_zone_abbreviation_Clear bit = 0,
    @time_zone_abbreviation nvarchar(255) = NULL,
    @time_zone_Clear bit = 0,
    @time_zone nvarchar(255) = NULL,
    @registration_url_Clear bit = 0,
    @registration_url nvarchar(255) = NULL,
    @currency_type_Clear bit = 0,
    @currency_type nvarchar(255) = NULL,
    @display_end_time_flag_Clear bit = 0,
    @display_end_time_flag nvarchar(255) = NULL,
    @location_type_Clear bit = 0,
    @location_type nvarchar(255) = NULL,
    @default_track_Clear bit = 0,
    @default_track nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[events_copy]
        (
            [failed_campaign_activities],
                [cancelled_time],
                [address],
                [notify_owner_on_reg],
                [last_update_time],
                [name],
                [event_end],
                [event_start],
                [event_settings],
                [title],
                [event_widget_url],
                [active_time],
                [description],
                [campaign_id],
                [event_type],
                [status],
                [display_on_calendar_flag],
                [event_calendar_url],
                [eso],
                [create_time],
                [online_meeting],
                [event_metadata],
                [contact],
                [deleted_time],
                [event_code],
                [display_time_zone_flag],
                [event_promotions],
                [display_contact_flag],
                [time_zone_abbreviation],
                [time_zone],
                [registration_url],
                [currency_type],
                [display_end_time_flag],
                [location_type],
                [default_track],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [event_id]
        )
    VALUES
        (
            CASE WHEN @failed_campaign_activities_Clear = 1 THEN NULL ELSE ISNULL(@failed_campaign_activities, NULL) END,
                CASE WHEN @cancelled_time_Clear = 1 THEN NULL ELSE ISNULL(@cancelled_time, NULL) END,
                CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, NULL) END,
                CASE WHEN @notify_owner_on_reg_Clear = 1 THEN NULL ELSE ISNULL(@notify_owner_on_reg, NULL) END,
                CASE WHEN @last_update_time_Clear = 1 THEN NULL ELSE ISNULL(@last_update_time, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @event_end_Clear = 1 THEN NULL ELSE ISNULL(@event_end, NULL) END,
                CASE WHEN @event_start_Clear = 1 THEN NULL ELSE ISNULL(@event_start, NULL) END,
                CASE WHEN @event_settings_Clear = 1 THEN NULL ELSE ISNULL(@event_settings, NULL) END,
                CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, NULL) END,
                CASE WHEN @event_widget_url_Clear = 1 THEN NULL ELSE ISNULL(@event_widget_url, NULL) END,
                CASE WHEN @active_time_Clear = 1 THEN NULL ELSE ISNULL(@active_time, NULL) END,
                CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, NULL) END,
                CASE WHEN @campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@campaign_id, NULL) END,
                CASE WHEN @event_type_Clear = 1 THEN NULL ELSE ISNULL(@event_type, NULL) END,
                CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @display_on_calendar_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_on_calendar_flag, NULL) END,
                CASE WHEN @event_calendar_url_Clear = 1 THEN NULL ELSE ISNULL(@event_calendar_url, NULL) END,
                CASE WHEN @eso_Clear = 1 THEN NULL ELSE ISNULL(@eso, NULL) END,
                CASE WHEN @create_time_Clear = 1 THEN NULL ELSE ISNULL(@create_time, NULL) END,
                CASE WHEN @online_meeting_Clear = 1 THEN NULL ELSE ISNULL(@online_meeting, NULL) END,
                CASE WHEN @event_metadata_Clear = 1 THEN NULL ELSE ISNULL(@event_metadata, NULL) END,
                CASE WHEN @contact_Clear = 1 THEN NULL ELSE ISNULL(@contact, NULL) END,
                CASE WHEN @deleted_time_Clear = 1 THEN NULL ELSE ISNULL(@deleted_time, NULL) END,
                CASE WHEN @event_code_Clear = 1 THEN NULL ELSE ISNULL(@event_code, NULL) END,
                CASE WHEN @display_time_zone_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_time_zone_flag, NULL) END,
                CASE WHEN @event_promotions_Clear = 1 THEN NULL ELSE ISNULL(@event_promotions, NULL) END,
                CASE WHEN @display_contact_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_contact_flag, NULL) END,
                CASE WHEN @time_zone_abbreviation_Clear = 1 THEN NULL ELSE ISNULL(@time_zone_abbreviation, NULL) END,
                CASE WHEN @time_zone_Clear = 1 THEN NULL ELSE ISNULL(@time_zone, NULL) END,
                CASE WHEN @registration_url_Clear = 1 THEN NULL ELSE ISNULL(@registration_url, NULL) END,
                CASE WHEN @currency_type_Clear = 1 THEN NULL ELSE ISNULL(@currency_type, NULL) END,
                CASE WHEN @display_end_time_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_end_time_flag, NULL) END,
                CASE WHEN @location_type_Clear = 1 THEN NULL ELSE ISNULL(@location_type, NULL) END,
                CASE WHEN @default_track_Clear = 1 THEN NULL ELSE ISNULL(@default_track, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @event_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEvents_copies] WHERE [event_id] = @event_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateevents_copy] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Events Copies */

GRANT EXECUTE ON [constant_contact].[spCreateevents_copy] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Events Copies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Copies
-- Item: spUpdateevents_copy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR events_copy
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateevents_copy]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateevents_copy];
GO

CREATE PROCEDURE [constant_contact].[spUpdateevents_copy]
    @failed_campaign_activities_Clear bit = 0,
    @failed_campaign_activities nvarchar(MAX) = NULL,
    @cancelled_time_Clear bit = 0,
    @cancelled_time nvarchar(255) = NULL,
    @address_Clear bit = 0,
    @address nvarchar(MAX) = NULL,
    @notify_owner_on_reg_Clear bit = 0,
    @notify_owner_on_reg nvarchar(255) = NULL,
    @last_update_time_Clear bit = 0,
    @last_update_time nvarchar(255) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(400) = NULL,
    @event_end_Clear bit = 0,
    @event_end nvarchar(255) = NULL,
    @event_start_Clear bit = 0,
    @event_start nvarchar(255) = NULL,
    @event_settings_Clear bit = 0,
    @event_settings nvarchar(MAX) = NULL,
    @title_Clear bit = 0,
    @title nvarchar(400) = NULL,
    @event_widget_url_Clear bit = 0,
    @event_widget_url nvarchar(255) = NULL,
    @active_time_Clear bit = 0,
    @active_time nvarchar(255) = NULL,
    @description_Clear bit = 0,
    @description nvarchar(900) = NULL,
    @campaign_id_Clear bit = 0,
    @campaign_id nvarchar(255) = NULL,
    @event_type_Clear bit = 0,
    @event_type nvarchar(255) = NULL,
    @status_Clear bit = 0,
    @status nvarchar(255) = NULL,
    @display_on_calendar_flag_Clear bit = 0,
    @display_on_calendar_flag nvarchar(255) = NULL,
    @event_calendar_url_Clear bit = 0,
    @event_calendar_url nvarchar(255) = NULL,
    @eso_Clear bit = 0,
    @eso nvarchar(255) = NULL,
    @create_time_Clear bit = 0,
    @create_time nvarchar(255) = NULL,
    @online_meeting_Clear bit = 0,
    @online_meeting nvarchar(MAX) = NULL,
    @event_metadata_Clear bit = 0,
    @event_metadata nvarchar(MAX) = NULL,
    @event_id nvarchar(255),
    @contact_Clear bit = 0,
    @contact nvarchar(MAX) = NULL,
    @deleted_time_Clear bit = 0,
    @deleted_time nvarchar(255) = NULL,
    @event_code_Clear bit = 0,
    @event_code nvarchar(255) = NULL,
    @display_time_zone_flag_Clear bit = 0,
    @display_time_zone_flag nvarchar(255) = NULL,
    @event_promotions_Clear bit = 0,
    @event_promotions nvarchar(MAX) = NULL,
    @display_contact_flag_Clear bit = 0,
    @display_contact_flag nvarchar(255) = NULL,
    @time_zone_abbreviation_Clear bit = 0,
    @time_zone_abbreviation nvarchar(255) = NULL,
    @time_zone_Clear bit = 0,
    @time_zone nvarchar(255) = NULL,
    @registration_url_Clear bit = 0,
    @registration_url nvarchar(255) = NULL,
    @currency_type_Clear bit = 0,
    @currency_type nvarchar(255) = NULL,
    @display_end_time_flag_Clear bit = 0,
    @display_end_time_flag nvarchar(255) = NULL,
    @location_type_Clear bit = 0,
    @location_type nvarchar(255) = NULL,
    @default_track_Clear bit = 0,
    @default_track nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[events_copy]
    SET
        [failed_campaign_activities] = CASE WHEN @failed_campaign_activities_Clear = 1 THEN NULL ELSE ISNULL(@failed_campaign_activities, [failed_campaign_activities]) END,
        [cancelled_time] = CASE WHEN @cancelled_time_Clear = 1 THEN NULL ELSE ISNULL(@cancelled_time, [cancelled_time]) END,
        [address] = CASE WHEN @address_Clear = 1 THEN NULL ELSE ISNULL(@address, [address]) END,
        [notify_owner_on_reg] = CASE WHEN @notify_owner_on_reg_Clear = 1 THEN NULL ELSE ISNULL(@notify_owner_on_reg, [notify_owner_on_reg]) END,
        [last_update_time] = CASE WHEN @last_update_time_Clear = 1 THEN NULL ELSE ISNULL(@last_update_time, [last_update_time]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [event_end] = CASE WHEN @event_end_Clear = 1 THEN NULL ELSE ISNULL(@event_end, [event_end]) END,
        [event_start] = CASE WHEN @event_start_Clear = 1 THEN NULL ELSE ISNULL(@event_start, [event_start]) END,
        [event_settings] = CASE WHEN @event_settings_Clear = 1 THEN NULL ELSE ISNULL(@event_settings, [event_settings]) END,
        [title] = CASE WHEN @title_Clear = 1 THEN NULL ELSE ISNULL(@title, [title]) END,
        [event_widget_url] = CASE WHEN @event_widget_url_Clear = 1 THEN NULL ELSE ISNULL(@event_widget_url, [event_widget_url]) END,
        [active_time] = CASE WHEN @active_time_Clear = 1 THEN NULL ELSE ISNULL(@active_time, [active_time]) END,
        [description] = CASE WHEN @description_Clear = 1 THEN NULL ELSE ISNULL(@description, [description]) END,
        [campaign_id] = CASE WHEN @campaign_id_Clear = 1 THEN NULL ELSE ISNULL(@campaign_id, [campaign_id]) END,
        [event_type] = CASE WHEN @event_type_Clear = 1 THEN NULL ELSE ISNULL(@event_type, [event_type]) END,
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [display_on_calendar_flag] = CASE WHEN @display_on_calendar_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_on_calendar_flag, [display_on_calendar_flag]) END,
        [event_calendar_url] = CASE WHEN @event_calendar_url_Clear = 1 THEN NULL ELSE ISNULL(@event_calendar_url, [event_calendar_url]) END,
        [eso] = CASE WHEN @eso_Clear = 1 THEN NULL ELSE ISNULL(@eso, [eso]) END,
        [create_time] = CASE WHEN @create_time_Clear = 1 THEN NULL ELSE ISNULL(@create_time, [create_time]) END,
        [online_meeting] = CASE WHEN @online_meeting_Clear = 1 THEN NULL ELSE ISNULL(@online_meeting, [online_meeting]) END,
        [event_metadata] = CASE WHEN @event_metadata_Clear = 1 THEN NULL ELSE ISNULL(@event_metadata, [event_metadata]) END,
        [contact] = CASE WHEN @contact_Clear = 1 THEN NULL ELSE ISNULL(@contact, [contact]) END,
        [deleted_time] = CASE WHEN @deleted_time_Clear = 1 THEN NULL ELSE ISNULL(@deleted_time, [deleted_time]) END,
        [event_code] = CASE WHEN @event_code_Clear = 1 THEN NULL ELSE ISNULL(@event_code, [event_code]) END,
        [display_time_zone_flag] = CASE WHEN @display_time_zone_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_time_zone_flag, [display_time_zone_flag]) END,
        [event_promotions] = CASE WHEN @event_promotions_Clear = 1 THEN NULL ELSE ISNULL(@event_promotions, [event_promotions]) END,
        [display_contact_flag] = CASE WHEN @display_contact_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_contact_flag, [display_contact_flag]) END,
        [time_zone_abbreviation] = CASE WHEN @time_zone_abbreviation_Clear = 1 THEN NULL ELSE ISNULL(@time_zone_abbreviation, [time_zone_abbreviation]) END,
        [time_zone] = CASE WHEN @time_zone_Clear = 1 THEN NULL ELSE ISNULL(@time_zone, [time_zone]) END,
        [registration_url] = CASE WHEN @registration_url_Clear = 1 THEN NULL ELSE ISNULL(@registration_url, [registration_url]) END,
        [currency_type] = CASE WHEN @currency_type_Clear = 1 THEN NULL ELSE ISNULL(@currency_type, [currency_type]) END,
        [display_end_time_flag] = CASE WHEN @display_end_time_flag_Clear = 1 THEN NULL ELSE ISNULL(@display_end_time_flag, [display_end_time_flag]) END,
        [location_type] = CASE WHEN @location_type_Clear = 1 THEN NULL ELSE ISNULL(@location_type, [location_type]) END,
        [default_track] = CASE WHEN @default_track_Clear = 1 THEN NULL ELSE ISNULL(@default_track, [default_track]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [event_id] = @event_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEvents_copies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEvents_copies]
                                    WHERE
                                        [event_id] = @event_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateevents_copy] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the events_copy table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateevents_copy]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateevents_copy];
GO
CREATE TRIGGER [constant_contact].trgUpdateevents_copy
ON [constant_contact].[events_copy]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[events_copy]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[events_copy] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[event_id] = I.[event_id];
END;
GO

/* spUpdate Permissions for Events Copies */

GRANT EXECUTE ON [constant_contact].[spUpdateevents_copy] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Email Reports Summaries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Email Reports Summaries
-- Item: spDeleteemail_reports_summary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR email_reports_summary
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteemail_reports_summary]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteemail_reports_summary];
GO

CREATE PROCEDURE [constant_contact].[spDeleteemail_reports_summary]
    @campaign_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[email_reports_summary]
    WHERE
        [campaign_id] = @campaign_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [campaign_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @campaign_id AS [campaign_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteemail_reports_summary] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Email Reports Summaries */

GRANT EXECUTE ON [constant_contact].[spDeleteemail_reports_summary] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Emails */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails
-- Item: spDeleteemails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR emails
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteemails]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteemails];
GO

CREATE PROCEDURE [constant_contact].[spDeleteemails]
    @campaign_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[emails]
    WHERE
        [campaign_id] = @campaign_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [campaign_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @campaign_id AS [campaign_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteemails] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Emails */

GRANT EXECUTE ON [constant_contact].[spDeleteemails] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Emails Xrefs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Emails Xrefs
-- Item: spDeleteemails_xrefs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR emails_xrefs
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteemails_xrefs]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteemails_xrefs];
GO

CREATE PROCEDURE [constant_contact].[spDeleteemails_xrefs]
    @campaign_activity_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[emails_xrefs]
    WHERE
        [campaign_activity_id] = @campaign_activity_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [campaign_activity_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @campaign_activity_id AS [campaign_activity_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteemails_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Emails Xrefs */

GRANT EXECUTE ON [constant_contact].[spDeleteemails_xrefs] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events
-- Item: spDeleteevents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR events
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteevents]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteevents];
GO

CREATE PROCEDURE [constant_contact].[spDeleteevents]
    @event_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[events]
    WHERE
        [event_id] = @event_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [event_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @event_id AS [event_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteevents] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Events */

GRANT EXECUTE ON [constant_contact].[spDeleteevents] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Events Copies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Copies
-- Item: spDeleteevents_copy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR events_copy
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteevents_copy]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteevents_copy];
GO

CREATE PROCEDURE [constant_contact].[spDeleteevents_copy]
    @event_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[events_copy]
    WHERE
        [event_id] = @event_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [event_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @event_id AS [event_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteevents_copy] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Events Copies */

GRANT EXECUTE ON [constant_contact].[spDeleteevents_copy] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for events_registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Registrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key contact_id in table events_registrations
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_events_registrations_contact_id' 
    AND object_id = OBJECT_ID('[constant_contact].[events_registrations]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_events_registrations_contact_id ON [constant_contact].[events_registrations] ([contact_id]);

/* Base View SQL for Events Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Registrations
-- Item: vwEvents_registrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Events Registrations
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  events_registrations
-----               PRIMARY KEY: registration_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwEvents_registrations]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwEvents_registrations];
GO

CREATE VIEW [constant_contact].[vwEvents_registrations]
AS
SELECT
    e.*
FROM
    [constant_contact].[events_registrations] AS e
GO
GRANT SELECT ON [constant_contact].[vwEvents_registrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Events Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Registrations
-- Item: Permissions for vwEvents_registrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwEvents_registrations] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Events Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Registrations
-- Item: spCreateevents_registrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR events_registrations
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreateevents_registrations]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreateevents_registrations];
GO

CREATE PROCEDURE [constant_contact].[spCreateevents_registrations]
    @order_summary_Clear bit = 0,
    @order_summary nvarchar(MAX) = NULL,
    @contact_Clear bit = 0,
    @contact nvarchar(MAX) = NULL,
    @tickets_Clear bit = 0,
    @tickets nvarchar(MAX) = NULL,
    @display_physical_tickets_Clear bit = 0,
    @display_physical_tickets nvarchar(255) = NULL,
    @registration_status_Clear bit = 0,
    @registration_status nvarchar(255) = NULL,
    @eligible_checkin_tickets_Clear bit = 0,
    @eligible_checkin_tickets nvarchar(255) = NULL,
    @contact_id_Clear bit = 0,
    @contact_id nvarchar(255) = NULL,
    @registration_id nvarchar(255) = NULL,
    @checkedIn_tickets_Clear bit = 0,
    @checkedIn_tickets nvarchar(255) = NULL,
    @checkin_status_Clear bit = 0,
    @checkin_status nvarchar(255) = NULL,
    @registration_date_Clear bit = 0,
    @registration_date nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[events_registrations]
        (
            [order_summary],
                [contact],
                [tickets],
                [display_physical_tickets],
                [registration_status],
                [eligible_checkin_tickets],
                [contact_id],
                [checkedIn_tickets],
                [checkin_status],
                [registration_date],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [registration_id]
        )
    VALUES
        (
            CASE WHEN @order_summary_Clear = 1 THEN NULL ELSE ISNULL(@order_summary, NULL) END,
                CASE WHEN @contact_Clear = 1 THEN NULL ELSE ISNULL(@contact, NULL) END,
                CASE WHEN @tickets_Clear = 1 THEN NULL ELSE ISNULL(@tickets, NULL) END,
                CASE WHEN @display_physical_tickets_Clear = 1 THEN NULL ELSE ISNULL(@display_physical_tickets, NULL) END,
                CASE WHEN @registration_status_Clear = 1 THEN NULL ELSE ISNULL(@registration_status, NULL) END,
                CASE WHEN @eligible_checkin_tickets_Clear = 1 THEN NULL ELSE ISNULL(@eligible_checkin_tickets, NULL) END,
                CASE WHEN @contact_id_Clear = 1 THEN NULL ELSE ISNULL(@contact_id, NULL) END,
                CASE WHEN @checkedIn_tickets_Clear = 1 THEN NULL ELSE ISNULL(@checkedIn_tickets, NULL) END,
                CASE WHEN @checkin_status_Clear = 1 THEN NULL ELSE ISNULL(@checkin_status, NULL) END,
                CASE WHEN @registration_date_Clear = 1 THEN NULL ELSE ISNULL(@registration_date, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @registration_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwEvents_registrations] WHERE [registration_id] = @registration_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreateevents_registrations] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Events Registrations */

GRANT EXECUTE ON [constant_contact].[spCreateevents_registrations] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Events Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Registrations
-- Item: spUpdateevents_registrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR events_registrations
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdateevents_registrations]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdateevents_registrations];
GO

CREATE PROCEDURE [constant_contact].[spUpdateevents_registrations]
    @order_summary_Clear bit = 0,
    @order_summary nvarchar(MAX) = NULL,
    @contact_Clear bit = 0,
    @contact nvarchar(MAX) = NULL,
    @tickets_Clear bit = 0,
    @tickets nvarchar(MAX) = NULL,
    @display_physical_tickets_Clear bit = 0,
    @display_physical_tickets nvarchar(255) = NULL,
    @registration_status_Clear bit = 0,
    @registration_status nvarchar(255) = NULL,
    @eligible_checkin_tickets_Clear bit = 0,
    @eligible_checkin_tickets nvarchar(255) = NULL,
    @contact_id_Clear bit = 0,
    @contact_id nvarchar(255) = NULL,
    @registration_id nvarchar(255),
    @checkedIn_tickets_Clear bit = 0,
    @checkedIn_tickets nvarchar(255) = NULL,
    @checkin_status_Clear bit = 0,
    @checkin_status nvarchar(255) = NULL,
    @registration_date_Clear bit = 0,
    @registration_date nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[events_registrations]
    SET
        [order_summary] = CASE WHEN @order_summary_Clear = 1 THEN NULL ELSE ISNULL(@order_summary, [order_summary]) END,
        [contact] = CASE WHEN @contact_Clear = 1 THEN NULL ELSE ISNULL(@contact, [contact]) END,
        [tickets] = CASE WHEN @tickets_Clear = 1 THEN NULL ELSE ISNULL(@tickets, [tickets]) END,
        [display_physical_tickets] = CASE WHEN @display_physical_tickets_Clear = 1 THEN NULL ELSE ISNULL(@display_physical_tickets, [display_physical_tickets]) END,
        [registration_status] = CASE WHEN @registration_status_Clear = 1 THEN NULL ELSE ISNULL(@registration_status, [registration_status]) END,
        [eligible_checkin_tickets] = CASE WHEN @eligible_checkin_tickets_Clear = 1 THEN NULL ELSE ISNULL(@eligible_checkin_tickets, [eligible_checkin_tickets]) END,
        [contact_id] = CASE WHEN @contact_id_Clear = 1 THEN NULL ELSE ISNULL(@contact_id, [contact_id]) END,
        [checkedIn_tickets] = CASE WHEN @checkedIn_tickets_Clear = 1 THEN NULL ELSE ISNULL(@checkedIn_tickets, [checkedIn_tickets]) END,
        [checkin_status] = CASE WHEN @checkin_status_Clear = 1 THEN NULL ELSE ISNULL(@checkin_status, [checkin_status]) END,
        [registration_date] = CASE WHEN @registration_date_Clear = 1 THEN NULL ELSE ISNULL(@registration_date, [registration_date]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [registration_id] = @registration_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwEvents_registrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwEvents_registrations]
                                    WHERE
                                        [registration_id] = @registration_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdateevents_registrations] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the events_registrations table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdateevents_registrations]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdateevents_registrations];
GO
CREATE TRIGGER [constant_contact].trgUpdateevents_registrations
ON [constant_contact].[events_registrations]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[events_registrations]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[events_registrations] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[registration_id] = I.[registration_id];
END;
GO

/* spUpdate Permissions for Events Registrations */

GRANT EXECUTE ON [constant_contact].[spUpdateevents_registrations] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Events Registrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Events Registrations
-- Item: spDeleteevents_registrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR events_registrations
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeleteevents_registrations]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeleteevents_registrations];
GO

CREATE PROCEDURE [constant_contact].[spDeleteevents_registrations]
    @registration_id nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[events_registrations]
    WHERE
        [registration_id] = @registration_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [registration_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @registration_id AS [registration_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeleteevents_registrations] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Events Registrations */

GRANT EXECUTE ON [constant_contact].[spDeleteevents_registrations] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for segments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Segments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Segments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Segments
-- Item: vwSegments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Segments
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  segments
-----               PRIMARY KEY: segment_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwSegments]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwSegments];
GO

CREATE VIEW [constant_contact].[vwSegments]
AS
SELECT
    s.*
FROM
    [constant_contact].[segments] AS s
GO
GRANT SELECT ON [constant_contact].[vwSegments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Segments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Segments
-- Item: Permissions for vwSegments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwSegments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Segments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Segments
-- Item: spCreatesegments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR segments
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatesegments]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatesegments];
GO

CREATE PROCEDURE [constant_contact].[spCreatesegments]
    @segment_criteria_Clear bit = 0,
    @segment_criteria nvarchar(MAX) = NULL,
    @edited_at_Clear bit = 0,
    @edited_at nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @segment_id nvarchar(450) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[segments]
        (
            [segment_criteria],
                [edited_at],
                [created_at],
                [mj_e2e_custom_attr],
                [name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [segment_id]
        )
    VALUES
        (
            CASE WHEN @segment_criteria_Clear = 1 THEN NULL ELSE ISNULL(@segment_criteria, NULL) END,
                CASE WHEN @edited_at_Clear = 1 THEN NULL ELSE ISNULL(@edited_at, NULL) END,
                CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @segment_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwSegments] WHERE [segment_id] = @segment_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatesegments] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Segments */

GRANT EXECUTE ON [constant_contact].[spCreatesegments] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Segments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Segments
-- Item: spUpdatesegments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR segments
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatesegments]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatesegments];
GO

CREATE PROCEDURE [constant_contact].[spUpdatesegments]
    @segment_criteria_Clear bit = 0,
    @segment_criteria nvarchar(MAX) = NULL,
    @edited_at_Clear bit = 0,
    @edited_at nvarchar(MAX) = NULL,
    @created_at_Clear bit = 0,
    @created_at nvarchar(MAX) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @segment_id nvarchar(450),
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[segments]
    SET
        [segment_criteria] = CASE WHEN @segment_criteria_Clear = 1 THEN NULL ELSE ISNULL(@segment_criteria, [segment_criteria]) END,
        [edited_at] = CASE WHEN @edited_at_Clear = 1 THEN NULL ELSE ISNULL(@edited_at, [edited_at]) END,
        [created_at] = CASE WHEN @created_at_Clear = 1 THEN NULL ELSE ISNULL(@created_at, [created_at]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [segment_id] = @segment_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwSegments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwSegments]
                                    WHERE
                                        [segment_id] = @segment_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatesegments] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the segments table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatesegments]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatesegments];
GO
CREATE TRIGGER [constant_contact].trgUpdatesegments
ON [constant_contact].[segments]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[segments]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[segments] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[segment_id] = I.[segment_id];
END;
GO

/* spUpdate Permissions for Segments */

GRANT EXECUTE ON [constant_contact].[spUpdatesegments] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Segments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Segments
-- Item: spDeletesegments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR segments
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletesegments]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletesegments];
GO

CREATE PROCEDURE [constant_contact].[spDeletesegments]
    @segment_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[segments]
    WHERE
        [segment_id] = @segment_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [segment_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @segment_id AS [segment_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletesegments] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Segments */

GRANT EXECUTE ON [constant_contact].[spDeletesegments] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for social_connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Connections
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for social_hashtag_groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Hashtag Groups
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for social_posts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Posts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key campaign_id in table social_posts
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_social_posts_campaign_id' 
    AND object_id = OBJECT_ID('[constant_contact].[social_posts]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_social_posts_campaign_id ON [constant_contact].[social_posts] ([campaign_id]);

/* Index for Foreign Keys for social_profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Profiles
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for Social Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Connections
-- Item: vwSocial_connections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Social Connections
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  social_connections
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwSocial_connections]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwSocial_connections];
GO

CREATE VIEW [constant_contact].[vwSocial_connections]
AS
SELECT
    s.*
FROM
    [constant_contact].[social_connections] AS s
GO
GRANT SELECT ON [constant_contact].[vwSocial_connections] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Social Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Connections
-- Item: Permissions for vwSocial_connections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwSocial_connections] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Social Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Connections
-- Item: spCreatesocial_connections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR social_connections
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatesocial_connections]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatesocial_connections];
GO

CREATE PROCEDURE [constant_contact].[spCreatesocial_connections]
    @account_info_Clear bit = 0,
    @account_info nvarchar(MAX) = NULL,
    @ID nvarchar(450) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @connection_status_Clear bit = 0,
    @connection_status nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[social_connections]
        (
            [account_info],
                [mj_e2e_custom_attr],
                [connection_status],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [ID]
        )
    VALUES
        (
            CASE WHEN @account_info_Clear = 1 THEN NULL ELSE ISNULL(@account_info, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @connection_status_Clear = 1 THEN NULL ELSE ISNULL(@connection_status, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @ID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwSocial_connections] WHERE [ID] = @ID
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatesocial_connections] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Social Connections */

GRANT EXECUTE ON [constant_contact].[spCreatesocial_connections] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Social Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Connections
-- Item: spUpdatesocial_connections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR social_connections
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatesocial_connections]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatesocial_connections];
GO

CREATE PROCEDURE [constant_contact].[spUpdatesocial_connections]
    @account_info_Clear bit = 0,
    @account_info nvarchar(MAX) = NULL,
    @ID nvarchar(450),
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @connection_status_Clear bit = 0,
    @connection_status nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[social_connections]
    SET
        [account_info] = CASE WHEN @account_info_Clear = 1 THEN NULL ELSE ISNULL(@account_info, [account_info]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [connection_status] = CASE WHEN @connection_status_Clear = 1 THEN NULL ELSE ISNULL(@connection_status, [connection_status]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwSocial_connections] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwSocial_connections]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatesocial_connections] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the social_connections table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatesocial_connections]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatesocial_connections];
GO
CREATE TRIGGER [constant_contact].trgUpdatesocial_connections
ON [constant_contact].[social_connections]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[social_connections]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[social_connections] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for Social Connections */

GRANT EXECUTE ON [constant_contact].[spUpdatesocial_connections] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Social Hashtag Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Hashtag Groups
-- Item: vwSocial_hashtag_groups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Social Hashtag Groups
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  social_hashtag_groups
-----               PRIMARY KEY: hashtag_group_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwSocial_hashtag_groups]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwSocial_hashtag_groups];
GO

CREATE VIEW [constant_contact].[vwSocial_hashtag_groups]
AS
SELECT
    s.*
FROM
    [constant_contact].[social_hashtag_groups] AS s
GO
GRANT SELECT ON [constant_contact].[vwSocial_hashtag_groups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Social Hashtag Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Hashtag Groups
-- Item: Permissions for vwSocial_hashtag_groups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwSocial_hashtag_groups] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Social Hashtag Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Hashtag Groups
-- Item: spCreatesocial_hashtag_groups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR social_hashtag_groups
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatesocial_hashtag_groups]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatesocial_hashtag_groups];
GO

CREATE PROCEDURE [constant_contact].[spCreatesocial_hashtag_groups]
    @hashtag_group_id nvarchar(450) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @hashtag_group_name_Clear bit = 0,
    @hashtag_group_name nvarchar(MAX) = NULL,
    @hashtag_names_Clear bit = 0,
    @hashtag_names nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[social_hashtag_groups]
        (
            [mj_e2e_custom_attr],
                [hashtag_group_name],
                [hashtag_names],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [hashtag_group_id]
        )
    VALUES
        (
            CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @hashtag_group_name_Clear = 1 THEN NULL ELSE ISNULL(@hashtag_group_name, NULL) END,
                CASE WHEN @hashtag_names_Clear = 1 THEN NULL ELSE ISNULL(@hashtag_names, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @hashtag_group_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwSocial_hashtag_groups] WHERE [hashtag_group_id] = @hashtag_group_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatesocial_hashtag_groups] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Social Hashtag Groups */

GRANT EXECUTE ON [constant_contact].[spCreatesocial_hashtag_groups] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Social Hashtag Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Hashtag Groups
-- Item: spUpdatesocial_hashtag_groups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR social_hashtag_groups
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatesocial_hashtag_groups]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatesocial_hashtag_groups];
GO

CREATE PROCEDURE [constant_contact].[spUpdatesocial_hashtag_groups]
    @hashtag_group_id nvarchar(450),
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @hashtag_group_name_Clear bit = 0,
    @hashtag_group_name nvarchar(MAX) = NULL,
    @hashtag_names_Clear bit = 0,
    @hashtag_names nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[social_hashtag_groups]
    SET
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [hashtag_group_name] = CASE WHEN @hashtag_group_name_Clear = 1 THEN NULL ELSE ISNULL(@hashtag_group_name, [hashtag_group_name]) END,
        [hashtag_names] = CASE WHEN @hashtag_names_Clear = 1 THEN NULL ELSE ISNULL(@hashtag_names, [hashtag_names]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [hashtag_group_id] = @hashtag_group_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwSocial_hashtag_groups] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwSocial_hashtag_groups]
                                    WHERE
                                        [hashtag_group_id] = @hashtag_group_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatesocial_hashtag_groups] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the social_hashtag_groups table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatesocial_hashtag_groups]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatesocial_hashtag_groups];
GO
CREATE TRIGGER [constant_contact].trgUpdatesocial_hashtag_groups
ON [constant_contact].[social_hashtag_groups]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[social_hashtag_groups]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[social_hashtag_groups] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[hashtag_group_id] = I.[hashtag_group_id];
END;
GO

/* spUpdate Permissions for Social Hashtag Groups */

GRANT EXECUTE ON [constant_contact].[spUpdatesocial_hashtag_groups] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Social Posts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Posts
-- Item: vwSocial_posts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Social Posts
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  social_posts
-----               PRIMARY KEY: campaign_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwSocial_posts]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwSocial_posts];
GO

CREATE VIEW [constant_contact].[vwSocial_posts]
AS
SELECT
    s.*
FROM
    [constant_contact].[social_posts] AS s
GO
GRANT SELECT ON [constant_contact].[vwSocial_posts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Social Posts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Posts
-- Item: Permissions for vwSocial_posts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwSocial_posts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Social Posts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Posts
-- Item: spCreatesocial_posts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR social_posts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatesocial_posts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatesocial_posts];
GO

CREATE PROCEDURE [constant_contact].[spCreatesocial_posts]
    @status_Clear bit = 0,
    @status nvarchar(812) = NULL,
    @scheduled_time_Clear bit = 0,
    @scheduled_time nvarchar(812) = NULL,
    @profile_posts_Clear bit = 0,
    @profile_posts nvarchar(MAX) = NULL,
    @campaign_id nvarchar(450) = NULL,
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[social_posts]
        (
            [status],
                [scheduled_time],
                [profile_posts],
                [mj_e2e_custom_attr],
                [name],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [campaign_id]
        )
    VALUES
        (
            CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, NULL) END,
                CASE WHEN @scheduled_time_Clear = 1 THEN NULL ELSE ISNULL(@scheduled_time, NULL) END,
                CASE WHEN @profile_posts_Clear = 1 THEN NULL ELSE ISNULL(@profile_posts, NULL) END,
                CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @campaign_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwSocial_posts] WHERE [campaign_id] = @campaign_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatesocial_posts] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Social Posts */

GRANT EXECUTE ON [constant_contact].[spCreatesocial_posts] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Social Posts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Posts
-- Item: spUpdatesocial_posts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR social_posts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatesocial_posts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatesocial_posts];
GO

CREATE PROCEDURE [constant_contact].[spUpdatesocial_posts]
    @status_Clear bit = 0,
    @status nvarchar(812) = NULL,
    @scheduled_time_Clear bit = 0,
    @scheduled_time nvarchar(812) = NULL,
    @profile_posts_Clear bit = 0,
    @profile_posts nvarchar(MAX) = NULL,
    @campaign_id nvarchar(450),
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[social_posts]
    SET
        [status] = CASE WHEN @status_Clear = 1 THEN NULL ELSE ISNULL(@status, [status]) END,
        [scheduled_time] = CASE WHEN @scheduled_time_Clear = 1 THEN NULL ELSE ISNULL(@scheduled_time, [scheduled_time]) END,
        [profile_posts] = CASE WHEN @profile_posts_Clear = 1 THEN NULL ELSE ISNULL(@profile_posts, [profile_posts]) END,
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [campaign_id] = @campaign_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwSocial_posts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwSocial_posts]
                                    WHERE
                                        [campaign_id] = @campaign_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatesocial_posts] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the social_posts table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatesocial_posts]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatesocial_posts];
GO
CREATE TRIGGER [constant_contact].trgUpdatesocial_posts
ON [constant_contact].[social_posts]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[social_posts]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[social_posts] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[campaign_id] = I.[campaign_id];
END;
GO

/* spUpdate Permissions for Social Posts */

GRANT EXECUTE ON [constant_contact].[spUpdatesocial_posts] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for Social Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Profiles
-- Item: vwSocial_profiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Social Profiles
-----               SCHEMA:      constant_contact
-----               BASE TABLE:  social_profiles
-----               PRIMARY KEY: profile_id
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[vwSocial_profiles]', 'V') IS NOT NULL
    DROP VIEW [constant_contact].[vwSocial_profiles];
GO

CREATE VIEW [constant_contact].[vwSocial_profiles]
AS
SELECT
    s.*
FROM
    [constant_contact].[social_profiles] AS s
GO
GRANT SELECT ON [constant_contact].[vwSocial_profiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for Social Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Profiles
-- Item: Permissions for vwSocial_profiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [constant_contact].[vwSocial_profiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for Social Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Profiles
-- Item: spCreatesocial_profiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR social_profiles
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spCreatesocial_profiles]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spCreatesocial_profiles];
GO

CREATE PROCEDURE [constant_contact].[spCreatesocial_profiles]
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @account_info_Clear bit = 0,
    @account_info nvarchar(MAX) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(812) = NULL,
    @profile_id nvarchar(450) = NULL,
    @network_profile_id_Clear bit = 0,
    @network_profile_id nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @image_url_Clear bit = 0,
    @image_url nvarchar(812) = NULL,
    @network_Clear bit = 0,
    @network nvarchar(812) = NULL,
    @network_user_id_Clear bit = 0,
    @network_user_id nvarchar(812) = NULL,
    @accessible_Clear bit = 0,
    @accessible nvarchar(MAX) = NULL,
    @settings_Clear bit = 0,
    @settings nvarchar(MAX) = NULL,
    @connected_Clear bit = 0,
    @connected nvarchar(MAX) = NULL,
    @handle_Clear bit = 0,
    @handle nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO
    [constant_contact].[social_profiles]
        (
            [mj_e2e_custom_attr],
                [account_info],
                [url],
                [network_profile_id],
                [name],
                [image_url],
                [network],
                [network_user_id],
                [accessible],
                [settings],
                [connected],
                [handle],
                [${flyway:defaultSchema}_integration_SyncStatus],
                [__mj_integration_LastSyncedAt],
                [${flyway:defaultSchema}_integration_LastSyncedSnapshot],
                [${flyway:defaultSchema}_integration_SyncMessage],
                [${flyway:defaultSchema}_integration_ContentHash],
                [${flyway:defaultSchema}_integration_CustomOverflow],
                [${flyway:defaultSchema}_integration_ExternalVersion],
                [${flyway:defaultSchema}_integration_LastSeenModifiedValue],
                [__mj_integration_LastReconciledAt],
                [${flyway:defaultSchema}_integration_LastWriterDirection],
                [${flyway:defaultSchema}_integration_IsTombstoned],
                [__mj_integration_DeletedDetectedAt],
                [profile_id]
        )
    VALUES
        (
            CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, NULL) END,
                CASE WHEN @account_info_Clear = 1 THEN NULL ELSE ISNULL(@account_info, NULL) END,
                CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, NULL) END,
                CASE WHEN @network_profile_id_Clear = 1 THEN NULL ELSE ISNULL(@network_profile_id, NULL) END,
                CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, NULL) END,
                CASE WHEN @image_url_Clear = 1 THEN NULL ELSE ISNULL(@image_url, NULL) END,
                CASE WHEN @network_Clear = 1 THEN NULL ELSE ISNULL(@network, NULL) END,
                CASE WHEN @network_user_id_Clear = 1 THEN NULL ELSE ISNULL(@network_user_id, NULL) END,
                CASE WHEN @accessible_Clear = 1 THEN NULL ELSE ISNULL(@accessible, NULL) END,
                CASE WHEN @settings_Clear = 1 THEN NULL ELSE ISNULL(@settings, NULL) END,
                CASE WHEN @connected_Clear = 1 THEN NULL ELSE ISNULL(@connected, NULL) END,
                CASE WHEN @handle_Clear = 1 THEN NULL ELSE ISNULL(@handle, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, 'Active'),
                CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, NULL) END,
                CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, NULL) END,
                CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, NULL) END,
                ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, 0),
                CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, NULL) END,
                @profile_id
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [constant_contact].[vwSocial_profiles] WHERE [profile_id] = @profile_id
END
GO
GRANT EXECUTE ON [constant_contact].[spCreatesocial_profiles] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for Social Profiles */

GRANT EXECUTE ON [constant_contact].[spCreatesocial_profiles] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for Social Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Profiles
-- Item: spUpdatesocial_profiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR social_profiles
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spUpdatesocial_profiles]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spUpdatesocial_profiles];
GO

CREATE PROCEDURE [constant_contact].[spUpdatesocial_profiles]
    @mj_e2e_custom_attr_Clear bit = 0,
    @mj_e2e_custom_attr nvarchar(812) = NULL,
    @account_info_Clear bit = 0,
    @account_info nvarchar(MAX) = NULL,
    @url_Clear bit = 0,
    @url nvarchar(812) = NULL,
    @profile_id nvarchar(450),
    @network_profile_id_Clear bit = 0,
    @network_profile_id nvarchar(812) = NULL,
    @name_Clear bit = 0,
    @name nvarchar(812) = NULL,
    @image_url_Clear bit = 0,
    @image_url nvarchar(812) = NULL,
    @network_Clear bit = 0,
    @network nvarchar(812) = NULL,
    @network_user_id_Clear bit = 0,
    @network_user_id nvarchar(812) = NULL,
    @accessible_Clear bit = 0,
    @accessible nvarchar(MAX) = NULL,
    @settings_Clear bit = 0,
    @settings nvarchar(MAX) = NULL,
    @connected_Clear bit = 0,
    @connected nvarchar(MAX) = NULL,
    @handle_Clear bit = 0,
    @handle nvarchar(812) = NULL,
    @${flyway:defaultSchema}_integration_SyncStatus nvarchar(50) = NULL,
    @__mj_integration_LastSyncedAt_Clear bit = 0,
    @__mj_integration_LastSyncedAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSyncedSnapshot nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_SyncMessage_Clear bit = 0,
    @${flyway:defaultSchema}_integration_SyncMessage nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ContentHash_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ContentHash nvarchar(64) = NULL,
    @${flyway:defaultSchema}_integration_CustomOverflow_Clear bit = 0,
    @${flyway:defaultSchema}_integration_CustomOverflow nvarchar(MAX) = NULL,
    @${flyway:defaultSchema}_integration_ExternalVersion_Clear bit = 0,
    @${flyway:defaultSchema}_integration_ExternalVersion nvarchar(255) = NULL,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastSeenModifiedValue nvarchar(255) = NULL,
    @__mj_integration_LastReconciledAt_Clear bit = 0,
    @__mj_integration_LastReconciledAt datetimeoffset = NULL,
    @${flyway:defaultSchema}_integration_LastWriterDirection_Clear bit = 0,
    @${flyway:defaultSchema}_integration_LastWriterDirection nvarchar(10) = NULL,
    @${flyway:defaultSchema}_integration_IsTombstoned bit = NULL,
    @__mj_integration_DeletedDetectedAt_Clear bit = 0,
    @__mj_integration_DeletedDetectedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[social_profiles]
    SET
        [mj_e2e_custom_attr] = CASE WHEN @mj_e2e_custom_attr_Clear = 1 THEN NULL ELSE ISNULL(@mj_e2e_custom_attr, [mj_e2e_custom_attr]) END,
        [account_info] = CASE WHEN @account_info_Clear = 1 THEN NULL ELSE ISNULL(@account_info, [account_info]) END,
        [url] = CASE WHEN @url_Clear = 1 THEN NULL ELSE ISNULL(@url, [url]) END,
        [network_profile_id] = CASE WHEN @network_profile_id_Clear = 1 THEN NULL ELSE ISNULL(@network_profile_id, [network_profile_id]) END,
        [name] = CASE WHEN @name_Clear = 1 THEN NULL ELSE ISNULL(@name, [name]) END,
        [image_url] = CASE WHEN @image_url_Clear = 1 THEN NULL ELSE ISNULL(@image_url, [image_url]) END,
        [network] = CASE WHEN @network_Clear = 1 THEN NULL ELSE ISNULL(@network, [network]) END,
        [network_user_id] = CASE WHEN @network_user_id_Clear = 1 THEN NULL ELSE ISNULL(@network_user_id, [network_user_id]) END,
        [accessible] = CASE WHEN @accessible_Clear = 1 THEN NULL ELSE ISNULL(@accessible, [accessible]) END,
        [settings] = CASE WHEN @settings_Clear = 1 THEN NULL ELSE ISNULL(@settings, [settings]) END,
        [connected] = CASE WHEN @connected_Clear = 1 THEN NULL ELSE ISNULL(@connected, [connected]) END,
        [handle] = CASE WHEN @handle_Clear = 1 THEN NULL ELSE ISNULL(@handle, [handle]) END,
        [${flyway:defaultSchema}_integration_SyncStatus] = ISNULL(@${flyway:defaultSchema}_integration_SyncStatus, [${flyway:defaultSchema}_integration_SyncStatus]),
        [__mj_integration_LastSyncedAt] = CASE WHEN @__mj_integration_LastSyncedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastSyncedAt, [__mj_integration_LastSyncedAt]) END,
        [${flyway:defaultSchema}_integration_LastSyncedSnapshot] = CASE WHEN @${flyway:defaultSchema}_integration_LastSyncedSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSyncedSnapshot, [${flyway:defaultSchema}_integration_LastSyncedSnapshot]) END,
        [${flyway:defaultSchema}_integration_SyncMessage] = CASE WHEN @${flyway:defaultSchema}_integration_SyncMessage_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_SyncMessage, [${flyway:defaultSchema}_integration_SyncMessage]) END,
        [${flyway:defaultSchema}_integration_ContentHash] = CASE WHEN @${flyway:defaultSchema}_integration_ContentHash_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ContentHash, [${flyway:defaultSchema}_integration_ContentHash]) END,
        [${flyway:defaultSchema}_integration_CustomOverflow] = CASE WHEN @${flyway:defaultSchema}_integration_CustomOverflow_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_CustomOverflow, [${flyway:defaultSchema}_integration_CustomOverflow]) END,
        [${flyway:defaultSchema}_integration_ExternalVersion] = CASE WHEN @${flyway:defaultSchema}_integration_ExternalVersion_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_ExternalVersion, [${flyway:defaultSchema}_integration_ExternalVersion]) END,
        [${flyway:defaultSchema}_integration_LastSeenModifiedValue] = CASE WHEN @${flyway:defaultSchema}_integration_LastSeenModifiedValue_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastSeenModifiedValue, [${flyway:defaultSchema}_integration_LastSeenModifiedValue]) END,
        [__mj_integration_LastReconciledAt] = CASE WHEN @__mj_integration_LastReconciledAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_LastReconciledAt, [__mj_integration_LastReconciledAt]) END,
        [${flyway:defaultSchema}_integration_LastWriterDirection] = CASE WHEN @${flyway:defaultSchema}_integration_LastWriterDirection_Clear = 1 THEN NULL ELSE ISNULL(@${flyway:defaultSchema}_integration_LastWriterDirection, [${flyway:defaultSchema}_integration_LastWriterDirection]) END,
        [${flyway:defaultSchema}_integration_IsTombstoned] = ISNULL(@${flyway:defaultSchema}_integration_IsTombstoned, [${flyway:defaultSchema}_integration_IsTombstoned]),
        [__mj_integration_DeletedDetectedAt] = CASE WHEN @__mj_integration_DeletedDetectedAt_Clear = 1 THEN NULL ELSE ISNULL(@__mj_integration_DeletedDetectedAt, [__mj_integration_DeletedDetectedAt]) END
    WHERE
        [profile_id] = @profile_id

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [constant_contact].[vwSocial_profiles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [constant_contact].[vwSocial_profiles]
                                    WHERE
                                        [profile_id] = @profile_id
                                    
END
GO

GRANT EXECUTE ON [constant_contact].[spUpdatesocial_profiles] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the social_profiles table
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[trgUpdatesocial_profiles]', 'TR') IS NOT NULL
    DROP TRIGGER [constant_contact].[trgUpdatesocial_profiles];
GO
CREATE TRIGGER [constant_contact].trgUpdatesocial_profiles
ON [constant_contact].[social_profiles]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [constant_contact].[social_profiles]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [constant_contact].[social_profiles] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[profile_id] = I.[profile_id];
END;
GO

/* spUpdate Permissions for Social Profiles */

GRANT EXECUTE ON [constant_contact].[spUpdatesocial_profiles] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Social Connections */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Connections
-- Item: spDeletesocial_connections
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR social_connections
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletesocial_connections]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletesocial_connections];
GO

CREATE PROCEDURE [constant_contact].[spDeletesocial_connections]
    @ID nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[social_connections]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletesocial_connections] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Social Connections */

GRANT EXECUTE ON [constant_contact].[spDeletesocial_connections] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Social Hashtag Groups */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Hashtag Groups
-- Item: spDeletesocial_hashtag_groups
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR social_hashtag_groups
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletesocial_hashtag_groups]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletesocial_hashtag_groups];
GO

CREATE PROCEDURE [constant_contact].[spDeletesocial_hashtag_groups]
    @hashtag_group_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[social_hashtag_groups]
    WHERE
        [hashtag_group_id] = @hashtag_group_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [hashtag_group_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @hashtag_group_id AS [hashtag_group_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletesocial_hashtag_groups] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Social Hashtag Groups */

GRANT EXECUTE ON [constant_contact].[spDeletesocial_hashtag_groups] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Social Posts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Posts
-- Item: spDeletesocial_posts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR social_posts
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletesocial_posts]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletesocial_posts];
GO

CREATE PROCEDURE [constant_contact].[spDeletesocial_posts]
    @campaign_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[social_posts]
    WHERE
        [campaign_id] = @campaign_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [campaign_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @campaign_id AS [campaign_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletesocial_posts] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Social Posts */

GRANT EXECUTE ON [constant_contact].[spDeletesocial_posts] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for Social Profiles */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Social Profiles
-- Item: spDeletesocial_profiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR social_profiles
------------------------------------------------------------
IF OBJECT_ID('[constant_contact].[spDeletesocial_profiles]', 'P') IS NOT NULL
    DROP PROCEDURE [constant_contact].[spDeletesocial_profiles];
GO

CREATE PROCEDURE [constant_contact].[spDeletesocial_profiles]
    @profile_id nvarchar(450)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [constant_contact].[social_profiles]
    WHERE
        [profile_id] = @profile_id


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [profile_id] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @profile_id AS [profile_id] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [constant_contact].[spDeletesocial_profiles] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for Social Profiles */

GRANT EXECUTE ON [constant_contact].[spDeletesocial_profiles] TO [cdp_Developer], [cdp_Integration];

/* Set soft PK for constant_contact.account_emails.email_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '9F5BCE34-13B5-463F-A66C-40BD2D0F7827' AND [Name] = 'email_id';

/* Set soft PK for constant_contact.account_summary.encoded_account_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '63721B56-84CF-4294-9DFE-3648CCF63A96' AND [Name] = 'encoded_account_id';

/* Set soft PK for constant_contact.account_user_privileges.privilege_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A5F61D12-1A75-4323-B0A9-97AEF9C43813' AND [Name] = 'privilege_id';

/* Set soft PK for constant_contact.activities.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '6F2AE9C1-9811-4BC4-B7EF-2E1E9EC1EC6B' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_delete.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '7473CB77-31C1-4AEC-9959-FCD2EB8A88E5' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_file_import.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8ADAE93D-67BC-4BB8-954F-699803AF68A6' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_json_import.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F60BA024-6D49-47A9-9BCA-C639432B30B3' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_taggings_add.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '40816253-066E-40BE-A410-4183032DC86C' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_taggings_remove.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '89AEB9E4-2E03-47E0-91BD-44CDD0ADFBB7' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_contacts_tags_delete.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '164434C9-51B3-4F3F-BE4E-2E1E2B1ACDDC' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_custom_fields_delete.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CBFDCEAA-1032-4CA6-AF08-525D984299A6' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_list_delete.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '19E29B68-A02F-4D68-8351-2B21894C1470' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_list_memberships_add.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'D86ECFE1-C46A-4F2A-AA2D-B2E8050C9623' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.activities_list_memberships_remove.activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'AE91ABE1-4472-41B2-9D66-0103CC24303C' AND [Name] = 'activity_id';

/* Set soft PK for constant_contact.contact_custom_fields.custom_field_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F4B21450-1123-47E3-A13E-94AC39923878' AND [Name] = 'custom_field_id';

/* Set soft PK for constant_contact.contact_lists.list_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '100AA80E-3D80-4093-8E02-949C67466745' AND [Name] = 'list_id';

/* Set soft PK for constant_contact.contact_lists_xrefs.list_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '53DBB968-EFB7-4C19-BC74-2E5B5CB8809D' AND [Name] = 'list_id';

/* Set soft FK for constant_contact.contact_lists_xrefs.list_id → contact_lists.list_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '100AA80E-3D80-4093-8E02-949C67466745',
                                    [RelatedEntityFieldName] = 'list_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '53DBB968-EFB7-4C19-BC74-2E5B5CB8809D' AND [Name] = 'list_id';

/* Set soft PK for constant_contact.contact_reports_activity_summary.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '7485038F-7367-49CC-9373-B2CFC57053D0' AND [Name] = 'campaign_activity_id';

/* Set soft FK for constant_contact.contact_reports_activity_summary.campaign_activity_id → email_campaign_activities.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB',
                                    [RelatedEntityFieldName] = 'campaign_activity_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '7485038F-7367-49CC-9373-B2CFC57053D0' AND [Name] = 'campaign_activity_id';

/* Set soft PK for constant_contact.contact_reports_open_and_click_rates.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '35129D80-B072-44EF-B806-7512334BB417' AND [Name] = 'contact_id';

/* Set soft FK for constant_contact.contact_reports_open_and_click_rates.contact_id → contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A',
                                    [RelatedEntityFieldName] = 'contact_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '35129D80-B072-44EF-B806-7512334BB417' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.contact_tags.tag_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '234F9892-7FEB-4B72-965F-98C14FB6C161' AND [Name] = 'tag_id';

/* Set soft PK for constant_contact.contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.contacts_sign_up_form.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '702F7EAD-E6E8-4B44-A73B-749B65343A92' AND [Name] = 'contact_id';

/* Set soft FK for constant_contact.contacts_sign_up_form.contact_id → contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A',
                                    [RelatedEntityFieldName] = 'contact_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '702F7EAD-E6E8-4B44-A73B-749B65343A92' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.contacts_xrefs.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'BC4BBBBC-517D-4F9E-AD00-453181C5CD19' AND [Name] = 'contact_id';

/* Set soft FK for constant_contact.contacts_xrefs.contact_id → contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A',
                                    [RelatedEntityFieldName] = 'contact_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'BC4BBBBC-517D-4F9E-AD00-453181C5CD19' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.email_campaign_activities.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB' AND [Name] = 'campaign_activity_id';

/* Set soft FK for constant_contact.email_campaign_activities.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.email_campaign_activity_non_opener_resends.resend_request_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1F31F7C8-10D0-4D01-AEAB-57456DCD9432' AND [Name] = 'resend_request_id';

/* Set soft PK for constant_contact.email_campaign_activity_previews.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '8930C0D6-1A03-4EDC-BE7F-078AA597601E' AND [Name] = 'campaign_activity_id';

/* Set soft FK for constant_contact.email_campaign_activity_previews.campaign_activity_id → email_campaign_activities.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB',
                                    [RelatedEntityFieldName] = 'campaign_activity_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '8930C0D6-1A03-4EDC-BE7F-078AA597601E' AND [Name] = 'campaign_activity_id';

/* Set soft PK for constant_contact.email_campaign_activity_send_history.send_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '78395832-1CD4-4E73-9ABA-F23AE29A0BF3' AND [Name] = 'send_id';

/* Set soft PK for constant_contact.email_reports_links.url_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F8B58DEF-F48A-40A0-999F-687C47056363' AND [Name] = 'url_id';

/* Set soft FK for constant_contact.email_reports_links.list_id → contact_lists.list_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '100AA80E-3D80-4093-8E02-949C67466745',
                                    [RelatedEntityFieldName] = 'list_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F8B58DEF-F48A-40A0-999F-687C47056363' AND [Name] = 'list_id';

/* Set soft PK for constant_contact.email_reports_summary.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'ED05582C-F3EE-466E-8334-080D8CB97A36' AND [Name] = 'campaign_id';

/* Set soft FK for constant_contact.email_reports_summary.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'ED05582C-F3EE-466E-8334-080D8CB97A36' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.emails_xrefs.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C9B6B694-4FCF-40FB-A121-9BE389309BF2' AND [Name] = 'campaign_activity_id';

/* Set soft FK for constant_contact.emails_xrefs.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C9B6B694-4FCF-40FB-A121-9BE389309BF2' AND [Name] = 'campaign_id';

/* Set soft FK for constant_contact.emails_xrefs.campaign_activity_id → email_campaign_activities.campaign_activity_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'CC70A069-BE38-41A2-B331-CEAD688EFDEB',
                                    [RelatedEntityFieldName] = 'campaign_activity_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'C9B6B694-4FCF-40FB-A121-9BE389309BF2' AND [Name] = 'campaign_activity_id';

/* Set soft PK for constant_contact.events.event_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '1278100A-1FFA-4FED-821B-07ED594AA030' AND [Name] = 'event_id';

/* Set soft FK for constant_contact.events.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '1278100A-1FFA-4FED-821B-07ED594AA030' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.events_copy.event_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '3F8099A2-22D1-4FE1-93BC-7F258CC6BE79' AND [Name] = 'event_id';

/* Set soft FK for constant_contact.events_copy.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3F8099A2-22D1-4FE1-93BC-7F258CC6BE79' AND [Name] = 'campaign_id';

/* Set soft FK for constant_contact.events_copy.event_id → events.event_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = '1278100A-1FFA-4FED-821B-07ED594AA030',
                                    [RelatedEntityFieldName] = 'event_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '3F8099A2-22D1-4FE1-93BC-7F258CC6BE79' AND [Name] = 'event_id';

/* Set soft PK for constant_contact.events_registrations.registration_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '46100EE6-A169-43FE-AB53-B4BC7271A80D' AND [Name] = 'registration_id';

/* Set soft FK for constant_contact.events_registrations.contact_id → contacts.contact_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'BA80A611-784E-45A1-A3E8-CC349684DA9A',
                                    [RelatedEntityFieldName] = 'contact_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = '46100EE6-A169-43FE-AB53-B4BC7271A80D' AND [Name] = 'contact_id';

/* Set soft PK for constant_contact.segments.segment_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'A18D417B-3C0C-49EE-B8DE-DD8A0C3FB84D' AND [Name] = 'segment_id';

/* Set soft PK for constant_contact.social_hashtag_groups.hashtag_group_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '4890B232-F660-4084-B095-93BFA72A6A93' AND [Name] = 'hashtag_group_id';

/* Set soft PK for constant_contact.social_posts.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'F892A77C-9F35-41E7-BC1F-C8FAEBDC55B4' AND [Name] = 'campaign_id';

/* Set soft FK for constant_contact.social_posts.campaign_id → emails.campaign_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [RelatedEntityID] = 'F24AF3E3-540F-4000-A5B6-0CC30E63E5F9',
                                    [RelatedEntityFieldName] = 'campaign_id',
                                    [IsSoftForeignKey] = 1
                                WHERE [EntityID] = 'F892A77C-9F35-41E7-BC1F-C8FAEBDC55B4' AND [Name] = 'campaign_id';

/* Set soft PK for constant_contact.social_profiles.profile_id */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'FDF7F92F-3502-4F48-8F2C-B319CCF3F219' AND [Name] = 'profile_id';

/* Set soft PK for constant_contact.account_physical_address.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = '19820673-C51F-453C-86F7-610069A80010' AND [Name] = 'ID';

/* Set soft PK for constant_contact.contacts_counts.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'C86AC417-6B27-4C9E-AF68-C7965CABE5BE' AND [Name] = 'ID';

/* Set soft PK for constant_contact.social_connections.ID */
UPDATE [${flyway:defaultSchema}].[EntityField]
                                SET [__mj_UpdatedAt]=GETUTCDATE(),
                                    [IsPrimaryKey] = 1,
                                    [IsSoftPrimaryKey] = 1
                                WHERE [EntityID] = 'E7F69D0A-ABC8-49EB-A449-581AC6D4500B' AND [Name] = 'ID';

