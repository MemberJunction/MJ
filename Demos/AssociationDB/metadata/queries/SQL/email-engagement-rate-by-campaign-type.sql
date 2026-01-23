-- Calculate email engagement metrics (open rate and click rate) by campaign type
-- Excludes bounced emails from the calculation
-- Returns raw counts for UI layer to calculate percentages

SELECT 
    c.CampaignType,
    COUNT(es.ID) AS TotalSent,
    SUM(CASE WHEN es.DeliveredDate IS NOT NULL THEN 1 ELSE 0 END) AS DeliveredCount,
    SUM(CASE WHEN es.OpenedDate IS NOT NULL THEN 1 ELSE 0 END) AS OpenedCount,
    SUM(CASE WHEN es.ClickedDate IS NOT NULL THEN 1 ELSE 0 END) AS ClickedCount,
    SUM(CASE WHEN es.BouncedDate IS NOT NULL THEN 1 ELSE 0 END) AS BouncedCount,
    MIN(es.SentDate) AS FirstSentDate,
    MAX(es.SentDate) AS LastSentDate
FROM [AssociationDemo].[vwCampaigns] c
INNER JOIN [AssociationDemo].[vwEmailSends] es ON c.ID = es.CampaignID
WHERE es.BouncedDate IS NULL
{% if StartDate %}
    AND es.SentDate >= {{ StartDate | sqlDate }}
{% endif %}
{% if EndDate %}
    AND es.SentDate <= {{ EndDate | sqlDate }}
{% endif %}
{% if CampaignTypes %}
    AND c.CampaignType IN {{ CampaignTypes | sqlIn }}
{% endif %}
GROUP BY c.CampaignType
ORDER BY DeliveredCount DESC