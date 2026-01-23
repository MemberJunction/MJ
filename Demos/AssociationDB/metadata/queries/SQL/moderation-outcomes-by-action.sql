SELECT
  fm.Action,
  COUNT(*) AS TotalModerated,
  COUNT(CASE WHEN fm.Action = 'Removed' THEN 1 END) AS RemovedCount,
  COUNT(CASE WHEN fm.Action = 'Dismissed' THEN 1 END) AS DismissedCount
FROM [AssociationDemo].[vwForumModerations] fm
WHERE fm.ModerationStatus NOT IN ('Pending', 'Reviewing')
  AND fm.ModeratedDate IS NOT NULL
GROUP BY fm.Action
ORDER BY TotalModerated DESC