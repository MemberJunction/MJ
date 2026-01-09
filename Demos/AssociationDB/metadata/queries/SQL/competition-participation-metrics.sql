SELECT 
  c.ID,
  c.Name AS CompetitionName,
  c.Year,
  c.StartDate,
  c.EndDate,
  c.Location,
  c.Status,
  COUNT(ce.ID) AS TotalEntries,
  AVG(ce.EntryFee) AS AvgEntryFee,
  SUM(ce.EntryFee) AS TotalEntryFees,
  COUNT(CASE WHEN ce.PaymentStatus = 'Paid' THEN 1 END) AS PaidEntries,
  COUNT(CASE WHEN ce.PaymentStatus = 'Unpaid' THEN 1 END) AS UnpaidEntries,
  MIN(ce.SubmittedDate) AS FirstEntryDate,
  MAX(ce.SubmittedDate) AS LastEntryDate
FROM [AssociationDemo].[vwCompetitions] c
LEFT JOIN [AssociationDemo].[vwCompetitionEntries] ce ON c.ID = ce.CompetitionID
{% if StartYear %}WHERE c.Year >= {{ StartYear | sqlNumber }}{% endif %}
{% if EndYear %}{% if StartYear %}AND{% else %}WHERE{% endif %} c.Year <= {{ EndYear | sqlNumber }}{% endif %}
{% if Status %}{% if StartYear or EndYear %}AND{% else %}WHERE{% endif %} c.Status = {{ Status | sqlString }}{% endif %}
GROUP BY 
  c.ID,
  c.Name,
  c.Year,
  c.StartDate,
  c.EndDate,
  c.Location,
  c.Status
ORDER BY TotalEntries DESC