/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9e590455-51e5-4892-97b6-f03273823499'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'APIKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9e590455-51e5-4892-97b6-f03273823499',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100023,
            'APIKey',
            'API Key',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c91785ac-c41c-4de5-bb4a-a8bfb78f455f'  OR 
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'APIKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c91785ac-c41c-4de5-bb4a-a8bfb78f455f',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100012,
            'APIKey',
            'API Key',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C91785AC-C41C-4DE5-BB4A-A8BFB78F455F'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C91785AC-C41C-4DE5-BB4A-A8BFB78F455F'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CCD93F16-175E-4253-88DF-9FA33BA9F4E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E3CA9BA9-8E26-43DD-9EF1-0005E2478C8B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '9E590455-51E5-4892-97B6-F03273823499'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9E590455-51E5-4892-97B6-F03273823499'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48219BCC-5A2B-42B8-A832-5459118ECD6D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B521399-DDA4-47BD-B13A-0597F1F9F08D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1ADE12E-28EE-4360-B5E5-DE58A8DA2F8D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '222DB89A-825A-41E4-BA64-FA489F5BCAB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E590455-51E5-4892-97B6-F03273823499'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Endpoint',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Operation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Method',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCD93F16-175E-4253-88DF-9FA33BA9F4E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response Time (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3CA9BA9-8E26-43DD-9EF1-0005E2478C8B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'IP Address',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Request Information":{"icon":"fa fa-code","description":"Core details of the API call such as key, endpoint, operation and HTTP method"},"Response & Client Info":{"icon":"fa fa-network-wired","description":"Outcome of the request plus client context like status, timing, IP and user-agent"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Request Information":"fa fa-code","Response & Client Info":"fa fa-network-wired","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9EF38A8-150A-40E1-8181-2CCB30379BC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '432E223B-5DEB-4563-9B63-E51DDEEE7741'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '311BA3D2-F958-4A38-91F7-A5786C96C75F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C91785AC-C41C-4DE5-BB4A-A8BFB78F455F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4D1B26B-A8A1-4A41-A353-DFC8F1AAC03D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '23C53CEB-2D8F-42F5-B42E-C239644D10CA'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Key Scope Mapping":{"icon":"fa fa-link","description":"Defines which permission scopes are assigned to each API key"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields tracking creation and modification dates"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Key Scope Mapping":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'FieldCategoryIcons'
            

