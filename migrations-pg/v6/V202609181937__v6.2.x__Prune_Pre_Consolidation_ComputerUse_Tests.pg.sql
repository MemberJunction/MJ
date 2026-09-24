-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609181937__v6.2.x__Prune_Pre_Consolidation_ComputerUse_Tests.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- Hand-ported from the T-SQL table-variable form (the AST transpiler cannot emit
-- DECLARE @t TABLE / DELETE alias FROM). Same semantics: memberships first, because
-- FK_TestSuiteTest_Test blocks the Test delete while they exist; a Test with any
-- TestRun history is kept, so no run is orphaned.
DELETE FROM __mj."TestSuiteTest"
WHERE "TestID" = ANY (ARRAY[
    '2F4CAED9-0916-433E-8A63-70C4B71B337B'::uuid,  -- T01 - Login Smoke
    '5FF83062-9015-4E5E-8BD7-3C38F22A5356'::uuid,  -- T02 - Home Application Load
    '010D3E19-FFE9-4D91-A68B-5300F0CABE92'::uuid,  -- T03 - Application Switcher
    'F83547E5-E480-424E-BF85-999324FB8DB4'::uuid,  -- T04 - Data Explorer Browse Entities
    '2BB830E5-AAB2-4537-BC35-366E5F7D9D31'::uuid,  -- T05 - Data Explorer Open Entity Record
    '8D4FF31A-B6D0-4E02-9528-4F0D0E240851'::uuid,  -- T06 - Data Explorer Search
    'BBC02CFF-554C-4587-915B-FE55FF351AC5'::uuid,  -- T07 - Entity Form View Record Details
    '8F37873C-FD30-4C2C-A875-716DCE7C9E77'::uuid,  -- T08 - Navigation and Tab Management
    '5F97BC52-9D41-4152-B8DA-1E3A6C07E66E'::uuid,  -- T09 - Entity Form Create New Record
    'E3EDE599-BBCB-4AB0-947E-76E933261185'::uuid,  -- T10 - Entity Form Edit and Save Record
    'A5174558-E08A-4A33-982C-2ADCACC01100'::uuid,  -- T11 - Run a Saved Query
    '9E9BED5F-AEF5-42FE-A892-2CF09EF44952'::uuid,  -- T12 - Admin Dashboard ERD Viewer
    '3881D46F-D7C9-46DE-B3E3-D54FB8DA4566'::uuid,  -- T13 - Admin Dashboard User Management
    '566E4865-BB38-49D0-921F-D32E7CE451AA'::uuid,  -- T14 - AI Application Agent List View
    '92255EB2-CC3D-4FF2-8652-EE2CFB5D8A6D'::uuid,  -- T15 - AI Application Prompt Management
    '5BE50BF7-D0C4-4A02-A441-41C8ECF08CF6'::uuid,  -- T16 - Lists Create and Populate
    'D94781D3-F117-4832-B497-3CDB9CE2296E'::uuid,  -- T17 - Settings Page Navigation
    '3CEF8310-6CDD-493F-824D-C13EB9BB9217'::uuid,  -- T18 - Communication Templates View
    'F89CF3DF-CDC1-4460-9BD1-C98E750C163F'::uuid,  -- T19 - Query Browser Execute Query
    '4069DC55-B2BB-452C-8AD2-599802D90E6B'::uuid,  -- T20 - Dashboard Browser
    '7F861EDC-EDEF-4333-8EFE-C9B6F2209404'::uuid,  -- T21 - AI Monitor Dashboard
    '5266CE50-884B-4AAD-B450-07098B547C8D'::uuid,  -- T22 - Integrations Overview
    '36A5AAA2-25B8-42FC-A06A-DF19BFEA56F0'::uuid,  -- T23 - Handle Invalid Navigation Gracefully
    'C2496941-0035-4B09-9E5C-C4D53822F940'::uuid,  -- T24 - Session Persistence Reload Page
    '98B5BFE9-41F3-465E-9C68-25CBD4B7E48A'::uuid  -- T25 - Multiple Tab Workflow
]);

DELETE FROM __mj."Test" AS t
WHERE t."ID" = ANY (ARRAY[
    '2F4CAED9-0916-433E-8A63-70C4B71B337B'::uuid,  -- T01 - Login Smoke
    '5FF83062-9015-4E5E-8BD7-3C38F22A5356'::uuid,  -- T02 - Home Application Load
    '010D3E19-FFE9-4D91-A68B-5300F0CABE92'::uuid,  -- T03 - Application Switcher
    'F83547E5-E480-424E-BF85-999324FB8DB4'::uuid,  -- T04 - Data Explorer Browse Entities
    '2BB830E5-AAB2-4537-BC35-366E5F7D9D31'::uuid,  -- T05 - Data Explorer Open Entity Record
    '8D4FF31A-B6D0-4E02-9528-4F0D0E240851'::uuid,  -- T06 - Data Explorer Search
    'BBC02CFF-554C-4587-915B-FE55FF351AC5'::uuid,  -- T07 - Entity Form View Record Details
    '8F37873C-FD30-4C2C-A875-716DCE7C9E77'::uuid,  -- T08 - Navigation and Tab Management
    '5F97BC52-9D41-4152-B8DA-1E3A6C07E66E'::uuid,  -- T09 - Entity Form Create New Record
    'E3EDE599-BBCB-4AB0-947E-76E933261185'::uuid,  -- T10 - Entity Form Edit and Save Record
    'A5174558-E08A-4A33-982C-2ADCACC01100'::uuid,  -- T11 - Run a Saved Query
    '9E9BED5F-AEF5-42FE-A892-2CF09EF44952'::uuid,  -- T12 - Admin Dashboard ERD Viewer
    '3881D46F-D7C9-46DE-B3E3-D54FB8DA4566'::uuid,  -- T13 - Admin Dashboard User Management
    '566E4865-BB38-49D0-921F-D32E7CE451AA'::uuid,  -- T14 - AI Application Agent List View
    '92255EB2-CC3D-4FF2-8652-EE2CFB5D8A6D'::uuid,  -- T15 - AI Application Prompt Management
    '5BE50BF7-D0C4-4A02-A441-41C8ECF08CF6'::uuid,  -- T16 - Lists Create and Populate
    'D94781D3-F117-4832-B497-3CDB9CE2296E'::uuid,  -- T17 - Settings Page Navigation
    '3CEF8310-6CDD-493F-824D-C13EB9BB9217'::uuid,  -- T18 - Communication Templates View
    'F89CF3DF-CDC1-4460-9BD1-C98E750C163F'::uuid,  -- T19 - Query Browser Execute Query
    '4069DC55-B2BB-452C-8AD2-599802D90E6B'::uuid,  -- T20 - Dashboard Browser
    '7F861EDC-EDEF-4333-8EFE-C9B6F2209404'::uuid,  -- T21 - AI Monitor Dashboard
    '5266CE50-884B-4AAD-B450-07098B547C8D'::uuid,  -- T22 - Integrations Overview
    '36A5AAA2-25B8-42FC-A06A-DF19BFEA56F0'::uuid,  -- T23 - Handle Invalid Navigation Gracefully
    'C2496941-0035-4B09-9E5C-C4D53822F940'::uuid,  -- T24 - Session Persistence Reload Page
    '98B5BFE9-41F3-465E-9C68-25CBD4B7E48A'::uuid  -- T25 - Multiple Tab Workflow
])
  AND NOT EXISTS (SELECT 1 FROM __mj."TestRun" AS tr WHERE tr."TestID" = t."ID");
