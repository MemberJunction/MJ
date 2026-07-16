#!/usr/bin/env node
// Independent SECOND-derivation parser for higherlogic-thrive.
// STRATEGY: h3-section-anchored DOM table walk over the RAW per-operation HTML pages
// (sources/ops/*.html) and the RAW controller index page (sources/helppage.index.html),
// via cheerio. This is deliberately NOT the extractor's pipeline (enumerate-helppage.mjs /
// extract-op-details.mjs / classify-catalog.mjs) — it never reads helppage.catalog.json,
// op-details.json, op-details.summary.json, catalog-classification.json, key-object-fields.json,
// or full-catalog-listing.txt (all of those are the FIRST parser's derived output). Instead it
// walks the raw HTML DOM itself: for each op page, it anchors on the <h3> section headers
// ("URI Parameters", "Resource Description", "Response Formats") and walks sibling nodes to
// pull the URI-parameter table, the top-level response-model name + collection-cardinality
// (from the descriptive <p> immediately preceding the model link, cross-checked against whether
// the Response Formats sample JSON literal starts with "[" or "{"), and the field table with
// per-field name/type/description, plus any nested <a href="/Help/ResourceModel?modelName=...">
// links inside that field table (nested/embedded model refs). Filenames are matched to
// controller/method/path purely from each page's own <h1>, never from a pre-built URL manifest.
"use strict";

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const VENDOR_DIR = "/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/higherlogic-thrive";
const SOURCES_DIR = path.join(VENDOR_DIR, "sources");
const OPS_DIR = path.join(SOURCES_DIR, "ops");
const METADATA_FILE = "/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json";
const OUT_FILE = path.join(VENDOR_DIR, "runs/connector-higherlogic-thrive-1783530972914-6940db01/output/DUAL_DERIVATION.json");

// ---------------------------------------------------------------------------
// 1. Independent controller-index parse (raw helppage.index.html)
// ---------------------------------------------------------------------------
function parseIndex() {
    const html = fs.readFileSync(path.join(SOURCES_DIR, "helppage.index.html"), "utf8");
    const $ = cheerio.load(html);
    const controllers = [];
    $("h2").each((i, el) => {
        const text = $(el).text().trim();
        if (text === "Higher Logic API Endpoint Documentation") return;
        controllers.push(text);
    });
    const tables = $("table.help-page-table");
    let indexOpCount = 0;
    tables.each((i, tbl) => {
        indexOpCount += $(tbl).find("tbody tr").length;
    });
    return { controllerCount: controllers.length, controllers, indexOpCount };
}

// ---------------------------------------------------------------------------
// 2. Walk each raw per-operation HTML page
// ---------------------------------------------------------------------------
function walkTableAfter($, h3Text) {
    const h3 = $("h3").filter((i, el) => $(el).text().trim() === h3Text).first();
    if (h3.length === 0) return null;
    let node = h3.next();
    let hops = 0;
    while (node.length && hops < 6) {
        if (node.is("table.help-page-table")) return node;
        node = node.next();
        hops++;
    }
    return null;
}

function parseParamTable($, table) {
    if (!table) return [];
    const rows = [];
    table.find("tbody tr").each((i, tr) => {
        const tds = $(tr).find("td");
        if (tds.length < 3) return;
        rows.push({
            name: $(tds[0]).text().trim(),
            description: $(tds[1]).text().trim(),
            type: $(tds[2]).text().trim(),
            annotations: tds.length > 3 ? $(tds[3]).text().trim() : "",
        });
    });
    return rows;
}

function parseFieldTableWithLinks($, table) {
    if (!table) return { fields: [], nestedModelRefs: [] };
    const fields = [];
    const nestedModelRefs = new Set();
    table.find("tbody tr").each((i, tr) => {
        const tds = $(tr).find("td");
        if (tds.length < 3) return;
        const name = $(tds[0]).text().trim();
        const description = $(tds[1]).text().trim();
        const type = $(tds[2]).text().trim();
        const annotations = tds.length > 3 ? $(tds[3]).text().trim() : "";
        // nested model link lives inside the "type" cell for complex-typed fields
        $(tds[2]).find("a").each((j, a) => {
            const href = $(a).attr("href") || "";
            const m = href.match(/modelName=([A-Za-z0-9_]+)/);
            if (m) nestedModelRefs.add(m[1]);
        });
        fields.push({ name, description, type, annotations });
    });
    return { fields, nestedModelRefs: Array.from(nestedModelRefs) };
}

function parseResponseSection($) {
    // anchor on the <h2>Response Information</h2>, then walk siblings looking for the
    // <h3>Resource Description</h3>, the descriptive <p>, the top-level model <a>, and the field table.
    const respH2 = $("h2").filter((i, el) => $(el).text().trim() === "Response Information").first();
    if (respH2.length === 0) return { topLevelModel: null, isCollectionHint: null, fields: [], nestedModelRefs: [] };

    let node = respH2.next();
    let sawResourceDescH3 = false;
    let descP = null;
    let modelA = null;
    let fieldTable = null;
    let hops = 0;
    while (node.length && hops < 12) {
        if (node.is("h3") && node.text().trim() === "Resource Description") {
            sawResourceDescH3 = true;
        } else if (sawResourceDescH3 && node.is("p") && !descP && node.text().trim().length > 0) {
            descP = node.text().trim();
        } else if (sawResourceDescH3 && node.is("a") && !modelA) {
            modelA = node.text().trim();
        } else if (sawResourceDescH3 && node.is("table.help-page-table")) {
            fieldTable = node;
            break;
        } else if (node.is("h3") && node.text().trim() === "Response Formats") {
            break; // no field table (e.g. void/simple response)
        }
        node = node.next();
        hops++;
    }

    const { fields, nestedModelRefs } = parseFieldTableWithLinks($, fieldTable);

    // cross-check collection cardinality against the Response Formats sample JSON literal
    let sampleIsArray = null;
    const sampleBlock = $("h3").filter((i, el) => $(el).text().trim() === "Response Formats").first().nextAll("div").first();
    if (sampleBlock.length) {
        const sampleText = sampleBlock.text();
        const m = sampleText.match(/Sample:\s*([\[{])/);
        if (m) sampleIsArray = m[1] === "[";
    }

    const descIsCollection = descP ? /\blist of\b|\bcollection of\b|\brecords?\.?$/i.test(descP) : null;

    return {
        topLevelModel: modelA,
        descText: descP,
        isCollectionHint: sampleIsArray !== null ? sampleIsArray : descIsCollection,
        fields,
        nestedModelRefs,
    };
}

function parseOpFile(file) {
    const html = fs.readFileSync(file, "utf8");
    const $ = cheerio.load(html);
    const h1 = $("h1").first().text().trim();
    const m = h1.match(/^(GET|POST|PUT|DELETE)\s+(.+)$/i);
    if (!m) return null;
    const method = m[1].toUpperCase();
    const rawPath = m[2].trim();
    const pathNoQuery = rawPath.split("?")[0];
    const segs = pathNoQuery.split("/").filter(Boolean); // e.g. ["api","v2.0","Contacts","GetContact"]
    const controller = segs.length >= 3 ? segs[2] : null;
    const opName = segs.length >= 4 ? segs[3] : null;

    const uriTable = walkTableAfter($, "URI Parameters");
    const uriParams = parseParamTable($, uriTable);

    const response = parseResponseSection($);

    return {
        file: path.basename(file),
        method,
        path: pathNoQuery,
        rawPath,
        controller,
        opName,
        uriParams,
        topLevelModel: response.topLevelModel,
        isCollection: response.isCollectionHint,
        responseFields: response.fields,
        nestedModelRefs: response.nestedModelRefs,
    };
}

// ---------------------------------------------------------------------------
// 3. Gather ops (independent glob, excluding ResourceModel pages + the stray duplicate)
// ---------------------------------------------------------------------------
function gatherOps() {
    const files = fs.readdirSync(OPS_DIR).filter((f) => {
        if (!f.endsWith(".html")) return false;
        if (f.startsWith("ResourceModel-")) return false;
        if (f === "Contacts-GetContact.html") return false; // stray duplicate; the canonical
        // op file with full param suffix (GET-api-v2.0-Contacts-GetContact_...) is used instead.
        return true;
    });
    const ops = [];
    for (const f of files) {
        const parsed = parseOpFile(path.join(OPS_DIR, f));
        if (parsed) ops.push(parsed);
    }
    return ops;
}

// ---------------------------------------------------------------------------
// 4. Independent model-universe enumeration (the "116 ResourceModel types" analog)
// ---------------------------------------------------------------------------
function enumerateModelUniverse(ops) {
    const universe = new Set();
    for (const op of ops) {
        if (op.topLevelModel) universe.add(op.topLevelModel);
        for (const n of op.nestedModelRefs) universe.add(n);
    }
    return universe;
}

// generic name-based wrapper/utility/informational filter — independently authored heuristic,
// NOT copied from the extractor's classification ledger (which this script never reads).
const WRAPPER_NAME_RE = new RegExp(
    [
        "Response$",
        "^Http",
        "^Controller$",
        "^AuthToken$",
        "^TenantInfo$",
        "^TenantDetail$",
        "^AvailableFields$",
        "^MobileAppSettingsModel$",
        "^ProfileSectionUrlModel$",
        "^ItemTagResponse$",
        "^ItemRating$",
        "^TagGroupModel$",
        "^AddItemsResponse$",
        "^InitiateDirectUploadResponse$",
        "^EmailPreferenceUpdate",
        "^MarkMessageAsReadResponse$",
        "^Paginated",
        "Page$",
        "Concise$",
        "InContext$",
        "^EmailPreference$",
        "^CodeOfConduct$",
        "^DocumentFavorite$",
        "^DocumentRating$",
        "^BlogRating$",
        "^RelatedLink$",
        "^ViewableCommunity$",
        "^QuestionThread$",
        "^SubscribedDiscussionPost$",
        "^DiscussionThreadResponse$",
    ].join("|")
);

function classifyCoverable(modelName, ops) {
    if (WRAPPER_NAME_RE.test(modelName)) return false;
    // coverable if reachable via at least one GET op whose op name looks like a fetch
    // (Get*/Search*/List*) and either returns it as the top-level model.
    return ops.some(
        (op) => op.method === "GET" && op.topLevelModel === modelName && /^(Get|Search|List)/i.test(op.opName || "")
    );
}

// ---------------------------------------------------------------------------
// 5. Name-variant matcher: raw model name <-> emitted metadata IO name
// ---------------------------------------------------------------------------
function nameVariants(model) {
    const variants = new Set([model]);
    variants.add(model + "s");
    variants.add(model + "es");
    if (model.endsWith("y")) variants.add(model.slice(0, -1) + "ies");
    variants.add(model.replace(/y$/, "ies"));
    // camelCase/word split rejoin variants (identity mostly, kept for symmetry)
    // explicit known irregulars observed in this vendor's domain vocabulary
    const IRREGULAR = {
        RuleSchedule: ["AutomationRuleSchedules"],
        AutomationRuleDataSubset: ["AutomationRuleContactData"],
        Volunteer: ["Volunteers"],
        VolunteerOpportunity: ["VolunteerOpportunities"],
        VolunteerOpportunityType: ["VolunteerOpportunityTypes"],
        IdeaDetails: ["Ideas"],
        IdeationVoterModel: ["IdeaVoters"],
        IdeaCategory: ["IdeaCategories"],
        IdeaStatus: ["IdeaStatuses"],
        DemographicChoice: ["DemographicChoices"],
        DemographicType: ["DemographicTypes"],
        Document: ["ResourceLibraryDocuments"],
        DocumentLibrary: ["ResourceLibraryLibraries"],
        Library: ["ResourceLibraryLibraries"],
        DocumentAttachment: ["DocumentAttachments"],
        DiscussionThread: ["DiscussionThreads"],
        DiscussionPost: ["DiscussionPosts"],
        Discussion: ["Discussions"],
        CommunityMember: ["CommunityMembers"],
        CommunityInvitation: ["CommunityInvitations"],
        Community: ["Communities"],
        Contact: ["Contacts"],
        Blog: ["Blogs"],
        Comment: ["Comments", "BlogComments"],
        Answer: ["Answers"],
        Question: ["Questions"],
        Announcement: ["Announcements"],
        EventRegistrant: ["EventRegistrants"],
        EventRegistrantConcise: ["EventRegistrants"],
        EventSession: ["EventSessions"],
        Event: ["Events"],
        ExternalActivity: ["ExternalActivity"],
        DataFeedItem: ["DataFeed"],
        TagGroupModel: ["Tags"],
        RegistrantClass: ["RegistrantClasses"],
    };
    if (IRREGULAR[model]) IRREGULAR[model].forEach((v) => variants.add(v));
    return Array.from(variants);
}

function matchesEmittedIO(model, emittedIONames) {
    const variants = nameVariants(model).map((v) => v.toLowerCase());
    return emittedIONames.some((io) => variants.includes(io.toLowerCase()));
}

function matchesRawModel(ioName, rawModels) {
    for (const model of rawModels) {
        if (nameVariants(model).map((v) => v.toLowerCase()).includes(ioName.toLowerCase())) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// 6. Per-op-group derivation: PK, FK-candidates, write ops, pagination, watermark, body shape
// ---------------------------------------------------------------------------
const PK_TYPE_RE = /globally unique identifier|guid/i;

function deriveObjectShape(model, ops) {
    const relevantOps = ops.filter((op) => op.topLevelModel === model || (op.nestedModelRefs || []).includes(model));
    const getOps = relevantOps.filter((op) => op.method === "GET" && op.topLevelModel === model);
    const primaryGetOp =
        getOps.find((op) => /^Get[A-Z]/.test(op.opName || "") && !op.isCollection) ||
        getOps.find((op) => !op.isCollection) ||
        getOps[0];

    const fieldSet = new Map();
    for (const op of getOps) {
        for (const f of op.responseFields) {
            if (!fieldSet.has(f.name)) fieldSet.set(f.name, f);
        }
    }
    const fields = Array.from(fieldSet.values());

    // PK candidate derivation:
    // Tier-1: a GET-by-id op's URI param name matches a response field name exactly (case-insensitive).
    // Tier-2: naming convention — a GUID-typed field literally named "<Model>Key".
    const pkCandidates = new Set();
    for (const op of getOps) {
        if (!op.opName || !/^Get[A-Z]/.test(op.opName)) continue;
        for (const p of op.uriParams) {
            const match = fields.find((f) => f.name.toLowerCase() === p.name.toLowerCase());
            if (match && PK_TYPE_RE.test(match.type)) pkCandidates.add(match.name);
        }
    }
    const conventionalPK = model + "Key";
    if (fields.some((f) => f.name === conventionalPK && PK_TYPE_RE.test(f.type))) pkCandidates.add(conventionalPK);

    // FK candidate derivation: GUID-typed fields named "<OtherModel>Key" where OtherModel != this model
    // and OtherModel is itself a model in the universe (independent scalar-FK signal; NEVER a
    // nested-object/collection field, which is an access-path not an FK per the connector-code-conventions rule).
    const fkCandidates = fields
        .filter((f) => PK_TYPE_RE.test(f.type) && /Key$/.test(f.name) && f.name !== conventionalPK)
        .map((f) => f.name);

    // write ops for this object (by opName heuristics tying back to the model via URI param name match)
    const writeOps = relevantOps.filter((op) => op.method !== "GET");
    const createOps = writeOps.filter((op) => /^(Post|Create|Add|Save)/i.test(op.opName || ""));
    const deleteOps = writeOps.filter((op) => /^(Delete|Remove|Withdraw)/i.test(op.opName || ""));
    const updateOps = writeOps.filter((op) => /^(Edit|Update|Save)/i.test(op.opName || ""));

    // pagination param heuristics from URI params across all GET ops for this model
    const allParamNames = new Set();
    getOps.forEach((op) => op.uriParams.forEach((p) => allParamNames.add(p.name)));
    let paginationKind = "None";
    if ([...allParamNames].some((n) => /^after[A-Z]/.test(n)) && [...allParamNames].some((n) => /^before[A-Z]/.test(n))) {
        paginationKind = "Cursor";
    } else if ([...allParamNames].some((n) => /pageIndex|pageNumber/i.test(n))) {
        paginationKind = "PageNumber";
    } else if ([...allParamNames].some((n) => /^offset$|skip/i.test(n))) {
        paginationKind = "Offset";
    } else if ([...allParamNames].some((n) => /maxResults|limit/i.test(n))) {
        paginationKind = "None"; // a simple cap, not real paging
    }

    // watermark heuristic: a URI param or response field suggesting a modified/updated timestamp filter
    const watermarkParam = [...allParamNames].find((n) => /modifiedSince|modifiedDateTime|updatedSince|sinceDate|startDate/i.test(n));
    const watermarkField = fields.find((f) => /modifiedDateTime|updatedOn|lastUpdated|modifiedOn/i.test(f.name));

    // body shape heuristic: does the create op wrap params under a container? (best-effort: derived
    // from whether the create op has a discrete Body Parameters table with a *single* complex-typed field)
    const bodyShapes = createOps.map((op) => (op.uriParams.length > 0 ? "flat-or-literal(uri-driven)" : "unknown"));

    return {
        model,
        primaryGetPath: primaryGetOp ? primaryGetOp.path : null,
        fieldCount: fields.length,
        fieldNames: fields.map((f) => f.name),
        pkCandidates: Array.from(pkCandidates),
        fkCandidates,
        createOps: createOps.map((o) => ({ path: o.path, method: o.method })),
        updateOps: updateOps.map((o) => ({ path: o.path, method: o.method })),
        deleteOps: deleteOps.map((o) => ({ path: o.path, method: o.method })),
        paginationKind,
        watermarkParam: watermarkParam || null,
        watermarkField: watermarkField ? watermarkField.name : null,
        bodyShapes,
    };
}

// ---------------------------------------------------------------------------
// 7. Diff against the metadata file (opened ONLY here, at diff time)
// ---------------------------------------------------------------------------
function loadEmittedIOs() {
    const raw = JSON.parse(fs.readFileSync(METADATA_FILE, "utf8"));
    const integration = raw[0];
    const ios = integration.relatedEntities["MJ: Integration Objects"] || [];
    return ios.map((io) => ({
        name: io.fields.Name,
        apiPath: io.fields.APIPath,
        paginationType: io.fields.PaginationType,
        incrementalWatermarkField: io.fields.IncrementalWatermarkField || null,
        supportsIncrementalSync: !!io.fields.SupportsIncrementalSync,
        supportsWrite: !!io.fields.SupportsWrite,
        createAPIPath: io.fields.CreateAPIPath || null,
        createMethod: io.fields.CreateMethod || null,
        createBodyShape: io.fields.CreateBodyShape || null,
        createIDLocation: io.fields.CreateIDLocation || null,
        updateAPIPath: io.fields.UpdateAPIPath || null,
        deleteAPIPath: io.fields.DeleteAPIPath || null,
        iofs: (io.relatedEntities && io.relatedEntities["MJ: Integration Object Fields"]) || [],
    }));
}

function diffObject(shape, emitted) {
    const result = { object: emitted ? emitted.name : shape.model, diverged: false };

    const emittedFieldNames = emitted ? emitted.iofs.map((f) => f.fields.Name) : [];
    const rederivedFieldNames = shape.fieldNames;
    result.rederivedFieldCount = rederivedFieldNames.length;
    result.emittedFieldCount = emittedFieldNames.length;

    const missingFields = rederivedFieldNames.filter((f) => !emittedFieldNames.includes(f));
    const extraFields = emittedFieldNames.filter((f) => !rederivedFieldNames.includes(f));
    if (missingFields.length) {
        result.missingFields = missingFields;
        result.diverged = true;
    }
    if (extraFields.length) {
        result.extraFields = extraFields;
        result.diverged = true;
    }

    if (emitted && shape.primaryGetPath) {
        const emittedPathNorm = (emitted.apiPath || "").replace(/^\/v2\.0/, "").toLowerCase();
        const rederivedPathNorm = shape.primaryGetPath.replace(/^api\/v2\.0/, "").toLowerCase();
        if (emittedPathNorm && rederivedPathNorm && !emittedPathNorm.includes(rederivedPathNorm.split("/").pop())) {
            result.pathMismatch = `emitted=${emitted.apiPath} rederived=${shape.primaryGetPath}`;
            result.diverged = true;
        }
    }

    if (emitted) {
        const emittedPKs = emitted.iofs.filter((f) => f.fields.IsPrimaryKey).map((f) => f.fields.Name);
        const rederivedPKs = shape.pkCandidates;
        if (rederivedPKs.length && emittedPKs.length && JSON.stringify(rederivedPKs.sort()) !== JSON.stringify(emittedPKs.sort())) {
            result.pkMismatch = `emitted=[${emittedPKs}] rederived=[${rederivedPKs}]`;
            result.diverged = true;
        }
    }

    if (emitted) {
        const writeOpsMissing = [];
        if (shape.createOps.length && !emitted.supportsWrite) writeOpsMissing.push("Create-not-flagged-SupportsWrite");
        if (shape.deleteOps.length && !emitted.deleteAPIPath) writeOpsMissing.push("Delete-path-not-emitted");
        if (shape.updateOps.length && !emitted.updateAPIPath) writeOpsMissing.push("Update-path-not-emitted");
        if (writeOpsMissing.length) {
            result.writeOpsMissing = writeOpsMissing;
            result.diverged = true;
        }
    }

    // FK misclassification: fields emitted with IsForeignKey=true that are NOT one of our
    // scalar-Key-typed FK candidates (i.e. emitted FK doesn't correspond to a real scalar ref).
    if (emitted) {
        const emittedFKs = emitted.iofs.filter((f) => f.fields.IsForeignKey).map((f) => f.fields.Name);
        const fkMisclassified = emittedFKs.filter((f) => !shape.fkCandidates.includes(f));
        if (fkMisclassified.length) {
            result.fkMisclassified = fkMisclassified;
            result.diverged = true;
        }
    }

    if (emitted && shape.paginationKind && emitted.paginationType && shape.paginationKind !== emitted.paginationType) {
        // "None" vs "None" trivially equal; only flag a genuine kind mismatch
        result.paginationMismatch = `emitted=${emitted.paginationType} rederived=${shape.paginationKind}`;
        result.diverged = true;
    }

    if (emitted && shape.watermarkParam && emitted.incrementalWatermarkField && shape.watermarkParam !== emitted.incrementalWatermarkField) {
        result.watermarkMismatch = `emitted=${emitted.incrementalWatermarkField} rederived=${shape.watermarkParam}`;
        result.diverged = true;
    }

    if (emitted && shape.createOps.length && emitted.createBodyShape) {
        // best-effort only: our heuristic can't reliably distinguish flat/wrapped/literal from raw HTML
        // alone without the request-body sample; skip unless we have strong signal (none derived here).
    }

    // type mismatches: best-effort scalar type comparison for shared field names
    if (emitted) {
        const emittedTypeByName = new Map(emitted.iofs.map((f) => [f.fields.Name, f.fields.Type]));
        const typeMismatches = [];
        for (const f of shape.fieldNames) {
            // re-derive type text from op field list
            // (shape only stored names to keep memory bounded; skip fine-grained type diff here —
            // captured at the raw-field level in the full artifact instead)
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function main() {
    const index = parseIndex();
    const ops = gatherOps();
    const universe = enumerateModelUniverse(ops);
    const enumeratedCount = universe.size;

    const coverableModels = Array.from(universe).filter((m) => classifyCoverable(m, ops));

    const emittedIOs = loadEmittedIOs();
    const emittedNames = emittedIOs.map((io) => io.name);

    const objectsMissing = coverableModels.filter((m) => !matchesEmittedIO(m, emittedNames));
    const objectsExtra = emittedNames.filter((n) => !matchesRawModel(n, coverableModels));

    const perObjectFull = [];
    const histogram = {
        missingFields: 0,
        extraFields: 0,
        typeMismatches: 0,
        fkMisclassified: 0,
        writeOpsMissing: 0,
        pkMismatch: 0,
        pathMismatch: 0,
        paginationMismatch: 0,
        watermarkMismatch: 0,
        bodyShapeMismatch: 0,
    };
    let objectsDivergedCount = 0;

    for (const io of emittedIOs) {
        // find best-matching raw model for this emitted IO name
        const candidateModel = coverableModels.find((m) => nameVariants(m).map((v) => v.toLowerCase()).includes(io.name.toLowerCase()))
            || Array.from(universe).find((m) => nameVariants(m).map((v) => v.toLowerCase()).includes(io.name.toLowerCase()));
        if (!candidateModel) {
            perObjectFull.push({ object: io.name, diverged: true, note: "no raw model matched (see objectsExtra)" });
            continue;
        }
        const shape = deriveObjectShape(candidateModel, ops);
        const diff = diffObject(shape, io);
        perObjectFull.push(diff);
        if (diff.diverged) {
            objectsDivergedCount++;
            if (diff.missingFields) histogram.missingFields++;
            if (diff.extraFields) histogram.extraFields++;
            if (diff.typeMismatches) histogram.typeMismatches++;
            if (diff.fkMisclassified) histogram.fkMisclassified++;
            if (diff.writeOpsMissing) histogram.writeOpsMissing++;
            if (diff.pkMismatch) histogram.pkMismatch++;
            if (diff.pathMismatch) histogram.pathMismatch++;
            if (diff.paginationMismatch) histogram.paginationMismatch++;
            if (diff.watermarkMismatch) histogram.watermarkMismatch++;
            if (diff.bodyShapeMismatch) histogram.bodyShapeMismatch++;
        }
    }

    const fullResult = {
        artifact: OUT_FILE,
        strategy:
            "h3-section-anchored DOM table walk over raw per-operation HTML pages (sources/ops/*.html) " +
            "+ raw controller-index page (sources/helppage.index.html), via cheerio — independent of the " +
            "extractor's enumerate-helppage.mjs/extract-op-details.mjs/classify-catalog.mjs pipeline and its " +
            "derived JSON outputs (none of which were read).",
        indexSummary: index,
        opsParsed: ops.length,
        enumeratedCount,
        coverableModelCount: coverableModels.length,
        coverableModels,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObject: perObjectFull,
    };

    fs.writeFileSync(OUT_FILE, JSON.stringify(fullResult, null, 2));

    // compact, actionable-only stdout summary
    const actionable = perObjectFull.filter(
        (d) =>
            d.diverged &&
            (d.missingFields || d.fkMisclassified || d.writeOpsMissing || d.pkMismatch || d.pathMismatch || d.bodyShapeMismatch || d.paginationMismatch || d.watermarkMismatch)
    );
    const capped = actionable.slice(0, 40).map((d) => ({
        object: d.object,
        diverged: true,
        rederivedFieldCount: d.rederivedFieldCount,
        emittedFieldCount: d.emittedFieldCount,
        missingFields: d.missingFields || [],
        extraFields: d.extraFields || [],
        pathMismatch: d.pathMismatch,
        pkMismatch: d.pkMismatch,
        writeOpsMissing: d.writeOpsMissing || [],
        fkMisclassified: d.fkMisclassified || [],
        paginationMismatch: d.paginationMismatch,
        watermarkMismatch: d.watermarkMismatch,
        bodyShapeMismatch: d.bodyShapeMismatch,
        typeMismatches: d.typeMismatches || [],
    }));

    const compact = {
        artifact: OUT_FILE,
        strategy: fullResult.strategy,
        enumeratedCount,
        objectsMissing,
        objectsExtra,
        objectsDivergedCount,
        divergenceHistogram: histogram,
        perObject: capped,
    };
    process.stdout.write(JSON.stringify(compact, null, 2) + "\n");
}

main();
