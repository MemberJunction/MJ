/**
 * @fileoverview Theming system for SVG visualizations.
 * Provides color palettes, font stacks, and CSS generation for consistent branding.
 *
 * @module @memberjunction/actions-core/visualization
 * @since 2.107.0
 */

import { Palette, Branding, FontSpec } from './svg-types';

/**
 * Predefined color palettes for visualizations
 */
export const PALETTES = {
    mjDefault: {
        background: '#FFFFFF',
        foreground: '#1A1A1A',
        categorical: [
            '#2E7D32', // Green
            '#1976D2', // Blue
            '#F57C00', // Orange
            '#7B1FA2', // Purple
            '#C62828', // Red
            '#00796B', // Teal
            '#F9A825', // Yellow
            '#5D4037', // Brown
            '#455A64', // Blue Grey
            '#E91E63', // Pink
        ],
        sequential: [
            '#E8F5E9', // Light Green
            '#A5D6A7',
            '#66BB6A',
            '#43A047',
            '#2E7D32',
            '#1B5E20', // Dark Green
        ],
    },
    gray: {
        background: '#FFFFFF',
        foreground: '#212121',
        categorical: [
            '#424242',
            '#616161',
            '#757575',
            '#9E9E9E',
            '#BDBDBD',
            '#E0E0E0',
        ],
        sequential: [
            '#FAFAFA',
            '#E0E0E0',
            '#BDBDBD',
            '#9E9E9E',
            '#757575',
            '#424242',
        ],
    },
    pastel: {
        background: '#FAFAFA',
        foreground: '#333333',
        categorical: [
            '#A5D6A7', // Pastel Green
            '#90CAF9', // Pastel Blue
            '#FFCC80', // Pastel Orange
            '#CE93D8', // Pastel Purple
            '#EF9A9A', // Pastel Red
            '#80CBC4', // Pastel Teal
            '#FFF59D', // Pastel Yellow
            '#BCAAA4', // Pastel Brown
            '#B0BEC5', // Pastel Blue Grey
            '#F48FB1', // Pastel Pink
        ],
        sequential: [
            '#F1F8E9',
            '#DCEDC8',
            '#C5E1A5',
            '#AED581',
            '#9CCC65',
            '#7CB342',
        ],
    },
    highContrast: {
        background: '#FFFFFF',
        foreground: '#000000',
        categorical: [
            '#000000', // Black
            '#E60000', // Red
            '#0000FF', // Blue
            '#00A000', // Green
            '#FF8C00', // Dark Orange
            '#9400D3', // Dark Violet
            '#FFD700', // Gold
            '#00CED1', // Dark Turquoise
        ],
        sequential: [
            '#FFFFFF',
            '#CCCCCC',
            '#999999',
            '#666666',
            '#333333',
            '#000000',
        ],
    },
};

/**
 * Default font stack with system font fallbacks
 */
export const DEFAULT_FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Retrieves a palette by name or returns manual palette configuration
 *
 * @param palette - Palette configuration
 * @returns Resolved palette colors
 */
export function getPalette(
    palette?: Palette
): {
    background: string;
    foreground: string;
    categorical: string[];
    sequential: string[];
} {
    if (!palette || palette.type === 'named') {
        const paletteName = palette?.type === 'named' ? palette.name : 'mjDefault';
        return PALETTES[paletteName] || PALETTES.mjDefault;
    }

    // Manual palette
    return {
        background: palette.background || '#FFFFFF',
        foreground: palette.foreground || '#1A1A1A',
        categorical: palette.categorical || PALETTES.mjDefault.categorical,
        sequential: palette.sequential || PALETTES.mjDefault.sequential,
    };
}

/**
 * Gets a categorical color by index, cycling through the palette
 *
 * @param index - Color index
 * @param palette - Palette configuration
 * @returns Hex color string
 */
export function getColorForIndex(index: number, palette?: Palette): string {
    const colors = getPalette(palette).categorical;
    return colors[index % colors.length];
}

/**
 * Gets a sequential color by normalized value (0-1)
 *
 * @param value - Normalized value between 0 and 1
 * @param palette - Palette configuration
 * @returns Hex color string
 */
export function getSequentialColor(value: number, palette?: Palette): string {
    const colors = getPalette(palette).sequential;
    const clampedValue = Math.max(0, Math.min(1, value));
    const index = Math.floor(clampedValue * (colors.length - 1));
    return colors[index];
}

/**
 * Generates inline CSS from branding configuration
 *
 * @param branding - Branding configuration
 * @returns CSS string for injection into <style> element
 */
export function generateCSS(branding?: Branding): string {
    const pal = getPalette(branding?.palette);
    const font = getFontSpec(branding?.font);

    const css = `
        .bg-default { fill: ${pal.background}; }
        .fg-default { fill: ${pal.foreground}; stroke: ${pal.foreground}; }
        .text-default {
            fill: ${pal.foreground};
            font-family: ${font.family};
            font-size: ${font.size}px;
            font-weight: ${font.weight};
        }
        .node-text {
            fill: ${pal.foreground};
            font-family: ${font.family};
            font-size: ${font.size}px;
            text-anchor: middle;
            dominant-baseline: middle;
        }
        .edge-line {
            fill: none;
            stroke: ${pal.foreground};
            stroke-width: 2;
        }
        .edge-label {
            fill: ${pal.foreground};
            font-family: ${font.family};
            font-size: ${font.size - 2}px;
            text-anchor: middle;
        }
        ${pal.categorical
            .map(
                (color, i) => `
        .cat-${i} { fill: ${color}; }
        .cat-${i}-stroke { stroke: ${color}; }
        .cat-${i}-text { fill: ${color}; }
        `
            )
            .join('')}
        ${pal.sequential
            .map(
                (color, i) => `
        .seq-${i} { fill: ${color}; }
        `
            )
            .join('')}
    `
        .replace(/\n\s+/g, '\n')
        .trim();

    return css;
}

/**
 * Gets font specification with defaults applied
 *
 * @param font - Optional font configuration
 * @returns Complete font specification
 */
export function getFontSpec(font?: FontSpec): Required<FontSpec> {
    return {
        family: font?.family || DEFAULT_FONT_STACK,
        size: font?.size || 14,
        weight: font?.weight || 400,
        lineHeight: font?.lineHeight || 1.5,
    };
}

/**
 * Gets font stack for CSS font-family property
 *
 * @param font - Optional font configuration
 * @returns Font family stack string
 */
export function getFontStack(font?: FontSpec): string {
    return font?.family || DEFAULT_FONT_STACK;
}
