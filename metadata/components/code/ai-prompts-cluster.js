function AIPromptsCluster({ 
  utilities, 
  styles, 
  components, 
  callbacks, 
  savedUserSettings, 
  onSaveUserSettings,
  data 
}) {
  // Load sub-components
  const ClusterGraph = components['AIPromptsClusterGraph'];
  const ClusterControls = components['AIPromptsClusterControls'];
  const ClusterDetails = components['AIPromptsClusterDetails'];

  // State management
  const [prompts, setPrompts] = useState([]);
  const [embeddings, setEmbeddings] = useState({});
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
        EntityName: 'AI Prompts',
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

  const handleExport = () => {
    // Create export data
    const exportData = clusters.map(prompt => ({
      ID: prompt.ID,
      Name: prompt.Name,
      Category: prompt.Category,
      Type: prompt.Type,
      Cluster: prompt.cluster
    }));
    
    // Convert to CSV
    const headers = ['ID', 'Name', 'Category', 'Type', 'Cluster'];
    const csv = [
      headers.join(','),
      ...exportData.map(row => 
        headers.map(h => `"${row[h] || ''}"`).join(',')
      )
    ].join('\n');
    
    // Download file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-prompts-clusters-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEditPrompt = (promptId) => {
    callbacks.OpenEntityRecord('AI Prompts', [
      { FieldName: 'ID', Value: promptId }
    ]);
  };

  // Render component
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: styles.spacing?.md || '16px',
      backgroundColor: styles.colors?.background || '#f5f5f5',
      fontFamily: styles.fonts?.body || 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        marginBottom: styles.spacing?.md || '16px'
      }}>
        <h2 style={{
          fontSize: styles.fonts?.sizes?.xl || '24px',
          fontWeight: 'bold',
          color: styles.colors?.text?.primary || '#333',
          margin: 0
        }}>
          AI Prompts Cluster Analysis
        </h2>
        <p style={{
          fontSize: styles.fonts?.sizes?.sm || '14px',
          color: styles.colors?.text?.secondary || '#666',
          marginTop: styles.spacing?.xs || '4px'
        }}>
          Discover patterns and relationships in your AI prompts through semantic clustering
        </p>
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
          <ClusterControls
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
            onExport={handleExport}
            utilities={utilities}
            styles={styles}
            components={components}
            callbacks={callbacks}
            savedUserSettings={savedUserSettings}
            onSaveUserSettings={onSaveUserSettings}
          />
        </div>

        {/* Center - Graph */}
        <div style={{
          flex: 1,
          backgroundColor: styles.colors?.surface || 'white',
          borderRadius: styles.borders?.radius || '4px',
          padding: styles.spacing?.sm || '8px',
          position: 'relative'
        }}>
          {clusters.length > 0 ? (
            <ClusterGraph
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
                    fontSize: styles.fonts?.sizes?.sm || '14px'
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
          <ClusterDetails
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