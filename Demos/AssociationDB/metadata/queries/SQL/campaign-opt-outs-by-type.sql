SELECT 
  c.CampaignType,
  COUNT(DISTINCT cm.MemberID) AS OptOutCount
FROM [AssociationDemo].[vwCampaigns] c
INNER JOIN [AssociationDemo].[vwCampaignMembers] cm 
  ON c.ID = cm.CampaignID
WHERE cm.Status = 'Opted Out'
GROUP BY c.CampaignType
ORDER BY OptOutCount DESC