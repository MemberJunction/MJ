-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

ALTER TABLE __mj."RecordGeoCode" DROP CONSTRAINT IF EXISTS "CK_RecordGeoCode_GeocodingSource";

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('67af7914-484d-43a3-b9f8-e5b450f8b422', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 1, 'geocodio', 'geocodio', NOW(), NOW());

/* SQL text to insert entity field value with ID f6067958-8b41-4660-88c4-b433dd55fd1d */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f6067958-8b41-4660-88c4-b433dd55fd1d', 'BCA87CF8-5989-4A92-BA21-3B3B409401AB', 3, 'here', 'here', NOW(), NOW());

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=2 WHERE "ID"='13834A14-5C08-4125-BD68-46CF939850B3';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=4 WHERE "ID"='86D9583E-8DE4-436F-905A-61572273BDB7';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=5 WHERE "ID"='19FFD25E-C31F-4D80-9523-E4FFE623C1E7';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=6 WHERE "ID"='E8E2A502-5C51-4937-AF6E-9D13E3A3735C';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=7 WHERE "ID"='786B8847-BE88-4460-BCFF-5AA41AFCE2FF';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=8 WHERE "ID"='D12F1417-677F-46F9-A337-D9D002CE2B2E';


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."RecordGeoCode"
 ADD CONSTRAINT "CK_RecordGeoCode_GeocodingSource"
        CHECK ("GeocodingSource" IN ('google', 'geocodio', 'here', 'reference_data', 'manual', 'ip_geolocation', 'native', 'reverse')) NOT VALID;

-- Refresh the column description so CodeGen picks up the expanded enum on next run.;
