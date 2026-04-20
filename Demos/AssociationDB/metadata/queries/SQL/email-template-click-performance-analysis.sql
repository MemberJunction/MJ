-- Email Template Click Performance Analysis
-- Identifies high-performing email templates by click behavior and popular destination URLs

WITH TemplateClickStats AS (
  SELECT 
    es.TemplateID,
    es.Template,
    ec.URL,
    ec.LinkName,
    COUNT(DISTINCT ec.ID) AS ClickCount,
    COUNT(DISTINCT es.ID) AS EmailsSent,
    COUNT(DISTINCT ec.EmailSendID) AS EmailsWithClicks
  FROM [AssociationDemo].[vwEmailSends] es
  INNER JOIN [AssociationDemo].[vwEmailClicks] ec ON es.ID = ec.EmailSendID
  WHERE es.SentDate >= {{ StartDate | sqlDate }}
    AND es.SentDate < {{ EndDate | sqlDate }}
    {% if TemplateID %}
    AND es.TemplateID = {{ TemplateID | sqlString }}
    {% endif %}
  GROUP BY 
    es.TemplateID,
    es.Template,
    ec.URL,
    ec.LinkName
),
TemplateOverallStats AS (
  SELECT 
    TemplateID,
    Template,
    SUM(ClickCount) AS TotalClicks,
    SUM(EmailsSent) AS TotalEmailsSent,
    SUM(EmailsWithClicks) AS TotalEmailsWithClicks
  FROM TemplateClickStats
  GROUP BY TemplateID, Template
)
SELECT 
  tos.TemplateID,
  tos.Template,
  tos.TotalClicks,
  tos.TotalEmailsSent,
  tos.TotalEmailsWithClicks,
  tcs.URL,
  tcs.LinkName,
  tcs.ClickCount,
  tcs.EmailsWithClicks AS EmailsWithClicksForURL
FROM TemplateOverallStats tos
INNER JOIN TemplateClickStats tcs ON tos.TemplateID = tcs.TemplateID
ORDER BY 
  tos.TotalClicks DESC,
  tcs.ClickCount DESC