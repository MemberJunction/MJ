-- Feature Pipelines write path: lock the open Human Feature Values of one record's features for the rest of the
-- caller's transaction (PR 5 §5.2.1, D5-28, D5-40).
--
-- FeatureValueCacheService runs this through RunQuery (FeatureValueLocks.Acquire) inside the write's transaction,
-- after the Pipeline lock and before it decides whether a person's value is unchanged, closes the open Human row or
-- opens a new one. The WHERE repeats UQ_FeatureValue_OpenHuman's filter predicate literally plus the identity's
-- leading key columns, so the read seeks that index and UPDLOCK + HOLDLOCK lock the key range even when no Human row
-- is open. A Human row is scoped by its Record Process, or — with none — by the scoring binding it overrides. NOWAIT
-- never waits: a held lock raises SQL Server error 1222 at once, which RunQuery reports as Success: false, and
-- FeatureValueLocks retries with backoff for up to 30 s before failing with FeatureValueLockTimeoutError.
-- INDEX([UQ_FeatureValue_OpenHuman]) pins the read to that filtered index: without it the optimizer may seek another index that
-- leads with EntityID and FeatureName (measured on SQL Server 2022), and the key-range lock would then not cover the
-- identity's slot in the filtered index. The hint is valid because the WHERE implies the index's filter.
-- Returns one row per open Human row. SQL Server only (D-057).
SELECT ID, FeatureName
FROM [__mj].FeatureValue WITH (UPDLOCK, HOLDLOCK, NOWAIT, INDEX([UQ_FeatureValue_OpenHuman]))
WHERE EffectiveTo IS NULL AND Source = N'Human' AND Role = N'Champion'
{% if RecordProcessID %}
  AND RecordProcessID = {{ RecordProcessID | sqlString }} AND MLModelScoringBindingID IS NULL
{% else %}
  AND RecordProcessID IS NULL AND MLModelScoringBindingID = {{ MLModelScoringBindingID | sqlString }}
{% endif %}
  AND EntityID = {{ EntityID | sqlString }}
  AND RecordID = {{ RecordID | sqlString }}
  AND FeatureName IN {{ FeatureNames | sqlIn }}
