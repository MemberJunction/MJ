-- Average judging scores by competition with entry counts and ranking
SELECT 
    c.ID AS CompetitionID,
    c.Name AS CompetitionName,
    c.Year,
    c.Location,
    COUNT(pa.ID) AS TotalEntries,
    AVG(pa.Score) AS AverageScore,
    MIN(pa.Score) AS MinScore,
    MAX(pa.Score) AS MaxScore,
    COUNT(CASE WHEN pa.Score IS NOT NULL THEN 1 END) AS ScoredEntries
FROM [AssociationDemo].[vwCompetitions] c
LEFT JOIN [AssociationDemo].[vwProductAwards] pa ON c.ID = pa.CompetitionID
WHERE pa.Score IS NOT NULL
{% if MinYear %}
    AND c.Year >= {{ MinYear | sqlNumber }}
{% endif %}
{% if MaxYear %}
    AND c.Year <= {{ MaxYear | sqlNumber }}
{% endif %}
{% if MinEntries %}
    AND c.TotalEntries >= {{ MinEntries | sqlNumber }}
{% endif %}
GROUP BY c.ID, c.Name, c.Year, c.Location
HAVING COUNT(pa.ID) > 0
ORDER BY AverageScore DESC, TotalEntries DESC