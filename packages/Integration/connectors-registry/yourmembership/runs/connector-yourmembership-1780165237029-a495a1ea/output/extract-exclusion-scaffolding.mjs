#!/usr/bin/env node
/**
 * extract-exclusion-scaffolding.mjs
 *
 * Records the exclusion of ServiceStack Internal/Test Scaffolding endpoints from
 * the YourMembership IO catalog.
 *
 * Per SOURCE_STUDY.md §3.7 and the coverage matrix (line 279), the taxonomy
 * "Internal/Test Scaffolding" is classified EXCLUDED — its members are not
 * coverable IOs. This script does NOT emit IO/IOF rows. It produces a structured
 * stdout payload the workflow can read for the no-op decision.
 *
 * Source citation chain:
 *   - SOURCE_STUDY.md lines 91-95 (initial exclusion call)
 *   - SOURCE_STUDY.md lines 240-253 (formal §3.7 definition)
 *   - SOURCE_STUDY.md line 279 (coverage matrix: EXCLUDED)
 *
 * Provability: each excluded member is named with its source-cited reason.
 * No fabrication; no PK/FK invented; no metadata rows written.
 */

const EXCLUDED_MEMBERS = [
  {
    name: 'Ping',
    reason: 'Generic ServiceStack health probe; not a data surface.',
    sourceCitation: 'SOURCE_STUDY.md §3.7 line 245'
  },
  {
    name: 'HassAcessTestFolder',
    reason: 'Misspelled ("HasAccess") developer-only test probe path.',
    sourceCitation: 'SOURCE_STUDY.md §3.7 line 246'
  },
  {
    name: 'HelpTopic',
    reason: 'Returns embedded help text strings, not entity data.',
    sourceCitation: 'SOURCE_STUDY.md §3.7 line 247'
  },
  {
    name: 'BrandingConfig.css',
    reason: 'Returns rendered CSS string (path literally ends in .css); not a data IO.',
    sourceCitation: 'SOURCE_STUDY.md §3.7 line 248 + lines 61-62'
  },
  {
    name: 'Custom.css',
    reason: 'Returns rendered CSS string; not a data IO.',
    sourceCitation: 'SOURCE_STUDY.md §3.7 line 248 + lines 61-62'
  },
  {
    name: 'HtmlSanitization',
    reason: 'Utility transform endpoint; not a data source.',
    sourceCitation: 'SOURCE_STUDY.md §3.7 line 249'
  },
  {
    name: 'MarkupRender',
    reason: 'Utility transform endpoint (renders markup); not a data source.',
    sourceCitation: 'SOURCE_STUDY.md §3.7 line 250'
  },
  {
    name: 'WebScraper',
    reason: 'Generic fetch helper utility; not a data source.',
    sourceCitation: 'SOURCE_STUDY.md §3.7 line 251'
  }
];

const stdout = {
  objectName: 'Internal/Test Scaffolding EXCLUDED',
  classification: 'EXCLUDED',
  taxonomy: 'ServiceStack Internal/Test Scaffolding',
  taxonomySection: 'SOURCE_STUDY.md §3.7',
  coverageMatrixRow: 'SOURCE_STUDY.md line 279: Internal/Test Scaffolding | EXCLUDED | /metadata index inspection | —',
  IOCreated: 0,
  IOFCreated: 0,
  PKsExplicitlyEmitted: 0,
  FKsEmitted: 0,
  GapsForRuntimeD4: [],
  TraversalOrder: [],
  excludedMembers: EXCLUDED_MEMBERS,
  decision: 'NO-OP. The source-auditor classified this taxonomy EXCLUDED. Emitting IOs would contradict the locked source study. No rows appended to metadata/integrations/yourmembership/.yourmembership.integration.json.',
  provability: 'Each excluded member traces to a specific line in SOURCE_STUDY.md §3.7. No PK, FK, or capability flag was inferred — none should exist for these endpoints.'
};

process.stdout.write(JSON.stringify(stdout, null, 2));
process.stdout.write('\n');
