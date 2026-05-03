-- Restore enhanced view definitions for vwEntityActionFilters and
-- vwEntityCommunicationFields on PG. These views were originally enhanced in
-- v5.3 (V202602211553__v5.3.x__Missing_Metadata) to include the standard
-- denormalized join columns that SQL Server has, but the v5.5 PG-only catch-up
-- migration (V202603011600__v5.5.x__Create_Missing_Views.pg-only) regressed
-- both back to bare `SELECT e.*`. The v5.5 file was a hand-written band-aid
-- predating the proper CodeGen-generated PG views; it ran AFTER v5.3 and
-- silently overwrote the enhanced versions.
--
-- Symptom: BaseEntity.Save() on PG hits the cache-invalidation / event-handler
-- path which loads vwEntityActionFilters with all expected columns, then
-- errors out with `column "EntityAction" does not exist`. mj sync push fails
-- with a transaction-aborted cascade. Server-side cache stays stale.
--
-- This restores the enhanced definitions to match the SQL Server side.
-- We can't modify the v5.5 file directly because Skyway tracks checksums and
-- existing installs would fail validation, so this is a forward-only fix.

CREATE OR REPLACE VIEW __mj."vwEntityActionFilters" AS
SELECT
    e.*,
    "MJEntityAction_EntityActionID"."Action" AS "EntityAction",
    "MJActionFilter_ActionFilterID"."UserDescription" AS "ActionFilter"
FROM
    __mj."EntityActionFilter" AS e
INNER JOIN
    __mj."vwEntityActions" AS "MJEntityAction_EntityActionID"
    ON e."EntityActionID" = "MJEntityAction_EntityActionID"."ID"
INNER JOIN
    __mj."ActionFilter" AS "MJActionFilter_ActionFilterID"
    ON e."ActionFilterID" = "MJActionFilter_ActionFilterID"."ID";

DO $$ BEGIN
    GRANT SELECT ON __mj."vwEntityActionFilters" TO "cdp_Integration", "cdp_UI", "cdp_Developer";
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE OR REPLACE VIEW __mj."vwEntityCommunicationFields" AS
SELECT
    e.*,
    "MJEntityCommunicationMessageType_EntityCommunicationMessageTypeID"."BaseMessageType"
        AS "EntityCommunicationMessageType"
FROM
    __mj."EntityCommunicationField" AS e
INNER JOIN
    __mj."vwEntityCommunicationMessageTypes"
        AS "MJEntityCommunicationMessageType_EntityCommunicationMessageTypeID"
    ON e."EntityCommunicationMessageTypeID" =
       "MJEntityCommunicationMessageType_EntityCommunicationMessageTypeID"."ID";

DO $$ BEGIN
    GRANT SELECT ON __mj."vwEntityCommunicationFields" TO "cdp_UI", "cdp_Developer", "cdp_Integration";
EXCEPTION WHEN others THEN NULL;
END $$;
