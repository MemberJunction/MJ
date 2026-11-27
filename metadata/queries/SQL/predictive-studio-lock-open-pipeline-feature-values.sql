-- Feature Pipelines write path: lock the open Pipeline Feature Values of one record's features for the rest of the
-- caller's transaction (PR 5 §5.2.1, D5-28, D5-40).
--
-- FeatureValueCacheService runs this through RunQuery (FeatureValueLocks.Acquire) inside the write's transaction,
-- before it decides whether a value is unchanged, closes the open row or opens a new one. The WHERE repeats
-- UQ_FeatureValue_OpenPipeline's filter predicate literally plus the identity's leading key columns, so the read
-- seeks that index and UPDLOCK + HOLDLOCK take update and key-range locks that also cover a feature with no open row
-- yet: two writers of one record's value serialise here. NOWAIT never waits: a held lock raises SQL Server error 1222
-- at once, which RunQuery reports as Success: false, and FeatureValueLocks retries with backoff for up to 30 s before
-- the record fails with FeatureValueLockTimeoutError. Taken before the Human lock, never after it.
-- INDEX([UQ_FeatureValue_OpenPipeline]) pins the read to that filtered index: without it the optimizer may seek another index that
-- leads with EntityID and FeatureName (measured on SQL Server 2022), and the key-range lock would then not cover the
-- identity's slot in the filtered index. The hint is valid because the WHERE implies the index's filter.
-- Returns one row per open row (every pipeline version). SQL Server only (D-057).
SELECT ID, FeatureName, PipelineVersion
FROM [__mj].FeatureValue WITH (UPDLOCK, HOLDLOCK, NOWAIT, INDEX([UQ_FeatureValue_OpenPipeline]))
WHERE EffectiveTo IS NULL AND Source = N'Pipeline' AND Role = N'Champion'
  AND RecordProcessID = {{ RecordProcessID | sqlString }}
  AND EntityID = {{ EntityID | sqlString }}
  AND RecordID = {{ RecordID | sqlString }}
  AND FeatureName IN {{ FeatureNames | sqlIn }}
