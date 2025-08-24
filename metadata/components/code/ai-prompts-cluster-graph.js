function AIPromptsClusterGraph({
  prompts,
  clusters,
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
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState(null);
  
  // Color palette for clusters
  const clusterColors = [
    '#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3',
    '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd',
    '#ccebc5', '#ffed6f', '#a6cee3', '#ff7f00', '#33a02c'
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

    // Create zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create container for zoom/pan
    const container = svg.append('g');

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

    // Draw links
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', d => d.value * 0.3)
      .attr('stroke-width', d => Math.max(1, d.value * 3));

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

    // Add circles for nodes
    node.append('circle')
      .attr('r', d => {
        // Size based on template text length
        const textLength = d.TemplateText?.length || 0;
        return Math.min(20, Math.max(8, Math.sqrt(textLength / 50)));
      })
      .attr('fill', d => {
        if (highlightCluster !== null && d.cluster !== highlightCluster) {
          return '#e0e0e0';
        }
        return clusterColors[d.cluster % clusterColors.length];
      })
      .attr('stroke', d => {
        if (d.ID === selectedPromptId) return '#000';
        if (d.ID === hoveredNode) return '#666';
        return '#fff';
      })
      .attr('stroke-width', d => {
        if (d.ID === selectedPromptId) return 3;
        if (d.ID === hoveredNode) return 2;
        return 1;
      })
      .attr('opacity', d => {
        if (highlightCluster !== null && d.cluster !== highlightCluster) {
          return 0.3;
        }
        return 0.9;
      });

    // Add labels with text wrapping
    const labels = node.append('foreignObject')
      .attr('x', -40)
      .attr('y', -35)
      .attr('width', 80)
      .attr('height', 24)
      .attr('pointer-events', 'none');
    
    labels.append('xhtml:div')
      .style('text-align', 'center')
      .style('font-size', '11px')
      .style('color', styles.colors?.text?.primary || '#333')
      .style('line-height', '12px')
      .style('overflow', 'hidden')
      .style('text-overflow', 'ellipsis')
      .style('display', '-webkit-box')
      .style('-webkit-line-clamp', '2')
      .style('-webkit-box-orient', 'vertical')
      .text(d => d.Name || 'Unnamed');

    // Add tooltips
    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('padding', '10px')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('border-radius', '4px')
      .style('pointer-events', 'none')
      .style('font-size', '12px')
      .style('max-width', '300px');

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
          <strong>${d.Name}</strong><br/>
          Category: ${d.Category || 'None'}<br/>
          Type: ${d.Type || 'None'}<br/>
          Cluster: ${d.cluster + 1}<br/>
          ${d.Description ? `<br/>${d.Description.substring(0, 100)}...` : ''}
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

  // Cluster legend
  const uniqueClusters = useMemo(() => {
    if (!clusters || clusters.length === 0) return [];
    const clusterSet = new Set(clusters.map(p => p.cluster));
    return Array.from(clusterSet).sort((a, b) => a - b);
  }, [clusters]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: '100%', height: '100%' }}
      />
      
      {/* Cluster legend */}
      <div style={{
        position: 'absolute',
        top: styles.spacing?.sm || '8px',
        right: styles.spacing?.sm || '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: styles.spacing?.sm || '8px',
        borderRadius: styles.borders?.radius || '4px',
        fontSize: styles.fonts?.sizes?.sm || '12px'
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Clusters</div>
        {uniqueClusters.map(cluster => (
          <div
            key={cluster}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '2px',
              cursor: 'pointer',
              opacity: highlightCluster !== null && highlightCluster !== cluster ? 0.5 : 1
            }}
            onClick={() => onClusterSelect(cluster)}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: clusterColors[cluster % clusterColors.length],
                marginRight: '6px',
                borderRadius: '50%',
                border: highlightCluster === cluster ? '2px solid #000' : '1px solid #ccc'
              }}
            />
            <span>Cluster {cluster + 1}</span>
          </div>
        ))}
      </div>
      
      {/* Instructions */}
      <div style={{
        position: 'absolute',
        bottom: styles.spacing?.sm || '8px',
        left: styles.spacing?.sm || '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: styles.spacing?.xs || '4px',
        borderRadius: styles.borders?.radius || '4px',
        fontSize: styles.fonts?.sizes?.xs || '10px',
        color: styles.colors?.text?.secondary || '#666'
      }}>
        Drag to pan • Scroll to zoom • Click nodes to select
      </div>
    </div>
  );
}