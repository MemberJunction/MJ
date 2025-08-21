/**
 * Test samples for library-specific linting
 */

// Chart.js - Should fail: Missing cleanup in useEffect
export const chartJsBadCleanup = `
function ChartComponent({ data }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const chart = new Chart(canvasRef.current.getContext('2d'), {
      type: 'bar',
      data: data
    });
    
    // Missing cleanup - should trigger violation
  }, [data]);
  
  return <canvas ref={canvasRef} />;
}`;

// Chart.js - Good: Proper cleanup
export const chartJsGoodCleanup = `
function ChartComponent({ data }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'bar',
      data: data
    });
    
    return () => {
      chartRef.current?.destroy();
    };
  }, [data]);
  
  return <canvas ref={canvasRef} />;
}`;

// ApexCharts - Should fail: Missing render() call
export const apexChartsBadRender = `
function ApexChartComponent({ series }) {
  const chartRef = useRef(null);
  
  useEffect(() => {
    if (!chartRef.current) return;
    
    const chart = new ApexCharts(chartRef.current, {
      chart: { type: 'line' },
      series: series
    });
    
    // Missing chart.render() - should trigger violation
    
    return () => {
      chart.destroy();
    };
  }, [series]);
  
  return <div ref={chartRef} />;
}`;

// ApexCharts - Good: Proper render and cleanup
export const apexChartsGood = `
function ApexChartComponent({ series }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartInstance.current = new ApexCharts(chartRef.current, {
      chart: { type: 'line', height: 350 },
      series: series
    });
    
    chartInstance.current.render();
    
    return () => {
      chartInstance.current?.destroy();
    };
  }, [series]);
  
  return <div ref={chartRef} />;
}`;

// D3.js - Should fail: No cleanup for selections
export const d3BadCleanup = `
function D3Component({ data }) {
  const svgRef = useRef(null);
  
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    
    svg.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('r', 5);
    
    // Missing cleanup - should trigger violation
  }, [data]);
  
  return <svg ref={svgRef} />;
}`;

// D3.js - Good: Proper cleanup
export const d3GoodCleanup = `
function D3Component({ data }) {
  const svgRef = useRef(null);
  
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    
    svg.selectAll('circle')
      .data(data)
      .join('circle')
      .attr('r', 5);
    
    return () => {
      svg.selectAll('*').remove();
    };
  }, [data]);
  
  return <svg ref={svgRef} />;
}`;

// Recharts - Should fail: ResponsiveContainer with 100% height
export const rechartsBadContainer = `
function RechartsComponent({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <XAxis dataKey="name" />
        <YAxis />
        <Line dataKey="value" />
      </LineChart>
    </ResponsiveContainer>
  );
}`;

// Recharts - Good: Fixed height or parent with height
export const rechartsGoodContainer = `
function RechartsComponent({ data }) {
  return (
    <div style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="name" />
          <YAxis />
          <Line dataKey="value" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}`;

// Recharts - Should fail: Missing data prop
export const rechartsMissingData = `
function RechartsComponent() {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart>
        <XAxis dataKey="name" />
        <YAxis />
        <Line dataKey="value" />
      </LineChart>
    </ResponsiveContainer>
  );
}`;

// Chart.js - Should fail: Wrong context type
export const chartJsWrongContext = `
function ChartComponent({ data }) {
  const canvasRef = useRef(null);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Wrong context - should be '2d'
    const chart = new Chart(canvasRef.current.getContext('webgl'), {
      type: 'bar',
      data: data
    });
    
    return () => {
      chart.destroy();
    };
  }, [data]);
  
  return <canvas ref={canvasRef} />;
}`;