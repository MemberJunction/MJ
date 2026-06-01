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
