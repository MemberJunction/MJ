SELECT 
    c.ID AS CourseID,
    c.Title AS CourseTitle,
    c.Category,
    c.DifficultyLevel,
    COUNT(e.ID) AS TotalEnrollments,
    SUM(CASE WHEN e.Status = 'Completed' THEN 1 ELSE 0 END) AS CompletedEnrollments,
    CAST(SUM(CASE WHEN e.Status = 'Completed' THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(e.ID), 0) AS CompletionRate,
    AVG(CASE WHEN e.Status = 'Completed' THEN e.FinalScore END) AS AvgFinalScore,
    SUM(CASE WHEN e.Passed = 1 THEN 1 ELSE 0 END) AS PassedCount,
    CAST(SUM(CASE WHEN e.Passed = 1 THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(SUM(CASE WHEN e.Status = 'Completed' THEN 1 ELSE 0 END), 0) AS PassingRate,
    MIN(e.EnrollmentDate) AS FirstEnrollmentDate,
    MAX(e.CompletionDate) AS LastCompletionDate
FROM [AssociationDemo].[vwCourses] c
LEFT JOIN [AssociationDemo].[vwEnrollments] e 
    ON c.ID = e.CourseID
    {% if StartDate %}
    AND e.EnrollmentDate >= {{ StartDate | sqlDate }}
    {% endif %}
    {% if EndDate %}
    AND e.EnrollmentDate <= {{ EndDate | sqlDate }}
    {% endif %}
WHERE c.IsActive = 1
GROUP BY c.ID, c.Title, c.Category, c.DifficultyLevel
HAVING COUNT(e.ID) >= {{ MinEnrollments | sqlNumber }}
ORDER BY CompletionRate DESC, AvgFinalScore DESC