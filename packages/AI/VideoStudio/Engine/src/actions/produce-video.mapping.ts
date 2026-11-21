/**
 * @module actions/produce-video.mapping
 *
 * Pure input validation and request mapping for the `Produce Video` action.
 * Builds a partial {@link VideoGenerationSpec} and resolves agent configuration
 * presets without touching any engine singletons or database connections.
 */

import { UUIDsEqual } from '@memberjunction/global';
import {
    VIDEO_DATA_FORMAT_KINDS,
    VIDEO_DATA_SHAPES,
    VIDEO_FORMATS,
    type VideoDataBinding,
    type VideoDataFormat,
    type VideoDataFormatKind,
    type VideoDataShape,
    type VideoDataSource,
    type VideoFormat,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';

const VALID_FORMAT_SET: ReadonlySet<string> = new Set<string>(VIDEO_FORMATS);
const VALID_DATA_SHAPE_SET: ReadonlySet<string> = new Set<string>(VIDEO_DATA_SHAPES);
const VALID_DATA_FORMAT_KIND_SET: ReadonlySet<string> = new Set<string>(VIDEO_DATA_FORMAT_KINDS);
const ALLOWED_DATA_REF_KINDS: ReadonlySet<string> = new Set<string>(['Query', 'View', 'Artifact']);

/**
 * Input item in `DataRefs` passed to `Produce Video`.
 * Callers pass data by reference (`Query`, `View`, or `Artifact`); `Inline` is refused.
 */
export interface ProduceVideoDataRefInput {
    Key: string;
    Kind: string;
    QueryID?: string;
    QueryName?: string;
    Parameters?: Record<string, string | number | boolean>;
    EntityName?: string;
    ExtraFilter?: string;
    Fields?: string[];
    ArtifactVersionID?: string;
    Shape: string;
    Format?: {
        Kind: string;
        Currency?: string;
        Decimals?: number;
        Prefix?: string;
        Suffix?: string;
    };
    Label?: string;
}

/**
 * Raw caller input parameters for `BuildProduceVideoRequest`.
 */
export interface ProduceVideoInput {
    Topic?: string | null;
    Archetype?: string | null;
    BrandKit?: string | null;
    Formats?: string | readonly string[] | null;
    DurationSeconds?: number | string | null;
    CompanyID?: string | null;
    PowerLevel?: string | null;
    DataRefs?: readonly ProduceVideoDataRefInput[] | string | null;
    Narration?: boolean | string | null;
}

/**
 * Minimal archetype record shape required by the mapper.
 */
export interface ProduceVideoArchetypeLookup {
    ID: string;
    Name: string;
    Status?: string | null;
    CompanyID?: string | null;
    DefaultFormats?: string | readonly string[] | null;
    DefaultDurationSeconds?: number | null;
    MinDurationSeconds?: number | null;
    MaxDurationSeconds?: number | null;
}

/**
 * Minimal brand kit record shape required by the mapper.
 */
export interface ProduceVideoBrandKitLookup {
    ID: string;
    Name: string;
    Status?: string | null;
    CompanyID?: string | null;
    IsDefault?: boolean | null;
}

/**
 * Minimal preset record shape required by the mapper.
 */
export interface ProduceVideoPresetLookup {
    Name: string;
    DisplayName?: string | null;
    AIConfigurationID?: string | null;
    IsDefault?: boolean | null;
    Status?: string | null;
}

/**
 * Lookup callbacks supplied to `BuildProduceVideoRequest` so unit tests need no engine.
 */
export interface ProduceVideoLookups {
    findArchetype?: (nameOrId: string) => ProduceVideoArchetypeLookup | null | undefined;
    findBrandKit?: (nameOrId: string) => ProduceVideoBrandKitLookup | null | undefined;
    findDefaultBrandKit?: (companyId?: string | null) => ProduceVideoBrandKitLookup | null | undefined;
    findQueryByName?: (name: string) => { ID: string; Name?: string } | string | null | undefined;
    findPreset?: (name: string) => ProduceVideoPresetLookup | null | undefined;
    defaultPreset?: () => ProduceVideoPresetLookup | null | undefined;
    presetNames?: () => readonly string[];
}

export type ProduceVideoMappingErrorCode = 'INVALID_PARAMS' | 'NOT_FOUND';

export interface ProduceVideoMappingError {
    Code: ProduceVideoMappingErrorCode;
    Message: string;
}

export interface ProduceVideoRequestSuccess {
    Message: string;
    Payload: Partial<VideoGenerationSpec>;
    ConfigurationID?: string;
}

export interface ProduceVideoRequestError {
    Error: ProduceVideoMappingError;
}

export type ProduceVideoRequestResult = ProduceVideoRequestSuccess | ProduceVideoRequestError;

/**
 * Validates `Produce Video` action parameters and builds the partial
 * {@link VideoGenerationSpec} payload, user message, and optional `ConfigurationID`.
 */
export function BuildProduceVideoRequest(
    input: ProduceVideoInput,
    lookups: ProduceVideoLookups = {},
): ProduceVideoRequestResult {
    const topic = trimNonEmpty(input.Topic);
    if (!topic) {
        return fail('INVALID_PARAMS', 'Topic is required and must be a non-empty string.');
    }

    const companyId = trimNonEmpty(input.CompanyID);
    const archetypeRes = resolveArchetype(trimNonEmpty(input.Archetype), companyId, lookups);
    if ('Error' in archetypeRes) return archetypeRes;

    const brandKitRes = resolveBrandKit(trimNonEmpty(input.BrandKit), companyId, lookups);
    if ('Error' in brandKitRes) return brandKitRes;

    const formatsRes = resolveFormats(input.Formats, archetypeRes.value);
    if ('Error' in formatsRes) return formatsRes;

    const durationRes = resolveDurationSeconds(input.DurationSeconds, archetypeRes.value);
    if ('Error' in durationRes) return durationRes;

    const presetRes = resolvePowerLevelPreset(trimNonEmpty(input.PowerLevel), lookups);
    if ('Error' in presetRes) return presetRes;

    const dataBindingsRes = resolveDataRefs(input.DataRefs, lookups);
    if ('Error' in dataBindingsRes) return dataBindingsRes;

    const narrationRes = resolveNarrationEnabled(input.Narration);
    if ('Error' in narrationRes) return narrationRes;

    const payload = assemblePartialSpec({
        archetype: archetypeRes.value,
        brandKit: brandKitRes.value,
        companyId,
        formats: formatsRes.value,
        durationSeconds: durationRes.value,
        dataBindings: dataBindingsRes.value,
        narrationEnabled: narrationRes.value,
    });

    return {
        Message: topic,
        Payload: payload,
        ...(presetRes.value ? { ConfigurationID: presetRes.value } : {}),
    };
}

type ValueOrError<T> = { value: T } | ProduceVideoRequestError;

function fail(code: ProduceVideoMappingErrorCode, message: string): ProduceVideoRequestError {
    return { Error: { Code: code, Message: message } };
}

function trimNonEmpty(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function isActiveRecord(status: string | null | undefined): boolean {
    return status == null || status === 'Active';
}

function isCompanyInScope(recordCompanyId: string | null | undefined, callerCompanyId: string | undefined): boolean {
    const trimmedRecordCompany = trimNonEmpty(recordCompanyId);
    if (!trimmedRecordCompany) return true;
    if (!callerCompanyId) return false;
    return UUIDsEqual(trimmedRecordCompany, callerCompanyId);
}

function resolveArchetype(
    archetypeParam: string | undefined,
    companyId: string | undefined,
    lookups: ProduceVideoLookups,
): ValueOrError<ProduceVideoArchetypeLookup | undefined> {
    if (!archetypeParam) return { value: undefined };
    const found = lookups.findArchetype?.(archetypeParam) ?? undefined;
    if (!found || !isActiveRecord(found.Status)) {
        return fail('NOT_FOUND', `Video archetype '${archetypeParam}' was not found or is not Active.`);
    }
    if (!isCompanyInScope(found.CompanyID, companyId)) {
        return fail(
            'INVALID_PARAMS',
            `Video archetype '${found.Name}' is scoped to company '${found.CompanyID}' and cannot be used for CompanyID '${companyId ?? 'none'}'.`,
        );
    }
    return { value: found };
}

function resolveBrandKit(
    brandKitParam: string | undefined,
    companyId: string | undefined,
    lookups: ProduceVideoLookups,
): ValueOrError<ProduceVideoBrandKitLookup | undefined> {
    if (!brandKitParam) {
        const defaultKit = lookups.findDefaultBrandKit?.(companyId ?? null) ?? undefined;
        if (!defaultKit || !isActiveRecord(defaultKit.Status) || !isCompanyInScope(defaultKit.CompanyID, companyId)) {
            return { value: undefined };
        }
        return { value: defaultKit };
    }
    const found = lookups.findBrandKit?.(brandKitParam) ?? undefined;
    if (!found || !isActiveRecord(found.Status)) {
        return fail('NOT_FOUND', `Brand kit '${brandKitParam}' was not found or is not Active.`);
    }
    if (!isCompanyInScope(found.CompanyID, companyId)) {
        return fail(
            'INVALID_PARAMS',
            `Brand kit '${found.Name}' is scoped to company '${found.CompanyID}' and cannot be used for CompanyID '${companyId ?? 'none'}'.`,
        );
    }
    return { value: found };
}

function resolveFormats(
    formatsInput: ProduceVideoInput['Formats'],
    archetype: ProduceVideoArchetypeLookup | undefined,
): ValueOrError<VideoFormat[]> {
    const rawList = parseRawFormatList(formatsInput) ?? parseArchetypeDefaultFormats(archetype) ?? ['16:9'];
    if (rawList.length === 0) {
        return fail('INVALID_PARAMS', `Formats must include at least one valid format (${VIDEO_FORMATS.join(', ')}).`);
    }
    const validated: VideoFormat[] = [];
    for (const item of rawList) {
        const trimmed = item.trim();
        if (!VALID_FORMAT_SET.has(trimmed)) {
            return fail(
                'INVALID_PARAMS',
                `Invalid video format '${trimmed}'. Allowed formats: ${VIDEO_FORMATS.join(', ')}.`,
            );
        }
        if (!validated.includes(trimmed as VideoFormat)) {
            validated.push(trimmed as VideoFormat);
        }
    }
    return { value: validated };
}

function parseRawFormatList(formatsInput: ProduceVideoInput['Formats']): string[] | undefined {
    if (formatsInput == null) return undefined;
    if (Array.isArray(formatsInput)) {
        return formatsInput.map((v) => String(v));
    }
    if (typeof formatsInput === 'string') {
        const trimmed = formatsInput.trim();
        if (trimmed.length === 0) return undefined;
        if (trimmed.startsWith('[')) {
            try {
                const parsed: unknown = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map((v) => String(v));
            } catch {
                // Fall through to comma-split handling.
            }
        }
        return trimmed.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    }
    return undefined;
}

function parseArchetypeDefaultFormats(archetype: ProduceVideoArchetypeLookup | undefined): string[] | undefined {
    if (!archetype) return undefined;
    const fromDefaultFormats = parseRawFormatList(archetype.DefaultFormats);
    return fromDefaultFormats && fromDefaultFormats.length > 0 ? fromDefaultFormats : undefined;
}

function resolveDurationSeconds(
    durationInput: ProduceVideoInput['DurationSeconds'],
    archetype: ProduceVideoArchetypeLookup | undefined,
): ValueOrError<number | undefined> {
    if (durationInput == null || durationInput === '') {
        const defaultDuration = archetype?.DefaultDurationSeconds;
        return {
            value: typeof defaultDuration === 'number' && Number.isFinite(defaultDuration) && defaultDuration > 0
                ? defaultDuration
                : undefined,
        };
    }
    const num = typeof durationInput === 'number' ? durationInput : Number(durationInput);
    if (!Number.isFinite(num) || num <= 0) {
        return fail('INVALID_PARAMS', `DurationSeconds must be a positive number; received '${String(durationInput)}'.`);
    }
    if (archetype) {
        const min = typeof archetype.MinDurationSeconds === 'number' && Number.isFinite(archetype.MinDurationSeconds)
            ? archetype.MinDurationSeconds
            : undefined;
        const max = typeof archetype.MaxDurationSeconds === 'number' && Number.isFinite(archetype.MaxDurationSeconds)
            ? archetype.MaxDurationSeconds
            : undefined;
        if (min !== undefined && max !== undefined && (num < min || num > max)) {
            return fail(
                'INVALID_PARAMS',
                `DurationSeconds (${num}) is outside archetype '${archetype.Name}' allowed range of ${min}-${max} seconds.`,
            );
        }
        if (min !== undefined && num < min) {
            return fail(
                'INVALID_PARAMS',
                `DurationSeconds (${num}) is below archetype '${archetype.Name}' minimum of ${min} seconds.`,
            );
        }
        if (max !== undefined && num > max) {
            return fail(
                'INVALID_PARAMS',
                `DurationSeconds (${num}) exceeds archetype '${archetype.Name}' maximum of ${max} seconds.`,
            );
        }
    }
    return { value: num };
}

function resolvePowerLevelPreset(
    powerLevel: string | undefined,
    lookups: ProduceVideoLookups,
): ValueOrError<string | undefined> {
    if (!powerLevel) {
        const defaultPreset = lookups.defaultPreset?.() ?? undefined;
        return { value: trimNonEmpty(defaultPreset?.AIConfigurationID) };
    }

    const matched = lookups.findPreset?.(powerLevel) ?? undefined;
    if (!matched) {
        const availableNames = (lookups.presetNames?.() ?? [])
            .map((n) => n.trim())
            .filter((n) => n.length > 0);
        const availableLabel = availableNames.length > 0 ? availableNames.join(', ') : 'none';
        return fail(
            'INVALID_PARAMS',
            `Unknown PowerLevel '${powerLevel}'. Available presets: ${availableLabel}.`,
        );
    }
    return { value: trimNonEmpty(matched.AIConfigurationID) };
}

function resolveDataRefs(
    dataRefsInput: ProduceVideoInput['DataRefs'],
    lookups: ProduceVideoLookups,
): ValueOrError<VideoDataBinding[] | undefined> {
    const parsedRefs = parseDataRefsInput(dataRefsInput);
    if ('Error' in parsedRefs) return parsedRefs;
    if (!parsedRefs.value || parsedRefs.value.length === 0) return { value: undefined };

    const bindings: VideoDataBinding[] = [];
    for (let i = 0; i < parsedRefs.value.length; i++) {
        const mapped = mapSingleDataRef(parsedRefs.value[i], i, lookups);
        if ('Error' in mapped) return mapped;
        bindings.push(mapped.value);
    }
    return { value: bindings };
}

function parseDataRefsInput(
    dataRefsInput: ProduceVideoInput['DataRefs'],
): ValueOrError<readonly ProduceVideoDataRefInput[] | undefined> {
    if (dataRefsInput == null || dataRefsInput === '') return { value: undefined };
    if (Array.isArray(dataRefsInput)) return { value: dataRefsInput };
    if (typeof dataRefsInput === 'string') {
        try {
            const parsed: unknown = JSON.parse(dataRefsInput);
            if (Array.isArray(parsed)) return { value: parsed as ProduceVideoDataRefInput[] };
        } catch {
            return fail('INVALID_PARAMS', 'DataRefs must be an array or a valid JSON array string.');
        }
    }
    return fail('INVALID_PARAMS', 'DataRefs must be an array of data reference objects.');
}

function mapSingleDataRef(
    ref: ProduceVideoDataRefInput,
    index: number,
    lookups: ProduceVideoLookups,
): ValueOrError<VideoDataBinding> {
    if (!ref || typeof ref !== 'object') {
        return fail('INVALID_PARAMS', `DataRefs[${index}] must be an object.`);
    }
    const key = trimNonEmpty(ref.Key);
    if (!key) {
        return fail('INVALID_PARAMS', `DataRefs[${index}].Key is required.`);
    }
    const shape = trimNonEmpty(ref.Shape);
    if (!shape || !VALID_DATA_SHAPE_SET.has(shape)) {
        return fail(
            'INVALID_PARAMS',
            `DataRefs[${index}].Shape '${String(ref.Shape)}' is invalid. Allowed shapes: ${VIDEO_DATA_SHAPES.join(', ')}.`,
        );
    }
    const sourceRes = mapDataRefSource(ref, index, lookups);
    if ('Error' in sourceRes) return sourceRes;

    const formatRes = mapDataRefFormat(ref.Format, index);
    if ('Error' in formatRes) return formatRes;

    const label = trimNonEmpty(ref.Label);
    return {
        value: {
            Key: key,
            Source: sourceRes.value,
            Shape: shape as VideoDataShape,
            ...(formatRes.value ? { Format: formatRes.value } : {}),
            ...(label ? { Label: label } : {}),
        },
    };
}

function mapDataRefSource(
    ref: ProduceVideoDataRefInput,
    index: number,
    lookups: ProduceVideoLookups,
): ValueOrError<VideoDataSource> {
    const kind = trimNonEmpty(ref.Kind);
    if (kind === 'Inline') {
        return fail(
            'INVALID_PARAMS',
            `DataRefs[${index}].Kind 'Inline' is not allowed in Produce Video; pass data by reference (Query, View, or Artifact).`,
        );
    }
    if (!kind || !ALLOWED_DATA_REF_KINDS.has(kind)) {
        return fail(
            'INVALID_PARAMS',
            `DataRefs[${index}].Kind '${String(ref.Kind)}' is invalid. Allowed kinds: Query, View, Artifact.`,
        );
    }
    if (kind === 'Query') return mapQueryDataSource(ref, index, lookups);
    if (kind === 'View') return mapViewDataSource(ref, index);
    return mapArtifactDataSource(ref, index);
}

function mapQueryDataSource(
    ref: ProduceVideoDataRefInput,
    index: number,
    lookups: ProduceVideoLookups,
): ValueOrError<VideoDataSource> {
    const explicitId = trimNonEmpty(ref.QueryID);
    if (explicitId) {
        return {
            value: {
                Kind: 'Query',
                QueryID: explicitId,
                ...(ref.Parameters ? { Parameters: ref.Parameters } : {}),
            },
        };
    }
    const queryName = trimNonEmpty(ref.QueryName);
    if (!queryName) {
        return fail('INVALID_PARAMS', `DataRefs[${index}] with Kind 'Query' requires either QueryID or QueryName.`);
    }
    const resolved = lookups.findQueryByName?.(queryName);
    const resolvedId = typeof resolved === 'string' ? trimNonEmpty(resolved) : trimNonEmpty(resolved?.ID);
    if (!resolvedId) {
        return fail('NOT_FOUND', `Query '${queryName}' in DataRefs[${index}] was not found.`);
    }
    return {
        value: {
            Kind: 'Query',
            QueryID: resolvedId,
            ...(ref.Parameters ? { Parameters: ref.Parameters } : {}),
        },
    };
}

function mapViewDataSource(
    ref: ProduceVideoDataRefInput,
    index: number,
): ValueOrError<VideoDataSource> {
    const entityName = trimNonEmpty(ref.EntityName);
    if (!entityName) {
        return fail('INVALID_PARAMS', `DataRefs[${index}] with Kind 'View' requires EntityName.`);
    }
    const extraFilter = trimNonEmpty(ref.ExtraFilter);
    return {
        value: {
            Kind: 'View',
            EntityName: entityName,
            ...(extraFilter ? { ExtraFilter: extraFilter } : {}),
            ...(Array.isArray(ref.Fields) && ref.Fields.length > 0 ? { Fields: ref.Fields } : {}),
        },
    };
}

function mapArtifactDataSource(
    ref: ProduceVideoDataRefInput,
    index: number,
): ValueOrError<VideoDataSource> {
    const artifactVersionId = trimNonEmpty(ref.ArtifactVersionID);
    if (!artifactVersionId) {
        return fail('INVALID_PARAMS', `DataRefs[${index}] with Kind 'Artifact' requires ArtifactVersionID.`);
    }
    return {
        value: {
            Kind: 'Artifact',
            ArtifactVersionID: artifactVersionId,
        },
    };
}

function mapDataRefFormat(
    format: ProduceVideoDataRefInput['Format'],
    index: number,
): ValueOrError<VideoDataFormat | undefined> {
    if (!format) return { value: undefined };
    const kind = trimNonEmpty(format.Kind);
    if (!kind || !VALID_DATA_FORMAT_KIND_SET.has(kind)) {
        return fail(
            'INVALID_PARAMS',
            `DataRefs[${index}].Format.Kind '${String(format.Kind)}' is invalid. Allowed format kinds: ${VIDEO_DATA_FORMAT_KINDS.join(', ')}.`,
        );
    }
    return {
        value: {
            Kind: kind as VideoDataFormatKind,
            ...(format.Currency !== undefined ? { Currency: format.Currency } : {}),
            ...(format.Decimals !== undefined ? { Decimals: format.Decimals } : {}),
            ...(format.Prefix !== undefined ? { Prefix: format.Prefix } : {}),
            ...(format.Suffix !== undefined ? { Suffix: format.Suffix } : {}),
        },
    };
}

function resolveNarrationEnabled(
    raw: boolean | string | null | undefined,
): ValueOrError<boolean | undefined> {
    if (raw === undefined || raw === null) {
        return { value: undefined };
    }
    if (typeof raw === 'boolean') {
        return { value: raw };
    }
    if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (!normalized) return { value: undefined };
        if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
            return { value: true };
        }
        if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off' || normalized === 'none') {
            return { value: false };
        }
    }
    return fail('INVALID_PARAMS', `Narration '${String(raw)}' must be a boolean ('true' or 'false').`);
}

interface AssemblePartialSpecInput {
    archetype: ProduceVideoArchetypeLookup | undefined;
    brandKit: ProduceVideoBrandKitLookup | undefined;
    companyId: string | undefined;
    formats: VideoFormat[];
    durationSeconds: number | undefined;
    dataBindings: VideoDataBinding[] | undefined;
    narrationEnabled?: boolean;
}

function assemblePartialSpec(parts: AssemblePartialSpecInput): Partial<VideoGenerationSpec> {
    const film: Partial<VideoGenerationSpec['Film']> = {
        Formats: parts.formats,
        ...(parts.durationSeconds !== undefined ? { DurationSeconds: parts.durationSeconds } : {}),
    };
    const deliverables: Partial<VideoGenerationSpec['Deliverables']> = {
        Formats: parts.formats,
    };
    const interaction: Partial<VideoGenerationSpec['Interaction']> = {
        Mode: 'Autonomous',
    };
    const audio: VideoGenerationSpec['Audio'] | undefined =
        parts.narrationEnabled !== undefined
            ? {
                  Narration: {
                      Enabled: parts.narrationEnabled,
                      VoiceID: '',
                      Provider: '',
                      Script: [],
                  },
                  Cues: [],
                  Captions: parts.narrationEnabled ? 'Burned' : 'None',
              }
            : undefined;

    return {
        ...(parts.archetype
            ? { Archetype: { ArchetypeID: parts.archetype.ID, Name: parts.archetype.Name } }
            : {}),
        ...(parts.brandKit ? { BrandKitID: parts.brandKit.ID } : {}),
        ...(parts.companyId ? { CompanyID: parts.companyId } : {}),
        Film: film as VideoGenerationSpec['Film'],
        Deliverables: deliverables as VideoGenerationSpec['Deliverables'],
        ...(parts.dataBindings ? { DataBindings: parts.dataBindings } : {}),
        ...(audio ? { Audio: audio } : {}),
        Interaction: interaction as VideoGenerationSpec['Interaction'],
    };
}

