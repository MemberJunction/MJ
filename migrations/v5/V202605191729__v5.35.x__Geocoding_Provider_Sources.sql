-- Expand the GeocodingSource CHECK constraint on RecordGeoCode to allow the
-- two new provider values introduced by the multi-provider geocoding work:
--   'geocodio' — Geocod.io (US, Canada, UK, Australia; generous free tier)
--   'here'     — HERE Geocoding & Search API (global; 250k/mo free tier)
--
-- Existing values are preserved unchanged so historical rows remain valid.

DECLARE @ConstraintName NVARCHAR(200);
SELECT @ConstraintName = name
  FROM sys.check_constraints
 WHERE parent_object_id = OBJECT_ID(N'${flyway:defaultSchema}.RecordGeoCode')
   AND name = 'CK_RecordGeoCode_GeocodingSource';

IF @ConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE ${flyway:defaultSchema}.RecordGeoCode DROP CONSTRAINT ' + @ConstraintName);
END;

ALTER TABLE ${flyway:defaultSchema}.RecordGeoCode
    ADD CONSTRAINT CK_RecordGeoCode_GeocodingSource
        CHECK (GeocodingSource IN ('google', 'geocodio', 'here', 'reference_data', 'manual', 'ip_geolocation', 'native', 'reverse'));

-- Refresh the column description so CodeGen picks up the expanded enum on next run.
IF EXISTS (
    SELECT 1 FROM sys.extended_properties
     WHERE major_id = OBJECT_ID(N'${flyway:defaultSchema}.RecordGeoCode')
       AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'${flyway:defaultSchema}.RecordGeoCode'), 'GeocodingSource', 'ColumnId')
       AND name = 'MS_Description'
)
BEGIN
    EXEC sp_updateextendedproperty
        @name = N'MS_Description',
        @value = N'Source that produced this geocode. One of: google, geocodio, here, reference_data, manual, ip_geolocation, native, reverse.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'RecordGeoCode',
        @level2type = N'COLUMN', @level2name = N'GeocodingSource';
END
ELSE
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Source that produced this geocode. One of: google, geocodio, here, reference_data, manual, ip_geolocation, native, reverse.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'RecordGeoCode',
        @level2type = N'COLUMN', @level2name = N'GeocodingSource';
END;





















































-- CODEGEN RUN
/* SQL text to insert entity field value with ID 67af7914-484d-43a3-b9f8-e5b450f8b422 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('67af7914-484d-43a3-b9f8-e5b450f8b422', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 1, 'geocodio', 'geocodio', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f6067958-8b41-4660-88c4-b433dd55fd1d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f6067958-8b41-4660-88c4-b433dd55fd1d', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 3, 'here', 'here', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='13834A14-5C08-4125-BD68-46CF939850B3';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='86D9583E-8DE4-436F-905A-61572273BDB7';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='19FFD25E-C31F-4D80-9523-E4FFE623C1E7';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=6 WHERE ID='E8E2A502-5C51-4937-AF6E-9D13E3A3735C';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=7 WHERE ID='786B8847-BE88-4460-BCFF-5AA41AFCE2FF';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=8 WHERE ID='D12F1417-677F-46F9-A337-D9D002CE2B2E';

