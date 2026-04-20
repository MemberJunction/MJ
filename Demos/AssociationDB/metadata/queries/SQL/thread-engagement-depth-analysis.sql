WITH PostHierarchy AS (
  -- Base case: Start with all posts
  SELECT 
    ID,
    ParentPostID,
    IsAcceptedAnswer,
    HelpfulCount,
    0 AS Depth
  FROM [AssociationDemo].[vwForumPosts]
  WHERE ParentPostID IS NULL
  
  UNION ALL
  
  -- Recursive case: Find child posts and increment depth
  SELECT 
    p.ID,
    p.ParentPostID,
    p.IsAcceptedAnswer,
    p.HelpfulCount,
    ph.Depth + 1 AS Depth
  FROM [AssociationDemo].[vwForumPosts] p
  INNER JOIN PostHierarchy ph ON p.ParentPostID = ph.ID
),
AcceptedAnswerPosts AS (
  SELECT 
    ID,
    Depth,
    'AcceptedAnswer' AS PostType
  FROM PostHierarchy
  WHERE IsAcceptedAnswer = 1
),
HighHelpfulPosts AS (
  SELECT 
    ID,
    Depth,
    'HighHelpful' AS PostType
  FROM PostHierarchy
  WHERE HelpfulCount >= {{ minHelpfulCount | sqlNumber }}
    AND IsAcceptedAnswer = 0
)
SELECT 
  PostType,
  COUNT(*) AS PostCount,
  AVG(CAST(Depth AS FLOAT)) AS AvgDepth,
  MIN(Depth) AS MinDepth,
  MAX(Depth) AS MaxDepth,
  SUM(CASE WHEN Depth = 0 THEN 1 ELSE 0 END) AS RootLevelCount,
  SUM(CASE WHEN Depth = 1 THEN 1 ELSE 0 END) AS FirstReplyCount,
  SUM(CASE WHEN Depth >= 2 THEN 1 ELSE 0 END) AS DeepReplyCount
FROM (
  SELECT * FROM AcceptedAnswerPosts
  UNION ALL
  SELECT * FROM HighHelpfulPosts
) AS CombinedPosts
GROUP BY PostType
ORDER BY PostType