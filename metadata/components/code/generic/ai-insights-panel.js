function AIInsightsPanel({ 
  utilities, 
  styles, 
  components, 
  callbacks, 
  savedUserSettings, 
  onSaveUserSettings,
  // Required props
  insights,
  loading,
  error,
  onGenerate,
  // Optional props with defaults
  title = 'AI Insights',
  icon = 'fa-wand-magic-sparkles',
  iconColor,
  maxHeight = '400px',
  showRefresh = true,
  showExport = true,
  showCopy = true,
  position = 'top',
  defaultCollapsed = false,
  onClose,
  customButtons = []
}) {
  const { useState, useEffect, useRef } = React;

  // Theme tokens, with the previous hardcoded values kept as fallbacks for a host
  // that renders this component without styles.
  const themeColors = styles?.colors || {};
  const accentColor = iconColor || themeColors.primary || '#8B5CF6';
  const bodyColor = themeColors.text || '#374151';
  const headingColor = themeColors.text || '#111827';
  const headingAltColor = themeColors.text || '#1F2937';
  const subtleTextColor = themeColors.textSecondary || '#4B5563';
  const surfaceColor = themeColors.background || '#ffffff';
  const surfaceAltColor = themeColors.surface || '#f9fafb';
  const surfaceHoverColor = themeColors.surfaceHover || '#F9FAFB';
  const codeSurfaceColor = themeColors.surfaceHover || '#F3F4F6';
  const borderColor = themeColors.border || '#E5E7EB';
  const successColor = themeColors.success || '#10B981';
  const errorColor = themeColors.error || '#EF4444';
  const errorSurfaceColor = themeColors.errorLight || '#FEE2E2';
  const errorBorderColor = themeColors.errorBorder || '#FECACA';
  const shadowColor = themeColors.shadowMedium || 'rgba(0, 0, 0, 0.1)';
  const inverseSurfaceColor = themeColors.text || '#1F2937';
  const inverseTextColor = themeColors.background || '#F9FAFB';
  
  // State
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  // Load marked library if available
  const marked = window.marked;
  
  // Format insights using marked if available, otherwise fallback to plain text
  const formatInsights = (text) => {
    if (!text) return null;
    
    // If marked is available, use it for markdown rendering
    if (marked && marked.parse) {
      try {
        const htmlContent = marked.parse(text);
        return (
          <div 
            className="markdown-insights"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
            style={{
              color: bodyColor,
              lineHeight: '1.6'
            }}
          />
        );
      } catch (err) {
        console.warn('Failed to parse markdown:', err);
      }
    }
    
    // Fallback to plain text with basic formatting
    return (
      <div style={{ whiteSpace: 'pre-wrap', color: bodyColor, lineHeight: '1.6' }}>
        {text}
      </div>
    );
  };
  
  // Copy to clipboard functionality
  const copyToClipboard = async () => {
    if (!insights) return;
    
    try {
      await navigator.clipboard.writeText(insights);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  // Export as markdown functionality
  const exportAsMarkdown = () => {
    if (!insights) return;
    
    const timestamp = new Date().toISOString().split('T')[0];
    const markdownContent = `# ${title}

Generated: ${new Date().toLocaleString()}

---

${insights}`;
    
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-insights-${timestamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Don't render if no insights and no error
  if (!insights && !error && !loading) {
    return null;
  }
  
  const panelStyles = {
    marginBottom: position === 'top' ? (styles?.spacing?.lg || '20px') : 0,
    marginTop: position === 'bottom' ? (styles?.spacing?.lg || '20px') : 0,
    padding: styles?.spacing?.lg || '20px',
    backgroundColor: styles?.colors?.surface || 'white',
    borderRadius: styles?.borders?.radius || '8px',
    border: `1px solid ${styles?.colors?.border || '#E5E7EB'}`,
    boxShadow: `0 2px 4px ${shadowColor}`,
    background: `linear-gradient(135deg, ${surfaceColor} 0%, ${surfaceAltColor} 100%)`,
    transition: 'all 0.3s ease',
    cursor: 'default'
  };
  
  return (
    <div 
      onDoubleClick={() => setCollapsed(!collapsed)}
      style={panelStyles}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: collapsed ? 0 : (styles?.spacing?.md || '16px')
      }}>
        {/* Title with icon */}
        <h3 style={{
          margin: 0,
          fontSize: '18px',
          fontWeight: '600',
          color: styles?.colors?.text || '#111827',
          display: 'flex',
          alignItems: 'center',
          gap: styles?.spacing?.sm || '8px'
        }}>
          <i className={`fa-solid ${icon}`} style={{ color: accentColor }}></i>
          {title}
        </h3>
        
        {/* Button group */}
        <div style={{ 
          display: 'flex', 
          gap: styles?.spacing?.sm || '8px', 
          alignItems: 'center' 
        }}>
          {/* Collapse/Expand button - always first */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              background: 'none',
              border: `1px solid ${styles?.colors?.border || '#E5E7EB'}`,
              borderRadius: '6px',
              color: styles?.colors?.textSecondary || '#6B7280',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s'
            }}
            title={collapsed ? 'Expand' : 'Collapse'}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = surfaceHoverColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <i className={`fa-solid fa-chevron-${collapsed ? 'down' : 'up'}`}></i>
          </button>
          
          {/* Copy button */}
          {showCopy && insights && (
            <button
              onClick={copyToClipboard}
              style={{
                background: copyFeedback ? successColor : 'none',
                border: `1px solid ${copyFeedback ? successColor : borderColor}`,
                borderRadius: '6px',
                color: copyFeedback ? 'white' : (styles?.colors?.textSecondary || '#6B7280'),
                cursor: 'pointer',
                padding: '6px 10px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
              title={copyFeedback ? 'Copied!' : 'Copy to clipboard'}
            >
              <i className={`fa-solid fa-${copyFeedback ? 'check' : 'copy'}`}></i>
              {copyFeedback && <span style={{ fontSize: '12px' }}>Copied!</span>}
            </button>
          )}
          
          {/* Export button */}
          {showExport && insights && (
            <button
              onClick={exportAsMarkdown}
              style={{
                background: 'none',
                border: `1px solid ${styles?.colors?.border || '#E5E7EB'}`,
                borderRadius: '6px',
                color: styles?.colors?.textSecondary || '#6B7280',
                cursor: 'pointer',
                padding: '6px 10px',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s'
              }}
              title="Export as Markdown"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = surfaceHoverColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <i className="fa-solid fa-download"></i>
            </button>
          )}
          
          {/* Refresh button */}
          {showRefresh && onGenerate && (
            <button
              onClick={() => {
                setCollapsed(false);
                onGenerate();
              }}
              disabled={loading}
              style={{
                background: 'none',
                border: `1px solid ${styles?.colors?.border || '#E5E7EB'}`,
                borderRadius: '6px',
                padding: '6px 10px',
                cursor: loading ? 'not-allowed' : 'pointer',
                color: styles?.colors?.textSecondary || '#6B7280',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: loading ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
              title="Refresh insights"
            >
              <i className={`fa-solid fa-${loading ? 'spinner fa-spin' : 'arrows-rotate'}`}></i>
            </button>
          )}
          
          {/* Custom buttons */}
          {customButtons.map((button, index) => (
            <button
              key={index}
              onClick={button.onClick}
              disabled={button.disabled}
              style={{
                background: 'none',
                border: `1px solid ${styles?.colors?.border || '#E5E7EB'}`,
                borderRadius: '6px',
                padding: '6px 10px',
                cursor: button.disabled ? 'not-allowed' : 'pointer',
                color: styles?.colors?.textSecondary || '#6B7280',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: button.disabled ? 0.5 : 1,
                ...button.style
              }}
              title={button.title}
            >
              {button.icon && <i className={button.icon}></i>}
              {button.label && <span>{button.label}</span>}
            </button>
          ))}
          
          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: styles?.colors?.textSecondary || '#6B7280',
                padding: '4px',
                transition: 'all 0.2s'
              }}
              title="Close"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = errorColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = styles?.colors?.textSecondary || '#6B7280';
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      
      {/* Content - only show when not collapsed */}
      {!collapsed && (
        <div>
          {/* Loading state */}
          {loading && (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: styles?.colors?.textSecondary || '#6B7280',
              backgroundColor: surfaceHoverColor,
              borderRadius: '6px'
            }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '24px', marginBottom: '12px' }}></i>
              <div>Generating AI insights...</div>
            </div>
          )}
          
          {/* Error state */}
          {error && !loading && (
            <div style={{
              color: styles?.colors?.error || '#EF4444',
              padding: '12px',
              backgroundColor: errorSurfaceColor,
              borderRadius: '6px',
              border: `1px solid ${errorBorderColor}`,
              display: 'flex',
              alignItems: 'start',
              gap: '8px'
            }}>
              <i className="fa-solid fa-exclamation-triangle" style={{ marginTop: '2px' }}></i>
              <div>{error}</div>
            </div>
          )}
          
          {/* Insights content */}
          {insights && !loading && (
            <div style={{
              maxHeight: maxHeight,
              overflowY: 'auto',
              padding: '12px',
              backgroundColor: surfaceHoverColor,
              borderRadius: '6px'
            }}>
              {formatInsights(insights)}
            </div>
          )}
        </div>
      )}
      
      {/* Add styles for markdown content */}
      <style>{`
        .markdown-insights h1 { font-size: 20px; font-weight: 600; color: ${headingColor}; margin: 16px 0 12px 0; }
        .markdown-insights h2 { font-size: 18px; font-weight: 600; color: ${headingAltColor}; margin: 14px 0 10px 0; }
        .markdown-insights h3 { font-size: 16px; font-weight: 600; color: ${bodyColor}; margin: 12px 0 8px 0; }
        .markdown-insights h4 { font-size: 14px; font-weight: 600; color: ${subtleTextColor}; margin: 10px 0 6px 0; }
        .markdown-insights p { margin: 8px 0; color: ${bodyColor}; line-height: 1.6; }
        .markdown-insights ul, .markdown-insights ol { margin: 8px 0; padding-left: 24px; color: ${bodyColor}; }
        .markdown-insights li { margin: 4px 0; line-height: 1.5; }
        .markdown-insights strong { font-weight: 600; color: ${headingAltColor}; }
        .markdown-insights em { font-style: italic; }
        .markdown-insights code { background: ${codeSurfaceColor}; padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
        .markdown-insights blockquote { border-left: 3px solid ${accentColor}; padding-left: 12px; margin: 12px 0; color: ${subtleTextColor}; }
        .markdown-insights hr { border: none; border-top: 1px solid ${borderColor}; margin: 16px 0; }
        .markdown-insights a { color: ${accentColor}; text-decoration: none; }
        .markdown-insights a:hover { text-decoration: underline; }
        .markdown-insights table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .markdown-insights th, .markdown-insights td { border: 1px solid ${borderColor}; padding: 8px; text-align: left; }
        .markdown-insights th { background: ${surfaceHoverColor}; font-weight: 600; }
        .markdown-insights pre { background: ${inverseSurfaceColor}; color: ${inverseTextColor}; padding: 12px; border-radius: 6px; overflow-x: auto; }
      `}</style>
    </div>
  );
}

return AIInsightsPanel;