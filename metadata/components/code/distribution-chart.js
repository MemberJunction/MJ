// DistributionChart Sub-component
function DistributionChart ({ data, onDataClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Load SimpleChart from the components registry
  const SimpleChart = components['SimpleChart'];

  const handleChartClick = React.useCallback((event) => {
    if (event && onDataClick) {
      onDataClick(event);
    }
  }, [onDataClick]);

  // Memoize the chart content to prevent unnecessary re-renders
  const chartContent = React.useMemo(() => {
    if (!SimpleChart) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>
          SimpleChart component not available
        </div>
      );
    }

    // SimpleChart expects raw data array, not pre-processed chart data
    // The parent component should pass raw records instead of chart series/categories
    return (
      <SimpleChart
        key="distribution-chart"
        data={data}
        groupBy="Category"  // Adjust this field name based on actual data structure
        aggregateMethod="count"
        chartType="pie"
        title="Distribution Analysis"
        onDataPointClick={handleChartClick}
        utilities={utilities}
        styles={styles}
        components={components}
        callbacks={callbacks}
        savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
      />
    );
  }, [SimpleChart, data, handleChartClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings]);

  return (
    <div style={{ width: '100%', height: '350px' }}>
      {chartContent}
    </div>
  );
};