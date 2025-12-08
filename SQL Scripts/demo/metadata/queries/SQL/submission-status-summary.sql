-- Submission Status Summary Query
-- Returns raw submission records with speaker and review counts
-- NO GROUP BY - JavaScript handles aggregation by status
-- Follows industry best practice: SQL filters, JavaScript aggregates
-- Uses JOINs with pre-aggregated subqueries for optimal performance

SELECT
  s.ID,
  s.EventID,
  s.Event,
  s.Status,
  s.SubmissionTitle,
  s.SubmittedAt,
  s.AIEvaluationScore,
  s.FinalDecision,
  COALESCE(speakers.SpeakerCount, 0) AS SpeakerCount,
  COALESCE(reviews.ReviewCount, 0) AS ReviewCount,
  reviews.AvgReviewScore
FROM Events.vwSubmissions s
LEFT JOIN (
  SELECT
    SubmissionID,
    COUNT(*) AS SpeakerCount
  FROM Events.vwSubmissionSpeakers
  GROUP BY SubmissionID
) speakers ON speakers.SubmissionID = s.ID
LEFT JOIN (
  SELECT
    SubmissionID,
    COUNT(*) AS ReviewCount,
    AVG(OverallScore) AS AvgReviewScore
  FROM Events.vwSubmissionReviews
  GROUP BY SubmissionID
) reviews ON reviews.SubmissionID = s.ID
WHERE 1=1
{% if EventID %}  AND s.EventID = {{ EventID | sqlString }}
{% endif %}{% if Status %}  AND s.Status = {{ Status | sqlString }}
{% endif %}ORDER BY s.SubmittedAt DESC
