// ImprovementInsights component using AIInsightsPanel
function ImprovementInsights({ insights, loading, error, onGenerate, metrics, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // Load AIInsightsPanel from component registry
  const { AIInsightsPanel } = components;

  // Convert legacy data format to insights string if needed
  const formatInsights = (insightsData) => {
    if (typeof insightsData === 'string') {
      return insightsData;
    }

    // Convert structured data to markdown format
    if (insightsData && typeof insightsData === 'object') {
      let markdownContent = '# Improvement Insights\n\n';

      if (Array.isArray(insightsData)) {
        insightsData.forEach((insight, index) => {
          markdownContent += `## ${insight.title || `Insight ${index + 1}`}\n\n`;
          markdownContent += `**Priority:** ${insight.priority || 'medium'}\n\n`;
          markdownContent += `${insight.description || ''}\n\n`;

          if (insight.actions && insight.actions.length > 0) {
            markdownContent += '### Recommended Actions:\n';
            insight.actions.forEach(action => {
              markdownContent += `- ${action}\n`;
            });
            markdownContent += '\n';
          }

          if (insight.impact) {
            markdownContent += `**Expected Impact:** ${insight.impact}\n\n`;
          }
        });
      } else {
        // Handle single insight object
        Object.entries(insightsData).forEach(([key, value]) => {
          markdownContent += `**${key}:** ${value}\n\n`;
        });
      }

      if (metrics) {
        markdownContent += '## Performance Metrics\n\n';
        markdownContent += `- **Current Performance:** ${metrics.currentPerformance || 'N/A'}\n`;
        markdownContent += `- **Target Performance:** ${metrics.targetPerformance || 'N/A'}\n`;
        markdownContent += `- **Improvement Potential:** ${metrics.improvementPotential || 'N/A'}\n`;
      }

      return markdownContent;
    }

    return 'No insights available';
  };

  // If AIInsightsPanel is not available, show fallback
  if (!AIInsightsPanel) {
    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>Improvement Insights</h3>
        <p style={{ color: '#666', fontStyle: 'italic' }}>
          AIInsightsPanel component not available. Please ensure it's registered in the component registry.
        </p>
      </div>
    );
  }

  return (
    <AIInsightsPanel
      insights={formatInsights(insights)}
      loading={loading}
      error={error}
      onGenerate={onGenerate}
      title="Improvement Insights"
      icon="fa-lightbulb"
      iconColor="#F59E0B"
      maxHeight="500px"
      utilities={utilities}
      styles={styles}
      components={components}
      callbacks={callbacks}
      savedUserSettings={savedUserSettings}
      onSaveUserSettings={onSaveUserSettings}
    />
  );
}