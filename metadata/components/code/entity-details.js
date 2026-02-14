function EntityDetails({ 
  entity, 
  fields, 
  relationships, 
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
    return typeof styles.borders.radius === 'object' ? styles.borders.radius[size] : styles.borders.radius;
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
  
  // Render field type badge
  const renderFieldType = (type) => {
    const typeColors = {
      'nvarchar': styles.colors.info || styles.colors.primary,
      'varchar': styles.colors.info || styles.colors.primary,
      'int': styles.colors.success || styles.colors.primary,
      'bigint': styles.colors.success || styles.colors.primary,
      'decimal': styles.colors.success || styles.colors.primary,
      'float': styles.colors.success || styles.colors.primary,
      'bit': styles.colors.warning || styles.colors.secondary,
      'datetime': styles.colors.secondary,
      'uniqueidentifier': styles.colors.primary,
      'text': styles.colors.info || styles.colors.primary,
      'ntext': styles.colors.info || styles.colors.primary
    };
    
    const color = typeColors[type?.toLowerCase()] || styles.colors.textSecondary;
    
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
        {type}
      </span>
    );
  };
  
  // Render relationship type icon
  const renderRelationshipIcon = (type) => {
    const icons = {
      'One to Many': '1:N',
      'Many to One': 'N:1',
      'Many to Many': 'N:N',
      'One to One': '1:1'
    };
    
    return (
      <span style={{
        display: 'inline-block',
        padding: `${styles.spacing.xs} ${styles.spacing.sm}`,
        backgroundColor: styles.colors.primary + '15',
        color: styles.colors.primary,
        borderRadius: getBorderRadius('sm'),
        fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
        fontWeight: styles.typography.fontWeight?.bold || '700',
        fontFamily: 'monospace'
      }}>
        {icons[type] || type}
      </span>
    );
  };
  
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
        width: '480px',
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
                {entity?.DisplayName || entity?.Name || 'No Entity Selected'}
              </h2>
              {entity?.DisplayName && entity?.Name && entity.DisplayName !== entity.Name && (
                <div style={{
                  fontSize: styles.typography.fontSize.sm,
                  color: styles.colors.textSecondary,
                  fontFamily: 'monospace'
                }}>
                  {entity.Name}
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
          {entity ? (
            <>
              {/* Entity Metadata */}
              {entity.Description && (
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
                    {entity.Description}
                  </div>
                </div>
              )}
              
              {/* Quick Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: styles.spacing.md,
                marginBottom: styles.spacing.xl
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
                    Schema
                  </div>
                  <div style={{
                    fontSize: styles.typography.fontSize.md,
                    fontWeight: styles.typography.fontWeight?.semibold || '600',
                    color: styles.colors.text
                  }}>
                    {entity.SchemaName || '-'}
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
                    Base Table
                  </div>
                  <div style={{
                    fontSize: styles.typography.fontSize.md,
                    fontWeight: styles.typography.fontWeight?.semibold || '600',
                    color: styles.colors.text
                  }}>
                    {entity.BaseTable || '-'}
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
                    Base View
                  </div>
                  <div style={{
                    fontSize: styles.typography.fontSize.md,
                    fontWeight: styles.typography.fontWeight?.semibold || '600',
                    color: styles.colors.text
                  }}>
                    {entity.BaseView || '-'}
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
                    Field Count
                  </div>
                  <div style={{
                    fontSize: styles.typography.fontSize.md,
                    fontWeight: styles.typography.fontWeight?.semibold || '600',
                    color: styles.colors.text
                  }}>
                    {fields?.length || 0}
                  </div>
                </div>
              </div>
              
              {/* Fields Section */}
              <div style={{ marginBottom: styles.spacing.xl }}>
                <h3 style={{
                  margin: 0,
                  marginBottom: styles.spacing.md,
                  fontSize: styles.typography.fontSize.lg,
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  color: styles.colors.text
                }}>
                  Fields ({fields?.length || 0})
                </h3>
                <div style={{
                  backgroundColor: styles.colors.surface,
                  borderRadius: getBorderRadius('md'),
                  overflow: 'hidden'
                }}>
                  {fields && fields.length > 0 ? (
                    <table style={{
                      width: '100%',
                      borderCollapse: 'collapse'
                    }}>
                      <thead>
                        <tr style={{
                          borderBottom: `1px solid ${styles.colors.border}`
                        }}>
                          <th style={{
                            padding: styles.spacing.sm,
                            textAlign: 'left',
                            fontSize: styles.typography.fontSize.sm,
                            fontWeight: styles.typography.fontWeight?.medium || '500',
                            color: styles.colors.textSecondary
                          }}>
                            Field
                          </th>
                          <th style={{
                            padding: styles.spacing.sm,
                            textAlign: 'left',
                            fontSize: styles.typography.fontSize.sm,
                            fontWeight: styles.typography.fontWeight?.medium || '500',
                            color: styles.colors.textSecondary
                          }}>
                            Type
                          </th>
                          <th style={{
                            padding: styles.spacing.sm,
                            textAlign: 'center',
                            fontSize: styles.typography.fontSize.sm,
                            fontWeight: styles.typography.fontWeight?.medium || '500',
                            color: styles.colors.textSecondary
                          }}>
                            Attributes
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, index) => (
                          <tr
                            key={index}
                            style={{
                              borderBottom: index < fields.length - 1 
                                ? `1px solid ${styles.colors.borderLight || styles.colors.border}` 
                                : 'none'
                            }}
                          >
                            <td style={{
                              padding: styles.spacing.sm,
                              fontSize: styles.typography.fontSize.sm,
                              color: styles.colors.text
                            }}>
                              <div>
                                <div style={{
                                  fontWeight: field.IsPrimaryKey 
                                    ? (styles.typography.fontWeight?.semibold || '600')
                                    : (styles.typography.fontWeight?.regular || '400')
                                }}>
                                  {field.DisplayName || field.Name}
                                </div>
                                {field.DisplayName && (
                                  <div style={{
                                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                                    color: styles.colors.textSecondary,
                                    fontFamily: 'monospace'
                                  }}>
                                    {field.Name}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{
                              padding: styles.spacing.sm
                            }}>
                              {renderFieldType(field.Type)}
                              {field.Length && (
                                <span style={{
                                  marginLeft: styles.spacing.xs,
                                  fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                                  color: styles.colors.textSecondary
                                }}>
                                  ({field.Length})
                                </span>
                              )}
                            </td>
                            <td style={{
                              padding: styles.spacing.sm,
                              textAlign: 'center'
                            }}>
                              <div style={{
                                display: 'flex',
                                gap: styles.spacing.xs,
                                justifyContent: 'center',
                                flexWrap: 'wrap'
                              }}>
                                {field.IsPrimaryKey && (
                                  <span style={{
                                    padding: `2px ${styles.spacing.xs}`,
                                    backgroundColor: (styles.colors.warning || styles.colors.secondary) + '15',
                                    color: styles.colors.warning || styles.colors.secondary,
                                    borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                                    fontWeight: styles.typography.fontWeight?.bold || '700'
                                  }}>
                                    PK
                                  </span>
                                )}
                                {field.IsUnique && (
                                  <span style={{
                                    padding: `2px ${styles.spacing.xs}`,
                                    backgroundColor: (styles.colors.info || styles.colors.primary) + '15',
                                    color: styles.colors.info || styles.colors.primary,
                                    borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                                    fontWeight: styles.typography.fontWeight?.bold || '700'
                                  }}>
                                    UQ
                                  </span>
                                )}
                                {!field.AllowsNull && !field.IsPrimaryKey && (
                                  <span style={{
                                    padding: `2px ${styles.spacing.xs}`,
                                    backgroundColor: (styles.colors.error || styles.colors.secondary) + '15',
                                    color: styles.colors.error || styles.colors.secondary,
                                    borderRadius: getBorderRadius('xs') || getBorderRadius('sm'),
                                    fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                                    fontWeight: styles.typography.fontWeight?.bold || '700'
                                  }}>
                                    NN
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{
                      padding: styles.spacing.lg,
                      textAlign: 'center',
                      color: styles.colors.textSecondary,
                      fontSize: styles.typography.fontSize.sm
                    }}>
                      No fields available
                    </div>
                  )}
                </div>
              </div>
              
              {/* Relationships Section */}
              <div style={{ marginBottom: styles.spacing.xl }}>
                <h3 style={{
                  margin: 0,
                  marginBottom: styles.spacing.md,
                  fontSize: styles.typography.fontSize.lg,
                  fontWeight: styles.typography.fontWeight?.semibold || '600',
                  color: styles.colors.text
                }}>
                  Relationships ({relationships?.length || 0})
                </h3>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: styles.spacing.sm
                }}>
                  {relationships && relationships.length > 0 ? (
                    relationships.map((rel, index) => (
                      <div
                        key={index}
                        style={{
                          padding: styles.spacing.md,
                          backgroundColor: styles.colors.surface,
                          borderRadius: getBorderRadius('sm'),
                          display: 'flex',
                          alignItems: 'center',
                          gap: styles.spacing.md
                        }}
                      >
                        {renderRelationshipIcon(rel.Type)}
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: styles.typography.fontSize.md,
                            fontWeight: styles.typography.fontWeight?.medium || '500',
                            color: styles.colors.text
                          }}>
                            {rel.DisplayName || rel.RelatedEntity}
                          </div>
                          {rel.RelatedEntityJoinField && (
                            <div style={{
                              fontSize: styles.typography.fontSize.xs || styles.typography.fontSize.sm,
                              color: styles.colors.textSecondary,
                              fontFamily: 'monospace'
                            }}>
                              via {rel.RelatedEntityJoinField}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{
                      padding: styles.spacing.lg,
                      backgroundColor: styles.colors.surface,
                      borderRadius: getBorderRadius('sm'),
                      textAlign: 'center',
                      color: styles.colors.textSecondary,
                      fontSize: styles.typography.fontSize.sm
                    }}>
                      No relationships defined
                    </div>
                  )}
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
                No Entity Selected
              </div>
              <div style={{
                fontSize: styles.typography.fontSize.md
              }}>
                Select an entity from the list to view its details
              </div>
            </div>
          )}
        </div>
        
        {/* Footer with Open Record Button */}
        {entity && OpenRecordButton && (
          <div style={{
            padding: styles.spacing.lg,
            borderTop: `1px solid ${styles.colors.border}`,
            backgroundColor: styles.colors.surface
          }}>
            <OpenRecordButton
              entityName="MJ: Entities"
              record={entity}
              buttonText="Open Entity Record"
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