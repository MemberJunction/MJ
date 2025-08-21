function USAccountHeatmap({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [stateAccounts, setStateAccounts] = useState([]);
  const [accountsByState, setAccountsByState] = useState({});
  const [viewMode, setViewMode] = useState(savedUserSettings?.viewMode || 'count');
  const svgRef = useRef(null);
  const tooltipRef = useRef(null);

  // State name to abbreviation mapping
  const stateAbbreviations = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
    'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
    'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
    'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
    'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
    'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
    'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (accounts.length > 0) {
      processAccountsByState();
    }
  }, [accounts]);

  useEffect(() => {
    if (Object.keys(accountsByState).length > 0 && svgRef.current) {
      renderMap();
    }
  }, [accountsByState, viewMode]);

  const loadAccounts = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await utilities.rv.RunView({
        EntityName: 'Accounts',
        OrderBy: 'AccountName ASC'
      });

      if (result.Success) {
        setAccounts(result.Results || []);
      } else {
        setError(result.ErrorMessage || 'Failed to load accounts');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const processAccountsByState = () => {
    const stateData = {};
    
    // Initialize all states
    Object.keys(stateAbbreviations).forEach(stateName => {
      stateData[stateName] = {
        accounts: [],
        count: 0,
        totalRevenue: 0,
        avgRevenue: 0
      };
    });
    
    // Group accounts by state (using BillingState field)
    accounts.forEach(account => {
      const state = account.BillingState;
      // Handle both full state names and abbreviations
      let stateName = state;
      
      // If it's an abbreviation, convert to full name
      if (state && state.length === 2) {
        // Reverse lookup from abbreviation to full name
        stateName = Object.keys(stateAbbreviations).find(
          key => stateAbbreviations[key] === state.toUpperCase()
        );
      }
      
      if (stateName && stateData[stateName]) {
        stateData[stateName].accounts.push(account);
        stateData[stateName].count++;
        stateData[stateName].totalRevenue += account.AnnualRevenue || 0;
      }
    });
    
    // Calculate averages
    Object.keys(stateData).forEach(state => {
      if (stateData[state].count > 0) {
        stateData[state].avgRevenue = stateData[state].totalRevenue / stateData[state].count;
      }
    });
    
    setAccountsByState(stateData);
  };

  const renderMap = () => {
    const container = svgRef.current;
    if (!container) return;
    
    // Clear previous map
    d3.select(container).selectAll('*').remove();
    
    const width = container.clientWidth;
    const height = 500;
    
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);
    
    // Create projection for US map - adjust scale for better fit
    const projection = d3.geoAlbersUsa()
      .scale(width * 1.2)
      .translate([width / 2, height / 2]);
    
    const path = d3.geoPath().projection(projection);
    
    // Get max values for color scale
    const maxCount = Math.max(...Object.values(accountsByState).map(d => d.count));
    const maxRevenue = Math.max(...Object.values(accountsByState).map(d => d.totalRevenue));
    
    // Color scale based on view mode
    const colorScale = d3.scaleSequential()
      .domain([0, viewMode === 'count' ? maxCount : maxRevenue])
      .interpolator(d3.interpolateBlues);
    
    // Load US TopoJSON data
    d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json')
      .then(us => {
        // Convert TopoJSON to GeoJSON using topojson-client
        const statesFeatures = topojson.feature(us, us.objects.states).features;
        
        // Draw states
        svg.append('g')
          .selectAll('path')
          .data(statesFeatures)
          .enter().append('path')
          .attr('d', path)
          .attr('fill', d => {
            // GeoJSON uses 'name' property for state names
            const stateName = d.properties.name || d.properties.NAME || d.properties.State;
            const stateData = accountsByState[stateName];
            if (!stateData || stateData.count === 0) {
              return '#f0f0f0';
            }
            const value = viewMode === 'count' ? stateData.count : stateData.totalRevenue;
            return colorScale(value);
          })
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 1)
          .style('cursor', 'pointer')
          .on('mouseover', function(event, d) {
            const stateName = d.properties.name || d.properties.NAME || d.properties.State;
            const stateData = accountsByState[stateName];
            
            // Highlight state
            d3.select(this)
              .attr('stroke', '#333')
              .attr('stroke-width', 2);
            
            // Show tooltip
            const tooltip = d3.select('body').append('div')
              .attr('class', 'map-tooltip')
              .style('position', 'absolute')
              .style('background', 'rgba(0, 0, 0, 0.8)')
              .style('color', 'white')
              .style('padding', '8px')
              .style('border-radius', '4px')
              .style('font-size', '12px')
              .style('pointer-events', 'none')
              .style('z-index', '1000');
            
            tooltip.html(`
              <strong>${stateName}</strong><br/>
              Accounts: ${stateData.count}<br/>
              Total Revenue: ${formatCurrency(stateData.totalRevenue)}<br/>
              Avg Revenue: ${formatCurrency(stateData.avgRevenue)}
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
            
            tooltipRef.current = tooltip;
          })
          .on('mousemove', function(event) {
            if (tooltipRef.current) {
              tooltipRef.current
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
            }
          })
          .on('mouseout', function() {
            // Remove highlight
            d3.select(this)
              .attr('stroke', '#ffffff')
              .attr('stroke-width', 1);
            
            // Remove tooltip
            if (tooltipRef.current) {
              tooltipRef.current.remove();
              tooltipRef.current = null;
            }
          })
          .on('click', function(event, d) {
            const stateName = d.properties.name || d.properties.NAME || d.properties.State;
            handleStateClick(stateName);
          });
        
        // Add state labels for states with accounts
        svg.append('g')
          .selectAll('text')
          .data(statesFeatures)
          .enter().append('text')
          .attr('transform', d => {
            const centroid = path.centroid(d);
            return `translate(${centroid})`;
          })
          .attr('text-anchor', 'middle')
          .attr('font-size', '10px')
          .attr('font-weight', 'bold')
          .attr('fill', d => {
            const stateName = d.properties.name || d.properties.NAME || d.properties.State;
            const stateData = accountsByState[stateName];
            return stateData && stateData.count > 0 ? '#333' : 'transparent';
          })
          .style('pointer-events', 'none')
          .text(d => {
            const stateName = d.properties.name || d.properties.NAME || d.properties.State;
            const stateData = accountsByState[stateName];
            if (stateData && stateData.count > 0) {
              return stateAbbreviations[stateName] || '';
            }
            return '';
          });
      })
      .catch(err => {
        console.error('Error loading map data:', err);
        // Try an alternative approach - create a simple placeholder
        svg.append('text')
          .attr('x', width / 2)
          .attr('y', height / 2)
          .attr('text-anchor', 'middle')
          .attr('font-size', '16px')
          .attr('fill', '#666')
          .text('Map data failed to load. Showing statistics only.');
        
        // Show error but don't block the component
        console.warn('Failed to load US map data. This might be due to CORS or network issues.');
      });
    
    // Add legend
    const legendWidth = 200;
    const legendHeight = 10;
    
    const legend = svg.append('g')
      .attr('transform', `translate(${width - legendWidth - 20}, ${height - 40})`);
    
    // Create gradient for legend
    const defs = svg.append('defs');
    const linearGradient = defs.append('linearGradient')
      .attr('id', 'legend-gradient');
    
    // Add gradient stops
    const numStops = 10;
    for (let i = 0; i <= numStops; i++) {
      linearGradient.append('stop')
        .attr('offset', `${(i / numStops) * 100}%`)
        .attr('stop-color', colorScale(i / numStops * (viewMode === 'count' ? maxCount : maxRevenue)));
    }
    
    // Draw legend rectangle
    legend.append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', 'url(#legend-gradient)');
    
    // Add legend labels
    legend.append('text')
      .attr('y', -5)
      .attr('font-size', '11px')
      .text(viewMode === 'count' ? 'Number of Accounts' : 'Total Revenue');
    
    legend.append('text')
      .attr('y', legendHeight + 15)
      .attr('font-size', '10px')
      .text('0');
    
    legend.append('text')
      .attr('x', legendWidth)
      .attr('y', legendHeight + 15)
      .attr('text-anchor', 'end')
      .attr('font-size', '10px')
      .text(viewMode === 'count' ? maxCount : formatCurrency(maxRevenue));
  };

  const handleStateClick = (stateName) => {
    const stateData = accountsByState[stateName];
    if (stateData && stateData.count > 0) {
      setSelectedState(stateName);
      setStateAccounts(stateData.accounts);
    }
  };

  const formatCurrency = (amount) => {
    if (amount >= 1000000) {
      return '$' + (amount / 1000000).toFixed(1) + 'M';
    } else if (amount >= 1000) {
      return '$' + (amount / 1000).toFixed(0) + 'K';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    onSaveUserSettings({ ...savedUserSettings, viewMode: mode });
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', color: '#6B7280' }}>Loading account data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#FEE2E2', borderRadius: '8px', margin: '20px' }}>
        <div style={{ color: '#991B1B', fontWeight: 'bold' }}>Error loading data</div>
        <div style={{ color: '#DC2626', marginTop: '8px' }}>{error}</div>
        <button 
          onClick={loadAccounts}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: '#EF4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Account Distribution Map</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleViewModeChange('count')}
              style={{
                padding: '6px 12px',
                backgroundColor: viewMode === 'count' ? '#3B82F6' : '#F3F4F6',
                color: viewMode === 'count' ? 'white' : '#374151',
                border: '1px solid',
                borderColor: viewMode === 'count' ? '#3B82F6' : '#D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              By Count
            </button>
            <button
              onClick={() => handleViewModeChange('revenue')}
              style={{
                padding: '6px 12px',
                backgroundColor: viewMode === 'revenue' ? '#3B82F6' : '#F3F4F6',
                color: viewMode === 'revenue' ? 'white' : '#374151',
                border: '1px solid',
                borderColor: viewMode === 'revenue' ? '#3B82F6' : '#D1D5DB',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              By Revenue
            </button>
            <button
              onClick={loadAccounts}
              style={{
                padding: '6px 12px',
                backgroundColor: '#10B981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Refresh
            </button>
          </div>
        </div>
        
        {/* Summary Stats */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#F9FAFB', 
            borderRadius: '8px',
            borderLeft: '4px solid #3B82F6'
          }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Total Accounts</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
              {accounts.length.toLocaleString()}
            </div>
          </div>
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#F9FAFB', 
            borderRadius: '8px',
            borderLeft: '4px solid #10B981'
          }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>States with Accounts</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827' }}>
              {Object.values(accountsByState).filter(s => s.count > 0).length}
            </div>
          </div>
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#F9FAFB', 
            borderRadius: '8px',
            borderLeft: '4px solid #F59E0B'
          }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Top State</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>
              {(() => {
                const topState = Object.entries(accountsByState)
                  .filter(([_, data]) => data.count > 0)
                  .sort((a, b) => b[1].count - a[1].count)[0];
                return topState ? `${topState[0]} (${topState[1].count})` : 'N/A';
              })()}
            </div>
          </div>
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#F9FAFB', 
            borderRadius: '8px',
            borderLeft: '4px solid #8B5CF6'
          }}>
            <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Total Revenue</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827' }}>
              {formatCurrency(accounts.reduce((sum, acc) => sum + (acc.AnnualRevenue || 0), 0))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Map Container */}
      <div 
        ref={svgRef}
        style={{ 
          flex: 1, 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          padding: '20px',
          border: '1px solid #E5E7EB',
          minHeight: '500px'
        }}
      />
      
      {/* State Details Modal */}
      {selectedState && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => setSelectedState(null)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '900px',
              height: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                {selectedState} Accounts
                <span style={{ marginLeft: '12px', fontSize: '16px', color: '#6B7280' }}>
                  ({stateAccounts.length} accounts)
                </span>
              </h3>
              <button
                onClick={() => setSelectedState(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6B7280',
                  padding: '0',
                  width: '30px',
                  height: '30px'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              {stateAccounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                  No accounts found in {selectedState}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E5E7EB' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Account Name</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>City</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Industry</th>
                      <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Annual Revenue</th>
                      <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stateAccounts.map((account, index) => (
                      <tr 
                        key={account.ID}
                        style={{ 
                          borderBottom: '1px solid #E5E7EB',
                          backgroundColor: index % 2 === 0 ? 'white' : '#F9FAFB'
                        }}
                      >
                        <td style={{ padding: '12px', fontWeight: '500' }}>{account.AccountName}</td>
                        <td style={{ padding: '12px' }}>{account.City || '-'}</td>
                        <td style={{ padding: '12px' }}>{account.Industry || '-'}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                          {formatCurrency(account.AnnualRevenue)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            onClick={() => {
                              if (callbacks.OpenEntityRecord) {
                                callbacks.OpenEntityRecord('Accounts', [
                                  { FieldName: 'ID', Value: account.ID }
                                ]);
                                setSelectedState(null);
                              }
                            }}
                            style={{
                              padding: '6px 8px',
                              backgroundColor: '#3B82F6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '18px'
                            }}
                            title="Open record"
                          >
                            ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}