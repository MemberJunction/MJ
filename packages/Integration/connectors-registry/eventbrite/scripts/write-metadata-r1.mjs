#!/usr/bin/env node
/**
 * MetadataWriter emission — Eventbrite.
 *
 * Populates Integration-row non-identity slots + Configuration JSON blob via the
 * mj-metadata MCP (StdioClientTransport, real MCP protocol call — not a direct
 * file write). Every non-default value cites PROVENANCE.json (docs prose,
 * ExplicitStatement) sourced from the Tier-1 Apiary API Blueprint saved raw at
 * packages/Integration/connectors-registry/eventbrite/sources/eventbrite-v3-api-blueprint.apib.
 *
 * Source of truth for every claim below: SOURCE_STUDY.md (Eventbrite) sections
 * "Pagination envelope", "Authentication", "Rate limits" — all excerpts re-quoted
 * here are grep-verified against the raw .apib bytes (see commands run before
 * authoring this script).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'eventbrite';
const APIB_URL = 'https://jsapi.apiary.io/apis/eventbriteapiv3public/reference.apib';
const NOW = new Date().toISOString();

async function withClient(fn) {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [SERVER_PATH],
        env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: `${REPO_ROOT}/packages/Integration/connectors-registry`,
            MJ_METADATA_ROOT: `${REPO_ROOT}/metadata/integrations`,
        },
    });
    const client = new Client({ name: 'metadata-writer-eventbrite', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    try {
        return await fn(client);
    } finally {
        await client.close();
    }
}

async function callTool(client, name, args) {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? '';
    if (res.isError) throw new Error(`Tool ${name} failed: ${text}`);
    return text;
}

// ---------------------------------------------------------------------------
// Root-level Integration fields
// ---------------------------------------------------------------------------
const rootFields = {
    NavigationBaseURL: 'https://www.eventbriteapi.com/v3/',

    // Rate limit: "Hourly rate limit has been reached for this token. Default
    // rate limits are 2,000 calls per hour." (blueprint ## Errors, HTTP 429
    // HIT_RATE_LIMIT row). Encode as a 1-hour window carrying the full 2000-call
    // budget -- BatchRequestWaitTime is documented in SECONDS elsewhere in this
    // codebase (see hubspot's burstWindowSeconds convention), so 1 hour = 3600s.
    BatchMaxRequestCount: 2000,
    BatchRequestWaitTime: 3600,

    Configuration: {
        // ---- universalPK ----
        // Tier-1 signal: every COVERABLE object's Get-one APIPath ends in a
        // {name}_id/{id} path param that matches the object's own `id` field,
        // and the vendor's own Basic Types section documents id as a string on
        // the wire despite representing an integer underneath (SOURCE_STUDY.md
        // "Multi-source PK/FK detection inputs" -- Tier-1 PK signal, confirmed
        // across all 31 leaves). This is a genuine vendor-wide convention.
        universalPK: { fieldName: 'id' },

        // ---- Auth ----
        // Blueprint ## Authentication: OAuth 2.0 authorization-code (server-side,
        // recommended) or implicit (client-side) flow, PLUS a static "Private
        // Token" issued out-of-band from the API Keys page that is used exactly
        // like an OAuth2 access token (same Bearer header). The Bearer-header
        // shape is identical regardless of which path mints the token, so the
        // connector-facing AuthFlow is oauth2-authcode (the general case; a
        // Private Token is simply a pre-minted access token used the same way).
        AuthFlow: 'oauth2-authcode',
        AuthFlowNote:
            'Blueprint documents two paths to the SAME Bearer-token credential shape: (1) OAuth 2.0 authorization-code flow -- authorize at https://www.eventbrite.com/oauth/authorize?response_type=code&client_id=...&redirect_uri=..., exchange the code via POST https://www.eventbrite.com/oauth/token (grant_type=authorization_code + client_id + client_secret + code + redirect_uri); (2) a static "Private Token" obtained from the account\'s API Keys page (https://www.eventbrite.com/platform/api-keys) for first-party single-account use, functioning as a pre-minted access token with no refresh flow of its own. A client-side (implicit, response_type=token) OAuth variant is also documented but not recommended by the vendor. Every documented endpoint example uses "Authorization: Bearer PERSONAL_OAUTH_TOKEN" regardless of which path minted the token.',
        AuthHeaderPattern: 'Authorization: Bearer <token>',
        OAuthEndpoints: {
            authorizationUrl: 'https://www.eventbrite.com/oauth/authorize',
            tokenUrl: 'https://www.eventbrite.com/oauth/token',
            note:
                'Server-side (recommended): GET authorizationUrl?response_type=code&client_id=<API_KEY>&redirect_uri=<REDIRECT_URI> -> redirect carries ?code=<ACCESS_CODE> -> POST tokenUrl (content-type: application/x-www-form-urlencoded; grant_type=authorization_code, client_id, client_secret, code, redirect_uri) -> JSON response contains the user\'s private/access token. Client-side (implicit, not recommended by vendor): GET authorizationUrl?response_type=token&client_id=...&redirect_uri=... -> redirect carries the token directly as a query param, no token-exchange step.',
        },
        TokenRefreshStrategy: null,
        TokenRefreshStrategyNote:
            'UNDOCUMENTED. The blueprint\'s Authentication section describes only the authorization-code exchange (code -> access/private token) and does not document a refresh_token grant, a token expiry/TTL, or a refresh endpoint anywhere in the 6,932-line source. Eventbrite\'s "Private Token" model (a long-lived, manually-issued token from the API Keys page) suggests tokens may not expire in the conventional OAuth2 sense, but this is not explicitly stated. Left null rather than fabricated per the InferredFromContext-rejected-for-hard-constraints rule; the connector should treat 401 INVALID_AUTH as the signal to re-run the authorization flow rather than assume a refresh_token grant exists.',

        // ---- Pagination ----
        // PaginationType enum is {None, Cursor, Offset, PageNumber} -- Cursor is
        // correct for the continuation-token mechanism. Full mechanics captured
        // both here (Configuration.PaginationDefaults) and per-IO where the
        // source shows a pagination block.
        PaginationDefaults: {
            type: 'Cursor',
            envelopeKey: 'pagination',
            dataKeyNote:
                'The array-of-records key varies per endpoint (plural snake_case resource name, e.g. "categories", "events", "attendees") -- see per-IO ResponseDataKey, not a single vendor-wide constant.',
            continuationParam: 'continuation',
            continuationTokenField: 'pagination.continuation',
            hasMoreField: 'pagination.has_more_items',
            objectCountField: 'pagination.object_count',
            pageCountField: 'pagination.page_count',
            pageSizeField: 'pagination.page_size',
            pageNumberField: 'pagination.page_number',
            advanceProtocol:
                '1. Call the listing endpoint. 2. Check pagination.has_more_items === true before continuing (false means no more pages, stop). 3. Copy pagination.continuation token from the response. 4. Re-issue the SAME request with ?continuation=<token> appended as a query-string parameter. 5. Repeat until has_more_items is false. When all records have been retrieved, calling with the last continuation token returns an empty list of objects (per the vendor\'s own worked example).',
            note:
                'Verbatim envelope shape (blueprint ## Paginated Responses, lines 173-230): {"pagination":{"object_count":4,"continuation":"AEtFRy...","page_count":2,"page_size":2,"has_more_items":true,"page_number":1},"<plural_resource_key>":[{...}]}. A minority of list endpoints (Format, Discount-by-org, Ticket-Group-by-org, Seat Map) show no pagination block in their documented Response 200 Attributes -- treated as SupportsPagination=false per-IO on the honest-absence rule; flagged as a soft gap for live-probe cross-check, not asserted either way.',
        },

        IncrementalSyncCapability: {
            supported: false,
            note:
                'No vendor-documented incremental/delta query parameter (e.g. an updated-since filter or changed-after watermark) was found anywhere in the 6,932-line Tier-1 blueprint for any of the 31 coverable list endpoints. Objects DO carry created/changed timestamp fields (per the blueprint\'s own motif notes in SOURCE_STUDY.md), but no endpoint documents a query param that filters/sorts by them for incremental sync. Left false at the integration level per the InferredFromContext-rejected-for-hard-constraints rule -- do not set SupportsIncrementalSync=true on any IO without an explicit documented watermark query parameter.',
        },

        WebhooksAvailable: true,
        WebhooksNote:
            'Blueprint documents a full Webhooks resource group: GET/POST /organizations/{organization_id}/webhooks/ (list/create) and DELETE /webhooks/{id}/ (delete). Create Webhook accepts an "actions" array from a documented trigger-action vocabulary (event.created, event.published, event.unpublished, event.updated, order.placed, order.refunded, order.updated, organizer.updated, attendee.updated, attendee.checked_in, attendee.checked_out, ticket_class.created, ticket_class.updated, ticket_class.deleted, venue.updated -- blueprint ### Create Webhook (object) MSON definition, ~lines 5696-5711). A legacy, non-organization-scoped /webhooks/ (GET/POST) is explicitly marked deprecated (effective 2020-06-01) via an inline > Warning: blockquote; the connector should target the organization-scoped endpoints only.',
        WebhooksSignatureAlgorithm: null,
        WebhooksSignatureAlgorithmNote:
            'UNDOCUMENTED. No HMAC/signature-header verification scheme for inbound webhook payloads is described anywhere in this Tier-1 source (searched the full Webhooks resource group and the ## Authentication section). Left null rather than guessed.',

        BulkOperationsAvailable: false,
        BulkOperationsNote:
            'No batch/bulk create-update-delete endpoint (a single request carrying multiple records) is documented anywhere in the 102 cataloged operations. Every write operation (Create/Update/Delete Event, Ticket Class, Venue, Discount, Inventory Tier, etc.) is single-record. The blueprint\'s ## Errors table DOES list a 400 INVALID_BATCH ("Batched request is missing or invalid") error code, which is suggestive that SOME batch mechanism exists in the live API surface, but no batch endpoint path/shape is documented in this source -- treated as a soft gap (flagged, not asserted true) rather than inferred from the error-code\'s mere existence.',

        APIVersioningStrategy: 'url-path',
        APIVersioningNote:
            'HOST directive (blueprint line 2): "HOST: https://www.eventbriteapi.com/v3/" -- the API version ("v3") is embedded directly in the base URL path segment, confirmed by every single one of the 102 documented endpoint paths being relative to this v3-suffixed host with no separate version header or query param anywhere in the source.',

        ErrorResponseShape: {
            shape: '{ "error": "<CONSTANT_STRING_CODE>", "error_description": "<human-readable string>", "status_code": <int, mirrors HTTP status> }',
            example: '{"error":"VENUE_AND_ONLINE","error_description":"You cannot both specify a venue and set online_event","status_code":400}',
            note:
                'Verbatim from blueprint ## Errors: "When an error occurs during an API request, you will receive: An HTTP error status (in the 400-500 range); A JSON response containing more information about the error." The vendor explicitly states error handling logic should key off the constant "error" string, not the description text (which may vary). Common cross-endpoint error codes documented: 301 PERMANENTLY_MOVED, 400 ACTION_NOT_PROCESSED/ARGUMENTS_ERROR/BAD_CONTINUATION_TOKEN/BAD_PAGE/BAD_REQUEST/INVALID_ARGUMENT/INVALID_AUTH/INVALID_AUTH_HEADER/INVALID_BATCH/INVALID_BODY/UNSUPPORTED_OPERATION, 401 ACCESS_DENIED/NO_AUTH, 403 NOT_AUTHORIZED, 404 NOT_FOUND, 405 METHOD_NOT_ALLOWED, 409 REQUEST_CONFLICT, 429 HIT_RATE_LIMIT, 500 EXPANSION_FAILED/INTERNAL_ERROR.',
        },

        CustomObjectMarkerPattern: null,
        CustomObjectMarkerPatternNote:
            'No vendor-documented naming convention for customer-defined custom OBJECTS was found. Eventbrite\'s extensibility surface (per this Tier-1 source) is limited to organizer-authored custom Questions (the "Question" / "Canned Question" resource groups, which are themselves fully-cataloged first-class objects, not a dynamically-named custom-object family) -- there is no HubSpot-style p_<accountID>_<name> custom-object pattern documented.',

        CustomFieldMarkerPattern: null,
        CustomFieldMarkerPatternNote:
            'No vendor-documented naming/prefix convention for customer-defined custom FIELDS was found on any of the 31 coverable objects. Organizer-authored extensibility is expressed through the first-class Question/Canned Question resources (event-scoped, independently listable/creatable/deletable objects with their own APIPath -- see IO catalog), not through dynamically-named custom-field suffixes/prefixes on existing objects.',

        WriteCapability: {
            supported: true,
            scope: 'Mixed -- full CRUD on Event, Ticket Class (no delete), Venue (no delete), Discount, Inventory Tier, Ticket Group; create-only on Event Team, Seat Map (assign), Webhook (+ delete), Structured Content Page, Text Overrides, Ticket Buyer Settings, Display Settings, Event Capacity Tier, Event Schedule (create-only); read-only on Attendee, Order, Category, Subcategory, Format, Organization, Organization Role, Organization Member, Fee Rate, User, Balance, Event Description, Sales Report, Attendee Report.',
            create: 'Yes, on 16 of 31 objects (see per-IO CreateAPIPath/CreateMethod) -- e.g. POST /organizations/{organization_id}/events/ (Event), POST /events/{event_id}/ticket_classes/ (Ticket Class), POST /organizations/{organization_id}/venues/ (Venue).',
            update: 'Yes, on most create-capable objects via a POST to the get-one path (Eventbrite uses POST, not PATCH/PUT, for update -- e.g. POST /events/{event_id}/ updates an existing Event).',
            delete: 'Yes, on a SUBSET of create-capable objects only -- DELETE /events/{event_id}/, DELETE /ticket_groups/{ticket_group_id}/, DELETE /discounts/{discount_id}/, DELETE /events/{event_id}/inventory_tiers/{inventory_tier_id}/, DELETE /event/{event_id}/canned_questions/{question_id}, DELETE /events/{event_id}/questions/{question_id}/, DELETE /webhooks/{id}/. Ticket Class and Venue document Create+Update but NO delete endpoint in this Tier-1 source.',
            sourceUrl: APIB_URL,
            note: 'Per-object write-surface detail lives on each IO row (SupportsCreate/Update/Delete + Create/Update/DeleteAPIPath+Method) -- this is the vendor-wide summary. Attendee and Order are READ-ONLY in this source: Attendees are created only indirectly via the Order/checkout flow (no direct Attendee create endpoint), and no write endpoint of any kind is documented for Orders.',
        },

        ConcurrencyControl: 'none',
        ConcurrencyControlNote:
            'No ETag, If-Match, If-Unmodified-Since header, or a version/revision field is documented on any of the 31 coverable objects or in the ## Authentication / ## Errors / write-operation sections of this Tier-1 source. Objects do carry created/changed timestamp fields (informational, not a concurrency-control mechanism per the source). Conflict resolution for any future bidirectional EntityMap must use snapshot-3-way only -- do not recommend MostRecent.',

        DeleteSemantics: 'hard',
        DeleteSemanticsDetail:
            'Every documented DELETE operation (Event, Ticket Group, Discount, Inventory Tier, Canned Question, Question, Webhook) returns a plain success/error response with no soft-delete/archive flag or tombstone field documented anywhere in this source -- e.g. "DELETE /events/{event_id}/" has no accompanying "is_deleted"/"archived"/"status=deleted" field on the Event MSON type. Treated as hard delete per the honest-absence rule (no soft-delete field documented -> do not assume one exists). Note Event DOES carry a "status" field with documented values including "draft"/"live"/"started"/"ended"/"completed"/"canceled" -- "canceled" is a lifecycle state set via Update (POST), NOT the outcome of the DELETE operation, so it does not change this delete-semantics verdict for the DELETE endpoint itself.',

        DefaultSyncDirection: 'Pull',
        DefaultSyncDirectionNote:
            'Read-only default for every object per connector-code-conventions.md safety discipline, regardless of the substantial documented write surface on 16 of 31 objects. Bidirectional sync requires sandbox validation first -- see BidirectionalPreconditions below.',

        DefaultConflictResolution: 'DestWins',
        DefaultConflictResolutionReason:
            'ConcurrencyControl=none (no ETag/If-Match/version field documented anywhere in this Tier-1 source) rules out MostRecent as a safe default -- MostRecent requires a reliable revision/timestamp-of-write signal to arbitrate conflicts, which Eventbrite does not expose. DestWins is the conservative default if/when any of the 16 write-capable objects (Event, Ticket Class, Venue, Discount, Inventory Tier, Ticket Group, Event Team, Webhook, etc.) is ever enabled for bidirectional sync -- it overwrites the MJ destination with Eventbrite\'s source-of-truth on pull, avoiding silent conflict-loss in either direction until a real concurrency signal is discovered.',

        BidirectionalPreconditions: [
            'Obtain a live/sandbox Eventbrite credential (OAuth2 authcode exchange or a Private Token from a test account) and empirically confirm the actual request/response shape of each write path (Event/Ticket Class/Venue/Discount/Inventory Tier/Ticket Group create+update, plus the 7 delete-capable objects) -- currently known only from the Apiary blueprint\'s documented MSON request/response shapes, never from a live round-trip.',
            'Confirm whether Eventbrite exposes a soft-delete/archive/status-based recovery path before treating any DELETE as safe to run against a client\'s real event data -- current evidence (no soft-delete field documented) implies hard delete with no recovery.',
            'Confirm whether a concurrency signal (ETag/version/last-modified-on-write) exists on the live API -- current evidence (none discovered) implies conflict resolution can only be snapshot-3-way, materially weaker than MostRecent.',
            'Confirm the true token-refresh/expiry behavior (currently UNDOCUMENTED -- no refresh_token grant or TTL is stated) so credential rotation and long-running-sync retry semantics can be implemented correctly.',
            'Validate write behavior (especially DELETE on Event/Discount/Inventory Tier/Ticket Group/Webhook/Question) against a sandbox/test Eventbrite organization before any bidirectional EntityMap touches a client\'s real event/attendee/order data -- per the read-first, bidirectional-opt-in discipline, this must never be turned on by default.',
        ],

        RateLimitPolicy: {
            tokensPerSec: 0.5556,
            windowSeconds: 3600,
            callsPerWindow: 2000,
            retryAfterHeaderDocumented: false,
            note:
                'Verbatim: "429 / HIT_RATE_LIMIT / Hourly rate limit has been reached for this token. Default rate limits are 2,000 calls per hour." (blueprint ## Errors table). No Retry-After header format, burst allowance, or per-endpoint override is documented in this source -- tokensPerSec (2000/3600 = 0.5556) is a smoothed derivation of the stated hourly ceiling, not an independently vendor-stated per-second rate. ExtractRetryAfterMs would need live-probe header inspection to confirm shape; left as a soft gap.',
        },

        DiscoveryIsAuthoritative: false,
        DiscoveryIsAuthoritativeRationale:
            'BaseRESTIntegrationConnector default (cache-driven IntrospectSchema re-reading persisted ACTIVE metadata) applies -- Eventbrite has no documented schema/describe/introspection endpoint in this Tier-1 source that enumerates the FULL set of objects/fields a given credential can access (the ## Data Structures section is vendor API documentation, not a live discoverable endpoint). Runtime DiscoverObjects/DiscoverFields for this connector, if implemented, would be scoped/partial at best -- absence-based deactivation must stay off per connector-code-conventions.md.',

        OutOfScopeObjectFamilies: [
            {
                family: 'Campaigns',
                reason:
                    'MSON types documented (Campaign, Campaign Stats/Status/Template/Invoice) but no top-level CRUD APIPath discovered in this Tier-1 source; referenced only as nested context, not a fetchable resource.',
            },
            {
                family: 'Contact Lists',
                reason:
                    'MSON types documented (Contact List, Contact List Item/Preferences/Type) but no top-level CRUD APIPath discovered; referenced only via Attendee/Order.contact_list_preferences nested field.',
            },
            {
                family: 'Collections',
                reason:
                    'MSON type documented (Collection, with id/name/slug/status fields) but no top-level CRUD APIPath discovered; referenced only via Events-list\'s collection_id/collection_ids_to_exclude filter params.',
            },
        ],
    },
};

// ---------------------------------------------------------------------------
// Provenance entries -- one per non-default TargetField (grouped where the
// source co-states multiple facts in the same excerpt, per
// connector-provenance-conventions.md).
// ---------------------------------------------------------------------------
const provenanceEntries = [
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Confirming the v3 API base URL (HOST directive) for Configuration/NavigationBaseURL and the URL-path API versioning strategy.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.NavigationBaseURL',
        Excerpt: 'HOST: https://www.eventbriteapi.com/v3/ (blueprint line 2). "All URLs referenced in the API documentation have the following base: https://www.eventbrite.com/v3." (prose restatement, line 14).',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Establishing Configuration.APIVersioningStrategy=url-path -- the v3 version segment is embedded directly in the HOST base URL, with no separate version header/param used by any of the 102 documented endpoints.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.APIVersioningStrategy',
        Excerpt: 'HOST: https://www.eventbriteapi.com/v3/',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Confirming the documented hourly rate limit (429 HIT_RATE_LIMIT) used to derive BatchMaxRequestCount/BatchRequestWaitTime and Configuration.RateLimitPolicy.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.BatchMaxRequestCount',
        Excerpt: '429 | HIT_RATE_LIMIT | Hourly rate limit has been reached for this token. Default rate limits are 2,000 calls per hour.',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Same rate-limit statement supports BatchRequestWaitTime (the 1-hour/3600s window the 2,000-call budget replenishes over) and Configuration.RateLimitPolicy.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.BatchRequestWaitTime',
        Excerpt: '429 | HIT_RATE_LIMIT | Hourly rate limit has been reached for this token. Default rate limits are 2,000 calls per hour.',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Establishing Configuration.AuthFlow=oauth2-authcode, AuthHeaderPattern, and OAuthEndpoints (authorize + token URLs) -- co-stated in the same Authentication section walkthrough.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: [
            'integration.Configuration.AuthFlow',
            'integration.Configuration.AuthHeaderPattern',
            'integration.Configuration.OAuthEndpoints',
        ],
        Excerpt: 'Server-Side Authorization: redirect to https://www.eventbrite.com/oauth/authorize?response_type=code&client_id=YOUR_API_KEY&redirect_uri=YOUR_REDIRECT_URI, then POST https://www.eventbrite.com/oauth/token with grant_type=authorization_code + client_id + client_secret + code + redirect_uri. "To authenticate API requests... Include the following in your Authorization header: { Authorization: Bearer MYTOKEN }".',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Negative evidence for Configuration.TokenRefreshStrategy -- no refresh_token grant, token TTL, or refresh endpoint is documented anywhere in the Authentication section.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.TokenRefreshStrategy',
        Excerpt: 'Section "## Authentication" (full walkthrough, lines 18-119) documents Private Token acquisition + OAuth2 authorization-code/implicit flows only; no refresh_token grant or token-expiry statement appears anywhere in this section or the rest of the 6,932-line document (confirmed via full-text search).',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Establishing the full pagination envelope shape + continuation-token advance protocol for Configuration.PaginationDefaults and integration-level PaginationType=Cursor.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.PaginationDefaults',
        Excerpt: '{"pagination":{"object_count":4,"continuation":"AEtFRy...","page_count":2,"page_size":2,"has_more_items":true,"page_number":1},"categories":[...]}. "continuation: The continuation token you\'ll use to get to the next set of results by making the same request again but including this token... When all records have been retrieved, the continuation token will return an empty list of objects." "has_more_items: Boolean indicating whether or not there are more items in your response... When all records have been retrieved, this attribute will be \'false\'."',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Negative evidence for Configuration.IncrementalSyncCapability -- no incremental/delta/updated-since query parameter is documented on any of the 31 coverable list endpoints.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.IncrementalSyncCapability',
        Excerpt: 'Full-text search of all 102 documented endpoint + Parameters blocks across the 6,932-line source found no updated_since / changed_after / delta / incremental query parameter on any listing endpoint.',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Establishing Configuration.WebhooksAvailable=true and the webhook trigger-action vocabulary, from the dedicated Webhooks resource group (GET/POST /organizations/{organization_id}/webhooks/, DELETE /webhooks/{id}/).',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.WebhooksAvailable',
        Excerpt: 'Group Webhooks: GET /organizations/{organization_id}/webhooks/ (list), POST /organizations/{organization_id}/webhooks/ (create, with "actions" array param), DELETE /webhooks/{id}/ (delete). Create Webhook MSON (~lines 5696-5711) enumerates the actions vocabulary: event.created, event.published, event.unpublished, event.updated, order.placed, order.refunded, order.updated, organizer.updated, attendee.updated, attendee.checked_in, attendee.checked_out, ticket_class.created, ticket_class.updated, ticket_class.deleted, venue.updated. Legacy non-scoped /webhooks/ (GET/POST) is marked deprecated effective 2020-06-01 via inline "> Warning:" blockquote.',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Negative evidence for Configuration.BulkOperationsAvailable -- no batch create/update/delete endpoint is documented across the 102 cataloged operations, though a 400 INVALID_BATCH error code exists (suggestive but not conclusive).',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.BulkOperationsAvailable',
        Excerpt: 'Every one of the 102 cataloged endpoint operations (SOURCE_STUDY.md enumeration) is single-record CRUD; no endpoint path or operation title contains "batch"/"bulk". Common Errors table lists "400 | INVALID_BATCH | Batched request is missing or invalid." with no corresponding documented batch endpoint.',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Establishing Configuration.ErrorResponseShape -- the vendor-wide error envelope and the common cross-endpoint error-code table.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.ErrorResponseShape',
        Excerpt: '"When an error occurs during an API request, you will receive: An HTTP error status (in the 400-500 range); A JSON response containing more information about the error." Example: {"error":"VENUE_AND_ONLINE","error_description":"You cannot both specify a venue and set online_event","status_code":400}. "This constant value is what you should base your error handling logic on, because this string won\'t change depending on the locale or as the API changes over time."',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Negative evidence for Configuration.CustomObjectMarkerPattern and Configuration.CustomFieldMarkerPattern -- no vendor-documented naming convention for customer-defined custom objects/fields was found anywhere in the source; the only organizer-extensibility surface is the first-class Question/Canned Question resource groups.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: [
            'integration.Configuration.CustomObjectMarkerPattern',
            'integration.Configuration.CustomFieldMarkerPattern',
        ],
        Excerpt: 'Full-text search of the 6,932-line source for a custom-object/custom-field naming-prefix convention (comparable to HubSpot\'s p_<accountID>_<name>) returned no matches. Organizer-authored extensibility is expressed only through the fully-cataloged "Question" (custom, event-scoped) and "Canned Question" (pre-defined templates) resource groups, each with their own APIPath and CRUD surface -- not a dynamically-named custom-field suffix/prefix mechanism.',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Establishing Configuration.WriteCapability -- vendor-wide summary of which of the 31 coverable objects support Create/Update/Delete, cross-referenced against SOURCE_STUDY.md\'s per-object CRUD table (built from the same source).',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.WriteCapability',
        Excerpt: 'Per-object POST (create/update) and DELETE operations are documented for 16 of 31 coverable objects, cataloged individually in SOURCE_STUDY.md\'s COVERABLE taxonomy table (e.g. "POST /organizations/{organization_id}/events/" create + "POST /events/{event_id}/" update + "DELETE /events/{event_id}/" delete for Event). Attendee and Order have zero documented write operations anywhere in the 102-endpoint catalog.',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Negative evidence for Configuration.ConcurrencyControl=none -- no ETag/If-Match/version field is documented on any object or write operation.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.ConcurrencyControl',
        Excerpt: 'Full-text search of the source for "ETag", "If-Match", "If-Unmodified-Since", and "version" (as a concurrency field, distinct from the unrelated FORMAT:1A blueprint-format version marker) returned no concurrency-control header or field documented on any of the 31 coverable objects or their write operations.',
    },
    {
        URL: APIB_URL,
        AccessedAt: NOW,
        UsedFor: 'Negative evidence for Configuration.DeleteSemantics=hard -- no soft-delete/archive/tombstone field is documented on any object whose DELETE operation is cataloged.',
        SourceTier: 1,
        SourceCategory: 'OpenAPISpec',
        EvidenceStrength: 'ExplicitStatement',
        TargetField: 'integration.Configuration.DeleteSemantics',
        Excerpt: 'DELETE /events/{event_id}/, DELETE /ticket_groups/{ticket_group_id}/, DELETE /discounts/{discount_id}/, DELETE /events/{event_id}/inventory_tiers/{inventory_tier_id}/, DELETE /event/{event_id}/canned_questions/{question_id}, DELETE /events/{event_id}/questions/{question_id}/, DELETE /webhooks/{id}/ -- none of the corresponding MSON response/object type definitions (Event, Ticket Group, Discount, Inventory Tier, Canned Question, Base Question, Webhook) carries an is_deleted/archived/deleted_at/tombstone field.',
    },
];

async function main() {
    await withClient(async (client) => {
        // 1. Root-level Integration fields (NavigationBaseURL, batch limits, Configuration).
        const upsertMsg = await callTool(client, 'upsert_integration_fields', {
            connector: CONNECTOR,
            fields: rootFields,
        });
        console.log('[upsert_integration_fields]', upsertMsg);

        // 2. Provenance entries. The Zod schema requires TargetField: string (no
        // array convention exists in prior connectors' PROVENANCE.json) -- flatten
        // any co-stated-fields array authored above into one entry per field,
        // per connector-provenance-conventions.md's "one entry per (URL,TargetField)
        // pair (or per (URL, TargetField-group) when the columns are clearly
        // co-stated)" allowance, expressed here as N sibling entries sharing the
        // same URL/Excerpt/UsedFor rather than a single array-valued entry.
        for (const entry of provenanceEntries) {
            const targets = Array.isArray(entry.TargetField) ? entry.TargetField : [entry.TargetField];
            for (const TargetField of targets) {
                const single = { ...entry, TargetField };
                const msg = await callTool(client, 'append_provenance', { connector: CONNECTOR, entry: single });
                console.log('[append_provenance]', TargetField, '->', msg);
            }
        }
    });

    console.log(JSON.stringify({
        status: 'ok',
        connector: CONNECTOR,
        rootFieldsKeys: Object.keys(rootFields),
        configurationKeys: Object.keys(rootFields.Configuration),
        provenanceEntriesWritten: provenanceEntries.length,
    }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
