function AIMetricsSummary({ metrics, styles, utilities, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  console.log('[AIMetricsSummary] Rendering metrics:', metrics);
  
  const formatNumber = (value) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toLocaleString();
  };
  
  const formatCurrency = (value) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };
  
  const metricCards = [
    {
      label: 'Total Runs',
      value: formatNumber(metrics.totalRuns || 0),
      color: styles.colors.primary,
      icon: '▶',
      description: 'Total execution count'
    },
    {
      label: 'Total Tokens',
      value: formatNumber(metrics.totalTokens || 0),
      color: styles.colors.success,
      icon: '◆',
      description: 'Tokens consumed'
    },
    {
      label: 'Total Cost',
      value: formatCurrency(metrics.totalCost || 0),
      color: styles.colors.warning,
      icon: '$',
      description: 'Total spend'
    },
    {
      label: 'Avg Tokens/Run',
      value: formatNumber(metrics.avgTokensPerRun || 0),
      color: styles.colors.info || styles.colors.primary,
      icon: '⊙',
      description: 'Average token usage'
    },
    {
      label: 'Avg Cost/Run',
      value: formatCurrency(metrics.avgCostPerRun || 0),
      color: styles.colors.secondary,
      icon: '¢',
      description: 'Average cost per execution'
    }
  ];
  
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: styles.spacing.md,
      marginBottom: styles.spacing.lg
    }}>
      {metricCards.map((card, index) => (
        <div
          key={index}
          style={{
            backgroundColor: styles.colors.surface,
            borderRadius: styles.borders?.radius || '4px',
            padding: styles.spacing.md,
            borderLeft: `3px solid ${card.color}`,
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'default',
            position: 'relative'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = `0 4px 12px ${styles.colors.border}40`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          title={card.description}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: styles.spacing.xs
          }}>
            <div style={{
              fontSize: styles.typography.fontSize.xs,
              color: styles.colors.textSecondary,
              fontWeight: '500'
            }}>
              {card.label}
            </div>
            <div style={{
              fontSize: styles.typography.fontSize.lg,
              color: card.color,
              opacity: 0.3
            }}>
              {card.icon}
            </div>
          </div>
          <div style={{
            fontSize: styles.typography.fontSize.xl,
            color: styles.colors.text,
            fontWeight: '700'
          }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}