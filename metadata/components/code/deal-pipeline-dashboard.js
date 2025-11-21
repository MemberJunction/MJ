function DealPipelineDashboard({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
  includeClosedDeals = false,
  onDealSelected
}) {
  const { SimpleDrilldownChart } = components;
  const [dealData, setDealData] = React.useState([]);
  const [dealDataWithMonth, setDealDataWithMonth] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [metrics, setMetrics] = React.useState({
    totalPipelineValue: 0,
    expectedRevenue: 0,
    averageDealSize: 0,
    dealCount: 0,
    winRate: 0
  });

  React.useEffect(() => {
    const loadDeals = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build filter based on includeClosedDeals prop
        let filter = '';
        if (!includeClosedDeals) {
          filter = "Stage NOT IN ('Closed Won', 'Closed Lost')";
        }

        const result = await utilities.rv.RunView({
          EntityName: 'Deals',
          ExtraFilter: filter
        });

        if (!result.Success) {
          setError(result.ErrorMessage || 'Failed to load deals');
          setDealData([]);
          setDealDataWithMonth([]);
          return;
        }

        const deals = result.Results || [];

        // Enhance deals with computed fields
        const enhancedDeals = deals.map(deal => {
          const closeDate = deal.CloseDate ? new Date(deal.CloseDate) : null;
          const actualCloseDate = deal.ActualCloseDate ? new Date(deal.ActualCloseDate) : null;
          const relevantDate = actualCloseDate || closeDate;

          return {
            ...deal,
            // Computed month for time-based grouping
            CloseMonth: relevantDate ? relevantDate.getMonth() + 1 : null,
            CloseMonthName: relevantDate
              ? relevantDate.toLocaleString('default', { month: 'short' })
              : 'No Date',
            CloseQuarter: relevantDate
              ? `Q${Math.ceil((relevantDate.getMonth() + 1) / 3)} ${relevantDate.getFullYear()}`
              : 'No Date',
            // Formatted dates for display
            CloseDateFormatted: closeDate
              ? closeDate.toLocaleDateString()
              : 'Not Set',
            // Days in pipeline
            DaysInPipeline: deal.__mj_CreatedAt
              ? Math.floor((new Date() - new Date(deal.__mj_CreatedAt)) / (1000 * 60 * 60 * 24))
              : null,
            // Amount formatting
            AmountFormatted: deal.Amount != null
              ? `$${deal.Amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : 'N/A',
            ExpectedRevenueFormatted: deal.ExpectedRevenue != null
              ? `$${deal.ExpectedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : 'N/A',
            // Safe defaults
            DealSource: deal.DealSource || 'Unknown',
            Stage: deal.Stage || 'Unknown'
          };
        });

        setDealData(enhancedDeals);

        // Filter deals with close dates for monthly revenue chart
        const dealsWithDates = enhancedDeals.filter(d => d.CloseMonth != null);
        setDealDataWithMonth(dealsWithDates);

        // Calculate summary metrics
        const totalValue = enhancedDeals.reduce((sum, d) => sum + (d.Amount || 0), 0);
        const totalExpected = enhancedDeals.reduce((sum, d) => sum + (d.ExpectedRevenue || 0), 0);
        const avgSize = enhancedDeals.length > 0 ? totalValue / enhancedDeals.length : 0;

        // Calculate win rate (if closed deals included)
        let winRate = 0;
        if (includeClosedDeals) {
          const closedWon = enhancedDeals.filter(d => d.Stage === 'Closed Won').length;
          const totalClosed = enhancedDeals.filter(d =>
            d.Stage === 'Closed Won' || d.Stage === 'Closed Lost'
          ).length;
          winRate = totalClosed > 0 ? (closedWon / totalClosed * 100) : 0;
        }

        setMetrics({
          totalPipelineValue: totalValue,
          expectedRevenue: totalExpected,
          averageDealSize: avgSize,
          dealCount: enhancedDeals.length,
          winRate
        });

      } catch (err) {
        console.error('Error loading deals:', err);
        setError(err.message || 'Unknown error occurred');
        setDealData([]);
        setDealDataWithMonth([]);
      } finally {
        setLoading(false);
      }
    };

    loadDeals();
  }, [includeClosedDeals, utilities?.refresh]);

  // Shared row selection handler
  const createRowSelectionHandler = (chartName) => {
    return (selectionData) => {
      const deal = selectionData.record;

      console.log(`Deal selected from ${chartName}:`, deal.Name);

      if (onDealSelected) {
        onDealSelected({
          deal,
          sourceChart: chartName
        });
      }
    };
  };

  if (loading) {
    return (
      <div style={{
        padding: '60px',
        textAlign: 'center',
        color: '#666',
        backgroundColor: '#fafafa',
        borderRadius: '8px'
      }}>
        <div style={{
          fontSize: '20px',
          marginBottom: '12px',
          fontWeight: 600
        }}>
          Loading Pipeline Data...
        </div>
        <div style={{ fontSize: '14px', color: '#999' }}>
          Analyzing sales pipeline and calculating metrics
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '30px',
        backgroundColor: '#fff2f0',
        border: '2px solid #ffccc7',
        borderRadius: '8px',
        color: '#cf1322'
      }}>
        <div style={{
          fontWeight: 'bold',
          marginBottom: '12px',
          fontSize: '18px'
        }}>
          Error Loading Pipeline Data
        </div>
        <div style={{ fontSize: '14px' }}>{error}</div>
      </div>
    );
  }

  if (dealData.length === 0) {
    return (
      <div style={{
        padding: '60px',
        textAlign: 'center',
        backgroundColor: '#fafafa',
        border: '1px solid #d9d9d9',
        borderRadius: '8px',
        color: '#666'
      }}>
        <div style={{
          fontSize: '20px',
          marginBottom: '12px',
          fontWeight: 600
        }}>
          No Deals Found
        </div>
        <div style={{ fontSize: '14px', color: '#999' }}>
          {includeClosedDeals
            ? 'No deals in the system'
            : 'No open deals in the pipeline'}
        </div>
      </div>
    );
  }

  const dashboardTitle = includeClosedDeals
    ? 'Complete Deal Pipeline'
    : 'Active Deal Pipeline';

  return (
    <div style={{ width: '100%' }}>
      {/* Dashboard Header */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: '#f0f5ff',
        border: '1px solid #adc6ff',
        borderRadius: '8px'
      }}>
        <h2 style={{
          margin: '0 0 16px 0',
          fontSize: '24px',
          color: '#001529',
          fontWeight: 600
        }}>
          {dashboardTitle}
        </h2>

        {/* Summary Metrics */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px'
        }}>
          <div style={{
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '4px',
            border: '1px solid #d9d9d9'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              Total Pipeline Value
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1890ff' }}>
              ${metrics.totalPipelineValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '4px',
            border: '1px solid #d9d9d9'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              Expected Revenue
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#52c41a' }}>
              ${metrics.expectedRevenue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '4px',
            border: '1px solid #d9d9d9'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              Average Deal Size
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#722ed1' }}>
              ${metrics.averageDealSize.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: 'white',
            borderRadius: '4px',
            border: '1px solid #d9d9d9'
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
              {includeClosedDeals ? 'Win Rate' : 'Deal Count'}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fa8c16' }}>
              {includeClosedDeals
                ? `${metrics.winRate.toFixed(1)}%`
                : metrics.dealCount}
            </div>
          </div>
        </div>
      </div>

      {/* Chart 1: Deals by Stage */}
      <div style={{ marginBottom: '32px' }}>
        <SimpleDrilldownChart
          entityName="Deals"
          data={dealData}
          groupBy="Stage"
          aggregateMethod="count"
          chartType="bar"
          title="Deals by Pipeline Stage"
          gridFields={[
            'Name',
            'Account',
            'Stage',
            'AmountFormatted',
            'Probability',
            'ExpectedRevenueFormatted',
            'CloseDateFormatted',
            'DaysInPipeline'
          ]}
          entityPrimaryKeys={['ID']}
          showDrilldown={true}
          drilldownHeight={400}
          showSingleRecordView={false}
          onRowSelected={createRowSelectionHandler('Pipeline Stage')}
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
          savedUserSettings={savedUserSettings}
          onSaveUserSettings={onSaveUserSettings}
        />
      </div>

      {/* Chart 2: Deals by Source */}
      <div style={{ marginBottom: '32px' }}>
        <SimpleDrilldownChart
          entityName="Deals"
          data={dealData}
          groupBy="DealSource"
          aggregateMethod="count"
          chartType="pie"
          title="Deals by Source"
          gridFields={[
            'Name',
            'Account',
            'DealSource',
            'AmountFormatted',
            'Stage',
            'CloseDateFormatted',
            'NextStep'
          ]}
          entityPrimaryKeys={['ID']}
          showDrilldown={true}
          drilldownHeight={400}
          showSingleRecordView={false}
          onRowSelected={createRowSelectionHandler('Deal Source')}
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
          savedUserSettings={savedUserSettings}
          onSaveUserSettings={onSaveUserSettings}
        />
      </div>

      {/* Chart 3: Expected Revenue by Month */}
      {dealDataWithMonth.length > 0 ? (
        <div style={{ marginBottom: '32px' }}>
          <SimpleDrilldownChart
            entityName="Deals"
            data={dealDataWithMonth}
            groupBy="CloseMonthName"
            valueField="ExpectedRevenue"
            aggregateMethod="sum"
            chartType="line"
            title="Expected Revenue by Close Month"
            gridFields={[
              'Name',
              'Account',
              'CloseMonthName',
              'CloseDateFormatted',
              'AmountFormatted',
              'Probability',
              'ExpectedRevenueFormatted',
              'Stage'
            ]}
            entityPrimaryKeys={['ID']}
            showDrilldown={true}
            drilldownHeight={400}
            showSingleRecordView={false}
            onRowSelected={createRowSelectionHandler('Expected Revenue')}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings}
            onSaveUserSettings={onSaveUserSettings}
          />
        </div>
      ) : (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: '#fafafa',
          border: '1px solid #d9d9d9',
          borderRadius: '8px',
          color: '#666'
        }}>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>
            No Close Dates Set
          </div>
          <div style={{ fontSize: '14px', color: '#999' }}>
            Expected Revenue by Month chart requires deals with close dates
          </div>
        </div>
      )}
    </div>
  );
}
