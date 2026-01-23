WITH BoardTerms AS (
  SELECT 
    bm.BoardPositionID,
    bp.PositionTitle,
    bp.PositionOrder,
    bp.TermLengthYears,
    bm.ID AS BoardMemberID,
    bm.MemberID,
    bm.StartDate,
    bm.EndDate,
    bm.ElectionDate,
    -- Calculate actual term length in years
    CASE 
      WHEN bm.EndDate IS NOT NULL 
      THEN DATEDIFF(DAY, bm.StartDate, bm.EndDate) / 365.25
      ELSE DATEDIFF(DAY, bm.StartDate, GETDATE()) / 365.25
    END AS ActualTermYears
  FROM [AssociationDemo].[vwBoardMembers] bm
  INNER JOIN [AssociationDemo].[vwBoardPositions] bp ON bm.BoardPositionID = bp.ID
  WHERE bm.StartDate >= DATEADD(YEAR, -5, GETDATE())
)
SELECT 
  bt.BoardPositionID,
  bt.PositionTitle,
  bt.PositionOrder,
  bt.TermLengthYears AS TypicalTermYears,
  COUNT(DISTINCT bt.BoardMemberID) AS TimesPositionFilled,
  COUNT(DISTINCT bt.MemberID) AS UniqueMembersInRole,
  AVG(bt.ActualTermYears) AS AvgActualTermYears,
  MIN(bt.ActualTermYears) AS MinTermYears,
  MAX(bt.ActualTermYears) AS MaxTermYears,
  MIN(bt.StartDate) AS EarliestTermStart,
  MAX(bt.StartDate) AS LatestTermStart,
  SUM(CASE WHEN bt.EndDate IS NULL THEN 1 ELSE 0 END) AS CurrentlyActive
FROM BoardTerms bt
GROUP BY 
  bt.BoardPositionID,
  bt.PositionTitle,
  bt.PositionOrder,
  bt.TermLengthYears
ORDER BY bt.PositionOrder