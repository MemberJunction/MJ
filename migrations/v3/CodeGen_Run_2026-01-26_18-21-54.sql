/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6d9e6600-b0a5-4cf7-94a7-436765b30f0c'  OR 
               (EntityID = '3BACDAE1-CED0-4DCD-901B-06C07424FFBA' AND Name = 'CreatedBy')
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
            '6d9e6600-b0a5-4cf7-94a7-436765b30f0c',
            '3BACDAE1-CED0-4DCD-901B-06C07424FFBA', -- Entity: API Keys
            100023,
            'CreatedBy',
            'Created By',
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
         WHERE ID = '5bdc2b35-25f4-454a-8e99-d71b0b55f9c1'  OR 
               (EntityID = 'D9C3B997-F4DE-44EE-A3D2-6D45C837DE73' AND Name = 'Contact')
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
            '5bdc2b35-25f4-454a-8e99-d71b0b55f9c1',
            'D9C3B997-F4DE-44EE-A3D2-6D45C837DE73', -- Entity: Organization Contacts
            100018,
            'Contact',
            'Contact',
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
         WHERE ID = '90ef0de2-4b7d-44fb-b43f-39f68146c06e'  OR 
               (EntityID = '842DE60C-EBE9-4A96-B2E9-9FCB5BAAF65C' AND Name = 'APIKey')
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
            '90ef0de2-4b7d-44fb-b43f-39f68146c06e',
            '842DE60C-EBE9-4A96-B2E9-9FCB5BAAF65C', -- Entity: API Key Scopes
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
            WHERE ID = 'FEF13304-2B27-47FA-9FB9-138DE45EC927'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '90EF0DE2-4B7D-44FB-B43F-39F68146C06E'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FEF13304-2B27-47FA-9FB9-138DE45EC927'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '90EF0DE2-4B7D-44FB-B43F-39F68146C06E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FEF13304-2B27-47FA-9FB9-138DE45EC927'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'F04822BC-30DE-4507-9D9F-3205CAD9E453'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F04822BC-30DE-4507-9D9F-3205CAD9E453'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '27CF9DD9-595C-4585-9DD2-6979A147D99C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '769E99D8-2314-4995-9EE8-C85C47C2B417'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F3049049-2742-46E8-AB61-720E597BDDFF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BC4999CA-A033-41CC-A601-68BB759CC57E'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F04822BC-30DE-4507-9D9F-3205CAD9E453'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '27CF9DD9-595C-4585-9DD2-6979A147D99C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BC4999CA-A033-41CC-A601-68BB759CC57E'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6D9E6600-B0A5-4CF7-94A7-436765B30F0C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5BDC2B35-25F4-454A-8E99-D71B0B55F9C1'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E47E59F1-6B79-4328-B4F2-35424CF76F95'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '8EA4A1D6-4362-4B59-A2C7-C2E7B71902A5'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5BDC2B35-25F4-454A-8E99-D71B0B55F9C1'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E749032A-81FB-4FD7-9140-0D280D9504D9'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E47E59F1-6B79-4328-B4F2-35424CF76F95'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '8EA4A1D6-4362-4B59-A2C7-C2E7B71902A5'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5BDC2B35-25F4-454A-8E99-D71B0B55F9C1'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E749032A-81FB-4FD7-9140-0D280D9504D9'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 12 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '98C4929F-6BA0-4B0E-ACDD-89624E04954B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Hash',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '629370B7-1275-481C-B19B-080AF9662086'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Organization',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '560F24D2-DB1C-4E76-8560-08C7EEF2BBD6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Label',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F04822BC-30DE-4507-9D9F-3205CAD9E453'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '27CF9DD9-595C-4585-9DD2-6979A147D99C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expires At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '769E99D8-2314-4995-9EE8-C85C47C2B417'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Last Used At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F3049049-2742-46E8-AB61-720E597BDDFF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B3B19EE0-EE30-46B7-8390-A9D80E063830'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '43F6665C-B423-4DA3-831C-B67F0FCC2301'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '83F1D986-3C12-4FFC-8693-C130C3FBAA1D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Organization',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC4999CA-A033-41CC-A601-68BB759CC57E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Ownership',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created By',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6D9E6600-B0A5-4CF7-94A7-436765B30F0C'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Key Information":{"icon":"fa fa-key","description":"Core attributes of the API key including label, security hash, status and lifecycle dates."},"Ownership":{"icon":"fa fa-building","description":"Details linking the API key to its organization and creator."},"System Metadata":{"icon":"fa fa-cog","description":"Audit fields managed by the system."}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '3BACDAE1-CED0-4DCD-901B-06C07424FFBA' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Key Information":"fa fa-key","Ownership":"fa fa-building","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '3BACDAE1-CED0-4DCD-901B-06C07424FFBA' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 7 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '85C8808B-F4CD-48F4-9EC8-A606AF0E33CA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CA74721E-2637-45CD-BD0D-E32FA8BBB73E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '316A5B2F-D832-4C07-9B0A-514E0B9244C7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8E925AAD-419A-4111-90ED-A8543D3E770B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '36B6D122-BDFC-44E4-A2B5-01F3D0EE5B32'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '90EF0DE2-4B7D-44FB-B43F-39F68146C06E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'API Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FEF13304-2B27-47FA-9FB9-138DE45EC927'
   AND AutoUpdateCategory = 1

/* Set categories for 10 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37DBAF3F-86CD-424B-AB25-F997EDDE1CD9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linked Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Organization',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '12214AD0-A6D2-4706-8015-1B0F83208AD4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linked Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Contact',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7B963563-C7F8-4DD8-85F8-5A630EBE4740'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Linked Entities',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8DD16B91-65DC-43FB-B860-E1A09E02BC98'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Membership Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E47E59F1-6B79-4328-B4F2-35424CF76F95'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8495972D-E511-4313-85EB-4B9A78A7875C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EA02B31-8610-46B8-AD72-1F4082997D81'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Membership Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Organization',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8EA4A1D6-4362-4B59-A2C7-C2E7B71902A5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Membership Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Contact',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5BDC2B35-25F4-454A-8E99-D71B0B55F9C1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Membership Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Role',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E749032A-81FB-4FD7-9140-0D280D9504D9'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"API Key Scope Mapping":{"icon":"fa fa-link","description":"Links API keys to their granted permission scopes, including identifiers and scope name"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit timestamps"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '842DE60C-EBE9-4A96-B2E9-9FCB5BAAF65C' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Linked Entities":{"icon":"fa fa-link","description":"References to related records such as organization, contact, and role"},"Membership Details":{"icon":"fa fa-id-card","description":"Descriptive information about the organization, role, and membership status"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields and record identifier"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'D9C3B997-F4DE-44EE-A3D2-6D45C837DE73' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"API Key Scope Mapping":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '842DE60C-EBE9-4A96-B2E9-9FCB5BAAF65C' AND Name = 'FieldCategoryIcons'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Linked Entities":"fa fa-link","Membership Details":"fa fa-id-card","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'D9C3B997-F4DE-44EE-A3D2-6D45C837DE73' AND Name = 'FieldCategoryIcons'
            

