-- Reusable query: Aggregates tag statistics across all tagged items.
-- Returns per-tag item count and average relevance weight.
-- No parameters — aggregates the full TaggedItem table.
SELECT
    ti.TagID,
    COUNT(*) AS ItemCount,
    CAST(ISNULL(AVG(CAST(ti.Weight AS FLOAT)), 0) AS DECIMAL(4,2)) AS AvgWeight
FROM
    __mj.vwTaggedItems ti
GROUP BY
    ti.TagID
