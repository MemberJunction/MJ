function AIModelAnalyticsDashboard({
  utilities,
  styles,
  components,
  startDate = null,
  endDate = null,
  vendorName = null,
  modelName = null,
  daysBack = 30
}) {
  // State management
  const [modelsData, setModelsData] = useState(null);
  const [costsData, setCostsData] = useState(null);
  const [trendsData, setTrendsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  // Get SimpleChart component from registry
  const { SimpleChart } = components;

  // Load all data on mount or when parameters change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setErrors({});

      try {
        // Execute all 3 queries in parallel using Promise.all for efficiency
        const [modelsResult, costsResult, trendsResult] = await Promise.all([
          utilities.rq.RunQuery({
            QueryName: 'AI Model Analytics - Models',
            CategoryPath: 'Demo',
            Parameters: {
              StartDate: startDate,
              EndDate: endDate,
              VendorName: vendorName
            }
          }),
          utilities.rq.RunQuery({
            QueryName: 'AI Model Analytics - Costs',
            CategoryPath: 'Demo',
            Parameters: {
              StartDate: startDate,
              EndDate: endDate,
              VendorName: vendorName,
              ModelName: modelName
            }
          }),
          utilities.rq.RunQuery({
            QueryName: 'AI Model Analytics - Trends',
            CategoryPath: 'Demo',
            Parameters: {
              DaysBack: daysBack,
              VendorName: vendorName,
              ModelName: null
            }
          })
        ]);

        // Handle models query result
        if (modelsResult && modelsResult.Success && modelsResult.Results) {
          setModelsData(modelsResult.Results);
        } else {
          setErrors(prev => ({
            ...prev,
            models: modelsResult?.ErrorMessage || 'Failed to load model usage data'
          }));
        }

        // Handle costs query result
        if (costsResult && costsResult.Success && costsResult.Results) {
          setCostsData(costsResult.Results);
        } else {
          setErrors(prev => ({
            ...prev,
            costs: costsResult?.ErrorMessage || 'Failed to load cost data'
          }));
        }

        // Handle trends query result
        if (trendsResult && trendsResult.Success && trendsResult.Results) {
          setTrendsData(trendsResult.Results);
        } else {
          setErrors(prev => ({
            ...prev,
            trends: trendsResult?.ErrorMessage || 'Failed to load trend data'
          }));
        }
      } catch (err) {
        console.error('Error loading AI model analytics:', err);
        setErrors({ general: err.message || 'An unexpected error occurred' });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [startDate, endDate, vendorName, modelName, daysBack, utilities]);

  // Calculate KPI metrics
  const calculateKPIs = () => {
    const kpis = {
      totalRuns: 0,
      totalCost: 0,
      avgCostPerRun: 0,
      mostUsedModel: 'N/A'
    };

    // Calculate total runs from models data
    if (modelsData && modelsData.length > 0) {
      kpis.totalRuns = modelsData.reduce((sum, row) => sum + (row.RunCount || 0), 0);

      // Find most used model
      const topModel = modelsData.reduce((max, row) =>
        (row.RunCount || 0) > (max.RunCount || 0) ? row : max
      , modelsData[0]);
      kpis.mostUsedModel = topModel.ModelName || 'N/A';
    }

    // Calculate total cost from costs data
    if (costsData && costsData.length > 0) {
      kpis.totalCost = costsData.reduce((sum, row) => sum + (row.EstimatedCostUSD || 0), 0);
    }

    // Calculate average cost per run
    if (kpis.totalRuns > 0 && kpis.totalCost > 0) {
      kpis.avgCostPerRun = kpis.totalCost / kpis.totalRuns;
    }

    return kpis;
  };

  // Loading state
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div>Loading AI model analytics...</div>
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

  // Empty state - no data at all
  if (!modelsData && !costsData && !trendsData) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
        <div style={{ fontSize: '16px' }}>No Data Available</div>
        <div style={{ marginTop: '8px' }}>
          No AI model usage data found for the specified criteria
        </div>
      </div>
    );
  }

  const kpis = calculateKPIs();

  return (
    <div style={{ padding: '16px', width: '100%', minWidth: '800px', boxSizing: 'border-box' }}>
      {/* Dashboard Title */}
      <div style={{
        fontSize: '20px',
        fontWeight: 'bold',
        marginBottom: '24px'
      }}>
        AI Model Analytics Dashboard
        {vendorName && ` - ${vendorName}`}
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{
          padding: '20px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '14px', color: '#8c8c8c', marginBottom: '8px' }}>
            Total Runs
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1890ff' }}>
            {kpis.totalRuns?.toLocaleString() ?? '0'}
          </div>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '14px', color: '#8c8c8c', marginBottom: '8px' }}>
            Total Cost
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#52c41a' }}>
            ${kpis.totalCost?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
          </div>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '14px', color: '#8c8c8c', marginBottom: '8px' }}>
            Avg Cost Per Run
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#fa8c16' }}>
            ${kpis.avgCostPerRun?.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) ?? '0.0000'}
          </div>
        </div>

        <div style={{
          padding: '20px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '14px', color: '#8c8c8c', marginBottom: '8px' }}>
            Most Used Model
          </div>
          <div style={{
            fontSize: '20px',
            fontWeight: 'bold',
            color: '#722ed1',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            paddingTop: '6px'
          }}>
            {kpis.mostUsedModel}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '24px',
        marginBottom: '24px'
      }}>
        {/* Model Usage Distribution Chart */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #e8e8e8'
        }}>
          {errors.models ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Error Loading Model Data</div>
              <div style={{ marginTop: '8px', fontSize: '12px' }}>{errors.models}</div>
            </div>
          ) : modelsData && modelsData.length > 0 ? (
            <SimpleChart
              entityName="MJ: AI Prompt Runs"
              data={modelsData}
              chartType="doughnut"
              groupBy="ModelName"
              valueField="RunCount"
              aggregateMethod="sum"
              title="Model Usage Distribution"
              showLegend={true}
              utilities={utilities}
              styles={styles}
              components={components}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
              <div style={{ fontSize: '14px' }}>No model usage data available</div>
            </div>
          )}
        </div>

        {/* Cost by Vendor Chart */}
        <div style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #e8e8e8'
        }}>
          {errors.costs ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Error Loading Cost Data</div>
              <div style={{ marginTop: '8px', fontSize: '12px' }}>{errors.costs}</div>
            </div>
          ) : costsData && costsData.length > 0 ? (
            <SimpleChart
              entityName="MJ: AI Prompt Runs"
              data={costsData}
              chartType="bar"
              groupBy="VendorName"
              valueField="EstimatedCostUSD"
              aggregateMethod="sum"
              title="Cost by Vendor"
              showLegend={false}
              utilities={utilities}
              styles={styles}
              components={components}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
              <div style={{ fontSize: '14px' }}>No cost data available</div>
            </div>
          )}
        </div>
      </div>

      {/* Usage Trends Chart - Full Width */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #e8e8e8'
      }}>
        {errors.trends ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#ff4d4f' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Error Loading Trend Data</div>
            <div style={{ marginTop: '8px', fontSize: '12px' }}>{errors.trends}</div>
          </div>
        ) : trendsData && trendsData.length > 0 ? (
          <SimpleChart
            entityName="MJ: AI Prompt Runs"
            data={trendsData}
            chartType="line"
            groupBy="Date"
            valueField="RunCount"
            aggregateMethod="sum"
            sortBy={undefined}
            title={`Usage Trends (Last ${daysBack} Days)`}
            showLegend={false}
            utilities={utilities}
            styles={styles}
            components={components}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: '#8c8c8c' }}>
            <div style={{ fontSize: '14px' }}>No trend data available</div>
          </div>
        )}
      </div>

      {/* Additional Statistics */}
      {modelsData && modelsData.length > 0 && (
        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#f9f9f9',
          borderRadius: '8px',
          border: '1px solid #e8e8e8'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 'bold',
            marginBottom: '12px',
            color: '#595959'
          }}>
            Model Performance Summary
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px'
          }}>
            <div>
              <span style={{ fontSize: '12px', color: '#8c8c8c' }}>Total Models Used: </span>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{modelsData.length}</span>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#8c8c8c' }}>Avg Success Rate: </span>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                {(modelsData.reduce((sum, row) => sum + (row.SuccessRate || 0), 0) / modelsData.length).toFixed(1)}%
              </span>
            </div>
            <div>
              <span style={{ fontSize: '12px', color: '#8c8c8c' }}>Total Failures: </span>
              <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                {modelsData.reduce((sum, row) => sum + (row.FailureCount || 0), 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
