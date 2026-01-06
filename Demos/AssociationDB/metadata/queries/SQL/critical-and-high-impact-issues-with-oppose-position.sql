SELECT
  li.ID,
  li.Title,
  li.BillNumber,
  li.IssueType,
  li.Status,
  li.ImpactLevel,
  li.ImpactDescription,
  li.Category,
  li.LegislativeBody,
  li.Sponsor,
  li.IntroducedDate,
  li.LastActionDate,
  li.TrackingURL,
  pp.ID AS PolicyPositionID,
  pp.Position,
  pp.PositionStatement,
  pp.Rationale,
  pp.AdoptedDate,
  pp.AdoptedBy,
  pp.Priority AS AdvocacyPriority,
  pp.ContactPerson,
  pp.LastReviewedDate
FROM [AssociationDemo].[vwLegislativeIssues] li
INNER JOIN [AssociationDemo].[vwPolicyPositions] pp
  ON li.ID = pp.LegislativeIssueID
WHERE li.ImpactLevel IN ('Critical', 'High')
  AND pp.Position = 'Oppose'
  AND pp.IsPublic = 1
  AND li.IsActive = 1
ORDER BY
  CASE li.ImpactLevel
    WHEN 'Critical' THEN 1
    WHEN 'High' THEN 2
  END,
  li.LastActionDate DESC