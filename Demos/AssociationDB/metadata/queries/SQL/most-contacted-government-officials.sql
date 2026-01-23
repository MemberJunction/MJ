SELECT 
  gc.ID,
  gc.FirstName,
  gc.LastName,
  gc.Title,
  gc.ContactType,
  gc.Party,
  gc.District,
  gc.Committee,
  gc.Email,
  gc.Phone,
  gc.LegislativeBody,
  lb.Name AS LegislativeBodyName,
  lb.BodyType,
  lb.Level,
  lb.State AS BodyState,
  COUNT(aa.ID) AS TotalActions,
  MIN(aa.ActionDate) AS FirstContactDate,
  MAX(aa.ActionDate) AS LastContactDate
FROM [AssociationDemo].[vwGovernmentContacts] gc
LEFT JOIN [AssociationDemo].[vwLegislativeBodies] lb ON gc.LegislativeBodyID = lb.ID
LEFT JOIN [AssociationDemo].[vwAdvocacyActions] aa ON gc.ID = aa.GovernmentContactID
WHERE gc.IsActive = 1
  {% if MinActions %}AND (SELECT COUNT(*) FROM [AssociationDemo].[vwAdvocacyActions] WHERE GovernmentContactID = gc.ID) >= {{ MinActions | sqlNumber }}{% endif %}
  {% if BodyType %}AND lb.BodyType = {{ BodyType | sqlString }}{% endif %}
  {% if Level %}AND lb.Level = {{ Level | sqlString }}{% endif %}
  {% if State %}AND lb.State = {{ State | sqlString }}{% endif %}
  {% if StartDate %}AND aa.ActionDate >= {{ StartDate | sqlDate }}{% endif %}
  {% if EndDate %}AND aa.ActionDate <= {{ EndDate | sqlDate }}{% endif %}
GROUP BY 
  gc.ID,
  gc.FirstName,
  gc.LastName,
  gc.Title,
  gc.ContactType,
  gc.Party,
  gc.District,
  gc.Committee,
  gc.Email,
  gc.Phone,
  gc.LegislativeBody,
  lb.Name,
  lb.BodyType,
  lb.Level,
  lb.State
ORDER BY TotalActions DESC