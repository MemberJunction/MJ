function AIPromptsCluster({
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  // Extract sub-components from components
  const {
    AIInsightsPanel,
    AIPromptsClusterGraph,
    AIPromptsClusterControls,
    AIPromptsClusterDetails,
    DataExportPanel
  } = components;

  if (!AIInsightsPanel) {
    console.warn('AIInsightsPanel component not available');
  }

  console.log('🔍 [AIPromptsCluster] Component loading check:');
  console.log('  - AIPromptsClusterGraph:', !!AIPromptsClusterGraph);
  console.log('  - AIPromptsClusterControls:', !!AIPromptsClusterControls);
  console.log('  - AIPromptsClusterDetails:', !!AIPromptsClusterDetails);
  console.log('  - DataExportPanel:', !!DataExportPanel);
  console.log('  - All components object:', Object.keys(components || {}));
  console.log('  - DataExportPanel type:', typeof DataExportPanel);

  // Debug when DataExportPanel changes
  useEffect(() => {
    console.log('📌 [AIPromptsCluster] DataExportPanel updated:', !!DataExportPanel);
    if (DataExportPanel) {
      console.log('  - DataExportPanel is a:', typeof DataExportPanel);
      console.log('  - DataExportPanel.toString():', DataExportPanel.toString().substring(0, 100));
    }
  }, [DataExportPanel]);

  // State management
  const [prompts, setPrompts] = useState([]);
  const [embeddings, setEmbeddings] = useState({});
  
  // Ref for cluster visualization
  const clusterGraphRef = useRef(null);
  const [clusters, setClusters] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    category: null,
    type: null,
    status: 'Active',
    role: null
  });
  const [clusterCount, setClusterCount] = useState(5);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [highlightCluster, setHighlightCluster] = useState(null);
  const [clusterNames, setClusterNames] = useState({});
  
  // AI Insights state
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState(null);

  // Load AI Prompts data on mount
  useEffect(() => {
    loadPrompts();
  }, []);

  // Load prompts from database
  const loadPrompts = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      
      const result = await utilities.rv.RunView({
        EntityName: 'MJ: AI Prompts',
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });
      
      if (result.Success && result.Results) {
        setPrompts(result.Results);
        // Load saved embeddings if available
        const savedEmbeddings = savedUserSettings?.embeddings || {};
        setEmbeddings(savedEmbeddings);
      } else {
        setError('Failed to load AI Prompts');
      }
    } catch (err) {
      setError(`Error loading prompts: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate embeddings for prompts that don't have them
  const generateEmbeddings = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      
      // Filter prompts that need embeddings
      const promptsNeedingEmbeddings = filteredPrompts.filter(
        p => !embeddings[p.ID] && p.TemplateText && p.TemplateText.length > 0
      );
      
      if (promptsNeedingEmbeddings.length === 0) {
        // All prompts already have embeddings
        performClustering();
        return;
      }
      
      // Batch process embeddings
      const batchSize = 10;
      const newEmbeddings = { ...embeddings };
      
      for (let i = 0; i < promptsNeedingEmbeddings.length; i += batchSize) {
        const batch = promptsNeedingEmbeddings.slice(i, i + batchSize);
        const texts = batch.map(p => p.TemplateText);
        
        try {
          const result = await utilities.ai.EmbedText({
            textToEmbed: texts,
            modelSize: 'small'
          });
          
          // Store embeddings
          batch.forEach((prompt, idx) => {
            newEmbeddings[prompt.ID] = result.result[idx];
          });
          
          // Update state incrementally
          setEmbeddings(newEmbeddings);
        } catch (err) {
          console.error('Error generating embeddings for batch:', err);
        }
      }
      
      // Save embeddings to user settings
      onSaveUserSettings({
        ...savedUserSettings,
        embeddings: newEmbeddings
      });
      
      // Perform clustering with new embeddings
      performClustering(newEmbeddings);
      
    } catch (err) {
      setError(`Error generating embeddings: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Perform clustering on embeddings
  const performClustering = (embeddingsToUse = embeddings) => {
    try {
      const promptsWithEmbeddings = filteredPrompts.filter(
        p => embeddingsToUse[p.ID]
      );
      
      if (promptsWithEmbeddings.length < 2) {
        setError('Need at least 2 prompts with embeddings to perform clustering');
        return;
      }
      
      // Prepare data for clustering
      const vectors = promptsWithEmbeddings.map(p => embeddingsToUse[p.ID]);
      const vectorService = utilities.ai.VectorService;
      
      // Perform k-means clustering
      // First load vectors into the service
      const vectorMap = new Map();
      promptsWithEmbeddings.forEach((prompt, idx) => {
        vectorMap.set(prompt.ID, embeddingsToUse[prompt.ID]);
      });
      vectorService.LoadVectors(vectorMap);
      
      // Then perform clustering
      const clusterResult = vectorService.KMeansCluster(
        Math.min(clusterCount, promptsWithEmbeddings.length),
        100, // max iterations
        'cosine' // distance metric
      );
      
      // Map cluster assignments back to prompts
      const clusteredPrompts = promptsWithEmbeddings.map((prompt) => {
        // Find which cluster this prompt belongs to
        let assignedCluster = 0;
        clusterResult.clusters.forEach((members, clusterId) => {
          if (members.includes(prompt.ID)) {
            assignedCluster = clusterId;
          }
        });
        
        // Store the original prompt entity along with cluster data
        return {
          entity: prompt,  // Keep the original entity object
          cluster: assignedCluster,
          embedding: embeddingsToUse[prompt.ID],
          // Expose commonly used properties for convenience
          ID: prompt.ID,
          Name: prompt.Name,
          Category: prompt.Category,
          Type: prompt.Type,
          Description: prompt.Description,
          Status: prompt.Status,
          TemplateText: prompt.TemplateText
        };
      });
      
      setClusters(clusteredPrompts);
      
      // Generate names for clusters
      generateClusterNames(clusteredPrompts);
      
    } catch (err) {
      setError(`Error performing clustering: ${err.message}`);
    }
  };
  
  // Generate AI-powered names for clusters
  const generateClusterNames = async (clusteredPrompts) => {
    try {
      // Group prompts by cluster
      const clusterGroups = {};
      clusteredPrompts.forEach(prompt => {
        if (!clusterGroups[prompt.cluster]) {
          clusterGroups[prompt.cluster] = [];
        }
        clusterGroups[prompt.cluster].push(prompt);
      });
      
      // Prepare cluster summaries for AI
      const clusterSummaries = {};
      Object.entries(clusterGroups).forEach(([clusterId, prompts]) => {
        // Get unique categories and types
        const categories = [...new Set(prompts.map(p => p.Category).filter(Boolean))];
        const types = [...new Set(prompts.map(p => p.Type).filter(Boolean))];
        
        // Sample prompt names (up to 5)
        const sampleNames = prompts.slice(0, 5).map(p => p.Name);
        
        // Sample template texts (first 150 chars, up to 3 prompts)
        const templateSamples = prompts
          .slice(0, 3)
          .map(p => p.TemplateText ? p.TemplateText.substring(0, 150) + '...' : '')
          .filter(Boolean);
        
        clusterSummaries[clusterId] = {
          promptCount: prompts.length,
          sampleNames,
          categories,
          types,
          templateSamples
        };
      });
      
      // Create a single prompt for all clusters
      const namingPrompt = `Analyze these clusters of AI prompts and generate concise, descriptive names (2-4 words) for each cluster based on their common themes or purposes.

${Object.entries(clusterSummaries).map(([id, summary]) => `
Cluster ${parseInt(id) + 1}:
- ${summary.promptCount} prompts total
- Sample names: ${summary.sampleNames.join(', ')}
- Categories: ${summary.categories.length > 0 ? summary.categories.join(', ') : 'Various'}
- Types: ${summary.types.length > 0 ? summary.types.join(', ') : 'Various'}
- Template samples: ${summary.templateSamples.length > 0 ? summary.templateSamples[0].substring(0, 100) : 'N/A'}
`).join('\n')}

Return a JSON object with cluster numbers as keys and descriptive names as values. Example format:
{
  "0": "Data Analysis Tools",
  "1": "User Communication",
  "2": "System Administration"
}

Only return the JSON object, nothing else.`;
      
      // Call AI to generate names using ExecutePrompt
      const result = await utilities.ai.ExecutePrompt({
        systemPrompt: namingPrompt,
        modelPower: 'lowest' // This is a simple task, use the cheapest/fastest model
      });
      
      if (result && result.success && result.result) {
        try {
          // Parse the JSON response - ExecutePrompt may already parse it for us
          const names = result.resultObject || JSON.parse(result.result);
          setClusterNames(names);
          
          // Optionally save to user settings
          if (onSaveUserSettings) {
            onSaveUserSettings({
              ...savedUserSettings,
              clusterNames: names
            });
          }
        } catch (parseErr) {
          console.error('Failed to parse cluster names:', parseErr);
          // Fall back to numbered clusters
          const fallbackNames = {};
          Object.keys(clusterSummaries).forEach(id => {
            fallbackNames[id] = `Cluster ${parseInt(id) + 1}`;
          });
          setClusterNames(fallbackNames);
        }
      }
    } catch (err) {
      console.error('Error generating cluster names:', err);
      // Don't let this break the clustering - just use numbers
    }
  };

  // Filter prompts based on current filters
  const filteredPrompts = useMemo(() => {
    return prompts.filter(prompt => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          prompt.Name?.toLowerCase().includes(searchLower) ||
          prompt.Description?.toLowerCase().includes(searchLower) ||
          prompt.TemplateText?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // Category filter
      if (filters.category && prompt.CategoryID !== filters.category) {
        return false;
      }
      
      // Type filter
      if (filters.type && prompt.TypeID !== filters.type) {
        return false;
      }
      
      // Status filter
      if (filters.status && prompt.Status !== filters.status) {
        return false;
      }
      
      // Role filter
      if (filters.role && prompt.PromptRole !== filters.role) {
        return false;
      }
      
      return true;
    });
  }, [prompts, filters]);

  // Get unique categories and types for filters
  const categories = useMemo(() => {
    const uniqueCategories = new Map();
    prompts.forEach(p => {
      if (p.CategoryID && p.Category) {
        uniqueCategories.set(p.CategoryID, p.Category);
      }
    });
    return Array.from(uniqueCategories, ([id, name]) => ({ id, name }));
  }, [prompts]);

  const types = useMemo(() => {
    const uniqueTypes = new Map();
    prompts.forEach(p => {
      if (p.TypeID && p.Type) {
        uniqueTypes.set(p.TypeID, p.Type);
      }
    });
    return Array.from(uniqueTypes, ([id, name]) => ({ id, name }));
  }, [prompts]);

  // Format insights text using marked library for proper markdown rendering

  const generateAIInsights = async () => {
    if (clusters.length === 0) {
      setInsightsError('Please generate clusters first');
      return;
    }
    
    setLoadingInsights(true);
    setInsightsError(null);
    
    try {
      // Prepare cluster analysis data
      const clusterAnalysis = clusters.map((cluster, idx) => {
        const clusterPrompts = filteredPrompts.filter(p => 
          embeddings[p.ID] && cluster.members.includes(p.ID)
        );
        
        return {
          id: idx,
          name: clusterNames[idx] || `Cluster ${idx + 1}`,
          size: clusterPrompts.length,
          prompts: clusterPrompts.slice(0, 3).map(p => p.Name), // Sample prompts
          categories: [...new Set(clusterPrompts.map(p => p.Category).filter(Boolean))],
          types: [...new Set(clusterPrompts.map(p => p.Type).filter(Boolean))],
          roles: [...new Set(clusterPrompts.map(p => p.PromptRole).filter(Boolean))]
        };
      });
      
      const prompt = `Analyze this AI prompts clustering data and provide insights:

Cluster Analysis:
${JSON.stringify(clusterAnalysis, null, 2)}

Total Prompts: ${prompts.length}
Filtered Prompts: ${filteredPrompts.length}
Number of Clusters: ${clusters.length}
Similarity Threshold: ${similarityThreshold}

Please provide:
1. **Cluster Quality Assessment** - How well-defined and coherent are the clusters?
2. **Thematic Patterns** - What themes or patterns emerge from the clustering?
3. **Distribution Analysis** - How are prompts distributed across clusters?
4. **Outliers and Anomalies** - Any unusual patterns or isolated prompts?
5. **Optimization Suggestions** - How could the clustering be improved?
6. **Business Insights** - What does this clustering reveal about the prompt library?
7. **Recommendations** - Specific actions to improve prompt organization

Format your response in clear markdown with headers and bullet points.`;
      
      const result = await utilities.ai.ExecutePrompt({
        systemPrompt: 'You are an expert in natural language processing, clustering analysis, and prompt engineering. Analyze the clustering results and provide actionable insights about the AI prompt library organization.',
        messages: prompt,
        preferredModels: ['GPT-OSS-120B', 'Qwen3 32B'],
        modelPower: 'high',
        temperature: 0.7,
        maxTokens: 1500
      });
      
      if (result?.success && result?.result) {
        setAiInsights(result.result);
      } else {
        setInsightsError('Failed to generate insights. Please try again.');
      }
    } catch (error) {
      setInsightsError(error.message || 'Failed to generate AI insights');
    } finally {
      setLoadingInsights(false);
    }
  };
  
  // Calculate similar prompts for selected prompt
  const similarPrompts = useMemo(() => {
    if (!selectedPrompt || !embeddings[selectedPrompt.ID]) return [];
    
    const selectedEmbedding = embeddings[selectedPrompt.ID];
    const vectorService = utilities.ai.VectorService;
    
    // Calculate similarities to all other prompts with embeddings
    const similarities = filteredPrompts
      .filter(p => p.ID !== selectedPrompt.ID && embeddings[p.ID])
      .map(prompt => {
        // Use CalculateDistance with cosine metric and convert to similarity
        const distance = vectorService.CalculateDistance(
          selectedEmbedding,
          embeddings[prompt.ID],
          'cosine'
        );
        return {
          prompt,
          similarity: 1 - distance // Convert distance to similarity
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5); // Top 5 similar prompts
    
    return similarities;
  }, [selectedPrompt, embeddings, filteredPrompts]);

  // Get cluster info for selected prompt
  const clusterInfo = useMemo(() => {
    if (!selectedPrompt || clusters.length === 0) return null;
    
    const clusteredPrompt = clusters.find(p => p.ID === selectedPrompt.ID);
    if (!clusteredPrompt) return null;
    
    const clusterMembers = clusters.filter(p => p.cluster === clusteredPrompt.cluster);
    
    return {
      clusterIndex: clusteredPrompt.cluster,
      clusterSize: clusterMembers.length,
      clusterMembers: clusterMembers.slice(0, 10).map(member => ({
        ...member,
        // Ensure entity is available for navigation
        entity: member.entity
      }))
    };
  }, [selectedPrompt, clusters]);

  // Event handlers
  const handlePromptSelect = (promptOrClusteredPrompt) => {
    // If it's a clustered prompt object, extract the entity
    // Otherwise use the prompt as-is
    const prompt = promptOrClusteredPrompt?.entity || promptOrClusteredPrompt;
    setSelectedPrompt(prompt);
    setHighlightCluster(null);
  };

  const handleClusterSelect = (clusterIndex) => {
    setHighlightCluster(clusterIndex);
    setSelectedPrompt(null);
  };

  const handleRecalculate = () => {
    generateEmbeddings();
  };

  // Prepare export data for DataExportPanel
  const prepareExportData = () => {
    console.log('🔍 [AIPromptsCluster] prepareExportData called');
    console.log('🔍 [AIPromptsCluster] clusters:', clusters);
    console.log('🔍 [AIPromptsCluster] clusters length:', clusters?.length);
    console.log('🔍 [AIPromptsCluster] clusterNames:', clusterNames);
    
    // Return empty array if no clusters
    if (!clusters || clusters.length === 0) {
      console.log('⚠️ [AIPromptsCluster] No clusters available for export');
      return [];
    }
    
    const exportData = clusters.map(prompt => ({
      ID: prompt.ID || '',
      Name: prompt.Name || '',
      Category: prompt.Category || '',
      Type: prompt.Type || '',
      // Use the LLM-generated cluster name if available, otherwise fall back to numbered cluster
      ClusterName: clusterNames[prompt.cluster] || `Cluster ${prompt.cluster + 1}`,
      Status: prompt.Status || '',
      PromptRole: prompt.PromptRole || '',
      ResponseFormat: prompt.ResponseFormat || ''
    }));
    
    console.log('🔍 [AIPromptsCluster] exportData prepared:', exportData);
    console.log('🔍 [AIPromptsCluster] exportData length:', exportData?.length);
    console.log('🔍 [AIPromptsCluster] Sample export row:', exportData?.[0]);
    
    return exportData;
  };

  // Define export columns - DataExportPanel expects key/label not field/header
  const getExportColumns = () => {
    const columns = [
      { key: 'ID', label: 'ID' },
      { key: 'Name', label: 'Name' },
      { key: 'Category', label: 'Category' },
      { key: 'Type', label: 'Type' },
      { key: 'ClusterName', label: 'Cluster' },  // Only export cluster name, not redundant number
      { key: 'Status', label: 'Status' },
      { key: 'PromptRole', label: 'Role' },
      { key: 'ResponseFormat', label: 'Response Format' }
    ];
    console.log('🔍 [AIPromptsCluster] Export columns defined:', columns);
    return columns;
  };

  const handleEditPrompt = (promptId) => {
    callbacks.OpenEntityRecord('MJ: AI Prompts', [
      { FieldName: 'ID', Value: promptId }
    ]);
  };
  
  // Function to get the cluster visualization element for PDF export
  // Using a callback function to ensure we get the element at export time
  const getClusterVisualization = useCallback(() => {
    console.log('🎨 [AIPromptsCluster] Getting cluster visualization for PDF export');
    if (!clusterGraphRef.current) {
      console.warn('⚠️ Cluster graph ref not available');
      return null;
    }
    
    // Return the container div which html2canvas can handle better
    // html2canvas has issues with standalone SVG elements from React components
    console.log('📦 Returning cluster graph container for capture');
    console.log('  - Container dimensions:', {
      width: clusterGraphRef.current.offsetWidth,
      height: clusterGraphRef.current.offsetHeight,
      hasContent: clusterGraphRef.current.children.length > 0
    });
    
    // Return the container which includes the SVG/canvas in context
    return clusterGraphRef.current;
  }, []);

  // Render component
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: styles.spacing?.md || '16px',
      backgroundColor: styles.colors?.background || '#f5f5f5',
      fontFamily: styles.typography?.fontFamily || 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        marginBottom: styles.spacing?.md || '16px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <h2 style={{
              fontSize: styles.typography?.fontSize?.xl || '24px',
              fontWeight: 'bold',
              color: styles.colors?.text?.primary || '#333',
              margin: 0
            }}>
              AI Prompts Cluster Analysis
            </h2>
            <p style={{
              fontSize: styles.typography?.fontSize?.sm || '14px',
              color: styles.colors?.text?.secondary || '#666',
              marginTop: styles.spacing?.xs || '4px'
            }}>
              Discover patterns and relationships in your AI prompts through semantic clustering
            </p>
          </div>
          
          {/* Export and AI Insights buttons */}
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center'
          }}>
            {/* Export Button */}
            {DataExportPanel && clusters.length > 0 && (
              <DataExportPanel
                data={prepareExportData()}
                columns={getExportColumns()}
                filename={`ai-prompts-clusters-${new Date().toISOString().split('T')[0]}`}
                formats={['csv', 'excel', 'pdf']}
                buttonStyle="dropdown"
                buttonText="Export"
                icon="fa-download"
                getHtmlElement={getClusterVisualization}  // Provide cluster viz for PDF
                pdfOptions={{
                  orientation: 'landscape',  // Better for wide cluster visualization
                  pageSize: 'a4',
                  margins: { top: 60, bottom: 40, left: 40, right: 40 }
                }}
                onExportStart={() => {
                  console.log('🎯 [AIPromptsCluster] Export started!');
                }}
                onExportComplete={(format) => {
                  console.log('✅ [AIPromptsCluster] Export completed!', format);
                }}
                onExportError={(error) => {
                  console.error('❌ [AIPromptsCluster] Export error:', error);
                }}
                customStyles={{
                  button: {
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: '600',
                    border: '2px solid #e2e8f0',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    color: '#4a5568',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }
                }}
                utilities={utilities}
                styles={styles}
                components={components}
                callbacks={callbacks}
              />
            )}
            
            {/* AI Insights Panel */}
            <AIInsightsPanel
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
              savedUserSettings={savedUserSettings?.aiInsights}
              onSaveUserSettings={(settings) => onSaveUserSettings?.({
                ...savedUserSettings,
                aiInsights: settings
              })}
              insights={aiInsights}
              loading={loadingInsights}
              error={insightsError}
              onGenerate={generateAIInsights}
              title="AI Prompts Cluster Analysis"
              icon="fa-wand-magic-sparkles"
              iconColor={styles?.colors?.primary || '#8B5CF6'}
              position="bottom"
              onClose={() => {
                setAiInsights(null);
                setInsightsError(null);
              }}
            />
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          padding: styles.spacing?.sm || '8px',
          backgroundColor: '#fee',
          color: '#c00',
          borderRadius: styles.borders?.radius || '4px',
          marginBottom: styles.spacing?.md || '16px'
        }}>
          {error}
        </div>
      )}

      {/* Main content area */}
      <div style={{
        display: 'flex',
        flex: 1,
        gap: styles.spacing?.md || '16px',
        overflow: 'hidden'
      }}>
        {/* Left panel - Controls */}
        <div style={{
          width: '280px',
          display: 'flex',
          flexDirection: 'column',
          gap: styles.spacing?.sm || '8px'
        }}>
          <AIPromptsClusterControls
            categories={categories}
            types={types}
            currentFilters={filters}
            clusterCount={clusterCount}
            similarityThreshold={similarityThreshold}
            isProcessing={isProcessing}
            onSearchChange={(search) => setFilters({ ...filters, search })}
            onFilterChange={setFilters}
            onClusterCountChange={setClusterCount}
            onSimilarityThresholdChange={setSimilarityThreshold}
            onRecalculate={handleRecalculate}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings}
            onSaveUserSettings={onSaveUserSettings}
          />
        </div>

        {/* Center - Graph */}
        <div 
          ref={clusterGraphRef}
          id="cluster-graph-container"
          style={{
            flex: 1,
            backgroundColor: styles.colors?.surface || 'white',
            borderRadius: styles.borders?.radius || '4px',
            padding: styles.spacing?.sm || '8px',
            position: 'relative',
            // Ensure proper rendering for export
            minHeight: '400px',
            overflow: 'visible'
          }}>
          {clusters.length > 0 ? (
            <AIPromptsClusterGraph
              prompts={clusters}
              clusters={clusters}
              clusterNames={clusterNames}
              selectedPromptId={selectedPrompt?.ID}
              similarityThreshold={similarityThreshold}
              highlightCluster={highlightCluster}
              onNodeClick={handlePromptSelect}
              onNodeHover={() => {}}
              onClusterSelect={handleClusterSelect}
              utilities={utilities}
              styles={styles}
              components={components}
              callbacks={callbacks}
              savedUserSettings={savedUserSettings}
              onSaveUserSettings={onSaveUserSettings}
            />
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: styles.colors?.text?.secondary || '#666'
            }}>
              {isProcessing ? (
                <div>Generating embeddings and clustering...</div>
              ) : (
                <div style={{
                  textAlign: 'center'
                }}>
                  <div style={{
                    marginBottom: styles.spacing?.sm || '8px'
                  }}>
                    No clusters generated yet
                  </div>
                  <div style={{
                    fontSize: styles.typography?.fontSize?.sm || '14px'
                  }}>
                    Use the "Generate Clusters" button in the controls panel to begin
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel - Details */}
        <div style={{
          width: '320px',
          backgroundColor: styles.colors?.surface || 'white',
          borderRadius: styles.borders?.radius || '4px',
          padding: styles.spacing?.md || '16px',
          overflowY: 'auto'
        }}>
          <AIPromptsClusterDetails
            selectedPrompt={selectedPrompt}
            allPrompts={filteredPrompts}
            clusterInfo={clusterInfo}
            similarPrompts={similarPrompts}
            onPromptNavigate={(promptId) => {
              const prompt = prompts.find(p => p.ID === promptId);
              if (prompt) handlePromptSelect(prompt);
            }}
            onEditPrompt={handleEditPrompt}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings}
            onSaveUserSettings={onSaveUserSettings}
          />
        </div>
      </div>
    </div>
  );
}