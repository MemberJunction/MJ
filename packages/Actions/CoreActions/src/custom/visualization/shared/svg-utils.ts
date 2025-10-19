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
    static createSVG(width: number, height: number, idPrefix?: string): Document {
        const svgId = idPrefix ? ` id="${idPrefix}-root"` : '';
        const dom = new JSDOM(`<svg xmlns="http://www.w3.org/2000/svg"
                                     width="${width}"
                                     height="${height}"
                                     viewBox="0 0 ${width} ${height}"${svgId}
                                ></svg>`);
        return dom.window.document;
    }

    /**
     * Sanitizes text content to prevent XSS attacks
     *
     * @param text - Raw text content
     * @returns HTML-safe text
     */
    static sanitizeText(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
    static sanitizeSVG(svgString: string): string {
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

    /**
     * Generates a unique ID with prefix and timestamp
     *
     * @param prefix - ID prefix (e.g., 'flow', 'node')
     * @param index - Index or identifier
     * @returns Unique ID string
     */
    static generateId(prefix: string, index: number | string): string {
        return `${prefix}-${index}-${Date.now()}`;
    }

    /**
     * Adds accessibility elements to SVG root
     *
     * @param svg - SVG element to enhance
     * @param a11y - Accessibility configuration
     */
    static addA11y(svg: SVGElement, a11y: Accessibility): void {
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

    /**
     * Injects inline CSS styles into SVG
     *
     * @param svg - SVG element
     * @param css - CSS string to inject
     */
    static addStyles(svg: SVGElement, css: string): void {
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

    /**
     * Calculates viewBox with padding applied
     *
     * @param viewBox - ViewBox configuration
     * @returns Padding-adjusted dimensions and offsets
     */
    static calculateViewBox(viewBox: ViewBox): {
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

    /**
     * Creates a <defs> element if it doesn't exist in SVG
     *
     * @param svg - SVG element
     * @returns The defs element (existing or newly created)
     */
    static getOrCreateDefs(svg: SVGElement): SVGDefsElement {
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = svg.ownerDocument.createElementNS(svg.namespaceURI, 'defs') as SVGDefsElement;
            svg.insertBefore(defs, svg.firstChild);
        }
        return defs;
    }

    /**
     * Adds an arrowhead marker definition to SVG
     *
     * @param svg - SVG element
     * @param id - Marker ID
     * @param color - Arrow color
     * @returns Marker ID for use in marker-end attribute
     */
    static addArrowMarker(svg: SVGElement, id: string, color: string = '#000'): string {
        const defs = this.getOrCreateDefs(svg);
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

    /**
     * Creates a seeded pseudo-random number generator
     * Uses simple Linear Congruential Generator for deterministic output
     *
     * @param seed - Random seed
     * @returns Function that returns random numbers between 0 and 1
     */
    static seededRandom(seed: number): () => number {
        let s = seed;
        return function () {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    /**
     * Wraps text to fit within a specified width
     *
     * @param text - Text to wrap
     * @param maxWidth - Maximum width in characters (approximate)
     * @returns Array of text lines
     */
    static wrapText(text: string, maxWidth: number): string[] {
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

    /**
     * Calculates text width (approximate based on character count and font size)
     * More accurate measurement would require actual rendering
     *
     * @param text - Text content
     * @param fontSize - Font size in pixels
     * @returns Estimated width in pixels
     */
    static estimateTextWidth(text: string, fontSize: number = 14): number {
        // Average character width is approximately 0.6 of font size
        return text.length * fontSize * 0.6;
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
    static roundedRectPath(
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
}
