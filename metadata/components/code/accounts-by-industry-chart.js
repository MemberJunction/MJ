function AccountsByIndustryChart ({ accounts, onSliceClick, colorScheme = 'default', utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Load SimpleChart from the components registry
  const SimpleChart = components['SimpleChart'];

  const handleChartClick = React.useCallback((event) => {
    // Extract the industry from the clicked data point
    if (event && event.label) {
      onSliceClick(event.label);
    }
  }, [onSliceClick]);

  // Color scheme mapping
  const colorSchemes = {
    default: [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
      '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
    ],
    vibrant: [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#FFD93D', '#6BCB77', '#FF6B9D'
    ],
    pastel: [
      '#FFE5E5', '#E5F3FF', '#E5FFE5', '#FFF5E5', '#F5E5FF',
      '#FFE5F5', '#E5FFF5', '#FFF0E5', '#F0E5FF', '#E5F0FF'
    ]
  };

  // Memoize the colors to prevent re-creation
  const colors = React.useMemo(() => colorSchemes[colorScheme], [colorScheme]);

  // Memoize the chart to prevent unnecessary re-renders
  const chartContent = React.useMemo(() => {
    if (!SimpleChart) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>
          SimpleChart component not available
        </div>
      );
    }

    return (
      <SimpleChart
        key="industry-pie-chart"  // Add stable key
        data={accounts}
        groupBy="Industry"
        aggregateMethod="count"
        chartType="pie"
        title="Accounts by Industry"
        onDataPointClick={handleChartClick}
        legendPosition="right"  // Position legend on the right like original
        legendFontSize={12}      // Keep smaller font size for legend
        utilities={utilities}
        styles={styles}
        components={components}
        callbacks={callbacks}
        savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
        colors={colors}
      />
    );
  }, [SimpleChart, accounts, handleChartClick, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings, colors]);

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {chartContent}
    </div>
  );
}