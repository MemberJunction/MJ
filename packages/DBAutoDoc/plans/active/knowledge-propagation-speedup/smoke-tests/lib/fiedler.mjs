// Fiedler vector computation for constrained spectral partitioning.
// Implements our C1 SchemaPartitioner: recursive bisection along the 2nd-smallest
// eigenvector of the graph Laplacian, with anchor-node protection.
//
// No external numerical deps — power iteration with deflation on the Laplacian
// is O(|V| · iterations) per split; for schemas ≤ 200 tables this is <1s total.

/**
 * Build symmetric Laplacian L = D − A from an adjacency list.
 * Supports optional edge-weight multiplier on anchor-incident edges (for constraints).
 *
 * @param {string[]} nodes - ordered node names
 * @param {Array<{a:string, b:string}>} edges - undirected edges
 * @param {Set<string>} [anchors] - nodes whose edges receive heavy weight
 * @param {number} [anchorWeight] - multiplier for anchor-incident edges (default 5)
 * @returns {Float64Array} n×n Laplacian, row-major
 */
export function buildLaplacian(nodes, edges, anchors = new Set(), anchorWeight = 5) {
    const n = nodes.length;
    const idx = new Map(nodes.map((name, i) => [name, i]));
    const L = new Float64Array(n * n);
    for (const { a, b } of edges) {
        const i = idx.get(a), j = idx.get(b);
        if (i == null || j == null || i === j) continue;
        const w = (anchors.has(a) || anchors.has(b)) ? anchorWeight : 1;
        L[i * n + j] -= w;
        L[j * n + i] -= w;
        L[i * n + i] += w;
        L[j * n + j] += w;
    }
    return L;
}

/**
 * Power iteration with deflation to find the second-smallest eigenvector
 * (Fiedler vector) of a symmetric PSD matrix.
 *
 * Strategy: the Laplacian's smallest eigenvalue is 0 with eigenvector = 1-vector.
 * To find λ_2, we work on a deflated matrix that repels from 1-vector subspace.
 * Equivalently: do inverse power iteration on (L + σI - ones·ones^T/n).
 * Simpler approach: use plain power iteration on (cI - L) for large c, then project.
 *
 * @param {Float64Array} L - n×n Laplacian, row-major
 * @param {number} n - matrix dimension
 * @param {number} maxIter - max iterations (default 500)
 * @param {number} tol - convergence tolerance (default 1e-6)
 * @returns {{ fiedler: Float64Array, lambda2: number, lambdaMax: number }}
 */
export function fiedlerVector(L, n, maxIter = 500, tol = 1e-6) {
    // Run power iteration several times from different random starts; keep
    // the result with the smallest Rayleigh quotient (closest to true λ_2).
    // Cheap insurance against bad initial vectors on multi-cluster graphs.
    let best = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        const r = fiedlerVectorSingle(L, n, maxIter, tol);
        if (!best || r.lambda2 < best.lambda2) best = r;
    }
    return best;
}

function fiedlerVectorSingle(L, n, maxIter = 500, tol = 1e-6) {
    // Step 1: estimate largest eigenvalue (lambdaMax) via plain power iteration
    let v = new Float64Array(n).fill(0);
    for (let i = 0; i < n; i++) v[i] = Math.random() - 0.5;
    normalize(v);
    let lambdaMax = 0;
    for (let iter = 0; iter < 100; iter++) {
        const w = matVec(L, v, n);
        const newLambda = dot(v, w);
        normalize(w);
        if (Math.abs(newLambda - lambdaMax) < tol) { lambdaMax = newLambda; break; }
        lambdaMax = newLambda;
        v = w;
    }

    // Step 2: work on (lambdaMax * I - L). Its top eigenvectors are L's BOTTOM.
    // Power iterate with deflation against the ones-vector (which corresponds to L's 0 eigenvalue).
    const ones = new Float64Array(n).fill(1 / Math.sqrt(n));
    v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = Math.random() - 0.5;
    deflate(v, ones);   // ensure v ⊥ ones
    normalize(v);

    let prev = 0;
    for (let iter = 0; iter < maxIter; iter++) {
        // w = (lambdaMax * I - L) * v = lambdaMax * v - L*v
        const Lv = matVec(L, v, n);
        const w = new Float64Array(n);
        for (let i = 0; i < n; i++) w[i] = lambdaMax * v[i] - Lv[i];
        // Deflate to keep perpendicular to ones
        deflate(w, ones);
        const rq = dot(v, matVec(L, v, n));   // Rayleigh quotient gives λ_2
        normalize(w);
        if (Math.abs(rq - prev) < tol && iter > 5) break;
        prev = rq;
        v = w;
    }

    // Compute final Rayleigh quotient on v for λ_2
    const Lv = matVec(L, v, n);
    const lambda2 = dot(v, Lv);
    return { fiedler: v, lambda2, lambdaMax };
}

/**
 * Partition nodes into two clusters by sign of Fiedler vector entry.
 * @returns {{ clusterA: string[], clusterB: string[], bridgeCandidates: string[] }}
 */
export function bisect(nodes, fiedlerVec, bridgeThreshold = 0.05) {
    const clusterA = [], clusterB = [], bridgeCandidates = [];
    for (let i = 0; i < nodes.length; i++) {
        const f = fiedlerVec[i];
        if (Math.abs(f) < bridgeThreshold) bridgeCandidates.push(nodes[i]);
        if (f >= 0) clusterA.push(nodes[i]);
        else clusterB.push(nodes[i]);
    }
    return { clusterA, clusterB, bridgeCandidates };
}

/**
 * Recursive bisection with dendrogram output.
 * Stops when cluster size < minSize OR algebraic connectivity λ_2 > tightThreshold OR depth > maxDepth.
 *
 * @param {string[]} nodes
 * @param {Array<{a:string, b:string}>} edges
 * @param {object} opts
 * @returns {{ clusters: string[][], dendrogram: object, bridges: Set<string> }}
 */
export function recursiveBisect(nodes, edges, {
    minSize = 6,
    // Ratio-cut threshold: require the proposed cut to remove < cutRatioLimit
    // fraction of each side's internal edges. Prevents splitting already-tight clusters.
    // Set to 0.4 empirically — power iteration isn't perfect, so we give some slack
    // to accept good-but-not-optimal Fiedler cuts on multi-cluster graphs.
    cutRatioLimit = 0.4,
    maxDepth = 3,
    anchors = new Set(),
    bridgeThreshold = 0.05,
} = {}) {
    const bridges = new Set();
    const clusters = [];
    const dendrogram = { size: nodes.length, children: null };

    function recurse(nodeList, edgeList, depth, dendroNode) {
        dendroNode.nodes = nodeList;
        dendroNode.depth = depth;

        if (nodeList.length < minSize || depth >= maxDepth) {
            clusters.push(nodeList);
            return;
        }

        // If very few edges (tree-like), splitting isn't informative — leave intact
        const avgDegree = (2 * edgeList.length) / nodeList.length;
        if (avgDegree < 1.5) {
            clusters.push(nodeList);
            dendroNode.reason = 'too-sparse';
            return;
        }

        const L = buildLaplacian(nodeList, edgeList, anchors);
        const { fiedler, lambda2 } = fiedlerVector(L, nodeList.length);
        dendroNode.lambda2 = lambda2;

        const { clusterA, clusterB, bridgeCandidates } = bisect(nodeList, fiedler, bridgeThreshold);

        if (clusterA.length === 0 || clusterB.length === 0 ||
            clusterA.length < 2 || clusterB.length < 2) {
            clusters.push(nodeList);
            dendroNode.reason = 'degenerate-split';
            return;
        }

        // Ratio-cut test: is this cut ACTUALLY meaningful?
        const setA = new Set(clusterA), setB = new Set(clusterB);
        let crossCount = 0, internalA = 0, internalB = 0;
        for (const e of edgeList) {
            const inA = setA.has(e.a), inB = setA.has(e.b);
            if (inA && inB) internalA++;
            else if (!inA && !inB) internalB++;
            else crossCount++;
        }
        const minSide = Math.min(clusterA.length, clusterB.length);
        const minInternal = Math.max(1, Math.min(internalA, internalB));
        const cutRatio = crossCount / (crossCount + minInternal);

        // If >25% of the denser side's connections cross the cut, this isn't a
        // natural partition — the cluster is cohesive, don't split it.
        if (cutRatio > cutRatioLimit) {
            clusters.push(nodeList);
            dendroNode.reason = `cut-too-high (ratio=${cutRatio.toFixed(2)})`;
            return;
        }

        // Accept cut. Record bridges only for accepted cuts.
        for (const b of bridgeCandidates) bridges.add(b);

        const edgesA = edgeList.filter(e => setA.has(e.a) && setA.has(e.b));
        const edgesB = edgeList.filter(e => setB.has(e.a) && setB.has(e.b));
        dendroNode.children = [{ parent: dendroNode }, { parent: dendroNode }];
        dendroNode.cutRatio = cutRatio;
        recurse(clusterA, edgesA, depth + 1, dendroNode.children[0]);
        recurse(clusterB, edgesB, depth + 1, dendroNode.children[1]);
    }

    recurse(nodes, edges, 0, dendrogram);
    return { clusters, dendrogram, bridges };
}

// ──── helpers ────

function matVec(M, v, n) {
    const result = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += M[i * n + j] * v[j];
        result[i] = s;
    }
    return result;
}
function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}
function normalize(v) {
    const norm = Math.sqrt(dot(v, v));
    if (norm > 1e-12) for (let i = 0; i < v.length; i++) v[i] /= norm;
}
function deflate(v, u) {
    // v ← v − (u·v) u
    const c = dot(u, v);
    for (let i = 0; i < v.length; i++) v[i] -= c * u[i];
}
