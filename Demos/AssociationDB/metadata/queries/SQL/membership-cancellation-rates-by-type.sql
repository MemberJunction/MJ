-- Membership Cancellation Analysis: Identify membership types with highest cancellation rates
-- and common cancellation reasons by type

WITH MembershipStats AS (
    SELECT 
        mt.ID AS MembershipTypeID,
        mt.Name AS MembershipTypeName,
        COUNT(m.ID) AS TotalMemberships,
        SUM(CASE WHEN m.Status = 'Cancelled' THEN 1 ELSE 0 END) AS CancelledCount,
        SUM(CASE WHEN m.Status = 'Active' THEN 1 ELSE 0 END) AS ActiveCount,
        SUM(CASE WHEN m.Status = 'Lapsed' THEN 1 ELSE 0 END) AS LapsedCount
    FROM [AssociationDemo].[vwMembershipTypes] mt
    LEFT JOIN [AssociationDemo].[vwMemberships] m ON mt.ID = m.MembershipTypeID
    WHERE mt.IsActive = 1
    GROUP BY mt.ID, mt.Name
),
TopCancellationReasons AS (
    SELECT 
        m.MembershipTypeID,
        COALESCE(NULLIF(LTRIM(RTRIM(m.CancellationReason)), ''), 'No Reason Provided') AS CancellationReason,
        COUNT(*) AS ReasonCount,
        ROW_NUMBER() OVER (PARTITION BY m.MembershipTypeID ORDER BY COUNT(*) DESC) AS ReasonRank
    FROM [AssociationDemo].[vwMemberships] m
    WHERE m.Status = 'Cancelled'
    GROUP BY m.MembershipTypeID, COALESCE(NULLIF(LTRIM(RTRIM(m.CancellationReason)), ''), 'No Reason Provided')
)
SELECT 
    ms.MembershipTypeID,
    ms.MembershipTypeName,
    ms.TotalMemberships,
    ms.CancelledCount,
    ms.ActiveCount,
    ms.LapsedCount,
    tcr.CancellationReason,
    tcr.ReasonCount,
    tcr.ReasonRank
FROM MembershipStats ms
LEFT JOIN TopCancellationReasons tcr ON ms.MembershipTypeID = tcr.MembershipTypeID
    AND tcr.ReasonRank <= {{ topReasons | sqlNumber }}
WHERE ms.TotalMemberships > 0
ORDER BY 
    ms.CancelledCount DESC,
    ms.MembershipTypeName,
    tcr.ReasonRank