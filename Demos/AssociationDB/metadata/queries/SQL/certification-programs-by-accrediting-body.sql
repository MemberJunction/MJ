SELECT 
  ab.Name AS AccreditingBodyName,
  ab.Abbreviation AS AccreditingBodyAbbreviation,
  ab.IsActive AS AccreditingBodyIsActive,
  ab.IsRecognized AS AccreditingBodyIsRecognized,
  ab.Country AS AccreditingBodyCountry,
  COUNT(ct.ID) AS ProgramCount,
  AVG(ct.CostUSD) AS AvgProgramCost,
  MIN(ct.CostUSD) AS MinProgramCost,
  MAX(ct.CostUSD) AS MaxProgramCost,
  SUM(ct.CostUSD) AS TotalProgramCost,
  SUM(CASE WHEN ct.IsActive = 1 THEN 1 ELSE 0 END) AS ActiveProgramCount,
  SUM(CASE WHEN ct.ExamRequired = 1 THEN 1 ELSE 0 END) AS ExamRequiredCount,
  SUM(CASE WHEN ct.PracticalRequired = 1 THEN 1 ELSE 0 END) AS PracticalRequiredCount
FROM [AssociationDemo].[vwAccreditingBodies] ab
LEFT JOIN [AssociationDemo].[vwCertificationTypes] ct ON ab.ID = ct.AccreditingBodyID
{% if IncludeActiveOnly %}
WHERE ab.IsActive = 1
{% endif %}
GROUP BY 
  ab.Name,
  ab.Abbreviation,
  ab.IsActive,
  ab.IsRecognized,
  ab.Country
HAVING COUNT(ct.ID) > 0
ORDER BY ProgramCount DESC