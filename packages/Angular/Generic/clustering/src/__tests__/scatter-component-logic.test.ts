import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClusterPoint, ClusterInfo, CLUSTER_COLORS, ViewportTransform } from '../lib/clustering.types';

// Mock Angular core since the component uses @Component, @Input, etc.
const { mockDetectChanges } = vi.hoisted(() => ({
    mockDetectChanges: vi.fn(),
}));

vi.mock('@angular/core', () => ({
    Component: () => (target: unknown) => target,
    Input: () => (_target: unknown, _key: string) => {},
    Output: () => (_target: unknown, _key: string) => {},
    ViewChild: () => (_target: unknown, _key: string) => {},
    EventEmitter: class { emit = vi.fn(); subscribe = vi.fn(); },
    ElementRef: class {},
    ChangeDetectorRef: class {},
    AfterViewInit: class {},
    OnDestroy: class {},
    OnChanges: class {},
    SimpleChanges: class {},
    ViewEncapsulation: { None: 0 },
    inject: () => ({ detectChanges: mockDetectChanges }),
}));

import { ClusterScatterComponent } from '../lib/cluster-scatter.component';

// ================================================================
// Helpers
// ================================================================

function makePoints(count: number, clusterId: number = 0): ClusterPoint[] {
    return Array.from({ length: count }, (_, i) => ({
        X: 100 + i * 50,
        Y: 200 + i * 30,
        ClusterId: clusterId,
        Label: `Point ${i}`,
        VectorKey: `vec-${i}`,
        Metadata: { index: i },
    }));
}

function makeClusters(count: number): ClusterInfo[] {
    return Array.from({ length: count }, (_, i) => ({
        Id: i,
        Label: `Cluster ${i + 1}`,
        Color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
        MemberCount: 5,
    }));
}

function createComponent(): ClusterScatterComponent {
    const comp = new ClusterScatterComponent();
    return comp;
}

// ================================================================
// Tests
// ================================================================

describe('ClusterScatterComponent (pure logic)', () => {
    let comp: ClusterScatterComponent;

    beforeEach(() => {
        comp = createComponent();
    });

    // ================================================================
    // Default property values
    // ================================================================

    describe('default property values', () => {
        it('should have correct defaults', () => {
            expect(comp.Points).toEqual([]);
            expect(comp.Clusters).toEqual([]);
            expect(comp.IsLoading).toBe(false);
            expect(comp.DotRadius).toBe(5);
            expect(comp.DotOpacity).toBe(0.75);
            expect(comp.HighlightRadius).toBe(8);
            expect(comp.ShowLegend).toBe(true);
            expect(comp.ShowTooltip).toBe(true);
            expect(comp.TooltipFields).toEqual([]);
            expect(comp.ColorPalette).toEqual([]);
            expect(comp.EnableZoom).toBe(true);
            expect(comp.EnablePan).toBe(true);
            expect(comp.AnimateTransitions).toBe(true);
            expect(comp.MinZoom).toBe(0.5);
            expect(comp.MaxZoom).toBe(10);
        });

        it('should have correct default ViewBox', () => {
            expect(comp.ViewBox).toEqual([0, 0, 1000, 700]);
        });
    });

    // ================================================================
    // GetViewBoxString
    // ================================================================

    describe('GetViewBoxString', () => {
        it('should return space-separated string', () => {
            expect(comp.GetViewBoxString()).toBe('0 0 1000 700');
        });

        it('should reflect modified ViewBox', () => {
            comp.ViewBox = [50, 100, 800, 600];
            expect(comp.GetViewBoxString()).toBe('50 100 800 600');
        });
    });

    // ================================================================
    // GetPointColor
    // ================================================================

    describe('GetPointColor', () => {
        it('should return gray for outlier points (ClusterId < 0)', () => {
            const outlier: ClusterPoint = {
                X: 0, Y: 0, ClusterId: -1, Label: '', VectorKey: 'o', Metadata: {},
            };
            expect(comp.GetPointColor(outlier)).toBe('#64748b');
        });

        it('should return cluster color from Clusters array', () => {
            comp.Clusters = makeClusters(3);
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 1, Label: '', VectorKey: 'p', Metadata: {},
            };
            expect(comp.GetPointColor(point)).toBe(CLUSTER_COLORS[1]);
        });

        it('should fall back to palette when cluster not found', () => {
            comp.Clusters = []; // no clusters
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 2, Label: '', VectorKey: 'p', Metadata: {},
            };
            expect(comp.GetPointColor(point)).toBe(CLUSTER_COLORS[2]);
        });

        it('should use custom ColorPalette when provided', () => {
            comp.ColorPalette = ['#ff0000', '#00ff00', '#0000ff'];
            comp.Clusters = []; // force palette fallback
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 1, Label: '', VectorKey: 'p', Metadata: {},
            };
            expect(comp.GetPointColor(point)).toBe('#00ff00');
        });

        it('should wrap palette index for high cluster IDs', () => {
            comp.Clusters = [];
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 10, Label: '', VectorKey: 'p', Metadata: {},
            };
            // 10 % 10 = 0
            expect(comp.GetPointColor(point)).toBe(CLUSTER_COLORS[0]);
        });
    });

    // ================================================================
    // GetPointRadius
    // ================================================================

    describe('GetPointRadius', () => {
        it('should return DotRadius for non-selected points', () => {
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p1', Metadata: {},
            };
            expect(comp.GetPointRadius(point)).toBe(5);
        });

        it('should return HighlightRadius for selected points', () => {
            comp.SelectedPointIds = new Set(['p1']);
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p1', Metadata: {},
            };
            expect(comp.GetPointRadius(point)).toBe(8);
        });

        it('should respect custom DotRadius and HighlightRadius', () => {
            comp.DotRadius = 10;
            comp.HighlightRadius = 15;
            const p1: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'a', Metadata: {},
            };
            const p2: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'b', Metadata: {},
            };
            comp.SelectedPointIds = new Set(['b']);

            expect(comp.GetPointRadius(p1)).toBe(10);
            expect(comp.GetPointRadius(p2)).toBe(15);
        });
    });

    // ================================================================
    // GetPointOpacity
    // ================================================================

    describe('GetPointOpacity', () => {
        it('should return DotOpacity when no point is hovered', () => {
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p1', Metadata: {},
            };
            expect(comp.GetPointOpacity(point)).toBe(0.75);
        });

        it('should return full opacity for the hovered point', () => {
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p1', Metadata: {},
            };
            comp.HoveredPoint = point;
            expect(comp.GetPointOpacity(point)).toBe(0.75);
        });

        it('should dim non-hovered points when a point is hovered', () => {
            const hovered: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'h', Metadata: {},
            };
            const other: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'o', Metadata: {},
            };
            comp.HoveredPoint = hovered;
            expect(comp.GetPointOpacity(other)).toBe(0.75 * 0.5);
        });
    });

    // ================================================================
    // IsHighlighted / IsSelected
    // ================================================================

    describe('IsHighlighted', () => {
        it('should return false when nothing is highlighted', () => {
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p1', Metadata: {},
            };
            expect(comp.IsHighlighted(point)).toBe(false);
        });

        it('should return true for the highlighted point', () => {
            comp.HighlightedKey = 'p1';
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p1', Metadata: {},
            };
            expect(comp.IsHighlighted(point)).toBe(true);
        });
    });

    describe('IsSelected', () => {
        it('should return false when nothing is selected', () => {
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p1', Metadata: {},
            };
            expect(comp.IsSelected(point)).toBe(false);
        });

        it('should return true for selected points', () => {
            comp.SelectedPointIds = new Set(['p1', 'p2']);
            const p1: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p1', Metadata: {},
            };
            const p3: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'p3', Metadata: {},
            };
            expect(comp.IsSelected(p1)).toBe(true);
            expect(comp.IsSelected(p3)).toBe(false);
        });
    });

    // ================================================================
    // GetClusterLabel / GetClusterLabelById
    // ================================================================

    describe('GetClusterLabel', () => {
        it('should return "Outlier" for negative cluster IDs', () => {
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: -1, Label: '', VectorKey: 'p', Metadata: {},
            };
            expect(comp.GetClusterLabel(point)).toBe('Outlier');
        });

        it('should return cluster label when cluster exists', () => {
            comp.Clusters = [{ Id: 2, Label: 'Tech Companies', Color: '#000', MemberCount: 5 }];
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 2, Label: '', VectorKey: 'p', Metadata: {},
            };
            expect(comp.GetClusterLabel(point)).toBe('Tech Companies');
        });

        it('should return fallback label when cluster not found', () => {
            comp.Clusters = [];
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 3, Label: '', VectorKey: 'p', Metadata: {},
            };
            expect(comp.GetClusterLabel(point)).toBe('Cluster 4');
        });
    });

    describe('GetClusterLabelById', () => {
        it('should return cluster label for valid ID', () => {
            comp.Clusters = makeClusters(3);
            expect(comp.GetClusterLabelById(0)).toBe('Cluster 1');
            expect(comp.GetClusterLabelById(1)).toBe('Cluster 2');
        });

        it('should return empty string for unknown ID', () => {
            comp.Clusters = [];
            expect(comp.GetClusterLabelById(99)).toBe('');
        });
    });

    // ================================================================
    // GetClusterColor
    // ================================================================

    describe('GetClusterColor', () => {
        it('should return gray for negative cluster IDs', () => {
            expect(comp.GetClusterColor(-1)).toBe('#64748b');
        });

        it('should return cluster color when cluster exists', () => {
            comp.Clusters = [{ Id: 0, Label: 'A', Color: '#ff0000', MemberCount: 3 }];
            expect(comp.GetClusterColor(0)).toBe('#ff0000');
        });

        it('should fall back to palette for unknown cluster', () => {
            comp.Clusters = [];
            expect(comp.GetClusterColor(2)).toBe(CLUSTER_COLORS[2]);
        });
    });

    // ================================================================
    // Viewport Transform
    // ================================================================

    describe('GetViewportTransform / SetViewportTransform', () => {
        it('should return default transform', () => {
            const vt = comp.GetViewportTransform();
            expect(vt.TranslateX).toBe(0);
            expect(vt.TranslateY).toBe(0);
            expect(vt.Scale).toBe(1);
        });

        it('should reflect modified ViewBox', () => {
            comp.ViewBox = [100, 50, 500, 350];
            const vt = comp.GetViewportTransform();
            expect(vt.TranslateX).toBe(100);
            expect(vt.TranslateY).toBe(50);
            expect(vt.Scale).toBe(1000 / 500); // defaultWidth / ViewBox[2]
        });

        it('should restore a saved transform', () => {
            const saved: ViewportTransform = {
                TranslateX: 200,
                TranslateY: 150,
                Scale: 2,
            };
            comp.SetViewportTransform(saved);

            expect(comp.ViewBox[0]).toBe(200);
            expect(comp.ViewBox[1]).toBe(150);
            expect(comp.ViewBox[2]).toBe(500);  // 1000 / 2
            expect(comp.ViewBox[3]).toBe(350);  // 700 / 2
        });

        it('should round-trip correctly', () => {
            const original: ViewportTransform = {
                TranslateX: 75,
                TranslateY: -30,
                Scale: 1.5,
            };
            comp.SetViewportTransform(original);
            const restored = comp.GetViewportTransform();

            expect(restored.TranslateX).toBeCloseTo(75);
            expect(restored.TranslateY).toBeCloseTo(-30);
            expect(restored.Scale).toBeCloseTo(1.5);
        });
    });

    // ================================================================
    // GetVisiblePoints
    // ================================================================

    describe('GetVisiblePoints', () => {
        it('should return all points within default viewport', () => {
            comp.Points = makePoints(3);
            // Default ViewBox: [0, 0, 1000, 700]
            // Points at (100,200), (150,230), (200,260) - all inside
            const visible = comp.GetVisiblePoints();
            expect(visible).toHaveLength(3);
        });

        it('should exclude points outside viewport', () => {
            comp.Points = [
                { X: 500, Y: 350, ClusterId: 0, Label: 'Inside', VectorKey: 'a', Metadata: {} },
                { X: 1500, Y: 350, ClusterId: 0, Label: 'Outside', VectorKey: 'b', Metadata: {} },
                { X: -50, Y: 350, ClusterId: 0, Label: 'Outside2', VectorKey: 'c', Metadata: {} },
            ];
            const visible = comp.GetVisiblePoints();
            expect(visible).toHaveLength(1);
            expect(visible[0].VectorKey).toBe('a');
        });

        it('should respect modified ViewBox', () => {
            comp.Points = [
                { X: 500, Y: 350, ClusterId: 0, Label: '', VectorKey: 'a', Metadata: {} },
                { X: 200, Y: 200, ClusterId: 0, Label: '', VectorKey: 'b', Metadata: {} },
            ];
            comp.ViewBox = [400, 300, 200, 100]; // tight box around point 'a'
            const visible = comp.GetVisiblePoints();
            expect(visible).toHaveLength(1);
            expect(visible[0].VectorKey).toBe('a');
        });
    });

    // ================================================================
    // SelectPoints / ClearSelection / HighlightCluster
    // ================================================================

    describe('SelectPoints', () => {
        it('should add to existing selection', () => {
            comp.SelectedPointIds = new Set(['existing']);
            comp.SelectPoints(['new1', 'new2']);
            expect(comp.SelectedPointIds.has('existing')).toBe(true);
            expect(comp.SelectedPointIds.has('new1')).toBe(true);
            expect(comp.SelectedPointIds.has('new2')).toBe(true);
        });
    });

    describe('ClearSelection', () => {
        it('should clear all selections and highlighted key', () => {
            comp.SelectedPointIds = new Set(['a', 'b']);
            comp.HighlightedKey = 'a';
            comp.ClearSelection();
            expect(comp.SelectedPointIds.size).toBe(0);
            expect(comp.HighlightedKey).toBeNull();
        });
    });

    describe('HighlightCluster', () => {
        it('should select all points in the specified cluster', () => {
            comp.Points = [
                { X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'a', Metadata: {} },
                { X: 0, Y: 0, ClusterId: 1, Label: '', VectorKey: 'b', Metadata: {} },
                { X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'c', Metadata: {} },
            ];
            comp.HighlightCluster(0);
            expect(comp.SelectedPointIds.has('a')).toBe(true);
            expect(comp.SelectedPointIds.has('c')).toBe(true);
            expect(comp.SelectedPointIds.has('b')).toBe(false);
        });
    });

    // ================================================================
    // Detail Panel
    // ================================================================

    describe('CloseDetailPanel', () => {
        it('should reset detail panel state', () => {
            comp.ShowDetailPanel = true;
            comp.SelectedPoint = makePoints(1)[0];
            comp.DetailEntries = [{ Key: 'k', Value: 'v' }];
            comp.ClusterMembers = makePoints(2);

            comp.CloseDetailPanel();

            expect(comp.ShowDetailPanel).toBe(false);
            expect(comp.SelectedPoint).toBeNull();
            expect(comp.DetailEntries).toEqual([]);
            expect(comp.ClusterMembers).toEqual([]);
        });
    });

    describe('ToggleClusterMembers', () => {
        it('should toggle the expansion state', () => {
            expect(comp.ClusterMembersExpanded).toBe(true);
            comp.ToggleClusterMembers();
            expect(comp.ClusterMembersExpanded).toBe(false);
            comp.ToggleClusterMembers();
            expect(comp.ClusterMembersExpanded).toBe(true);
        });
    });

    // ================================================================
    // TrackBy functions
    // ================================================================

    describe('TrackBy functions', () => {
        it('TrackPointBy should return VectorKey', () => {
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'abc', Metadata: {},
            };
            expect(comp.TrackPointBy(0, point)).toBe('abc');
        });

        it('TrackClusterBy should return cluster Id', () => {
            const cluster: ClusterInfo = { Id: 5, Label: '', Color: '', MemberCount: 0 };
            expect(comp.TrackClusterBy(0, cluster)).toBe(5);
        });

        it('TrackCentroidBy should return ClusterId', () => {
            expect(comp.TrackCentroidBy(0, { ClusterId: 3 })).toBe(3);
        });

        it('TrackMemberBy should return VectorKey', () => {
            const point: ClusterPoint = {
                X: 0, Y: 0, ClusterId: 0, Label: '', VectorKey: 'xyz', Metadata: {},
            };
            expect(comp.TrackMemberBy(0, point)).toBe('xyz');
        });
    });

    // ================================================================
    // ResetZoom
    // ================================================================

    describe('ResetZoom', () => {
        it('should reset ViewBox to defaults', () => {
            comp.ViewBox = [100, 200, 500, 300];
            comp.ResetZoom();
            expect(comp.ViewBox).toEqual([0, 0, 1000, 700]);
        });
    });

    // ================================================================
    // ZoomToCluster
    // ================================================================

    describe('ZoomToCluster', () => {
        it('should do nothing for empty cluster', () => {
            comp.Points = makePoints(3, 0);
            const originalViewBox = [...comp.ViewBox];
            comp.ZoomToCluster(99); // no members
            expect(comp.ViewBox).toEqual(originalViewBox);
        });

        it('should zoom into cluster bounds with padding', () => {
            comp.Points = [
                { X: 200, Y: 300, ClusterId: 1, Label: '', VectorKey: 'a', Metadata: {} },
                { X: 400, Y: 500, ClusterId: 1, Label: '', VectorKey: 'b', Metadata: {} },
                { X: 800, Y: 100, ClusterId: 0, Label: '', VectorKey: 'c', Metadata: {} },
            ];
            comp.ZoomToCluster(1);

            // Should zoom to cluster 1 bounds (200-400 X, 300-500 Y) + 80 padding
            expect(comp.ViewBox[0]).toBe(200 - 80);  // minX - padding
            expect(comp.ViewBox[1]).toBe(300 - 80);  // minY - padding
            expect(comp.ViewBox[2]).toBe(200 + 160);  // range + 2*padding
            expect(comp.ViewBox[3]).toBe(200 + 160);
        });

        it('should enforce minimum dimensions', () => {
            comp.Points = [
                { X: 500, Y: 350, ClusterId: 2, Label: '', VectorKey: 'a', Metadata: {} },
            ];
            comp.ZoomToCluster(2);

            // Single point: range=0, so bounds would be tiny, minimum enforced
            expect(comp.ViewBox[2]).toBeGreaterThanOrEqual(200); // min width
            expect(comp.ViewBox[3]).toBeGreaterThanOrEqual(140); // min height
        });
    });
});
