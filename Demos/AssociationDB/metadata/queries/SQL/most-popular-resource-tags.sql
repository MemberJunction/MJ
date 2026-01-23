SELECT 
  rt.TagName,
  COUNT(DISTINCT rt.ResourceID) AS ResourceCount,
  COUNT(rt.ID) AS TotalTagAssignments,
  MIN(rt.CreatedDate) AS FirstUsed,
  MAX(rt.CreatedDate) AS LastUsed
FROM [AssociationDemo].[vwResourceTags] rt
INNER JOIN [AssociationDemo].[vwResources] r ON rt.ResourceID = r.ID
WHERE r.Status = 'Published'
{% if MinResourceCount %}
HAVING COUNT(DISTINCT rt.ResourceID) >= {{ MinResourceCount | sqlNumber }}
{% endif %}
ORDER BY ResourceCount DESC, TotalTagAssignments DESC