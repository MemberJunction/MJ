function AIModelDetails({ 
  model, 
  vendors,
  promptRuns,
  isOpen, 
  onClose, 
  onOpenRecord,
  utilities, 
  styles, 
  components, 
  callbacks, 
  savedUserSettings, 
  onSaveUserSettings 
}) {
  // Helper function to get border radius value
  const getBorderRadius = (size) => {
    return typeof styles.borders?.radius === 'object' ? styles.borders.radius[size] : styles.borders?.radius || '4px';
  };
  
  // Handle escape key to close panel
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
  
  // Load OpenRecordButton component
  const OpenRecordButton = components['OpenRecordButton'];
  
  // Format token limit
  const formatTokens = (tokens) => {
    if (!tokens) return '-';
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
    return tokens.toString();
  };
  
  // Render status badge
  const renderStatusBadge = (status) => {
    const statusColors = {
      'Active': styles.colors.success || styles.colors.primary,
      'Inactive': styles.colors.warning || styles.colors.secondary,
      'Deprecated': styles.colors.error || styles.colors.secondary,
      'Preview': styles.colors.info || styles.colors.primary
    };
    
    const color = statusColors[status] || styles.colors.textSecondary;
    
    return (
      <span style={{
        display: 'inline-block',
        padding: `${styles.spacing.xs} ${styles.spacing.sm}`,
        backgroundColor: color + '15',
        color: color,
        borderRadius: getBorderRadius('sm'),
        fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
        fontWeight: styles.typography.fontWeight?.medium || '500'
      }}>
        {status}
      </span>
    );
  };
  
  // Render vendor type icon
  const renderVendorTypeIcon = (type) => {
    const icons = {
      'Model Developer': '🏢',
      'Inference Provider': '🚀'
    };
    
    return (
      <span style={{
        display: 'inline-block',
        marginRight: styles.spacing.xs,
        fontSize: styles.typography.fontSize.md
      }}>
        {icons[type] || '📦'}
      </span>
    );
  };
  
  // Calculate prompt statistics
  const calculatePromptStats = useCallback(() => {
    if (!promptRuns || promptRuns.length === 0) {
      return {
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        avgExecutionTime: 0,
        totalTokens: 0,
        uniquePrompts: 0
      };
    }
    
    const stats = {
      totalRuns: promptRuns.length,
      successfulRuns: promptRuns.filter(r => r.Status === 'Success' || r.Status === 'Completed').length,
      failedRuns: promptRuns.filter(r => r.Status === 'Failed' || r.Status === 'Error').length,
      avgExecutionTime: 0,
      totalTokens: 0,
      uniquePrompts: new Set(promptRuns.map(r => r.PromptID)).size
    };
    
    const validTimes = promptRuns
      .filter(r => r.TotalExecutionTime)
      .map(r => r.TotalExecutionTime);
    
    if (validTimes.length > 0) {
      stats.avgExecutionTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    }
    
    stats.totalTokens = promptRuns.reduce((sum, r) => sum + (r.TotalTokens || 0), 0);
    
    return stats;
  }, [promptRuns]);
  
  const stats = calculatePromptStats();
  
  // Group vendors by type
  const vendorsByType = useMemo(() => {
    const grouped = {
      'Model Developer': [],
      'Inference Provider': []
    };
    
    vendors.forEach(v => {
      if (grouped[v.Type]) {
        grouped[v.Type].push(v);
      }
    });
    
    return grouped;
  }, [vendors]);
  
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 99999,
            opacity: isOpen ? 1 : 0,
            transition: 'opacity 0.3s',
            pointerEvents: isOpen ? 'auto' : 'none'
          }}
        />
      )}
      
      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: '75px',
        right: 0,
        bottom: 0,
        width: '520px',
        backgroundColor: styles.colors.background,
        boxShadow: isOpen ? `-4px 0 24px ${styles.colors.shadow || 'rgba(0, 0, 0, 0.1)'}` : 'none',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease-out',
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: styles.spacing.lg,
          borderBottom: `1px solid ${styles.colors.border}`,
          backgroundColor: styles.colors.surface
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}>
            <div style={{ flex: 1 }}>
              <h2 style={{
                margin: 0,
                fontSize: styles.typography.fontSize.xl,
                fontWeight: styles.typography.fontWeight?.bold || '700',
                color: styles.colors.text,
                marginBottom: styles.spacing.xs
              }}>
                {model?.Name || 'No Model Selected'}
              </h2>
              {model?.APIName && (
                <div style={{
                  fontSize: styles.typography.fontSize.sm,
                  color: styles.colors.textSecondary,
                  fontFamily: 'monospace'
                }}>
                  {model.APIName}
                </div>
              )}
              {model?.IsActive !== undefined && (
                <div style={{ marginTop: styles.spacing.sm }}>
                  {renderStatusBadge(model.IsActive ? 'Active' : 'Inactive')}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: getBorderRadius('sm'),
                border: 'none',
                backgroundColor: 'transparent',
                color: styles.colors.textSecondary,
                fontSize: styles.typography.fontSize.lg,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = styles.colors.surfaceHover || styles.colors.surface;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: styles.spacing.lg
        }}>
          {model ? (
            <>
              {/* Model Description */}
              {model.Description && (
                <div style={{
                  marginBottom: styles.spacing.xl,
                  padding: styles.spacing.md,
                  backgroundColor: styles.colors.surface,
                  borderRadius: getBorderRadius('md'),
                  borderLeft: `3px solid ${styles.colors.primary}`
                }}>
                  <div style={{
                    fontSize: styles.typography.fontSize.md,
                    color: styles.colors.textSecondary,
                    lineHeight: 1.6
                  }}>
                    {model.Description}
                  </div>
                </div>
              )}
              
              {/* Model Specifications */}
              <div style={{ marginBottom: styles.spacing.xl }}>
                <h3 style={{
                  margin: 0,
                  marginBottom: styles.spacing.md,
                  fontSize: styles.typography.fontSize.lg,
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  color: styles.colors.text
                }}>
                  Specifications
                </h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: styles.spacing.md
                }}>
                  <div style={{
                    padding: styles.spacing.md,
                    backgroundColor: styles.colors.surface,
                    borderRadius: getBorderRadius('sm')
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                      color: styles.colors.textSecondary,
                      marginBottom: styles.spacing.xs
                    }}>
                      Input Token Limit
                    </div>
                    <div style={{
                      fontSize: styles.typography.fontSize.lg,
                      fontWeight: styles.typography.fontWeight?.semibold || '600',
                      color: styles.colors.text
                    }}>
                      {formatTokens(model.InputTokenLimit)}
                    </div>
                  </div>
                  <div style={{
                    padding: styles.spacing.md,
                    backgroundColor: styles.colors.surface,
                    borderRadius: getBorderRadius('sm')
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                      color: styles.colors.textSecondary,
                      marginBottom: styles.spacing.xs
                    }}>
                      Cost Rank
                    </div>
                    <div style={{
                      fontSize: styles.typography.fontSize.lg,
                      fontWeight: styles.typography.fontWeight?.semibold || '600',
                      color: styles.colors.warning || styles.colors.secondary
                    }}>
                      {'$'.repeat(Math.min(model.CostRank || 0, 5))}
                      <span style={{ opacity: 0.3 }}>
                        {'$'.repeat(Math.max(0, 5 - (model.CostRank || 0)))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Vendors Section */}
              <div style={{ marginBottom: styles.spacing.xl }}>
                <h3 style={{
                  margin: 0,
                  marginBottom: styles.spacing.md,
                  fontSize: styles.typography.fontSize.lg,
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  color: styles.colors.text
                }}>
                  Vendors ({vendors.length})
                </h3>
                
                {/* Model Developer */}
                {vendorsByType['Model Developer'].length > 0 && (
                  <div style={{ marginBottom: styles.spacing.md }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.sm,
                      fontWeight: styles.typography.fontWeight?.medium || '500',
                      color: styles.colors.textSecondary,
                      marginBottom: styles.spacing.sm
                    }}>
                      {renderVendorTypeIcon('Model Developer')}
                      Model Developer
                    </div>
                    {vendorsByType['Model Developer'].map((vendor, index) => (
                      <div
                        key={index}
                        style={{
                          padding: styles.spacing.md,
                          backgroundColor: styles.colors.surface,
                          borderRadius: getBorderRadius('sm'),
                          marginBottom: styles.spacing.sm,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{
                            fontSize: styles.typography.fontSize.md,
                            fontWeight: styles.typography.fontWeight?.medium || '500',
                            color: styles.colors.text
                          }}>
                            {vendor.Vendor}
                          </div>
                          {vendor.APIName && (
                            <div style={{
                              fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                              color: styles.colors.textSecondary,
                              fontFamily: 'monospace'
                            }}>
                              API: {vendor.APIName}
                            </div>
                          )}
                        </div>
                        {renderStatusBadge(vendor.Status)}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Inference Providers */}
                {vendorsByType['Inference Provider'].length > 0 && (
                  <div>
                    <div style={{
                      fontSize: styles.typography.fontSize.sm,
                      fontWeight: styles.typography.fontWeight?.medium || '500',
                      color: styles.colors.textSecondary,
                      marginBottom: styles.spacing.sm
                    }}>
                      {renderVendorTypeIcon('Inference Provider')}
                      Inference Providers
                    </div>
                    {vendorsByType['Inference Provider'].map((vendor, index) => (
                      <div
                        key={index}
                        style={{
                          padding: styles.spacing.md,
                          backgroundColor: styles.colors.surface,
                          borderRadius: getBorderRadius('sm'),
                          marginBottom: styles.spacing.sm
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: styles.spacing.sm
                        }}>
                          <div>
                            <div style={{
                              fontSize: styles.typography.fontSize.md,
                              fontWeight: styles.typography.fontWeight?.medium || '500',
                              color: styles.colors.text
                            }}>
                              {vendor.Vendor}
                            </div>
                            {vendor.APIName && (
                              <div style={{
                                fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                                color: styles.colors.textSecondary,
                                fontFamily: 'monospace'
                              }}>
                                API: {vendor.APIName}
                              </div>
                            )}
                          </div>
                          <div style={{
                            display: 'flex',
                            gap: styles.spacing.xs,
                            alignItems: 'center'
                          }}>
                            {vendor.Priority && (
                              <span style={{
                                padding: `2px ${styles.spacing.xs}`,
                                backgroundColor: styles.colors.info + '15',
                                color: styles.colors.info || styles.colors.primary,
                                borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                                fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm
                              }}>
                                Priority: {vendor.Priority}
                              </span>
                            )}
                            {renderStatusBadge(vendor.Status)}
                          </div>
                        </div>
                        
                        {/* Vendor Capabilities */}
                        <div style={{
                          display: 'flex',
                          gap: styles.spacing.xs,
                          flexWrap: 'wrap'
                        }}>
                          {vendor.SupportsStreaming && (
                            <span style={{
                              padding: `2px ${styles.spacing.xs}`,
                              backgroundColor: styles.colors.success + '15',
                              color: styles.colors.success || styles.colors.primary,
                              borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                              fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm
                            }}>
                              ✓ Streaming
                            </span>
                          )}
                          {vendor.SupportsEffortLevel && (
                            <span style={{
                              padding: `2px ${styles.spacing.xs}`,
                              backgroundColor: styles.colors.success + '15',
                              color: styles.colors.success || styles.colors.primary,
                              borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                              fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm
                            }}>
                              ✓ Effort Level
                            </span>
                          )}
                          {vendor.MaxInputTokens && (
                            <span style={{
                              padding: `2px ${styles.spacing.xs}`,
                              backgroundColor: styles.colors.background,
                              color: styles.colors.textSecondary,
                              borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                              fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm
                            }}>
                              Max: {formatTokens(vendor.MaxInputTokens)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Usage Statistics */}
              <div style={{ marginBottom: styles.spacing.xl }}>
                <h3 style={{
                  margin: 0,
                  marginBottom: styles.spacing.md,
                  fontSize: styles.typography.fontSize.lg,
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  color: styles.colors.text
                }}>
                  Usage Statistics
                </h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: styles.spacing.md
                }}>
                  <div style={{
                    padding: styles.spacing.md,
                    backgroundColor: styles.colors.surface,
                    borderRadius: getBorderRadius('sm')
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                      color: styles.colors.textSecondary,
                      marginBottom: styles.spacing.xs
                    }}>
                      Total Runs
                    </div>
                    <div style={{
                      fontSize: styles.typography.fontSize.lg,
                      fontWeight: styles.typography.fontWeight?.semibold || '600',
                      color: styles.colors.text
                    }}>
                      {stats.totalRuns.toLocaleString()}
                    </div>
                  </div>
                  <div style={{
                    padding: styles.spacing.md,
                    backgroundColor: styles.colors.surface,
                    borderRadius: getBorderRadius('sm')
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                      color: styles.colors.textSecondary,
                      marginBottom: styles.spacing.xs
                    }}>
                      Success Rate
                    </div>
                    <div style={{
                      fontSize: styles.typography.fontSize.lg,
                      fontWeight: styles.typography.fontWeight?.semibold || '600',
                      color: stats.totalRuns > 0 
                        ? (stats.successfulRuns / stats.totalRuns >= 0.9 ? styles.colors.success : styles.colors.warning)
                        : styles.colors.text
                    }}>
                      {stats.totalRuns > 0 
                        ? `${((stats.successfulRuns / stats.totalRuns) * 100).toFixed(1)}%`
                        : '-'}
                    </div>
                  </div>
                  <div style={{
                    padding: styles.spacing.md,
                    backgroundColor: styles.colors.surface,
                    borderRadius: getBorderRadius('sm')
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                      color: styles.colors.textSecondary,
                      marginBottom: styles.spacing.xs
                    }}>
                      Unique Prompts
                    </div>
                    <div style={{
                      fontSize: styles.typography.fontSize.lg,
                      fontWeight: styles.typography.fontWeight?.semibold || '600',
                      color: styles.colors.text
                    }}>
                      {stats.uniquePrompts}
                    </div>
                  </div>
                  <div style={{
                    padding: styles.spacing.md,
                    backgroundColor: styles.colors.surface,
                    borderRadius: getBorderRadius('sm')
                  }}>
                    <div style={{
                      fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                      color: styles.colors.textSecondary,
                      marginBottom: styles.spacing.xs
                    }}>
                      Total Tokens
                    </div>
                    <div style={{
                      fontSize: styles.typography.fontSize.lg,
                      fontWeight: styles.typography.fontWeight?.semibold || '600',
                      color: styles.colors.text
                    }}>
                      {formatTokens(stats.totalTokens)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: styles.colors.textSecondary
            }}>
              <div style={{
                fontSize: styles.typography.fontSize.lg,
                marginBottom: styles.spacing.md
              }}>
                No Model Selected
              </div>
              <div style={{
                fontSize: styles.typography.fontSize.md
              }}>
                Select a model from the list to view its details
              </div>
            </div>
          )}
        </div>
        
        {/* Footer with Open Record Button */}
        {model && OpenRecordButton && (
          <div style={{
            padding: styles.spacing.lg,
            borderTop: `1px solid ${styles.colors.border}`,
            backgroundColor: styles.colors.surface
          }}>
            <OpenRecordButton
              entityName="MJ: AI Models"
              record={model}
              buttonText="Open Model Record"
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
              savedUserSettings={savedUserSettings}
              onSaveUserSettings={onSaveUserSettings}
              buttonStyle={{
                width: '100%',
                padding: styles.spacing.md,
                backgroundColor: styles.colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: getBorderRadius('md'),
                fontSize: styles.typography.fontSize.md,
                fontWeight: styles.typography.fontWeight?.semibold || '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}