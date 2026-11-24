-- Predictive Studio scoring: lock one scoring binding row for a scoring batch and read its current Status.
--
-- ScoringService runs this through RunQuery as the first statement of each writing batch's transaction and
-- stops the run when the returned Status is Withdrawn. HOLDLOCK holds a shared lock on the binding row until
-- the batch commits or rolls back, and it is a locking read even under READ_COMMITTED_SNAPSHOT, so:
--   * a withdrawal committed before the batch is always seen (never an older row version);
--   * ScoringBindings.Withdraw, whose first write updates this row's Status, waits for every batch in flight
--     to commit and then clears what those batches wrote.
-- Shared locks are compatible, so concurrent runs of one binding do not wait for each other here.
-- Returns one row when the binding exists, none otherwise. SQL Server only (D-057).
SELECT Status
FROM [__mj].MLModelScoringBinding WITH (HOLDLOCK)
WHERE ID = {{ BindingID | sqlString }}
