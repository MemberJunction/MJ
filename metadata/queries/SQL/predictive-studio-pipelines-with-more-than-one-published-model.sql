-- Predictive Studio registry check, finding (a) (§5.7 R7, RegistryInvariantCheck, D-035): every pipeline with more than one
-- Published model, with the count. A backstop only: the filtered unique index UX_MLModel_OnePublishedPerPipeline makes such a
-- pipeline impossible while the index exists, so this returns rows only after the index was dropped or disabled outside the
-- migrations (a manual DDL change, a restore without it). SQL Server only (D-057).
SELECT PipelineID, COUNT(*) AS Published
FROM [__mj].MLModel
WHERE Status = 'Published'
GROUP BY PipelineID
HAVING COUNT(*) > 1
