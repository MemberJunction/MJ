SELECT
    -- Award level grouping
    CASE 
        WHEN pa.AwardLevel = 'Gold' THEN 'Gold'
        WHEN pa.AwardLevel IN ('Silver', 'Bronze') THEN 'Silver/Bronze'
        ELSE 'Other'
    END AS AwardCategory,
    
    -- Aggregate statistics
    COUNT(DISTINCT ce.ID) AS EntryCount,
    AVG(ce.Score) AS AvgScore,
    MIN(ce.Score) AS MinScore,
    MAX(ce.Score) AS MaxScore,
    STDEV(ce.Score) AS StdDevScore,
    
    -- Additional context
    COUNT(DISTINCT ce.CompetitionID) AS CompetitionCount,
    COUNT(DISTINCT ce.ProductID) AS UniqueProductCount
    
FROM [AssociationDemo].[vwCompetitionEntries] ce
INNER JOIN [AssociationDemo].[vwProductAwards] pa 
    ON ce.ID = pa.CompetitionEntryID
WHERE 
    -- Only include entries with scores
    ce.Score IS NOT NULL
    -- Only include specified award levels
    AND pa.AwardLevel IN ('Gold', 'Silver', 'Bronze')
    {% if CompetitionID %}
    AND ce.CompetitionID = {{ CompetitionID | sqlString }}
    {% endif %}
    {% if MinYear %}
    AND pa.Year >= {{ MinYear | sqlNumber }}
    {% endif %}
GROUP BY 
    CASE 
        WHEN pa.AwardLevel = 'Gold' THEN 'Gold'
        WHEN pa.AwardLevel IN ('Silver', 'Bronze') THEN 'Silver/Bronze'
        ELSE 'Other'
    END
ORDER BY 
    CASE 
        WHEN CASE 
            WHEN pa.AwardLevel = 'Gold' THEN 'Gold'
            WHEN pa.AwardLevel IN ('Silver', 'Bronze') THEN 'Silver/Bronze'
            ELSE 'Other'
        END = 'Gold' THEN 1
        ELSE 2
    END