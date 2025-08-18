const AccountsByIndustryChart = ({ industryData, selectedIndustry, onSliceClick, colorScheme = 'default' }) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  
  const colorSchemes = {
    default: [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
      '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'
    ],
    vibrant: [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#FFD93D', '#6BCB77', '#FF6B9D'
    ],
    pastel: [
      '#FFE5E5', '#E5F3FF', '#E5FFE5', '#FFF5E5', '#F5E5FF',
      '#FFE5F5', '#E5FFF5', '#FFF0E5', '#F0E5FF', '#E5F0FF'
    ]
  };
  
  useEffect(() => {
    if (chartRef.current && industryData.labels.length > 0) {
      const ctx = chartRef.current.getContext('2d');
      
      // If chart exists, update data instead of destroying (prevents flicker)
      if (chartInstance.current) {
        // Find selected index to offset that slice
        const selectedIndex = selectedIndustry 
          ? industryData.labels.indexOf(selectedIndustry)
          : -1;
        
        // Create offset array - 20px for selected slice, 8px for hover
        const offsets = industryData.labels.map((_, i) => 
          i === selectedIndex ? 20 : 0
        );
        
        // Update chart data and offset without destroying
        chartInstance.current.data.labels = industryData.labels;
        chartInstance.current.data.datasets[0].data = industryData.data;
        chartInstance.current.data.datasets[0].offset = offsets;
        chartInstance.current.update('none'); // 'none' animation mode prevents flicker
        return;
      }
      
      // Only create new chart if it doesn't exist
      const selectedIndex = selectedIndustry 
        ? industryData.labels.indexOf(selectedIndustry)
        : -1;
      
      const offsets = industryData.labels.map((_, i) => 
        i === selectedIndex ? 20 : 0
      );
      
      chartInstance.current = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: industryData.labels,
          datasets: [{
            data: industryData.data,
            backgroundColor: colorSchemes[colorScheme],
            borderWidth: 2,
            borderColor: '#fff',
            hoverOffset: 8,
            offset: offsets // Initial offset for selected slice
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              left: 20,
              right: 20,
              top: 20,
              bottom: 20
            }
          },
          animation: {
            animateRotate: true,
            animateScale: false
          },
          plugins: {
            legend: {
              position: 'right',
              align: 'center',
              labels: {
                padding: 10,
                boxWidth: 12,
                font: { size: 12 },
                generateLabels: (chart) => {
                  const data = chart.data;
                  return data.labels.map((label, i) => ({
                    text: `${label} (${industryData.data[i]})`,
                    fillStyle: data.datasets[0].backgroundColor[i],
                    hidden: false,
                    index: i,
                    // Add bold font for selected item
                    font: {
                      size: 12,
                      weight: label === selectedIndustry ? 'bold' : 'normal'
                    }
                  }));
                }
              },
              onClick: (e, legendItem, legend) => {
                const index = legendItem.index;
                const label = industryData.labels[index];
                onSliceClick(label);
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.parsed;
                  const percentage = industryData.percentages[context.dataIndex];
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          },
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const index = elements[0].index;
              const label = industryData.labels[index];
              onSliceClick(label);
            }
          }
        }
      });
    }
    
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [industryData, colorScheme]); // Remove onSliceClick from deps to prevent recreation
  
  // Update selection without recreating chart
  useEffect(() => {
    if (chartInstance.current) {
      const selectedIndex = selectedIndustry 
        ? industryData.labels.indexOf(selectedIndustry)
        : -1;
      
      // Update offsets for selected slice
      const offsets = industryData.labels.map((_, i) => 
        i === selectedIndex ? 20 : 0
      );
      
      chartInstance.current.data.datasets[0].offset = offsets;
      
      // Update legend font weights
      chartInstance.current.options.plugins.legend.labels.generateLabels = (chart) => {
        const data = chart.data;
        return data.labels.map((label, i) => ({
          text: `${label} (${industryData.data[i]})`,
          fillStyle: data.datasets[0].backgroundColor[i],
          hidden: false,
          index: i,
          font: {
            size: 12,
            weight: label === selectedIndustry ? 'bold' : 'normal'
          }
        }));
      };
      
      chartInstance.current.update('none'); // No animation to prevent flicker
    }
  }, [selectedIndustry, industryData]);
  
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <canvas ref={chartRef}></canvas>
    </div>
  );
};