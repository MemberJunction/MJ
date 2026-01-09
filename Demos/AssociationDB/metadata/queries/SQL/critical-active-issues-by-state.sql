-- Identify high-priority legislative matters currently tracked by state and body
SELECT 
    li.ID,
    li.Title,
    li.IssueType,
    li.BillNumber,
    li.Status,
    li.ImpactLevel,
    li.Category,
    li.IntroducedDate,
    li.LastActionDate,
    li.ImpactDescription,
    lb.Name AS LegislativeBodyName,
    lb.BodyType,
    lb.Level,
    lb.State,
    lb.Website AS BodyWebsite,
    li.TrackingURL
FROM [AssociationDemo].[vwLegislativeIssues] li
INNER JOIN [AssociationDemo].[vwLegislativeBodies] lb ON li.LegislativeBodyID = lb.ID
WHERE li.IsActive = 1
    AND li.ImpactLevel IN ('Critical', 'High')
    {% if State %}
    AND lb.State = {{ State | sqlString }}
    {% endif %}
    {% if BodyType %}
    AND lb.BodyType = {{ BodyType | sqlString }}
    {% endif %}
    {% if IssueType %}
    AND li.IssueType = {{ IssueType | sqlString }}
    {% endif %}
ORDER BY 
    CASE li.ImpactLevel 
        WHEN 'Critical' THEN 1 
        WHEN 'High' THEN 2 
    END,
    lb.State,
    lb.Name,
    li.LastActionDate DESC