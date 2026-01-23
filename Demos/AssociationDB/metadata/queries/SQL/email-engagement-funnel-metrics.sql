-- Calculate email engagement funnel from sent through delivered, opened, and clicked
-- Provides overall engagement rates and comparison of clicks vs opens

SELECT 
    COUNT(es.ID) AS TotalSent,
    SUM(CASE WHEN es.DeliveredDate IS NOT NULL THEN 1 ELSE 0 END) AS TotalDelivered,
    SUM(CASE WHEN es.OpenedDate IS NOT NULL THEN 1 ELSE 0 END) AS TotalOpened,
    SUM(CASE WHEN es.ClickedDate IS NOT NULL THEN 1 ELSE 0 END) AS TotalClicked,
    SUM(CASE WHEN es.OpenedDate IS NOT NULL AND es.ClickedDate IS NULL THEN 1 ELSE 0 END) AS OpenedOnly,
    SUM(CASE WHEN es.ClickedDate IS NOT NULL THEN 1 ELSE 0 END) AS OpenedAndClicked,
    SUM(COALESCE(es.OpenCount, 0)) AS TotalOpenCount,
    SUM(COALESCE(es.ClickCount, 0)) AS TotalClickCount,
    COUNT(DISTINCT ec.ID) AS UniqueClickEvents
FROM [AssociationDemo].[vwEmailSends] es
LEFT JOIN [AssociationDemo].[vwEmailClicks] ec ON es.ID = ec.EmailSendID
WHERE es.SentDate >= {{ StartDate | sqlDate }}
    AND es.SentDate < {{ EndDate | sqlDate }}
    {% if CampaignID %}
    AND es.CampaignID = {{ CampaignID | sqlString }}
    {% endif %}
    {% if TemplateID %}
    AND es.TemplateID = {{ TemplateID | sqlString }}
    {% endif %}