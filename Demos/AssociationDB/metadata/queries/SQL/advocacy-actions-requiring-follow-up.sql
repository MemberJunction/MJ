-- Count and list advocacy actions requiring follow-up in the next 30 days with government contact details
SELECT 
    aa.ID AS ActionID,
    aa.ActionDate,
    aa.ActionType,
    aa.FollowUpDate,
    DATEDIFF(DAY, GETDATE(), aa.FollowUpDate) AS DaysUntilFollowUp,
    aa.Description AS ActionDescription,
    aa.Outcome,
    gc.ID AS ContactID,
    gc.FirstName + ' ' + gc.LastName AS ContactName,
    gc.Title AS ContactTitle,
    gc.ContactType,
    gc.Party,
    gc.District,
    gc.Email AS ContactEmail,
    gc.Phone AS ContactPhone,
    gc.LegislativeBody,
    COUNT(*) OVER (PARTITION BY gc.ID) AS ActionsForThisContact
FROM [AssociationDemo].[vwAdvocacyActions] aa
INNER JOIN [AssociationDemo].[vwGovernmentContacts] gc 
    ON aa.GovernmentContactID = gc.ID
WHERE aa.FollowUpRequired = 1
    AND aa.FollowUpDate >= CAST(GETDATE() AS DATE)
    AND aa.FollowUpDate <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))
ORDER BY aa.FollowUpDate ASC, gc.LastName, gc.FirstName