-- Per-agent, per-rubric, per-criterion means for the two drift windows.
-- Submitted evaluations only. Self-checks are left out. Group rollups are left out.
-- The client renders AgentName, RubricName, and CriterionKey. It does not read raw score rows.
SELECT
    agent.[Name] AS AgentName,
    rubric.[Name] AS RubricName,
    criterion.[Key] AS CriterionKey,
    AVG(CASE
        WHEN evaluation.[SubmittedAt] >= {{ currentStart | sqlDate }}
         AND evaluation.[SubmittedAt] < {{ periodEnd | sqlDate }}
        THEN score.[NormalizedScore]
    END) AS CurrentMean,
    AVG(CASE
        WHEN evaluation.[SubmittedAt] >= {{ previousStart | sqlDate }}
         AND evaluation.[SubmittedAt] < {{ currentStart | sqlDate }}
        THEN score.[NormalizedScore]
    END) AS PreviousMean
FROM [__mj].[RubricEvaluationScore] score
INNER JOIN [__mj].[RubricEvaluation] evaluation ON evaluation.[ID] = score.[EvaluationID]
INNER JOIN [__mj].[RubricVersion] version ON version.[ID] = evaluation.[RubricVersionID]
INNER JOIN [__mj].[Rubric] rubric ON rubric.[ID] = version.[RubricID]
INNER JOIN [__mj].[RubricCriterion] criterion ON criterion.[ID] = score.[CriterionID]
INNER JOIN [__mj].[AIAgentRun] run ON run.[ID] = TRY_CONVERT(uniqueidentifier, evaluation.[SubjectRecordID])
INNER JOIN [__mj].[AIAgent] agent ON agent.[ID] = run.[AgentID]
WHERE evaluation.[Status] = 'Submitted'
  AND evaluation.[EvaluatorType] <> 'Self'
  AND score.[IsComputed] = 0
  AND score.[NormalizedScore] IS NOT NULL
  AND evaluation.[SubmittedAt] >= {{ previousStart | sqlDate }}
  AND evaluation.[SubmittedAt] < {{ periodEnd | sqlDate }}
GROUP BY agent.[Name], rubric.[Name], criterion.[Key]
