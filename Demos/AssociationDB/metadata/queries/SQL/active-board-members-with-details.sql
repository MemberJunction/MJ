SELECT
    bm.ID,
    bm.MemberID,
    m.FirstName,
    m.LastName,
    m.Email,
    m.Phone,
    bp.PositionTitle,
    bp.PositionOrder,
    bp.IsOfficer,
    bm.StartDate,
    bm.EndDate,
    bm.ElectionDate,
    DATEDIFF(DAY, bm.StartDate, COALESCE(bm.EndDate, GETDATE())) AS DaysInPosition
FROM [AssociationDemo].[vwBoardMembers] bm
INNER JOIN [AssociationDemo].[vwBoardPositions] bp ON bm.BoardPositionID = bp.ID
INNER JOIN [AssociationDemo].[vwMembers] m ON bm.MemberID = m.ID
WHERE bm.IsActive = 1
ORDER BY bp.PositionOrder ASC