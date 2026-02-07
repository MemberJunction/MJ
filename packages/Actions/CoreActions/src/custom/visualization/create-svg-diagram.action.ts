import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import * as dagre from '@dagrejs/dagre';
import * as d3Hierarchy from 'd3-hierarchy';
import { JSDOM } from 'jsdom';
import {
    FlowNode,
    FlowEdge,
    FlowLayout,
    OrgNode,
    ERTable,
    ERRelation,
    SVGActionResult,
    ViewBox,
    Accessibility,
    Branding,
} from './shared/svg-types';
import { SVGUtils } from './shared/svg-utils';
import { getPalette, generateCSS, getFontSpec } from './shared/svg-theming';

/**
 * Action that generates SVG diagrams including flowcharts, org charts, and ER diagrams.
 *
 * This action provides server-side SVG generation for structured diagrams, designed for
 * AI agents and workflows to create publication-quality visualizations from structured data.
 *
 * @example
 * ```typescript
 * // Flowchart example
 * await runAction({
 *   ActionName: 'Create SVG Diagram',
 *   Params: [
 *     { Name: 'DiagramType', Value: 'flow' },
 *     { Name: 'Nodes', Value: JSON.stringify([
 *       { id: '1', kind: 'start', label: 'Start' },
 *       { id: '2', kind: 'process', label: 'Process Data' },
 *       { id: '3', kind: 'end', label: 'End' }
 *     ]) },
 *     { Name: 'Edges', Value: JSON.stringify([
 *       { from: '1', to: '2', label: 'Begin' },
 *       { from: '2', to: '3' }
 *     ]) },
 *     { Name: 'Direction', Value: 'TB' },
 *     { Name: 'Width', Value: '800' },
 *     { Name: 'Height', Value: '600' }
 *   ]
 * });
 *
 * // Org chart example
 * await runAction({
 *   ActionName: 'Create SVG Diagram',
 *   Params: [
 *     { Name: 'DiagramType', Value: 'org' },
 *     { Name: 'Nodes', Value: JSON.stringify({
 *       id: '1',
 *       label: 'CEO',
 *       role: 'Chief Executive Officer',
 *       children: [
 *         { id: '2', label: 'CTO', role: 'Technology' },
 *         { id: '3', label: 'CFO', role: 'Finance' }
 *       ]
 *     }) }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, '__CreateSVGDiagram')
export class CreateSVGDiagramAction extends BaseAction {
    /**
     * Generates an SVG diagram from the provided data and configuration
     *
     * @param params - The action parameters containing:
     *   - DiagramType: Type of diagram ('flow' | 'org' | 'er')
     *   - Nodes: JSON array or object of nodes
     *   - Edges: JSON array of edges (for flow and ER diagrams)
     *   - Direction: Layout direction ('TB' | 'LR' | 'RL' | 'BT') for flow diagrams
     *   - Width: Diagram width in pixels (optional, default: 800)
     *   - Height: Diagram height in pixels (optional, default: 600)
     *   - Title: Diagram title (optional)
     *   - Palette: Color palette ('mjDefault' | 'gray' | 'pastel' | 'highContrast')
     *   - Seed: Random seed for deterministic layouts (optional)
     *
     * @returns A promise resolving to an SVGActionResult with:
     *   - Success: true if diagram was generated successfully
     *   - ResultCode: "SUCCESS" or error code
     *   - Message: The SVG string or error message
     *   - svg: The SVG XML string
     *   - width: Diagram width in pixels
     *   - height: Diagram height in pixels
     */
    protected async InternalRunAction(params: RunActionParams): Promise<SVGActionResult> {
        try {
            const diagramTypeParam = this.getParamValue(params, 'DiagramType');

            if (!diagramTypeParam) {
                return {
                    Success: false,
                    Message: 'DiagramType parameter is required (flow, org, or er)',
                    ResultCode: 'MISSING_PARAMETERS',
                };
            }

            const diagramType = this.ensureString(diagramTypeParam, 'DiagramType').toLowerCase();

            // Parse common parameters
            const width = parseInt(this.ensureString(this.getParamValue(params, 'Width') || '800', 'Width'));
            const height = parseInt(this.ensureString(this.getParamValue(params, 'Height') || '600', 'Height'));
            const title = this.ensureString(this.getParamValue(params, 'Title') || '', 'Title');
            const paletteName = this.ensureString(this.getParamValue(params, 'Palette') || 'mjDefault', 'Palette');
            const seed = parseInt(this.ensureString(this.getParamValue(params, 'Seed') || '0', 'Seed'));

            // Create branding configuration
            const branding: Branding = {
                palette: { type: 'named', name: paletteName as any },
            };

            // Create viewBox configuration
            const viewBox: ViewBox = {
                width,
                height,
                padding: 40,
            };

            // Generate diagram based on type
            let svg: string;
            switch (diagramType) {
                case 'flow':
                    svg = await this.renderFlowDiagram(params, viewBox, branding, title, seed);
                    break;
                case 'org':
                    svg = await this.renderOrgChart(params, viewBox, branding, title);
                    break;
                case 'er':
                    svg = await this.renderERDiagram(params, viewBox, branding, title, seed);
                    break;
                default:
                    return {
                        Success: false,
                        Message: `Unsupported diagram type: ${diagramType}. Supported types: flow, org, er`,
                        ResultCode: 'INVALID_DIAGRAM_TYPE',
                    };
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: svg,
                svg,
                width,
                height,
            };
        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate diagram: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: 'DIAGRAM_GENERATION_FAILED',
            };
        }
    }

    /**
     * Renders a flowchart using dagre layout
     */
    private async renderFlowDiagram(
        params: RunActionParams,
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        seed: number
    ): Promise<string> {
        // Parse nodes and edges
        const nodesParam = this.getParamValue(params, 'Nodes');
        const edgesParam = this.getParamValue(params, 'Edges');

        if (!nodesParam) {
            throw new Error('Nodes parameter is required for flow diagrams');
        }

        const nodes: FlowNode[] = this.parseJSON<FlowNode[]>(nodesParam, 'Nodes');
        const edges: FlowEdge[] = edgesParam ? this.parseJSON<FlowEdge[]>(edgesParam, 'Edges') : [];
        const directionParam = this.getParamValue(params, 'Direction');
        const direction = (directionParam ? this.ensureString(directionParam, 'Direction') : 'TB') as FlowLayout['direction'];

        // Create dagre graph
        const g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: direction,
            nodesep: 50,
            ranksep: 80,
            marginx: 40,
            marginy: 40,
        });
        g.setDefaultEdgeLabel(() => ({}));

        // Add nodes to graph with dimensions based on kind
        for (const node of nodes) {
            const dims = this.getNodeDimensions(node);
            g.setNode(node.id, {
                ...node,
                width: node.width || dims.width,
                height: node.height || dims.height,
            });
        }

        // Add edges to graph
        for (const edge of edges) {
            g.setEdge(edge.from, edge.to, edge);
        }

        // Run dagre layout
        dagre.layout(g);

        // Create SVG
        const vb = SVGUtils.calculateViewBox(viewBox);
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'flow');
        const svg = doc.querySelector('svg')!;

        // Add accessibility
        if (title) {
            SVGUtils.addA11y(svg, {
                title,
                ariaRole: 'img',
            });
        }

        // Add styles
        const css = generateCSS(branding);
        SVGUtils.addStyles(svg, css);

        // Get palette for colors
        const palette = getPalette(branding.palette);

        // Render nodes
        for (const nodeId of g.nodes()) {
            const node = g.node(nodeId) as FlowNode & { x: number; y: number; width: number; height: number };
            this.renderFlowNode(doc, svg, node, palette);
        }

        // Render edges
        for (const edgeObj of g.edges()) {
            const edge = g.edge(edgeObj) as FlowEdge & { points: Array<{ x: number; y: number }> };
            this.renderFlowEdge(doc, svg, edge, palette);
        }

        // Add title if present
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Sanitize and return
        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Gets dimensions for flow node based on kind
     */
    private getNodeDimensions(node: FlowNode): { width: number; height: number } {
        const labelWidth = SVGUtils.estimateTextWidth(node.label, 14);

        switch (node.kind) {
            case 'start':
            case 'end':
                return { width: 120, height: 60 };
            case 'decision':
                return { width: Math.max(160, labelWidth + 40), height: 100 };
            case 'process':
            case 'input':
            case 'output':
            case 'subprocess':
                return { width: Math.max(140, labelWidth + 40), height: 70 };
            default:
                return { width: 140, height: 70 };
        }
    }

    /**
     * Renders a single flow node
     */
    private renderFlowNode(
        doc: Document,
        svg: SVGElement,
        node: FlowNode & { x: number; y: number; width: number; height: number },
        palette: { foreground: string; categorical: string[] }
    ): void {
        const ns = svg.namespaceURI!;
        const g = doc.createElementNS(ns, 'g');
        g.setAttribute('id', node.id);
        g.setAttribute('transform', `translate(${node.x}, ${node.y})`);

        const colorIndex = this.getNodeColorIndex(node.kind);
        const fillColor = palette.categorical[colorIndex % palette.categorical.length];

        // Render shape based on kind
        switch (node.kind) {
            case 'start':
            case 'end':
                this.renderEllipse(doc, g, node.width, node.height, fillColor);
                break;
            case 'decision':
                this.renderDiamond(doc, g, node.width, node.height, fillColor);
                break;
            case 'subprocess':
                this.renderRoundedRect(doc, g, node.width, node.height, fillColor, 10);
                // Add double border for subprocess
                const innerRect = doc.createElementNS(ns, 'path');
                innerRect.setAttribute('d', SVGUtils.roundedRectPath(-node.width / 2 + 5, -node.height / 2 + 5, node.width - 10, node.height - 10, 8));
                innerRect.setAttribute('fill', 'none');
                innerRect.setAttribute('stroke', palette.foreground);
                innerRect.setAttribute('stroke-width', '1.5');
                g.appendChild(innerRect);
                break;
            default:
                this.renderRoundedRect(doc, g, node.width, node.height, fillColor, 5);
                break;
        }

        // Add label
        const text = doc.createElementNS(ns, 'text');
        text.setAttribute('class', 'node-text');
        text.setAttribute('y', '0');
        text.textContent = node.label;
        g.appendChild(text);

        svg.appendChild(g);
    }

    /**
     * Gets color index for node kind
     */
    private getNodeColorIndex(kind: string): number {
        const kindMap: Record<string, number> = {
            start: 0,
            end: 1,
            process: 2,
            decision: 3,
            input: 4,
            output: 5,
            subprocess: 6,
        };
        return kindMap[kind] || 2;
    }

    /**
     * Renders an ellipse shape
     */
    private renderEllipse(doc: Document, g: Element, width: number, height: number, fill: string): void {
        const ns = g.namespaceURI!;
        const ellipse = doc.createElementNS(ns, 'ellipse');
        ellipse.setAttribute('cx', '0');
        ellipse.setAttribute('cy', '0');
        ellipse.setAttribute('rx', String(width / 2));
        ellipse.setAttribute('ry', String(height / 2));
        ellipse.setAttribute('fill', fill);
        ellipse.setAttribute('stroke', '#333');
        ellipse.setAttribute('stroke-width', '2');
        g.appendChild(ellipse);
    }

    /**
     * Renders a diamond shape
     */
    private renderDiamond(doc: Document, g: Element, width: number, height: number, fill: string): void {
        const ns = g.namespaceURI!;
        const path = doc.createElementNS(ns, 'path');
        const w = width / 2;
        const h = height / 2;
        const d = `M 0,${-h} L ${w},0 L 0,${h} L ${-w},0 Z`;
        path.setAttribute('d', d);
        path.setAttribute('fill', fill);
        path.setAttribute('stroke', '#333');
        path.setAttribute('stroke-width', '2');
        g.appendChild(path);
    }

    /**
     * Renders a rounded rectangle
     */
    private renderRoundedRect(doc: Document, g: Element, width: number, height: number, fill: string, radius: number): void {
        const ns = g.namespaceURI!;
        const path = doc.createElementNS(ns, 'path');
        path.setAttribute('d', SVGUtils.roundedRectPath(-width / 2, -height / 2, width, height, radius));
        path.setAttribute('fill', fill);
        path.setAttribute('stroke', '#333');
        path.setAttribute('stroke-width', '2');
        g.appendChild(path);
    }

    /**
     * Renders a flow edge
     */
    private renderFlowEdge(
        doc: Document,
        svg: SVGElement,
        edge: FlowEdge & { points: Array<{ x: number; y: number }> },
        palette: { foreground: string }
    ): void {
        const ns = svg.namespaceURI!;
        const g = doc.createElementNS(ns, 'g');

        // Create path from points
        const pathData = edge.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

        const path = doc.createElementNS(ns, 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'edge-line');
        if (edge.dashed) {
            path.setAttribute('stroke-dasharray', '5,5');
        }

        // Add arrow marker
        const markerId = SVGUtils.addArrowMarker(svg, 'arrow-end', palette.foreground);
        path.setAttribute('marker-end', markerId);

        g.appendChild(path);

        // Add label if present
        if (edge.label) {
            const midPoint = edge.points[Math.floor(edge.points.length / 2)];
            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', String(midPoint.x));
            text.setAttribute('y', String(midPoint.y - 5));
            text.setAttribute('class', 'edge-label');
            text.textContent = edge.label;
            g.appendChild(text);
        }

        svg.appendChild(g);
    }

    /**
     * Renders an org chart using d3-hierarchy
     */
    private async renderOrgChart(params: RunActionParams, viewBox: ViewBox, branding: Branding, title: string): Promise<string> {
        // Parse org tree
        const nodesParam = this.getParamValue(params, 'Nodes');

        if (!nodesParam) {
            throw new Error('Nodes parameter is required for org charts');
        }

        const rootNode: OrgNode = this.parseJSON<OrgNode>(nodesParam, 'Nodes');

        // Create hierarchy
        const hierarchy = d3Hierarchy.hierarchy(rootNode);

        // Create tree layout
        const vb = SVGUtils.calculateViewBox(viewBox);
        const treeLayout = d3Hierarchy.tree<OrgNode>().size([vb.contentWidth, vb.contentHeight]);

        // Calculate layout
        const treeData = treeLayout(hierarchy);

        // Create SVG
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'org');
        const svg = doc.querySelector('svg')!;

        // Add accessibility
        if (title) {
            SVGUtils.addA11y(svg, {
                title,
                ariaRole: 'img',
            });
        }

        // Add styles
        const css = generateCSS(branding);
        SVGUtils.addStyles(svg, css);

        // Get palette
        const palette = getPalette(branding.palette);

        // Create container group with offset for padding
        const container = doc.createElementNS(svg.namespaceURI!, 'g');
        container.setAttribute('transform', `translate(${vb.x}, ${vb.y})`);
        svg.appendChild(container);

        // Render links first (so they appear behind nodes)
        treeData.links().forEach((link) => {
            this.renderOrgLink(doc, container, link, palette);
        });

        // Render nodes
        treeData.descendants().forEach((node) => {
            this.renderOrgNode(doc, container, node, palette);
        });

        // Add title if present
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Sanitize and return
        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders an org chart link
     */
    private renderOrgLink(
        doc: Document,
        container: Element,
        link: d3Hierarchy.HierarchyPointLink<OrgNode>,
        palette: { foreground: string }
    ): void {
        const ns = container.namespaceURI!;
        const path = doc.createElementNS(ns, 'path');

        // Create elbow connector
        const d = `M ${link.source.x},${link.source.y + 35}
                   L ${link.source.x},${(link.source.y + link.target.y) / 2}
                   L ${link.target.x},${(link.source.y + link.target.y) / 2}
                   L ${link.target.x},${link.target.y - 35}`;

        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', palette.foreground);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('opacity', '0.6');

        container.appendChild(path);
    }

    /**
     * Renders an org chart node
     */
    private renderOrgNode(
        doc: Document,
        container: Element,
        node: d3Hierarchy.HierarchyPointNode<OrgNode>,
        palette: { foreground: string; categorical: string[] }
    ): void {
        const ns = container.namespaceURI!;
        const g = doc.createElementNS(ns, 'g');
        g.setAttribute('transform', `translate(${node.x}, ${node.y})`);

        const boxWidth = 180;
        const boxHeight = 70;

        // Determine color based on depth
        const colorIndex = node.depth % palette.categorical.length;
        const fillColor = palette.categorical[colorIndex];

        // Render box
        const rect = doc.createElementNS(ns, 'rect');
        rect.setAttribute('x', String(-boxWidth / 2));
        rect.setAttribute('y', String(-boxHeight / 2));
        rect.setAttribute('width', String(boxWidth));
        rect.setAttribute('height', String(boxHeight));
        rect.setAttribute('fill', fillColor);
        rect.setAttribute('stroke', '#333');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('rx', '8');

        if (node.data.highlight) {
            rect.setAttribute('stroke', '#FFD700');
            rect.setAttribute('stroke-width', '4');
        }

        g.appendChild(rect);

        // Add avatar circle if avatarUrl present
        if (node.data.avatarUrl) {
            const avatar = doc.createElementNS(ns, 'circle');
            avatar.setAttribute('cx', '0');
            avatar.setAttribute('cy', String(-boxHeight / 2 + 20));
            avatar.setAttribute('r', '15');
            avatar.setAttribute('fill', '#FFF');
            avatar.setAttribute('stroke', '#333');
            g.appendChild(avatar);
        }

        // Add name
        const nameText = doc.createElementNS(ns, 'text');
        nameText.setAttribute('y', node.data.avatarUrl ? '5' : '-8');
        nameText.setAttribute('text-anchor', 'middle');
        nameText.setAttribute('font-weight', 'bold');
        nameText.setAttribute('font-size', '14');
        nameText.setAttribute('fill', '#FFF');
        nameText.textContent = node.data.label;
        g.appendChild(nameText);

        // Add role if present
        if (node.data.role) {
            const roleText = doc.createElementNS(ns, 'text');
            roleText.setAttribute('y', node.data.avatarUrl ? '20' : '8');
            roleText.setAttribute('text-anchor', 'middle');
            roleText.setAttribute('font-size', '12');
            roleText.setAttribute('fill', '#FFF');
            roleText.setAttribute('opacity', '0.9');
            roleText.textContent = node.data.role;
            g.appendChild(roleText);
        }

        container.appendChild(g);
    }

    /**
     * Renders an ER diagram using dagre layout
     */
    private async renderERDiagram(
        params: RunActionParams,
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        seed: number
    ): Promise<string> {
        // Parse tables and relations
        const nodesParam = this.getParamValue(params, 'Nodes');
        const edgesParam = this.getParamValue(params, 'Edges');

        if (!nodesParam) {
            throw new Error('Nodes parameter is required for ER diagrams');
        }

        const tables: ERTable[] = this.parseJSON<ERTable[]>(nodesParam, 'Nodes');
        const relations: ERRelation[] = edgesParam ? this.parseJSON<ERRelation[]>(edgesParam, 'Edges') : [];

        // Create dagre graph
        const g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: 'TB',
            nodesep: 60,
            ranksep: 80,
            marginx: 40,
            marginy: 40,
        });
        g.setDefaultEdgeLabel(() => ({}));

        // Add tables as nodes
        for (const table of tables) {
            const height = 40 + table.attrs.length * 25; // Header + rows
            const maxAttrWidth = Math.max(...table.attrs.map((a) => SVGUtils.estimateTextWidth(`${a.name}: ${a.type || ''}`, 12)));
            const width = Math.max(200, maxAttrWidth + 80);

            g.setNode(table.id, {
                ...table,
                width,
                height,
            });
        }

        // Add relations as edges
        for (const rel of relations) {
            g.setEdge(rel.from, rel.to, rel);
        }

        // Run dagre layout
        dagre.layout(g);

        // Create SVG
        const vb = SVGUtils.calculateViewBox(viewBox);
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'er');
        const svg = doc.querySelector('svg')!;

        // Add accessibility
        if (title) {
            SVGUtils.addA11y(svg, {
                title,
                ariaRole: 'img',
            });
        }

        // Add styles
        const css = generateCSS(branding);
        SVGUtils.addStyles(svg, css);

        // Get palette
        const palette = getPalette(branding.palette);

        // Render tables
        for (const tableId of g.nodes()) {
            const table = g.node(tableId) as ERTable & { x: number; y: number; width: number; height: number };
            this.renderERTable(doc, svg, table, palette);
        }

        // Render relations
        for (const edgeObj of g.edges()) {
            const rel = g.edge(edgeObj) as ERRelation & { points: Array<{ x: number; y: number }> };
            this.renderERRelation(doc, svg, rel, palette);
        }

        // Add title if present
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Sanitize and return
        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders an ER table
     */
    private renderERTable(
        doc: Document,
        svg: SVGElement,
        table: ERTable & { x: number; y: number; width: number; height: number },
        palette: { foreground: string; categorical: string[]; background: string }
    ): void {
        const ns = svg.namespaceURI!;
        const g = doc.createElementNS(ns, 'g');
        g.setAttribute('id', table.id);
        g.setAttribute('transform', `translate(${table.x - table.width / 2}, ${table.y - table.height / 2})`);

        // Render table box
        const rect = doc.createElementNS(ns, 'rect');
        rect.setAttribute('x', '0');
        rect.setAttribute('y', '0');
        rect.setAttribute('width', String(table.width));
        rect.setAttribute('height', String(table.height));
        rect.setAttribute('fill', palette.background);
        rect.setAttribute('stroke', palette.foreground);
        rect.setAttribute('stroke-width', '2');
        g.appendChild(rect);

        // Render header
        const headerRect = doc.createElementNS(ns, 'rect');
        headerRect.setAttribute('x', '0');
        headerRect.setAttribute('y', '0');
        headerRect.setAttribute('width', String(table.width));
        headerRect.setAttribute('height', '40');
        headerRect.setAttribute('fill', palette.categorical[0]);
        g.appendChild(headerRect);

        // Header text
        const headerText = doc.createElementNS(ns, 'text');
        headerText.setAttribute('x', String(table.width / 2));
        headerText.setAttribute('y', '25');
        headerText.setAttribute('text-anchor', 'middle');
        headerText.setAttribute('font-weight', 'bold');
        headerText.setAttribute('font-size', '14');
        headerText.setAttribute('fill', '#FFF');
        headerText.textContent = table.name;
        g.appendChild(headerText);

        // Render attributes
        let yOffset = 40;
        for (let i = 0; i < table.attrs.length; i++) {
            const attr = table.attrs[i];

            // Alternating row colors
            if (i % 2 === 1) {
                const rowRect = doc.createElementNS(ns, 'rect');
                rowRect.setAttribute('x', '0');
                rowRect.setAttribute('y', String(yOffset));
                rowRect.setAttribute('width', String(table.width));
                rowRect.setAttribute('height', '25');
                rowRect.setAttribute('fill', '#F5F5F5');
                g.appendChild(rowRect);
            }

            // Attribute text
            const attrText = doc.createElementNS(ns, 'text');
            attrText.setAttribute('x', '10');
            attrText.setAttribute('y', String(yOffset + 17));
            attrText.setAttribute('font-size', '12');
            attrText.setAttribute('fill', palette.foreground);

            let label = attr.name;
            if (attr.pk) label = '🔑 ' + label;
            else if (attr.fk) label = '🔗 ' + label;

            if (attr.type) label += `: ${attr.type}`;

            attrText.textContent = label;
            g.appendChild(attrText);

            yOffset += 25;
        }

        svg.appendChild(g);
    }

    /**
     * Renders an ER relation
     */
    private renderERRelation(
        doc: Document,
        svg: SVGElement,
        rel: ERRelation & { points: Array<{ x: number; y: number }> },
        palette: { foreground: string }
    ): void {
        const ns = svg.namespaceURI!;
        const g = doc.createElementNS(ns, 'g');

        // Create path from points
        const pathData = rel.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');

        const path = doc.createElementNS(ns, 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'edge-line');
        path.setAttribute('stroke-dasharray', '5,5');

        g.appendChild(path);

        // Add cardinality label if present
        if (rel.label) {
            const midPoint = rel.points[Math.floor(rel.points.length / 2)];
            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', String(midPoint.x));
            text.setAttribute('y', String(midPoint.y - 5));
            text.setAttribute('class', 'edge-label');
            text.setAttribute('fill', palette.foreground);
            text.setAttribute('font-size', '11');
            text.textContent = rel.label;
            g.appendChild(text);
        }

        svg.appendChild(g);
    }

    /**
     * Adds a title to the SVG
     */
    private addTitle(doc: Document, svg: SVGElement, title: string, width: number, font: { family: string; size: number }): void {
        const ns = svg.namespaceURI!;
        const text = doc.createElementNS(ns, 'text');
        text.setAttribute('x', String(width / 2));
        text.setAttribute('y', '25');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-family', font.family);
        text.setAttribute('font-size', String(font.size + 4));
        text.setAttribute('font-weight', 'bold');
        text.textContent = title;
        svg.appendChild(text);
    }

    /**
     * Helper to safely parse JSON that might already be an object
     */
    private parseJSON<T>(value: any, paramName: string): T {
        // If it's already an object/array, return it
        if (typeof value === 'object' && value !== null) {
            return value as T;
        }

        // If it's a string, parse it
        if (typeof value === 'string') {
            try {
                return JSON.parse(value) as T;
            } catch (error) {
                throw new Error(
                    `Parameter '${paramName}' contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        // For other types, error
        throw new Error(
            `Parameter '${paramName}' must be a JSON string or object. Received ${typeof value}.`
        );
    }

    /**
     * Helper to ensure a parameter value is a string, with type conversion and validation
     */
    private ensureString(value: any, paramName: string): string {
        if (value == null) {
            return '';
        }

        if (typeof value === 'string') {
            return value;
        }

        // Convert numbers and booleans to strings
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }

        // For objects/arrays, reject with descriptive error
        throw new Error(
            `Parameter '${paramName}' must be a string, number, or boolean. ` +
            `Received ${typeof value}. If providing JSON data, ensure it's passed as a string.`
        );
    }

    /**
     * Helper to get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, paramName: string): string | null {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value && typeof param.Value === 'string') {
            return param?.Value?.trim() || null;
        } else {
            return param?.Value || null;
        }
    }
}