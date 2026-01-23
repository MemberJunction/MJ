WITH HighPriorityActions AS (
  SELECT 
    aa.ID,
    aa.LegislativeIssueID,
    aa.ActionDate,
    aa.FollowUpDate,
    aa.ActionType,
    li.Title AS IssueTitle,
    li.ImpactLevel,
    li.Category,
    DATEDIFF(DAY, aa.ActionDate, aa.FollowUpDate) AS DaysToFollowUp
  FROM [AssociationDemo].[vwAdvocacyActions] aa
  INNER JOIN [AssociationDemo].[vwLegislativeIssues] li
    ON aa.LegislativeIssueID = li.ID
  WHERE aa.FollowUpRequired = 1
    AND aa.FollowUpDate IS NOT NULL
    AND li.ImpactLevel IN ('High', 'Critical')
    AND li.IsActive = 1
)
SELECT 
  COUNT(*) AS TotalActions,
  AVG(DaysToFollowUp) AS AvgDaysToFollowUp,
  MIN(DaysToFollowUp) AS MinDaysToFollowUp,
  MAX(DaysToFollowUp) AS MaxDaysToFollowUp,
  SUM(CASE WHEN DaysToFollowUp <= 7 THEN 1 ELSE 0 END) AS FollowUpsWithin1Week,
  SUM(CASE WHEN DaysToFollowUp BETWEEN 8 AND 14 THEN 1 ELSE 0 END) AS FollowUpsWithin2Weeks,
  SUM(CASE WHEN DaysToFollowUp BETWEEN 15 AND 30 THEN 1 ELSE 0 END) AS FollowUpsWithin1Month,
  SUM(CASE WHEN DaysToFollowUp > 30 THEN 1 ELSE 0 END) AS FollowUpsOver1Month
FROM HighPriorityActions