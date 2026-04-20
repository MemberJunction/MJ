WITH PrerequisiteChains AS (
  -- Base case: courses with no prerequisites (root courses)
  SELECT 
    c.ID AS CourseID,
    c.Code AS CourseCode,
    c.Title AS CourseTitle,
    c.Level AS CourseLevel,
    c.DurationHours,
    c.ID AS ChainRootID,
    c.Code AS ChainRootCode,
    c.Title AS ChainRootTitle,
    0 AS ChainDepth,
    CAST(c.DurationHours AS DECIMAL(10,2)) AS TotalChainHours,
    CAST(c.Code AS NVARCHAR(MAX)) AS PrerequisitePath
  FROM [AssociationDemo].[vwCourses] c
  WHERE c.PrerequisiteCourseID IS NULL
    AND c.IsActive = 1
  
  UNION ALL
  
  -- Recursive case: courses with prerequisites
  SELECT 
    c.ID AS CourseID,
    c.Code AS CourseCode,
    c.Title AS CourseTitle,
    c.Level AS CourseLevel,
    c.DurationHours,
    pc.ChainRootID,
    pc.ChainRootCode,
    pc.ChainRootTitle,
    pc.ChainDepth + 1 AS ChainDepth,
    pc.TotalChainHours + COALESCE(c.DurationHours, 0) AS TotalChainHours,
    CAST(pc.PrerequisitePath + ' -> ' + c.Code AS NVARCHAR(MAX)) AS PrerequisitePath
  FROM [AssociationDemo].[vwCourses] c
  INNER JOIN PrerequisiteChains pc ON c.PrerequisiteCourseID = pc.CourseID
  WHERE c.IsActive = 1
),
CourseChainMetrics AS (
  SELECT 
    CourseID,
    CourseCode,
    CourseTitle,
    CourseLevel,
    ChainRootID,
    ChainRootCode,
    ChainRootTitle,
    ChainDepth,
    TotalChainHours,
    DurationHours,
    PrerequisitePath,
    CASE 
      WHEN ChainDepth = 0 THEN 'No Prerequisites'
      WHEN ChainDepth <= 1 THEN 'Short Chain (1 prereq)'
      WHEN ChainDepth <= 2 THEN 'Medium Chain (2 prereqs)'
      ELSE 'Long Chain (3+ prereqs)'
    END AS ChainCategory
  FROM PrerequisiteChains
),
EnrollmentStats AS (
  SELECT 
    e.CourseID,
    COUNT(DISTINCT e.ID) AS TotalEnrollments,
    COUNT(DISTINCT CASE WHEN e.Status = 'Completed' THEN e.ID END) AS CompletedEnrollments,
    COUNT(DISTINCT CASE WHEN e.Status = 'In Progress' THEN e.ID END) AS InProgressEnrollments,
    COUNT(DISTINCT CASE WHEN e.Status IN ('Withdrawn', 'Failed') THEN e.ID END) AS DroppedEnrollments,
    AVG(CASE WHEN e.CompletionDate IS NOT NULL AND e.EnrollmentDate IS NOT NULL 
             THEN DATEDIFF(DAY, e.EnrollmentDate, e.CompletionDate) END) AS AvgDaysToComplete
  FROM [AssociationDemo].[vwEnrollments] e
  WHERE 1=1
  {% if StartDate %}
    AND e.EnrollmentDate >= {{ StartDate | sqlDate }}
  {% endif %}
  {% if EndDate %}
    AND e.EnrollmentDate <= {{ EndDate | sqlDate }}
  {% endif %}
  GROUP BY e.CourseID
)
SELECT 
  ccm.CourseCode,
  ccm.CourseTitle,
  ccm.CourseLevel,
  ccm.ChainDepth,
  ccm.ChainCategory,
  ccm.TotalChainHours,
  ccm.DurationHours AS CourseOnlyHours,
  ccm.PrerequisitePath,
  ccm.ChainRootCode,
  ccm.ChainRootTitle,
  COALESCE(es.TotalEnrollments, 0) AS TotalEnrollments,
  COALESCE(es.CompletedEnrollments, 0) AS CompletedEnrollments,
  COALESCE(es.InProgressEnrollments, 0) AS InProgressEnrollments,
  COALESCE(es.DroppedEnrollments, 0) AS DroppedEnrollments,
  es.AvgDaysToComplete
FROM CourseChainMetrics ccm
LEFT JOIN EnrollmentStats es ON ccm.CourseID = es.CourseID
WHERE 1=1
  {% if MinChainDepth %}
  AND ccm.ChainDepth >= {{ MinChainDepth | sqlNumber }}
  {% endif %}
  {% if CourseLevel %}
  AND ccm.CourseLevel = {{ CourseLevel | sqlString }}
  {% endif %}
ORDER BY 
  ccm.TotalChainHours DESC,
  ccm.ChainDepth DESC,
  COALESCE(es.TotalEnrollments, 0) DESC
OPTION (MAXRECURSION 10)