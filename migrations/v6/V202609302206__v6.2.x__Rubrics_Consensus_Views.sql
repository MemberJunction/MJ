/*
    Rubrics, step 3 of 3 — the MJ-owned wrapper views that expose consensus.

    V202609302205 made CodeGen generate vwRubricEvaluationsGenerated and
    vwRubricEvaluationScoresGenerated. The public base views below wrap them with `SELECT g.*` plus
    the columns CodeGen cannot produce, so every foreign-key display field keeps regenerating
    underneath and only the consensus logic is hand-written.

    WHAT "CONSENSUS" MEANS HERE. A cohort is every evaluation of the SAME subject record, in the
    SAME context (NULL context matches NULL context), against the SAME rubric and MAJOR version.
    Major is the comparability boundary by construction: the publish-time semver rule makes any
    change to the scoring math a major bump, so evaluations within one major version were computed
    by the same math and can be averaged.

    Only Submitted evaluations count, and Self evaluations (the subject's own party, e.g. a vendor
    asserting compliance) are excluded from the reviewer figures and reported separately.

    WHY OUTER APPLY AND NOT WINDOW FUNCTIONS. A windowed aggregate forces SQL Server to compute
    whole partitions before a caller's WHERE on ID can apply, so loading ONE evaluation would scan
    them all. The correlated OUTER APPLY is driven per row and seeks on IX_RubricEvaluation_Cohort,
    so a single-record load stays a handful of seeks. Nothing is stored: individual evaluations are
    immutable and carry their own computed result, but a cohort gains members over time, so its
    consensus is computed on read. Median, trimmed mean and inter-rater agreement statistics are
    computed by the rubric engine on top of these rows, not here.

    The CodeGen section appended below registers each added column as a virtual EntityField and
    regenerates the CRUD routines so they return the wrapper columns.
*/

---------------------------------------------------------------------------------------------------
-- 1 · vwRubricEvaluations — the evaluation, its rubric identity, and its cohort's consensus
---------------------------------------------------------------------------------------------------
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwRubricEvaluations]
AS
SELECT
    g.*,
    rv.[RubricID],
    r.[Name] AS [Rubric],
    rv.[MajorVersion] AS [RubricMajorVersion],
    CONVERT(NVARCHAR(40), rv.[MajorVersion]) + '.' +
        CONVERT(NVARCHAR(40), rv.[MinorVersion]) + '.' +
        CONVERT(NVARCHAR(40), rv.[PatchVersion]) AS [RubricVersionLabel],
    cohort.[CohortEvaluationCount],
    cohort.[CohortScoredCount],
    cohort.[CohortPassedCount],
    cohort.[CohortMeanScore],
    cohort.[CohortMinScore],
    cohort.[CohortMaxScore],
    cohort.[CohortScoreStdDev],
    cohort.[CohortHumanCount],
    cohort.[CohortHumanMeanScore],
    cohort.[CohortAICount],
    cohort.[CohortAIMeanScore],
    cohort.[SelfAssessmentScore],
    CASE
        WHEN g.[Status] = 'Submitted' AND g.[EvaluatorType] <> 'Self'
         AND g.[NormalizedScore] IS NOT NULL AND cohort.[CohortMeanScore] IS NOT NULL
        THEN CAST(g.[NormalizedScore] - cohort.[CohortMeanScore] AS DECIMAL(9,6))
    END AS [DeviationFromCohortMean]
FROM
    [${flyway:defaultSchema}].[vwRubricEvaluationsGenerated] g
INNER JOIN
    [${flyway:defaultSchema}].[RubricVersion] rv ON rv.[ID] = g.[RubricVersionID]
INNER JOIN
    [${flyway:defaultSchema}].[Rubric] r ON r.[ID] = rv.[RubricID]
OUTER APPLY (
    SELECT
        SUM(CASE WHEN e.[EvaluatorType] <> 'Self' THEN 1 ELSE 0 END) AS [CohortEvaluationCount],
        SUM(CASE WHEN e.[EvaluatorType] <> 'Self' AND e.[NormalizedScore] IS NOT NULL THEN 1 ELSE 0 END) AS [CohortScoredCount],
        SUM(CASE WHEN e.[EvaluatorType] <> 'Self' AND e.[Passed] = 1 THEN 1 ELSE 0 END) AS [CohortPassedCount],
        CAST(AVG(CASE WHEN e.[EvaluatorType] <> 'Self' THEN e.[NormalizedScore] END) AS DECIMAL(9,6)) AS [CohortMeanScore],
        MIN(CASE WHEN e.[EvaluatorType] <> 'Self' THEN e.[NormalizedScore] END) AS [CohortMinScore],
        MAX(CASE WHEN e.[EvaluatorType] <> 'Self' THEN e.[NormalizedScore] END) AS [CohortMaxScore],
        CAST(STDEV(CASE WHEN e.[EvaluatorType] <> 'Self' THEN e.[NormalizedScore] END) AS DECIMAL(9,6)) AS [CohortScoreStdDev],
        SUM(CASE WHEN e.[EvaluatorType] = 'Human' THEN 1 ELSE 0 END) AS [CohortHumanCount],
        CAST(AVG(CASE WHEN e.[EvaluatorType] = 'Human' THEN e.[NormalizedScore] END) AS DECIMAL(9,6)) AS [CohortHumanMeanScore],
        SUM(CASE WHEN e.[EvaluatorType] IN ('AIPrompt', 'Agent') THEN 1 ELSE 0 END) AS [CohortAICount],
        CAST(AVG(CASE WHEN e.[EvaluatorType] IN ('AIPrompt', 'Agent') THEN e.[NormalizedScore] END) AS DECIMAL(9,6)) AS [CohortAIMeanScore],
        MAX(CASE WHEN e.[EvaluatorType] = 'Self' THEN e.[NormalizedScore] END) AS [SelfAssessmentScore]
    FROM
        [${flyway:defaultSchema}].[RubricEvaluation] e
    INNER JOIN
        [${flyway:defaultSchema}].[RubricVersion] ev ON ev.[ID] = e.[RubricVersionID]
    WHERE
        e.[SubjectEntityID] = g.[SubjectEntityID]
        AND e.[SubjectRecordID] = g.[SubjectRecordID]
        AND e.[Status] = 'Submitted'
        AND ((e.[ContextEntityID] = g.[ContextEntityID] AND e.[ContextRecordID] = g.[ContextRecordID])
             OR (e.[ContextEntityID] IS NULL AND g.[ContextEntityID] IS NULL))
        AND ev.[RubricID] = rv.[RubricID]
        AND ev.[MajorVersion] = rv.[MajorVersion]
) cohort;
GO

---------------------------------------------------------------------------------------------------
-- 2 · vwRubricEvaluationScores — each answer with its evaluation's identity and the per-criterion
--     consensus. Criteria are matched across versions by Key, the cross-version identity.
---------------------------------------------------------------------------------------------------
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwRubricEvaluationScores]
AS
SELECT
    g.*,
    c.[Key] AS [CriterionKey],
    c.[NodeType] AS [CriterionNodeType],
    c.[ParentID] AS [CriterionParentID],
    e.[Status] AS [EvaluationStatus],
    e.[EvaluatorType],
    e.[EvaluatorUserID],
    e.[SubjectEntityID],
    e.[SubjectRecordID],
    e.[ContextEntityID],
    e.[ContextRecordID],
    rv.[RubricID],
    rv.[MajorVersion] AS [RubricMajorVersion],
    cohort.[CriterionCohortCount],
    cohort.[CriterionCohortMeanScore],
    cohort.[CriterionCohortMinScore],
    cohort.[CriterionCohortMaxScore],
    cohort.[CriterionCohortScoreStdDev],
    cohort.[CriterionCohortHumanMeanScore],
    cohort.[CriterionCohortAIMeanScore]
FROM
    [${flyway:defaultSchema}].[vwRubricEvaluationScoresGenerated] g
INNER JOIN
    [${flyway:defaultSchema}].[RubricCriterion] c ON c.[ID] = g.[CriterionID]
INNER JOIN
    [${flyway:defaultSchema}].[RubricEvaluation] e ON e.[ID] = g.[EvaluationID]
INNER JOIN
    [${flyway:defaultSchema}].[RubricVersion] rv ON rv.[ID] = e.[RubricVersionID]
OUTER APPLY (
    SELECT
        COUNT(s2.[NormalizedScore]) AS [CriterionCohortCount],
        CAST(AVG(s2.[NormalizedScore]) AS DECIMAL(9,6)) AS [CriterionCohortMeanScore],
        MIN(s2.[NormalizedScore]) AS [CriterionCohortMinScore],
        MAX(s2.[NormalizedScore]) AS [CriterionCohortMaxScore],
        CAST(STDEV(s2.[NormalizedScore]) AS DECIMAL(9,6)) AS [CriterionCohortScoreStdDev],
        CAST(AVG(CASE WHEN e2.[EvaluatorType] = 'Human' THEN s2.[NormalizedScore] END) AS DECIMAL(9,6)) AS [CriterionCohortHumanMeanScore],
        CAST(AVG(CASE WHEN e2.[EvaluatorType] IN ('AIPrompt', 'Agent') THEN s2.[NormalizedScore] END) AS DECIMAL(9,6)) AS [CriterionCohortAIMeanScore]
    FROM
        [${flyway:defaultSchema}].[RubricEvaluation] e2
    INNER JOIN
        [${flyway:defaultSchema}].[RubricVersion] v2 ON v2.[ID] = e2.[RubricVersionID]
    INNER JOIN
        [${flyway:defaultSchema}].[RubricEvaluationScore] s2 ON s2.[EvaluationID] = e2.[ID]
    INNER JOIN
        [${flyway:defaultSchema}].[RubricCriterion] c2 ON c2.[ID] = s2.[CriterionID]
    WHERE
        e2.[SubjectEntityID] = e.[SubjectEntityID]
        AND e2.[SubjectRecordID] = e.[SubjectRecordID]
        AND e2.[Status] = 'Submitted'
        AND e2.[EvaluatorType] <> 'Self'
        AND ((e2.[ContextEntityID] = e.[ContextEntityID] AND e2.[ContextRecordID] = e.[ContextRecordID])
             OR (e2.[ContextEntityID] IS NULL AND e.[ContextEntityID] IS NULL))
        AND v2.[RubricID] = rv.[RubricID]
        AND v2.[MajorVersion] = rv.[MajorVersion]
        AND c2.[Key] = c.[Key]
        AND s2.[IsNotApplicable] = 0
) cohort;
GO
