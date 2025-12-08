function DealPipelineVisualization({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
  onStageClick = null,
  onDealClick = null
}) {
  // Configuration state (internal, not props)
  const [stage, setStage] = useState(null);
  const [accountType, setAccountType] = useState(null);
  const [minAmount, setMinAmount] = useState(null);
  const [monthsBack, setMonthsBack] = useState(6);
  const [chartType, setChartType] = useState('bar');

  // Date filter state (pending/applied pattern)
  const [pendingStartDate, setPendingStartDate] = useState(null);
  const [pendingEndDate, setPendingEndDate] = useState(null);
  const [appliedStartDate, setAppliedStartDate] = useState(null);
  const [appliedEndDate, setAppliedEndDate] = useState(null);

  // State management
  const [pipelineData, setPipelineData] = useState([]);
  const [velocityData, setVelocityData] = useState([]);
  const [trendsData, setTrendsData] = useState([]);
  const [dealsData, setDealsData] = useState([]);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Get components from registry
  const { SimpleChart, DataGrid } = components;

  // Helper function: Sort pipeline stages by natural progression order
  // SQL now returns alphabetical order, JavaScript handles business logic sorting
  const sortPipelineStages = useCallback((stages) => {
    const stageOrder = {
      'Prospecting': 1,
      'Qualification': 2,
      'Proposal': 3,
      'Negotiation': 4,
      'Closed Won': 5,
      'Closed Lost': 6
    };

    return [...stages].sort((a, b) => {
      const orderA = stageOrder[a.Stage] || 999;
      const orderB = stageOrder[b.Stage] || 999;
      return orderA - orderB;
    });
  }, []);

  // Load pipeline and velocity queries on mount or parameter change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setErrors({});

      try {
        // Execute pipeline and velocity queries in parallel
        const [pipelineResult, velocityResult] = await Promise.all([
          utilities.rq.RunQuery({
            QueryName: 'Deal Pipeline Distribution',
            CategoryPath: 'Demo',
            Parameters: {
              Stage: stage,
              AccountType: accountType,
              MinAmount: minAmount,
              StartDate: appliedStartDate,
              EndDate: appliedEndDate
            }
          }),
          utilities.rq.RunQuery({
            QueryName: 'Deal Velocity Analysis',
            CategoryPath: 'Demo',
            Parameters: {
              MonthsBack: monthsBack,
              Stage: stage,
              AccountType: accountType,
              StartDate: appliedStartDate,
              EndDate: appliedEndDate
            }
          })
        ]);

        // Process pipeline distribution result
        if (pipelineResult && pipelineResult.Success && pipelineResult.Results) {
          // Sort stages by pipeline progression (Prospecting → Qualification → ... → Closed Won/Lost)
          const sortedStages = sortPipelineStages(pipelineResult.Results);
          setPipelineData(sortedStages);
        } else {
          setErrors(prev => ({ ...prev, pipeline: pipelineResult?.ErrorMessage || 'Failed to load pipeline data' }));
        }

        // Process velocity analysis result
        if (velocityResult && velocityResult.Success && velocityResult.Results) {
          setVelocityData(velocityResult.Results);
        } else {
          setErrors(prev => ({ ...prev, velocity: velocityResult?.ErrorMessage || 'Failed to load velocity data' }));
        }

      } catch (err) {
        console.error('Error loading deal pipeline data:', err);
        setErrors({ general: err.message || 'An unexpected error occurred' });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [stage, accountType, minAmount, monthsBack, appliedStartDate, appliedEndDate, utilities]);

  // Load trends query only when a segment is clicked (conditional query)
  useEffect(() => {
    if (!selectedSegment) {
      setTrendsData([]);
      return;
    }

    const loadTrends = async () => {
      try {
        const trendsResult = await utilities.rq.RunQuery({
          QueryName: 'Deal Stage Trends',
          CategoryPath: 'Demo',
          Parameters: {
            Stage: selectedSegment.label,
            AccountType: accountType,
            MinAmount: minAmount,
            StartDate: appliedStartDate,
            EndDate: appliedEndDate
          }
        });

        if (trendsResult && trendsResult.Success && trendsResult.Results) {
          setTrendsData(trendsResult.Results);
        } else {
          setErrors(prev => ({ ...prev, trends: trendsResult?.ErrorMessage || 'Failed to load trends data' }));
        }
      } catch (err) {
        console.error('Error loading deal stage trends:', err);
        setErrors(prev => ({ ...prev, trends: err.message || 'Failed to load trends data' }));
      }
    };

    loadTrends();
  }, [selectedSegment, accountType, minAmount, appliedStartDate, appliedEndDate, utilities]);

  // Load deal details when a segment is selected (query pair pattern)
  useEffect(() => {
    if (!selectedSegment) {
      setDealsData([]);
      return;
    }

    const loadDeals = async () => {
      setDealsLoading(true);
      try {
        const dealsResult = await utilities.rq.RunQuery({
          QueryName: 'Deal Pipeline Details',
          CategoryPath: 'Demo',
          Parameters: {
            Stage: selectedSegment.label,
            AccountType: accountType,
            MinAmount: minAmount,
            StartDate: appliedStartDate,
            EndDate: appliedEndDate
          }
        });

        if (dealsResult && dealsResult.Success && dealsResult.Results) {
          setDealsData(dealsResult.Results);
        } else {
          setErrors(prev => ({ ...prev, deals: dealsResult?.ErrorMessage || 'Failed to load deal details' }));
        }
      } catch (err) {
        console.error('Error loading deal details:', err);
        setErrors(prev => ({ ...prev, deals: err.message || 'Failed to load deal details' }));
      } finally {
        setDealsLoading(false);
      }
    };

    loadDeals();
  }, [selectedSegment, accountType, minAmount, appliedStartDate, appliedEndDate, utilities]);

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

  // Handle stage click - drill down to deals in that stage
  const handleStageClick = (clickData) => {
    console.log('Stage clicked:', clickData);

    // Set selected segment
    setSelectedSegment(clickData);

    // Fire external event if provided
    if (onStageClick) {
      onStageClick({
        stage: clickData.label,
        dealCount: clickData.records?.length || 0,
        totalValue: clickData.value
      });
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedSegment(null);
    setDealsData([]);
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div>Loading deal pipeline data...</div>
      </div>
    );
  }

  // General error state
  if (errors.general) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Error Loading Data</div>
        <div style={{ marginTop: '8px' }}>{errors.general}</div>
      </div>
    );
  }

  // Check if all queries failed
  const allFailed = errors.pipeline && errors.velocity && errors.trends;
  if (allFailed) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Error Loading Data</div>
        <div style={{ marginTop: '8px' }}>All data queries failed to load</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', width: '100%', minWidth: '800px', boxSizing: 'border-box' }}>
      <h2 style={{ marginBottom: '24px', fontSize: '20px', fontWeight: 'bold' }}>
        Deal Pipeline Visualization
      </h2>

      {/* Date Filters */}
      <div style={{
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        padding: '16px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        marginBottom: '24px'
      }}>
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

      {/* Pipeline Distribution Chart */}
      {!errors.pipeline && pipelineData.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
            Pipeline Distribution by Stage
          </h3>
          <SimpleChart
            entityName="Deals"
            data={pipelineData}
            chartType={chartType}
            groupBy="Stage"
            valueField="TotalValue"
            aggregateMethod="sum"
            onDataPointClick={handleStageClick}
            title=""
            showLegend={false}
            height="300px"
            utilities={utilities}
            styles={styles}
            components={components}
          />
        </div>
      )}
      {errors.pipeline && (
        <div style={{
          marginBottom: '32px',
          padding: '16px',
          backgroundColor: '#fff2e8',
          border: '1px solid #ffbb96',
          borderRadius: '4px',
          color: '#d4380d'
        }}>
          Pipeline Distribution Error: {errors.pipeline}
        </div>
      )}

      {/* Deal Velocity Chart */}
      {!errors.velocity && velocityData.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
            Deal Velocity by Stage
          </h3>
          <SimpleChart
            entityName="Deals"
            data={velocityData}
            chartType={chartType}
            groupBy="Stage"
            valueField="AvgDaysToClose"
            aggregateMethod="sum"
            title=""
            showLegend={false}
            height="300px"
            utilities={utilities}
            styles={styles}
            components={components}
          />
        </div>
      )}
      {errors.velocity && (
        <div style={{
          marginBottom: '32px',
          padding: '16px',
          backgroundColor: '#fff2e8',
          border: '1px solid #ffbb96',
          borderRadius: '4px',
          color: '#d4380d'
        }}>
          Velocity Analysis Error: {errors.velocity}
        </div>
      )}

      {/* Deal Entry Trends Chart - Only shown when segment is clicked */}
      {selectedSegment && !errors.trends && trendsData.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
            {selectedSegment.label} Stage - Deal Open Date Distribution (Weekly)
          </h3>
          <SimpleChart
            entityName="Deals"
            data={trendsData}
            chartType="line"
            groupBy="Date"
            valueField="DealsEntered"
            aggregateMethod="sum"
            sortBy={undefined}
            title=""
            showLegend={false}
            height="300px"
            utilities={utilities}
            styles={styles}
            components={components}
          />
        </div>
      )}
      {selectedSegment && errors.trends && (
        <div style={{
          marginBottom: '32px',
          padding: '16px',
          backgroundColor: '#fff2e8',
          border: '1px solid #ffbb96',
          borderRadius: '4px',
          color: '#d4380d'
        }}>
          Trends Analysis Error: {errors.trends}
        </div>
      )}

      {/* Stage Details Section - Drill-down */}
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
              Deals in {selectedSegment.label} Stage
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

          {/* Deals Loading State */}
          {dealsLoading && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div>Loading deal details...</div>
            </div>
          )}

          {/* Deals Error State */}
          {errors.deals && !dealsLoading && (
            <div style={{
              marginBottom: '16px',
              padding: '16px',
              backgroundColor: '#fff2e8',
              border: '1px solid #ffbb96',
              borderRadius: '4px',
              color: '#d4380d'
            }}>
              Deal Details Error: {errors.deals}
            </div>
          )}

          {/* DataGrid */}
          {!dealsLoading && !errors.deals && dealsData && dealsData.length > 0 && (
            <DataGrid
              entityName="Deals"
              entityPrimaryKeys={['ID']}
              data={dealsData}
              columns={[
                { field: 'DealName', header: 'Deal Name', sortable: true },
                { field: 'Stage', header: 'Stage', sortable: true },
                {
                  field: 'Amount',
                  header: 'Amount',
                  sortable: true,
                  render: (value) => {
                    return value != null ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
                  }
                },
                {
                  field: 'Probability',
                  header: 'Probability',
                  sortable: true,
                  render: (value) => {
                    return value != null ? `${Number(value).toFixed(0)}%` : '0%';
                  }
                },
                { field: 'ExpectedCloseDate', header: 'Expected Close', sortable: true },
                { field: 'Account', header: 'Account', sortable: true },
                { field: 'Owner', header: 'Owner', sortable: true },
                {
                  field: 'DaysInStage',
                  header: 'Days in Stage',
                  sortable: true,
                  render: (value) => {
                    return value != null ? Number(value).toLocaleString() : '0';
                  }
                }
              ]}
              sorting={true}
              paging={true}
              pageSize={20}
              showPageSizeChanger={true}
              filtering={true}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
            />
          )}

          {/* Empty State */}
          {!dealsLoading && !errors.deals && (!dealsData || dealsData.length === 0) && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
              <div style={{ fontSize: '14px' }}>No deals found in {selectedSegment.label} stage</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
