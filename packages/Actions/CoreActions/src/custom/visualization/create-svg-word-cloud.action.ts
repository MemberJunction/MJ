import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import d3CloudModule from 'd3-cloud';
import { JSDOM } from 'jsdom';
import { WordItem, CloudLayout, SVGActionResult, ViewBox, Branding } from './shared/svg-types';
import { SVGUtils } from './shared/svg-utils';
import { getPalette, generateCSS, getFontSpec, getColorForIndex } from './shared/svg-theming';

// Handle d3-cloud module export
const d3Cloud = (d3CloudModule as any).default || d3CloudModule;

/**
 * Action that generates SVG word clouds and tag bars from weighted word lists.
 *
 * This action provides server-side SVG generation for text visualizations, designed for
 * AI agents and workflows to create publication-quality word clouds from data.
 *
 * @example
 * ```typescript
 * // Word cloud example
 * await runAction({
 *   ActionName: 'Create SVG Word Cloud',
 *   Params: [
 *     { Name: 'CloudType', Value: 'cloud' },
 *     { Name: 'Words', Value: JSON.stringify([
 *       { text: 'TypeScript', weight: 100 },
 *       { text: 'JavaScript', weight: 80 },
 *       { text: 'React', weight: 60 },
 *       { text: 'Node.js', weight: 50 }
 *     ]) },
 *     { Name: 'MaxWords', Value: '50' },
 *     { Name: 'Rotation', Value: 'few' },
 *     { Name: 'Width', Value: '800' },
 *     { Name: 'Height', Value: '600' }
 *   ]
 * });
 *
 * // Tag bar example
 * await runAction({
 *   ActionName: 'Create SVG Word Cloud',
 *   Params: [
 *     { Name: 'CloudType', Value: 'tagbar' },
 *     { Name: 'Words', Value: JSON.stringify([
 *       { text: 'AI', weight: 67 },
 *       { text: 'Data', weight: 45 },
 *       { text: 'API', weight: 32 }
 *     ]) },
 *     { Name: 'MaxWords', Value: '10' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, '__CreateSVGWordCloud')
export class CreateSVGWordCloudAction extends BaseAction {
    /**
     * Generates an SVG word cloud from the provided data and configuration
     *
     * @param params - The action parameters containing:
     *   - CloudType: Type of visualization ('cloud' | 'tagbar')
     *   - Words: JSON array of {text, weight} objects
     *   - MaxWords: Maximum number of words to display (default: 50)
     *   - Rotation: Rotation strategy ('none' | 'few' | 'mixed') for clouds
     *   - MinFont: Minimum font size (default: 10)
     *   - MaxFont: Maximum font size (default: 80)
     *   - Seed: Random seed for deterministic layouts (optional)
     *   - Width: Width in pixels (optional, default: 800)
     *   - Height: Height in pixels (optional, default: 600)
     *   - Title: Visualization title (optional)
     *   - Palette: Color palette name (optional)
     *
     * @returns A promise resolving to an SVGActionResult
     */
    protected async InternalRunAction(params: RunActionParams): Promise<SVGActionResult> {
        try {
            const cloudTypeParam = this.getParamValue(params, 'CloudType');
            const cloudType = cloudTypeParam ? this.ensureString(cloudTypeParam, 'CloudType').toLowerCase() : 'cloud';

            if (!['cloud', 'tagbar'].includes(cloudType)) {
                return {
                    Success: false,
                    Message: 'CloudType must be "cloud" or "tagbar"',
                    ResultCode: 'INVALID_CLOUD_TYPE',
                };
            }

            // Parse words
            const wordsParam = this.getParamValue(params, 'Words');
            if (!wordsParam) {
                return {
                    Success: false,
                    Message: 'Words parameter is required',
                    ResultCode: 'MISSING_PARAMETERS',
                };
            }

            let words: WordItem[] = this.parseJSON<WordItem[]>(wordsParam, 'Words');

            // Parse common parameters
            const maxWords = parseInt(this.ensureString(this.getParamValue(params, 'MaxWords') || '50', 'MaxWords'));
            const width = parseInt(this.ensureString(this.getParamValue(params, 'Width') || '800', 'Width'));
            const height = parseInt(this.ensureString(this.getParamValue(params, 'Height') || '600', 'Height'));
            const title = this.ensureString(this.getParamValue(params, 'Title') || '', 'Title');
            const paletteName = this.ensureString(this.getParamValue(params, 'Palette') || 'mjDefault', 'Palette');
            const seed = parseInt(this.ensureString(this.getParamValue(params, 'Seed') || String(Date.now()), 'Seed'));

            // Sort by weight descending and limit
            words = words.sort((a, b) => b.weight - a.weight).slice(0, maxWords);

            // Create branding configuration
            const branding: Branding = {
                palette: { type: 'named', name: paletteName as any },
            };

            // Create viewBox configuration
            const viewBox: ViewBox = {
                width,
                height,
                padding: 20,
            };

            // Generate visualization based on type
            let svg: string;
            const warnings: string[] = [];

            switch (cloudType) {
                case 'cloud':
                    svg = await this.renderWordCloud(params, words, viewBox, branding, title, seed, warnings);
                    break;
                case 'tagbar':
                    svg = await this.renderTagBar(words, viewBox, branding, title);
                    break;
                default:
                    return {
                        Success: false,
                        Message: `Unsupported cloud type: ${cloudType}`,
                        ResultCode: 'INVALID_CLOUD_TYPE',
                    };
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: svg,
                svg,
                width,
                height,
                warnings: warnings.length > 0 ? warnings : undefined,
                diagnostics: {
                    wordCount: words.length,
                    requestedMaxWords: maxWords,
                },
            };
        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate word cloud: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: 'WORD_CLOUD_GENERATION_FAILED',
            };
        }
    }

    /**
     * Renders a word cloud using d3-cloud
     */
    private async renderWordCloud(
        params: RunActionParams,
        words: WordItem[],
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        seed: number,
        warnings: string[]
    ): Promise<string> {
        try {
            // Parse cloud-specific parameters
            const rotation = this.getParamValue(params, 'Rotation') || 'few';
            const minFont = parseInt(this.getParamValue(params, 'MinFont') || '10');
            const maxFont = parseInt(this.getParamValue(params, 'MaxFont') || '80');

            // Calculate viewBox
            const vb = SVGUtils.calculateViewBox(viewBox);

            // Create seeded random generator
            const random = SVGUtils.seededRandom(seed);

            // Calculate font sizes using log scale
            const minWeight = Math.min(...words.map((w) => w.weight));
            const maxWeight = Math.max(...words.map((w) => w.weight));
            const logMin = Math.log(minWeight || 1);
            const logMax = Math.log(maxWeight || 1);

            const wordsWithSize = words.map((w) => {
                const logWeight = Math.log(w.weight || 1);
                const normalizedSize = logMax > logMin ? (logWeight - logMin) / (logMax - logMin) : 0.5;
                const fontSize = minFont + normalizedSize * (maxFont - minFont);

                return {
                    text: w.text,
                    size: fontSize,
                    weight: w.weight,
                };
            });

            // Determine rotation angles based on strategy
            const getRotation = (): number => {
                switch (rotation) {
                    case 'none':
                        return 0;
                    case 'few':
                        return random() < 0.5 ? 0 : -90;
                    case 'mixed':
                        return Math.floor(random() * 4) * 45 - 90;
                    default:
                        return 0;
                }
            };

            // Create d3-cloud layout
            return new Promise<string>((resolve, reject) => {
                try {
                    const layout = (d3Cloud as any)()
                        .size([vb.contentWidth, vb.contentHeight])
                        .words(wordsWithSize)
                        .padding(5)
                        .rotate(getRotation)
                        .font(getFontSpec(branding.font).family)
                        .fontSize((d) => d.size)
                        .random(random)
                        .spiral('archimedean')
                        .on('end', (layoutWords) => {
                            try {
                                // Check if any words didn't fit
                                const fittedWords = layoutWords.filter((w) => w.x != null && w.y != null);
                                if (fittedWords.length < wordsWithSize.length) {
                                    warnings.push(`${wordsWithSize.length - fittedWords.length} words did not fit in the layout`);
                                }

                                // Create SVG - STEP 1
                                let doc;
                                try {
                                    doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'wordcloud');
                                } catch (error) {
                                    throw new Error(`[STEP 1: createSVG] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                }

                                // Get SVG element - STEP 2
                                let svg;
                                try {
                                    svg = doc.querySelector('svg')!;
                                    if (!svg) {
                                        throw new Error('SVG element not found in document');
                                    }
                                } catch (error) {
                                    throw new Error(`[STEP 2: querySelector] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                }

                                // Add accessibility - STEP 3
                                if (title) {
                                    try {
                                        SVGUtils.addA11y(svg, {
                                            title,
                                            ariaRole: 'img',
                                        });
                                    } catch (error) {
                                        throw new Error(`[STEP 3: addA11y] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                    }
                                }

                                // Add styles - STEP 4
                                try {
                                    const css = generateCSS(branding);
                                    SVGUtils.addStyles(svg, css);
                                } catch (error) {
                                    throw new Error(`[STEP 4: addStyles] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                }

                                // Get palette - STEP 5
                                let palette;
                                try {
                                    palette = getPalette(branding.palette);
                                } catch (error) {
                                    throw new Error(`[STEP 5: getPalette] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                }

                                // Create container group - STEP 6
                                try {
                                    const ns = svg.namespaceURI!;
                                    if (!ns) {
                                        throw new Error('SVG namespaceURI is null');
                                    }
                                    const container = doc.createElementNS(ns, 'g');
                                    container.setAttribute('transform', `translate(${vb.x + vb.contentWidth / 2}, ${vb.y + vb.contentHeight / 2})`);
                                    svg.appendChild(container);

                                    // Render words - STEP 7
                                    fittedWords.forEach((word, i) => {
                                        try {
                                            const text = doc.createElementNS(ns, 'text');
                                            text.setAttribute('transform', `translate(${word.x || 0}, ${word.y || 0}) rotate(${word.rotate || 0})`);
                                            text.setAttribute('font-family', getFontSpec(branding.font).family);
                                            text.setAttribute('font-size', String(word.size));
                                            text.setAttribute('text-anchor', 'middle');
                                            text.setAttribute('font-weight', String(word.size > 40 ? 'bold' : 'normal'));

                                            // Get color from palette
                                            const color = getColorForIndex(i, branding.palette);
                                            text.setAttribute('fill', color);

                                            // Add subtle stroke for better visibility
                                            if (word.size > 30) {
                                                text.setAttribute('stroke', palette.background);
                                                text.setAttribute('stroke-width', '0.5');
                                                text.setAttribute('paint-order', 'stroke fill');
                                            }

                                            text.textContent = word.text;
                                            container.appendChild(text);
                                        } catch (error) {
                                            throw new Error(`[STEP 7: render word ${i} "${word.text}"] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                        }
                                    });
                                } catch (error) {
                                    throw new Error(`[STEP 6: create container] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                }

                                // Add title if present - STEP 8
                                if (title) {
                                    try {
                                        this.addTitle(doc, svg, title, vb.width, getFontSpec(branding.font));
                                    } catch (error) {
                                        throw new Error(`[STEP 8: addTitle] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                    }
                                }

                                // Sanitize and resolve - STEP 9
                                try {
                                    const result = SVGUtils.sanitizeSVG(svg.outerHTML);
                                    resolve(result);
                                } catch (error) {
                                    throw new Error(`[STEP 9: sanitizeSVG] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
                                }
                            } catch (error) {
                                reject(error);
                            }
                        });

                    layout.start();
                } catch (error) {
                    reject(new Error(`[d3-cloud layout setup] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`));
                }
            });
        } catch (error) {
            throw new Error(`[renderWordCloud outer] ${error instanceof Error ? error.message : String(error)}\nStack: ${error instanceof Error ? error.stack : 'N/A'}`);
        }
    }

    /**
     * Renders a tag bar visualization
     */
    private async renderTagBar(words: WordItem[], viewBox: ViewBox, branding: Branding, title: string): Promise<string> {
        // Calculate viewBox
        const vb = SVGUtils.calculateViewBox(viewBox);

        // Create SVG
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'tagbar');
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
        const font = getFontSpec(branding.font);

        // Calculate bar dimensions
        const barHeight = 40;
        const spacing = 10;
        const availableHeight = vb.contentHeight - (title ? 40 : 0);
        const maxBars = Math.floor(availableHeight / (barHeight + spacing));
        const displayWords = words.slice(0, maxBars);

        // Normalize bar widths based on weights
        const maxWeight = Math.max(...displayWords.map((w) => w.weight));
        const minBarWidth = 100;

        // Create container group
        const ns = svg.namespaceURI!;
        const container = doc.createElementNS(ns, 'g');
        container.setAttribute('transform', `translate(${vb.x}, ${vb.y + (title ? 40 : 0)})`);
        svg.appendChild(container);

        // Render bars
        displayWords.forEach((word, i) => {
            const yPos = i * (barHeight + spacing);
            const barWidth = minBarWidth + ((word.weight / maxWeight) * (vb.contentWidth - minBarWidth));

            const g = doc.createElementNS(ns, 'g');
            g.setAttribute('transform', `translate(0, ${yPos})`);

            // Bar rectangle
            const rect = doc.createElementNS(ns, 'rect');
            rect.setAttribute('x', '0');
            rect.setAttribute('y', '0');
            rect.setAttribute('width', String(barWidth));
            rect.setAttribute('height', String(barHeight));
            rect.setAttribute('fill', getColorForIndex(i, branding.palette));
            rect.setAttribute('rx', '5');
            g.appendChild(rect);

            // Label text
            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', '10');
            text.setAttribute('y', String(barHeight / 2));
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-family', font.family);
            text.setAttribute('font-size', String(font.size));
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('fill', '#FFF');
            text.textContent = word.text;
            g.appendChild(text);

            // Weight text
            const weightText = doc.createElementNS(ns, 'text');
            weightText.setAttribute('x', String(barWidth - 10));
            weightText.setAttribute('y', String(barHeight / 2));
            weightText.setAttribute('text-anchor', 'end');
            weightText.setAttribute('dominant-baseline', 'middle');
            weightText.setAttribute('font-family', font.family);
            weightText.setAttribute('font-size', String(font.size - 2));
            weightText.setAttribute('fill', '#FFF');
            weightText.setAttribute('opacity', '0.9');
            weightText.textContent = String(word.weight);
            g.appendChild(weightText);

            container.appendChild(g);
        });

        // Add title if present
        if (title) {
            this.addTitle(doc, svg, title, vb.width, font);
        }

        // Sanitize and return
        return SVGUtils.sanitizeSVG(svg.outerHTML);
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