import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { BaseDashboard } from '../generic/base-dashboard';
import { RegisterClass } from '@memberjunction/global';
import { CompositeKey, EntityFieldInfo, EntityFieldValueInfo, EntityInfo, KeyValuePair, Metadata } from '@memberjunction/core';
import * as d3 from 'd3';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

interface EntityNode {
  id: string;
  name: string;
  entity: EntityInfo;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  connectionCount: number;
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

interface EntityFilter {
  schemaName: string | null;
  entityName: string;
  connectionCountMin: number;
  connectionCountMax: number;
  entityStatus: string | null;
  baseTable: string;
}

interface DashboardState {
  filterPanelVisible: boolean;
  filterPanelWidth: number;
  mainSplitterPosition: number;
  filters: EntityFilter;
}

@Component({
  selector: 'mj-entity-admin-dashboard',
  templateUrl: './entity-admin-dashboard.component.html',
  styleUrls: ['./entity-admin-dashboard.component.scss'],
})
@RegisterClass(BaseDashboard, 'EntityAdmin')
export class EntityAdminDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  @ViewChild('erdContainer', { static: false }) erdContainer!: ElementRef;

  public entities: EntityInfo[] = [];
  public entityFields: EntityFieldInfo[] = [];
  public allEntityFields: EntityFieldInfo[] = [];
  public selectedEntity: EntityInfo | null = null;
  public isLoading = true;
  public isFiltering = false;
  public isRefreshingERD = false;
  public loadingMessage = 'Loading entities and relationships...';
  public error: string | null = null;
  public fieldFilter: 'all' | 'keys' | 'foreign_keys' | 'regular' = 'all';

  // Filtering properties
  public filteredEntities: EntityInfo[] = [];
  public distinctSchemas: Array<{ text: string; value: string }> = [];
  public connectionCountRange = { min: 0, max: 100 };
  public filterPanelVisible = true;
  public detailsPanelVisible = true;
  public fieldsSectionExpanded = true;
  public relationshipsSectionExpanded = true;
  public expandedFieldDescriptions = new Set<string>();
  public expandedFieldValues = new Set<string>();
  public expandedFieldDetails = new Set<string>();
  public detailsPanelWidth = 400; // Default width in pixels
  private isResizing = false;
  public filters: EntityFilter = {
    schemaName: null,
    entityName: '',
    connectionCountMin: 0,
    connectionCountMax: 100,
    entityStatus: null,
    baseTable: '',
  };

  // State management
  private stateChangeSubject = new Subject<DashboardState>();
  private filterChangeSubject = new Subject<void>();

  private svg: any;
  private simulation: any;
  private nodes: EntityNode[] = [];
  private links: EntityLink[] = [];
  private zoom: any;

  protected override initDashboard(): void {
    // Setup debounced state change emission
    this.stateChangeSubject.pipe(debounceTime(300)).subscribe((state) => {
      this.UserStateChanged.emit({
        type: 'stateChange',
        data: state,
      });
    });

    // Setup debounced filter changes
    this.filterChangeSubject.pipe(debounceTime(300)).subscribe(() => {
      this.applyFiltersDebounced();
    });
  }

  protected override loadData(): void {
    this.loadEntitiesAndFields();
  }

  ngAfterViewInit(): void {
    if (this.entities.length > 0) {
      this.setupERD();
    }
  }

  ngOnDestroy(): void {
    if (this.simulation) {
      this.simulation.stop();
    }
    this.stateChangeSubject.complete();
    this.filterChangeSubject.complete();
  }

  private async loadEntitiesAndFields(): Promise<void> {
    try {
      this.isLoading = true;
      const md = new Metadata();

      this.entities = md.Entities.filter((e) => !e.Status || e.Status === 'Active');

      this.allEntityFields = this.entities
        .map((entity) => {
          return entity.Fields;
        })
        .flat();

      this.entityFields = this.allEntityFields.filter((field) => field.RelatedEntityID);

      // Initialize filtering data
      this.initializeFilteringData();
      this.applyFilters();

      this.setupERD();
      this.LoadingComplete.emit();
    } catch (error) {
      this.error = `Failed to load data: ${error}`;
    } finally {
      this.isLoading = false;
    }
  }

  private initializeFilteringData(): void {
    // Get distinct schemas
    const uniqueSchemas = [...new Set(this.entities.map((e) => e.SchemaName).filter((s) => s))].sort();
    this.distinctSchemas = uniqueSchemas.map((schema) => ({ text: schema, value: schema }));

    // Calculate connection count range
    const connectionCounts = this.entities.map((entity) => {
      return this.entityFields.filter((field) => field.EntityID === entity.ID || field.RelatedEntityID === entity.ID).length;
    });

    this.connectionCountRange.min = Math.min(...connectionCounts, 0);
    this.connectionCountRange.max = Math.max(...connectionCounts, 1);

    // Initialize filter ranges
    this.filters.connectionCountMin = this.connectionCountRange.min;
    this.filters.connectionCountMax = this.connectionCountRange.max;
  }

  private updateConnectionCountRange(): void {
    if (this.filteredEntities.length === 0) {
      // If no entities after filtering, keep current range
      return;
    }

    // Calculate connection counts for filtered entities only
    const connectionCounts = this.filteredEntities.map((entity) => {
      return this.entityFields.filter((field) => field.EntityID === entity.ID || field.RelatedEntityID === entity.ID).length;
    });

    const newMin = Math.min(...connectionCounts, 0);
    const newMax = Math.max(...connectionCounts, 1);

    // Update the range
    this.connectionCountRange.min = newMin;
    this.connectionCountRange.max = newMax;

    // Ensure current filter values are within the new range
    this.filters.connectionCountMin = Math.max(this.filters.connectionCountMin, newMin);
    this.filters.connectionCountMax = Math.min(this.filters.connectionCountMax, newMax);

    console.log('Updated connection count range:', this.connectionCountRange);
  }

  private applyFilters(): void {
    console.log('applyFilters called - current filter values:', this.filters);
    console.log('Total entities before filtering:', this.entities.length);

    this.filteredEntities = this.entities.filter((entity) => {
      // Schema filter
      if (this.filters.schemaName && entity.SchemaName !== this.filters.schemaName) {
        return false;
      }

      // Entity name filter
      if (this.filters.entityName && this.filters.entityName.trim() !== '') {
        const searchTerm = this.filters.entityName.toLowerCase().trim();
        const entityName = entity.Name?.toLowerCase() || '';
        const schemaName = entity.SchemaName?.toLowerCase() || '';

        if (!entityName.includes(searchTerm) && !schemaName.includes(searchTerm)) {
          return false;
        }
      }

      // Base table filter
      if (this.filters.baseTable && this.filters.baseTable.trim() !== '') {
        const searchTerm = this.filters.baseTable.toLowerCase().trim();
        const baseTable = entity.BaseTable?.toLowerCase() || '';

        if (!baseTable.includes(searchTerm)) {
          return false;
        }
      }

      // Entity status filter
      if (this.filters.entityStatus && entity.Status !== this.filters.entityStatus) {
        return false;
      }

      // Connection count filter
      const connectionCount = this.entityFields.filter((field) => field.EntityID === entity.ID || field.RelatedEntityID === entity.ID).length;

      if (connectionCount < this.filters.connectionCountMin || connectionCount > this.filters.connectionCountMax) {
        return false;
      }

      return true;
    });

    console.log('Filtered entities count:', this.filteredEntities.length);
  }

  public onFilterChange(): void {
    // Trigger debounced filter change
    this.filterChangeSubject.next();
  }

  private applyFiltersDebounced(): void {
    console.log('applyFiltersDebounced called with filters:', this.filters);
    this.applyFilters();
    console.log('After filtering, entities count:', this.filteredEntities.length);
    
    // Recalculate connection count range based on filtered entities
    this.updateConnectionCountRange();
    
    this.setupERD();
    this.autoFitDiagram();
    this.emitStateChange();
  }

  public onConnectionRangeChange(event: any): void {
    if (event && Array.isArray(event) && event.length === 2) {
      this.filters.connectionCountMin = event[0];
      this.filters.connectionCountMax = event[1];
      this.onFilterChange();
    } else if (event && event.target && event.target.value && Array.isArray(event.target.value)) {
      this.filters.connectionCountMin = event.target.value[0];
      this.filters.connectionCountMax = event.target.value[1];
      this.onFilterChange();
    }
  }

  public toggleFilterPanel(): void {
    this.filterPanelVisible = !this.filterPanelVisible;
    this.emitStateChange();
  }

  public toggleDetailsPanel(): void {
    this.detailsPanelVisible = !this.detailsPanelVisible;
    this.emitStateChange();
  }

  public toggleFieldsSection(): void {
    this.fieldsSectionExpanded = !this.fieldsSectionExpanded;
  }

  public toggleRelationshipsSection(): void {
    this.relationshipsSectionExpanded = !this.relationshipsSectionExpanded;
  }

  public toggleFieldDescription(fieldId: string): void {
    if (this.expandedFieldDescriptions.has(fieldId)) {
      this.expandedFieldDescriptions.delete(fieldId);
    } else {
      this.expandedFieldDescriptions.add(fieldId);
    }
  }

  public isFieldDescriptionExpanded(fieldId: string): boolean {
    return this.expandedFieldDescriptions.has(fieldId);
  }

  public toggleFieldValues(fieldId: string): void {
    if (this.expandedFieldValues.has(fieldId)) {
      this.expandedFieldValues.delete(fieldId);
    } else {
      this.expandedFieldValues.add(fieldId);
    }
  }

  public isFieldValuesExpanded(fieldId: string): boolean {
    return this.expandedFieldValues.has(fieldId);
  }

  public onFieldClick(field: EntityFieldInfo): void {
    // Toggle field details expansion
    this.toggleFieldDetails(field.ID);
  }

  public toggleFieldDetails(fieldId: string): void {
    if (this.expandedFieldDetails.has(fieldId)) {
      this.expandedFieldDetails.delete(fieldId);
    } else {
      this.expandedFieldDetails.add(fieldId);
    }
  }

  public isFieldDetailsExpanded(fieldId: string): boolean {
    return this.expandedFieldDetails.has(fieldId);
  }

  public getFieldPossibleValues(field: EntityFieldInfo): string[] {
    // Check if field has possible values defined in DefaultValue or other properties
    const fieldText = (field as any).EntityDocumentText || field.DefaultValue || '';
    
    if (fieldText && typeof fieldText === 'string') {
      try {
        // Try to parse JSON if it contains possible values
        const doc = JSON.parse(fieldText);
        if (doc.possibleValues && Array.isArray(doc.possibleValues)) {
          return doc.possibleValues;
        }
      } catch {
        // If not JSON, check if it's a comma-separated list
        if (fieldText.includes(',')) {
          return fieldText.split(',').map((v: string) => v.trim());
        }
      }
    }
    return [];
  }

  public hasFieldPossibleValues(field: EntityFieldInfo): boolean {
    return this.getFieldPossibleValues(field).length > 0;
  }

  public getSortedEntityFieldValues(field: EntityFieldInfo): EntityFieldValueInfo[] {
    if (!field.EntityFieldValues || field.EntityFieldValues.length === 0) {
      return [];
    }
    // Sort by Sequence, then by Value if Sequence is the same
    return field.EntityFieldValues.sort((a, b) => {
      if (a.Sequence !== b.Sequence) {
        return a.Sequence - b.Sequence;
      }
      return a.Value.localeCompare(b.Value);
    });
  }

  public getRelatedEntityObject(field: EntityFieldInfo): EntityInfo | null {
    if (!field.RelatedEntityID) return null;
    return this.entities.find((entity: EntityInfo) => entity.ID === field.RelatedEntityID) || null;
  }

  public onRelatedEntityClick(event: Event, field: EntityFieldInfo): void {
    event.stopPropagation(); // Prevent bubbling to field click handler
    const relatedEntity = this.getRelatedEntityObject(field);
    if (relatedEntity) {
      this.selectEntity(relatedEntity, true); // Auto-zoom to the related entity
    }
  }

  public get isShowingLoading(): boolean {
    return this.isLoading || this.isFiltering || this.isRefreshingERD;
  }

  public startResize(event: MouseEvent): void {
    this.isResizing = true;
    event.preventDefault();

    const mouseMoveHandler = (e: MouseEvent) => {
      if (this.isResizing) {
        const containerWidth = window.innerWidth;
        const newWidth = containerWidth - e.clientX;
        this.detailsPanelWidth = Math.max(300, Math.min(600, newWidth)); // Min 300px, Max 600px
      }
    };

    const mouseUpHandler = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  public selectEntity(entity: EntityInfo, zoomTo: boolean = false): void {
    // Check if entity is visible in current filtered entities
    const isEntityVisible = this.filteredEntities.some(e => e.ID === entity.ID);
    
    // If entity is not visible due to filters, clear filters first
    if (!isEntityVisible) {
      this.clearAllFilters();
      // Wait for filters to be applied before proceeding
      setTimeout(() => {
        this.proceedWithEntitySelection(entity, zoomTo);
      }, 150);
    } else {
      this.proceedWithEntitySelection(entity, zoomTo);
    }
  }

  private proceedWithEntitySelection(entity: EntityInfo, zoomTo: boolean): void {
    this.selectedEntity = entity;
    this.detailsPanelVisible = true; // Auto-show details when entity is selected
    this.Interaction.emit({ type: 'entitySelected', entity });

    // Clear any previous relationship highlighting
    this.clearAllHighlighting();

    // Update visual selection in diagram with enhanced highlighting
    this.updateVisualSelection(entity.ID);
    this.highlightEntityConnections(entity.ID);

    if (zoomTo && this.svg && this.nodes) {
      this.zoomToEntity(entity.ID);
    }
  }

  private clearAllFilters(): void {
    this.filters = {
      schemaName: null,
      entityName: '',
      connectionCountMin: this.connectionCountRange.min,
      connectionCountMax: this.connectionCountRange.max,
      entityStatus: null,
      baseTable: ''
    };
    this.onFilterChange();
  }

  private emitStateChange(): void {
    const state: DashboardState = {
      filterPanelVisible: this.filterPanelVisible,
      filterPanelWidth: 320, // Updated width
      mainSplitterPosition: 70, // Default position
      filters: { ...this.filters },
    };

    this.stateChangeSubject.next(state);
  }

  public setupERD(): void {
    if (!this.erdContainer) return;

    this.prepareData();
    this.createVisualization();

    // Auto-fit after a short delay to let the simulation settle
    setTimeout(() => {
      this.autoFitDiagram();
    }, 1000);
  }

  private prepareData(): void {
    // Create entity nodes with rectangles and field information
    this.nodes = this.filteredEntities.map((entity) => {
      const primaryKeys = entity.Fields.filter((field) => field.IsPrimaryKey);
      const foreignKeys = entity.Fields.filter((field) => field.RelatedEntityID);

      // Calculate rectangle size based on content
      const maxFieldNameLength = Math.max(
        entity.Name?.length || 0,
        ...primaryKeys.map((pk) => pk.Name?.length || 0),
        ...foreignKeys.map((fk) => fk.Name?.length || 0),
      );

      const width = Math.max(120, Math.min(200, maxFieldNameLength * 8 + 40));
      const headerHeight = 30;
      const fieldHeight = 20;
      const totalFields = primaryKeys.length + foreignKeys.length;
      const height = headerHeight + totalFields * fieldHeight + 20;

      return {
        id: entity.ID,
        name: entity.Name || entity.SchemaName || '',
        entity,
        connectionCount: foreignKeys.length,
        width,
        height,
        primaryKeys,
        foreignKeys,
      };
    });

    // Create links with directional information
    this.links = this.entityFields
      .filter((field) => field.RelatedEntityID && field.EntityID)
      .filter((field) => this.nodes.find((n) => n.id === field.EntityID) && this.nodes.find((n) => n.id === field.RelatedEntityID))
      .map((field) => {
        const targetEntity = this.filteredEntities.find((e) => e.ID === field.RelatedEntityID);
        const targetPrimaryKey = targetEntity?.Fields.find((f) => f.IsPrimaryKey);

        return {
          source: field.EntityID!,
          target: field.RelatedEntityID!,
          field,
          sourceField: field,
          targetField: targetPrimaryKey,
          isSelfReference: field.EntityID === field.RelatedEntityID,
        };
      });
  }

  private createVisualization(): void {
    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Clear any existing visualization
    d3.select(container).selectAll('*').remove();

    // Create zoom behavior
    this.zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event: any) => {
      this.svg.select('.chart-area').attr('transform', event.transform);
    });

    // Create SVG
    this.svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .call(this.zoom as any)
      .on('click', (event: any) => {
        // Clear highlighting when clicking on background
        if (event.target === event.currentTarget) {
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

    // Remove click handlers from links - not needed

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

    // Add primary key fields
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

    // Add click handler for entity selection and tooltip
    node
      .on('click', (_: any, d: EntityNode) => {
        // Check if entity is too small and needs auto-zoom
        const currentTransform = d3.zoomTransform(this.svg.node()!);
        const currentRenderedWidth = d.width * currentTransform.k;
        const shouldAutoZoom = currentRenderedWidth < 20;
        
        this.selectEntity(d.entity, shouldAutoZoom);
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

  private autoFitDiagram(): void {
    if (!this.svg || !this.nodes || this.nodes.length === 0) return;

    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Calculate bounds of all nodes
    const bounds = this.nodes.reduce(
      (acc, node) => {
        if (!node.x || !node.y) return acc;

        const left = node.x - node.width / 2;
        const right = node.x + node.width / 2;
        const top = node.y - node.height / 2;
        const bottom = node.y + node.height / 2;

        return {
          minX: Math.min(acc.minX, left),
          maxX: Math.max(acc.maxX, right),
          minY: Math.min(acc.minY, top),
          maxY: Math.max(acc.maxY, bottom),
        };
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );

    if (!isFinite(bounds.minX)) return;

    // Calculate scale and translation to fit all nodes with padding
    const padding = 50;
    const contentWidth = bounds.maxX - bounds.minX + padding * 2;
    const contentHeight = bounds.maxY - bounds.minY + padding * 2;
    const scale = Math.min(width / contentWidth, height / contentHeight, 1); // Don't zoom in beyond 1x

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const translateX = width / 2 - centerX * scale;
    const translateY = height / 2 - centerY * scale;

    this.svg.transition().duration(750).call(this.zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));
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

  private updateVisualSelection(selectedEntityId: string): void {
    if (!this.svg) return;

    // Remove previous selection styling
    this.svg.selectAll('.node').classed('selected', false);

    // Add selection styling to current entity
    this.svg
      .selectAll('.node')
      .filter((d: any) => d.id === selectedEntityId)
      .classed('selected', true);
  }

  private highlightRelationship(linkData: any): void {
    if (!this.svg) return;

    // Clear previous highlighting
    this.clearAllHighlighting();

    // Highlight the clicked link
    this.svg
      .selectAll('.link-group')
      .filter((d: any) => d === linkData)
      .classed('highlighted', true)
      .select('.link')
      .classed('highlighted', true);

    this.svg
      .selectAll('.link-group')
      .filter((d: any) => d === linkData)
      .select('.link-label')
      .classed('highlighted', true);

    // Highlight connected entities
    const sourceId = typeof linkData.source === 'string' ? linkData.source : linkData.source.id;
    const targetId = typeof linkData.target === 'string' ? linkData.target : linkData.target.id;

    this.svg
      .selectAll('.node')
      .filter((d: any) => d.id === sourceId || d.id === targetId)
      .classed('relationship-connected', true)
      .select('.entity-rect')
      .classed('relationship-highlighted', true);

    // Add temporary auto-clear after 3 seconds
    setTimeout(() => {
      this.clearAllHighlighting();
    }, 3000);
  }

  private clearAllHighlighting(): void {
    if (!this.svg) return;

    // Clear link highlighting
    this.svg.selectAll('.link-group').classed('highlighted', false);

    this.svg.selectAll('.link').classed('highlighted', false);

    this.svg.selectAll('.link-label').classed('highlighted', false);

    // Clear entity highlighting
    this.svg.selectAll('.node').classed('relationship-connected', false).classed('entity-connections-highlighted', false);

    this.svg.selectAll('.entity-rect').classed('relationship-highlighted', false).classed('connection-highlighted', false);
  }

  private highlightEntityConnections(entityId: string): void {
    if (!this.svg) return;

    // Find all links connected to this entity
    const connectedLinks = this.links.filter((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return sourceId === entityId || targetId === entityId;
    });

    // Highlight all connected links
    connectedLinks.forEach((linkData) => {
      this.svg
        .selectAll('.link-group')
        .filter((d: any) => d === linkData)
        .classed('highlighted', true)
        .select('.link')
        .classed('highlighted', true);

      this.svg
        .selectAll('.link-group')
        .filter((d: any) => d === linkData)
        .select('.link-label')
        .classed('highlighted', true);
    });

    // Highlight all connected entities
    const connectedEntityIds = new Set<string>();
    connectedLinks.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;

      if (sourceId !== entityId) connectedEntityIds.add(sourceId);
      if (targetId !== entityId) connectedEntityIds.add(targetId);
    });

    // Apply highlighting to connected entities
    this.svg
      .selectAll('.node')
      .filter((d: any) => connectedEntityIds.has(d.id))
      .classed('entity-connections-highlighted', true)
      .select('.entity-rect')
      .classed('connection-highlighted', true);
  }

  private zoomToEntity(entityId: string): void {
    const node = this.nodes.find((n) => n.id === entityId);
    if (!node) {
      return;
    }

    // If node doesn't have coordinates yet, wait for simulation to settle
    if (!node.x || !node.y) {
      setTimeout(() => this.zoomToEntity(entityId), 100);
      return;
    }

    const svg = this.svg;
    const container = this.erdContainer.nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const scale = 1.5;
    const translate = [width / 2 - scale * node.x, height / 2 - scale * node.y];

    // Apply the transform using the stored zoom behavior
    svg.transition().duration(750).call(this.zoom.transform, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));

    // Highlight the selected node temporarily
    svg.selectAll('.node').select('.entity-rect').classed('highlighted', false);

    svg
      .selectAll('.node')
      .filter((d: any) => d.id === entityId)
      .select('.entity-rect')
      .classed('highlighted', true);

    setTimeout(() => {
      svg.selectAll('.node').select('.entity-rect').classed('highlighted', false);
    }, 2000);
  }

  public setFieldFilter(filter: 'all' | 'keys' | 'foreign_keys' | 'regular'): void {
    this.fieldFilter = filter;
  }

  public openEntity(entity: EntityInfo): void {
    const kv = new KeyValuePair();
    kv.FieldName = 'ID';
    kv.Value = entity.ID;
    this.OpenEntityRecord.emit({
      EntityName: 'Entities',
      RecordPKey: new CompositeKey([kv]),
    });
  }

  public zoomIn(): void {
    if (!this.svg || !this.zoom) return;
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.5);
  }

  public zoomOut(): void {
    if (!this.svg || !this.zoom) return;
    this.svg
      .transition()
      .duration(300)
      .call(this.zoom.scaleBy, 1 / 1.5);
  }

  public resetZoom(): void {
    if (!this.svg || !this.zoom) return;
    this.svg.transition().duration(500).call(this.zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
  }

  public getEntityFields(entityId: string): EntityFieldInfo[] {
    const allFields = this.allEntityFields.filter((field) => field.EntityID === entityId);

    switch (this.fieldFilter) {
      case 'keys':
        return allFields.filter((field) => field.IsPrimaryKey || field.Name?.toLowerCase().includes('id') || field.Name?.toLowerCase().includes('key'));
      case 'foreign_keys':
        return allFields.filter((field) => field.RelatedEntityID);
      case 'regular':
        return allFields.filter((field) => !field.RelatedEntityID && !field.IsPrimaryKey);
      default:
        return allFields;
    }
  }

  public getRelatedEntities(entityId: string): EntityInfo[] {
    // Get outgoing relationships (this entity has FKs pointing to other entities)
    const outgoingRelatedIds = this.allEntityFields
      .filter((field) => field.EntityID === entityId && field.RelatedEntityID && field.RelatedEntityID !== entityId)
      .map((field) => field.RelatedEntityID!);

    // Get incoming relationships (other entities have FKs pointing to this entity)
    const incomingRelatedIds = this.allEntityFields
      .filter((field) => field.RelatedEntityID === entityId && field.EntityID && field.EntityID !== entityId)
      .map((field) => field.EntityID!);

    // Combine both outgoing and incoming relationships, removing duplicates
    const allRelatedIds = [...new Set([...outgoingRelatedIds, ...incomingRelatedIds])];

    return this.entities.filter((entity) => allRelatedIds.includes(entity.ID));
  }

  public getActiveEntitiesCount(): number {
    return this.entities.filter((e) => e.Status === 'Active').length;
  }
}

export function LoadEntityAdminDashboard() {
  // Prevents tree-shaking
}
