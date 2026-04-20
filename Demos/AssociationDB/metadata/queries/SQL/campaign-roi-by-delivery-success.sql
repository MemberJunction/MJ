SELECT
    c.ID AS CampaignID,
    c.Name AS CampaignName,
    c.CampaignType,
    c.Status,
    c.StartDate,
    c.EndDate,
    c.ActualCost,
    COUNT(es.ID) AS TotalEmailsSent,
    SUM(CASE WHEN es.DeliveredDate IS NOT NULL THEN 1 ELSE 0 END) AS EmailsDelivered,
    CASE 
        WHEN SUM(CASE WHEN es.DeliveredDate IS NOT NULL THEN 1 ELSE 0 END) > 0 
        THEN c.ActualCost / CAST(SUM(CASE WHEN es.DeliveredDate IS NOT NULL THEN 1 ELSE 0 END) AS DECIMAL(12,2))
        ELSE NULL 
    END AS CostPerDelivery
FROM [AssociationDemo].[vwCampaigns] c
LEFT JOIN [AssociationDemo].[vwEmailSends] es ON c.ID = es.CampaignID
WHERE c.Status IN ('Active', 'Completed')
    AND c.ActualCost IS NOT NULL
GROUP BY 
    c.ID,
    c.Name,
    c.CampaignType,
    c.Status,
    c.StartDate,
    c.EndDate,
    c.ActualCost
ORDER BY CostPerDelivery ASC