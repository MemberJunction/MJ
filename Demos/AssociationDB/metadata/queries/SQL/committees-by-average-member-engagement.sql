SELECT 
    c.ID,
    c.Name,
    c.CommitteeType,
    c.IsActive,
    c.Purpose,
    c.MeetingFrequency,
    COUNT(DISTINCT cm.MemberID) AS MemberCount,
    AVG(CAST(m.EngagementScore AS FLOAT)) AS AvgEngagementScore,
    MIN(m.EngagementScore) AS MinEngagementScore,
    MAX(m.EngagementScore) AS MaxEngagementScore,
    SUM(m.EngagementScore) AS TotalEngagementScore
FROM [AssociationDemo].[vwCommittees] c
INNER JOIN [AssociationDemo].[vwCommitteeMembership] cm 
    ON c.ID = cm.CommitteeID
INNER JOIN [AssociationDemo].[vwMembers] m 
    ON cm.MemberID = m.ID
WHERE c.IsActive = 1
{% if MinEngagementScore %}
    AND m.EngagementScore >= {{ MinEngagementScore | sqlNumber }}
{% endif %}
{% if CommitteeType %}
    AND c.CommitteeType = {{ CommitteeType | sqlString }}
{% endif %}
GROUP BY 
    c.ID,
    c.Name,
    c.CommitteeType,
    c.IsActive,
    c.Purpose,
    c.MeetingFrequency
HAVING COUNT(DISTINCT cm.MemberID) >= {{ MinMemberCount | sqlNumber }}
ORDER BY AvgEngagementScore DESC