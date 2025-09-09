function AIPromptsClusterGraph({
  prompts,
  clusters,
  clusterNames = {},
  selectedPromptId,
  similarityThreshold = 0.7,
  highlightCluster,
  onNodeClick,
  onNodeHover,
  onClusterSelect,
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const currentTransform = useRef(null);
  
  // Initialize zoom behavior once, outside useEffect
  const zoomBehavior = useRef(null);
  if (!zoomBehavior.current && typeof d3 !== 'undefined') {
    zoomBehavior.current = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        currentTransform.current = event.transform;
        if (containerRef.current) {
          containerRef.current.attr('transform', event.transform);
        }
      });
  }
  
  // Modern gradient color palette for clusters
  const clusterColors = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
    'linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)'
  ];
  
  // Solid colors for D3 (gradients will be defined in defs)
  const solidColors = [
    '#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a',
    '#30cfd0', '#a8edea', '#ff9a9e', '#fbc2eb', '#fdcbf1'
  ];

  // Update dimensions on mount and resize
  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current && svgRef.current.parentElement) {
        const { width, height } = svgRef.current.parentElement.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Create D3 visualization
  useEffect(() => {
    if (!prompts || prompts.length === 0 || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous visualization

    const width = dimensions.width;
    const height = dimensions.height;

    // Create container for zoom/pan first
    const container = svg.append('g');
    containerRef.current = container;
    
    // Apply zoom behavior to svg (it's already initialized in component)
    if (zoomBehavior.current) {
      // Update the zoom handler to use the new container
      zoomBehavior.current.on('zoom', (event) => {
        currentTransform.current = event.transform;
        container.attr('transform', event.transform);
      });
      
      svg.call(zoomBehavior.current);
    }
    
    // Apply saved transform if it exists
    if (currentTransform.current) {
      svg.call(zoomBehavior.current.transform, currentTransform.current);
      container.attr('transform', currentTransform.current);
    }
    
    // Add gradient definitions
    const defs = svg.append('defs');
    
    // Create gradients for each cluster
    solidColors.forEach((color, i) => {
      const gradient = defs.append('radialGradient')
        .attr('id', `cluster-gradient-${i}`)
        .attr('cx', '30%')
        .attr('cy', '30%');
      
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', color)
        .attr('stop-opacity', 0.8);
      
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', d3.color(color).darker(0.5))
        .attr('stop-opacity', 1);
    });
    
    // Add glow filter
    const filter = defs.append('filter')
      .attr('id', 'glow');
    
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');
    
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode')
      .attr('in', 'coloredBlur');
    feMerge.append('feMergeNode')
      .attr('in', 'SourceGraphic');
    
    // Add strong glow for selection
    const selectionFilter = defs.append('filter')
      .attr('id', 'selection-glow')
      .attr('width', '300%')
      .attr('height', '300%')
      .attr('x', '-100%')
      .attr('y', '-100%');
    
    selectionFilter.append('feGaussianBlur')
      .attr('stdDeviation', '8')
      .attr('result', 'coloredBlur');
    
    const selectionMerge = selectionFilter.append('feMerge');
    selectionMerge.append('feMergeNode')
      .attr('in', 'coloredBlur');
    selectionMerge.append('feMergeNode')
      .attr('in', 'SourceGraphic');

    // Calculate similarities between all nodes
    const links = [];
    const vectorService = utilities.ai.VectorService;
    
    // Load vectors into the service for similarity calculations
    const vectorMap = new Map();
    prompts.forEach(prompt => {
      if (prompt.embedding) {
        vectorMap.set(prompt.ID, prompt.embedding);
      }
    });
    vectorService.LoadVectors(vectorMap);
    
    for (let i = 0; i < prompts.length; i++) {
      for (let j = i + 1; j < prompts.length; j++) {
        if (prompts[i].embedding && prompts[j].embedding) {
          // Use CalculateDistance with cosine metric (returns distance, so we need to convert to similarity)
          const distance = vectorService.CalculateDistance(
            prompts[i].embedding,
            prompts[j].embedding,
            'cosine'
          );
          const similarity = 1 - distance; // Convert distance to similarity
          
          if (similarity >= similarityThreshold) {
            links.push({
              source: prompts[i].ID,
              target: prompts[j].ID,
              value: similarity
            });
          }
        }
      }
    }

    // Create force simulation
    const simulation = d3.forceSimulation(prompts)
      .force('link', d3.forceLink(links)
        .id(d => d.ID)
        .distance(d => 100 * (1 - d.value)) // Distance inversely proportional to similarity
        .strength(d => d.value * 0.5))
      .force('charge', d3.forceManyBody()
        .strength(-200)
        .distanceMax(300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(25))
      .force('cluster', forceCluster()); // Custom clustering force

    // Custom force to pull nodes toward their cluster center
    function forceCluster() {
      const strength = 0.2;
      let nodes;
      
      function force(alpha) {
        const centroids = d3.rollup(
          nodes,
          v => ({
            x: d3.mean(v, d => d.x),
            y: d3.mean(v, d => d.y),
            count: v.length
          }),
          d => d.cluster
        );
        
        nodes.forEach(node => {
          const centroid = centroids.get(node.cluster);
          if (centroid && centroid.count > 1) {
            node.vx -= (node.x - centroid.x) * strength * alpha;
            node.vy -= (node.y - centroid.y) * strength * alpha;
          }
        });
      }
      
      force.initialize = function(_) {
        nodes = _;
      };
      
      return force;
    }

    // Draw links with modern styling
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', 'url(#link-gradient)')
      .attr('stroke-opacity', d => d.value * 0.2)
      .attr('stroke-width', d => Math.max(0.5, d.value * 2))
      .attr('stroke-linecap', 'round');
    
    // Add gradient for links
    const linkGradient = defs.append('linearGradient')
      .attr('id', 'link-gradient')
      .attr('gradientUnits', 'userSpaceOnUse');
    
    linkGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#e0e0e0')
      .attr('stop-opacity', 0.3);
    
    linkGradient.append('stop')
      .attr('offset', '50%')
      .attr('stop-color', '#c0c0c0')
      .attr('stop-opacity', 0.5);
    
    linkGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#e0e0e0')
      .attr('stop-opacity', 0.3);

    // Create node groups
    const node = container.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(prompts)
      .enter().append('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add shadow circles
    node.append('circle')
      .attr('r', d => {
        const textLength = d.TemplateText?.length || 0;
        return Math.min(25, Math.max(12, Math.sqrt(textLength / 40))) + 2;
      })
      .attr('fill', 'black')
      .attr('opacity', 0.1)
      .attr('transform', 'translate(2, 2)');
    
    // Add main circles for nodes with modern styling
    node.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => {
        // Size based on template text length
        const textLength = d.TemplateText?.length || 0;
        return Math.min(25, Math.max(12, Math.sqrt(textLength / 40)));
      })
      .attr('fill', d => {
        if (highlightCluster !== null && d.cluster !== highlightCluster) {
          return '#f5f5f5';
        }
        return `url(#cluster-gradient-${d.cluster % solidColors.length})`;
      })
      .attr('stroke', d => {
        if (d.ID === selectedPromptId) return '#00ff88'; // Neon green for selection
        if (d.ID === hoveredNode) return solidColors[d.cluster % solidColors.length];
        return 'white';
      })
      .attr('stroke-width', d => {
        if (d.ID === selectedPromptId) return 5;
        if (d.ID === hoveredNode) return 3;
        return 2;
      })
      .attr('opacity', d => {
        if (highlightCluster !== null && d.cluster !== highlightCluster) {
          return 0.2;
        }
        return 1;
      })
      .attr('filter', d => {
        if (d.ID === selectedPromptId) return 'url(#selection-glow)';
        if (d.ID === hoveredNode) return 'url(#glow)';
        return null;
      })
      .style('transition', 'all 0.3s ease');

    // Add labels with modern typography
    const labels = node.append('foreignObject')
      .attr('x', -45)
      .attr('y', -40)
      .attr('width', 90)
      .attr('height', 28)
      .attr('pointer-events', 'none');
    
    labels.append('xhtml:div')
      .style('text-align', 'center')
      .style('font-size', '12px')
      .style('font-weight', '500')
      .style('color', '#2d3748')
      .style('line-height', '14px')
      .style('overflow', 'hidden')
      .style('text-overflow', 'ellipsis')
      .style('display', '-webkit-box')
      .style('-webkit-line-clamp', '2')
      .style('-webkit-box-orient', 'vertical')
      .style('text-shadow', '0 1px 2px rgba(255,255,255,0.8)')
      .text(d => d.Name || 'Unnamed');

    // Add modern tooltips
    const tooltip = d3.select('body').append('div')
      .attr('class', 'graph-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('padding', '12px')
      .style('background', 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(249,250,251,0.98) 100%)')
      .style('color', '#2d3748')
      .style('border-radius', '12px')
      .style('pointer-events', 'none')
      .style('font-size', '13px')
      .style('max-width', '320px')
      .style('box-shadow', '0 10px 40px rgba(0,0,0,0.15), 0 2px 10px rgba(0,0,0,0.1)')
      .style('border', '1px solid rgba(255,255,255,0.8)')
      .style('backdrop-filter', 'blur(10px)');

    // Node interactions
    node
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClick(d);
      })
      .on('mouseover', (event, d) => {
        setHoveredNode(d.ID);
        onNodeHover(d);
        
        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        
        tooltip.html(`
          <div style="font-weight: 600; margin-bottom: 8px; color: #1a202c; font-size: 14px;">${d.Name}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
            <span style="padding: 2px 8px; background: #edf2f7; border-radius: 4px; font-size: 11px;">
              ${d.Category || 'No Category'}
            </span>
            <span style="padding: 2px 8px; background: #edf2f7; border-radius: 4px; font-size: 11px;">
              ${d.Type || 'No Type'}
            </span>
            <span style="padding: 2px 8px; background: ${solidColors[d.cluster % solidColors.length]}20; border-radius: 4px; font-size: 11px; color: ${solidColors[d.cluster % solidColors.length]};">
              Cluster ${d.cluster + 1}
            </span>
          </div>
          ${d.Description ? `<div style="font-size: 12px; color: #4a5568; line-height: 1.4;">${d.Description.substring(0, 120)}${d.Description.length > 120 ? '...' : ''}</div>` : ''}
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', () => {
        setHoveredNode(null);
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      });

    // Click on background to deselect
    svg.on('click', () => {
      onNodeClick(null);
    });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup on unmount
    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [prompts, clusters, selectedPromptId, similarityThreshold, highlightCluster, dimensions]);

  // Zoom control functions - don't use useCallback to ensure we have current refs
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehavior.current) {
      console.warn('Zoom in - refs not ready');
      return;
    }
    
    const svg = d3.select(svgRef.current);
    const currentZoom = currentTransform.current ? currentTransform.current.k : 1;
    const newZoom = Math.min(currentZoom * 1.5, 10);
    
    svg.transition()
      .duration(300)
      .call(zoomBehavior.current.scaleTo, newZoom);
  };
  
  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehavior.current) {
      console.warn('Zoom out - refs not ready');
      return;
    }
    
    const svg = d3.select(svgRef.current);
    const currentZoom = currentTransform.current ? currentTransform.current.k : 1;
    const newZoom = Math.max(currentZoom / 1.5, 0.1);
    
    svg.transition()
      .duration(300)
      .call(zoomBehavior.current.scaleTo, newZoom);
  };
  
  const handleResetZoom = () => {
    if (!svgRef.current || !zoomBehavior.current) {
      console.warn('Reset zoom - refs not ready');
      return;
    }
    
    const svg = d3.select(svgRef.current);
    svg.transition()
      .duration(300)
      .call(zoomBehavior.current.transform, d3.zoomIdentity);
    currentTransform.current = d3.zoomIdentity;
  };
  
  // Cluster legend
  const uniqueClusters = useMemo(() => {
    if (!clusters || clusters.length === 0) return [];
    const clusterSet = new Set(clusters.map(p => p.cluster));
    return Array.from(clusterSet).sort((a, b) => a - b);
  }, [clusters]);

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      borderRadius: '16px',
      overflow: 'hidden'
    }}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Modern Zoom Controls */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 10
      }}>
        <button
          onClick={handleZoomIn}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            color: '#4a5568',
            cursor: 'pointer',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Zoom In"
        >
          <i className="fa-solid fa-plus"></i>
        </button>
        
        <button
          onClick={handleZoomOut}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            color: '#4a5568',
            cursor: 'pointer',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Zoom Out"
        >
          <i className="fa-solid fa-minus"></i>
        </button>
        
        <button
          onClick={handleResetZoom}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            color: '#4a5568',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          title="Reset View"
        >
          <i className="fa-solid fa-expand"></i>
        </button>
      </div>
      
      {/* Modern Cluster Legend */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '16px',
        borderRadius: '12px',
        fontSize: '13px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
        backdropFilter: 'blur(10px)',
        minWidth: '200px',
        maxWidth: '280px'
      }}>
        <div style={{ 
          fontWeight: '600', 
          marginBottom: '12px',
          color: '#2d3748',
          fontSize: '14px'
        }}>
          Clusters
        </div>
        {uniqueClusters.map(cluster => {
          const clusterName = clusterNames[cluster] || `Cluster ${cluster + 1}`;
          return (
            <div
              key={cluster}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                marginBottom: '10px',
                cursor: 'pointer',
                opacity: highlightCluster !== null && highlightCluster !== cluster ? 0.4 : 1,
                transition: 'all 0.2s ease',
                padding: '6px 8px',
                borderRadius: '6px',
                backgroundColor: highlightCluster === cluster ? `${solidColors[cluster % solidColors.length]}15` : 'transparent'
              }}
              onClick={() => onClusterSelect(cluster)}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = `${solidColors[cluster % solidColors.length]}10`}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = highlightCluster === cluster ? `${solidColors[cluster % solidColors.length]}15` : 'transparent'}
              title={clusterName}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  background: `linear-gradient(135deg, ${solidColors[cluster % solidColors.length]} 0%, ${d3.color(solidColors[cluster % solidColors.length]).darker(0.3)} 100%)`,
                  marginRight: '10px',
                  marginTop: '2px',
                  borderRadius: '50%',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  flexShrink: 0
                }}
              />
              <span style={{ 
                color: '#4a5568', 
                fontWeight: '500',
                display: 'block',
                lineHeight: '1.3',
                wordWrap: 'break-word',
                whiteSpace: 'normal'
              }}>
                {clusterName}
              </span>
            </div>
          );
        })}
      </div>
      
      {/* Modern Instructions */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '8px 16px',
        borderRadius: '20px',
        fontSize: '12px',
        color: '#718096',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        gap: '16px',
        alignItems: 'center'
      }}>
        <span><i className="fa-solid fa-hand" style={{ marginRight: '4px' }}></i>Drag to pan</span>
        <span>•</span>
        <span><i className="fa-solid fa-magnifying-glass" style={{ marginRight: '4px' }}></i>Scroll to zoom</span>
        <span>•</span>
        <span><i className="fa-solid fa-pointer" style={{ marginRight: '4px' }}></i>Click to select</span>
      </div>
    </div>
  );
}