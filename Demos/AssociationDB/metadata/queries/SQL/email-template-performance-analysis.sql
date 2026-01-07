-- Email template performance with open rates and active status
-- Returns templates with at least minimum sends for statistical relevance
SELECT 
    et.ID,
    et.Name,
    et.Category,
    et.IsActive,
    COUNT(es.ID) AS TotalSends,
    SUM(CASE WHEN es.Status IN ('Delivered', 'Opened', 'Clicked') THEN 1 ELSE 0 END) AS DeliveredCount,
    SUM(CASE WHEN es.Status IN ('Opened', 'Clicked') THEN 1 ELSE 0 END) AS OpenedCount,
    SUM(es.OpenCount) AS TotalOpens,
    MIN(es.SentDate) AS FirstSentDate,
    MAX(es.SentDate) AS LastSentDate
FROM [AssociationDemo].[vwEmailTemplates] et
INNER JOIN [AssociationDemo].[vwEmailSends] es ON et.ID = es.TemplateID
WHERE es.SentDate >= {{ startDate | sqlDate }}
GROUP BY et.ID, et.Name, et.Category, et.IsActive
HAVING COUNT(es.ID) >= {{ minSends | sqlNumber }}
ORDER BY 
    CAST(SUM(CASE WHEN es.Status IN ('Opened', 'Clicked') THEN 1 ELSE 0 END) AS FLOAT) 
    / NULLIF(SUM(CASE WHEN es.Status IN ('Delivered', 'Opened', 'Clicked') THEN 1 ELSE 0 END), 0) DESC