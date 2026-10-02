/**
 * @fileoverview Utility functions for SVG creation, manipulation, and sanitization.
 * These utilities provide security, consistency, and convenience for all visualization actions.
 *
 * @module @memberjunction/actions-core/visualization
 * @since 2.107.0
 */

import { JSDOM } from 'jsdom';
import { ViewBox, Accessibility, Palette } from './svg-types';

/**
 * Utility class for SVG operations
 */
export class SVGUtils {
    /**
     * Creates a base SVG element with proper namespace and dimensions
     *
     * @param width - SVG width in pixels
     * @param height - SVG height in pixels
     * @param idPrefix - Optional ID prefix for the root SVG element
     * @returns JSDOM Document containing the SVG
     */
    static CreateSVG(width: number, height: number, idPrefix?: string): Document {
        const svgId = idPrefix ? ` id="${idPrefix}-root"` : '';
        const dom = new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg"
                                     width="${width}"
                                     height="${height}"
                                     viewBox="0 0 ${width} ${height}"${svgId}
                                ></svg>`);
        return dom.window.document;
    }

    /** @deprecated Use {@link CreateSVG}. */
    static createSVG(width: number, height: number, idPrefix?: string): Document {
        return this.CreateSVG(width, height, idPrefix);
    }

    /**
     * Sanitizes text content to prevent XSS attacks
     *
     * @param text - Raw text content
     * @returns HTML-safe text
     */
    static SanitizeText(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /** @deprecated Use {@link SanitizeText}. */
    static sanitizeText(text: string): string {
        return this.SanitizeText(text);
    }

    /**
     * Sanitizes SVG string to remove potentially malicious content
     * - Removes event handlers (on*)
     * - Removes external image references
     * - Removes external use references
     * - Restricts href to # and mailto: only
     *
     * @param svgString - Raw SVG XML string
     * @returns Sanitized SVG string
     */
    static SanitizeSVG(svgString: string): string {
        let sanitized = svgString;

        // Remove event handlers
        sanitized = sanitized.replace(/\son\w+="[^"]*"/gi, '');
        sanitized = sanitized.replace(/\son\w+='[^']*'/gi, '');

        // Remove external xlink:href (keep data URIs)
        sanitized = sanitized.replace(/xlink:href="(?!data:)[^"]*"/gi, 'xlink:href=""');

        // Remove external href (keep # anchors and mailto:)
        sanitized = sanitized.replace(/href="(?!#|mailto:)[^"]*"/gi, 'href=""');

        // Remove script tags
        sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '');

        return sanitized;
    }

    /** @deprecated Use {@link SanitizeSVG}. */
    static sanitizeSVG(svgString: string): string {
        return this.SanitizeSVG(svgString);
    }

    /**
     * Generates a unique ID with prefix and timestamp
     *
     * @param prefix - ID prefix (e.g., 'flow', 'node')
     * @param index - Index or identifier
     * @returns Unique ID string
     */
    static GenerateId(prefix: string, index: number | string): string {
        return `${prefix}-${index}-${Date.now()}`;
    }

    /** @deprecated Use {@link GenerateId}. */
    static generateId(prefix: string, index: number | string): string {
        return this.GenerateId(prefix, index);
    }

    /**
     * Adds accessibility elements to SVG root
     *
     * @param svg - SVG element to enhance
     * @param a11y - Accessibility configuration
     */
    static AddA11y(svg: SVGElement, a11y: Accessibility): void {
        if (!a11y) return;

        const doc = svg.ownerDocument;
        const ns = svg.namespaceURI;

        // Add title
        if (a11y.title) {
            const title = doc.createElementNS(ns, 'title');
            title.textContent = a11y.title;
            svg.insertBefore(title, svg.firstChild);
        }

        // Add description
        if (a11y.desc) {
            const desc = doc.createElementNS(ns, 'desc');
            desc.textContent = a11y.desc;
            // Insert after title if it exists
            const titleEl = svg.querySelector('title');
            if (titleEl && titleEl.nextSibling) {
                svg.insertBefore(desc, titleEl.nextSibling);
            } else {
                svg.insertBefore(desc, svg.firstChild);
            }
        }

        // Set ARIA role
        if (a11y.ariaRole) {
            svg.setAttribute('role', a11y.ariaRole);
        }
    }

    /** @deprecated Use {@link AddA11y}. */
    static addA11y(svg: SVGElement, a11y: Accessibility): void {
        return this.AddA11y(svg, a11y);
    }

    /**
     * Injects inline CSS styles into SVG
     *
     * @param svg - SVG element
     * @param css - CSS string to inject
     */
    static AddStyles(svg: SVGElement, css: string): void {
        const doc = svg.ownerDocument;
        const ns = svg.namespaceURI;

        const style = doc.createElementNS(ns, 'style');
        style.textContent = css;

        // Insert style after title/desc but before content
        const lastMetaElement = Array.from(svg.children).find(
            (el) => el.tagName === 'desc' || el.tagName === 'title'
        );

        if (lastMetaElement && lastMetaElement.nextSibling) {
            svg.insertBefore(style, lastMetaElement.nextSibling);
        } else {
            svg.insertBefore(style, svg.firstChild);
        }
    }

    /** @deprecated Use {@link AddStyles}. */
    static addStyles(svg: SVGElement, css: string): void {
        return this.AddStyles(svg, css);
    }

    /**
     * Calculates viewBox with padding applied
     *
     * @param viewBox - ViewBox configuration
     * @returns Padding-adjusted dimensions and offsets
     */
    static CalculateViewBox(viewBox: ViewBox): {
        x: number;
        y: number;
        width: number;
        height: number;
        contentWidth: number;
        contentHeight: number;
    } {
        let top = 0,
            right = 0,
            bottom = 0,
            left = 0;

        if (viewBox.padding !== undefined) {
            if (typeof viewBox.padding === 'number') {
                top = right = bottom = left = viewBox.padding;
            } else {
                top = viewBox.padding.top || 0;
                right = viewBox.padding.right || 0;
                bottom = viewBox.padding.bottom || 0;
                left = viewBox.padding.left || 0;
            }
        }

        return {
            x: left,
            y: top,
            width: viewBox.width,
            height: viewBox.height,
            contentWidth: viewBox.width - left - right,
            contentHeight: viewBox.height - top - bottom,
        };
    }

    /** @deprecated Use {@link CalculateViewBox}. */
    static calculateViewBox(viewBox: ViewBox): {
        x: number;
        y: number;
        width: number;
        height: number;
        contentWidth: number;
        contentHeight: number;
    } {
        return this.CalculateViewBox(viewBox);
    }

    /**
     * Creates a <defs> element if it doesn't exist in SVG
     *
     * @param svg - SVG element
     * @returns The defs element (existing or newly created)
     */
    static GetOrCreateDefs(svg: SVGElement): SVGDefsElement {
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = svg.ownerDocument.createElementNS(svg.namespaceURI, 'defs') as SVGDefsElement;
            svg.insertBefore(defs, svg.firstChild);
        }
        return defs;
    }

    /** @deprecated Use {@link GetOrCreateDefs}. */
    static getOrCreateDefs(svg: SVGElement): SVGDefsElement {
        return this.GetOrCreateDefs(svg);
    }

    /**
     * Adds an arrowhead marker definition to SVG
     *
     * @param svg - SVG element
     * @param id - Marker ID
     * @param color - Arrow color
     * @returns Marker ID for use in marker-end attribute
     */
    static AddArrowMarker(svg: SVGElement, id: string, color: string = '#000'): string {
        const defs = this.GetOrCreateDefs(svg);
        const doc = svg.ownerDocument;
        const ns = svg.namespaceURI;

        // Check if marker already exists
        if (defs.querySelector(`#${id}`)) {
            return `url(#${id})`;
        }

        const marker = doc.createElementNS(ns, 'marker');
        marker.setAttribute('id', id);
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');
        marker.setAttribute('markerUnits', 'strokeWidth');

        const path = doc.createElementNS(ns, 'path');
        path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
        path.setAttribute('fill', color);

        marker.appendChild(path);
        defs.appendChild(marker);

        return `url(#${id})`;
    }

    /** @deprecated Use {@link AddArrowMarker}. */
    static addArrowMarker(svg: SVGElement, id: string, color: string = '#000'): string {
        return this.AddArrowMarker(svg, id, color);
    }

    /**
     * Creates a seeded pseudo-random number generator
     * Uses simple Linear Congruential Generator for deterministic output
     *
     * @param seed - Random seed
     * @returns Function that returns random numbers between 0 and 1
     */
    static SeededRandom(seed: number): () => number {
        let s = seed;
        return function () {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    /** @deprecated Use {@link SeededRandom}. */
    static seededRandom(seed: number): () => number {
        return this.SeededRandom(seed);
    }

    /**
     * Wraps text to fit within a specified width
     *
     * @param text - Text to wrap
     * @param maxWidth - Maximum width in characters (approximate)
     * @returns Array of text lines
     */
    static WrapText(text: string, maxWidth: number): string[] {
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (testLine.length <= maxWidth) {
                currentLine = testLine;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }

        if (currentLine) lines.push(currentLine);
        return lines;
    }

    /** @deprecated Use {@link WrapText}. */
    static wrapText(text: string, maxWidth: number): string[] {
        return this.WrapText(text, maxWidth);
    }

    /**
     * Calculates text width (approximate based on character count and font size)
     * More accurate measurement would require actual rendering
     *
     * @param text - Text content
     * @param fontSize - Font size in pixels
     * @returns Estimated width in pixels
     */
    static EstimateTextWidth(text: string, fontSize: number = 14): number {
        // Average character width is approximately 0.6 of font size
        return text.length * fontSize * 0.6;
    }

    /** @deprecated Use {@link EstimateTextWidth}. */
    static estimateTextWidth(text: string, fontSize: number = 14): number {
        return this.EstimateTextWidth(text, fontSize);
    }

    /**
     * Creates a rounded rectangle path
     *
     * @param x - X coordinate
     * @param y - Y coordinate
     * @param width - Width
     * @param height - Height
     * @param radius - Corner radius
     * @returns SVG path data string
     */
    static RoundedRectPath(
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number
    ): string {
        radius = Math.min(radius, width / 2, height / 2);
        return `
            M ${x + radius},${y}
            L ${x + width - radius},${y}
            Q ${x + width},${y} ${x + width},${y + radius}
            L ${x + width},${y + height - radius}
            Q ${x + width},${y + height} ${x + width - radius},${y + height}
            L ${x + radius},${y + height}
            Q ${x},${y + height} ${x},${y + height - radius}
            L ${x},${y + radius}
            Q ${x},${y} ${x + radius},${y}
            Z
        `.replace(/\s+/g, ' ').trim();
    }

    /** @deprecated Use {@link RoundedRectPath}. */
    static roundedRectPath(
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number
    ): string {
        return this.RoundedRectPath(x, y, width, height, radius);
    }

    /**
     * Wraps SVG string in a scrollable HTML container
     * Useful for large visualizations that exceed viewport size
     *
     * @param svgString - The SVG XML string to wrap
     * @param maxWidth - Maximum container width in pixels (default: 1200)
     * @param maxHeight - Maximum container height in pixels (default: 800)
     * @param showBorder - Whether to show container border (default: true)
     * @param borderColor - Border color (default: #ddd)
     * @returns HTML string with SVG wrapped in scrollable div
     */
    static WrapWithScrollContainer(
        svgString: string,
        maxWidth: number = 1200,
        maxHeight: number = 800,
        showBorder: boolean = true,
        borderColor: string = '#ddd'
    ): string {
        const borderStyle = showBorder ? `border: 1px solid ${borderColor};` : '';
        return `<div style="max-width: ${maxWidth}px; max-height: ${maxHeight}px; overflow: auto; ${borderStyle} border-radius: 4px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${svgString}</div>`;
    }

    /** @deprecated Use {@link WrapWithScrollContainer}. */
    static wrapWithScrollContainer(
        svgString: string,
        maxWidth: number = 1200,
        maxHeight: number = 800,
        showBorder: boolean = true,
        borderColor: string = '#ddd'
    ): string {
        return this.WrapWithScrollContainer(svgString, maxWidth, maxHeight, showBorder, borderColor);
    }

    /**
     * Generates self-contained pan/zoom script for SVG
     * No external dependencies - fully embedded JavaScript
     *
     * @param containerId - ID of the SVG group to apply transform to
     * @param minScale - Minimum zoom level (default: 0.5)
     * @param maxScale - Maximum zoom level (default: 3)
     * @param showControls - Show zoom in/out/reset buttons (default: false)
     * @returns Script tag with pan/zoom implementation
     */
    static GeneratePanZoomScript(
        containerId: string = 'pan-zoom-container',
        minScale: number = 0.5,
        maxScale: number = 3,
        showControls: boolean = false
    ): string {
        return `<script type="text/javascript"><![CDATA[
(function() {
    const svg = document.currentScript.closest('svg');
    const container = svg.getElementById('${containerId}');
    if (!container) return;

    let scale = 1, translateX = 0, translateY = 0;
    let isDragging = false, startX, startY;

    function updateTransform() {
        container.setAttribute('transform',
            'translate(' + translateX + ',' + translateY + ') scale(' + scale + ')');
    }

    // Mouse wheel zoom
    svg.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(${minScale}, Math.min(${maxScale}, scale * delta));

        // Zoom toward mouse position
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        translateX = x - (x - translateX) * (newScale / scale);
        translateY = y - (y - translateY) * (newScale / scale);
        scale = newScale;

        updateTransform();
    });

    // Pan with drag
    svg.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return; // Left button only
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        svg.style.cursor = 'grabbing';
    });

    svg.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform();
    });

    svg.addEventListener('mouseup', function() {
        isDragging = false;
        svg.style.cursor = 'grab';
    });

    svg.addEventListener('mouseleave', function() {
        isDragging = false;
        svg.style.cursor = 'default';
    });

    // Touch gestures
    let touchStartDist = 0;
    let touch1StartX = 0, touch1StartY = 0;

    svg.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) {
            touchStartDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        } else if (e.touches.length === 1) {
            touch1StartX = e.touches[0].clientX - translateX;
            touch1StartY = e.touches[0].clientY - translateY;
        }
    });

    svg.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const delta = dist / touchStartDist;
            scale = Math.max(${minScale}, Math.min(${maxScale}, scale * delta));
            touchStartDist = dist;
            updateTransform();
        } else if (e.touches.length === 1 && !isDragging) {
            translateX = e.touches[0].clientX - touch1StartX;
            translateY = e.touches[0].clientY - touch1StartY;
            updateTransform();
        }
    });

    svg.style.cursor = 'grab';
    ${showControls ? this.generateZoomControlsScript() : ''}
})();
]]></script>`;
    }

    /** @deprecated Use {@link GeneratePanZoomScript}. */
    static generatePanZoomScript(
        containerId: string = 'pan-zoom-container',
        minScale: number = 0.5,
        maxScale: number = 3,
        showControls: boolean = false
    ): string {
        return this.GeneratePanZoomScript(containerId, minScale, maxScale, showControls);
    }

    /**
     * Generates zoom control buttons script
     * @returns Script code for zoom controls (internal use)
     */
    private static generateZoomControlsScript(): string {
        return `
    // Add zoom controls
    const controlsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    controlsGroup.setAttribute('id', 'zoom-controls');
    controlsGroup.setAttribute('transform', 'translate(10, 10)');

    const minScaleVal = ${0.5};
    const maxScaleVal = ${3};

    const buttonData = [
        { y: 0, text: '+', action: 'in' },
        { y: 35, text: '-', action: 'out' },
        { y: 70, text: '⟲', action: 'reset' }
    ];

    buttonData.forEach(function(btn) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = 'pointer';

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', '30');
        rect.setAttribute('height', '30');
        rect.setAttribute('y', btn.y);
        rect.setAttribute('fill', '#fff');
        rect.setAttribute('stroke', '#333');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('rx', '4');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '15');
        text.setAttribute('y', btn.y + 20);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '16');
        text.setAttribute('font-weight', 'bold');
        text.textContent = btn.text;

        g.appendChild(rect);
        g.appendChild(text);

        g.addEventListener('click', function() {
            if (btn.action === 'in') {
                scale = Math.min(maxScaleVal, scale * 1.2);
            } else if (btn.action === 'out') {
                scale = Math.max(minScaleVal, scale * 0.8);
            } else if (btn.action === 'reset') {
                scale = 1;
                translateX = 0;
                translateY = 0;
            }
            updateTransform();
        });

        controlsGroup.appendChild(g);
    });

    svg.appendChild(controlsGroup);
    `;
    }

    /**
     * Generates interactive tooltip script for SVG elements
     * Elements must have data-tooltip attribute
     *
     * @param svg - SVG element to add tooltip to
     * @param doc - Document to create elements in
     * @returns Script tag with tooltip implementation
     */
    static AddTooltipSupport(svg: SVGElement, doc: Document): void {
        const ns = svg.namespaceURI!;

        // Create tooltip text element
        const tooltip = doc.createElementNS(ns, 'text');
        tooltip.setAttribute('id', 'mj-tooltip');
        tooltip.setAttribute('visibility', 'hidden');
        tooltip.setAttribute('pointer-events', 'none');
        tooltip.setAttribute('font-size', '12');
        tooltip.setAttribute('font-family', 'sans-serif');
        tooltip.setAttribute('fill', '#000');

        // Add background rect for better readability
        const tooltipBg = doc.createElementNS(ns, 'rect');
        tooltipBg.setAttribute('id', 'mj-tooltip-bg');
        tooltipBg.setAttribute('visibility', 'hidden');
        tooltipBg.setAttribute('pointer-events', 'none');
        tooltipBg.setAttribute('fill', '#fff');
        tooltipBg.setAttribute('stroke', '#333');
        tooltipBg.setAttribute('stroke-width', '1');
        tooltipBg.setAttribute('rx', '3');
        tooltipBg.setAttribute('opacity', '0.95');

        svg.appendChild(tooltipBg);
        svg.appendChild(tooltip);

        // Add script for tooltip behavior
        const script = doc.createElementNS(ns, 'script');
        script.setAttribute('type', 'text/javascript');
        script.textContent = `
(function() {
    const svg = document.currentScript.closest('svg');
    const tooltip = svg.getElementById('mj-tooltip');
    const tooltipBg = svg.getElementById('mj-tooltip-bg');

    svg.querySelectorAll('[data-tooltip]').forEach(function(el) {
        el.addEventListener('mouseenter', function(e) {
            const content = this.getAttribute('data-tooltip');
            const rect = svg.getBoundingClientRect();
            const x = e.clientX - rect.left + 10;
            const y = e.clientY - rect.top - 10;

            tooltip.textContent = content;
            tooltip.setAttribute('x', x);
            tooltip.setAttribute('y', y);
            tooltip.setAttribute('visibility', 'visible');

            // Size background to text
            const bbox = tooltip.getBBox();
            tooltipBg.setAttribute('x', bbox.x - 4);
            tooltipBg.setAttribute('y', bbox.y - 2);
            tooltipBg.setAttribute('width', bbox.width + 8);
            tooltipBg.setAttribute('height', bbox.height + 4);
            tooltipBg.setAttribute('visibility', 'visible');
        });

        el.addEventListener('mouseleave', function() {
            tooltip.setAttribute('visibility', 'hidden');
            tooltipBg.setAttribute('visibility', 'hidden');
        });

        el.addEventListener('mousemove', function(e) {
            const rect = svg.getBoundingClientRect();
            const x = e.clientX - rect.left + 10;
            const y = e.clientY - rect.top - 10;

            tooltip.setAttribute('x', x);
            tooltip.setAttribute('y', y);

            const bbox = tooltip.getBBox();
            tooltipBg.setAttribute('x', bbox.x - 4);
            tooltipBg.setAttribute('y', bbox.y - 2);
        });
    });
})();
        `;

        svg.appendChild(script);
    }

    /** @deprecated Use {@link AddTooltipSupport}. */
    static addTooltipSupport(svg: SVGElement, doc: Document): void {
        return this.AddTooltipSupport(svg, doc);
    }
}
