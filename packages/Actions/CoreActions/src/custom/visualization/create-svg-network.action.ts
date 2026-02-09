import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import * as d3Force from 'd3-force';
import * as d3Hierarchy from 'd3-hierarchy';
import { JSDOM } from 'jsdom';
import {
    GraphNode,
    GraphEdge,
    NetworkLayoutType,
    PhysicsParams,
    DecisionNode,
    NodeShape,
    SVGActionResult,
    ViewBox,
    Branding,
} from './shared/svg-types';
import { SVGUtils } from './shared/svg-utils';
import { getPalette, generateCSS, getFontSpec, getColorForIndex } from './shared/svg-theming';

/**
 * Action that generates SVG network graphs including force-directed layouts, decision trees, and radial networks.
 *
 * This action provides server-side SVG generation for network visualizations, designed for
 * AI agents and workflows to create publication-quality graphs from structured data.
 *
 * @example
 * ```typescript
 * // Force-directed network example
 * await runAction({
 *   ActionName: 'Create SVG Network',
 *   Params: [
 *     { Name: 'NetworkType', Value: 'force' },
 *     { Name: 'Nodes', Value: JSON.stringify([
 *       { id: '1', label: 'Node A', group: 'A' },
 *       { id: '2', label: 'Node B', group: 'B' },
 *       { id: '3', label: 'Node C', group: 'A' }
 *     ]) },
 *     { Name: 'Edges', Value: JSON.stringify([
 *       { source: '1', target: '2', weight: 1, directed: true },
 *       { source: '2', target: '3', weight: 0.5 }
 *     ]) },
 *     { Name: 'ShowLabels', Value: 'true' },
 *     { Name: 'ShowLegend', Value: 'true' }
 *   ]
 * });
 *
 * // Decision tree example
 * await runAction({
 *   ActionName: 'Create SVG Network',
 *   Params: [
 *     { Name: 'NetworkType', Value: 'tree' },
 *     { Name: 'Nodes', Value: JSON.stringify({
 *       id: 'root',
 *       label: 'Decision',
 *       children: [
 *         { id: '1', label: 'Option A', value: 0.6 },
 *         { id: '2', label: 'Option B', value: 0.4 }
 *       ]
 *     }) }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, '__CreateSVGNetwork')
export class CreateSVGNetworkAction extends BaseAction {
    /**
     * Generates an SVG network graph from the provided data and configuration
     *
     * @param params - The action parameters containing:
     *   - NetworkType: Type of network ('force' | 'tree' | 'radial')
     *   - Nodes: JSON array or object of nodes
     *   - Edges: JSON array of edges (for force and radial)
     *   - Physics: Physics parameters (charge, linkDistance, iterations)
     *   - ShowLabels: Show node labels (default: true)
     *   - ShowLegend: Show group legend (default: false)
     *   - NodeShape: Shape for tree nodes ('rect' | 'circle' | 'pill')
     *   - Width: Width in pixels (optional, default: 800)
     *   - Height: Height in pixels (optional, default: 600)
     *   - Title: Network title (optional)
     *   - Palette: Color palette name (optional)
     *   - Seed: Random seed for deterministic layouts (optional)
     *
     * @returns A promise resolving to an SVGActionResult
     */
    protected async InternalRunAction(params: RunActionParams): Promise<SVGActionResult> {
        try {
            const networkTypeParam = this.getParamValue(params, 'NetworkType');
            if (!networkTypeParam) {
                return {
                    Success: false,
                    Message: 'NetworkType parameter is required. Must be "force", "tree", or "radial"',
                    ResultCode: 'MISSING_PARAMETERS',
                };
            }

            const networkType = this.ensureString(networkTypeParam, 'NetworkType').toLowerCase();

            if (!['force', 'tree', 'radial'].includes(networkType)) {
                return {
                    Success: false,
                    Message: 'NetworkType must be "force", "tree", or "radial"',
                    ResultCode: 'INVALID_NETWORK_TYPE',
                };
            }

            // Parse common parameters
            const width = parseInt(this.ensureString(this.getParamValue(params, 'Width') || '800', 'Width'));
            const height = parseInt(this.ensureString(this.getParamValue(params, 'Height') || '600', 'Height'));
            const title = this.ensureString(this.getParamValue(params, 'Title') || '', 'Title');
            const paletteName = this.ensureString(this.getParamValue(params, 'Palette') || 'mjDefault', 'Palette');
            const seed = parseInt(this.ensureString(this.getParamValue(params, 'Seed') || String(Date.now()), 'Seed'));
            const showLabelsParam = this.getParamValue(params, 'ShowLabels');
            const showLabels = showLabelsParam ? this.ensureString(showLabelsParam, 'ShowLabels').toLowerCase() !== 'false' : true;
            const showLegendParam = this.getParamValue(params, 'ShowLegend');
            const showLegend = showLegendParam ? this.ensureString(showLegendParam, 'ShowLegend').toLowerCase() === 'true' : false;

            // Parse interactivity parameters
            const enableTooltipsParam = this.getParamValue(params, 'EnableTooltips');
            const enableTooltips = enableTooltipsParam ? this.ensureString(enableTooltipsParam, 'EnableTooltips').toLowerCase() === 'true' : false;
            const enablePanZoomParam = this.getParamValue(params, 'EnablePanZoom');
            const enablePanZoom = enablePanZoomParam ? this.ensureString(enablePanZoomParam, 'EnablePanZoom').toLowerCase() === 'true' : false;
            const showZoomControlsParam = this.getParamValue(params, 'ShowZoomControls');
            const showZoomControls = showZoomControlsParam ? this.ensureString(showZoomControlsParam, 'ShowZoomControls').toLowerCase() === 'true' : false;
            const wrapWithContainerParam = this.getParamValue(params, 'WrapWithContainer');
            const wrapWithContainer = wrapWithContainerParam ? this.ensureString(wrapWithContainerParam, 'WrapWithContainer').toLowerCase() === 'true' : false;
            const maxContainerWidth = parseInt(this.ensureString(this.getParamValue(params, 'MaxContainerWidth') || '1200', 'MaxContainerWidth'));
            const maxContainerHeight = parseInt(this.ensureString(this.getParamValue(params, 'MaxContainerHeight') || '800', 'MaxContainerHeight'));

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

            // Generate network based on type
            let svg: string;
            const warnings: string[] = [];

            switch (networkType) {
                case 'force':
                    svg = await this.renderForceNetwork(params, viewBox, branding, title, seed, showLabels, showLegend, enableTooltips, enablePanZoom, showZoomControls, warnings);
                    break;
                case 'tree':
                    svg = await this.renderDecisionTree(params, viewBox, branding, title, showLabels, enableTooltips, enablePanZoom, showZoomControls);
                    break;
                case 'radial':
                    svg = await this.renderRadialNetwork(params, viewBox, branding, title, seed, showLabels, enableTooltips, enablePanZoom, showZoomControls, warnings);
                    break;
                default:
                    return {
                        Success: false,
                        Message: `Unsupported network type: ${networkType}`,
                        ResultCode: 'INVALID_NETWORK_TYPE',
                    };
            }

            // Apply scroll container wrapping if requested
            if (wrapWithContainer) {
                svg = SVGUtils.wrapWithScrollContainer(svg, maxContainerWidth, maxContainerHeight);
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: svg,
                svg,
                width,
                height,
                warnings: warnings.length > 0 ? warnings : undefined,
            };
        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate network: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: 'NETWORK_GENERATION_FAILED',
            };
        }
    }

    /**
     * Renders a force-directed network using d3-force
     */
    private async renderForceNetwork(
        params: RunActionParams,
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        seed: number,
        showLabels: boolean,
        showLegend: boolean,
        enableTooltips: boolean,
        enablePanZoom: boolean,
        showZoomControls: boolean,
        warnings: string[]
    ): Promise<string> {
        // Parse nodes and edges
        const nodesParam = this.getParamValue(params, 'Nodes');
        const edgesParam = this.getParamValue(params, 'Edges');

        if (!nodesParam) {
            throw new Error('Nodes parameter is required for force networks');
        }

        const nodes: GraphNode[] = this.parseJSON<GraphNode[]>(nodesParam, 'Nodes');
        const edges: GraphEdge[] = edgesParam ? this.parseJSON<GraphEdge[]>(edgesParam, 'Edges') : [];

        // Parse physics parameters
        const physicsParam = this.getParamValue(params, 'Physics');
        const physics: PhysicsParams = physicsParam ? this.parseJSON<PhysicsParams>(physicsParam, 'Physics') : {};
        const charge = physics.charge || -300;
        const linkDistance = physics.linkDistance || 100;
        const iterations = physics.iterations || 300;

        // Warn if graph is too large
        if (nodes.length > 500) {
            warnings.push(`Large graph with ${nodes.length} nodes may have performance issues`);
        }

        // Create seeded random generator
        const random = SVGUtils.seededRandom(seed);

        // Initialize node positions randomly
        const vb = SVGUtils.calculateViewBox(viewBox);
        const simNodes = nodes.map((n) => ({
            ...n,
            x: vb.x + random() * vb.contentWidth,
            y: vb.y + random() * vb.contentHeight,
            vx: 0,
            vy: 0,
        }));

        // Create force simulation
        const simulation = d3Force
            .forceSimulation(simNodes)
            .force(
                'link',
                d3Force
                    .forceLink(edges)
                    .id((d: any) => d.id)
                    .distance(linkDistance)
            )
            .force('charge', d3Force.forceManyBody().strength(charge))
            .force('center', d3Force.forceCenter(vb.x + vb.contentWidth / 2, vb.y + vb.contentHeight / 2))
            .force('collide', d3Force.forceCollide(20))
            .stop();

        // Run simulation headless
        for (let i = 0; i < iterations; i++) {
            simulation.tick();
        }

        // Create SVG
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'force-network');
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
        const ns = svg.namespaceURI!;

        // Build group-to-color mapping
        const groups = [...new Set(nodes.map((n) => n.group).filter((g): g is string => g != null))];
        const groupColorMap = new Map(groups.map((g, i) => [g, getColorForIndex(i, branding.palette)]));

        // Wrap content in pan/zoom container if needed
        const contentContainer = doc.createElementNS(ns, 'g');
        contentContainer.setAttribute('id', enablePanZoom ? 'pan-zoom-container' : 'content-container');
        svg.appendChild(contentContainer);

        // Render edges
        const edgesGroup = doc.createElementNS(ns, 'g');
        edgesGroup.setAttribute('id', 'edges');
        contentContainer.appendChild(edgesGroup);

        for (const edge of edges as any[]) {
            const sourceSim = simNodes.find((n) => n.id === edge.source.id || n.id === edge.source);
            const targetSim = simNodes.find((n) => n.id === edge.target.id || n.id === edge.target);

            if (!sourceSim || !targetSim) continue;

            const line = doc.createElementNS(ns, 'line');
            line.setAttribute('x1', String(sourceSim.x));
            line.setAttribute('y1', String(sourceSim.y));
            line.setAttribute('x2', String(targetSim.x));
            line.setAttribute('y2', String(targetSim.y));
            line.setAttribute('stroke', palette.foreground);
            line.setAttribute('stroke-width', String((edge.weight || 1) * 2));
            line.setAttribute('opacity', '0.6');

            if (edge.directed) {
                const markerId = SVGUtils.addArrowMarker(svg, 'arrow-force', palette.foreground);
                line.setAttribute('marker-end', markerId);
            }

            edgesGroup.appendChild(line);
        }

        // Render nodes
        const nodesGroup = doc.createElementNS(ns, 'g');
        nodesGroup.setAttribute('id', 'nodes');
        contentContainer.appendChild(nodesGroup);

        for (const node of simNodes) {
            const g = doc.createElementNS(ns, 'g');
            g.setAttribute('transform', `translate(${node.x}, ${node.y})`);
            g.setAttribute('data-node-id', node.id);

            // Add tooltip data if enabled
            if (enableTooltips) {
                const tooltipText = `${node.label || node.id}${node.group ? ' (' + node.group + ')' : ''}`;
                g.setAttribute('data-tooltip', tooltipText);
            }

            const radius = node.size || 10;
            const color = node.group ? groupColorMap.get(node.group) || palette.categorical[0] : palette.categorical[0];

            const circle = doc.createElementNS(ns, 'circle');
            circle.setAttribute('r', String(radius));
            circle.setAttribute('fill', color);
            circle.setAttribute('stroke', '#FFF');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('class', 'node-circle');
            g.appendChild(circle);

            if (showLabels && node.label) {
                const text = doc.createElementNS(ns, 'text');
                text.setAttribute('y', String(radius + 15));
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-size', '11');
                text.setAttribute('fill', palette.foreground);
                text.textContent = node.label;
                g.appendChild(text);
            }

            nodesGroup.appendChild(g);
        }

        // Add legend if requested
        if (showLegend && groups.length > 0) {
            this.addLegend(doc, svg, groups, groupColorMap, vb, getFontSpec(branding.font));
        }

        // Add title if present
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Add interactivity features
        if (enableTooltips) {
            SVGUtils.addTooltipSupport(svg, doc);
        }

        if (enablePanZoom) {
            const panZoomScript = doc.createElementNS(ns, 'script');
            panZoomScript.setAttribute('type', 'text/javascript');
            panZoomScript.textContent = SVGUtils.generatePanZoomScript('pan-zoom-container', 0.5, 3, showZoomControls).replace(/<script[^>]*>|<\/script>/gi, '');
            svg.appendChild(panZoomScript);
        }

        // Sanitize and return
        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders a decision tree using d3-hierarchy
     */
    private async renderDecisionTree(
        params: RunActionParams,
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        showLabels: boolean,
        enableTooltips: boolean,
        enablePanZoom: boolean,
        showZoomControls: boolean
    ): Promise<string> {
        // Parse tree
        const nodesParam = this.getParamValue(params, 'Nodes');

        if (!nodesParam) {
            throw new Error('Nodes parameter is required for decision trees');
        }

        const rootNode: DecisionNode = this.parseJSON<DecisionNode>(nodesParam, 'Nodes');
        const nodeShapeParam = this.getParamValue(params, 'NodeShape');
        const nodeShape = (nodeShapeParam ? this.ensureString(nodeShapeParam, 'NodeShape') : 'rect') as NodeShape;

        // Create hierarchy
        const hierarchy = d3Hierarchy.hierarchy(rootNode);

        // Create tree layout
        const vb = SVGUtils.calculateViewBox(viewBox);
        const treeLayout = d3Hierarchy.tree<DecisionNode>().size([vb.contentWidth, vb.contentHeight]);

        // Calculate layout
        const treeData = treeLayout(hierarchy);

        // Create SVG
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'decision-tree');
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
        const ns = svg.namespaceURI!;

        // Create container group with offset for padding
        const container = doc.createElementNS(ns, 'g');
        container.setAttribute('transform', `translate(${vb.x}, ${vb.y})`);
        svg.appendChild(container);

        // Render links
        treeData.links().forEach((link) => {
            const path = doc.createElementNS(ns, 'path');

            // Diagonal path
            const d = `M ${link.source.x},${link.source.y}
                       C ${link.source.x},${(link.source.y + link.target.y) / 2}
                         ${link.target.x},${(link.source.y + link.target.y) / 2}
                         ${link.target.x},${link.target.y}`;

            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', palette.foreground);
            path.setAttribute('stroke-width', '2');
            path.setAttribute('opacity', '0.6');

            container.appendChild(path);
        });

        // Render nodes
        treeData.descendants().forEach((node) => {
            const g = doc.createElementNS(ns, 'g');
            g.setAttribute('transform', `translate(${node.x}, ${node.y})`);

            const colorIndex = node.depth % palette.categorical.length;
            const fillColor = palette.categorical[colorIndex];

            // Render shape based on nodeShape
            switch (nodeShape) {
                case 'circle':
                    const circle = doc.createElementNS(ns, 'circle');
                    circle.setAttribute('r', '25');
                    circle.setAttribute('fill', fillColor);
                    circle.setAttribute('stroke', '#333');
                    circle.setAttribute('stroke-width', '2');
                    g.appendChild(circle);
                    break;
                case 'pill':
                    const pill = doc.createElementNS(ns, 'path');
                    pill.setAttribute('d', SVGUtils.roundedRectPath(-40, -20, 80, 40, 20));
                    pill.setAttribute('fill', fillColor);
                    pill.setAttribute('stroke', '#333');
                    pill.setAttribute('stroke-width', '2');
                    g.appendChild(pill);
                    break;
                default: // rect
                    const rect = doc.createElementNS(ns, 'rect');
                    rect.setAttribute('x', '-30');
                    rect.setAttribute('y', '-20');
                    rect.setAttribute('width', '60');
                    rect.setAttribute('height', '40');
                    rect.setAttribute('fill', fillColor);
                    rect.setAttribute('stroke', '#333');
                    rect.setAttribute('stroke-width', '2');
                    rect.setAttribute('rx', '5');
                    g.appendChild(rect);
                    break;
            }

            // Add label
            if (showLabels) {
                const labelText = doc.createElementNS(ns, 'text');
                labelText.setAttribute('y', node.data.value != null ? '-5' : '0');
                labelText.setAttribute('text-anchor', 'middle');
                labelText.setAttribute('dominant-baseline', 'middle');
                labelText.setAttribute('font-size', '11');
                labelText.setAttribute('font-weight', 'bold');
                labelText.setAttribute('fill', '#FFF');
                labelText.textContent = node.data.label;
                g.appendChild(labelText);

                // Add value if present
                if (node.data.value != null) {
                    const valueText = doc.createElementNS(ns, 'text');
                    valueText.setAttribute('y', '8');
                    valueText.setAttribute('text-anchor', 'middle');
                    valueText.setAttribute('font-size', '9');
                    valueText.setAttribute('fill', '#FFF');
                    valueText.setAttribute('opacity', '0.9');
                    valueText.textContent = String(node.data.value);
                    g.appendChild(valueText);
                }
            }

            container.appendChild(g);
        });

        // Add title if present
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Sanitize and return
        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders a radial network using d3-force with radial constraint
     */
    private async renderRadialNetwork(
        params: RunActionParams,
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        seed: number,
        showLabels: boolean,
        enableTooltips: boolean,
        enablePanZoom: boolean,
        showZoomControls: boolean,
        warnings: string[]
    ): Promise<string> {
        // Parse nodes and edges
        const nodesParam = this.getParamValue(params, 'Nodes');
        const edgesParam = this.getParamValue(params, 'Edges');

        if (!nodesParam) {
            throw new Error('Nodes parameter is required for radial networks');
        }

        const nodes: GraphNode[] = this.parseJSON<GraphNode[]>(nodesParam, 'Nodes');
        const edges: GraphEdge[] = edgesParam ? this.parseJSON<GraphEdge[]>(edgesParam, 'Edges') : [];

        // Identify central node (first node or node with most connections)
        const degreeMap = new Map<string, number>();
        for (const edge of edges) {
            degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
            degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
        }

        const centralNodeId = nodes.length > 0 ? [...degreeMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || nodes[0].id : nodes[0].id;

        // Create seeded random generator
        const random = SVGUtils.seededRandom(seed);

        // Initialize node positions
        const vb = SVGUtils.calculateViewBox(viewBox);
        const centerX = vb.x + vb.contentWidth / 2;
        const centerY = vb.y + vb.contentHeight / 2;

        const simNodes = nodes.map((n, i) => ({
            ...n,
            x: centerX + (random() - 0.5) * 100,
            y: centerY + (random() - 0.5) * 100,
            vx: 0,
            vy: 0,
            isCentral: n.id === centralNodeId,
        }));

        // Create force simulation with radial force
        const simulation = d3Force
            .forceSimulation(simNodes)
            .force(
                'link',
                d3Force
                    .forceLink(edges)
                    .id((d: any) => d.id)
                    .distance(80)
            )
            .force('charge', d3Force.forceManyBody().strength(-200))
            .force(
                'radial',
                d3Force.forceRadial<any>(
                    (d) => (d.isCentral ? 0 : 150),
                    centerX,
                    centerY
                )
            )
            .force('collide', d3Force.forceCollide(25))
            .stop();

        // Run simulation headless
        for (let i = 0; i < 300; i++) {
            simulation.tick();
        }

        // Create SVG (reuse force network rendering logic)
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'radial-network');
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
        const ns = svg.namespaceURI!;

        // Render edges
        const edgesGroup = doc.createElementNS(ns, 'g');
        edgesGroup.setAttribute('id', 'edges');
        svg.appendChild(edgesGroup);

        for (const edge of edges as any[]) {
            const sourceSim = simNodes.find((n) => n.id === edge.source.id || n.id === edge.source);
            const targetSim = simNodes.find((n) => n.id === edge.target.id || n.id === edge.target);

            if (!sourceSim || !targetSim) continue;

            const line = doc.createElementNS(ns, 'line');
            line.setAttribute('x1', String(sourceSim.x));
            line.setAttribute('y1', String(sourceSim.y));
            line.setAttribute('x2', String(targetSim.x));
            line.setAttribute('y2', String(targetSim.y));
            line.setAttribute('stroke', palette.foreground);
            line.setAttribute('stroke-width', '2');
            line.setAttribute('opacity', '0.4');

            edgesGroup.appendChild(line);
        }

        // Render nodes
        const nodesGroup = doc.createElementNS(ns, 'g');
        nodesGroup.setAttribute('id', 'nodes');
        svg.appendChild(nodesGroup);

        for (const node of simNodes) {
            const g = doc.createElementNS(ns, 'g');
            g.setAttribute('transform', `translate(${node.x}, ${node.y})`);

            const radius = node.isCentral ? 20 : node.size || 12;
            const color = node.isCentral ? palette.categorical[4] : palette.categorical[0];

            const circle = doc.createElementNS(ns, 'circle');
            circle.setAttribute('r', String(radius));
            circle.setAttribute('fill', color);
            circle.setAttribute('stroke', '#FFF');
            circle.setAttribute('stroke-width', node.isCentral ? '3' : '2');
            g.appendChild(circle);

            if (showLabels && node.label) {
                const text = doc.createElementNS(ns, 'text');
                text.setAttribute('y', String(radius + 15));
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-size', node.isCentral ? '12' : '10');
                text.setAttribute('font-weight', node.isCentral ? 'bold' : 'normal');
                text.setAttribute('fill', palette.foreground);
                text.textContent = node.label;
                g.appendChild(text);
            }

            nodesGroup.appendChild(g);
        }

        // Add title if present
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Sanitize and return
        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Adds a legend to the SVG
     */
    private addLegend(
        doc: Document,
        svg: SVGElement,
        groups: string[],
        groupColorMap: Map<string, string>,
        vb: { width: number; height: number; x: number; y: number },
        font: { family: string; size: number }
    ): void {
        const ns = svg.namespaceURI!;
        const legendGroup = doc.createElementNS(ns, 'g');
        legendGroup.setAttribute('id', 'legend');
        legendGroup.setAttribute('transform', `translate(${vb.width - 150}, 50)`);

        groups.forEach((group, i) => {
            const g = doc.createElementNS(ns, 'g');
            g.setAttribute('transform', `translate(0, ${i * 25})`);

            const circle = doc.createElementNS(ns, 'circle');
            circle.setAttribute('cx', '10');
            circle.setAttribute('cy', '10');
            circle.setAttribute('r', '8');
            circle.setAttribute('fill', groupColorMap.get(group)!);
            circle.setAttribute('stroke', '#333');
            g.appendChild(circle);

            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', '25');
            text.setAttribute('y', '15');
            text.setAttribute('font-size', String(font.size - 2));
            text.textContent = group;
            g.appendChild(text);

            legendGroup.appendChild(g);
        });

        svg.appendChild(legendGroup);
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