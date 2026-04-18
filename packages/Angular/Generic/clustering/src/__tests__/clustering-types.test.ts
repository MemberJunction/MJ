import { describe, it, expect } from 'vitest';
import {
    DefaultClusterConfig,
    CLUSTER_COLORS,
    ClusterConfig,
    ClusterPoint,
    ClusterInfo,
    ClusterMetrics,
    ClusterVisualizationResult,
    ClusterInputVector,
    CancelableEvent,
    ViewportRect,
    ClusterSelectedEvent,
    ViewportTransform,
    ClusterLabel,
    SavedClusterVisualization,
    ClusterConfigPanelEntityOption,
    ClusterConfigPanelEntityDocOption,
} from '../lib/clustering.types';

// ================================================================
// DefaultClusterConfig factory
// ================================================================

describe('DefaultClusterConfig', () => {
    it('should return a new object on each call', () => {
        const a = DefaultClusterConfig();
        const b = DefaultClusterConfig();
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });

    it('should have correct default values', () => {
        const cfg = DefaultClusterConfig();
        expect(cfg.EntityName).toBe('');
        expect(cfg.EntityDocumentID).toBe('');
        expect(cfg.Algorithm).toBe('kmeans');
        expect(cfg.K).toBe(4);
        expect(cfg.Epsilon).toBe(0.3);
        expect(cfg.MinPoints).toBe(3);
        expect(cfg.DistanceMetric).toBe('cosine');
        expect(cfg.MaxRecords).toBe(500);
        expect(cfg.Filter).toBe('');
    });

    it('should be mutable after creation', () => {
        const cfg = DefaultClusterConfig();
        cfg.EntityName = 'Companies';
        cfg.K = 8;
        cfg.Algorithm = 'dbscan';
        expect(cfg.EntityName).toBe('Companies');
        expect(cfg.K).toBe(8);
        expect(cfg.Algorithm).toBe('dbscan');
    });
});

// ================================================================
// CLUSTER_COLORS constant
// ================================================================

describe('CLUSTER_COLORS', () => {
    it('should contain exactly 10 colors', () => {
        expect(CLUSTER_COLORS).toHaveLength(10);
    });

    it('should contain only valid CSS hex color strings', () => {
        const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
        for (const color of CLUSTER_COLORS) {
            expect(color).toMatch(hexColorRegex);
        }
    });

    it('should contain all unique colors', () => {
        const unique = new Set(CLUSTER_COLORS);
        expect(unique.size).toBe(CLUSTER_COLORS.length);
    });

    it('should be a plain array (not frozen or sealed)', () => {
        expect(Array.isArray(CLUSTER_COLORS)).toBe(true);
    });
});

// ================================================================
// Type interfaces - structural conformance
// ================================================================

describe('Type interfaces', () => {
    describe('ClusterConfig', () => {
        it('should accept a fully specified object', () => {
            const config: ClusterConfig = {
                EntityName: 'Users',
                EntityDocumentID: 'abc-123',
                Algorithm: 'dbscan',
                K: 5,
                Epsilon: 0.5,
                MinPoints: 4,
                DistanceMetric: 'euclidean',
                MaxRecords: 1000,
                Filter: "Status='Active'",
            };
            expect(config.Algorithm).toBe('dbscan');
            expect(config.DistanceMetric).toBe('euclidean');
        });
    });

    describe('ClusterPoint', () => {
        it('should accept a conforming object', () => {
            const point: ClusterPoint = {
                X: 100,
                Y: 200,
                ClusterId: 2,
                Label: 'Record A',
                VectorKey: 'key-1',
                Metadata: { Score: 0.95 },
            };
            expect(point.X).toBe(100);
            expect(point.Y).toBe(200);
            expect(point.Metadata).toEqual({ Score: 0.95 });
        });

        it('should accept outlier points with ClusterId -1', () => {
            const outlier: ClusterPoint = {
                X: 50,
                Y: 50,
                ClusterId: -1,
                Label: 'Outlier',
                VectorKey: 'out-1',
                Metadata: {},
            };
            expect(outlier.ClusterId).toBe(-1);
        });
    });

    describe('ClusterInfo', () => {
        it('should accept a conforming object', () => {
            const info: ClusterInfo = {
                Id: 0,
                Label: 'Cluster 1',
                Color: '#5b8def',
                MemberCount: 42,
            };
            expect(info.Id).toBe(0);
            expect(info.MemberCount).toBe(42);
        });
    });

    describe('ClusterMetrics', () => {
        it('should accept a conforming object', () => {
            const metrics: ClusterMetrics = {
                SilhouetteScore: 0.72,
                ClusterCount: 3,
                ComputationTimeMs: 150,
                RecordCount: 100,
                OutlierCount: 5,
            };
            expect(metrics.SilhouetteScore).toBe(0.72);
            expect(metrics.OutlierCount).toBe(5);
        });
    });

    describe('ClusterVisualizationResult', () => {
        it('should accept a conforming object', () => {
            const result: ClusterVisualizationResult = {
                Points: [],
                Clusters: [],
                Metrics: {
                    SilhouetteScore: 0,
                    ClusterCount: 0,
                    ComputationTimeMs: 10,
                    RecordCount: 0,
                    OutlierCount: 0,
                },
                Config: DefaultClusterConfig(),
            };
            expect(result.Points).toHaveLength(0);
            expect(result.Config.Algorithm).toBe('kmeans');
        });
    });

    describe('ClusterInputVector', () => {
        it('should accept a minimal object', () => {
            const input: ClusterInputVector = {
                Key: 'vec-1',
                Vector: [0.1, 0.2, 0.3],
            };
            expect(input.Key).toBe('vec-1');
            expect(input.Label).toBeUndefined();
            expect(input.Metadata).toBeUndefined();
        });

        it('should accept a fully specified object', () => {
            const input: ClusterInputVector = {
                Key: 'vec-2',
                Vector: [1.0, 2.0],
                Label: 'My Vector',
                Metadata: { source: 'test' },
            };
            expect(input.Label).toBe('My Vector');
        });
    });

    describe('CancelableEvent', () => {
        it('should accept a typed event', () => {
            const event: CancelableEvent<string> = {
                Data: 'hello',
                Cancel: false,
            };
            expect(event.Cancel).toBe(false);
            event.Cancel = true;
            expect(event.Cancel).toBe(true);
        });

        it('should default to unknown type parameter', () => {
            const event: CancelableEvent = {
                Data: 42,
                Cancel: false,
            };
            expect(event.Data).toBe(42);
        });
    });

    describe('ViewportRect', () => {
        it('should accept a conforming object', () => {
            const rect: ViewportRect = {
                MinX: -50,
                MinY: -30,
                Width: 1100,
                Height: 800,
            };
            expect(rect.Width).toBe(1100);
        });
    });

    describe('ClusterSelectedEvent', () => {
        it('should accept a conforming object', () => {
            const event: ClusterSelectedEvent = {
                ClusterId: 1,
                Label: 'Cluster 2',
                Color: '#34d399',
                MemberCount: 15,
            };
            expect(event.ClusterId).toBe(1);
        });
    });

    describe('ViewportTransform', () => {
        it('should accept a conforming object', () => {
            const vt: ViewportTransform = {
                TranslateX: 10,
                TranslateY: 20,
                Scale: 1.5,
            };
            expect(vt.Scale).toBe(1.5);
        });
    });

    describe('ClusterLabel', () => {
        it('should accept a conforming object', () => {
            const label: ClusterLabel = {
                ClusterId: 0,
                Label: 'Revenue Leaders',
                IsUserEdited: true,
            };
            expect(label.IsUserEdited).toBe(true);
        });
    });

    describe('SavedClusterVisualization', () => {
        it('should accept a minimal object', () => {
            const saved: SavedClusterVisualization = {
                Id: 'uuid-1',
                Name: 'My Analysis',
                EntityName: 'Accounts',
                Algorithm: 'kmeans',
                Params: { K: 5 },
                CreatedAt: '2024-01-01T00:00:00Z',
            };
            expect(saved.Result).toBeUndefined();
            expect(saved.Viewport).toBeUndefined();
            expect(saved.ClusterLabels).toBeUndefined();
        });
    });

    describe('ClusterConfigPanelEntityOption', () => {
        it('should accept a conforming object', () => {
            const opt: ClusterConfigPanelEntityOption = { Name: 'Accounts' };
            expect(opt.Name).toBe('Accounts');
        });
    });

    describe('ClusterConfigPanelEntityDocOption', () => {
        it('should accept a conforming object', () => {
            const opt: ClusterConfigPanelEntityDocOption = { ID: 'doc-1', Name: 'Default Doc' };
            expect(opt.ID).toBe('doc-1');
        });
    });
});
