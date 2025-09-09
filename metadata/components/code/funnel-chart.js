// FunnelChart Sub-component
function FunnelChart ({ data, onStageClick, selectedStage, utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    // Clear previous chart
    containerRef.current.innerHTML = '';

    // Calculate dimensions
    const width = containerRef.current.offsetWidth;
    const height = 400;
    const maxValue = Math.max(...data.map(d => d.value));

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Draw funnel segments
    const segmentHeight = height / data.length;
    const padding = 20;

    data.forEach((stage, index) => {
      const widthRatio = stage.value / maxValue;
      const topWidth = width * (1 - index * 0.15) * widthRatio;
      const bottomWidth = width * (1 - (index + 1) * 0.15) * widthRatio;
      const y = index * segmentHeight;

      // Create trapezoid path
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = `
        M ${(width - topWidth) / 2} ${y}
        L ${(width + topWidth) / 2} ${y}
        L ${(width + bottomWidth) / 2} ${y + segmentHeight}
        L ${(width - bottomWidth) / 2} ${y + segmentHeight}
        Z
      `;
      path.setAttribute('d', d);
      path.setAttribute('fill', stage.color || `hsl(${200 + index * 20}, 70%, 50%)`);
      path.setAttribute('stroke', '#fff');
      path.setAttribute('stroke-width', '2');
      path.style.cursor = 'pointer';
      path.style.opacity = selectedStage === stage.name ? '1' : '0.8';
      
      // Add hover effect
      path.addEventListener('mouseenter', () => {
        path.style.opacity = '1';
      });
      path.addEventListener('mouseleave', () => {
        path.style.opacity = selectedStage === stage.name ? '1' : '0.8';
      });
      path.addEventListener('click', () => {
        if (onStageClick) onStageClick(stage);
      });

      svg.appendChild(path);

      // Add text labels
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', width / 2);
      text.setAttribute('y', y + segmentHeight / 2);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', '#fff');
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', 'bold');
      text.style.pointerEvents = 'none';
      text.textContent = `${stage.name}: ${stage.value} (${stage.percentage}%)`;

      svg.appendChild(text);
    });

    containerRef.current.appendChild(svg);
  }, [data, selectedStage, onStageClick]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '400px',
        position: 'relative'
      }}
    />
  );
};