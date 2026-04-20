-- Campaign effectiveness analysis showing conversion rates and ROI for completed campaigns
SELECT 
    c.ID AS CampaignID,
    c.Name AS CampaignName,
    c.CampaignType,
    c.StartDate,
    c.EndDate,
    c.Budget,
    c.ActualCost,
    COUNT(cm.ID) AS TotalTargeted,
    SUM(CASE WHEN cm.Status = 'Converted' THEN 1 ELSE 0 END) AS TotalConverted,
    SUM(COALESCE(cm.ConversionValue, 0)) AS TotalConversionValue,
    -- Conversion rate calculation (percentage of targeted members who converted)
    CASE 
        WHEN COUNT(cm.ID) = 0 THEN 0
        ELSE CAST(SUM(CASE WHEN cm.Status = 'Converted' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(cm.ID) * 100
    END AS ConversionRate,
    -- ROI calculation (total conversion value minus actual cost, divided by actual cost)
    CASE 
        WHEN COALESCE(c.ActualCost, 0) = 0 THEN NULL
        ELSE (SUM(COALESCE(cm.ConversionValue, 0)) - c.ActualCost) / c.ActualCost * 100
    END AS ROIPercentage
FROM 
    [AssociationDemo].[vwCampaigns] c
    INNER JOIN [AssociationDemo].[vwCampaignMembers] cm ON c.ID = cm.CampaignID
WHERE 
    c.Status = 'Completed'
GROUP BY 
    c.ID, 
    c.Name, 
    c.CampaignType,
    c.StartDate,
    c.EndDate,
    c.Budget,
    c.ActualCost
ORDER BY 
    ConversionRate DESC,
    ROIPercentage DESC