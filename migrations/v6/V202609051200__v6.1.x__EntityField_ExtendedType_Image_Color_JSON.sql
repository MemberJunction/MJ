-- Widen EntityField.ExtendedType to Image, Color, and JSON.
--
-- Image  — the value is an image URL, a data:image URI, or raw image base64. UI surfaces
--          (forms, entity-viewer grid/cards/timeline) render a thumbnail. In edit mode the
--          form field allows replacing the value with an upload, capped at the field's
--          MaxLength (or 1 MiB when the column is nvarchar(max)).
-- Color  — the value is a CSS color (hex / rgb / hsl). Forms show a swatch + hex editor.
-- JSON   — the value is a JSON document. Validated on save and pretty-printed in forms.
--
-- Also reclassifies existing PhotoURL / LogoURL / ImageURL fields from URL → Image and
-- locks AutoUpdateExtendedType so CodeGen/LLM cannot overwrite the choice.

ALTER TABLE ${flyway:defaultSchema}.EntityField DROP CONSTRAINT CK_EntityField_ExtendedType;
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD CONSTRAINT CK_EntityField_ExtendedType CHECK (
    ExtendedType IN ('Code', 'Color', 'Email', 'FaceTime', 'Geo', 'GeoLatitude', 'GeoLongitude', 'GeoCountry', 'GeoStateProvince', 'GeoCity', 'GeoPostalCode', 'GeoAddress', 'HTML', 'Icon', 'Image', 'JSON', 'Markdown', 'MSTeams', 'Other', 'SIP', 'SMS', 'Skype', 'Tel', 'URL', 'WhatsApp', 'ZoomMtg')
);
GO

-- Park existing value-list sequences so the alphabetical resequence cannot collide
-- with the unique (EntityFieldID, Sequence) index.
UPDATE [${flyway:defaultSchema}].[EntityFieldValue]
   SET Sequence = Sequence + 100
 WHERE EntityFieldID = '055817F0-6F36-EF11-86D4-6045BDEE16E6';
GO

-- Resequence the existing list alphabetically, leaving room for Color / Image / JSON.
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 1  WHERE ID = '05F5A9C5-F1C8-4694-9058-73EBFD594C6A'; -- Code
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 3  WHERE ID = 'B4A82E72-92D7-40D4-8739-19DA726433ED'; -- Email
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 4  WHERE ID = '1E24001A-7E77-48FD-9AE7-860E114F257D'; -- FaceTime
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 5  WHERE ID = 'E977A29A-6FFA-4294-8309-A1698A94969A'; -- Geo
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 6  WHERE ID = 'D8DBB0DC-44D0-4680-B336-71394F02963A'; -- GeoAddress
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 7  WHERE ID = 'E9E3AEA7-9F3C-47C8-9CE2-5FDF64D34ACF'; -- GeoCity
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 8  WHERE ID = 'AFAE0954-1959-46D7-AD86-7B042BFBAEBB'; -- GeoCountry
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 9  WHERE ID = '38D62F4E-338A-4BF2-B1A6-16106FA0FA01'; -- GeoLatitude
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 10 WHERE ID = '7E3F3656-AD62-4294-A3A9-2EA254C91269'; -- GeoLongitude
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 11 WHERE ID = 'B6D14033-C479-4167-B075-E2796F8A159D'; -- GeoPostalCode
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 12 WHERE ID = 'D2054017-412B-457A-A98E-AA2400128BAD'; -- GeoStateProvince
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 13 WHERE ID = '17A9A6B7-36E3-49A8-B3C8-7185158E0B92'; -- HTML
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 14 WHERE ID = 'A54D1E4D-1190-4C92-B100-523C072CB878'; -- Icon
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 17 WHERE ID = '5434DBD9-19F2-41C9-B8AC-3A4E2C669602'; -- Markdown
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 18 WHERE ID = 'F45F1816-CAAA-434C-8239-3932D448DEB6'; -- MSTeams
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 19 WHERE ID = '68A4F7CA-B203-40C8-ABAC-A91122866B00'; -- Other
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 20 WHERE ID = 'DFD25989-75AD-4F5B-8F18-88E687E067E5'; -- SIP
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 21 WHERE ID = '7758B42A-D133-4052-9991-1869AA5DFD74'; -- SMS
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 22 WHERE ID = '5B3460FB-56CC-4DAB-8375-60BDCD11FE35'; -- Skype
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 23 WHERE ID = 'E1D0D56C-10D6-4A7C-BED8-D4F7A439204D'; -- Tel
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 24 WHERE ID = 'A5865195-4AD1-432D-8797-57D25F3741FF'; -- URL
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 25 WHERE ID = '356C61B4-27B5-48F3-A240-31B0CC6CA23D'; -- WhatsApp
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence = 26 WHERE ID = '45F07992-2974-4F4B-A5C8-FAECCF86BDB9'; -- ZoomMtg
GO

INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
    ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
VALUES
    ('7648FA8F-1C25-49C1-A559-9C79B4689BE8', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 2,  'Color', 'Color', GETUTCDATE(), GETUTCDATE()),
    ('DF27406B-3F1C-4FB8-8E66-FE61B7F81BC8', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 15, 'Image', 'Image', GETUTCDATE(), GETUTCDATE()),
    ('17BBF9B5-C49F-4FD5-9562-28EECBD8EDA5', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 16, 'JSON',  'JSON',  GETUTCDATE(), GETUTCDATE());
GO

-- Reclassify well-known image URL columns. Lock AutoUpdateExtendedType so CodeGen cannot
-- overwrite Image back to URL on the next LLM pass.
UPDATE [${flyway:defaultSchema}].[EntityField]
   SET ExtendedType = 'Image',
       AutoUpdateExtendedType = 0
 WHERE Name IN (N'PhotoURL', N'LogoURL', N'ImageURL')
   AND (ExtendedType IS NULL OR ExtendedType IN (N'URL', N'Other'));
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Defines extended behaviors for a field such as Email, Web URLs, Code, Markdown, HTML, Icon, Image, Color, and JSON. When set to Image, the field holds an image URL or inline image (data URI / base64) and UI surfaces render a thumbnail. Color is a CSS color. JSON is a JSON document, validated on save.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'ExtendedType';
GO
