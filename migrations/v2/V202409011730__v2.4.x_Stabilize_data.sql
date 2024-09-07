-- Ensure this core entity field type is correct, following the column type change in a previous migration
UPDATE [${flyway:defaultSchema}].EntityField SET [Type] = 'uniqueidentifier' WHERE ID='594f17f0-6f36-ef11-86d4-6045bdee16e6'

-- Delete the relationships for core entities whose IDs are created by CodeGen
DELETE FROM [${flyway:defaultSchema}].EntityRelationship
WHERE (EntityID = '73ad0238-8b56-ef11-991a-6045bdeba539' AND RelatedEntityID = '78ad0238-8b56-ef11-991a-6045bdeba539')
   OR (EntityID = '7dad0238-8b56-ef11-991a-6045bdeba539' AND RelatedEntityID = '73ad0238-8b56-ef11-991a-6045bdeba539')
   OR (EntityID = 'f1a70b3e-8b56-ef11-991a-6045bdeba539' AND RelatedEntityID = '73ad0238-8b56-ef11-991a-6045bdeba539');

-- Delete existing EntityFieldValue rows for the relevant EntityFields
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue
WHERE EntityFieldID IN (
    SELECT ID FROM [${flyway:defaultSchema}].EntityField
    WHERE EntityID IN (
        '73ad0238-8b56-ef11-991a-6045bdeba539',  -- AI Prompts
        '78ad0238-8b56-ef11-991a-6045bdeba539',  -- AI Result Cache
        '7dad0238-8b56-ef11-991a-6045bdeba539',  -- AI Prompt Categories
        'f1a70b3e-8b56-ef11-991a-6045bdeba539'   -- AI Prompt Types
    )
);

-- Delete existing EntityField rows for the relevant entities
DELETE FROM [${flyway:defaultSchema}].EntityField
WHERE EntityID IN (
    '73ad0238-8b56-ef11-991a-6045bdeba539',  -- AI Prompts
    '78ad0238-8b56-ef11-991a-6045bdeba539',  -- AI Result Cache
    '7dad0238-8b56-ef11-991a-6045bdeba539',  -- AI Prompt Categories
    'f1a70b3e-8b56-ef11-991a-6045bdeba539'   -- AI Prompt Types
);

-- Insert the stable relationship records for those core entities
INSERT INTO [${flyway:defaultSchema}].EntityRelationship (ID, EntityID, Sequence, RelatedEntityID, BundleInAPI, IncludeInParentAllQuery, Type, EntityKeyField, RelatedEntityJoinField, JoinView, JoinEntityJoinField, JoinEntityInverseJoinField, DisplayInForm, DisplayLocation, DisplayName, DisplayIconType, DisplayIcon, DisplayUserViewID, DisplayComponentID, DisplayComponentConfiguration)
VALUES
('6874433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 1, '78ad0238-8b56-ef11-991a-6045bdeba539', 1, 0, 'One To Many', NULL, 'AIPromptID', NULL, NULL, NULL, 1, 'After Field Tabs', 'AI Result Cache', 'Related Entity Icon', NULL, NULL, NULL, NULL),
('6b74433e-f36b-1410-883e-00d02208dc50', '7dad0238-8b56-ef11-991a-6045bdeba539', 1, '73ad0238-8b56-ef11-991a-6045bdeba539', 1, 0, 'One To Many', NULL, 'CategoryID', NULL, NULL, NULL, 1, 'After Field Tabs', 'AI Prompts', 'Related Entity Icon', NULL, NULL, NULL, NULL),
('7174433e-f36b-1410-883e-00d02208dc50', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 2, '73ad0238-8b56-ef11-991a-6045bdeba539', 1, 0, 'One To Many', NULL, 'TypeID', NULL, NULL, NULL, 1, 'After Field Tabs', 'AI Prompts', 'Related Entity Icon', NULL, NULL, NULL, NULL);

-- Insert into EntityField for the core entities
INSERT INTO [${flyway:defaultSchema}].EntityField (ID, EntityID, Sequence, Name, DisplayName, Description, AutoUpdateDescription, IsPrimaryKey, IsUnique, Category, Type, Length, Precision, Scale, AllowsNull, DefaultValue, AutoIncrement, ValueListType, ExtendedType, CodeType, DefaultInView, ViewCellTemplate, DefaultColumnWidth, AllowUpdateAPI, AllowUpdateInView, IncludeInUserSearchAPI, FullTextSearchEnabled, UserSearchParamFormatAPI, IncludeInGeneratedForm, GeneratedFormSection, IsVirtual, IsNameField, RelatedEntityID, RelatedEntityFieldName, IncludeRelatedEntityNameFieldInBaseView, RelatedEntityNameFieldMap, RelatedEntityDisplayType, EntityIDFieldName)
VALUES
('f873433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 10, '__mj_CreatedAt', 'Created At', NULL, 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, '(getutcdate())', 0, 'None', NULL, NULL, 0, NULL, 100, 0, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('f973433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 11, '__mj_UpdatedAt', 'Updated At', NULL, 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, '(getutcdate())', 0, 'None', NULL, NULL, 0, NULL, 100, 0, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('f773433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 9, 'CacheExpiration', 'Cache Expiration', 'Number of hours the cache is valid for; can be fractional or 0 if the cache never expires.', 1, 0, 0, NULL, 'decimal', 9, 10, 2, 0, '((0))', 0, 'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('f673433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 8, 'CacheResults', 'Cache Results', 'Indicates whether the results of the prompt should be cached.', 1, 0, 0, NULL, 'bit', 1, 1, 0, 0, '((0))', 0, 'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('8f74433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 13, 'Category', 'Category', NULL, 1, 0, 0, NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, 'Details', 1, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('f373433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 5, 'CategoryID', 'Category ID', 'Reference to the category the prompt belongs to.', 1, 0, 0, NULL, 'uniqueidentifier', 16, 0, 0, 1, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, '7dad0238-8b56-ef11-991a-6045bdeba539', 'ID', 1, 'Category', 'Search', NULL),
('f173433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 3, 'Description', 'Description', NULL, 1, 0, 0, NULL, 'nvarchar', -1, 0, 0, 1, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('ef73433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 1, 'ID', 'ID', NULL, 1, 1, 1, NULL, 'uniqueidentifier', 16, 0, 0, 0, '(newsequentialid())', 0, 'None', NULL, NULL, 1, NULL, 150, 0, 1, 1, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('f073433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 2, 'Name', 'Name', NULL, 1, 0, 0, NULL, 'nvarchar', 510, 0, 0, 0, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, 'Details', 0, 1, NULL, NULL, 0, NULL, 'Search', NULL),
('f573433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 7, 'Status', 'Status', NULL, 1, 0, 0, NULL, 'nvarchar', 100, 0, 0, 0, NULL, 0, 'List', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('8b74433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 12, 'Template', 'Template', NULL, 1, 0, 0, NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, 'Details', 1, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('f273433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 4, 'TemplateID', 'Template ID', 'Reference to the template used for the prompt.', 1, 0, 0, NULL, 'uniqueidentifier', 16, 0, 0, 0, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, '48248f34-2837-ef11-86d4-6045bdee16e6', 'ID', 1, 'Template', 'Search', NULL),
('9374433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 14, 'Type', 'Type', NULL, 1, 0, 0, NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, 'Details', 1, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('f473433e-f36b-1410-883e-00d02208dc50', '73ad0238-8b56-ef11-991a-6045bdeba539', 6, 'TypeID', 'Type ID', 'Reference to the type of the prompt.', 1, 0, 0, NULL, 'uniqueidentifier', 16, 0, 0, 0, NULL, 0, 'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 'ID', 1, 'Type', 'Search', NULL),
('0774433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 9, '__mj_CreatedAt', 'Created At', NULL, 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, '(getutcdate())', 0, 'None', NULL, NULL, 0, NULL, 100, 0, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('0d74433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 10, '__mj_UpdatedAt', 'Updated At', NULL, 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, '(getutcdate())', 0, 'None', NULL, NULL, 0, NULL, 100, 0, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('9b74433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 12, 'AIModel', 'AIModel', NULL, 1, 0, 0, NULL, 'nvarchar', 100, 0, 0, 0, 'null', 0, 'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, 'Details', 1, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('fc73433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 3, 'AIModelID', 'AIModel ID', 'Reference to the AI model that generated this result.', 1, 0, 0, NULL, 'uniqueidentifier', 16, 0, 0, 0, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, 'fd238f34-2837-ef11-86d4-6045bdee16e6', 'ID', 1, 'AIModel', 'Search', NULL),
('9774433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 11, 'AIPrompt', 'AIPrompt', NULL, 1, 0, 0, NULL, 'nvarchar', 510, 0, 0, 0, 'null', 0, 'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, 'Details', 1, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('fb73433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 2, 'AIPromptID', 'AIPrompt ID', 'Reference to the AI prompt this result corresponds to.', 1, 0, 0, NULL, 'uniqueidentifier', 16, 0, 0, 0, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, '73ad0238-8b56-ef11-991a-6045bdeba539', 'ID', 1, 'AIPrompt', 'Search', NULL),
('0174433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 8, 'ExpiredOn', 'Expired On', 'Timestamp of when this result was marked as expired.', 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 1, NULL, 0, 'None', NULL, NULL, 0, NULL, 100, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('fa73433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 1, 'ID', 'ID', NULL, 1, 1, 1, NULL, 'uniqueidentifier', 16, 0, 0, 0, '(newsequentialid())', 0, 'None', NULL, NULL, 1, NULL, 150, 0, 1, 1, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('fe73433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 5, 'PromptText', 'Prompt Text', 'The prompt text used to generate this result.', 1, 0, 0, NULL, 'nvarchar', -1, 0, 0, 0, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('ff73433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 6, 'ResultText', 'Result Text', 'The text of the result generated by the AI model.', 1, 0, 0, NULL, 'nvarchar', -1, 0, 0, 1, NULL, 0, 'None', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('fd73433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 4, 'RunAt', 'Run At', 'Timestamp of when this result was generated.', 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, NULL, 0, 'None', NULL, NULL, 1, NULL, 100, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('0074433e-f36b-1410-883e-00d02208dc50', '78ad0238-8b56-ef11-991a-6045bdeba539', 7, 'Status', 'Status', 'The status of this result, indicating whether it is currently active or expired.', 1, 0, 0, NULL, 'nvarchar', 100, 0, 0, 0, NULL, 0, 'List', NULL, NULL, 0, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('2b74433e-f36b-1410-883e-00d02208dc50', '7dad0238-8b56-ef11-991a-6045bdeba539', 5, '__mj_CreatedAt', 'Created At', NULL, 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, '(getutcdate())', 0, 'None', NULL, NULL, 1, NULL, 100, 0, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('3174433e-f36b-1410-883e-00d02208dc50', '7dad0238-8b56-ef11-991a-6045bdeba539', 6, '__mj_UpdatedAt', 'Updated At', NULL, 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, '(getutcdate())', 0, 'None', NULL, NULL, 0, NULL, 100, 0, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('2574433e-f36b-1410-883e-00d02208dc50', '7dad0238-8b56-ef11-991a-6045bdeba539', 4, 'Description', 'Description', NULL, 1, 0, 0, NULL, 'nvarchar', -1, 0, 0, 1, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('1374433e-f36b-1410-883e-00d02208dc50', '7dad0238-8b56-ef11-991a-6045bdeba539', 1, 'ID', 'ID', NULL, 1, 1, 1, NULL, 'uniqueidentifier', 16, 0, 0, 0, '(newsequentialid())', 0, 'None', NULL, NULL, 1, NULL, 150, 0, 1, 1, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('1974433e-f36b-1410-883e-00d02208dc50', '7dad0238-8b56-ef11-991a-6045bdeba539', 2, 'Name', 'Name', NULL, 1, 0, 0, NULL, 'nvarchar', 510, 0, 0, 0, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, 'Details', 0, 1, NULL, NULL, 0, NULL, 'Search', NULL),
('9f74433e-f36b-1410-883e-00d02208dc50', '7dad0238-8b56-ef11-991a-6045bdeba539', 7, 'Parent', 'Parent', NULL, 1, 0, 0, NULL, 'nvarchar', 510, 0, 0, 1, 'null', 0, 'None', NULL, NULL, 0, NULL, 150, 0, 1, 0, 0, NULL, 1, 'Details', 1, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('1f74433e-f36b-1410-883e-00d02208dc50', '7dad0238-8b56-ef11-991a-6045bdeba539', 3, 'ParentID', 'Parent ID', 'Parent category ID for hierarchical organization.', 1, 0, 0, NULL, 'uniqueidentifier', 16, 0, 0, 1, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, '7dad0238-8b56-ef11-991a-6045bdeba539', 'ID', 1, 'Parent', 'Search', NULL),
('4974433e-f36b-1410-883e-00d02208dc50', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 4, '__mj_CreatedAt', 'Created At', NULL, 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, '(getutcdate())', 0, 'None', NULL, NULL, 1, NULL, 100, 0, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('4f74433e-f36b-1410-883e-00d02208dc50', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 5, '__mj_UpdatedAt', 'Updated At', NULL, 1, 0, 0, NULL, 'datetimeoffset', 10, 34, 7, 0, '(getutcdate())', 0, 'None', NULL, NULL, 1, NULL, 100, 0, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('4374433e-f36b-1410-883e-00d02208dc50', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 3, 'Description', 'Description', NULL, 1, 0, 0, NULL, 'nvarchar', -1, 0, 0, 1, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 0, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('3774433e-f36b-1410-883e-00d02208dc50', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 1, 'ID', 'ID', NULL, 1, 1, 1, NULL, 'uniqueidentifier', 16, 0, 0, 0, '(newsequentialid())', 0, 'None', NULL, NULL, 1, NULL, 150, 0, 1, 1, 0, NULL, 1, 'Details', 0, 0, NULL, NULL, 0, NULL, 'Search', NULL),
('3d74433e-f36b-1410-883e-00d02208dc50', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 2, 'Name', 'Name', NULL, 1, 0, 0, NULL, 'nvarchar', 510, 0, 0, 0, NULL, 0, 'None', NULL, NULL, 1, NULL, 150, 1, 1, 1, 0, NULL, 1, 'Details', 0, 1, NULL, NULL, 0, NULL, 'Search', NULL);

-- Insert into EntityFieldValue for core entity fields
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue (ID, EntityFieldID, Sequence, Value, Code)
VALUES
('5d74433e-f36b-1410-883e-00d02208dc50', 'f573433e-f36b-1410-883e-00d02208dc50', 1, 'Pending', 'Pending'),
('5f74433e-f36b-1410-883e-00d02208dc50', 'f573433e-f36b-1410-883e-00d02208dc50', 2, 'Active', 'Active'),
('6174433e-f36b-1410-883e-00d02208dc50', 'f573433e-f36b-1410-883e-00d02208dc50', 3, 'Disabled', 'Disabled'),
('6374433e-f36b-1410-883e-00d02208dc50', '0074433e-f36b-1410-883e-00d02208dc50', 1, 'Active', 'Active'),
('6574433e-f36b-1410-883e-00d02208dc50', '0074433e-f36b-1410-883e-00d02208dc50', 2, 'Expired', 'Expired');

-- Add missing EntityPermission records for the AI Prompt, AI Result Cache, AI Prompt Categories, and AI Prompt Types entities
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
(ID, EntityID, RoleID, CanCreate, CanRead, CanUpdate, CanDelete)
VALUES
('518523e8-295f-4690-b10f-990bc1609d9e', '73ad0238-8b56-ef11-991a-6045bdeba539', 'e0afccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('ef0c21a3-7d98-451a-a45b-caf347d05680', '73ad0238-8b56-ef11-991a-6045bdeba539', 'deafccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('8d5052ed-c4a9-47d4-a2c7-8176a93e95fa', '73ad0238-8b56-ef11-991a-6045bdeba539', 'dfafccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('e7e19937-4715-4e9b-8c54-ed0683099bea', '78ad0238-8b56-ef11-991a-6045bdeba539', 'e0afccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('80d1196e-cbdf-4e8d-b768-427645bfd4ec', '78ad0238-8b56-ef11-991a-6045bdeba539', 'deafccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('af196767-b093-41c9-82fb-67936c93f6e9', '78ad0238-8b56-ef11-991a-6045bdeba539', 'dfafccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('55966fe0-b055-4fca-be76-101ae9e91f50', '7dad0238-8b56-ef11-991a-6045bdeba539', 'e0afccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('39817757-25a5-480d-a838-ccd679b8e6b7', '7dad0238-8b56-ef11-991a-6045bdeba539', 'deafccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('bb5077a5-9995-4783-9deb-d2cd8eaab2e9', '7dad0238-8b56-ef11-991a-6045bdeba539', 'dfafccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('eb432695-cc7a-4282-ae69-98b69b75dc20', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 'e0afccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('0536ae61-2eac-4acf-8af8-2a3e1062c349', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 'deafccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0),
('e2570602-7a7a-4a04-b394-5dd870c38a4e', 'f1a70b3e-8b56-ef11-991a-6045bdeba539', 'dfafccec-6a37-ef11-86d4-000d3a4e707e', 0, 1, 0, 0);

GO
-- Ensure view exists for AI Prompt
IF OBJECT_ID(N'${flyway:defaultSchema}.vwAIPrompts', 'V') IS NOT NULL DROP VIEW ${flyway:defaultSchema}.vwAIPrompts;
GO
CREATE VIEW [${flyway:defaultSchema}].[vwAIPrompts] AS
SELECT
    a.*,
    Template_TemplateID.[Name] AS [Template],
    AIPromptCategory_CategoryID.[Name] AS [Category],
    AIPromptType_TypeID.[Name] AS [Type]
FROM [${flyway:defaultSchema}].[AIPrompt] AS a
INNER JOIN [${flyway:defaultSchema}].[Template] AS Template_TemplateID ON [a].[TemplateID] = Template_TemplateID.[ID]
LEFT OUTER JOIN [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_CategoryID ON [a].[CategoryID] = AIPromptCategory_CategoryID.[ID]
INNER JOIN [${flyway:defaultSchema}].[AIPromptType] AS AIPromptType_TypeID ON [a].[TypeID] = AIPromptType_TypeID.[ID];
GO

-- Ensure view exists for AI Result Cache
IF OBJECT_ID(N'${flyway:defaultSchema}.vwAIResultCaches', 'V') IS NOT NULL DROP VIEW ${flyway:defaultSchema}.vwAIResultCaches;
GO
CREATE VIEW [${flyway:defaultSchema}].[vwAIResultCaches] AS
SELECT
    a.*,
    AIPrompt_AIPromptID.[Name] AS [AIPrompt],
    AIModel_AIModelID.[Name] AS [AIModel]
FROM [${flyway:defaultSchema}].[AIResultCache] AS a
INNER JOIN [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_AIPromptID ON [a].[AIPromptID] = AIPrompt_AIPromptID.[ID]
INNER JOIN [${flyway:defaultSchema}].[AIModel] AS AIModel_AIModelID ON [a].[AIModelID] = AIModel_AIModelID.[ID];
GO

-- Ensure view exists for AI Prompt Categories
IF OBJECT_ID(N'${flyway:defaultSchema}.vwAIPromptCategories', 'V') IS NOT NULL DROP VIEW ${flyway:defaultSchema}.vwAIPromptCategories;
GO
CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptCategories] AS
SELECT
    a.*,
    AIPromptCategory_ParentID.[Name] AS [Parent]
FROM [${flyway:defaultSchema}].[AIPromptCategory] AS a
LEFT OUTER JOIN [${flyway:defaultSchema}].[AIPromptCategory] AS AIPromptCategory_ParentID ON [a].[ParentID] = AIPromptCategory_ParentID.[ID];
GO


-- Ensure view exists for AI Prompt Types
IF OBJECT_ID(N'${flyway:defaultSchema}.vwAIPromptTypes', 'V') IS NOT NULL DROP VIEW ${flyway:defaultSchema}.vwAIPromptTypes;
GO
CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptTypes] AS
SELECT  a.*
FROM [${flyway:defaultSchema}].[AIPromptType] AS a;
GO

-- Add db user to roles
ALTER ROLE [cdp_Developer] ADD MEMBER [MJ_Connect]
ALTER ROLE [cdp_Integration] ADD MEMBER [MJ_Connect]
