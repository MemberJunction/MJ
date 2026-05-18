/**
 * Canonical Concept Detector — high-precision deterministic pre-pass.
 *
 * Before running embedding-based clustering, this module checks each column
 * against a curated catalog of canonical organic-key concepts (email, phone,
 * URL/domain, postal code, ISO country/currency codes, tax/SSN identifiers,
 * etc.) using regex matchers over the column name + description text and
 * data-type constraints.
 *
 * Columns matching a catalog entry are assigned directly to a canonical
 * cluster — bypassing the clusterer + LLM refinement entirely — because
 * detection of these patterns doesn't need semantic similarity work: a column
 * literally named `EmailAddress` of type `nvarchar(255)` is an email column
 * regardless of what other columns might cluster near it in embedding space.
 *
 * The motivation: of the AdventureWorks and APTIFY KEEPs, several headline
 * organic keys (email_address, phone_number, organization_name) are exactly
 * the patterns PR #2193 cited as canonical examples. Detecting these via
 * a catalog gives us higher precision than clustering + LLM filtering and
 * zero LLM cost.
 *
 * Output: a set of `OrganicKeyCluster` rows tagged with `'canonical-match'`,
 * plus the residual column list (canonical-matched columns removed) for
 * downstream clustering.
 */

import type { DetectorInputColumn } from './OrganicKeyClusterDetector.js';
import {
    OrganicKeyCluster,
    OrganicKeyClusterMember,
    OrganicKeyClusterTag,
    OrganicKeyNormalizationStrategy,
} from '../types/organic-keys.js';

/** A single entry in the canonical concept catalog. */
export interface CanonicalConcept {
    /** snake_case concept name written to the output cluster. */
    conceptName: string;
    /** Normalization strategy for value comparison. */
    normalization: OrganicKeyNormalizationStrategy;
    /** Optional custom normalization SQL expression when normalization='Custom'. */
    customNormalizationExpression?: string;
    /**
     * Regex patterns matched against the column name (case-insensitive).
     * The column matches the concept if ANY name pattern OR ANY description
     * pattern hits.
     */
    namePatterns: RegExp[];
    /**
     * Optional patterns matched against the column description text.
     * Useful for concepts where the column name is generic (e.g. `Value`) but
     * the description makes the concept clear.
     */
    descriptionPatterns?: RegExp[];
    /**
     * Optional gate on the column data type. Defaults to accepting any string
     * type. Returns true to keep the column eligible for this concept.
     */
    dataTypeOk?: (dataType: string) => boolean;
    /** Human-readable reasoning template for the output cluster. */
    reasoning: string;
}

/** Result of running the canonical pre-pass. */
export interface CanonicalDetectionResult {
    /** Canonical clusters built from catalog matches. */
    canonicalClusters: OrganicKeyCluster[];
    /** Columns that did NOT match any canonical concept (pass through to clustering). */
    residual: DetectorInputColumn[];
    /** Total canonical-matched columns (sum across all canonical clusters). */
    matchedColumnCount: number;
}

const isStringType = (dataType: string): boolean => {
    if (!dataType) return false;
    const t = dataType.toLowerCase();
    return (
        t.includes('char') ||
        t.includes('text') ||
        t.includes('varchar') ||
        t.includes('nvarchar') ||
        t.includes('nchar')
    );
};

const isStringOrLongEnough = (dataType: string, minLen: number): boolean => {
    if (!isStringType(dataType)) return false;
    // Try to extract a (length) suffix; if present and below minLen, reject
    const m = dataType.match(/\((\d+)\)/);
    if (m) {
        const n = parseInt(m[1], 10);
        if (n > 0 && n < minLen) return false;
    }
    return true;
};

/**
 * Default catalog of canonical organic-key concepts. Each entry is high-precision
 * by construction: a column has to match BOTH a name/description pattern AND the
 * data-type constraint to be considered. The catalog is deliberately conservative —
 * we'd rather miss a borderline match (and let clustering handle it) than emit a
 * false positive in the canonical bucket.
 */
export const DEFAULT_CANONICAL_CATALOG: CanonicalConcept[] = [
    {
        conceptName: 'email_address',
        normalization: 'LowerCaseTrim',
        namePatterns: [
            /^email(\d+|address|primary|secondary|work|home|personal|alt|alternate|2|3)?$/i,
            /[a-z]email(\d+|address)?$/i,
            /^e_?mail$/i,
            /recipient_?email/i,
            /^email/i,
        ],
        descriptionPatterns: [/\bemail\s+address\b/i],
        dataTypeOk: (t) => isStringOrLongEnough(t, 20),
        reasoning: 'Column name and/or description identifies it as an email address; matched against canonical email concept (LowerCaseTrim normalization standard).',
    },
    {
        conceptName: 'phone_number',
        normalization: 'Custom',
        customNormalizationExpression: "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE({{FieldName}}, '-', ''), ' ', ''), '(', ''), ')', ''), '+', '')",
        namePatterns: [
            /^(home|work|cell|mobile|fax|primary|secondary|alt|main|business)?_?phone(_?number)?$/i,
            /^phone\d*$/i,
            /^tel(ephone)?$/i,
            /^fax(_?number)?$/i,
        ],
        descriptionPatterns: [/\bphone\s+number\b/i, /\btelephone\b/i, /\bfax\b/i],
        dataTypeOk: (t) => isStringOrLongEnough(t, 7),
        reasoning: 'Column identifies as a phone number; custom normalization strips formatting characters (dashes, spaces, parentheses, plus signs) for cross-system matching.',
    },
    {
        conceptName: 'url_or_domain',
        normalization: 'LowerCaseTrim',
        namePatterns: [
            /^(web)?site$/i,
            /^url$/i,
            /^website_?url$/i,
            /^home_?page$/i,
            /^domain(_?name)?$/i,
            /^web_?address$/i,
        ],
        descriptionPatterns: [/\b(url|website|web\s+page|domain\s+name)\b/i],
        dataTypeOk: isStringType,
        reasoning: 'Column identifies as a web URL, website, or domain name; LowerCaseTrim handles case-insensitive web identifier matching.',
    },
    {
        conceptName: 'postal_code',
        normalization: 'Trim',
        namePatterns: [
            /^(postal|zip)_?code$/i,
            /^post_?code$/i,
            /^zip$/i,
            /^(mailing|shipping|billing|home|work)_?(postal|zip)_?code$/i,
        ],
        descriptionPatterns: [/\b(postal\s+code|zip\s+code|postcode)\b/i],
        dataTypeOk: (t) => isStringOrLongEnough(t, 3),
        reasoning: 'Column identifies as a postal/zip code; trim-only normalization preserves case (some country codes are case-sensitive).',
    },
    {
        conceptName: 'iso_country_code',
        normalization: 'Trim',
        namePatterns: [
            /^country(_?code|_?iso)?$/i,
            /^iso_?country/i,
            /^country_?region_?code$/i,
            /^nation_?code$/i,
        ],
        descriptionPatterns: [/\bISO\s+3166/i, /\bcountry\s+code\b/i],
        dataTypeOk: (t) => isStringOrLongEnough(t, 2),
        reasoning: 'Column identifies as an ISO country code (2- or 3-letter); trim normalization preserves case as ISO codes are typically uppercase.',
    },
    {
        conceptName: 'currency_code',
        normalization: 'Trim',
        namePatterns: [/^currency(_?code|_?iso)?$/i, /^iso_?currency/i, /^cur(_?code)?$/i],
        descriptionPatterns: [/\bISO\s+4217/i, /\bcurrency\s+code\b/i],
        dataTypeOk: (t) => isStringOrLongEnough(t, 3),
        reasoning: 'Column identifies as an ISO 4217 currency code (3-letter); trim normalization preserves uppercase ISO format.',
    },
    {
        conceptName: 'tax_identifier',
        normalization: 'Custom',
        customNormalizationExpression: "REPLACE(REPLACE({{FieldName}}, '-', ''), ' ', '')",
        namePatterns: [
            /^(tax|ein|tin|vat|gst|hst|pst|ssn|sin|national)_?(id|identifier|number|num)$/i,
            /^social_?security(_?number)?$/i,
            /^tax_?(id|number)$/i,
            // Bare 3-letter government identifier abbreviations
            /^(ssn|sin|ein|tin|vat|gst|hst|pst)$/i,
            /^vat_?number$/i,
        ],
        descriptionPatterns: [
            /\bsocial\s+security\b/i,
            /\btax\s+(identifier|id|number)\b/i,
            /\b(EIN|TIN|VAT|GST)\b/,
            /\bnational\s+id/i,
        ],
        dataTypeOk: (t) => isStringOrLongEnough(t, 7),
        reasoning: 'Column identifies as a tax/government identifier (SSN, EIN, VAT, etc.); custom normalization strips dashes and spaces for cross-system matching.',
    },
    {
        conceptName: 'iata_airport_code',
        normalization: 'Trim',
        namePatterns: [/^iata(_?code)?$/i, /^airport_?(code|iata)$/i],
        descriptionPatterns: [/\bIATA\b/, /\bairport\s+code\b/i],
        dataTypeOk: (t) => isStringOrLongEnough(t, 3),
        reasoning: 'Column identifies as an IATA airport code (3-letter); trim normalization preserves uppercase IATA format.',
    },
    {
        conceptName: 'language_locale',
        normalization: 'LowerCaseTrim',
        namePatterns: [/^(language|locale|culture)_?(code|id|name)?$/i, /^lang_?code$/i],
        descriptionPatterns: [/\bISO\s+639\b/i, /\blanguage\s+code\b/i, /\blocale\b/i],
        dataTypeOk: (t) => isStringOrLongEnough(t, 2),
        reasoning: 'Column identifies as a language/locale code (ISO 639, IETF BCP 47); lowercase normalization is the IETF standard.',
    },
];

/**
 * Build the canonical pre-pass clusters and emit residual columns for clustering.
 */
export class CanonicalConceptDetector {
    private readonly catalog: readonly CanonicalConcept[];

    constructor(catalog: readonly CanonicalConcept[] = DEFAULT_CANONICAL_CATALOG) {
        this.catalog = catalog;
    }

    /** Match a single column against the catalog. Returns the FIRST matching concept, or null. */
    public matchColumn(column: DetectorInputColumn): CanonicalConcept | null {
        for (const concept of this.catalog) {
            if (this.columnMatches(column, concept)) return concept;
        }
        return null;
    }

    /** Run the detector across all input columns and produce canonical clusters + residual. */
    public detect(columns: DetectorInputColumn[]): CanonicalDetectionResult {
        // Group canonical-matched columns by concept name
        const byCount = new Map<string, DetectorInputColumn[]>();
        const conceptByName = new Map<string, CanonicalConcept>();
        const residual: DetectorInputColumn[] = [];

        for (const col of columns) {
            const concept = this.matchColumn(col);
            if (!concept) {
                residual.push(col);
                continue;
            }
            const bucket = byCount.get(concept.conceptName);
            if (bucket) bucket.push(col);
            else {
                byCount.set(concept.conceptName, [col]);
                conceptByName.set(concept.conceptName, concept);
            }
        }

        // Build OrganicKeyCluster output rows. Same minimum-shape rule the
        // detector enforces: ≥2 members spanning ≥2 tables. If a concept matches
        // only 1 column or all matches are in the same table, fall back: those
        // columns are returned to the residual pool so clustering can decide
        // whether they belong with anything else.
        const canonicalClusters: OrganicKeyCluster[] = [];
        let matchedColumnCount = 0;
        let nextId = 0;

        for (const [conceptName, members] of byCount) {
            const tables = new Set(members.map((m) => `${m.schema}.${m.table}`));
            if (members.length < 2 || tables.size < 2) {
                // Push back to residual for clustering to handle
                residual.push(...members);
                continue;
            }
            const concept = conceptByName.get(conceptName)!;
            canonicalClusters.push(buildCanonicalCluster(`canonical_${nextId++}`, concept, members));
            matchedColumnCount += members.length;
        }

        return { canonicalClusters, residual, matchedColumnCount };
    }

    private columnMatches(column: DetectorInputColumn, concept: CanonicalConcept): boolean {
        // Data-type gate must always pass when specified
        if (concept.dataTypeOk && !concept.dataTypeOk(column.dataType)) return false;

        // Name pattern hit
        for (const re of concept.namePatterns) {
            if (re.test(column.column)) return true;
        }
        // Description pattern hit (only if no name pattern hit but data-type ok)
        if (concept.descriptionPatterns && column.description) {
            for (const re of concept.descriptionPatterns) {
                if (re.test(column.description)) return true;
            }
        }
        return false;
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildCanonicalCluster(
    id: string,
    concept: CanonicalConcept,
    columns: DetectorInputColumn[],
): OrganicKeyCluster {
    const members: OrganicKeyClusterMember[] = columns.map((c) => ({
        schema: c.schema,
        table: c.table,
        column: c.column,
        participatesInFK: !!c.participatesInFK,
        fkTarget: c.fkTarget ?? null,
    }));

    const tags: OrganicKeyClusterTag[] = computeStructuralTags(members, columns);

    return {
        id,
        concept: concept.conceptName,
        normalization: concept.normalization,
        customNormalizationExpression: concept.customNormalizationExpression,
        members,
        confidence: 0.98, // High but not perfect — catalog patterns can still have edge-case false positives
        reasoning: concept.reasoning,
        tags,
        maxIntraDistance: 0, // Not produced by distance metric — direct match
    };
}

/** Compute the same structural tags the regular detector uses. */
function computeStructuralTags(
    members: OrganicKeyClusterMember[],
    columns: DetectorInputColumn[],
): OrganicKeyClusterTag[] {
    const tags = new Set<OrganicKeyClusterTag>();
    const allFK = members.every((m) => m.participatesInFK);
    const allPK = columns.every((c) => c.isPrimaryKey);
    const noFK = members.every((m) => !m.participatesInFK);
    const noPK = columns.every((c) => !c.isPrimaryKey);

    if (allFK) {
        const targets = new Set(
            members
                .map((m) => m.fkTarget)
                .filter((t): t is { schema: string; table: string; column: string } => !!t)
                .map((t) => `${t.schema}.${t.table}.${t.column}`),
        );
        tags.add(targets.size === 1 ? 'fk-redundant-single-target' : 'fk-fragmented');
    } else if (noFK && allPK) tags.add('pk-to-pk');
    else if (noFK && noPK) tags.add('no-fk-no-pk');
    else tags.add('mixed');

    return Array.from(tags);
}
