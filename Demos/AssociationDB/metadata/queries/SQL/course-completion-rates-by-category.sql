WITH CategoryEnrollments AS (
  SELECT 
    c.Category,
    COUNT(e.ID) AS TotalEnrollments,
    SUM(CASE WHEN e.Status = 'Completed' THEN 1 ELSE 0 END) AS CompletedEnrollments,
    COUNT(DISTINCT e.MemberID) AS UniqueMembersEnrolled
  FROM [AssociationDemo].[vwCourses] c
  INNER JOIN [AssociationDemo].[vwEnrollments] e ON c.ID = e.CourseID
  WHERE c.Category IS NOT NULL
    {% if StartDate %}
    AND e.EnrollmentDate >= {{ StartDate | sqlDate }}
    {% endif %}
    {% if EndDate %}
    AND e.EnrollmentDate < {{ EndDate | sqlDate }}
    {% endif %}
  GROUP BY c.Category
)
SELECT 
  Category,
  TotalEnrollments,
  CompletedEnrollments,
  UniqueMembersEnrolled
FROM CategoryEnrollments
WHERE TotalEnrollments > 0
ORDER BY CompletedEnrollments DESC, UniqueMembersEnrolled DESC