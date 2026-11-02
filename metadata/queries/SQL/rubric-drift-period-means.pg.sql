-- PostgreSQL variant: per-agent, per-rubric, per-criterion means for the two drift windows.
-- Submitted evaluations only. Self-checks are left out. Group rollups are left out.
-- Mirrors rubric-drift-period-means.sql. Differences:
--   * `[__mj].[X]` / `[Column]` → `__mj."X"` / `"Column"`, since PG folds unquoted names to lower case.
--   * `RubricEvaluationScore.IsComputed` is a boolean in PG, so it is compared with false rather than 0.
--   * `TRY_CONVERT(uniqueidentifier, SubjectRecordID)` has no PG equivalent; the run is matched by its ID
--     as text against the lower-cased subject record ID, so a subject that is not a UUID matches nothing,
--     as it does on SQL Server.
SELECT
    agent."Name" AS "AgentName",
    rubric."Name" AS "RubricName",
    criterion."Key" AS "CriterionKey",
    AVG(CASE
        WHEN evaluation."SubmittedAt" >= {{ currentStart | sqlDate }}
         AND evaluation."SubmittedAt" < {{ periodEnd | sqlDate }}
        THEN score."NormalizedScore"
    END) AS "CurrentMean",
    AVG(CASE
        WHEN evaluation."SubmittedAt" >= {{ previousStart | sqlDate }}
         AND evaluation."SubmittedAt" < {{ currentStart | sqlDate }}
        THEN score."NormalizedScore"
    END) AS "PreviousMean"
FROM __mj."RubricEvaluationScore" score
INNER JOIN __mj."RubricEvaluation" evaluation ON evaluation."ID" = score."EvaluationID"
INNER JOIN __mj."RubricVersion" version ON version."ID" = evaluation."RubricVersionID"
INNER JOIN __mj."Rubric" rubric ON rubric."ID" = version."RubricID"
INNER JOIN __mj."RubricCriterion" criterion ON criterion."ID" = score."CriterionID"
INNER JOIN __mj."AIAgentRun" run ON CAST(run."ID" AS TEXT) = LOWER(evaluation."SubjectRecordID")
INNER JOIN __mj."AIAgent" agent ON agent."ID" = run."AgentID"
WHERE evaluation."Status" = 'Submitted'
  AND evaluation."EvaluatorType" <> 'Self'
  AND score."IsComputed" = false
  AND score."NormalizedScore" IS NOT NULL
  AND evaluation."SubmittedAt" >= {{ previousStart | sqlDate }}
  AND evaluation."SubmittedAt" < {{ periodEnd | sqlDate }}
GROUP BY agent."Name", rubric."Name", criterion."Key"
