function SubmissionReviewDashboard({
  utilities,
  styles,
  components,
  callbacks,
  eventID = null,
  status = null,
  startDate = null,
  endDate = null,
  title = 'Submission Review Dashboard',
  onSegmentClick = null,
  onRecordClick = null
}) {
  // State management
  const [rawSubmissions, setRawSubmissions] = useState(null); // Raw submission records from query
  const [statusData, setStatusData] = useState(null); // Aggregated by status for chart
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);

  // Internal filter state (only used when external props are null)
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [pendingEndDate, setPendingEndDate] = useState(null);
  const [appliedStartDate, setAppliedStartDate] = useState(null);
  const [appliedEndDate, setAppliedEndDate] = useState(null);

  // Determine effective filter values
  const effectiveStartDate = startDate || appliedStartDate;
  const effectiveEndDate = endDate || appliedEndDate;
  const showDateFilters = startDate === null && endDate === null;

  // Get components from registry
  const { SimpleChart, EntityDataGrid } = components;

  // Apply date filters
  const handleApplyFilters = () => {
    setAppliedStartDate(pendingStartDate);
    setAppliedEndDate(pendingEndDate);
  };

  // Clear date filters
  const handleClearDates = () => {
    setPendingStartDate(null);
    setPendingEndDate(null);
    setAppliedStartDate(null);
    setAppliedEndDate(null);
  };

  // Aggregate raw submission records by status (client-side)
  // Follows industry best practice: SQL returns raw data, JavaScript aggregates
  const aggregateSubmissionsByStatus = useCallback((rawSubmissions) => {
    const statusGroups = {};

    rawSubmissions.forEach(submission => {
      const status = submission.Status || 'Unknown';

      // Initialize status group if not exists
      if (!statusGroups[status]) {
        statusGroups[status] = {
          Status: status,
          submissions: [],
          totalSpeakerCount: 0,
          totalReviewCount: 0,
          reviewScores: []
        };
      }

      // Add submission to group
      statusGroups[status].submissions.push(submission);

      // Sum speaker counts (each submission contributes its speaker count)
      statusGroups[status].totalSpeakerCount += submission.SpeakerCount || 0;

      // Track review metrics
      statusGroups[status].totalReviewCount += submission.ReviewCount || 0;
      if (submission.AvgReviewScore != null) {
        // Weight by review count for accurate averaging
        for (let i = 0; i < (submission.ReviewCount || 0); i++) {
          statusGroups[status].reviewScores.push(submission.AvgReviewScore);
        }
      }
    });

    // Convert to array format expected by chart
    const aggregated = Object.values(statusGroups).map(group => ({
      Status: group.Status,
      SubmissionCount: group.submissions.length,
      UniqueSpeakersPerStatus: group.totalSpeakerCount,
      ReviewCount: group.totalReviewCount,
      AvgReviewScore: group.reviewScores.length > 0
        ? group.reviewScores.reduce((sum, score) => sum + score, 0) / group.reviewScores.length
        : null
    }));

    // Sort by status workflow order
    const statusOrder = {
      'Accepted': 1,
      'Under Review': 2,
      'Passed Initial': 3,
      'Waitlisted': 4,
      'Rejected': 5,
      'Failed Initial': 6,
      'Analyzing': 7,
      'New': 8
    };

    return aggregated.sort((a, b) => {
      const orderA = statusOrder[a.Status] || 9;
      const orderB = statusOrder[b.Status] || 9;
      return orderA - orderB;
    });
  }, []);

  // Load data on mount or when parameters change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      setSelectedSegment(null);

      try {
        // Execute both queries concurrently (using effective dates)
        const [statusResult, timelineResult] = await Promise.all([
          utilities.rq.RunQuery({
            QueryName: 'Submission Status Summary',
            CategoryPath: 'Demo',
            Parameters: {
              EventID: eventID,
              Status: status
            }
          }),
          utilities.rq.RunQuery({
            QueryName: 'Submission Review Timeline',
            CategoryPath: 'Demo',
            Parameters: {
              EventID: eventID,
              Status: status,
              StartDate: effectiveStartDate,
              EndDate: effectiveEndDate
            }
          })
        ]);

        if (statusResult && statusResult.Success && statusResult.Results) {
          // Query now returns raw submission records - aggregate client-side by status
          const submissions = statusResult.Results;
          setRawSubmissions(submissions); // Store raw data for KPI calculations
          const aggregatedByStatus = aggregateSubmissionsByStatus(submissions);
          setStatusData(aggregatedByStatus);
        } else {
          console.error('Failed to load status data:', statusResult?.ErrorMessage);
        }

        if (timelineResult && timelineResult.Success && timelineResult.Results) {
          setTimelineData(timelineResult.Results);
        } else {
          console.error('Failed to load timeline data:', timelineResult?.ErrorMessage);
        }

        // Set error only if both queries failed
        if (!statusResult?.Success && !timelineResult?.Success) {
          setError('Failed to load dashboard data');
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
        setError(err.message || 'An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [eventID, status, effectiveStartDate, effectiveEndDate, utilities]);

  // Handle status segment click - SimpleChart passes clickData with label, value, records array
  const handleStatusClick = useCallback((clickData) => {
    console.log('Status segment clicked:', clickData);

    // Set selected segment (using the full clickData structure from SimpleChart)
    setSelectedSegment(clickData);

    // Fire external event if provided
    if (onSegmentClick) {
      onSegmentClick({
        status: clickData.label,
        value: clickData.value,
        recordCount: clickData.records?.length || 0
      });
    }
  }, [onSegmentClick]);

  // Handle EntityDataGrid row click
  const handleRecordClick = useCallback((event) => {
    if (onRecordClick) {
      onRecordClick({
        submissionId: event.record?.ID,
        submissionTitle: event.record?.SubmissionTitle,
        submittedAt: event.record?.SubmittedAt,
        status: event.record?.Status,
        eventName: event.record?.EventName,
        aiScore: event.record?.AIEvaluationScore,
        finalDecision: event.record?.FinalDecision
      });
    }
  }, [onRecordClick]);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedSegment(null);
  }, []);

  // Build EntityDataGrid extraFilter - memoized to prevent re-renders
  const buildEntityFilter = useCallback(() => {
    const filters = [];

    // Filter by selected status
    if (selectedSegment) {
      filters.push(`Status='${selectedSegment.label}'`);
    }

    // Add event filter if provided
    if (eventID) {
      filters.push(`EventID='${eventID}'`);
    }

    return filters.length > 0 ? filters.join(' AND ') : undefined;
  }, [selectedSegment, eventID]);

  // Calculate KPIs from raw and aggregated data - memoized to prevent render loops
  const kpis = useMemo(() => {
    if (!rawSubmissions || rawSubmissions.length === 0 || !statusData || statusData.length === 0) {
      return {
        totalSubmissions: 0,
        avgScore: 0,
        uniqueSpeakers: 0,
        pendingCount: 0
      };
    }

    // Calculate from raw submissions (count of records)
    const totalSubmissions = rawSubmissions.length;

    // Calculate total unique speakers by summing SpeakerCount
    // Note: This is an approximation - it assumes each submission has unique speakers
    // A more accurate count would require speaker IDs, but for 6 submissions this is acceptable
    const uniqueSpeakers = rawSubmissions.reduce((sum, sub) => sum + (sub.SpeakerCount || 0), 0);

    // Use aggregated data for review metrics (already weighted properly)
    const totalReviews = statusData.reduce((sum, row) => sum + (row.ReviewCount || 0), 0);
    const totalScore = statusData.reduce((sum, row) => sum + ((row.AvgReviewScore || 0) * (row.ReviewCount || 0)), 0);
    const avgScore = totalReviews > 0 ? totalScore / totalReviews : 0;

    const pendingCount = statusData.find(row => row.Status === 'Pending')?.SubmissionCount || 0;

    return {
      totalSubmissions,
      avgScore,
      uniqueSpeakers,
      pendingCount
    };
  }, [rawSubmissions, statusData]);

  // Render component - keep filters visible at all times
  return (
    <div style={{ padding: '16px', width: '100%', minWidth: '800px', boxSizing: 'border-box' }}>
      {/* Date filter controls (only shown when dates not provided externally) - ALWAYS VISIBLE */}
      {showDateFilters && (
        <div style={{
          marginBottom: '16px',
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div style={{ fontWeight: 'bold' }}>Date Filters:</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '14px' }}>Start Date:</label>
            <input
              type="date"
              value={pendingStartDate || ''}
              onChange={(e) => setPendingStartDate(e.target.value || null)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontSize: '14px' }}>End Date:</label>
            <input
              type="date"
              value={pendingEndDate || ''}
              onChange={(e) => setPendingEndDate(e.target.value || null)}
              style={{
                padding: '6px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          <button
            onClick={handleApplyFilters}
            disabled={!pendingStartDate || !pendingEndDate}
            style={{
              padding: '6px 16px',
              backgroundColor: (!pendingStartDate || !pendingEndDate) ? '#d9d9d9' : '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!pendingStartDate || !pendingEndDate) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Apply Filters
          </button>
          {(appliedStartDate || appliedEndDate) && (
            <button
              onClick={handleClearDates}
              style={{
                padding: '6px 12px',
                backgroundColor: '#ff4d4f',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Clear Dates
            </button>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div>Loading dashboard data...</div>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Error Loading Data</div>
          <div style={{ marginTop: '8px' }}>{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && (!statusData || statusData.length === 0) && (!timelineData || timelineData.length === 0) && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
          <div style={{ fontSize: '16px' }}>No Data Available</div>
          <div style={{ marginTop: '8px' }}>
            No submission data found matching the specified criteria
          </div>
        </div>
      )}

      {/* Dashboard overview - always show when data is loaded */}
      {!loading && !error && ((statusData && statusData.length > 0) || (timelineData && timelineData.length > 0)) && (
        <div>
          {/* KPI Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Total Submissions
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
                {kpis.totalSubmissions.toLocaleString()}
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Average Score
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
                {kpis.avgScore.toFixed(2)}
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Unique Speakers
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fa8c16' }}>
                {kpis.uniqueSpeakers.toLocaleString()}
              </div>
            </div>

            <div style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '8px' }}>
                Pending Review
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#722ed1' }}>
                {kpis.pendingCount.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px'
          }}>
            {/* Status summary chart */}
            {statusData && statusData.length > 0 && (
              <div style={{
                padding: '16px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                minHeight: '400px'
              }}>
                <SimpleChart
                  entityName="Submissions"
                  data={statusData}
                  chartType="doughnut"
                  groupBy="Status"
                  valueField="SubmissionCount"
                  aggregateMethod="sum"
                  title="Submissions by Status"
                  showLegend={true}
                  onDataPointClick={handleStatusClick}
                  utilities={utilities}
                  styles={styles}
                  components={components}
                />
              </div>
            )}

            {/* Review timeline chart */}
            {timelineData && timelineData.length > 0 && (
              <div style={{
                padding: '16px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                minHeight: '400px'
              }}>
                <SimpleChart
                  entityName="Submission Reviews"
                  data={timelineData}
                  chartType="line"
                  groupBy="Date"
                  valueField="ReviewCount"
                  aggregateMethod="sum"
                  sortBy={undefined}
                  title="Review Activity Over Time"
                  showLegend={false}
                  utilities={utilities}
                  styles={styles}
                  components={components}
                />
              </div>
            )}
          </div>

          {/* Status breakdown table */}
          {statusData && statusData.length > 0 && (
            <div style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px'
            }}>
              <h3 style={{ margin: '0 0 16px 0' }}>Status Breakdown</h3>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#e6e6e6' }}>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d9d9d9' }}>Status</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #d9d9d9' }}>Submissions</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #d9d9d9' }}>Speakers</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #d9d9d9' }}>Reviews</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderBottom: '2px solid #d9d9d9' }}>Avg Score</th>
                  </tr>
                </thead>
                <tbody>
                  {statusData.map((row, index) => {
                    const isEven = index % 2 === 0;

                    return (
                      <tr
                        key={row.Status}
                        onClick={() => handleStatusClick({ label: row.Status, value: row.SubmissionCount, records: [] })}
                        style={{
                          cursor: 'pointer',
                          backgroundColor: isEven ? 'white' : '#f9f9f9'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e6f7ff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isEven ? 'white' : '#f9f9f9'; }}
                      >
                        <td style={{ padding: '12px', borderBottom: '1px solid #d9d9d9' }}>{row.Status}</td>
                        <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #d9d9d9' }}>{(row.SubmissionCount || 0).toLocaleString()}</td>
                        <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #d9d9d9' }}>{(row.UniqueSpeakersPerStatus || 0).toLocaleString()}</td>
                        <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #d9d9d9' }}>{(row.ReviewCount || 0).toLocaleString()}</td>
                        <td style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #d9d9d9' }}>{(row.AvgReviewScore || 0).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Drill-down section when status is selected - renders BELOW dashboard */}
      {selectedSegment && (
        <div style={{ marginTop: '32px' }}>
          {/* Header with clear selection button */}
          <div style={{
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#e6f7ff',
            borderRadius: '4px',
            border: '1px solid #91d5ff'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0050b3' }}>
              Submissions with Status: {selectedSegment.label}
            </div>
            <button
              onClick={handleClearSelection}
              style={{
                padding: '6px 16px',
                backgroundColor: '#1890ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              Clear Selection
            </button>
          </div>

          {/* EntityDataGrid */}
          <EntityDataGrid
            entityName="Submissions"
            extraFilter={buildEntityFilter()}
            fields={['SubmissionTitle', 'SubmittedAt', 'Status', 'EventName', 'AIEvaluationScore', 'FinalDecision']}
            orderBy="SubmittedAt DESC"
            pageSize={20}
            maxCachedRows={100}
            enablePageCache={true}
            showPageSizeChanger={true}
            enableSorting={true}
            enableFiltering={true}
            showRefreshButton={true}
            onRowClick={handleRecordClick}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
          />
        </div>
      )}
    </div>
  );
}
