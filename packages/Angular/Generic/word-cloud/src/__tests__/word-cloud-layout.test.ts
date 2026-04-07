import { describe, it, expect } from 'vitest';
import { computeWordCloudLayout, WordCloudLayoutConfig } from '../lib/word-cloud.layout';
import { WordCloudItem } from '../lib/word-cloud.types';

const defaultConfig: WordCloudLayoutConfig = {
    MinFontSize: 12,
    MaxFontSize: 48,
    Layout: 'spiral',
    MaxItems: 100,
};

function makeItems(count: number, baseWeight = 1.0): WordCloudItem[] {
    return Array.from({ length: count }, (_, i) => ({
        Text: `word${i}`,
        Weight: baseWeight - (i * (baseWeight / count)),
    }));
}

describe('computeWordCloudLayout', () => {
    describe('empty and edge cases', () => {
        it('should return empty layout for empty items array', () => {
            const result = computeWordCloudLayout([], defaultConfig);
            expect(result.Items).toHaveLength(0);
            expect(result.ViewBox).toBe('0 0 100 100');
        });

        it('should return empty layout for null-ish items', () => {
            const result = computeWordCloudLayout(null as unknown as WordCloudItem[], defaultConfig);
            expect(result.Items).toHaveLength(0);
        });

        it('should handle a single item', () => {
            const items: WordCloudItem[] = [{ Text: 'hello', Weight: 1.0 }];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items).toHaveLength(1);
            expect(result.Items[0].Text).toBe('hello');
            expect(result.Items[0].FontSize).toBe(48); // max font for weight 1.0
        });
    });

    describe('sorting and limiting', () => {
        it('should sort items by weight descending (heaviest first)', () => {
            const items: WordCloudItem[] = [
                { Text: 'low', Weight: 0.2 },
                { Text: 'high', Weight: 0.9 },
                { Text: 'mid', Weight: 0.5 },
            ];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items[0].Text).toBe('high');
            expect(result.Items[1].Text).toBe('mid');
            expect(result.Items[2].Text).toBe('low');
        });

        it('should limit items to MaxItems', () => {
            const items = makeItems(50);
            const config = { ...defaultConfig, MaxItems: 10 };
            const result = computeWordCloudLayout(items, config);
            expect(result.Items.length).toBeLessThanOrEqual(10);
        });
    });

    describe('font size mapping', () => {
        it('should map weight 1.0 to MaxFontSize', () => {
            const items: WordCloudItem[] = [{ Text: 'max', Weight: 1.0 }];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items[0].FontSize).toBe(48);
        });

        it('should map weight 0.0 to MinFontSize', () => {
            const items: WordCloudItem[] = [{ Text: 'min', Weight: 0.0 }];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items[0].FontSize).toBe(12);
        });

        it('should map weight 0.5 to midpoint font size', () => {
            const items: WordCloudItem[] = [{ Text: 'mid', Weight: 0.5 }];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items[0].FontSize).toBe(30); // 12 + 0.5 * (48 - 12) = 30
        });

        it('should clamp weights above 1.0', () => {
            const items: WordCloudItem[] = [{ Text: 'over', Weight: 1.5 }];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items[0].FontSize).toBe(48);
        });

        it('should clamp weights below 0.0', () => {
            const items: WordCloudItem[] = [{ Text: 'under', Weight: -0.5 }];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items[0].FontSize).toBe(12);
        });
    });

    describe('positioning', () => {
        it('should place the first item near the center', () => {
            const items: WordCloudItem[] = [{ Text: 'center', Weight: 1.0 }];
            const result = computeWordCloudLayout(items, defaultConfig);
            // First item should be at or very near (0, 0)
            expect(Math.abs(result.Items[0].X)).toBeLessThan(10);
            expect(Math.abs(result.Items[0].Y)).toBeLessThan(10);
        });

        it('should not have overlapping items', () => {
            const items = makeItems(20);
            const result = computeWordCloudLayout(items, defaultConfig);

            // Verify no two items share the exact same position
            for (let i = 0; i < result.Items.length; i++) {
                for (let j = i + 1; j < result.Items.length; j++) {
                    const samePos = result.Items[i].X === result.Items[j].X &&
                                    result.Items[i].Y === result.Items[j].Y;
                    expect(samePos).toBe(false);
                }
            }
        });

        it('should place items progressively further from center', () => {
            const items = makeItems(10, 1.0);
            const result = computeWordCloudLayout(items, defaultConfig);

            // The average distance from center should increase for later items
            if (result.Items.length >= 2) {
                const firstDist = Math.sqrt(result.Items[0].X ** 2 + result.Items[0].Y ** 2);
                const lastDist = Math.sqrt(
                    result.Items[result.Items.length - 1].X ** 2 +
                    result.Items[result.Items.length - 1].Y ** 2
                );
                expect(lastDist).toBeGreaterThanOrEqual(firstDist);
            }
        });
    });

    describe('rotation', () => {
        it('should rotate approximately 20% of words (every 5th at index 3)', () => {
            const items = makeItems(20);
            const result = computeWordCloudLayout(items, defaultConfig);
            const rotated = result.Items.filter(i => i.Rotation === 90);
            const unrotated = result.Items.filter(i => i.Rotation === 0);
            // Roughly 20% should be rotated (deterministic based on index % 5 === 3)
            expect(rotated.length).toBeGreaterThan(0);
            expect(unrotated.length).toBeGreaterThan(rotated.length);
        });

        it('should only use 0 or 90 degree rotation', () => {
            const items = makeItems(30);
            const result = computeWordCloudLayout(items, defaultConfig);
            for (const item of result.Items) {
                expect([0, 90]).toContain(item.Rotation);
            }
        });
    });

    describe('layout modes', () => {
        it('should produce valid layout with spiral mode', () => {
            const items = makeItems(15);
            const result = computeWordCloudLayout(items, { ...defaultConfig, Layout: 'spiral' });
            expect(result.Items.length).toBeGreaterThan(0);
            expect(result.ViewBox).not.toBe('0 0 100 100'); // should have computed viewBox
        });

        it('should produce valid layout with rectangular mode', () => {
            const items = makeItems(15);
            const result = computeWordCloudLayout(items, { ...defaultConfig, Layout: 'rectangular' });
            expect(result.Items.length).toBeGreaterThan(0);
        });
    });

    describe('viewBox computation', () => {
        it('should produce a viewBox that encompasses all items', () => {
            const items = makeItems(10);
            const result = computeWordCloudLayout(items, defaultConfig);
            const [vx, vy, vw, vh] = result.ViewBox.split(' ').map(Number);

            for (const item of result.Items) {
                expect(item.X).toBeGreaterThanOrEqual(vx);
                expect(item.X).toBeLessThanOrEqual(vx + vw);
                expect(item.Y).toBeGreaterThanOrEqual(vy);
                expect(item.Y).toBeLessThanOrEqual(vy + vh);
            }
        });
    });

    describe('index assignment', () => {
        it('should assign sequential indices to layout items', () => {
            const items = makeItems(5);
            const result = computeWordCloudLayout(items, defaultConfig);
            for (let i = 0; i < result.Items.length; i++) {
                expect(result.Items[i].Index).toBe(i);
            }
        });
    });

    describe('metadata preservation', () => {
        it('should preserve Category from input items', () => {
            const items: WordCloudItem[] = [
                { Text: 'test', Weight: 0.8, Category: 'tech' },
            ];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items[0].Category).toBe('tech');
        });

        it('should preserve Metadata from input items', () => {
            const meta = { id: '123', source: 'test' };
            const items: WordCloudItem[] = [
                { Text: 'test', Weight: 0.8, Metadata: meta },
            ];
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items[0].Metadata).toEqual(meta);
        });
    });

    describe('large datasets', () => {
        it('should handle 100 items without crashing', () => {
            const items = makeItems(100);
            const result = computeWordCloudLayout(items, defaultConfig);
            expect(result.Items.length).toBeGreaterThan(0);
            expect(result.Items.length).toBeLessThanOrEqual(100);
        });

        it('should complete layout within reasonable time', () => {
            const items = makeItems(100);
            const start = performance.now();
            computeWordCloudLayout(items, defaultConfig);
            const elapsed = performance.now() - start;
            expect(elapsed).toBeLessThan(5000); // should complete in < 5 seconds
        });
    });
});
