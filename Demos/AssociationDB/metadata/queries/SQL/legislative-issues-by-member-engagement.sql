SELECT 
    li.ID,
    li.Title,
    li.IssueType,
    li.BillNumber,
    li.Status,
    li.ImpactLevel,
    li.Category,
    li.LegislativeBody,
    COUNT(aa.ID) AS ActionCount,
    COUNT(DISTINCT aa.MemberID) AS UniqueMembersEngaged,
    MIN(aa.ActionDate) AS FirstActionDate,
    MAX(aa.ActionDate) AS LastActionDate
FROM [AssociationDemo].[vwLegislativeIssues] li
LEFT JOIN [AssociationDemo].[vwAdvocacyActions] aa ON li.ID = aa.LegislativeIssueID
WHERE li.IsActive = 1
{% if ImpactLevel %}
    AND li.ImpactLevel = {{ ImpactLevel | sqlString }}
{% endif %}
{% if Category %}
    AND li.Category = {{ Category | sqlString }}
{% endif %}
{% if StartDate %}
    AND aa.ActionDate >= {{ StartDate | sqlDate }}
{% endif %}
{% if EndDate %}
    AND aa.ActionDate <= {{ EndDate | sqlDate }}
{% endif %}
GROUP BY 
    li.ID,
    li.Title,
    li.IssueType,
    li.BillNumber,
    li.Status,
    li.ImpactLevel,
    li.Category,
    li.LegislativeBody
HAVING COUNT(aa.ID) > 0
ORDER BY ActionCount DESC, UniqueMembersEngaged DESC