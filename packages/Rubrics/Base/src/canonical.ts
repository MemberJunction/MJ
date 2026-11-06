import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricVersionSnapshot } from './types.js';

/**
 * Orders strings by Unicode code point. A locale sort would place ä with a
 * on some machines and after z on others, so two publishes of the same rubric
 * would not share a hash.
 */
export function CompareCodePoints(left: string, right: string): number {
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
        const leftPoint = left.codePointAt(leftIndex) ?? 0;
        const rightPoint = right.codePointAt(rightIndex) ?? 0;
        if (leftPoint !== rightPoint) return leftPoint - rightPoint;
        leftIndex += leftPoint > 0xffff ? 2 : 1;
        rightIndex += rightPoint > 0xffff ? 2 : 1;
    }
    if (leftIndex < left.length) return 1;
    if (rightIndex < right.length) return -1;
    return 0;
}

/** Fixed-precision decimal so 0.1 and 0.1000000 hash the same. */
export function CanonicalNumber(value: number): string {
    return value.toFixed(6);
}

function parentKey(version: RubricVersionSnapshot, node: RubricNodeSnapshot): string | null {
    if (!node.parentId) return null;
    return version.nodes.find(item => item.id === node.parentId)?.key ?? null;
}

function scaleSignature(scale: RubricScaleSnapshot | undefined): unknown {
    if (!scale) return null;
    return {
        higherIsBetter: scale.higherIsBetter,
        maxValue: scale.maxValue ?? null,
        minValue: scale.minValue ?? null,
        scaleType: scale.scaleType,
        step: scale.step ?? null,
        levels: [...scale.levels]
            .sort((a, b) => a.sequence - b.sequence || a.normalizedValue - b.normalizedValue)
            .map(level => ({
                id: level.id,
                normalizedValue: CanonicalNumber(level.normalizedValue),
                value: CanonicalNumber(level.value),
            })),
    };
}

/**
 * Major-row properties plus scale levels, for non-advisory nodes only.
 * Equal projections mean identical scores from identical answers. Adding or
 * editing an advisory node does not change it. Wording, thresholds, and bands do not.
 */
export function ScoringProjection(version: RubricVersionSnapshot): unknown {
    const scales = new Map(version.scales.map(scale => [scale.id, scale]));
    const nodes = version.nodes
        .filter(node => !node.isAdvisory)
        .sort((a, b) => CompareCodePoints(a.key, b.key))
        .map(node => ({
            evaluatorConfig: node.evaluatorConfig ?? null,
            gateMinimumScore: node.gateMinimumScore ?? null,
            isGate: node.isGate,
            key: node.key,
            nodeType: node.nodeType,
            notApplicablePolicy: node.notApplicablePolicy ?? null,
            parentKey: parentKey(version, node),
            rollupMethod: node.rollupMethod ?? null,
            scale: scaleSignature(node.scaleId ? scales.get(node.scaleId) : undefined),
            weight: CanonicalNumber(node.weight),
        }));
    return {
        nodes,
        notApplicablePolicy: version.notApplicablePolicy,
    };
}

/** Everything, including wording. Nodes sorted by key, properties sorted by the JSON serializer below. */
export function ContentProjection(version: RubricVersionSnapshot): unknown {
    const scales = new Map(version.scales.map(scale => [scale.id, scale]));
    return {
        bands: [...version.bands]
            .sort((a, b) => a.sequence - b.sequence || CompareCodePoints(a.label, b.label))
            .map(band => ({
                description: band.description ?? null,
                displayTone: band.displayTone,
                label: band.label,
                maxScore: CanonicalNumber(band.maxScore),
                minScore: CanonicalNumber(band.minScore),
                sequence: band.sequence,
            })),
        instructions: version.instructions ?? null,
        minimumCompleteness: version.minimumCompleteness ?? null,
        nodes: [...version.nodes]
            .sort((a, b) => CompareCodePoints(a.key, b.key))
            .map(node => ({
                anchors: [...(node.anchors ?? [])]
                    .map(anchor => {
                        const level = node.scaleId
                            ? scales.get(node.scaleId)?.levels.find(item => item.id === anchor.scaleLevelId)
                            : undefined;
                        return {
                            anchorValue: anchor.anchorValue ?? null,
                            descriptor: anchor.descriptor,
                            normalizedValue: level ? CanonicalNumber(level.normalizedValue) : null,
                        };
                    })
                    .sort((a, b) => CompareCodePoints(a.normalizedValue ?? '', b.normalizedValue ?? '') || (a.anchorValue ?? 0) - (b.anchorValue ?? 0)),
                description: node.description ?? null,
                evidenceRequired: node.evidenceRequired,
                evaluatorConfig: node.evaluatorConfig ?? null,
                gateMinimumScore: node.gateMinimumScore ?? null,
                guidance: node.guidance ?? null,
                isAdvisory: node.isAdvisory,
                isGate: node.isGate,
                key: node.key,
                name: node.name,
                nodeType: node.nodeType,
                notApplicablePolicy: node.notApplicablePolicy ?? null,
                parentKey: parentKey(version, node),
                rationaleRequired: node.rationaleRequired,
                rollupMethod: node.rollupMethod ?? null,
                scale: scaleSignature(node.scaleId ? scales.get(node.scaleId) : undefined),
                sequence: node.sequence,
                weight: CanonicalNumber(node.weight),
            })),
        notApplicablePolicy: version.notApplicablePolicy,
        passThreshold: version.passThreshold ?? null,
        scoreDisplayMax: CanonicalNumber(version.scoreDisplayMax),
        scoreDisplayMin: CanonicalNumber(version.scoreDisplayMin),
    };
}

/** Stable JSON: object keys sorted, no undefined. */
export function CanonicalJson(value: unknown): string {
    return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortValue);
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => CompareCodePoints(a, b));
        return Object.fromEntries(entries.map(([key, item]) => [key, sortValue(item)]));
    }
    return value;
}

/** SHA-256 hex of a canonical projection. Available in browsers and Node. */
export async function Sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

