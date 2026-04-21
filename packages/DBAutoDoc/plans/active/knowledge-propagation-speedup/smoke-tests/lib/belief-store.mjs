// Bayesian BeliefStore — revived from the earlier session's failed attempt.
//
// Why it failed before: no LLM output was routed as evidence. Beliefs starved.
// Why it can work now: the new architecture (P1 DistilledSummary + delta-P2)
// emits STRUCTURED evidence that this layer can consume.
//
// Log-odds updates: belief in a proposition (e.g., "table X has purpose Y")
// accumulates evidence from P1 and P2 outputs. When confidence > threshold,
// table is "locked" — we can skip its LLM call in subsequent passes.
//
// The big speedup lever: on repeat runs, cached beliefs mean most tables
// skip LLM entirely. First-run cost is amortized.

const SIGMOID = x => 1 / (1 + Math.exp(-x));
const LOGIT = p => Math.log(p / (1 - p));

/**
 * A belief about a proposition (table purpose, PK identity, etc.)
 * Stored in log-odds space for numerical stability + easy additive updates.
 */
class Belief {
    /**
     * @param {string} id - unique proposition identifier
     * @param {number} priorLogOdds - initial log-odds (0 = uniform prior)
     */
    constructor(id, priorLogOdds = 0) {
        this.id = id;
        this.logOdds = priorLogOdds;
        this.evidenceCount = 0;
        this.history = [];
    }

    /** Apply evidence with a given log-likelihood-ratio (LLR). */
    update(llr, source) {
        this.logOdds += llr;
        this.evidenceCount++;
        this.history.push({ llr, source, newLogOdds: this.logOdds, at: Date.now() });
    }

    /** Current probability in [0,1]. */
    probability() { return SIGMOID(this.logOdds); }

    /** Confident if probability > threshold AND at least 2 pieces of evidence. */
    isConfident(threshold = 0.9, minEvidence = 2) {
        return this.probability() >= threshold && this.evidenceCount >= minEvidence;
    }
}

export class BeliefStore {
    constructor() {
        this.beliefs = new Map();   // id -> Belief
    }

    /** Get or create a belief for a proposition. */
    get(id, priorProb = 0.5) {
        if (!this.beliefs.has(id)) {
            this.beliefs.set(id, new Belief(id, LOGIT(priorProb)));
        }
        return this.beliefs.get(id);
    }

    /** Shorthand: apply evidence to belief `id`. */
    update(id, llr, source = 'unknown') {
        this.get(id).update(llr, source);
    }

    /**
     * Consume a P1 output (DistilledSummary-like) as evidence about a table.
     * - LLM confidence 0.8+ on purpose/PK → strong positive evidence (+3 LLR)
     * - LLM confidence 0.5-0.8 → weak positive (+1 LLR)
     * - LLM confidence <0.5 → neutral or slightly negative
     */
    consumeP1(tableName, p1Output) {
        const conf = p1Output.confidence ?? 0.8;
        const llr = conf > 0.8 ? 3 : conf > 0.5 ? 1 : -0.5;
        if (p1Output.tableDescription) this.update(`${tableName}:has_description`, llr, 'P1');
        if (p1Output.primaryKey?.columns?.length > 0) {
            const pk = p1Output.primaryKey.columns.join(',');
            this.update(`${tableName}:pk=${pk}`, llr, 'P1');
        }
        for (const fk of p1Output.foreignKeys || []) {
            const fkId = `${tableName}:fk:${fk.columnName}=>${fk.referencesTable}.${fk.referencesColumn}`;
            const fkConf = fk.confidence ?? conf;
            this.update(fkId, fkConf > 0.8 ? 3 : 1, 'P1.fk');
        }
    }

    /**
     * Consume a delta-P2 output (C5 DeltaRefinement) as evidence.
     * Empty delta = weak positive evidence that beliefs are settled.
     * Non-empty delta = ancestor-usage evidence for THIS table.
     */
    consumeDeltaP2(tableName, delta) {
        if (!delta.add) {
            // Settled — mildly reinforces description belief
            this.update(`${tableName}:has_description`, 0.5, 'P2.null-delta');
            return;
        }
        // Delta adds role/usage info — reinforces description belief
        this.update(`${tableName}:has_description`, 2, 'P2.delta');
        this.update(`${tableName}:descendants_known`, 2, 'P2.delta');
    }

    /**
     * Can this table be skipped in the next iteration? Yes if all its
     * critical beliefs are confident AND nothing new has arrived since
     * last analysis.
     */
    canSkip(tableName, { threshold = 0.9, minEvidence = 2 } = {}) {
        const critical = [`${tableName}:has_description`, `${tableName}:descendants_known`];
        for (const id of critical) {
            const b = this.beliefs.get(id);
            if (!b) return false;
            if (!b.isConfident(threshold, minEvidence)) return false;
        }
        return true;
    }

    /**
     * Diffusion-style propagation: when a table's belief fires high,
     * propagate weak positive evidence to connected tables' description
     * beliefs. Very light-weight — just one neighborhood hop.
     * (This is the light version of the full Laplacian diffusion; sufficient
     *  for the "nodes with consistent high-conf neighbors → locked" rule.)
     */
    diffuse(graph, strength = 0.3) {
        const updates = [];
        for (const [id, belief] of this.beliefs) {
            if (!id.endsWith(':has_description')) continue;
            if (!belief.isConfident(0.95, 3)) continue;
            const table = id.split(':')[0];
            const neighbors = [
                ...(graph.outgoing.get(table) ?? []),
                ...(graph.incoming.get(table) ?? []),
            ];
            for (const nbr of neighbors) {
                updates.push({ id: `${nbr}:has_description`, llr: strength, source: `diffuse:${table}` });
            }
        }
        for (const u of updates) this.update(u.id, u.llr, u.source);
        return updates.length;
    }

    /** Summary for reporting. */
    summary() {
        const byPrefix = new Map();
        for (const [id, b] of this.beliefs) {
            const prefix = id.split(':').slice(1).join(':').split('=')[0].split('/')[0];
            if (!byPrefix.has(prefix)) byPrefix.set(prefix, { count: 0, confident: 0, avgProb: 0 });
            const slot = byPrefix.get(prefix);
            slot.count++;
            slot.avgProb += b.probability();
            if (b.isConfident()) slot.confident++;
        }
        for (const [, slot] of byPrefix) slot.avgProb /= slot.count;
        return Object.fromEntries(byPrefix);
    }

    /** Serialize for persistence across runs. */
    serialize() {
        const out = {};
        for (const [id, b] of this.beliefs) {
            out[id] = { logOdds: b.logOdds, evidenceCount: b.evidenceCount };
        }
        return out;
    }

    /** Restore from serialized. */
    static deserialize(data) {
        const store = new BeliefStore();
        for (const [id, v] of Object.entries(data)) {
            const b = new Belief(id, v.logOdds);
            b.evidenceCount = v.evidenceCount;
            store.beliefs.set(id, b);
        }
        return store;
    }
}
