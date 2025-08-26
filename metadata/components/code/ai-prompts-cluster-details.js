function AIPromptsClusterDetails({
  selectedPrompt,
  allPrompts,
  clusterInfo,
  similarPrompts,
  onPromptNavigate,
  onEditPrompt,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  const [expandedSection, setExpandedSection] = useState('details');
  const [showFullTemplate, setShowFullTemplate] = useState(false);

  // Modern style helpers
  const sectionStyle = {
    marginBottom: '20px',
    padding: '16px',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(249,250,251,0.95) 100%)',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.8)'
  };

  const headerStyle = {
    fontSize: '15px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px',
    borderRadius: '8px',
    transition: 'all 0.2s ease'
  };

  const labelStyle = {
    fontSize: '12px',
    fontWeight: '600',
    color: '#718096',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.025em'
  };

  const valueStyle = {
    fontSize: '14px',
    color: '#2d3748',
    marginBottom: '12px',
    lineHeight: '1.5'
  };

  const badgeStyle = {
    display: 'inline-block',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '600',
    borderRadius: '8px',
    marginRight: '8px'
  };

  // Format template text with basic syntax highlighting
  const formatTemplateText = (text) => {
    if (!text) return 'No template text';
    
    // Truncate if needed
    const displayText = showFullTemplate 
      ? text 
      : text.length > 500 ? text.substring(0, 500) + '...' : text;
    
    // Basic syntax highlighting for variables
    const highlighted = displayText.replace(
      /\{\{([^}]+)\}\}/g,
      '<span style="color: #0066cc; font-weight: bold;">{{$1}}</span>'
    );
    
    return (
      <div style={{ position: 'relative' }}>
        <pre style={{
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          fontFamily: 'monospace',
          fontSize: styles.fonts?.sizes?.xs || '12px',
          backgroundColor: styles.colors?.surface || 'white',
          padding: styles.spacing?.sm || '8px',
          borderRadius: styles.borders?.radius || '4px',
          border: `1px solid ${styles.colors?.border || '#ddd'}`,
          maxHeight: showFullTemplate ? 'none' : '200px',
          overflow: 'hidden'
        }} dangerouslySetInnerHTML={{ __html: highlighted }} />
        
        {text.length > 500 && (
          <button
            onClick={() => setShowFullTemplate(!showFullTemplate)}
            style={{
              marginTop: styles.spacing?.xs || '4px',
              padding: `2px 8px`,
              fontSize: styles.fonts?.sizes?.xs || '12px',
              backgroundColor: styles.colors?.primary || '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: styles.borders?.radius || '4px',
              cursor: 'pointer'
            }}
          >
            {showFullTemplate ? 'Show Less' : 'Show More'}
          </button>
        )}
      </div>
    );
  };

  if (!selectedPrompt) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: styles.colors?.text?.secondary || '#666',
        fontSize: styles.fonts?.sizes?.sm || '14px',
        textAlign: 'center'
      }}>
        Select a prompt from the graph to view details
      </div>
    );
  }

  return (
    <div>
      {/* Modern Header */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '16px',
        boxShadow: '0 8px 24px rgba(102, 126, 234, 0.2)',
        position: 'relative'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div style={{ flex: 1 }}>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: 'white',
              margin: 0,
              marginBottom: '8px'
            }}>
              {selectedPrompt.Name}
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {selectedPrompt.Category && (
                <span style={{
                  padding: '3px 10px',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'white',
                  fontWeight: '500'
                }}>
                  {selectedPrompt.Category}
                </span>
              )}
              {selectedPrompt.Type && (
                <span style={{
                  padding: '3px 10px',
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'white',
                  fontWeight: '500'
                }}>
                  {selectedPrompt.Type}
                </span>
              )}
              {selectedPrompt.Status && (
                <span style={{
                  padding: '3px 10px',
                  background: selectedPrompt.Status === 'Active' 
                    ? 'rgba(72, 187, 120, 0.3)' 
                    : 'rgba(255,255,255,0.2)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'white',
                  fontWeight: '500'
                }}>
                  {selectedPrompt.Status}
                </span>
              )}
            </div>
          </div>
          
          {/* Action button */}
          <button
            onClick={() => onEditPrompt(selectedPrompt.ID)}
            style={{
              width: '40px',
              height: '40px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white',
              fontSize: '16px',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.3)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title="Open Prompt Record"
          >
            <i className="fa-solid fa-arrow-up-right-from-square"></i>
          </button>
        </div>
      </div>

      {/* Prompt Details */}
      <div style={sectionStyle}>
        <div style={headerStyle} onClick={() => setExpandedSection(expandedSection === 'details' ? null : 'details')}>
          <span>Prompt Details</span>
          <span>{expandedSection === 'details' ? '▼' : '▶'}</span>
        </div>
        
        {expandedSection === 'details' && (
          <div>
            {selectedPrompt.Description && (
              <>
                <div style={labelStyle}>Description</div>
                <div style={valueStyle}>{selectedPrompt.Description}</div>
              </>
            )}
            
            <div style={{ display: 'flex', gap: styles.spacing?.md || '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Category</div>
                <div style={valueStyle}>{selectedPrompt.Category || 'None'}</div>
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Type</div>
                <div style={valueStyle}>{selectedPrompt.Type || 'None'}</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: styles.spacing?.md || '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Status</div>
                <div style={{
                  ...badgeStyle,
                  backgroundColor: selectedPrompt.Status === 'Active' 
                    ? '#d4edda' 
                    : selectedPrompt.Status === 'Disabled' 
                    ? '#f8d7da' 
                    : '#fff3cd',
                  color: selectedPrompt.Status === 'Active' 
                    ? '#155724' 
                    : selectedPrompt.Status === 'Disabled' 
                    ? '#721c24' 
                    : '#856404'
                }}>
                  {selectedPrompt.Status}
                </div>
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={labelStyle}>Role</div>
                <div style={valueStyle}>{selectedPrompt.PromptRole || 'None'}</div>
              </div>
            </div>
            
            <div style={labelStyle}>Response Format</div>
            <div style={valueStyle}>{selectedPrompt.ResponseFormat || 'Text'}</div>
          </div>
        )}
      </div>

      {/* Template Text */}
      <div style={sectionStyle}>
        <div style={headerStyle} onClick={() => setExpandedSection(expandedSection === 'template' ? null : 'template')}>
          <span>Template Text</span>
          <span>{expandedSection === 'template' ? '▼' : '▶'}</span>
        </div>
        
        {expandedSection === 'template' && (
          <div>
            {formatTemplateText(selectedPrompt.TemplateText)}
          </div>
        )}
      </div>

      {/* Cluster Information */}
      {clusterInfo && (
        <div style={sectionStyle}>
          <div style={headerStyle} onClick={() => setExpandedSection(expandedSection === 'cluster' ? null : 'cluster')}>
            <span>Cluster Information</span>
            <span>{expandedSection === 'cluster' ? '▼' : '▶'}</span>
          </div>
          
          {expandedSection === 'cluster' && (
            <div>
              <div style={labelStyle}>Cluster</div>
              <div style={valueStyle}>
                Cluster {clusterInfo.clusterIndex + 1} ({clusterInfo.clusterSize} members)
              </div>
              
              <div style={labelStyle}>Other Members</div>
              <div style={{
                maxHeight: '150px',
                overflowY: 'auto',
                fontSize: styles.fonts?.sizes?.sm || '14px'
              }}>
                {clusterInfo.clusterMembers
                  .filter(p => p.ID !== selectedPrompt.ID)
                  .map(prompt => (
                    <div
                      key={prompt.ID}
                      style={{
                        padding: styles.spacing?.xs || '4px',
                        marginBottom: '2px',
                        backgroundColor: styles.colors?.surface || 'white',
                        borderRadius: styles.borders?.radius || '4px',
                        cursor: 'pointer',
                        ':hover': {
                          backgroundColor: styles.colors?.hover || '#f0f0f0'
                        }
                      }}
                      onClick={() => onPromptNavigate(prompt.ID)}
                    >
                      {prompt.Name}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Similar Prompts */}
      {similarPrompts && similarPrompts.length > 0 && (
        <div style={sectionStyle}>
          <div style={headerStyle} onClick={() => setExpandedSection(expandedSection === 'similar' ? null : 'similar')}>
            <span>Similar Prompts</span>
            <span>{expandedSection === 'similar' ? '▼' : '▶'}</span>
          </div>
          
          {expandedSection === 'similar' && (
            <div>
              {similarPrompts.map(({ prompt, similarity }) => (
                <div
                  key={prompt.ID}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: styles.spacing?.xs || '4px',
                    marginBottom: '2px',
                    backgroundColor: styles.colors?.surface || 'white',
                    borderRadius: styles.borders?.radius || '4px',
                    cursor: 'pointer'
                  }}
                  onClick={() => onPromptNavigate(prompt.ID)}
                >
                  <div>
                    <div style={{ fontSize: styles.fonts?.sizes?.sm || '14px' }}>
                      {prompt.Name}
                    </div>
                    <div style={{
                      fontSize: styles.fonts?.sizes?.xs || '12px',
                      color: styles.colors?.text?.secondary || '#666'
                    }}>
                      {prompt.Category || 'No category'}
                    </div>
                  </div>
                  <div style={{
                    ...badgeStyle,
                    backgroundColor: similarity > 0.9 ? '#d4edda' 
                      : similarity > 0.7 ? '#fff3cd' 
                      : '#f8f8f8',
                    color: similarity > 0.9 ? '#155724' 
                      : similarity > 0.7 ? '#856404' 
                      : '#666'
                  }}>
                    {(similarity * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}