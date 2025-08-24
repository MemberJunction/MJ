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

  // Style helpers
  const sectionStyle = {
    marginBottom: styles.spacing?.md || '16px',
    padding: styles.spacing?.sm || '8px',
    backgroundColor: styles.colors?.background || '#f9f9f9',
    borderRadius: styles.borders?.radius || '4px'
  };

  const headerStyle = {
    fontSize: styles.fonts?.sizes?.md || '16px',
    fontWeight: 'bold',
    color: styles.colors?.text?.primary || '#333',
    marginBottom: styles.spacing?.sm || '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  };

  const labelStyle = {
    fontSize: styles.fonts?.sizes?.sm || '14px',
    fontWeight: '500',
    color: styles.colors?.text?.secondary || '#666',
    marginBottom: styles.spacing?.xs || '4px'
  };

  const valueStyle = {
    fontSize: styles.fonts?.sizes?.sm || '14px',
    color: styles.colors?.text?.primary || '#333',
    marginBottom: styles.spacing?.sm || '8px'
  };

  const badgeStyle = {
    display: 'inline-block',
    padding: `2px 6px`,
    fontSize: styles.fonts?.sizes?.xs || '12px',
    borderRadius: styles.borders?.radius || '4px',
    marginRight: styles.spacing?.xs || '4px'
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
      {/* Header with prompt name */}
      <div style={{
        marginBottom: styles.spacing?.md || '16px',
        paddingBottom: styles.spacing?.sm || '8px',
        borderBottom: `1px solid ${styles.colors?.border || '#ddd'}`
      }}>
        <h3 style={{
          fontSize: styles.fonts?.sizes?.lg || '18px',
          fontWeight: 'bold',
          color: styles.colors?.text?.primary || '#333',
          margin: 0,
          marginBottom: styles.spacing?.xs || '4px'
        }}>
          {selectedPrompt.Name}
        </h3>
        
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: styles.spacing?.xs || '4px' }}>
          <button
            onClick={() => onEditPrompt(selectedPrompt.ID)}
            style={{
              padding: styles.spacing?.xs || '4px',
              backgroundColor: 'transparent',
              color: styles.colors?.primary || '#007bff',
              fontSize: styles.fonts?.sizes?.lg || '20px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
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