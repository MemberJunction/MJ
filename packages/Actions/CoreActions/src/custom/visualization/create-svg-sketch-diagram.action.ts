import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { JSDOM } from 'jsdom';
import rough from 'roughjs';
import * as dagre from '@dagrejs/dagre';
import * as d3Hierarchy from 'd3-hierarchy';
import {
    FlowNode,
    FlowEdge,
    OrgNode,
    ERTable,
    ERAttribute,
    ERRelation,
    SVGActionResult,
    ViewBox,
    Branding,
} from './shared/svg-types';
import { SVGUtils } from './shared/svg-utils';
import { getPalette, generateCSS, getFontSpec } from './shared/svg-theming';

/**
 * Action that generates hand-drawn/sketch-style SVG diagrams using Rough.js.
 * Provides informal, whiteboard-style visualizations for brainstorming and presentations.
 *
 * This action supports the same diagram types as Create SVG Diagram but renders them
 * with a sketchy, hand-drawn aesthetic using Rough.js.
 *
 * @example
 * ```typescript
 * // Sketch flowchart
 * await runAction({
 *   ActionName: 'Create SVG Sketch Diagram',
 *   Params: [
 *     { Name: 'DiagramType', Value: 'flow' },
 *     { Name: 'Nodes', Value: JSON.stringify([
 *       { id: '1', kind: 'start', label: 'Start' },
 *       { id: '2', kind: 'process', label: 'Process' },
 *       { id: '3', kind: 'end', label: 'End' }
 *     ]) },
 *     { Name: 'Edges', Value: JSON.stringify([
 *       { from: '1', to: '2' },
 *       { from: '2', to: '3' }
 *     ]) },
 *     { Name: 'Roughness', Value: '1.5' },
 *     { Name: 'FillStyle', Value: 'cross-hatch' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, '__CreateSVGSketchDiagram')
export class CreateSVGSketchDiagramAction extends BaseAction {
    /**
     * Generates a hand-drawn style SVG diagram from the provided data and configuration
     *
     * @param params - The action parameters containing:
     *   - DiagramType: Type of diagram ('flow' | 'org' | 'er')
     *   - Nodes: JSON array or object of nodes
     *   - Edges: JSON array of edges (for flow and ER diagrams)
     *   - Roughness: Hand-drawn wobble intensity (0.5-3.0, default: 1.5)
     *   - FillStyle: Fill pattern ('solid' | 'hachure' | 'cross-hatch' | 'dots', default: 'hachure')
     *   - Bowing: Curve intensity for lines (0-5, default: 1)
     *   - Direction: Layout direction ('TB' | 'LR' | 'RL' | 'BT') for flow diagrams
     *   - Width: Diagram width in pixels (optional, default: 800)
     *   - Height: Diagram height in pixels (optional, default: 600)
     *   - Title: Diagram title (optional)
     *   - Palette: Color palette name (optional)
     *   - EnableTooltips: Enable interactive tooltips (optional)
     *   - EnablePanZoom: Enable pan and zoom (optional)
     *   - WrapWithContainer: Wrap in scrollable container (optional)
     *
     * @returns A promise resolving to an SVGActionResult
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

            // Parse Rough.js parameters
            const roughness = parseFloat(this.ensureString(this.getParamValue(params, 'Roughness') || '1.5', 'Roughness'));
            const fillStyle = this.ensureString(this.getParamValue(params, 'FillStyle') || 'hachure', 'FillStyle');
            const bowing = parseFloat(this.ensureString(this.getParamValue(params, 'Bowing') || '1', 'Bowing'));

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

            // Rough.js options
            const roughOptions = {
                roughness,
                bowing,
                fillStyle: fillStyle as 'solid' | 'hachure' | 'cross-hatch' | 'dots',
                strokeWidth: 2,
                fillWeight: 0.5,
            };

            // Generate diagram based on type
            let svg: string;
            switch (diagramType) {
                case 'flow':
                    svg = await this.renderSketchFlow(params, viewBox, branding, title, roughOptions, enableTooltips, enablePanZoom, showZoomControls);
                    break;
                case 'org':
                    svg = await this.renderSketchOrg(params, viewBox, branding, title, roughOptions, enableTooltips, enablePanZoom, showZoomControls);
                    break;
                case 'er':
                    svg = await this.renderSketchER(params, viewBox, branding, title, roughOptions, enableTooltips, enablePanZoom, showZoomControls);
                    break;
                default:
                    return {
                        Success: false,
                        Message: `Unsupported diagram type: ${diagramType}. Supported types: flow, org, er`,
                        ResultCode: 'INVALID_DIAGRAM_TYPE',
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
            };
        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate sketch diagram: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: 'DIAGRAM_GENERATION_FAILED',
            };
        }
    }

    /**
     * Renders a sketch-style flowchart
     */
    private async renderSketchFlow(
        params: RunActionParams,
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        roughOptions: any,
        enableTooltips: boolean,
        enablePanZoom: boolean,
        showZoomControls: boolean
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
        const direction = (directionParam ? this.ensureString(directionParam, 'Direction') : 'TB') as 'TB' | 'LR' | 'RL' | 'BT';

        // Create dagre graph for layout
        const g = new dagre.graphlib.Graph();
        g.setGraph({
            rankdir: direction,
            nodesep: 50,
            ranksep: 80,
            marginx: 40,
            marginy: 40,
        });
        g.setDefaultEdgeLabel(() => ({}));

        // Add nodes with dimensions
        for (const node of nodes) {
            const dims = this.getNodeDimensions(node);
            g.setNode(node.id, {
                ...node,
                width: node.width || dims.width,
                height: node.height || dims.height,
            });
        }

        // Add edges
        for (const edge of edges) {
            g.setEdge(edge.from, edge.to, edge);
        }

        // Run layout
        dagre.layout(g);

        // Create SVG with JSDOM
        const vb = SVGUtils.calculateViewBox(viewBox);
        const dom = new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg" width="${viewBox.width}" height="${viewBox.height}" viewBox="0 0 ${viewBox.width} ${viewBox.height}"></svg>`);
        const doc = dom.window.document;
        const svg = doc.querySelector('svg')!;

        // Initialize Rough.js with SVG
        const rc = rough.svg(svg);

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

        // Create container
        const contentContainer = doc.createElementNS(ns, 'g');
        contentContainer.setAttribute('id', enablePanZoom ? 'pan-zoom-container' : 'content-container');
        svg.appendChild(contentContainer);

        // Render edges first (so they appear behind nodes)
        for (const edgeObj of g.edges()) {
            const edge = g.edge(edgeObj) as FlowEdge & { points: Array<{ x: number; y: number }> };

            // Draw rough line through points
            if (edge.points && edge.points.length >= 2) {
                const pathPoints: [number, number][] = edge.points.map(p => [p.x, p.y]);

                const roughLine = rc.linearPath(pathPoints, {
                    ...roughOptions,
                    stroke: palette.foreground,
                    fill: 'none',
                    strokeWidth: edge.dashed ? 1.5 : 2,
                });

                contentContainer.appendChild(roughLine);

                // Add edge label if present
                if (edge.label) {
                    const midPoint = edge.points[Math.floor(edge.points.length / 2)];
                    const text = doc.createElementNS(ns, 'text');
                    text.setAttribute('x', String(midPoint.x));
                    text.setAttribute('y', String(midPoint.y - 5));
                    text.setAttribute('class', 'edge-label');
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('font-size', '11');
                    text.textContent = edge.label;
                    contentContainer.appendChild(text);
                }
            }
        }

        // Render nodes
        for (const nodeId of g.nodes()) {
            const node = g.node(nodeId) as FlowNode & { x: number; y: number; width: number; height: number };

            const g_elem = doc.createElementNS(ns, 'g');
            g_elem.setAttribute('data-node-id', node.id);
            if (enableTooltips) {
                g_elem.setAttribute('data-tooltip', node.label);
            }

            const colorIndex = this.getNodeColorIndex(node.kind);
            const fillColor = palette.categorical[colorIndex % palette.categorical.length];

            // Draw shape based on kind
            switch (node.kind) {
                case 'start':
                case 'end':
                    // Ellipse
                    const ellipse = rc.ellipse(node.x, node.y, node.width, node.height, {
                        ...roughOptions,
                        fill: fillColor,
                        stroke: '#333',
                    });
                    g_elem.appendChild(ellipse);
                    break;

                case 'decision':
                    // Diamond
                    const w = node.width / 2;
                    const h = node.height / 2;
                    const diamond = rc.polygon([
                        [node.x, node.y - h],
                        [node.x + w, node.y],
                        [node.x, node.y + h],
                        [node.x - w, node.y]
                    ], {
                        ...roughOptions,
                        fill: fillColor,
                        stroke: '#333',
                    });
                    g_elem.appendChild(diamond);
                    break;

                default:
                    // Rectangle
                    const rect = rc.rectangle(
                        node.x - node.width / 2,
                        node.y - node.height / 2,
                        node.width,
                        node.height,
                        {
                            ...roughOptions,
                            fill: fillColor,
                            stroke: '#333',
                        }
                    );
                    g_elem.appendChild(rect);
                    break;
            }

            // Add label
            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', String(node.x));
            text.setAttribute('y', String(node.y));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-size', '12');
            text.setAttribute('font-weight', 'bold');
            text.textContent = node.label;
            g_elem.appendChild(text);

            contentContainer.appendChild(g_elem);
        }

        // Add title
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Add interactivity
        if (enableTooltips) {
            SVGUtils.addTooltipSupport(svg, doc);
        }

        if (enablePanZoom) {
            const panZoomScript = doc.createElementNS(ns, 'script');
            panZoomScript.setAttribute('type', 'text/javascript');
            panZoomScript.textContent = SVGUtils.generatePanZoomScript('pan-zoom-container', 0.5, 3, showZoomControls).replace(/<script[^>]*>|<\/script>/gi, '');
            svg.appendChild(panZoomScript);
        }

        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders a sketch-style org chart
     */
    private async renderSketchOrg(
        params: RunActionParams,
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        roughOptions: any,
        enableTooltips: boolean,
        enablePanZoom: boolean,
        showZoomControls: boolean
    ): Promise<string> {
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
        const dom = new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg" width="${viewBox.width}" height="${viewBox.height}" viewBox="0 0 ${viewBox.width} ${viewBox.height}"></svg>`);
        const doc = dom.window.document;
        const svg = doc.querySelector('svg')!;

        // Initialize Rough.js
        const rc = rough.svg(svg);

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

        // Create container
        const contentContainer = doc.createElementNS(ns, 'g');
        contentContainer.setAttribute('id', enablePanZoom ? 'pan-zoom-container' : 'content-container');
        contentContainer.setAttribute('transform', `translate(${vb.x}, ${vb.y})`);
        svg.appendChild(contentContainer);

        // Render links
        treeData.links().forEach((link) => {
            const points: [number, number][] = [
                [link.source.x, link.source.y + 35],
                [link.source.x, (link.source.y + link.target.y) / 2],
                [link.target.x, (link.source.y + link.target.y) / 2],
                [link.target.x, link.target.y - 35],
            ];

            const roughPath = rc.linearPath(points, {
                ...roughOptions,
                stroke: palette.foreground,
                fill: 'none',
                strokeWidth: 2,
            });

            contentContainer.appendChild(roughPath);
        });

        // Render nodes
        const boxWidth = 180;
        const boxHeight = 70;

        treeData.descendants().forEach((node) => {
            const g_elem = doc.createElementNS(ns, 'g');
            g_elem.setAttribute('data-node-id', node.data.id);
            if (enableTooltips) {
                g_elem.setAttribute('data-tooltip', `${node.data.label}${node.data.role ? ' - ' + node.data.role : ''}`);
            }

            const colorIndex = node.depth % palette.categorical.length;
            const fillColor = palette.categorical[colorIndex];

            // Draw sketchy box
            const box = rc.rectangle(
                node.x - boxWidth / 2,
                node.y - boxHeight / 2,
                boxWidth,
                boxHeight,
                {
                    ...roughOptions,
                    fill: fillColor,
                    stroke: node.data.highlight ? '#FFD700' : '#333',
                    strokeWidth: node.data.highlight ? 3 : 2,
                }
            );
            g_elem.appendChild(box);

            // Add name
            const nameText = doc.createElementNS(ns, 'text');
            nameText.setAttribute('x', String(node.x));
            nameText.setAttribute('y', String(node.y - (node.data.role ? 8 : 0)));
            nameText.setAttribute('text-anchor', 'middle');
            nameText.setAttribute('font-weight', 'bold');
            nameText.setAttribute('font-size', '14');
            nameText.setAttribute('fill', '#FFF');
            nameText.textContent = node.data.label;
            g_elem.appendChild(nameText);

            // Add role
            if (node.data.role) {
                const roleText = doc.createElementNS(ns, 'text');
                roleText.setAttribute('x', String(node.x));
                roleText.setAttribute('y', String(node.y + 8));
                roleText.setAttribute('text-anchor', 'middle');
                roleText.setAttribute('font-size', '12');
                roleText.setAttribute('fill', '#FFF');
                roleText.setAttribute('opacity', '0.9');
                roleText.textContent = node.data.role;
                g_elem.appendChild(roleText);
            }

            contentContainer.appendChild(g_elem);
        });

        // Add title
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Add interactivity
        if (enableTooltips) {
            SVGUtils.addTooltipSupport(svg, doc);
        }

        if (enablePanZoom) {
            const panZoomScript = doc.createElementNS(ns, 'script');
            panZoomScript.setAttribute('type', 'text/javascript');
            panZoomScript.textContent = SVGUtils.generatePanZoomScript('pan-zoom-container', 0.5, 3, showZoomControls).replace(/<script[^>]*>|<\/script>/gi, '');
            svg.appendChild(panZoomScript);
        }

        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders a sketch-style ER diagram
     */
    private async renderSketchER(
        params: RunActionParams,
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        roughOptions: any,
        enableTooltips: boolean,
        enablePanZoom: boolean,
        showZoomControls: boolean
    ): Promise<string> {
        // Parse tables and relations
        const nodesParam = this.getParamValue(params, 'Nodes');
        const edgesParam = this.getParamValue(params, 'Edges');

        if (!nodesParam) {
            throw new Error('Nodes parameter is required for ER diagrams');
        }

        const tables: ERTable[] = this.parseJSON<ERTable[]>(nodesParam, 'Nodes');
        const relations: ERRelation[] = edgesParam ? this.parseJSON<ERRelation[]>(edgesParam, 'Edges') : [];

        // Create dagre graph for layout
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
            const height = 40 + table.attrs.length * 25;
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

        // Run layout
        dagre.layout(g);

        // Create SVG
        const vb = SVGUtils.calculateViewBox(viewBox);
        const dom = new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg" width="${viewBox.width}" height="${viewBox.height}" viewBox="0 0 ${viewBox.width} ${viewBox.height}"></svg>`);
        const doc = dom.window.document;
        const svg = doc.querySelector('svg')!;

        // Initialize Rough.js
        const rc = rough.svg(svg);

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

        // Create container
        const contentContainer = doc.createElementNS(ns, 'g');
        contentContainer.setAttribute('id', enablePanZoom ? 'pan-zoom-container' : 'content-container');
        svg.appendChild(contentContainer);

        // Render relations
        for (const edgeObj of g.edges()) {
            const rel = g.edge(edgeObj) as ERRelation & { points: Array<{ x: number; y: number }> };

            if (rel.points && rel.points.length >= 2) {
                const pathPoints: [number, number][] = rel.points.map(p => [p.x, p.y]);

                const roughLine = rc.linearPath(pathPoints, {
                    ...roughOptions,
                    stroke: palette.foreground,
                    fill: 'none',
                    strokeLineDash: [5, 5],
                });

                contentContainer.appendChild(roughLine);

                // Add label
                if (rel.label) {
                    const midPoint = rel.points[Math.floor(rel.points.length / 2)];
                    const text = doc.createElementNS(ns, 'text');
                    text.setAttribute('x', String(midPoint.x));
                    text.setAttribute('y', String(midPoint.y - 5));
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('font-size', '11');
                    text.textContent = rel.label;
                    contentContainer.appendChild(text);
                }
            }
        }

        // Render tables
        for (const tableId of g.nodes()) {
            const table = g.node(tableId) as ERTable & { x: number; y: number; width: number; height: number };

            const g_elem = doc.createElementNS(ns, 'g');
            g_elem.setAttribute('data-node-id', table.id);
            if (enableTooltips) {
                g_elem.setAttribute('data-tooltip', `${table.name} (${table.attrs.length} attributes)`);
            }

            // Draw outer box
            const outerBox = rc.rectangle(
                table.x - table.width / 2,
                table.y - table.height / 2,
                table.width,
                table.height,
                {
                    ...roughOptions,
                    fill: palette.background,
                    stroke: palette.foreground,
                }
            );
            g_elem.appendChild(outerBox);

            // Draw header box
            const headerBox = rc.rectangle(
                table.x - table.width / 2,
                table.y - table.height / 2,
                table.width,
                40,
                {
                    ...roughOptions,
                    fill: palette.categorical[0],
                    stroke: palette.foreground,
                }
            );
            g_elem.appendChild(headerBox);

            // Add table name
            const nameText = doc.createElementNS(ns, 'text');
            nameText.setAttribute('x', String(table.x));
            nameText.setAttribute('y', String(table.y - table.height / 2 + 25));
            nameText.setAttribute('text-anchor', 'middle');
            nameText.setAttribute('font-weight', 'bold');
            nameText.setAttribute('font-size', '14');
            nameText.setAttribute('fill', '#FFF');
            nameText.textContent = table.name;
            g_elem.appendChild(nameText);

            // Add attributes
            let yOffset = table.y - table.height / 2 + 40;
            for (const attr of table.attrs) {
                const attrText = doc.createElementNS(ns, 'text');
                attrText.setAttribute('x', String(table.x - table.width / 2 + 10));
                attrText.setAttribute('y', String(yOffset + 17));
                attrText.setAttribute('font-size', '12');
                attrText.setAttribute('fill', palette.foreground);

                let label = attr.name;
                if (attr.pk) label = '🔑 ' + label;
                else if (attr.fk) label = '🔗 ' + label;
                if (attr.type) label += `: ${attr.type}`;

                attrText.textContent = label;
                g_elem.appendChild(attrText);

                yOffset += 25;
            }

            contentContainer.appendChild(g_elem);
        }

        // Add title
        if (title) {
            this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
        }

        // Add interactivity
        if (enableTooltips) {
            SVGUtils.addTooltipSupport(svg, doc);
        }

        if (enablePanZoom) {
            const panZoomScript = doc.createElementNS(ns, 'script');
            panZoomScript.setAttribute('type', 'text/javascript');
            panZoomScript.textContent = SVGUtils.generatePanZoomScript('pan-zoom-container', 0.5, 3, showZoomControls).replace(/<script[^>]*>|<\/script>/gi, '');
            svg.appendChild(panZoomScript);
        }

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
     * Helper to safely parse JSON
     */
    private parseJSON<T>(value: any, paramName: string): T {
        if (typeof value === 'object' && value !== null) {
            return value as T;
        }

        if (typeof value === 'string') {
            try {
                return JSON.parse(value) as T;
            } catch (error) {
                throw new Error(
                    `Parameter '${paramName}' contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        throw new Error(
            `Parameter '${paramName}' must be a JSON string or object. Received ${typeof value}.`
        );
    }

    /**
     * Helper to ensure string type
     */
    private ensureString(value: any, paramName: string): string {
        if (value == null) {
            return '';
        }

        if (typeof value === 'string') {
            return value;
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }

        throw new Error(
            `Parameter '${paramName}' must be a string, number, or boolean. ` +
            `Received ${typeof value}.`
        );
    }

    /**
     * Helper to get parameter value by name
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