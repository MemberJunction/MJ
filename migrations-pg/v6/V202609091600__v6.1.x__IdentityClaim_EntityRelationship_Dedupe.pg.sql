-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================
--
-- HAND-PORTED. The AST transpiler reported 4 unhandled statements here: two
-- `DECLARE @x UNIQUEIDENTIFIER = '…'` assignments and two
-- `;WITH ranked AS (...) DELETE FROM … WHERE ID IN (SELECT ID FROM ranked …)`
-- blocks. The CTE-DELETE shape is a documented transpiler blind spot — it lands
-- as `DELETE FROM "ranked"`, which PostgreSQL rejects because you cannot DELETE
-- from a CTE. Ported below as a plain sub-select over a windowed derived table,
-- which needs no CTE and no variables.
--
-- IdentityClaim — de-duplicate EntityRelationship rows (v6.1.x)
--
-- V202609091200__v6.1.x__IdentityClaim_Metadata_Tail supplies four
-- EntityRelationship rows for "MJ: Identity Claims", each guarded on PRIMARY KEY.
-- But the premise of that gap is that the rows ALREADY exist on developer
-- databases under LOCALLY GENERATED ids, created by `mj codegen`. There the guard
-- looks for an id that is not present, does not fire, and inserts a SECOND row
-- for a relationship that already exists. No unique constraint on
-- (EntityID, RelatedEntityID, RelatedEntityJoinField) catches it, so the
-- duplicate is silent; its visible effect is a doubled related-entity tab on
-- MJ: Entities, MJ: Users, MJ: Identity Claim Types and MJ: Magic Link Invites.
--
-- Forward-only cleanup: V202609091200 is already merged and applied, so editing
-- it would change its Flyway checksum and break every database that ran it.
-- A fresh database is unaffected — nothing is duplicated, so this is a no-op.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;


-- 1. EntityRelationship — keep the earliest row per natural key.
--    Natural key: (EntityID, RelatedEntityID, RelatedEntityJoinField)
--    scoped to RelatedEntityID = 'MJ: Identity Claims'.
DELETE FROM __mj."EntityRelationship"
WHERE "ID" IN (
    SELECT ranked."ID"
    FROM (
        SELECT
            "ID",
            ROW_NUMBER() OVER (
                PARTITION BY "EntityID", "RelatedEntityID", "RelatedEntityJoinField"
                ORDER BY "__mj_CreatedAt" ASC, "ID" ASC
            ) AS rn
        FROM __mj."EntityRelationship"
        WHERE "RelatedEntityID" = '58C8C895-E3AA-48C2-BA68-808337235873'::uuid
    ) AS ranked
    WHERE ranked.rn > 1
);


-- 2. Same defect, second table: V202609091200 also guards its four
--    EntityFieldValue inserts (the IdentityClaim.Status value list) on PRIMARY
--    KEY. This is not developer-only — it reproduces on a clean CI database
--    whenever those rows exist under other ids, which is exactly what #3367's
--    healing migration does (same four values, different ids, sorts earlier).
--    The observable result is a generated Zod union with every value twice:
--        Status: z.union([z.literal('Claimed'), z.literal('Claimed'), …])
--    Keyed on the natural key (EntityFieldID, Value), keeping the earliest row.
DELETE FROM __mj."EntityFieldValue"
WHERE "ID" IN (
    SELECT rankedValues."ID"
    FROM (
        SELECT
            "ID",
            ROW_NUMBER() OVER (
                PARTITION BY "EntityFieldID", "Value"
                ORDER BY "__mj_CreatedAt" ASC, "ID" ASC
            ) AS rn
        FROM __mj."EntityFieldValue"
        WHERE "EntityFieldID" = 'F925BD99-4B5A-48A4-878A-385E8F2D87E7'::uuid
    ) AS rankedValues
    WHERE rankedValues.rn > 1
);
