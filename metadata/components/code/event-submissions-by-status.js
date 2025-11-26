function EventSubmissionsByStatus({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
  eventId,
  eventName,
  onSubmissionSelected
}) {
  const { SimpleDrilldownChart } = components;
  const [submissionData, setSubmissionData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!eventId) {
      setError('Event ID is required');
      setLoading(false);
      return;
    }

    const loadSubmissions = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await utilities.rv.RunView({
          EntityName: 'Submissions',
          ExtraFilter: `EventID = '${eventId}'`,
          ResultType: 'entity_object'
        });

        if (!result.Success) {
          setError(result.ErrorMessage || 'Failed to load submissions');
          setSubmissionData([]);
          return;
        }

        // Enhance submissions with computed fields for better display
        const enhancedSubmissions = (result.Results || []).map(submission => {
          const submittedDate = submission.SubmittedAt
            ? new Date(submission.SubmittedAt)
            : null;

          return {
            ...submission,
            // Formatted dates
            SubmittedDateFormatted: submittedDate
              ? submittedDate.toLocaleDateString()
              : 'N/A',
            SubmittedDateTimeFormatted: submittedDate
              ? submittedDate.toLocaleString()
              : 'N/A',
            // Truncated abstract for grid display
            AbstractPreview: submission.SubmissionAbstract
              ? submission.SubmissionAbstract.substring(0, 100) + '...'
              : '',
            // Score formatting
            ScoreFormatted: submission.AIEvaluationScore != null
              ? `${submission.AIEvaluationScore.toFixed(1)}/100`
              : 'Not Scored',
            // Status badge style
            StatusBadge: submission.Status || 'Unknown',
            // Days since submission
            DaysSinceSubmission: submittedDate
              ? Math.floor((new Date() - submittedDate) / (1000 * 60 * 60 * 24))
              : null
          };
        });

        setSubmissionData(enhancedSubmissions);
      } catch (err) {
        console.error('Error loading submissions:', err);
        setError(err.message || 'Unknown error occurred');
        setSubmissionData([]);
      } finally {
        setLoading(false);
      }
    };

    loadSubmissions();
  }, [eventId, utilities?.refresh]);

  // Handle submission row selection
  const handleRowSelected = (selectionData) => {
    const submission = selectionData.record;

    console.log('Submission selected:', submission.SubmissionTitle);

    // Fire external callback if provided
    if (onSubmissionSelected) {
      onSubmissionSelected(submission);
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        color: '#666'
      }}>
        <div style={{
          fontSize: '16px',
          marginBottom: '8px',
          fontWeight: 500
        }}>
          Loading submission data...
        </div>
        {eventName && (
          <div style={{ fontSize: '14px', color: '#999' }}>
            {eventName}
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#fff2f0',
        border: '1px solid #ffccc7',
        borderRadius: '4px',
        color: '#cf1322'
      }}>
        <div style={{
          fontWeight: 'bold',
          marginBottom: '8px',
          fontSize: '16px'
        }}>
          Error Loading Submissions
        </div>
        <div>{error}</div>
      </div>
    );
  }

  if (submissionData.length === 0) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        backgroundColor: '#fafafa',
        border: '1px solid #d9d9d9',
        borderRadius: '4px',
        color: '#666'
      }}>
        <div style={{
          fontSize: '18px',
          marginBottom: '8px',
          fontWeight: 500
        }}>
          No submissions yet
        </div>
        <div style={{ fontSize: '14px', color: '#999' }}>
          {eventName ? `No submissions found for ${eventName}` : 'No submissions found for this event'}
        </div>
      </div>
    );
  }

  const chartTitle = eventName
    ? `Submissions by Status - ${eventName}`
    : 'Submissions by Status';

  return (
    <SimpleDrilldownChart
      entityName="Submissions"
      data={submissionData}
      groupBy="Status"
      aggregateMethod="count"
      chartType="doughnut"
      title={chartTitle}
      gridFields={[
        'SubmissionTitle',
        'SubmittedDateFormatted',
        'SessionFormat',
        'ScoreFormatted',
        'PassedInitialScreening',
        'DaysSinceSubmission'
      ]}
      showDrilldown={true}
      drilldownHeight={500}
      showSingleRecordView={true}
      singleRecordViewFields={[
        'SubmissionTitle',
        'Status',
        'SubmittedDateTimeFormatted',
        'SubmissionAbstract',
        'SessionFormat',
        'Duration',
        'TargetAudienceLevel',
        'KeyTopics',
        'AIEvaluationScore',
        'AIEvaluationReasoning',
        'PassedInitialScreening',
        'FailureReasons',
        'IsFixable',
        'ReviewNotes',
        'FinalDecision',
        'FinalDecisionReasoning'
      ]}
      onRowSelected={handleRowSelected}
      utilities={utilities}
      styles={styles}
      components={components}
      callbacks={callbacks}
      savedUserSettings={savedUserSettings}
      onSaveUserSettings={onSaveUserSettings}
    />
  );
}
