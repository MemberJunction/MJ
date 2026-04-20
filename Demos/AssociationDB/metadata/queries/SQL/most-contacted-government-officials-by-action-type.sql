WITH ContactActionCounts AS (
  SELECT 
    gc.ID AS ContactID,
    gc.FirstName + ' ' + gc.LastName AS ContactName,
    gc.Title,
    gc.ContactType,
    gc.Party,
    gc.District,
    gc.LegislativeBody,
    aa.ActionType,
    COUNT(aa.ID) AS ActionCount
  FROM [AssociationDemo].[vwGovernmentContacts] gc
  INNER JOIN [AssociationDemo].[vwAdvocacyActions] aa ON gc.ID = aa.GovernmentContactID
  WHERE aa.ActionDate BETWEEN {{ startDate | sqlDate }} AND {{ endDate | sqlDate }}
    {% if ActionType %}AND aa.ActionType = {{ ActionType | sqlString }}{% endif %}
    {% if ContactType %}AND gc.ContactType = {{ ContactType | sqlString }}{% endif %}
  GROUP BY 
    gc.ID,
    gc.FirstName,
    gc.LastName,
    gc.Title,
    gc.ContactType,
    gc.Party,
    gc.District,
    gc.LegislativeBody,
    aa.ActionType
),
ContactTotals AS (
  SELECT 
    ContactID,
    ContactName,
    Title,
    ContactType,
    Party,
    District,
    LegislativeBody,
    SUM(ActionCount) AS TotalActions
  FROM ContactActionCounts
  GROUP BY 
    ContactID,
    ContactName,
    Title,
    ContactType,
    Party,
    District,
    LegislativeBody
)
SELECT TOP {{ topN | sqlNumber }}
  ct.ContactID,
  ct.ContactName,
  ct.Title,
  ct.ContactType,
  ct.Party,
  ct.District,
  ct.LegislativeBody,
  ct.TotalActions,
  cac.ActionType,
  cac.ActionCount
FROM ContactTotals ct
INNER JOIN ContactActionCounts cac ON ct.ContactID = cac.ContactID
ORDER BY ct.TotalActions DESC, ct.ContactName, cac.ActionCount DESC