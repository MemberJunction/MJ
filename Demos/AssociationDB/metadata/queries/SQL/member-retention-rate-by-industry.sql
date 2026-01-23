WITH MemberTenure AS (
  SELECT 
    m.ID,
    m.Industry,
    m.JoinDate,
    m.LastActivityDate,
    DATEDIFF(DAY, m.JoinDate, COALESCE(m.LastActivityDate, GETDATE())) AS DaysActive,
    CASE 
      WHEN m.LastActivityDate >= DATEADD(YEAR, -1, GETDATE()) THEN 1 
      ELSE 0 
    END AS IsCurrentlyActive
  FROM [AssociationDemo].[vwMembers] m
  WHERE m.JoinDate <= DATEADD(YEAR, -5, GETDATE())
    AND m.Industry IS NOT NULL
)
SELECT 
  Industry,
  COUNT(*) AS TotalMembers,
  SUM(IsCurrentlyActive) AS ActiveMembers,
  AVG(CAST(DaysActive AS FLOAT) / 365.25) AS AvgTenureYears,
  MIN(JoinDate) AS EarliestJoinDate,
  MAX(JoinDate) AS LatestJoinDate
FROM MemberTenure
GROUP BY Industry
ORDER BY AvgTenureYears DESC