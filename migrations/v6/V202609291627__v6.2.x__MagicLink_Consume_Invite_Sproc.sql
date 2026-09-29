-- Magic-link single-use consume: a granted stored procedure instead of raw DML (#4753).
--
-- WHY THIS EXISTS. MagicLinkService.consumeInvite issued its single-use compare-and-swap as a raw
-- UPDATE against the MagicLinkInvite BASE TABLE. MJ grants its runtime roles SELECT on views and
-- EXECUTE on stored procedures and never table-level DML, so on any host whose MJAPI login is a
-- member of the data roles rather than db_owner, every redemption was refused ("The UPDATE
-- permission was denied on the object 'MagicLinkInvite'") and — because the failure was reported
-- as a lost race — answered 410 "consumed". Every magic link, including every MJ Forms public link,
-- was dead on such a host. Same defect and remedy as the task-graph claim procs (#4575,
-- V202609191819__v6.2.x__TaskGraph_Guarded_Write_Sprocs.sql).
--
-- WHAT IS PRESERVED. The procedure is the statement it replaces, verbatim: ONE guarded UPDATE whose
-- WHERE re-checks Active / not exhausted / not expired, so concurrent redemptions race on the row
-- and exactly one matches. The matched ID is returned (one row = this caller won, zero = lost).
-- OUTPUT goes INTO a table variable because SQL Server forbids a bare OUTPUT clause on a table with
-- enabled triggers, and CodeGen gives every MJ table an __mj_UpdatedAt trigger.
--
-- NO DYNAMIC SQL, DELIBERATELY. Ownership chaining is what lets an EXECUTE-only caller update the
-- table, and it only covers static statements; sp_executesql would break the chain.
--
-- GRANTS. cdp_Developer and cdp_Integration — exactly the roles CodeGen grants EXECUTE on
-- spUpdateMagicLinkInvite. Not cdp_UI: the entity gives UI read-only access, and redemption runs
-- server-side under the MJAPI login.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spConsumeMagicLinkInvite];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spConsumeMagicLinkInvite]
    @ID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @consumed TABLE ([ID] UNIQUEIDENTIFIER);
    UPDATE [${flyway:defaultSchema}].[MagicLinkInvite]
    SET [UseCount] = [UseCount] + 1,
        [ConsumedAt] = COALESCE([ConsumedAt], SYSUTCDATETIME()),
        [Status] = CASE WHEN [UseCount] + 1 >= [MaxUses] THEN 'Consumed' ELSE [Status] END
    OUTPUT INSERTED.[ID] INTO @consumed
    WHERE [ID] = @ID
      AND [Status] = 'Active'
      AND [UseCount] < [MaxUses]
      AND [ExpiresAt] > SYSUTCDATETIME();
    SELECT [ID] FROM @consumed;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spConsumeMagicLinkInvite] TO [cdp_Developer], [cdp_Integration];
GO
