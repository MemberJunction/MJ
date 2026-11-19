import { GetGlobalObjectStore } from '@memberjunction/global';
import {
    LogWarning,
    RunQuery,
    type IMetadataProvider,
    type IRunQueryProvider,
    type RunQueryParams,
    type RunQueryResult,
    type UserInfo,
} from '@memberjunction/core';
import { QueryEngine } from '../engines/QueryEngine';
import type { MJQueryEntityExtended } from './MJQueryEntityExtended';

/**
 * Behavior when a {@link TypedQuery}'s codegen-time signature differs from the live
 * query metadata in `QueryEngine` at runtime.
 *
 * - `'warn'` (default): log a warning once per query per process, then execute the query.
 * - `'throw'`: throw a {@link TypedQueryDriftError} before executing the query (useful in CI and tests).
 */
export type TypedQueryDriftMode = 'warn' | 'throw';

/**
 * Minimal structural shape for a Zod-compatible row schema passed to {@link DefineTypedQuery}.
 */
export interface TypedQueryRowValidator<TRow = Record<string, unknown>> {
    safeParse(data: unknown): {
        success: boolean;
        data?: Partial<TRow> | Record<string, unknown>;
        error?: { message?: string };
    };
}

/**
 * Metadata definition passed to {@link DefineTypedQuery}.
 */
export interface TypedQueryDefinition<TRow = Record<string, unknown>> {
    /** Unique identifier of the saved query (`__mj.Query.ID`). */
    QueryID: string;
    /** Full category path + query name (e.g. `'Sales/Reports/Orders By Region'`). */
    Path: string;
    /** Deterministic `sha256:<hex>` signature of the query's parameters and output fields at CodeGen time. */
    Signature: string;
    /** Optional Zod row validator used when `MJ_TYPED_QUERY_VALIDATE=1` or row validation is enabled. */
    RowSchema?: TypedQueryRowValidator<TRow>;
}

/**
 * Input shape for computing a parameter's contribution to {@link ComputeTypedQuerySignature}.
 * Compatible with `MJQueryParameterEntity`.
 */
export interface TypedQuerySignatureParamInput {
    Name: string;
    Type?: string | null;
    IsRequired?: boolean | null;
    DefaultValue?: string | null;
    IsServerSet?: boolean | null;
}

/**
 * Input shape for computing an output field's contribution to {@link ComputeTypedQuerySignature}.
 * Compatible with `MJQueryFieldEntity`.
 */
export interface TypedQuerySignatureFieldInput {
    Name: string;
    SQLBaseType?: string | null;
    InAllBranchVariants?: boolean | null;
}

/**
 * Input shape for {@link ComputeTypedQuerySignature}. Build it from a query with
 * {@link TypedQuerySignatureSourceFor}.
 */
export interface TypedQuerySignatureSource {
    Parameters?: ReadonlyArray<TypedQuerySignatureParamInput> | null;
    Fields?: ReadonlyArray<TypedQuerySignatureFieldInput> | null;
}

/**
 * Execution options passed as the second argument to {@link TypedQuery.Run}.
 * Includes every {@link RunQueryParams} pass-through option (except `QueryID`, `QueryName`, `SQL`, and `Parameters`)
 * plus optional `contextUser`, `provider`, and per-call `driftMode`.
 */
export interface TypedQueryRunOptions
    extends Omit<RunQueryParams, 'QueryID' | 'QueryName' | 'CategoryPath' | 'CategoryID' | 'SQL' | 'Parameters'> {
    /** User context for permissions, row-level security, and field-level security (required on the server). */
    contextUser?: UserInfo;
    /** Optional explicit query provider (`IRunQueryProvider`) to execute against instead of the global provider. */
    provider?: IRunQueryProvider;
    /** Optional metadata provider whose connection's `QueryEngine` supplies the live query for signature drift detection. */
    metadataProvider?: IMetadataProvider;
    /** Optional per-call override for signature drift handling (`'warn' | 'throw'`). */
    driftMode?: TypedQueryDriftMode;
    /** Maximum number of returned rows to validate against `RowSchema` when validation is enabled (default: 10). */
    validateMaxRows?: number;
}

/**
 * Strongly-typed {@link RunQueryResult} whose `Results` array is typed as `TRow[]`.
 */
export type TypedQueryResult<TRow> = Omit<RunQueryResult, 'Results'> & {
    Results: TRow[];
};

/**
 * Error thrown when a {@link TypedQuery}'s codegen-time signature differs from the live
 * query metadata in `QueryEngine` and the active drift mode is `'throw'`.
 */
export class TypedQueryDriftError extends Error {
    public readonly QueryID: string;
    public readonly Path: string;
    public readonly ExpectedSignature: string;
    public readonly ActualSignature: string;

    constructor(queryId: string, path: string, expectedSignature: string, actualSignature: string) {
        super(
            `TypedQuery signature drift detected for '${path}' (QueryID: ${queryId}): ` +
                `generated wrapper expects '${expectedSignature}', but live query metadata has '${actualSignature}'. ` +
                `Re-run CodeGen to update the generated query wrapper.`,
        );
        this.name = 'TypedQueryDriftError';
        this.QueryID = queryId;
        this.Path = path;
        this.ExpectedSignature = expectedSignature;
        this.ActualSignature = actualSignature;
    }
}

interface TypedQueryGlobalState {
    driftMode: TypedQueryDriftMode;
    warnedQueryIds: Set<string>;
    validateRows: boolean | null;
}

const GLOBAL_STATE_KEY = '___MJ_TYPED_QUERY_STATE___';

function getGlobalTypedQueryState(): TypedQueryGlobalState {
    const store = GetGlobalObjectStore();
    if (!store) {
        return { driftMode: 'warn', warnedQueryIds: new Set<string>(), validateRows: null };
    }
    let state = store[GLOBAL_STATE_KEY] as TypedQueryGlobalState | undefined;
    if (!state) {
        state = {
            driftMode: 'warn',
            warnedQueryIds: new Set<string>(),
            validateRows: null,
        };
        store[GLOBAL_STATE_KEY] = state;
    }
    return state;
}

/**
 * Sets the process-wide drift mode for {@link TypedQuery.Run} when a generated query wrapper's
 * signature differs from the live query metadata in `QueryEngine` (`'warn'` by default; `'throw'` in strict CI/test environments).
 */
export function SetTypedQueryDriftMode(mode: TypedQueryDriftMode): void {
    getGlobalTypedQueryState().driftMode = mode;
}

/**
 * Returns the process-wide drift mode for {@link TypedQuery.Run}.
 */
export function GetTypedQueryDriftMode(): TypedQueryDriftMode {
    return getGlobalTypedQueryState().driftMode;
}

/**
 * Clears the per-process set of queries that have already logged a signature-drift warning.
 * Primarily intended for unit tests.
 */
export function ResetTypedQueryDriftWarnings(): void {
    getGlobalTypedQueryState().warnedQueryIds.clear();
}

/**
 * Explicitly enables or disables runtime row validation against generated Zod `RowSchema` validators.
 * Pass `null` to restore the default environment check (`MJ_TYPED_QUERY_VALIDATE=1`).
 */
export function SetTypedQueryRowValidation(enabled: boolean | null): void {
    getGlobalTypedQueryState().validateRows = enabled;
}

function isRowValidationEnabled(): boolean {
    const state = getGlobalTypedQueryState();
    if (state.validateRows !== null) {
        return state.validateRows;
    }
    const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
    return g.process?.env?.['MJ_TYPED_QUERY_VALIDATE'] === '1';
}

/**
 * The signature input for a saved query: its parameter and output-field definitions, as
 * {@link ComputeTypedQuerySignature} reads them. CodeGen and the runtime drift check both build it
 * this way, so they hash the same thing.
 */
export function TypedQuerySignatureSourceFor(query: MJQueryEntityExtended): TypedQuerySignatureSource {
    return { Parameters: query.QueryParameters, Fields: query.QueryFields };
}

/**
 * Computes the canonical `sha256:<hex>` signature for a query's caller-visible parameters
 * and output fields.
 *
 * Shared between CodeGen (`typed_query_codegen.ts`) and runtime (`TypedQuery.Run()`).
 * Uses a pure TypeScript SHA-256 implementation so it executes synchronously and identically
 * in both Node.js and browser environments.
 */
export function ComputeTypedQuerySignature(source: TypedQuerySignatureSource): string {
    const params = (source.Parameters ?? [])
        .filter((p) => p != null && !p.IsServerSet && typeof p.Name === 'string' && p.Name.trim().length > 0)
        .map((p) => {
            const name = p.Name.trim();
            const type = normalizeSignatureParamType(p.Type);
            const hasDefault = p.DefaultValue != null && String(p.DefaultValue).trim().length > 0;
            const required = Boolean(p.IsRequired) && !hasDefault;
            return {
                sortKey: name.toLowerCase(),
                entry: `${name}:${type}:${required ? '1' : '0'}`,
            };
        })
        .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
        .map((p) => p.entry);

    const fields = (source.Fields ?? [])
        .filter((f) => f != null && typeof f.Name === 'string' && f.Name.trim().length > 0)
        .map((f) => {
            const name = f.Name.trim();
            const sqlType = normalizeSignatureFieldType(f.SQLBaseType);
            const inAllBranches = f.InAllBranchVariants !== false;
            return {
                sortKey: name.toLowerCase(),
                entry: `${name}:${sqlType}:${inAllBranches ? '1' : '0'}`,
            };
        })
        .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0))
        .map((f) => f.entry);

    const payload = `params=[${params.join(',')}];fields=[${fields.join(',')}]`;
    return `sha256:${sha256Hex(payload)}`;
}

function normalizeSignatureParamType(rawType: string | null | undefined): string {
    const cleaned = (rawType ?? 'unknown').trim().toLowerCase();
    if (!cleaned) return 'unknown';
    return cleaned;
}

function normalizeSignatureFieldType(rawSqlType: string | null | undefined): string {
    const raw = rawSqlType ?? '';
    const parenIdx = raw.indexOf('(');
    const cleaned = (parenIdx >= 0 ? raw.slice(0, parenIdx) : raw).trim().toLowerCase();
    return cleaned || 'unknown';
}

/**
 * Strongly-typed wrapper around a reusable, approved MemberJunction query (`MJ: Queries`).
 *
 * Constructed via {@link DefineTypedQuery}. Executes through {@link RunQuery}, preserving all
 * caching, paging, enrichment, audit logging, and permission/FLS enforcement of untyped queries.
 */
export class TypedQuery<
    TParams extends object = Record<string, never>,
    TRow = Record<string, unknown>,
> {
    public readonly QueryID: string;
    public readonly Path: string;
    public readonly Signature: string;
    public readonly RowSchema?: TypedQueryRowValidator<TRow>;

    constructor(definition: TypedQueryDefinition<TRow>) {
        this.QueryID = definition.QueryID;
        this.Path = definition.Path;
        this.Signature = definition.Signature;
        this.RowSchema = definition.RowSchema;
    }

    /**
     * Executes the query with compile-time-checked parameters and returns a {@link TypedQueryResult}
     * whose `Results` array is typed as `TRow[]`.
     */
    public async Run(
        ...args: {} extends TParams
            ? [params?: TParams, options?: TypedQueryRunOptions]
            : [params: TParams, options?: TypedQueryRunOptions]
    ): Promise<TypedQueryResult<TRow>> {
        const [params, options] = args;
        this.checkSignatureDrift(options);

        const {
            contextUser,
            provider,
            metadataProvider: _metadataProvider,
            driftMode: _driftMode,
            validateMaxRows,
            ...passThroughOptions
        } = options ?? {};

        const runParams: RunQueryParams = {
            ...passThroughOptions,
            QueryID: this.QueryID,
            Parameters: (params ?? {}) as Record<string, unknown>,
        };

        const rq = new RunQuery(provider ?? null);
        const rawResult = await rq.RunQuery(runParams, contextUser);
        const typedResult = rawResult as unknown as TypedQueryResult<TRow>;

        if (typedResult?.Success && Array.isArray(typedResult.Results) && this.RowSchema && isRowValidationEnabled()) {
            const limit = Math.min(typedResult.Results.length, validateMaxRows ?? 10);
            for (let i = 0; i < limit; i++) {
                const parsed = this.RowSchema.safeParse(typedResult.Results[i]);
                if (!parsed.success) {
                    LogWarning(
                        `TypedQuery row validation warning for '${this.Path}' (row ${i}): ${parsed.error?.message ?? 'schema mismatch'}`,
                    );
                    break;
                }
            }
        }

        return typedResult;
    }

    private checkSignatureDrift(options?: TypedQueryRunOptions): void {
        if (!this.Signature) return;
        const liveQuery = this.resolveLiveQuery(options?.metadataProvider);
        if (!liveQuery) return;

        const actualSignature = ComputeTypedQuerySignature(TypedQuerySignatureSourceFor(liveQuery));
        if (actualSignature === this.Signature) {
            return;
        }

        const state = getGlobalTypedQueryState();
        const mode = options?.driftMode ?? state.driftMode;
        if (mode === 'throw') {
            throw new TypedQueryDriftError(this.QueryID, this.Path, this.Signature, actualSignature);
        }

        const normalizedId = this.QueryID.trim().toLowerCase();
        if (!state.warnedQueryIds.has(normalizedId)) {
            state.warnedQueryIds.add(normalizedId);
            LogWarning(
                `TypedQuery signature drift detected for '${this.Path}' (QueryID: ${this.QueryID}): ` +
                    `expected ${this.Signature}, found ${actualSignature}. Re-run CodeGen to synchronize generated query types.`,
            );
        }
    }

    /**
     * The live query from `QueryEngine` — the engine bound to `explicitProvider`'s connection when
     * one is given, otherwise the global one. Undefined when the engine does not hold the query (not
     * loaded yet, or the query is unknown), which skips the drift check.
     */
    private resolveLiveQuery(explicitProvider?: IMetadataProvider): MJQueryEntityExtended | undefined {
        const engine = explicitProvider
            ? (QueryEngine.GetProviderInstance(explicitProvider, QueryEngine) as QueryEngine)
            : QueryEngine.Instance;
        return engine.FindQueryByID(this.QueryID);
    }
}

/**
 * Factory helper emitted by CodeGen to create a {@link TypedQuery} instance with bound parameter
 * and result row types.
 */
export function DefineTypedQuery<
    TParams extends object = Record<string, never>,
    TRow = Record<string, unknown>,
>(definition: TypedQueryDefinition<TRow>): TypedQuery<TParams, TRow> {
    return new TypedQuery<TParams, TRow>(definition);
}

// ============================================================================
// Pure TypeScript synchronous SHA-256 (UTF-8 input → lowercase hex digest)
// ============================================================================

const SHA256_K: ReadonlyArray<number> = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(n: number, x: number): number {
    return (x >>> n) | (x << (32 - n));
}

function utf8Bytes(str: string): number[] {
    return Array.from(new TextEncoder().encode(str));
}

function sha256Hex(asciiOrUtf8: string): string {
    const bytes = utf8Bytes(asciiOrUtf8);
    const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
    const bitLenLo = (bytes.length * 8) >>> 0;

    bytes.push(0x80);
    while (bytes.length % 64 !== 56) {
        bytes.push(0);
    }
    bytes.push(
        (bitLenHi >>> 24) & 0xff,
        (bitLenHi >>> 16) & 0xff,
        (bitLenHi >>> 8) & 0xff,
        bitLenHi & 0xff,
        (bitLenLo >>> 24) & 0xff,
        (bitLenLo >>> 16) & 0xff,
        (bitLenLo >>> 8) & 0xff,
        bitLenLo & 0xff,
    );

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    const w = new Array<number>(64);

    for (let offset = 0; offset < bytes.length; offset += 64) {
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4;
            w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
        }
        for (let i = 16; i < 64; i++) {
            const s0 = (rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3)) >>> 0;
            const s1 = (rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10)) >>> 0;
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        let f = h5;
        let g = h6;
        let h = h7;

        for (let i = 0; i < 64; i++) {
            const S1 = (rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)) >>> 0;
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const S0 = (rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)) >>> 0;
            const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const temp2 = (S0 + maj) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    const toHex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
    return `${toHex(h0)}${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}${toHex(h5)}${toHex(h6)}${toHex(h7)}`;
}
