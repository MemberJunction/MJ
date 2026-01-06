-- Query to analyze advocacy action types by usage and follow-up requirements
SELECT 
    aa.ActionType,
    COUNT(*) AS TotalActions,
    SUM(CASE WHEN aa.FollowUpRequired = 1 THEN 1 ELSE 0 END) AS ActionsRequiringFollowUp,
    COUNT(DISTINCT aa.MemberID) AS UniqueMembersInvolved,
    COUNT(DISTINCT aa.LegislativeIssueID) AS UniqueIssuesAddressed,
    MIN(aa.ActionDate) AS EarliestActionDate,
    MAX(aa.ActionDate) AS LatestActionDate
FROM [AssociationDemo].[vwAdvocacyActions] aa
WHERE aa.ActionDate >= {{ startDate | sqlDate }}
  AND aa.ActionDate <= {{ endDate | sqlDate }}
GROUP BY aa.ActionType
ORDER BY TotalActions DESC