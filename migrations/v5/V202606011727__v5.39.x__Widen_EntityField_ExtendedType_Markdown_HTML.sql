-- Widen the EntityField.ExtendedType CHECK constraint to allow 'Markdown' and 'HTML'.
--
-- This lets metadata authors explicitly declare the rendered format of a long-text
-- field (nvarchar(max), ntext, etc.). When ExtendedType is set, the form field honors
-- it directly; when it is NULL, the Angular form field falls back to lightweight,
-- client-side content auto-detection.
--
-- Drop the existing constraint and re-create it with the two new values added (kept in
-- alphabetical order alongside the rest for readability).
ALTER TABLE ${flyway:defaultSchema}.EntityField DROP CONSTRAINT CK_EntityField_ExtendedType;
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD CONSTRAINT CK_EntityField_ExtendedType CHECK (
    ExtendedType IN ('Code', 'Email', 'FaceTime', 'Geo', 'GeoLatitude', 'GeoLongitude', 'GeoCountry', 'GeoStateProvince', 'GeoCity', 'GeoPostalCode', 'GeoAddress', 'HTML', 'Markdown', 'MSTeams', 'Other', 'SIP', 'SMS', 'Skype', 'Tel', 'URL', 'WhatsApp', 'ZoomMtg')
);
GO























































-- CODE GEN RUN
/* SQL text to insert entity field value with ID 50c1f117-5627-4bc3-b32c-9d7d7b494ea4 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('50c1f117-5627-4bc3-b32c-9d7d7b494ea4', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 12, 'HTML', 'HTML', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 887d79d6-9fb4-4efb-b888-b09162b36e66 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('887d79d6-9fb4-4efb-b888-b09162b36e66', '055817F0-6F36-EF11-86D4-6045BDEE16E6', 14, 'Markdown', 'Markdown', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=13 WHERE ID='F45F1816-CAAA-434C-8239-3932D448DEB6';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=15 WHERE ID='68A4F7CA-B203-40C8-ABAC-A91122866B00';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=16 WHERE ID='DFD25989-75AD-4F5B-8F18-88E687E067E5';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=17 WHERE ID='7758B42A-D133-4052-9991-1869AA5DFD74';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=18 WHERE ID='5B3460FB-56CC-4DAB-8375-60BDCD11FE35';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=19 WHERE ID='E1D0D56C-10D6-4A7C-BED8-D4F7A439204D';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=20 WHERE ID='A5865195-4AD1-432D-8797-57D25F3741FF';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=21 WHERE ID='356C61B4-27B5-48F3-A240-31B0CC6CA23D';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=22 WHERE ID='45F07992-2974-4F4B-A5C8-FAECCF86BDB9';

