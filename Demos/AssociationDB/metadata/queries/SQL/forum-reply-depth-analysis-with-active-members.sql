WITH ReplyDepth AS (
  -- Base case: root posts (no parent)
  SELECT 
    fp.ID AS PostID,
    fp.ThreadID,
    fp.AuthorID,
    fp.Content,
    fp.PostedDate,
    0 AS DepthLevel,
    fp.ID AS RootPostID
  FROM [AssociationDemo].[vwForumPosts] fp
  WHERE fp.ParentPostID IS NULL
  
  UNION ALL
  
  -- Recursive case: replies to existing posts
  SELECT 
    fp.ID AS PostID,
    fp.ThreadID,
    fp.AuthorID,
    fp.Content,
    fp.PostedDate,
    rd.DepthLevel + 1 AS DepthLevel,
    rd.RootPostID
  FROM [AssociationDemo].[vwForumPosts] fp
  INNER JOIN ReplyDepth rd ON fp.ParentPostID = rd.PostID
  WHERE fp.ParentPostID IS NOT NULL
),
ThreadDepthStats AS (
  -- Calculate average depth per thread
  SELECT 
    AVG(CAST(DepthLevel AS FLOAT)) AS OverallAvgReplyDepth,
    AVG(CAST(MaxDepth AS FLOAT)) AS AvgMaxDepthPerThread,
    MAX(MaxDepth) AS GlobalMaxDepth
  FROM (
    SELECT 
      ThreadID,
      MAX(DepthLevel) AS MaxDepth
    FROM ReplyDepth
    WHERE DepthLevel > 0
    GROUP BY ThreadID
  ) ThreadMaxDepths
),
MemberDepthActivity AS (
  -- Count posts by member at each depth level
  SELECT 
    rd.AuthorID,
    rd.DepthLevel,
    COUNT(*) AS PostCount
  FROM ReplyDepth rd
  WHERE rd.DepthLevel > 0
  GROUP BY rd.AuthorID, rd.DepthLevel
)
SELECT 
  -- Overall thread depth metrics (same for all rows)
  tds.OverallAvgReplyDepth,
  tds.AvgMaxDepthPerThread,
  tds.GlobalMaxDepth,
  
  -- Most active members in nested conversations
  m.ID AS MemberID,
  m.FirstName,
  m.LastName,
  m.Email,
  SUM(mda.PostCount) AS TotalNestedReplies,
  AVG(CAST(mda.DepthLevel AS FLOAT)) AS AvgReplyDepth,
  MAX(mda.DepthLevel) AS MaxReplyDepth,
  COUNT(DISTINCT mda.DepthLevel) AS DistinctDepthLevels
FROM MemberDepthActivity mda
INNER JOIN [AssociationDemo].[vwMembers] m ON mda.AuthorID = m.ID
CROSS JOIN ThreadDepthStats tds
GROUP BY 
  m.ID, 
  m.FirstName, 
  m.LastName, 
  m.Email,
  tds.OverallAvgReplyDepth,
  tds.AvgMaxDepthPerThread,
  tds.GlobalMaxDepth
HAVING SUM(mda.PostCount) >= COALESCE({{ minNestedReplies | sqlNumber }}, 5)
ORDER BY TotalNestedReplies DESC, AvgReplyDepth DESC