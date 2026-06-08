/**
 * @fileoverview Pure-JS dimensionality reduction (UMAP with PCA fallback).
 *
 * Ported from the Angular `ClusteringService` and generalized to support both
 * 2D and 3D projections. Contains no framework / DOM coupling.
 */

import { UMAP } from 'umap-js';
import { LogError } from '@memberjunction/core';

/** Number of output dimensions for a projection. */
export type ProjectionDimensions = 2 | 3;

/** A keyed projected coordinate (length 2 or 3). */
export type ProjectedCoord = number[];

/**
 * Reduces high-dimensional vectors to 2D or 3D coordinates using UMAP, falling
 * back to PCA (power iteration) when UMAP fails. Output coordinates are
 * normalized into a fixed viewbox so they render consistently.
 */
export class DimensionalityReducer {
    private readonly padding = 60;
    private readonly viewBoxSize = 1000;

    /**
     * Project a keyed map of vectors into a keyed map of coordinates.
     * @param vectorMap Map of key -> raw vector.
     * @param dimensions Number of output dimensions (2 or 3). Defaults to 2.
     * @returns Map of key -> projected coordinate.
     */
    public Reduce(vectorMap: Map<string, number[]>, dimensions: ProjectionDimensions = 2): Map<string, ProjectedCoord> {
        const keys = Array.from(vectorMap.keys());
        const vectors = keys.map((k) => vectorMap.get(k)!);
        const result = new Map<string, ProjectedCoord>();

        if (vectors.length <= dimensions) {
            return this.buildTrivialLayout(keys, dimensions);
        }

        const embedding = this.computeEmbedding(vectors, dimensions);
        this.normalizeAndAssign(keys, embedding, result, dimensions);
        return result;
    }

    /** Compute an embedding via UMAP, falling back to PCA on failure. */
    private computeEmbedding(vectors: number[][], dimensions: ProjectionDimensions): number[][] {
        try {
            const umap = new UMAP({
                nComponents: dimensions,
                nNeighbors: Math.min(15, Math.max(2, Math.floor(vectors.length / 5))),
                minDist: 0.1,
                spread: 1.0,
            });
            return umap.fit(vectors);
        } catch (e) {
            LogError(`UMAP projection failed, falling back to PCA: ${e instanceof Error ? e.message : String(e)}`);
            return this.pca(vectors, dimensions);
        }
    }

    /** Trivial layout used when there are too few points to project meaningfully. */
    private buildTrivialLayout(keys: string[], dimensions: ProjectionDimensions): Map<string, ProjectedCoord> {
        const result = new Map<string, ProjectedCoord>();
        const mid = this.viewBoxSize / 2;
        keys.forEach((key, i) => {
            const coord: number[] = [i * 500 + 250, mid];
            if (dimensions === 3) coord.push(mid);
            result.set(key, coord);
        });
        return result;
    }

    /** Normalize an embedding into the padded viewbox and assign to keys. */
    private normalizeAndAssign(
        keys: string[],
        embedding: number[][],
        result: Map<string, ProjectedCoord>,
        dimensions: ProjectionDimensions,
    ): void {
        const usable = this.viewBoxSize - 2 * this.padding;
        const mins = new Array<number>(dimensions).fill(Infinity);
        const maxs = new Array<number>(dimensions).fill(-Infinity);

        for (const point of embedding) {
            for (let d = 0; d < dimensions; d++) {
                const v = point[d] ?? 0;
                if (v < mins[d]) mins[d] = v;
                if (v > maxs[d]) maxs[d] = v;
            }
        }
        const ranges = mins.map((min, d) => maxs[d] - min || 1);

        keys.forEach((key, i) => {
            const coord: number[] = [];
            for (let d = 0; d < dimensions; d++) {
                const raw = embedding[i]?.[d] ?? 0;
                coord.push(this.padding + ((raw - mins[d]) / ranges[d]) * usable);
            }
            result.set(key, coord);
        });
    }

    /** Simple PCA via power iteration: returns `dimensions` principal components. */
    private pca(vectors: number[][], dimensions: ProjectionDimensions): number[][] {
        const dim = vectors[0].length;
        const n = vectors.length;

        const mean = new Array<number>(dim).fill(0);
        for (const v of vectors) {
            for (let d = 0; d < dim; d++) mean[d] += v[d];
        }
        for (let d = 0; d < dim; d++) mean[d] /= n;

        const centered = vectors.map((v) => v.map((val, d) => val - mean[d]));
        const components = this.computePrincipalComponents(centered, dim, dimensions);

        return centered.map((row) => components.map((comp) => row.reduce((s, val, d) => s + val * comp[d], 0)));
    }

    /** Power-iteration computation of the top `count` principal components. */
    private computePrincipalComponents(centered: number[][], dim: number, count: number): number[][] {
        const components: number[][] = [];
        for (let comp = 0; comp < count; comp++) {
            let w = new Array<number>(dim).fill(0).map(() => Math.random() - 0.5);
            for (let iter = 0; iter < 50; iter++) {
                const newW = new Array<number>(dim).fill(0);
                for (const row of centered) {
                    const dot = row.reduce((s, val, d) => s + val * w[d], 0);
                    for (let d = 0; d < dim; d++) newW[d] += dot * row[d];
                }
                for (const prev of components) {
                    const proj = newW.reduce((s, val, d) => s + val * prev[d], 0);
                    for (let d = 0; d < dim; d++) newW[d] -= proj * prev[d];
                }
                const norm = Math.sqrt(newW.reduce((s, val) => s + val * val, 0)) || 1;
                w = newW.map((val) => val / norm);
            }
            components.push(w);
        }
        return components;
    }
}
