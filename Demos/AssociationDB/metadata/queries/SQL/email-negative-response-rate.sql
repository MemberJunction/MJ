WITH RecentSends AS (
  SELECT 
    es.ID,
    es.MemberID,
    es.SentDate,
    es.UnsubscribedDate,
    es.SpamReportedDate
  FROM [AssociationDemo].[vwEmailSends] es
  WHERE es.SentDate >= DATEADD(DAY, -30, GETDATE())
    AND es.SentDate <= GETDATE()
)
SELECT 
  COUNT(DISTINCT rs.MemberID) AS TotalRecipients,
  COUNT(DISTINCT CASE 
    WHEN rs.UnsubscribedDate IS NOT NULL OR rs.SpamReportedDate IS NOT NULL 
    THEN rs.MemberID 
  END) AS NegativeResponseCount,
  COUNT(DISTINCT CASE WHEN rs.UnsubscribedDate IS NOT NULL THEN rs.MemberID END) AS UnsubscribedCount,
  COUNT(DISTINCT CASE WHEN rs.SpamReportedDate IS NOT NULL THEN rs.MemberID END) AS SpamReportedCount
FROM RecentSends rs