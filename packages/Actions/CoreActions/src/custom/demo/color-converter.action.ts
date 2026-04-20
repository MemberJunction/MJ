import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that converts colors between different formats (HEX, RGB, HSL, HSV).
 * Supports standard color names and provides complementary color calculations.
 * 
 * @example
 * ```typescript
 * // Convert HEX to other formats
 * await runAction({
 *   ActionName: 'Color Converter',
 *   Params: [{
 *     Name: 'Color',
 *     Value: '#FF5733'
 *   }]
 * });
 * 
 * // Convert RGB to other formats
 * await runAction({
 *   ActionName: 'Color Converter',
 *   Params: [{
 *     Name: 'Color',
 *     Value: 'rgb(255, 87, 51)'
 *   }]
 * });
 * 
 * // Use color names
 * await runAction({
 *   ActionName: 'Color Converter',
 *   Params: [{
 *     Name: 'Color',
 *     Value: 'navy'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__ColorConverter")
export class ColorConverterAction extends BaseAction {
    private namedColors: Record<string, string> = {
        'black': '#000000', 'white': '#FFFFFF', 'red': '#FF0000', 'green': '#008000',
        'blue': '#0000FF', 'yellow': '#FFFF00', 'cyan': '#00FFFF', 'magenta': '#FF00FF',
        'silver': '#C0C0C0', 'gray': '#808080', 'maroon': '#800000', 'olive': '#808000',
        'lime': '#00FF00', 'aqua': '#00FFFF', 'teal': '#008080', 'navy': '#000080',
        'fuchsia': '#FF00FF', 'purple': '#800080', 'orange': '#FFA500', 'brown': '#A52A2A',
        'pink': '#FFC0CB', 'gold': '#FFD700', 'indigo': '#4B0082', 'violet': '#EE82EE',
        'tan': '#D2B48C', 'azure': '#F0FFFF', 'beige': '#F5F5DC', 'coral': '#FF7F50',
        'crimson': '#DC143C', 'khaki': '#F0E68C', 'lavender': '#E6E6FA', 'plum': '#DDA0DD',
        'salmon': '#FA8072', 'tomato': '#FF6347', 'turquoise': '#40E0D0', 'wheat': '#F5DEB3'
    };

    /**
     * Executes the color conversion action
     * 
     * @param params - The action parameters containing:
     *   - Color: A color in HEX (#RGB or #RRGGBB), RGB (rgb(r,g,b)), HSL (hsl(h,s%,l%)), or color name format
     * 
     * @returns A promise resolving to an ActionResultSimple with color data in multiple formats
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const colorParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'color');

            if (!colorParam || !colorParam.Value) {
                return {
                    Success: false,
                    Message: "Color parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const input = colorParam.Value.trim().toLowerCase();
            let r: number, g: number, b: number;

            // Try to parse the color input
            if (this.namedColors[input]) {
                // Named color
                const hex = this.namedColors[input];
                [r, g, b] = this.hexToRgb(hex);
            } else if (input.startsWith('#')) {
                // HEX format
                [r, g, b] = this.hexToRgb(input);
            } else if (input.startsWith('rgb')) {
                // RGB format
                const match = input.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
                if (!match) {
                    return {
                        Success: false,
                        Message: "Invalid RGB format. Use: rgb(r, g, b)",
                        ResultCode: "INVALID_FORMAT"
                    };
                }
                r = parseInt(match[1]);
                g = parseInt(match[2]);
                b = parseInt(match[3]);
            } else if (input.startsWith('hsl')) {
                // HSL format
                const match = input.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*\)/);
                if (!match) {
                    return {
                        Success: false,
                        Message: "Invalid HSL format. Use: hsl(h, s%, l%)",
                        ResultCode: "INVALID_FORMAT"
                    };
                }
                const h = parseInt(match[1]);
                const s = parseInt(match[2]) / 100;
                const l = parseInt(match[3]) / 100;
                [r, g, b] = this.hslToRgb(h, s, l);
            } else {
                return {
                    Success: false,
                    Message: "Unrecognized color format. Use HEX (#RRGGBB), RGB (rgb(r,g,b)), HSL (hsl(h,s%,l%)), or a color name",
                    ResultCode: "INVALID_FORMAT"
                };
            }

            // Validate RGB values
            if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
                return {
                    Success: false,
                    Message: "RGB values must be between 0 and 255",
                    ResultCode: "INVALID_VALUES"
                };
            }

            // Convert to all formats
            const hex = this.rgbToHex(r, g, b);
            const [h, s, l] = this.rgbToHsl(r, g, b);
            const [hue, sat, val] = this.rgbToHsv(r, g, b);
            
            // Calculate complementary color
            const compR = 255 - r;
            const compG = 255 - g;
            const compB = 255 - b;

            const colorData = {
                input: colorParam.Value,
                formats: {
                    hex: hex,
                    rgb: `rgb(${r}, ${g}, ${b})`,
                    rgba: `rgba(${r}, ${g}, ${b}, 1.0)`,
                    hsl: `hsl(${h}, ${Math.round(s*100)}%, ${Math.round(l*100)}%)`,
                    hsv: `hsv(${hue}, ${Math.round(sat*100)}%, ${Math.round(val*100)}%)`,
                    decimal: (r << 16) + (g << 8) + b
                },
                values: {
                    red: r,
                    green: g,
                    blue: b,
                    hue: h,
                    saturation: Math.round(s * 100),
                    lightness: Math.round(l * 100),
                    value: Math.round(val * 100)
                },
                complementary: {
                    hex: this.rgbToHex(compR, compG, compB),
                    rgb: `rgb(${compR}, ${compG}, ${compB})`
                },
                luminance: this.calculateLuminance(r, g, b),
                isDark: this.calculateLuminance(r, g, b) < 0.5
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(colorData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to convert color: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    private hexToRgb(hex: string): [number, number, number] {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Handle 3-digit hex
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        
        if (hex.length !== 6) {
            throw new Error('Invalid hex color');
        }
        
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return [r, g, b];
    }

    private rgbToHex(r: number, g: number, b: number): string {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('').toUpperCase();
    }

    private rgbToHsl(r: number, g: number, b: number): [number, number, number] {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0, s = 0;
        const l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }

        return [Math.round(h * 360), s, l];
    }

    private rgbToHsv(r: number, g: number, b: number): [number, number, number] {
        r /= 255;
        g /= 255;
        b /= 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const v = max;
        const d = max - min;
        const s = max === 0 ? 0 : d / max;
        let h = 0;

        if (max !== min) {
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }

        return [Math.round(h * 360), s, v];
    }

    private hslToRgb(h: number, s: number, l: number): [number, number, number] {
        h /= 360;
        let r, g, b;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    private calculateLuminance(r: number, g: number, b: number): number {
        // Using relative luminance formula
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
}