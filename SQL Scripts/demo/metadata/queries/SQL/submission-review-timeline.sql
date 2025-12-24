-- Submission Review Timeline Query
-- Daily review activity counts for selected status with scoring trends
-- Groups reviews by date to show review velocity over time
-- Returns time-series data suitable for line chart visualization

SELECT
  CAST(sr.ReviewedAt AS DATE) AS Date,
  COUNT(*) AS ReviewCount,
  AVG(sr.OverallScore) AS AvgOverallScore,
  AVG(sr.RelevanceScore) AS AvgRelevanceScore,
  AVG(sr.QualityScore) AS AvgQualityScore,
  AVG(sr.SpeakerExperienceScore) AS AvgExperienceScore,
  COUNT(DISTINCT sr.ReviewerContactID) AS UniqueReviewers
FROM Events.vwSubmissionReviews sr
INNER JOIN Events.vwSubmissions s ON s.ID = sr.SubmissionID
WHERE 1=1
{% if EventID %}  AND s.EventID = {{ EventID | sqlString }}
{% endif %}{% if Status %}  AND s.Status = {{ Status | sqlString }}
{% endif %}{% if StartDate %}  AND sr.ReviewedAt >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND sr.ReviewedAt <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY CAST(sr.ReviewedAt AS DATE)
ORDER BY Date ASC
