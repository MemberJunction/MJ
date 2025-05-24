import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import * as d3 from 'd3';

interface EntityNode {
  id: string;
  name: string;
  entity: EntityInfo;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  width: number;
  height: number;
  primaryKeys: EntityFieldInfo[];
  foreignKeys: EntityFieldInfo[];
}

interface EntityLink {
  source: string | EntityNode;
  target: string | EntityNode;
  field: EntityFieldInfo;
  sourceField: EntityFieldInfo;
  targetField?: EntityFieldInfo;
  isSelfReference: boolean;
}

@Component({
  selector: 'mj-erd-diagram',
  templateUrl: './erd-diagram.component.html',
  styleUrls: ['./erd-diagram.component.scss']
})
export class ERDDiagramComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('erdContainer', { static: false }) erdContainer!: ElementRef;

  @Input() filteredEntities: EntityInfo[] = [];
  @Input() allEntityFields: EntityFieldInfo[] = [];
  @Input() isRefreshingERD = false;
  @Input() selectedEntityId: string | null = null;

  @Output() entitySelected = new EventEmitter<EntityInfo>();
  @Output() entityDeselected = new EventEmitter<void>();
  @Output() refreshERD = new EventEmitter<void>();

  private svg: any;
  private simulation: any;
  private nodes: EntityNode[] = [];
  private links: EntityLink[] = [];
  private zoom: any;
  private resizeObserver?: ResizeObserver;
  private lastKnownSize = { width: 0, height: 0 };
  private resizeTimeout?: number;

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.setupERD();
    }, 100);
    
    // Add resize observer to handle container size changes
    this.setupResizeObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filteredEntities'] && !changes['filteredEntities'].firstChange) {
      this.setupERD();
    }
    
    if (changes['selectedEntityId'] && !changes['selectedEntityId'].firstChange) {
      this.updateSelectionHighlighting();
    }
  }

  ngOnDestroy(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  public zoomIn(): void {
    if (this.zoom) {
      this.svg.transition().duration(300).call(
        this.zoom.scaleBy, 1.5
      );
    }
  }

  public zoomOut(): void {
    if (this.zoom) {
      this.svg.transition().duration(300).call(
        this.zoom.scaleBy, 0.67
      );
    }
  }

  public resetZoom(): void {
    if (this.zoom) {
      this.svg.transition().duration(500).call(
        this.zoom.transform,
        d3.zoomIdentity
      );
    }
  }

  public setupERD(): void {
    if (!this.erdContainer?.nativeElement) {
      return;
    }

    this.clearVisualization();
    this.createNodes();
    this.createLinks();
    this.createVisualization();
  }

  public resizeSVG(): void {
    if (!this.svg || !this.erdContainer?.nativeElement) {
      return;
    }

    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Prevent resize loops by checking if size actually changed
    if (Math.abs(this.lastKnownSize.width - width) < 5 && 
        Math.abs(this.lastKnownSize.height - height) < 5) {
      return;
    }

    this.lastKnownSize = { width, height };

    // Use CSS for sizing instead of SVG attributes to prevent feedback loops
    const svgElement = this.svg.node();
    if (svgElement) {
      svgElement.style.width = '100%';
      svgElement.style.height = '100%';
    }

    // Set viewBox instead of width/height attributes
    this.svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Update simulation center force
    if (this.simulation) {
      this.simulation.force('center', d3.forceCenter(width / 2, height / 2));
      this.simulation.alpha(0.3).restart();
    }
  }

  public triggerResize(): void {
    // Manual resize trigger for external components (like splitter layout changes)
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    
    this.resizeTimeout = window.setTimeout(() => {
      this.resizeSVG();
    }, 100);
  }

  private setupResizeObserver(): void {
    if (!this.erdContainer?.nativeElement) {
      return;
    }

    this.resizeObserver = new ResizeObserver((entries) => {
      // Debounce resize events to prevent feedback loops
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      
      this.resizeTimeout = window.setTimeout(() => {
        // Double-check that container size actually changed
        const container = this.erdContainer?.nativeElement;
        if (!container) return;
        
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        
        // Only resize if there's a meaningful size change
        if (Math.abs(this.lastKnownSize.width - newWidth) >= 5 || 
            Math.abs(this.lastKnownSize.height - newHeight) >= 5) {
          requestAnimationFrame(() => {
            this.resizeSVG();
          });
        }
      }, 50);
    });
    
    this.resizeObserver.observe(this.erdContainer.nativeElement);
  }

  private clearVisualization(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
    d3.select(this.erdContainer.nativeElement).selectAll('*').remove();
  }

  private createNodes(): void {
    this.nodes = this.filteredEntities.map(entity => {
      const entityFields = this.allEntityFields.filter(f => f.EntityID === entity.ID);
      const primaryKeys = entityFields.filter(f => f.IsPrimaryKey);
      const foreignKeys = entityFields.filter(f => f.RelatedEntityID && !f.IsPrimaryKey);

      const fieldCount = Math.max(1, primaryKeys.length + foreignKeys.length);
      const baseHeight = 60;
      const fieldHeight = 20;
      const maxHeight = 300;
      const calculatedHeight = Math.min(baseHeight + (fieldCount * fieldHeight), maxHeight);

      return {
        id: entity.ID,
        name: entity.Name || entity.SchemaName || 'Unknown',
        entity: entity,
        width: 180,
        height: calculatedHeight,
        primaryKeys: primaryKeys,
        foreignKeys: foreignKeys
      };
    });
  }

  private createLinks(): void {
    this.links = [];
    const entityMap = new Map(this.nodes.map(node => [node.id, node]));

    this.allEntityFields.forEach(field => {
      if (field.RelatedEntityID && !field.IsPrimaryKey) {
        const sourceNode = entityMap.get(field.EntityID);
        const targetNode = entityMap.get(field.RelatedEntityID);

        if (sourceNode && targetNode) {
          const isSelfReference = field.EntityID === field.RelatedEntityID;
          
          // Find target field (primary key in target entity)
          const targetField = targetNode.primaryKeys.find(pk => pk.Name === field.RelatedEntityFieldName);
          
          this.links.push({
            source: sourceNode,
            target: targetNode,
            field: field,
            sourceField: field,
            targetField: targetField,
            isSelfReference: isSelfReference
          });
        }
      }
    });
  }

  private createVisualization(): void {
    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Set initial known size
    this.lastKnownSize = { width, height };

    // Create zoom behavior
    this.zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event: any) => {
      this.svg.select('.chart-area').attr('transform', event.transform);
    });

    // Create SVG with CSS-based sizing
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('width', '100%')
      .style('height', '100%')
      .style('position', 'absolute')
      .style('top', '0')
      .style('left', '0')
      .call(this.zoom as any)
      .on('click', (event: any) => {
        // Deselect entity when clicking on background
        if (event.target === event.currentTarget) {
          this.entityDeselected.emit();
          this.clearAllHighlighting();
        }
      });

    const chartArea = this.svg.append('g').attr('class', 'chart-area');

    // Define arrow marker for directional links
    this.svg
      .append('defs')
      .selectAll('marker')
      .data(['end-arrow'])
      .enter()
      .append('marker')
      .attr('id', 'end-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 8)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#666');

    // Create force simulation with dynamic distance based on rectangle sizes
    this.simulation = d3
      .forceSimulation(this.nodes)
      .force(
        'link',
        d3
          .forceLink(this.links)
          .id((d: any) => d.id)
          .distance((d: any) => {
            const sourceNode = d.source as EntityNode;
            const targetNode = d.target as EntityNode;
            const sourceSize = Math.max(sourceNode.width, sourceNode.height);
            const targetSize = Math.max(targetNode.width, targetNode.height);
            return (sourceSize + targetSize) / 2 + 80;
          }),
      )
      .force('charge', d3.forceManyBody().strength(-800))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force(
        'collision',
        d3.forceCollide().radius((d: any) => {
          const node = d as EntityNode;
          return Math.max(node.width, node.height) / 2 + 20;
        }),
      );

    // Create links with arrows
    const link = chartArea.selectAll('.link').data(this.links).enter().append('g').attr('class', 'link-group');

    // Add the link line
    link
      .append('path')
      .attr('class', 'link')
      .attr('stroke', '#666')
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', 2)
      .attr('fill', 'none')
      .attr('marker-end', (d: any) => (d.isSelfReference ? 'none' : 'url(#end-arrow)'));

    // Add labels for foreign key relationships
    link
      .append('text')
      .attr('class', 'link-label')
      .attr('font-size', '10px')
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .text((d: any) => d.sourceField.Name || '');

    // Create entity rectangle nodes
    const node = chartArea
      .selectAll('.node')
      .data(this.nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (event, d: any) => this.dragstarted(event, d))
          .on('drag', (event, d: any) => this.dragged(event, d))
          .on('end', (event, d: any) => this.dragended(event, d)),
      );

    // Add main rectangle for entity
    node
      .append('rect')
      .attr('class', 'entity-rect')
      .attr('width', (d: EntityNode) => d.width)
      .attr('height', (d: EntityNode) => d.height)
      .attr('x', (d: EntityNode) => -d.width / 2)
      .attr('y', (d: EntityNode) => -d.height / 2)
      .attr('fill', '#f8f9fa')
      .attr('stroke', '#333')
      .attr('stroke-width', 2)
      .attr('rx', 4);

    // Add entity header
    node
      .append('rect')
      .attr('class', 'entity-header')
      .attr('width', (d: EntityNode) => d.width)
      .attr('height', 30)
      .attr('x', (d: EntityNode) => -d.width / 2)
      .attr('y', (d: EntityNode) => -d.height / 2)
      .attr('fill', '#007bff')
      .attr('rx', 4);

    // Add entity header bottom border (to make only top rounded)
    node
      .append('rect')
      .attr('class', 'entity-header-bottom')
      .attr('width', (d: EntityNode) => d.width)
      .attr('height', 15)
      .attr('x', (d: EntityNode) => -d.width / 2)
      .attr('y', (d: EntityNode) => -d.height / 2 + 15)
      .attr('fill', '#007bff');

    // Add entity name in header
    node
      .append('text')
      .attr('class', 'entity-name')
      .attr('text-anchor', 'middle')
      .attr('y', (d: EntityNode) => -d.height / 2 + 20)
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .text((d: EntityNode) => d.name);

    // Add primary key fields and foreign key fields
    node.each(function (this: SVGGElement, d: EntityNode) {
      const group = d3.select(this);
      let currentY = -d.height / 2 + 40;

      // Add primary keys
      d.primaryKeys.forEach((pk) => {
        const fieldGroup = group.append('g').attr('class', 'field-group primary-key');

        fieldGroup
          .append('rect')
          .attr('class', 'field-bg')
          .attr('x', -d.width / 2 + 2)
          .attr('y', currentY - 15)
          .attr('width', d.width - 4)
          .attr('height', 18)
          .attr('fill', '#fff3cd');

        fieldGroup
          .append('text')
          .attr('class', 'field-icon')
          .attr('x', -d.width / 2 + 8)
          .attr('y', currentY - 2)
          .attr('font-size', '10px')
          .attr('fill', '#856404')
          .text('🔑');

        fieldGroup
          .append('text')
          .attr('class', 'field-name')
          .attr('x', -d.width / 2 + 25)
          .attr('y', currentY - 2)
          .attr('font-size', '11px')
          .attr('font-weight', 'bold')
          .attr('fill', '#856404')
          .text(pk.Name || '');

        currentY += 20;
      });

      // Add foreign key fields
      d.foreignKeys.forEach((fk) => {
        const fieldGroup = group.append('g').attr('class', 'field-group foreign-key');

        fieldGroup
          .append('rect')
          .attr('class', 'field-bg')
          .attr('x', -d.width / 2 + 2)
          .attr('y', currentY - 15)
          .attr('width', d.width - 4)
          .attr('height', 18)
          .attr('fill', '#cce5ff');

        fieldGroup
          .append('text')
          .attr('class', 'field-icon')
          .attr('x', -d.width / 2 + 8)
          .attr('y', currentY - 2)
          .attr('font-size', '10px')
          .attr('fill', '#004085')
          .text('🔗');

        fieldGroup
          .append('text')
          .attr('class', 'field-name')
          .attr('x', -d.width / 2 + 25)
          .attr('y', currentY - 2)
          .attr('font-size', '11px')
          .attr('fill', '#004085')
          .text(fk.Name || '');

        currentY += 20;
      });
    });

    // Add click handler for entity selection
    node
      .on('click', (event: any, d: EntityNode) => {
        event.stopPropagation();
        
        // Check if this entity is already selected
        if (this.selectedEntityId === d.entity.ID) {
          // If clicking on the selected entity, deselect it
          this.entityDeselected.emit();
        } else {
          // Select the new entity
          this.entitySelected.emit(d.entity);
          
          // Check if entity is too small and needs auto-zoom
          const currentTransform = d3.zoomTransform(this.svg.node()!);
          const currentRenderedWidth = d.width * currentTransform.k;
          const shouldAutoZoom = currentRenderedWidth < 20;
          
          if (shouldAutoZoom) {
            this.zoomToEntity(d.entity.ID);
          }
        }
        
        // Update visual selection state
        this.updateSelectionHighlighting();
      })
      .append('title')
      .text((d: EntityNode) => `${d.name}\nPrimary Keys: ${d.primaryKeys.length}\nForeign Keys: ${d.foreignKeys.length}`);

    // Update positions on simulation tick
    this.simulation.on('tick', () => {
      // Update link positions with proper rectangle edge connections
      link.select('path').attr('d', (d: any) => {
        const source = d.source as EntityNode;
        const target = d.target as EntityNode;

        if (d.isSelfReference) {
          // Handle self-referencing relationships with a loop
          const loopSize = 30;
          return `M ${source.x! + source.width / 2} ${source.y!}
                  Q ${source.x! + source.width / 2 + loopSize} ${source.y! - loopSize}
                    ${source.x!} ${source.y! - source.height / 2}`;
        } else {
          // Calculate connection points with 90-degree routing
          const sourceConnectPoint = this.getSourceConnectionPoint(source, target, d.sourceField);
          const targetConnectPoint = this.getTargetConnectionPoint(target, d.targetField);

          return this.createOrthogonalPath(sourceConnectPoint, targetConnectPoint);
        }
      });

      // Update link labels
      link.select('text').attr('transform', (d: any) => {
        if (d.isSelfReference) {
          const source = d.source as EntityNode;
          return `translate(${source.x! + source.width / 2 + 15}, ${source.y! - source.height / 2 - 10})`;
        } else {
          const source = d.source as EntityNode;
          const target = d.target as EntityNode;
          const midX = (source.x! + target.x!) / 2;
          const midY = (source.y! + target.y!) / 2;
          return `translate(${midX}, ${midY - 8})`;
        }
      });

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });
  }

  private getSourceConnectionPoint(sourceNode: EntityNode, _targetNode: EntityNode, field?: EntityFieldInfo): { x: number; y: number } {
    // Always connect from the right edge for source connections
    let connectY = sourceNode.y!;

    // If we have field information, connect near the foreign key field
    if (field) {
      const fkIndex = sourceNode.foreignKeys.findIndex((fk) => fk.ID === field.ID);
      if (fkIndex >= 0) {
        const fieldY = -sourceNode.height / 2 + 40 + sourceNode.primaryKeys.length * 20 + fkIndex * 20;
        connectY = sourceNode.y! + fieldY + 10;
      }
    }

    return {
      x: sourceNode.x! + sourceNode.width / 2,
      y: connectY,
    };
  }

  private getTargetConnectionPoint(targetNode: EntityNode, targetField?: EntityFieldInfo): { x: number; y: number } {
    // Always connect to the left edge of target
    let connectY = targetNode.y! - targetNode.height / 2 + 40; // Default to primary key area

    // If we have target field information, connect near the specific primary key field
    if (targetField && targetField.IsPrimaryKey) {
      const pkIndex = targetNode.primaryKeys.findIndex((pk) => pk.ID === targetField.ID);
      if (pkIndex >= 0) {
        const fieldY = -targetNode.height / 2 + 40 + pkIndex * 20;
        connectY = targetNode.y! + fieldY + 10;
      }
    }

    return {
      x: targetNode.x! - targetNode.width / 2,
      y: connectY,
    };
  }

  private createOrthogonalPath(source: { x: number; y: number }, target: { x: number; y: number }): string {
    // Ensure right-to-left connection with proper orthogonal routing
    const dx = target.x - source.x;

    // Calculate midpoint for orthogonal routing
    let midX: number;

    if (dx > 0) {
      // Target is to the right of source - use 70% of distance for turn point
      midX = source.x + dx * 0.7;
    } else {
      // Target is to the left of source - create wider arc for better visibility
      midX = source.x + Math.max(dx * 0.3, -50); // Don't go too far left
    }

    // Create clean orthogonal path
    return `M ${source.x} ${source.y}
            L ${midX} ${source.y}
            L ${midX} ${target.y}
            L ${target.x} ${target.y}`;
  }

  private clearAllHighlighting(): void {
    if (!this.svg) return;
    
    this.svg.selectAll('.node')
      .classed('selected', false)
      .classed('relationship-connected', false)
      .classed('entity-connections-highlighted', false);
      
    this.svg.selectAll('.entity-rect')
      .classed('highlighted', false)
      .classed('relationship-highlighted', false)
      .classed('connection-highlighted', false);
      
    this.svg.selectAll('.link-group')
      .classed('highlighted', false);
      
    this.svg.selectAll('.link')
      .classed('highlighted', false);
      
    this.svg.selectAll('.link-label')
      .classed('highlighted', false);
  }

  private updateSelectionHighlighting(): void {
    if (!this.svg) return;
    
    // Clear existing selections
    this.clearAllHighlighting();
    
    // Highlight selected entity if any
    if (this.selectedEntityId) {
      this.svg.selectAll('.node')
        .filter((d: any) => d.id === this.selectedEntityId)
        .classed('selected', true);
    }
  }

  public zoomToEntity(entityId: string): void {
    const node = this.nodes.find(n => n.id === entityId);
    if (!node || !this.zoom) return;

    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scale = 1.5;
    const x = width / 2 - (node.x || 0) * scale;
    const y = height / 2 - (node.y || 0) * scale;

    this.svg.transition().duration(750).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(x, y).scale(scale)
    );
  }

  private dragstarted(event: any, d: any): void {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  private dragged(event: any, d: any): void {
    d.fx = event.x;
    d.fy = event.y;
  }

  private dragended(event: any, d: any): void {
    if (!event.active) this.simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
}