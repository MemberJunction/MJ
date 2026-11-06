-- =====================================================================================
-- UI reads and updates of rubric evaluations stay with the evaluator, unless the
-- user holds the Administer Rubric Evaluations authorization.
--
-- V202609302342 registered MJ: Rubric Evaluations and MJ: Rubric Evaluation Scores
-- with the generated default: the UI role can read and cannot create, update, or
-- delete, and the read has no row filter. The UI role is held by every ordinary
-- signed-in user, so that read shows every evaluation to everyone.
--
-- This file adds the two filters first, then grants UI create and update and
-- attaches the filters to read and update. Update carries the same filter on
-- purpose. A grant with no filter exempts that role from row security for the
-- operation, which would let every UI user update every evaluation.
--
-- Create is unfiltered. Starting an evaluation does not select an existing row.
-- Delete stays off.
--
-- Developer and Integration keep the filter-less grants from V202609302342, so
-- they remain exempt. The authorization below is the extra path inside the UI
-- filter: a role that is not Developer can be linked to it and then read every
-- evaluation through the UI grant. Deny on that authorization wins over Allow.
-- The authorization row itself is metadata (metadata/authorizations and
-- metadata/authorization-roles) because those entities sync. These filter rows
-- are SQL because MJ: Row Level Security Filters grants Create to no role, so
-- mj sync push cannot write them. The permission rows are updated here, matched
-- on entity plus role, because V202609302342 inserted them without an ID and the
-- generated ID differs per database.
-- =====================================================================================

DECLARE @EvaluationFilterID UNIQUEIDENTIFIER = '4D421671-D531-4208-8068-2FC92685305A';
DECLARE @ScoreFilterID UNIQUEIDENTIFIER = '60178540-5C41-4FBA-AE05-3B454FBB9FB2';
DECLARE @AdminClause nvarchar(max) = N'EXISTS (
        SELECT 1
        FROM ${flyway:defaultSchema}.[AuthorizationRole] AS [ar]
        INNER JOIN ${flyway:defaultSchema}.[UserRole] AS [ur]
            ON [ur].[RoleID] = [ar].[RoleID]
        INNER JOIN ${flyway:defaultSchema}.[Authorization] AS [auth]
            ON [auth].[ID] = [ar].[AuthorizationID]
        WHERE [ur].[UserID] = ''{{UserID}}''
          AND [auth].[Name] = N''Administer Rubric Evaluations''
          AND [auth].[IsActive] = 1
          AND [ar].[Type] = N''Allow''
          AND NOT EXISTS (
              SELECT 1
              FROM ${flyway:defaultSchema}.[AuthorizationRole] AS [denied]
              INNER JOIN ${flyway:defaultSchema}.[UserRole] AS [deniedUserRole]
                  ON [deniedUserRole].[RoleID] = [denied].[RoleID]
              WHERE [deniedUserRole].[UserID] = ''{{UserID}}''
                AND [denied].[AuthorizationID] = [auth].[ID]
                AND [denied].[Type] = N''Deny''
          )
    )';

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.[RowLevelSecurityFilter] WHERE [ID] = @EvaluationFilterID)
    INSERT INTO ${flyway:defaultSchema}.[RowLevelSecurityFilter] ([ID], [Name], [Description], [FilterText])
    VALUES (
        @EvaluationFilterID,
        N'UI: Own Rubric Evaluations',
        N'Narrows MJ: Rubric Evaluations to rows whose EvaluatorUserID is the current user, plus holders of the Administer Rubric Evaluations authorization. Attached to the UI role read and update grants.',
        N'([EvaluatorUserID] = ''{{UserID}}'' OR ' + @AdminClause + N')'
    );

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.[RowLevelSecurityFilter] WHERE [ID] = @ScoreFilterID)
    INSERT INTO ${flyway:defaultSchema}.[RowLevelSecurityFilter] ([ID], [Name], [Description], [FilterText])
    VALUES (
        @ScoreFilterID,
        N'UI: Own Rubric Evaluation Scores',
        N'Narrows MJ: Rubric Evaluation Scores to scores on an evaluation whose EvaluatorUserID is the current user, plus holders of the Administer Rubric Evaluations authorization. The score table has no evaluator column, so the predicate reads the parent evaluation.',
        N'([EvaluationID] IN (SELECT [ev].[ID] FROM ${flyway:defaultSchema}.[RubricEvaluation] AS [ev] WHERE [ev].[EvaluatorUserID] = ''{{UserID}}'') OR ' + @AdminClause + N')'
    );
GO

DECLARE @UIRoleID UNIQUEIDENTIFIER = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @EvaluationEntityID UNIQUEIDENTIFIER = '7FAA091D-C1A3-48A7-82D2-3D17729470F9';
DECLARE @ScoreEntityID UNIQUEIDENTIFIER = '122ED707-2BC0-42E8-B25F-6BDDE7164962';
DECLARE @EvaluationFilterID UNIQUEIDENTIFIER = '4D421671-D531-4208-8068-2FC92685305A';
DECLARE @ScoreFilterID UNIQUEIDENTIFIER = '60178540-5C41-4FBA-AE05-3B454FBB9FB2';

IF EXISTS (
    SELECT 1
    FROM ${flyway:defaultSchema}.[EntityPermission]
    WHERE [EntityID] = @EvaluationEntityID AND [RoleID] = @UIRoleID AND [Type] = N'Allow'
)
    UPDATE ${flyway:defaultSchema}.[EntityPermission]
       SET [CanCreate] = 1,
           [CanUpdate] = 1,
           [ReadRLSFilterID] = @EvaluationFilterID,
           [UpdateRLSFilterID] = @EvaluationFilterID,
           [__mj_UpdatedAt] = GETUTCDATE()
     WHERE [EntityID] = @EvaluationEntityID
       AND [RoleID] = @UIRoleID
       AND [Type] = N'Allow';

IF EXISTS (
    SELECT 1
    FROM ${flyway:defaultSchema}.[EntityPermission]
    WHERE [EntityID] = @ScoreEntityID AND [RoleID] = @UIRoleID AND [Type] = N'Allow'
)
    UPDATE ${flyway:defaultSchema}.[EntityPermission]
       SET [CanCreate] = 1,
           [CanUpdate] = 1,
           [ReadRLSFilterID] = @ScoreFilterID,
           [UpdateRLSFilterID] = @ScoreFilterID,
           [__mj_UpdatedAt] = GETUTCDATE()
     WHERE [EntityID] = @ScoreEntityID
       AND [RoleID] = @UIRoleID
       AND [Type] = N'Allow';
GO
