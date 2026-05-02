-- Continuation of V202604281800 — restore more PG view join columns regressed
-- by the v5.5 PG-only "Create_Missing_Views" migration. The original v5.5 file
-- stripped 24 views back to bare `SELECT e.*` to bootstrap missing PG views,
-- but never restored the SQL Server enhancements that were added in v5.3.
--
-- This migration covers vwEntityActionInvocations and vwEntityActionParams,
-- both of which surface as runtime errors when BaseEntity.Save fires its
-- post-save metadata refresh and tries to load denormalized join columns
-- (EntityAction, etc.) that exist on SQL Server but were stripped on PG.

-- PG's CREATE OR REPLACE VIEW only allows APPENDING columns (not reordering or
-- removing). The existing view already has InvocationType / ActionParam at the
-- end; we append EntityAction AFTER them. The column order differs from SQL
-- Server but that doesn't matter for code that selects by column name.
CREATE OR REPLACE VIEW __mj."vwEntityActionInvocations" AS
SELECT
    e.*,
    "MJEntityActionInvocationType_InvocationTypeID"."Name" AS "InvocationType",
    "MJEntityAction_EntityActionID"."Action" AS "EntityAction"
FROM
    __mj."EntityActionInvocation" AS e
INNER JOIN
    __mj."EntityActionInvocationType" AS "MJEntityActionInvocationType_InvocationTypeID"
    ON e."InvocationTypeID" = "MJEntityActionInvocationType_InvocationTypeID"."ID"
INNER JOIN
    __mj."vwEntityActions" AS "MJEntityAction_EntityActionID"
    ON e."EntityActionID" = "MJEntityAction_EntityActionID"."ID";

DO $$ BEGIN
    GRANT SELECT ON __mj."vwEntityActionInvocations" TO "cdp_Integration", "cdp_UI", "cdp_Developer";
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE OR REPLACE VIEW __mj."vwEntityActionParams" AS
SELECT
    e.*,
    "MJActionParam_ActionParamID"."Name" AS "ActionParam",
    "MJEntityAction_EntityActionID"."Action" AS "EntityAction"
FROM
    __mj."EntityActionParam" AS e
INNER JOIN
    __mj."ActionParam" AS "MJActionParam_ActionParamID"
    ON e."ActionParamID" = "MJActionParam_ActionParamID"."ID"
INNER JOIN
    __mj."vwEntityActions" AS "MJEntityAction_EntityActionID"
    ON e."EntityActionID" = "MJEntityAction_EntityActionID"."ID";

DO $$ BEGIN
    GRANT SELECT ON __mj."vwEntityActionParams" TO "cdp_Integration", "cdp_UI", "cdp_Developer";
EXCEPTION WHEN others THEN NULL;
END $$;
