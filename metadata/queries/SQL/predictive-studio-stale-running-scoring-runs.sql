-- Predictive Studio registry check, finding (e) (§5.7 R7): scoring runs still `running` that started before the
-- threshold (the job's StaleScoringRunHours, default 6 h); the job fails each with the reason. SQL Server only (D-057).
SELECT ID, StartedAt
FROM [__mj].MLScoringRun
WHERE Status = 'running' AND StartedAt < {{ StartedBefore | sqlDate }}
