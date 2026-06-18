-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606071200__v5.40.x__Magic_Link.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* ============================================================================ */ /* Migration: Magic Link (consolidated) */ /* Consolidates the magic-link feature DDL + seed into one migration: */ /*   1) MagicLinkInvite base table        (was V202605311600) */ /*   2) MagicLinkRedemption audit table   (was V202606050949) */ /*   3) RLS filters for identity reads    (was V202606051040) */ /*   4) Invite child tables (apps/roles/domains/paths) (was V202606051243) */ /*   5) Anonymous principal + resource/embed/tier columns (was V202606051319) */ /* The CodeGen output (entities, views, sprocs, permissions) is appended below */ /* the CODE GEN RUN banner after a fresh `mj codegen` against a clean DB. */ /* Metadata-file seeds (audit-log-types, entity-permission ReadRLSFilterID) are */ /* applied separately via `mj sync push` (MJ convention for lookup/reference data). */ /* ============================================================================ */ /* Migration: Create MagicLinkInvite table */ /* Description: Backing store for shareable, single-use, app-scoped magic-link */ /*   invites that let EXTERNAL users into MJ without a password and without */ /*   access to the whole Explorer. Each invite is bound to one Application and */ /*   one (restricted) Role; redeeming it provisions/links a user with exactly */ /*   that scope and mints a short-lived MJ-issued JWT. */ /* Security model (see plans/auth0-magic-link.md): */ /*   * The raw token is NEVER stored — only its SHA-256 hash (TokenHash), */ /*     mirroring the @memberjunction/api-keys pattern. The raw token lives only */ /*     in the emailed URL. */ /*   * Single-use is enforced atomically at redemption: a compare-and-swap UPDATE */ /*     (UseCount/ConsumedAt/Status, guarded by UseCount < MaxUses + Active + not */ /*     expired) runs BEFORE the JWT is minted, so concurrent redemptions of a */ /*     single-use link race on the row and exactly one wins (fail-closed). An */ /*     already-consumed, expired, or revoked invite is rejected. */ /*   * The RoleID is the real authorization boundary (entity-level permissions), */ /*     not the nav filtering. */ /* NOTE: No __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are declared */ /*   here — CodeGen generates those. The UNIQUE constraint on TokenHash IS */ /*   declared here because it is not a foreign key. */
CREATE TABLE __mj."MagicLinkInvite" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "TokenHash" VARCHAR(128) NOT NULL,
  "Email" VARCHAR(255) NOT NULL,
  "ApplicationID" UUID NOT NULL,
  "RoleID" UUID NOT NULL,
  "ExpiresAt" TIMESTAMPTZ NOT NULL,
  "ConsumedAt" TIMESTAMPTZ NULL,
  "MaxUses" INT NOT NULL DEFAULT 1,
  "UseCount" INT NOT NULL DEFAULT 0,
  "CreatedByUserID" UUID NOT NULL,
  "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT "PK_MagicLinkInvite" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_MagicLinkInvite_TokenHash" UNIQUE (
    "TokenHash"
  ),
  CONSTRAINT "FK_MagicLinkInvite_Application" FOREIGN KEY ("ApplicationID") REFERENCES __mj."Application" (
    "ID"
  ),
  CONSTRAINT "FK_MagicLinkInvite_Role" FOREIGN KEY ("RoleID") REFERENCES __mj."Role" (
    "ID"
  ),
  CONSTRAINT "FK_MagicLinkInvite_CreatedByUser" FOREIGN KEY ("CreatedByUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "CK_MagicLinkInvite_Status" CHECK ("Status" IN ('Active', 'Consumed', 'Revoked', 'Expired')),
  CONSTRAINT "CK_MagicLinkInvite_UseCount" CHECK ("UseCount" >= 0 AND "UseCount" <= "MaxUses")
);

COMMENT ON TABLE __mj."MagicLinkInvite" IS 'A shareable, single-use, app-scoped magic-link invite for an external user. Bound to one Application and one restricted Role; redeeming it provisions/links a user with that scope and mints a short-lived MJ-issued JWT. The raw token is never stored — only its SHA-256 hash.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."TokenHash" IS 'SHA-256 hash (hex) of the raw magic-link token. The raw token is delivered only in the emailed URL and is never persisted. Lookups hash the incoming token and match against this column. Unique.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."Email" IS 'Email address the invite was issued to and delivered at. Becomes the provisioned user''s email on first redemption.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."ApplicationID" IS 'Foreign key to Application — the single app this invite grants access to. The provisioned user receives exactly one User Application record for this app.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."RoleID" IS 'Foreign key to Role — the restricted role assigned to the redeeming user. This role''s entity permissions are the real authorization boundary that confines the external user to the shared app''s data.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."ExpiresAt" IS 'Hard expiry for the link. After this instant the invite cannot be redeemed regardless of Status.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."ConsumedAt" IS 'Timestamp of the first successful redemption. NULL while unconsumed. Set in the same transaction that mints the session JWT to enforce single-use semantics.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."MaxUses" IS 'Maximum number of times this invite may be redeemed. Defaults to 1 (true single-use). Set higher only for intentionally multi-use links.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."UseCount" IS 'Number of times this invite has been redeemed so far. Incremented on each successful redemption; redemption is rejected once UseCount reaches MaxUses.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."CreatedByUserID" IS 'Foreign key to User — the internal user who created/shared this invite. Audit trail for who granted external access.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."Status" IS 'Lifecycle status: Active (redeemable), Consumed (single-use link fully redeemed), Revoked (manually disabled), Expired (past ExpiresAt). Revoking an unconsumed link is the primary revocation mechanism.';

/* Migration: Create MagicLinkRedemption table + correct TokenHash description */ /* Description: Per-redemption audit trail for magic-link invites (Phase 1 of the */ /*   magic-link expansion/hardening plan, item #8). Today MagicLinkInvite keeps */ /*   only UseCount + last ConsumedAt — no per-use history, no IP/User-Agent, and */ /*   no record of FAILED attempts. This table records one row per redemption */ /*   ATTEMPT (success or failure), which: */ /*     * gives Skip-style resource sharing a clean redemption history, and */ /*     * surfaces token scanning / brute-force (a burst of `not_found` rows from */ /*       one IP is the signal), which is why failures are logged too. */ /* Design notes: */ /*   * InviteID is NULLABLE on purpose: a `not_found` attempt (random/guessed */ /*     token that matches no invite) has no invite to reference, yet is exactly */ /*     the attempt we most want logged. Successful + invite-bound failures carry */ /*     the FK. */ /*   * ProvisionedUserID is NULLABLE: only a successful redemption provisions a */ /*     user; failures (and future anonymous redemptions) leave it null. */ /*   * Outcome is `success` plus the RedeemErrorCode union from */ /*     auth/magicLink/types.ts — kept in sync via the CHECK constraint below. */ /*   * Retention + IP anonymization are deployment policy (config */ /*     magicLink.audit.retentionDays / audit.ipStorage), enforced in app code + */ /*     a scheduled purge — NOT in the schema. The column simply holds whatever */ /*     the app chose to store. */ /* NOTE: No __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are declared */ /*   here — CodeGen generates those. */
CREATE TABLE __mj."MagicLinkRedemption" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "InviteID" UUID NULL,
  "AttemptedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "Outcome" VARCHAR(30) NOT NULL,
  "IPAddress" VARCHAR(64) NULL,
  "UserAgent" VARCHAR(512) NULL,
  "Origin" VARCHAR(512) NULL,
  "ProvisionedUserID" UUID NULL,
  CONSTRAINT "PK_MagicLinkRedemption" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MagicLinkRedemption_Invite" FOREIGN KEY ("InviteID") REFERENCES __mj."MagicLinkInvite" (
    "ID"
  ),
  CONSTRAINT "FK_MagicLinkRedemption_ProvisionedUser" FOREIGN KEY ("ProvisionedUserID") REFERENCES __mj."User" (
    "ID"
  ),
  CONSTRAINT "CK_MagicLinkRedemption_Outcome" CHECK ("Outcome" IN (
    'success',
    'not_found',
    'expired',
    'consumed',
    'revoked',
    'invalid',
    'provisioning_failed',
    'server_error'
  ))
);

COMMENT ON TABLE __mj."MagicLinkRedemption" IS 'One row per magic-link redemption ATTEMPT (success or failure). Provides per-use redemption history and forensic visibility into token scanning/brute-force. Distinct from MagicLinkInvite, which keeps only an aggregate UseCount + last ConsumedAt.';

COMMENT ON COLUMN __mj."MagicLinkRedemption"."InviteID" IS 'Foreign key to MagicLinkInvite. NULLABLE: a redemption attempt against a token that matches no invite (not_found — the signature of scanning/brute-force) has no invite to reference but is still logged.';

COMMENT ON COLUMN __mj."MagicLinkRedemption"."AttemptedAt" IS 'Timestamp of the redemption attempt (UTC). Defaults to the time of insert.';

COMMENT ON COLUMN __mj."MagicLinkRedemption"."Outcome" IS 'Outcome of the attempt: ''success'', or one of the redemption error codes (not_found, expired, consumed, revoked, invalid, provisioning_failed, server_error). Mirrors the RedeemErrorCode union in the server code.';

COMMENT ON COLUMN __mj."MagicLinkRedemption"."IPAddress" IS 'Client IP address the redemption came from, as captured by the request middleware. May be stored full, truncated, hashed, or omitted per the deployment''s magicLink.audit.ipStorage policy. NULL when unavailable or policy is ''none''.';

COMMENT ON COLUMN __mj."MagicLinkRedemption"."UserAgent" IS 'User-Agent header of the redeeming client. NULL when unavailable.';

COMMENT ON COLUMN __mj."MagicLinkRedemption"."Origin" IS 'Origin header of the redemption request. Retained for embed/domain forensics (which host framed or initiated the redemption). NULL for direct (non-embedded) redemptions.';

COMMENT ON COLUMN __mj."MagicLinkRedemption"."ProvisionedUserID" IS 'Foreign key to the User provisioned/linked by a SUCCESSFUL redemption. NULL on failed attempts and on (future) anonymous redemptions that resolve to a shared principal rather than a per-email user.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."TokenHash" IS 'SHA-256 hash of the raw magic-link token, base64url-encoded (43 chars). The raw token is delivered only in the emailed URL and is never persisted. Lookups hash the incoming token and match against this column. Unique.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'B3717817-E88C-4C79-87D8-0C2D4B869873') THEN
    INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description") VALUES ('B3717817-E88C-4C79-87D8-0C2D4B869873', 'Magic Link: Own Rows by UserID', 'UserID = ''{{UserID}}''', 'Restricts an entity (keyed by UserID) to the current user''s own rows. Attached to the Magic Link Baseline role''s read permission on User Roles and User Applications so a magic-link guest resolves only its own identity/app scope, never the whole table.');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."RowLevelSecurityFilter" WHERE "ID" = 'C04BCFB7-B880-44A6-9D6E-1633A4D03469') THEN
    INSERT INTO __mj."RowLevelSecurityFilter" ("ID", "Name", "FilterText", "Description") VALUES ('C04BCFB7-B880-44A6-9D6E-1633A4D03469', 'Magic Link: Own Application Roles', 'RoleID IN (SELECT RoleID FROM __mj.vwUserRoles WHERE UserID = ''{{UserID}}'')', 'Restricts Application Roles to rows for roles the current user actually holds (Application Roles has no UserID column, so it scopes via the user''s roles). Attached to the Magic Link Baseline role''s read permission on Application Roles so a magic-link guest can confirm its role can reach its app without reading every application''s role grants.');
  END IF;
END $$;

/* Migration: Magic-link invite child tables (multi-application / multi-role) */ /* Description: Phase 2 of the magic-link expansion plan — schema widening only. */ /*   Today a MagicLinkInvite carries a single ApplicationID + RoleID. The Skip-style */ /*   resource-sharing direction needs an invite to be able to grant more than one */ /*   app/role eventually. Introducing the child tables NOW (while the feature is */ /*   unpublished, so the Publish-No-Break policy doesn't bite) avoids a breaking */ /*   migration later when multi-scope enforcement is designed. */ /*   This migration is ADDITIVE and low-risk: */ /*     * The single ApplicationID / RoleID columns on MagicLinkInvite are RETAINED. */ /*       Create/redeem stay one-of-each for now (per the plan — multi-scope */ /*       *enforcement* semantics are deferred until the union model is settled). */ /*     * CreateInvite will additionally write one row into each child table so the */ /*       data is present for when reads switch to the child tables. The columns */ /*       remain the source of truth for redemption until that switch. */ /* NOTE: No __mj_CreatedAt/__mj_UpdatedAt columns and no FK indexes are declared — */ /*   CodeGen generates those. The UNIQUE constraints are declared here (not FKs). */
CREATE TABLE __mj."MagicLinkInviteApplication" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "InviteID" UUID NOT NULL,
  "ApplicationID" UUID NOT NULL,
  CONSTRAINT "PK_MagicLinkInviteApplication" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MagicLinkInviteApplication_Invite" FOREIGN KEY ("InviteID") REFERENCES __mj."MagicLinkInvite" (
    "ID"
  ),
  CONSTRAINT "FK_MagicLinkInviteApplication_Application" FOREIGN KEY ("ApplicationID") REFERENCES __mj."Application" (
    "ID"
  ),
  CONSTRAINT "UQ_MagicLinkInviteApplication" UNIQUE (
    "InviteID",
    "ApplicationID"
  )
);
CREATE TABLE __mj."MagicLinkInviteRole" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "InviteID" UUID NOT NULL,
  "RoleID" UUID NOT NULL,
  CONSTRAINT "PK_MagicLinkInviteRole" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MagicLinkInviteRole_Invite" FOREIGN KEY ("InviteID") REFERENCES __mj."MagicLinkInvite" (
    "ID"
  ),
  CONSTRAINT "FK_MagicLinkInviteRole_Role" FOREIGN KEY ("RoleID") REFERENCES __mj."Role" (
    "ID"
  ),
  CONSTRAINT "UQ_MagicLinkInviteRole" UNIQUE (
    "InviteID",
    "RoleID"
  )
);

COMMENT ON TABLE __mj."MagicLinkInviteApplication" IS 'Join row granting a magic-link invite access to one Application. An invite may eventually carry several; today create/redeem write exactly one (mirroring MagicLinkInvite.ApplicationID) while multi-scope enforcement is being designed.';

COMMENT ON COLUMN __mj."MagicLinkInviteApplication"."InviteID" IS 'Foreign key to the MagicLinkInvite this application grant belongs to.';

COMMENT ON COLUMN __mj."MagicLinkInviteApplication"."ApplicationID" IS 'Foreign key to the Application this invite grants access to.';

COMMENT ON TABLE __mj."MagicLinkInviteRole" IS 'Join row granting a magic-link invite a Role. An invite may eventually carry several; today create/redeem write exactly one (mirroring MagicLinkInvite.RoleID) while multi-scope enforcement is being designed.';

COMMENT ON COLUMN __mj."MagicLinkInviteRole"."InviteID" IS 'Foreign key to the MagicLinkInvite this role grant belongs to.';

COMMENT ON COLUMN __mj."MagicLinkInviteRole"."RoleID" IS 'Foreign key to the Role this invite grants to the redeeming user.';

ALTER TABLE __mj."MagicLinkInvite"
  ADD COLUMN "IdentityMode" VARCHAR(20) NOT NULL CONSTRAINT "DF_MagicLinkInvite_IdentityMode" DEFAULT 'email',
  ADD COLUMN "Kind" VARCHAR(30) NOT NULL CONSTRAINT "DF_MagicLinkInvite_Kind" DEFAULT 'app-session',
  ADD COLUMN "ResourceTypeID" UUID NULL,
  ADD COLUMN "ResourceID" VARCHAR(450) NULL,
  ADD CONSTRAINT "FK_MagicLinkInvite_ResourceType" FOREIGN KEY ("ResourceTypeID") REFERENCES __mj."ResourceType" (
    "ID"
  ),
  ADD CONSTRAINT "CK_MagicLinkInvite_IdentityMode" CHECK ("IdentityMode" IN ('email', 'anonymous')),
  ADD CONSTRAINT "CK_MagicLinkInvite_Kind" CHECK ("Kind" IN ('app-session', 'resource-share', 'anonymous-embed'))
 /* Migration: Magic-link expansion schema — anonymous identity, resource scope, */ /*            embed domains, and invite kind (Phases 4–7, schema only) */ /* Description: Consolidates the schema for the remaining magic-link expansion phases */ /*   into one migration (one CodeGen cycle). The per-phase BEHAVIOR ships in code on */ /*   top of these columns/tables; this migration is additive and safe to apply ahead */ /*   of that code (all new columns are nullable or defaulted). */ /*   Phase 4 (anonymous identity): MagicLinkInvite.IdentityMode + Email nullable; seed */ /*     a shared Anonymous principal (attribution anchor only — never a permission */ /*     holder; no UserRole rows are ever attached to it). */ /*   Phase 5 (resource scoping): MagicLinkInvite.ResourceTypeID/ResourceID — the single */ /*     FE resource a link shares; dependent data is admitted at runtime via FK-reachable */ /*     resource-pinned RLS (see plans/magic-link-oq1-route-resource-rbac-design.md). */ /*   Phase 6 (embed): MagicLinkInviteAllowedDomain — host allow-list for CSP frame-ancestors. */ /*   Phase 7 (tier): MagicLinkInvite.Kind — gates which scope columns/claims are valid and */ /*     which issuance capability check applies. */ /*   GO batch separators are required: statements that reference the newly-added columns */ /*   (the cross-field CHECK, extended properties) must run in a later batch than the ADD. */ /* NOTE: No __mj timestamp columns / FK indexes (CodeGen adds them). The Anonymous user */ /*   is SQL-seeded with a fixed UUID (security-sensitive system row; same pattern as the */ /*   baseline System user and the Phase-1 RLS filters). */ /* ---------------------------------------------------------------------------------- */ /* Phase 4 + 5 + 7 — new columns on MagicLinkInvite (single consolidated ALTER) */ /* ---------------------------------------------------------------------------------- */;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInvite' AND a.attname = 'Email'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInvite" ALTER COLUMN "Email" TYPE VARCHAR(255), ALTER COLUMN "Email" DROP NOT NULL;

ALTER TABLE __mj."MagicLinkInvite"
  ADD CONSTRAINT "CK_MagicLinkInvite_Email_IdentityMode" CHECK ("IdentityMode" <> 'email' OR NOT "Email" IS NULL)
 /* email-mode invites must still carry an Email; anonymous invites may omit it. */;

/* ---------------------------------------------------------------------------------- */ /* Phase 6 — per-link authorized embedding domains (CSP frame-ancestors allow-list) */ /* ---------------------------------------------------------------------------------- */
CREATE TABLE __mj."MagicLinkInviteAllowedDomain" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "InviteID" UUID NOT NULL,
  "Domain" VARCHAR(255) NOT NULL,
  CONSTRAINT "PK_MagicLinkInviteAllowedDomain" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MagicLinkInviteAllowedDomain_Invite" FOREIGN KEY ("InviteID") REFERENCES __mj."MagicLinkInvite" (
    "ID"
  ),
  CONSTRAINT "UQ_MagicLinkInviteAllowedDomain" UNIQUE (
    "InviteID",
    "Domain"
  )
);

/* ---------------------------------------------------------------------------------- */ /* Phase 5 — per-link allowed FE paths (Explorer UX confinement; NOT the security boundary) */ /* ---------------------------------------------------------------------------------- */
CREATE TABLE __mj."MagicLinkInviteAllowedPath" (
  "ID" UUID NOT NULL DEFAULT GEN_RANDOM_UUID(),
  "InviteID" UUID NOT NULL,
  "Path" VARCHAR(1000) NOT NULL,
  CONSTRAINT "PK_MagicLinkInviteAllowedPath" PRIMARY KEY ("ID"),
  CONSTRAINT "FK_MagicLinkInviteAllowedPath_Invite" FOREIGN KEY ("InviteID") REFERENCES __mj."MagicLinkInvite" (
    "ID"
  ),
  CONSTRAINT "UQ_MagicLinkInviteAllowedPath" UNIQUE (
    "InviteID",
    "Path"
  )
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."User" WHERE "ID" = '273910DF-28F1-45C1-A8F8-6E9AD8E5F008') THEN
    INSERT INTO __mj."User" ("ID", "Name", "FirstName", "LastName", "Email", "Type", "IsActive") VALUES ('273910DF-28F1-45C1-A8F8-6E9AD8E5F008', 'Anonymous', 'Anonymous', NULL, 'anonymous@magic-link.local', 'User', TRUE);
  END IF;
END $$;

COMMENT ON COLUMN __mj."MagicLinkInvite"."IdentityMode" IS 'Identity resolution mode. ''email'' (default, legacy): redemption provisions/links a per-email user and enforcement rides that user''s DB roles. ''anonymous'': all redemptions resolve to the shared Anonymous principal (an attribution anchor, not a permission holder); scope is carried per-session in the minted JWT claims, never as roles on that user.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."Kind" IS 'Invite kind, gating which scope columns/claims are valid and which issuance capability check applies. ''app-session'' (default): the legacy app+role session. ''resource-share'': scoped to a single resource (ResourceTypeID/ResourceID). ''anonymous-embed'': framed in an external site (requires allowed domains + tier capability).';

COMMENT ON COLUMN __mj."MagicLinkInvite"."ResourceTypeID" IS 'For resource-share/embed kinds: the ResourceType of the single resource this link shares. The link''s reach to dependent data is admitted at runtime via FK-reachable resource-pinned row-level security, not an enumerated list. NULL for app-session invites.';

COMMENT ON COLUMN __mj."MagicLinkInvite"."ResourceID" IS 'For resource-share/embed kinds: the primary-key value of the specific shared resource (stringified to support any resource''s key type). NULL for app-session invites.';

COMMENT ON TABLE __mj."MagicLinkInviteAllowedDomain" IS 'An external host (origin) where this invite may be embedded in an IFRAME. Enforced server-side via Content-Security-Policy frame-ancestors plus Origin/Referer checks on embed responses. Multiple rows = multiple allowed hosts.';

COMMENT ON COLUMN __mj."MagicLinkInviteAllowedDomain"."InviteID" IS 'Foreign key to the MagicLinkInvite this allowed-domain belongs to.';

COMMENT ON COLUMN __mj."MagicLinkInviteAllowedDomain"."Domain" IS 'An allowed host/origin (e.g. https://partner.example.com) where the link may be framed.';

COMMENT ON TABLE __mj."MagicLinkInviteAllowedPath" IS 'An Explorer FE path (after the base URL) this link is confined to in the UI. This is UX confinement only — the real authorization boundary is server-side entity/resource permissions. Multiple rows = multiple allowed paths.';

COMMENT ON COLUMN __mj."MagicLinkInviteAllowedPath"."InviteID" IS 'Foreign key to the MagicLinkInvite this allowed-path belongs to.';

COMMENT ON COLUMN __mj."MagicLinkInviteAllowedPath"."Path" IS 'An allowed FE path (after the Explorer base URL) the session may navigate to. UX confinement only.';

/* SQL generated to create new entity MJ: Magic Link Invites */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e41a5dee-c259-4b6e-a3c5-bb022bd5f10a',
    'MJ: Magic Link Invites',
    'Magic Link Invites',
    'A shareable, single-use, app-scoped magic-link invite for an external user. Bound to one Application and one restricted Role; redeeming it provisions/links a user with that scope and mints a short-lived MJ-issued JWT. The raw token is never stored — only its SHA-256 hash.',
    NULL,
    'MagicLinkInvite',
    'vwMagicLinkInvites',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Magic Link Invites to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'e41a5dee-c259-4b6e-a3c5-bb022bd5f10a',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invites for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e41a5dee-c259-4b6e-a3c5-bb022bd5f10a',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invites for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e41a5dee-c259-4b6e-a3c5-bb022bd5f10a',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invites for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e41a5dee-c259-4b6e-a3c5-bb022bd5f10a',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: Magic Link Redemptions */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9d479bce-5c29-4957-90e6-f350d87b38cf',
    'MJ: Magic Link Redemptions',
    'Magic Link Redemptions',
    'One row per magic-link redemption ATTEMPT (success or failure). Provides per-use redemption history and forensic visibility into token scanning/brute-force. Distinct from MagicLinkInvite, which keeps only an aggregate UseCount + last ConsumedAt.',
    NULL,
    'MagicLinkRedemption',
    'vwMagicLinkRedemptions',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Magic Link Redemptions to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    '9d479bce-5c29-4957-90e6-f350d87b38cf',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Redemptions for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9d479bce-5c29-4957-90e6-f350d87b38cf',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Redemptions for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9d479bce-5c29-4957-90e6-f350d87b38cf',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Redemptions for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '9d479bce-5c29-4957-90e6-f350d87b38cf',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: Magic Link Invite Applications */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c6988fa5-1ee9-40ee-9ba6-3096cb832208',
    'MJ: Magic Link Invite Applications',
    'Magic Link Invite Applications',
    'Join row granting a magic-link invite access to one Application. An invite may eventually carry several; today create/redeem write exactly one (mirroring MagicLinkInvite.ApplicationID) while multi-scope enforcement is being designed.',
    NULL,
    'MagicLinkInviteApplication',
    'vwMagicLinkInviteApplications',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Magic Link Invite Applications to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'c6988fa5-1ee9-40ee-9ba6-3096cb832208',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Applications for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c6988fa5-1ee9-40ee-9ba6-3096cb832208',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Applications for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c6988fa5-1ee9-40ee-9ba6-3096cb832208',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Applications for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c6988fa5-1ee9-40ee-9ba6-3096cb832208',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: Magic Link Invite Roles */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e9d66e45-4771-4d80-97d4-42007b9951fb',
    'MJ: Magic Link Invite Roles',
    'Magic Link Invite Roles',
    'Join row granting a magic-link invite a Role. An invite may eventually carry several; today create/redeem write exactly one (mirroring MagicLinkInvite.RoleID) while multi-scope enforcement is being designed.',
    NULL,
    'MagicLinkInviteRole',
    'vwMagicLinkInviteRoles',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Magic Link Invite Roles to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'e9d66e45-4771-4d80-97d4-42007b9951fb',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Roles for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e9d66e45-4771-4d80-97d4-42007b9951fb',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Roles for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e9d66e45-4771-4d80-97d4-42007b9951fb',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Roles for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e9d66e45-4771-4d80-97d4-42007b9951fb',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: Magic Link Invite Allowed Domains */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c66b6327-ecf6-47f8-a11b-b4d5e154ae51',
    'MJ: Magic Link Invite Allowed Domains',
    'Magic Link Invite Allowed Domains',
    'An external host (origin) where this invite may be embedded in an IFRAME. Enforced server-side via Content-Security-Policy frame-ancestors plus Origin/Referer checks on embed responses. Multiple rows = multiple allowed hosts.',
    NULL,
    'MagicLinkInviteAllowedDomain',
    'vwMagicLinkInviteAllowedDomains',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Magic Link Invite Allowed Domains to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'c66b6327-ecf6-47f8-a11b-b4d5e154ae51',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Domains for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c66b6327-ecf6-47f8-a11b-b4d5e154ae51',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Domains for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c66b6327-ecf6-47f8-a11b-b4d5e154ae51',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Domains for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c66b6327-ecf6-47f8-a11b-b4d5e154ae51',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to create new entity MJ: Magic Link Invite Allowed Paths */
INSERT INTO __mj."Entity" (
  "ID",
  "Name",
  "DisplayName",
  "Description",
  "NameSuffix",
  "BaseTable",
  "BaseView",
  "SchemaName",
  "IncludeInAPI",
  "AllowUserSearchAPI",
  "AllowCaching",
  "TrackRecordChanges",
  "AuditRecordAccess",
  "AuditViewRuns",
  "AllowAllRowsAPI",
  "AllowCreateAPI",
  "AllowUpdateAPI",
  "AllowDeleteAPI",
  "UserViewMaxRows",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b6f89bf5-3d26-4d0b-b466-add280f8e5f5',
    'MJ: Magic Link Invite Allowed Paths',
    'Magic Link Invite Allowed Paths',
    'An Explorer FE path (after the base URL) this link is confined to in the UI. This is UX confinement only — the real authorization boundary is server-side entity/resource permissions. Multiple rows = multiple allowed paths.',
    NULL,
    'MagicLinkInviteAllowedPath',
    'vwMagicLinkInviteAllowedPaths',
    '__mj',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    TRUE,
    1000,
    NOW(),
    NOW()
  );
/* SQL generated to add new entity MJ: Magic Link Invite Allowed Paths to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj."ApplicationEntity" (
  "ApplicationID",
  "EntityID",
  "Sequence",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E',
    'b6f89bf5-3d26-4d0b-b466-add280f8e5f5',
    (
      SELECT
        COALESCE(MAX("Sequence"), 0) + 1
      FROM __mj."ApplicationEntity"
      WHERE
        "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'
    ),
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Paths for role UI */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b6f89bf5-3d26-4d0b-b466-add280f8e5f5',
    'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Paths for role Developer */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b6f89bf5-3d26-4d0b-b466-add280f8e5f5',
    'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
/* SQL generated to add new permission for entity MJ: Magic Link Invite Allowed Paths for role Integration */
INSERT INTO __mj."EntityPermission" (
  "EntityID",
  "RoleID",
  "CanRead",
  "CanCreate",
  "CanUpdate",
  "CanDelete",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b6f89bf5-3d26-4d0b-b466-add280f8e5f5',
    'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  );
ALTER TABLE __mj."MagicLinkInviteApplication"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInviteApplication */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInviteApplication */
UPDATE __mj."MagicLinkInviteApplication" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInviteApplication' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInviteApplication" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInviteApplication" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInviteApplication"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInviteApplication */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInviteApplication */
UPDATE __mj."MagicLinkInviteApplication" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInviteApplication' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInviteApplication" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInviteApplication" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInviteRole"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInviteRole */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInviteRole */
UPDATE __mj."MagicLinkInviteRole" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInviteRole' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInviteRole" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInviteRole" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInviteRole"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInviteRole */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInviteRole */
UPDATE __mj."MagicLinkInviteRole" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInviteRole' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInviteRole" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInviteRole" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInviteAllowedPath"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInviteAllowedPath */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInviteAllowedPath */
UPDATE __mj."MagicLinkInviteAllowedPath" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInviteAllowedPath' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInviteAllowedPath" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInviteAllowedPath" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInviteAllowedPath"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInviteAllowedPath */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInviteAllowedPath */
UPDATE __mj."MagicLinkInviteAllowedPath" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInviteAllowedPath' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInviteAllowedPath" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInviteAllowedPath" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInviteAllowedDomain"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInviteAllowedDomain */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInviteAllowedDomain */
UPDATE __mj."MagicLinkInviteAllowedDomain" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInviteAllowedDomain' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInviteAllowedDomain" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInviteAllowedDomain" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInviteAllowedDomain"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInviteAllowedDomain */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInviteAllowedDomain */
UPDATE __mj."MagicLinkInviteAllowedDomain" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInviteAllowedDomain' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInviteAllowedDomain" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInviteAllowedDomain" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInvite"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInvite */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkInvite */
UPDATE __mj."MagicLinkInvite" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInvite' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInvite" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInvite" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkInvite"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInvite */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkInvite */
UPDATE __mj."MagicLinkInvite" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkInvite' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkInvite" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkInvite" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkRedemption"
ADD COLUMN "__mj_CreatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkRedemption */;

/* SQL text to add special date field __mj_CreatedAt to entity __mj.MagicLinkRedemption */
UPDATE __mj."MagicLinkRedemption" SET "__mj_CreatedAt" = NOW()
WHERE
  "__mj_CreatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkRedemption' AND a.attname = '__mj_CreatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkRedemption" ALTER COLUMN "__mj_CreatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkRedemption" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

ALTER TABLE __mj."MagicLinkRedemption"
ADD COLUMN "__mj_UpdatedAt" TIMESTAMPTZ NULL /* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkRedemption */;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.MagicLinkRedemption */
UPDATE __mj."MagicLinkRedemption" SET "__mj_UpdatedAt" = NOW()
WHERE
  "__mj_UpdatedAt" IS NULL;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ns.nspname AS sch, dv.relname AS vw
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    JOIN pg_class dv ON dv.oid = rw.ev_class AND dv.relkind = 'v'
    JOIN pg_namespace ns ON ns.oid = dv.relnamespace
    JOIN pg_class tc ON tc.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
    WHERE tc.relname = 'MagicLinkRedemption' AND a.attname = '__mj_UpdatedAt'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', r.sch, r.vw);
  END LOOP;
END $$;
ALTER TABLE __mj."MagicLinkRedemption" ALTER COLUMN "__mj_UpdatedAt" TYPE TIMESTAMPTZ, ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."MagicLinkRedemption" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0afd76c5-3824-4b1c-852c-96241586b6d8' OR ("EntityID" = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0afd76c5-3824-4b1c-852c-96241586b6d8', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' /* Entity: MJ: Magic Link Invite Applications */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6b5ffe3a-bd40-4155-bf10-805e4fe3a7f1' OR ("EntityID" = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND "Name" = 'InviteID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6b5ffe3a-bd40-4155-bf10-805e4fe3a7f1', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' /* Entity: MJ: Magic Link Invite Applications */, 100002, 'InviteID', 'Invite ID', 'Foreign key to the MagicLinkInvite this application grant belongs to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6cf79958-d217-4a90-9567-45261f92b131' OR ("EntityID" = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND "Name" = 'ApplicationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6cf79958-d217-4a90-9567-45261f92b131', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' /* Entity: MJ: Magic Link Invite Applications */, 100003, 'ApplicationID', 'Application ID', 'Foreign key to the Application this invite grants access to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a4b8d9d5-10bd-4932-a830-cc459caf2b69' OR ("EntityID" = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a4b8d9d5-10bd-4932-a830-cc459caf2b69', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' /* Entity: MJ: Magic Link Invite Applications */, 100004, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fb0d2b07-c126-4df1-a40c-4ca2b77c7bc7' OR ("EntityID" = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fb0d2b07-c126-4df1-a40c-4ca2b77c7bc7', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' /* Entity: MJ: Magic Link Invite Applications */, 100005, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7b4a9d9f-c828-43a3-a8d8-a6d0f79dedb7' OR ("EntityID" = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7b4a9d9f-c828-43a3-a8d8-a6d0f79dedb7', 'E9D66E45-4771-4D80-97D4-42007B9951FB' /* Entity: MJ: Magic Link Invite Roles */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '50ea952b-fbb2-4698-867b-896d78c5ee35' OR ("EntityID" = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND "Name" = 'InviteID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('50ea952b-fbb2-4698-867b-896d78c5ee35', 'E9D66E45-4771-4D80-97D4-42007B9951FB' /* Entity: MJ: Magic Link Invite Roles */, 100002, 'InviteID', 'Invite ID', 'Foreign key to the MagicLinkInvite this role grant belongs to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8d8979c9-f6e4-4562-a6b2-c334b6a21202' OR ("EntityID" = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND "Name" = 'RoleID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8d8979c9-f6e4-4562-a6b2-c334b6a21202', 'E9D66E45-4771-4D80-97D4-42007B9951FB' /* Entity: MJ: Magic Link Invite Roles */, 100003, 'RoleID', 'Role ID', 'Foreign key to the Role this invite grants to the redeeming user.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '960647d4-9555-4c90-a144-6f9d0998aa3b' OR ("EntityID" = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('960647d4-9555-4c90-a144-6f9d0998aa3b', 'E9D66E45-4771-4D80-97D4-42007B9951FB' /* Entity: MJ: Magic Link Invite Roles */, 100004, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c33697a-6de9-4d5d-b815-779ba884e53f' OR ("EntityID" = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0c33697a-6de9-4d5d-b815-779ba884e53f', 'E9D66E45-4771-4D80-97D4-42007B9951FB' /* Entity: MJ: Magic Link Invite Roles */, 100005, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '550dffe3-aa89-4cfc-b980-ff9967609fd2' OR ("EntityID" = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('550dffe3-aa89-4cfc-b980-ff9967609fd2', 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' /* Entity: MJ: Magic Link Invite Allowed Paths */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f770c3b1-ceda-4a5e-b290-29f151ae26b0' OR ("EntityID" = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND "Name" = 'InviteID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f770c3b1-ceda-4a5e-b290-29f151ae26b0', 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' /* Entity: MJ: Magic Link Invite Allowed Paths */, 100002, 'InviteID', 'Invite ID', 'Foreign key to the MagicLinkInvite this allowed-path belongs to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e45de26f-c002-4fbf-b024-60bcd5855f2e' OR ("EntityID" = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND "Name" = 'Path')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e45de26f-c002-4fbf-b024-60bcd5855f2e', 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' /* Entity: MJ: Magic Link Invite Allowed Paths */, 100003, 'Path', 'Path', 'An allowed FE path (after the Explorer base URL) the session may navigate to. UX confinement only.', 'nvarchar', 2000, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9c4abc4a-988a-4328-9a8f-93947e13d00c' OR ("EntityID" = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9c4abc4a-988a-4328-9a8f-93947e13d00c', 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' /* Entity: MJ: Magic Link Invite Allowed Paths */, 100004, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a8dcab9f-cdd5-485c-b59d-84bc5fdb4bb5' OR ("EntityID" = 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a8dcab9f-cdd5-485c-b59d-84bc5fdb4bb5', 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5' /* Entity: MJ: Magic Link Invite Allowed Paths */, 100005, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '39801ec5-bc02-4a8b-9e48-6cb5c109b682' OR ("EntityID" = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('39801ec5-bc02-4a8b-9e48-6cb5c109b682', 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' /* Entity: MJ: Magic Link Invite Allowed Domains */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b9a08b47-b366-4dd7-a36a-f291891d5df0' OR ("EntityID" = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND "Name" = 'InviteID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b9a08b47-b366-4dd7-a36a-f291891d5df0', 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' /* Entity: MJ: Magic Link Invite Allowed Domains */, 100002, 'InviteID', 'Invite ID', 'Foreign key to the MagicLinkInvite this allowed-domain belongs to.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '522121ce-4c2e-4651-851e-7b3d31ac1903' OR ("EntityID" = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND "Name" = 'Domain')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('522121ce-4c2e-4651-851e-7b3d31ac1903', 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' /* Entity: MJ: Magic Link Invite Allowed Domains */, 100003, 'Domain', 'Domain', 'An allowed host/origin (e.g. https://partner.example.com) where the link may be framed.', 'nvarchar', 510, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e71f6de-e312-445c-8df1-746f0623d705' OR ("EntityID" = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1e71f6de-e312-445c-8df1-746f0623d705', 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' /* Entity: MJ: Magic Link Invite Allowed Domains */, 100004, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '176c92c7-b352-41c3-95c8-a80d7db9326f' OR ("EntityID" = 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('176c92c7-b352-41c3-95c8-a80d7db9326f', 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51' /* Entity: MJ: Magic Link Invite Allowed Domains */, 100005, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8619b36a-5c85-4b02-b137-f9db2ec0d0d8' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8619b36a-5c85-4b02-b137-f9db2ec0d0d8', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4115768e-9fe8-4688-8344-0621f877607d' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'TokenHash')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4115768e-9fe8-4688-8344-0621f877607d', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100002, 'TokenHash', 'Token Hash', 'SHA-256 hash of the raw magic-link token, base64url-encoded (43 chars). The raw token is delivered only in the emailed URL and is never persisted. Lookups hash the incoming token and match against this column. Unique.', 'nvarchar', 256, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b50c0712-ec31-4b08-a913-1a2d3dbe4df4' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'Email')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b50c0712-ec31-4b08-a913-1a2d3dbe4df4', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100003, 'Email', 'Email', 'Email address the invite was issued to and delivered at. Becomes the provisioned user''s email on first redemption.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f7d9b6f1-1824-48a4-8f1d-7b7bd6eb68cc' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'ApplicationID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f7d9b6f1-1824-48a4-8f1d-7b7bd6eb68cc', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100004, 'ApplicationID', 'Application ID', 'Foreign key to Application — the single app this invite grants access to. The provisioned user receives exactly one User Application record for this app.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '27a980db-4f8f-4eb2-a377-1af794780ecf' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'RoleID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('27a980db-4f8f-4eb2-a377-1af794780ecf', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100005, 'RoleID', 'Role ID', 'Foreign key to Role — the restricted role assigned to the redeeming user. This role''s entity permissions are the real authorization boundary that confines the external user to the shared app''s data.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '06825f42-339b-46c4-afb5-49294a61f17e' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'ExpiresAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('06825f42-339b-46c4-afb5-49294a61f17e', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100006, 'ExpiresAt', 'Expires At', 'Hard expiry for the link. After this instant the invite cannot be redeemed regardless of Status.', 'datetimeoffset', 10, 34, 7, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '566de4a8-1881-40f6-9ae4-c5a5be7317df' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'ConsumedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('566de4a8-1881-40f6-9ae4-c5a5be7317df', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100007, 'ConsumedAt', 'Consumed At', 'Timestamp of the first successful redemption. NULL while unconsumed. Set in the same transaction that mints the session JWT to enforce single-use semantics.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a6ac61b6-cdfa-493a-919f-a1d3c79ac1ed' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'MaxUses')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a6ac61b6-cdfa-493a-919f-a1d3c79ac1ed', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100008, 'MaxUses', 'Max Uses', 'Maximum number of times this invite may be redeemed. Defaults to 1 (true single-use). Set higher only for intentionally multi-use links.', 'int', 4, 10, 0, FALSE, '(1)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6109f476-1b89-415d-9dc7-9d6c5f9c733f' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'UseCount')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('6109f476-1b89-415d-9dc7-9d6c5f9c733f', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100009, 'UseCount', 'Use Count', 'Number of times this invite has been redeemed so far. Incremented on each successful redemption; redemption is rejected once UseCount reaches MaxUses.', 'int', 4, 10, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1c4ab92d-3732-4980-a2fe-6a5ba7a861ca' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'CreatedByUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1c4ab92d-3732-4980-a2fe-6a5ba7a861ca', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100010, 'CreatedByUserID', 'Created By User ID', 'Foreign key to User — the internal user who created/shared this invite. Audit trail for who granted external access.', 'uniqueidentifier', 16, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b2fe5998-a12d-468d-820b-cc7bf4dea159' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'Status')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b2fe5998-a12d-468d-820b-cc7bf4dea159', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100011, 'Status', 'Status', 'Lifecycle status: Active (redeemable), Consumed (single-use link fully redeemed), Revoked (manually disabled), Expired (past ExpiresAt). Revoking an unconsumed link is the primary revocation mechanism.', 'nvarchar', 40, 0, 0, FALSE, 'Active', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f8e356be-5210-4a6d-8e8d-020693165d43' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'IdentityMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f8e356be-5210-4a6d-8e8d-020693165d43', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100012, 'IdentityMode', 'Identity Mode', 'Identity resolution mode. ''email'' (default, legacy): redemption provisions/links a per-email user and enforcement rides that user''s DB roles. ''anonymous'': all redemptions resolve to the shared Anonymous principal (an attribution anchor, not a permission holder); scope is carried per-session in the minted JWT claims, never as roles on that user.', 'nvarchar', 40, 0, 0, FALSE, 'email', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '57a2728e-bbd8-49e6-b01d-a9868c5364b8' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'Kind')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('57a2728e-bbd8-49e6-b01d-a9868c5364b8', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100013, 'Kind', 'Kind', 'Invite kind, gating which scope columns/claims are valid and which issuance capability check applies. ''app-session'' (default): the legacy app+role session. ''resource-share'': scoped to a single resource (ResourceTypeID/ResourceID). ''anonymous-embed'': framed in an external site (requires allowed domains + tier capability).', 'nvarchar', 60, 0, 0, FALSE, 'app-session', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '939d852b-22dc-4f28-b136-73abbe16eb93' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'ResourceTypeID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('939d852b-22dc-4f28-b136-73abbe16eb93', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100014, 'ResourceTypeID', 'Resource Type ID', 'For resource-share/embed kinds: the ResourceType of the single resource this link shares. The link''s reach to dependent data is admitted at runtime via FK-reachable resource-pinned row-level security, not an enumerated list. NULL for app-session invites.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, '0B248F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd70c0c3d-1871-4607-99c3-d81dbbc0bab1' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'ResourceID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d70c0c3d-1871-4607-99c3-d81dbbc0bab1', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100015, 'ResourceID', 'Resource ID', 'For resource-share/embed kinds: the primary-key value of the specific shared resource (stringified to support any resource''s key type). NULL for app-session invites.', 'nvarchar', 900, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '355fc03e-1d6b-403b-96bf-33e917baf4ea' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('355fc03e-1d6b-403b-96bf-33e917baf4ea', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100016, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '78016f6d-14f3-4945-a5a0-360411363be0' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('78016f6d-14f3-4945-a5a0-360411363be0', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100017, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c140977b-1aa5-46bd-9436-22b914bc7e39' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'ID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('c140977b-1aa5-46bd-9436-22b914bc7e39', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100001, 'ID', 'ID', NULL, 'uniqueidentifier', 16, 0, 0, FALSE, 'newsequentialid()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9b5c9c3f-bdb4-4172-a41e-2e85bb4b2db1' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'InviteID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('9b5c9c3f-bdb4-4172-a41e-2e85bb4b2db1', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100002, 'InviteID', 'Invite ID', 'Foreign key to MagicLinkInvite. NULLABLE: a redemption attempt against a token that matches no invite (not_found — the signature of scanning/brute-force) has no invite to reference but is still logged.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0b06faa0-b332-4688-95f2-d14f15957ec3' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'AttemptedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('0b06faa0-b332-4688-95f2-d14f15957ec3', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100003, 'AttemptedAt', 'Attempted At', 'Timestamp of the redemption attempt (UTC). Defaults to the time of insert.', 'datetimeoffset', 10, 34, 7, FALSE, 'sysutcdatetime()', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '36af1d71-a217-43b6-893e-856843cddf61' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'Outcome')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('36af1d71-a217-43b6-893e-856843cddf61', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100004, 'Outcome', 'Outcome', 'Outcome of the attempt: ''success'', or one of the redemption error codes (not_found, expired, consumed, revoked, invalid, provisioning_failed, server_error). Mirrors the RedeemErrorCode union in the server code.', 'nvarchar', 60, 0, 0, FALSE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bbb8dff6-be76-4a61-9da6-0e91a11821f2' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'IPAddress')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bbb8dff6-be76-4a61-9da6-0e91a11821f2', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100005, 'IPAddress', 'IP Address', 'Client IP address the redemption came from, as captured by the request middleware. May be stored full, truncated, hashed, or omitted per the deployment''s magicLink.audit.ipStorage policy. NULL when unavailable or policy is ''none''.', 'nvarchar', 128, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fde34e1a-2669-4b96-a931-fcee073aedc3' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'UserAgent')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fde34e1a-2669-4b96-a931-fcee073aedc3', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100006, 'UserAgent', 'User Agent', 'User-Agent header of the redeeming client. NULL when unavailable.', 'nvarchar', 1024, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'af907e5a-9737-4325-8722-7e6898026766' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'Origin')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('af907e5a-9737-4325-8722-7e6898026766', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100007, 'Origin', 'Origin', 'Origin header of the redemption request. Retained for embed/domain forensics (which host framed or initiated the redemption). NULL for direct (non-embedded) redemptions.', 'nvarchar', 1024, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03b4104e-29f2-49ac-8740-cc54138c0d7c' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'ProvisionedUserID')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('03b4104e-29f2-49ac-8740-cc54138c0d7c', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100008, 'ProvisionedUserID', 'Provisioned User ID', 'Foreign key to the User provisioned/linked by a SUCCESSFUL redemption. NULL on failed attempts and on (future) anonymous redemptions that resolve to a shared principal rather than a per-email user.', 'uniqueidentifier', 16, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'ID', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'efd24508-885a-4966-a0ca-dc58bfb71b42' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = '__mj_CreatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('efd24508-885a-4966-a0ca-dc58bfb71b42', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100009, '__mj_CreatedAt', 'Created At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '06edc68f-20f0-4fe0-959b-b135724fab01' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = '__mj_UpdatedAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('06edc68f-20f0-4fe0-959b-b135724fab01', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100010, '__mj_UpdatedAt', 'Updated At', NULL, 'datetimeoffset', 10, 34, 7, FALSE, 'getutcdate()', FALSE, FALSE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 109c6efe-fb22-4122-ad18-076f0b7d3f2f */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '109c6efe-fb22-4122-ad18-076f0b7d3f2f',
    'B2FE5998-A12D-468D-820B-CC7BF4DEA159',
    1,
    'Active',
    'Active',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b7943b0f-e100-479b-9977-da7a11a4575d */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b7943b0f-e100-479b-9977-da7a11a4575d',
    'B2FE5998-A12D-468D-820B-CC7BF4DEA159',
    2,
    'Consumed',
    'Consumed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8548dd3f-8ffc-48d0-b720-0f52af6e1aae */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8548dd3f-8ffc-48d0-b720-0f52af6e1aae',
    'B2FE5998-A12D-468D-820B-CC7BF4DEA159',
    3,
    'Expired',
    'Expired',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b74f3e70-544d-4299-933f-10e37b7c8049 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b74f3e70-544d-4299-933f-10e37b7c8049',
    'B2FE5998-A12D-468D-820B-CC7BF4DEA159',
    4,
    'Revoked',
    'Revoked',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID B2FE5998-A12D-468D-820B-CC7BF4DEA159 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'B2FE5998-A12D-468D-820B-CC7BF4DEA159';
/* SQL text to insert entity field value with ID 251bc5ee-ef84-4b83-9dcf-75f35d339963 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '251bc5ee-ef84-4b83-9dcf-75f35d339963',
    'F8E356BE-5210-4A6D-8E8D-020693165D43',
    1,
    'anonymous',
    'anonymous',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 8085b703-75c0-49be-ba67-ab720609af3d */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '8085b703-75c0-49be-ba67-ab720609af3d',
    'F8E356BE-5210-4A6D-8E8D-020693165D43',
    2,
    'email',
    'email',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID F8E356BE-5210-4A6D-8E8D-020693165D43 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'F8E356BE-5210-4A6D-8E8D-020693165D43';
/* SQL text to insert entity field value with ID 4d50c78e-7f6c-4e70-a5d0-c288786b8a49 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '4d50c78e-7f6c-4e70-a5d0-c288786b8a49',
    '57A2728E-BBD8-49E6-B01D-A9868C5364B8',
    1,
    'anonymous-embed',
    'anonymous-embed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c9a0ab9a-b47a-4a9f-987e-f553cd76f421 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c9a0ab9a-b47a-4a9f-987e-f553cd76f421',
    '57A2728E-BBD8-49E6-B01D-A9868C5364B8',
    2,
    'app-session',
    'app-session',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 85b0bec9-51bb-413e-8b73-b7b8df904698 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '85b0bec9-51bb-413e-8b73-b7b8df904698',
    '57A2728E-BBD8-49E6-B01D-A9868C5364B8',
    3,
    'resource-share',
    'resource-share',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 57A2728E-BBD8-49E6-B01D-A9868C5364B8 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '57A2728E-BBD8-49E6-B01D-A9868C5364B8';
/* SQL text to insert entity field value with ID 2e58d8dc-fb3a-4b55-9ce3-6060a3dd5600 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '2e58d8dc-fb3a-4b55-9ce3-6060a3dd5600',
    '36AF1D71-A217-43B6-893E-856843CDDF61',
    1,
    'consumed',
    'consumed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID b180059f-b42b-4702-9473-e32d26be0063 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'b180059f-b42b-4702-9473-e32d26be0063',
    '36AF1D71-A217-43B6-893E-856843CDDF61',
    2,
    'expired',
    'expired',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID f7a0770b-98c1-488b-ab6c-2b541c041a3f */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'f7a0770b-98c1-488b-ab6c-2b541c041a3f',
    '36AF1D71-A217-43B6-893E-856843CDDF61',
    3,
    'invalid',
    'invalid',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID afd85873-b2fe-4911-94a9-2793f9c8aebc */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'afd85873-b2fe-4911-94a9-2793f9c8aebc',
    '36AF1D71-A217-43B6-893E-856843CDDF61',
    4,
    'not_found',
    'not_found',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID ef52fd5d-7ab2-4354-a6be-20718d669c4e */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'ef52fd5d-7ab2-4354-a6be-20718d669c4e',
    '36AF1D71-A217-43B6-893E-856843CDDF61',
    5,
    'provisioning_failed',
    'provisioning_failed',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 07068b01-3c42-4aaa-a996-c9fd692e3c5b */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '07068b01-3c42-4aaa-a996-c9fd692e3c5b',
    '36AF1D71-A217-43B6-893E-856843CDDF61',
    6,
    'revoked',
    'revoked',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID e47cf98c-597b-403c-a416-9cb6ca527576 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'e47cf98c-597b-403c-a416-9cb6ca527576',
    '36AF1D71-A217-43B6-893E-856843CDDF61',
    7,
    'server_error',
    'server_error',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID c3fbf5d2-c460-49bb-b00e-cc749c04fe35 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'c3fbf5d2-c460-49bb-b00e-cc749c04fe35',
    '36AF1D71-A217-43B6-893E-856843CDDF61',
    8,
    'success',
    'success',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 36AF1D71-A217-43B6-893E-856843CDDF61 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '36AF1D71-A217-43B6-893E-856843CDDF61';
/* Create Entity Relationship: MJ: Roles -> MJ: Magic Link Invite Roles (One To Many via RoleID) */;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f4143130-6b3e-4f34-ad72-460b0bc8c987') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('f4143130-6b3e-4f34-ad72-460b0bc8c987', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'E9D66E45-4771-4D80-97D4-42007B9951FB', 'RoleID', 'One To Many', TRUE, TRUE, 13, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '99334399-e092-4dfc-a120-e92325490833') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('99334399-e092-4dfc-a120-e92325490833', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'RoleID', 'One To Many', TRUE, TRUE, 14, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '68795748-5b0f-452e-b321-11ef3e9a458f') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('68795748-5b0f-452e-b321-11ef3e9a458f', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9D479BCE-5C29-4957-90E6-F350D87B38CF', 'ProvisionedUserID', 'One To Many', TRUE, TRUE, 99, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '849d0edb-dd0a-4e77-85cb-40902f373cdc') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('849d0edb-dd0a-4e77-85cb-40902f373cdc', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'CreatedByUserID', 'One To Many', TRUE, TRUE, 100, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '22d081f3-0060-4ce3-a6a7-7ec52ade0384') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('22d081f3-0060-4ce3-a6a7-7ec52ade0384', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208', 'ApplicationID', 'One To Many', TRUE, TRUE, 8, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'a3935405-71b0-4560-9515-87375578e885') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a3935405-71b0-4560-9515-87375578e885', 'E8238F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ApplicationID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8c0772ef-7a0d-4ad8-a16d-778c65c3b0c0') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('8c0772ef-7a0d-4ad8-a16d-778c65c3b0c0', '0B248F34-2837-EF11-86D4-6045BDEE16E6', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'ResourceTypeID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '7c1d53e1-e613-4e8e-9407-2e3e4bfdb129') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('7c1d53e1-e613-4e8e-9407-2e3e4bfdb129', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'C66B6327-ECF6-47F8-A11B-B4D5E154AE51', 'InviteID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '70c284b7-99f5-4af5-a3df-6ff05d4be300') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('70c284b7-99f5-4af5-a3df-6ff05d4be300', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'B6F89BF5-3D26-4D0B-B466-ADD280F8E5F5', 'InviteID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '06f7c234-44a5-444b-845a-038e6cc825ed') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('06f7c234-44a5-444b-845a-038e6cc825ed', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208', 'InviteID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1a36d488-dc4e-4a5a-b77e-600b45cfcaba') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1a36d488-dc4e-4a5a-b77e-600b45cfcaba', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', 'E9D66E45-4771-4D80-97D4-42007B9951FB', 'InviteID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'e712d497-38c1-47ed-af0a-5e55a475fded') THEN
    INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e712d497-38c1-47ed-af0a-5e55a475fded', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A', '9D479BCE-5C29-4957-90E6-F350D87B38CF', 'InviteID', 'One To Many', TRUE, TRUE, 5, NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bc12e5fd-ce16-4d53-ba41-d5df9955d9fb' OR ("EntityID" = 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' AND "Name" = 'Application')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('bc12e5fd-ce16-4d53-ba41-d5df9955d9fb', 'C6988FA5-1EE9-40EE-9BA6-3096CB832208' /* Entity: MJ: Magic Link Invite Applications */, 100011, 'Application', 'Application', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e5deef50-47f8-4239-a277-5817029ad612' OR ("EntityID" = 'E9D66E45-4771-4D80-97D4-42007B9951FB' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e5deef50-47f8-4239-a277-5817029ad612', 'E9D66E45-4771-4D80-97D4-42007B9951FB' /* Entity: MJ: Magic Link Invite Roles */, 100011, 'Role', 'Role', NULL, 'nvarchar', 100, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '58b184c1-3163-4316-b170-c1d509e59f71' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'Application')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('58b184c1-3163-4316-b170-c1d509e59f71', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100035, 'Application', 'Application', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ac40b9e9-5ab1-4160-b01d-3fddef817d76' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'Role')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ac40b9e9-5ab1-4160-b01d-3fddef817d76', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100036, 'Role', 'Role', NULL, 'nvarchar', 100, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b86226b7-fb05-498d-8e30-bf2bc75c1306' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'CreatedByUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b86226b7-fb05-498d-8e30-bf2bc75c1306', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100037, 'CreatedByUser', 'Created By User', NULL, 'nvarchar', 200, 0, 0, FALSE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a113d6d1-8361-494f-814b-b7c99ad30e2e' OR ("EntityID" = 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' AND "Name" = 'ResourceType')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('a113d6d1-8361-494f-814b-b7c99ad30e2e', 'E41A5DEE-C259-4B6E-A3C5-BB022BD5F10A' /* Entity: MJ: Magic Link Invites */, 100038, 'ResourceType', 'Resource Type', NULL, 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '306261a4-cd80-4158-901b-7364d74e94a3' OR ("EntityID" = '9D479BCE-5C29-4957-90E6-F350D87B38CF' AND "Name" = 'ProvisionedUser')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('306261a4-cd80-4158-901b-7364d74e94a3', '9D479BCE-5C29-4957-90E6-F350D87B38CF' /* Entity: MJ: Magic Link Redemptions */, 100021, 'ProvisionedUser', 'Provisioned User', NULL, 'nvarchar', 200, 0, 0, TRUE, NULL, FALSE, FALSE, TRUE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Domains
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_allowed_domain_invite_id"
    ON __mj."MagicLinkInviteAllowedDomain" ("InviteID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Domains
-- Item: vwMagicLinkInviteAllowedDomains
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invite Allowed Domains
-----               SCHEMA:      __mj
-----               BASE TABLE:  MagicLinkInviteAllowedDomain
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMagicLinkInviteAllowedDomains"
AS
SELECT
    m.*
FROM
    __mj."MagicLinkInviteAllowedDomain" AS m
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInviteAllowedDomains'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInviteAllowedDomains'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMagicLinkInviteAllowedDomains'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMagicLinkInviteAllowedDomains" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMagicLinkInviteAllowedDomains" TO "cdp_UI";
GRANT SELECT ON __mj."vwMagicLinkInviteAllowedDomains" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMagicLinkInviteAllowedDomains" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Domains
-- Item: spCreateMagicLinkInviteAllowedDomain
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MagicLinkInviteAllowedDomain
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMagicLinkInviteAllowedDomain'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMagicLinkInviteAllowedDomain"(
    p_id uuid DEFAULT NULL,
    p_inviteid uuid DEFAULT NULL,
    p_domain text DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInviteAllowedDomains" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MagicLinkInviteAllowedDomain"
        (
            "ID",
            "InviteID",
                "Domain"
        )
    VALUES
        (
            v_new_id,
            p_inviteid,
                p_domain
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInviteAllowedDomains"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInviteAllowedDomain" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInviteAllowedDomain" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Domains
-- Item: spUpdateMagicLinkInviteAllowedDomain
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MagicLinkInviteAllowedDomain
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMagicLinkInviteAllowedDomain'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMagicLinkInviteAllowedDomain"(
    p_id uuid,
    p_inviteid uuid DEFAULT NULL,
    p_domain text DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInviteAllowedDomains" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MagicLinkInviteAllowedDomain"
    SET
        "InviteID" = COALESCE(p_inviteid, "InviteID"),
        "Domain" = COALESCE(p_domain, "Domain")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInviteAllowedDomains"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInviteAllowedDomain" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInviteAllowedDomain" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInviteAllowedDomain table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_magic_link_invite_allowed_domain"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_magic_link_invite_allowed_domain" ON __mj."MagicLinkInviteAllowedDomain";

CREATE TRIGGER "trg_update_magic_link_invite_allowed_domain"
BEFORE UPDATE ON __mj."MagicLinkInviteAllowedDomain"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_magic_link_invite_allowed_domain"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Domains
-- Item: spDeleteMagicLinkInviteAllowedDomain
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MagicLinkInviteAllowedDomain
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMagicLinkInviteAllowedDomain'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMagicLinkInviteAllowedDomain"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MagicLinkInviteAllowedDomain"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInviteAllowedDomain" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInviteAllowedDomain" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Paths
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_allowed_path_invite_id"
    ON __mj."MagicLinkInviteAllowedPath" ("InviteID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Paths
-- Item: vwMagicLinkInviteAllowedPaths
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invite Allowed Paths
-----               SCHEMA:      __mj
-----               BASE TABLE:  MagicLinkInviteAllowedPath
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMagicLinkInviteAllowedPaths"
AS
SELECT
    m.*
FROM
    __mj."MagicLinkInviteAllowedPath" AS m
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInviteAllowedPaths'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInviteAllowedPaths'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMagicLinkInviteAllowedPaths'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMagicLinkInviteAllowedPaths" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMagicLinkInviteAllowedPaths" TO "cdp_UI";
GRANT SELECT ON __mj."vwMagicLinkInviteAllowedPaths" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMagicLinkInviteAllowedPaths" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Paths
-- Item: spCreateMagicLinkInviteAllowedPath
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MagicLinkInviteAllowedPath
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMagicLinkInviteAllowedPath'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMagicLinkInviteAllowedPath"(
    p_id uuid DEFAULT NULL,
    p_inviteid uuid DEFAULT NULL,
    p_path text DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInviteAllowedPaths" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MagicLinkInviteAllowedPath"
        (
            "ID",
            "InviteID",
                "Path"
        )
    VALUES
        (
            v_new_id,
            p_inviteid,
                p_path
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInviteAllowedPaths"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInviteAllowedPath" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInviteAllowedPath" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Paths
-- Item: spUpdateMagicLinkInviteAllowedPath
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MagicLinkInviteAllowedPath
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMagicLinkInviteAllowedPath'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMagicLinkInviteAllowedPath"(
    p_id uuid,
    p_inviteid uuid DEFAULT NULL,
    p_path text DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInviteAllowedPaths" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MagicLinkInviteAllowedPath"
    SET
        "InviteID" = COALESCE(p_inviteid, "InviteID"),
        "Path" = COALESCE(p_path, "Path")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInviteAllowedPaths"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInviteAllowedPath" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInviteAllowedPath" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInviteAllowedPath table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_magic_link_invite_allowed_path"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_magic_link_invite_allowed_path" ON __mj."MagicLinkInviteAllowedPath";

CREATE TRIGGER "trg_update_magic_link_invite_allowed_path"
BEFORE UPDATE ON __mj."MagicLinkInviteAllowedPath"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_magic_link_invite_allowed_path"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Allowed Paths
-- Item: spDeleteMagicLinkInviteAllowedPath
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MagicLinkInviteAllowedPath
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMagicLinkInviteAllowedPath'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMagicLinkInviteAllowedPath"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MagicLinkInviteAllowedPath"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInviteAllowedPath" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInviteAllowedPath" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Applications
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_application_invite_id"
    ON __mj."MagicLinkInviteApplication" ("InviteID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_application_application_id"
    ON __mj."MagicLinkInviteApplication" ("ApplicationID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Applications
-- Item: vwMagicLinkInviteApplications
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invite Applications
-----               SCHEMA:      __mj
-----               BASE TABLE:  MagicLinkInviteApplication
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMagicLinkInviteApplications"
AS
SELECT
    m.*,
    MJApplication_ApplicationID."Name" AS "Application"
FROM
    __mj."MagicLinkInviteApplication" AS m
INNER JOIN
    __mj."Application" AS MJApplication_ApplicationID
  ON
    "m"."ApplicationID" = MJApplication_ApplicationID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInviteApplications'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInviteApplications'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMagicLinkInviteApplications'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMagicLinkInviteApplications" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMagicLinkInviteApplications" TO "cdp_UI";
GRANT SELECT ON __mj."vwMagicLinkInviteApplications" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMagicLinkInviteApplications" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Applications
-- Item: spCreateMagicLinkInviteApplication
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MagicLinkInviteApplication
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMagicLinkInviteApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMagicLinkInviteApplication"(
    p_id uuid DEFAULT NULL,
    p_inviteid uuid DEFAULT NULL,
    p_applicationid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInviteApplications" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MagicLinkInviteApplication"
        (
            "ID",
            "InviteID",
                "ApplicationID"
        )
    VALUES
        (
            v_new_id,
            p_inviteid,
                p_applicationid
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInviteApplications"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInviteApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInviteApplication" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Applications
-- Item: spUpdateMagicLinkInviteApplication
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MagicLinkInviteApplication
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMagicLinkInviteApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMagicLinkInviteApplication"(
    p_id uuid,
    p_inviteid uuid DEFAULT NULL,
    p_applicationid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInviteApplications" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MagicLinkInviteApplication"
    SET
        "InviteID" = COALESCE(p_inviteid, "InviteID"),
        "ApplicationID" = COALESCE(p_applicationid, "ApplicationID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInviteApplications"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInviteApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInviteApplication" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInviteApplication table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_magic_link_invite_application"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_magic_link_invite_application" ON __mj."MagicLinkInviteApplication";

CREATE TRIGGER "trg_update_magic_link_invite_application"
BEFORE UPDATE ON __mj."MagicLinkInviteApplication"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_magic_link_invite_application"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Applications
-- Item: spDeleteMagicLinkInviteApplication
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MagicLinkInviteApplication
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMagicLinkInviteApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMagicLinkInviteApplication"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MagicLinkInviteApplication"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInviteApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInviteApplication" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Roles
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_role_invite_id"
    ON __mj."MagicLinkInviteRole" ("InviteID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_role_role_id"
    ON __mj."MagicLinkInviteRole" ("RoleID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Roles
-- Item: vwMagicLinkInviteRoles
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invite Roles
-----               SCHEMA:      __mj
-----               BASE TABLE:  MagicLinkInviteRole
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMagicLinkInviteRoles"
AS
SELECT
    m.*,
    MJRole_RoleID."Name" AS "Role"
FROM
    __mj."MagicLinkInviteRole" AS m
INNER JOIN
    __mj."Role" AS MJRole_RoleID
  ON
    "m"."RoleID" = MJRole_RoleID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInviteRoles'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInviteRoles'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMagicLinkInviteRoles'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMagicLinkInviteRoles" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMagicLinkInviteRoles" TO "cdp_UI";
GRANT SELECT ON __mj."vwMagicLinkInviteRoles" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMagicLinkInviteRoles" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Roles
-- Item: spCreateMagicLinkInviteRole
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MagicLinkInviteRole
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMagicLinkInviteRole'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMagicLinkInviteRole"(
    p_id uuid DEFAULT NULL,
    p_inviteid uuid DEFAULT NULL,
    p_roleid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInviteRoles" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MagicLinkInviteRole"
        (
            "ID",
            "InviteID",
                "RoleID"
        )
    VALUES
        (
            v_new_id,
            p_inviteid,
                p_roleid
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInviteRoles"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInviteRole" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInviteRole" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Roles
-- Item: spUpdateMagicLinkInviteRole
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MagicLinkInviteRole
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMagicLinkInviteRole'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMagicLinkInviteRole"(
    p_id uuid,
    p_inviteid uuid DEFAULT NULL,
    p_roleid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInviteRoles" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MagicLinkInviteRole"
    SET
        "InviteID" = COALESCE(p_inviteid, "InviteID"),
        "RoleID" = COALESCE(p_roleid, "RoleID")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInviteRoles"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInviteRole" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInviteRole" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInviteRole table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_magic_link_invite_role"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_magic_link_invite_role" ON __mj."MagicLinkInviteRole";

CREATE TRIGGER "trg_update_magic_link_invite_role"
BEFORE UPDATE ON __mj."MagicLinkInviteRole"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_magic_link_invite_role"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invite Roles
-- Item: spDeleteMagicLinkInviteRole
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MagicLinkInviteRole
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMagicLinkInviteRole'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMagicLinkInviteRole"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MagicLinkInviteRole"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInviteRole" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInviteRole" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invites
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_application_id"
    ON __mj."MagicLinkInvite" ("ApplicationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_role_id"
    ON __mj."MagicLinkInvite" ("RoleID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_created_by_user_id"
    ON __mj."MagicLinkInvite" ("CreatedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_invite_resource_type_id"
    ON __mj."MagicLinkInvite" ("ResourceTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invites
-- Item: vwMagicLinkInvites
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Invites
-----               SCHEMA:      __mj
-----               BASE TABLE:  MagicLinkInvite
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMagicLinkInvites"
AS
SELECT
    m.*,
    MJApplication_ApplicationID."Name" AS "Application",
    MJRole_RoleID."Name" AS "Role",
    MJUser_CreatedByUserID."Name" AS "CreatedByUser",
    MJResourceType_ResourceTypeID."Name" AS "ResourceType"
FROM
    __mj."MagicLinkInvite" AS m
INNER JOIN
    __mj."Application" AS MJApplication_ApplicationID
  ON
    "m"."ApplicationID" = MJApplication_ApplicationID."ID"
INNER JOIN
    __mj."Role" AS MJRole_RoleID
  ON
    "m"."RoleID" = MJRole_RoleID."ID"
INNER JOIN
    __mj."User" AS MJUser_CreatedByUserID
  ON
    "m"."CreatedByUserID" = MJUser_CreatedByUserID."ID"
LEFT OUTER JOIN
    __mj."ResourceType" AS MJResourceType_ResourceTypeID
  ON
    "m"."ResourceTypeID" = MJResourceType_ResourceTypeID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInvites'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkInvites'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMagicLinkInvites'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMagicLinkInvites" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMagicLinkInvites" TO "cdp_UI";
GRANT SELECT ON __mj."vwMagicLinkInvites" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMagicLinkInvites" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invites
-- Item: spCreateMagicLinkInvite
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MagicLinkInvite
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMagicLinkInvite'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMagicLinkInvite"(
    p_id uuid DEFAULT NULL,
    p_tokenhash text DEFAULT NULL,
    p_email_clear boolean DEFAULT false,
    p_email text DEFAULT NULL,
    p_applicationid uuid DEFAULT NULL,
    p_roleid uuid DEFAULT NULL,
    p_expiresat timestamptz DEFAULT NULL,
    p_consumedat_clear boolean DEFAULT false,
    p_consumedat timestamptz DEFAULT NULL,
    p_maxuses integer DEFAULT NULL,
    p_usecount integer DEFAULT NULL,
    p_createdbyuserid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_identitymode text DEFAULT NULL,
    p_kind text DEFAULT NULL,
    p_resourcetypeid_clear boolean DEFAULT false,
    p_resourcetypeid uuid DEFAULT NULL,
    p_resourceid_clear boolean DEFAULT false,
    p_resourceid text DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInvites" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MagicLinkInvite"
        (
            "ID",
            "TokenHash",
                "Email",
                "ApplicationID",
                "RoleID",
                "ExpiresAt",
                "ConsumedAt",
                "MaxUses",
                "UseCount",
                "CreatedByUserID",
                "Status",
                "IdentityMode",
                "Kind",
                "ResourceTypeID",
                "ResourceID"
        )
    VALUES
        (
            v_new_id,
            p_tokenhash,
                CASE WHEN p_email_clear = true THEN NULL ELSE COALESCE(p_email, NULL) END,
                p_applicationid,
                p_roleid,
                p_expiresat,
                CASE WHEN p_consumedat_clear = true THEN NULL ELSE COALESCE(p_consumedat, NULL) END,
                COALESCE(p_maxuses, 1),
                COALESCE(p_usecount, 0),
                p_createdbyuserid,
                COALESCE(p_status, 'Active'),
                COALESCE(p_identitymode, 'email'),
                COALESCE(p_kind, 'app-session'),
                CASE WHEN p_resourcetypeid_clear = true THEN NULL ELSE COALESCE(p_resourcetypeid, NULL) END,
                CASE WHEN p_resourceid_clear = true THEN NULL ELSE COALESCE(p_resourceid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInvites"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInvite" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkInvite" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invites
-- Item: spUpdateMagicLinkInvite
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MagicLinkInvite
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMagicLinkInvite'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMagicLinkInvite"(
    p_id uuid,
    p_tokenhash text DEFAULT NULL,
    p_email_clear boolean DEFAULT false,
    p_email text DEFAULT NULL,
    p_applicationid uuid DEFAULT NULL,
    p_roleid uuid DEFAULT NULL,
    p_expiresat timestamptz DEFAULT NULL,
    p_consumedat_clear boolean DEFAULT false,
    p_consumedat timestamptz DEFAULT NULL,
    p_maxuses integer DEFAULT NULL,
    p_usecount integer DEFAULT NULL,
    p_createdbyuserid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_identitymode text DEFAULT NULL,
    p_kind text DEFAULT NULL,
    p_resourcetypeid_clear boolean DEFAULT false,
    p_resourcetypeid uuid DEFAULT NULL,
    p_resourceid_clear boolean DEFAULT false,
    p_resourceid text DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkInvites" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MagicLinkInvite"
    SET
        "TokenHash" = COALESCE(p_tokenhash, "TokenHash"),
        "Email" = CASE WHEN p_email_clear = true THEN NULL ELSE COALESCE(p_email, "Email") END,
        "ApplicationID" = COALESCE(p_applicationid, "ApplicationID"),
        "RoleID" = COALESCE(p_roleid, "RoleID"),
        "ExpiresAt" = COALESCE(p_expiresat, "ExpiresAt"),
        "ConsumedAt" = CASE WHEN p_consumedat_clear = true THEN NULL ELSE COALESCE(p_consumedat, "ConsumedAt") END,
        "MaxUses" = COALESCE(p_maxuses, "MaxUses"),
        "UseCount" = COALESCE(p_usecount, "UseCount"),
        "CreatedByUserID" = COALESCE(p_createdbyuserid, "CreatedByUserID"),
        "Status" = COALESCE(p_status, "Status"),
        "IdentityMode" = COALESCE(p_identitymode, "IdentityMode"),
        "Kind" = COALESCE(p_kind, "Kind"),
        "ResourceTypeID" = CASE WHEN p_resourcetypeid_clear = true THEN NULL ELSE COALESCE(p_resourcetypeid, "ResourceTypeID") END,
        "ResourceID" = CASE WHEN p_resourceid_clear = true THEN NULL ELSE COALESCE(p_resourceid, "ResourceID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkInvites"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInvite" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkInvite" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkInvite table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_magic_link_invite"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_magic_link_invite" ON __mj."MagicLinkInvite";

CREATE TRIGGER "trg_update_magic_link_invite"
BEFORE UPDATE ON __mj."MagicLinkInvite"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_magic_link_invite"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Invites
-- Item: spDeleteMagicLinkInvite
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MagicLinkInvite
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMagicLinkInvite'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMagicLinkInvite"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MagicLinkInvite"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInvite" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkInvite" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Redemptions
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_redemption_invite_id"
    ON __mj."MagicLinkRedemption" ("InviteID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_magic_link_redemption_provisioned_user_id"
    ON __mj."MagicLinkRedemption" ("ProvisionedUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Redemptions
-- Item: vwMagicLinkRedemptions
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Magic Link Redemptions
-----               SCHEMA:      __mj
-----               BASE TABLE:  MagicLinkRedemption
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwMagicLinkRedemptions"
AS
SELECT
    m.*,
    MJUser_ProvisionedUserID."Name" AS "ProvisionedUser"
FROM
    __mj."MagicLinkRedemption" AS m
LEFT OUTER JOIN
    __mj."User" AS MJUser_ProvisionedUserID
  ON
    "m"."ProvisionedUserID" = MJUser_ProvisionedUserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkRedemptions'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwMagicLinkRedemptions'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwMagicLinkRedemptions'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwMagicLinkRedemptions" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwMagicLinkRedemptions" TO "cdp_UI";
GRANT SELECT ON __mj."vwMagicLinkRedemptions" TO "cdp_Developer";
GRANT SELECT ON __mj."vwMagicLinkRedemptions" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Redemptions
-- Item: spCreateMagicLinkRedemption
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MagicLinkRedemption
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMagicLinkRedemption'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateMagicLinkRedemption"(
    p_id uuid DEFAULT NULL,
    p_inviteid_clear boolean DEFAULT false,
    p_inviteid uuid DEFAULT NULL,
    p_attemptedat timestamptz DEFAULT NULL,
    p_outcome text DEFAULT NULL,
    p_ipaddress_clear boolean DEFAULT false,
    p_ipaddress text DEFAULT NULL,
    p_useragent_clear boolean DEFAULT false,
    p_useragent text DEFAULT NULL,
    p_origin_clear boolean DEFAULT false,
    p_origin text DEFAULT NULL,
    p_provisioneduserid_clear boolean DEFAULT false,
    p_provisioneduserid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkRedemptions" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."MagicLinkRedemption"
        (
            "ID",
            "InviteID",
                "AttemptedAt",
                "Outcome",
                "IPAddress",
                "UserAgent",
                "Origin",
                "ProvisionedUserID"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_inviteid_clear = true THEN NULL ELSE COALESCE(p_inviteid, NULL) END,
                COALESCE(p_attemptedat, NOW()),
                p_outcome,
                CASE WHEN p_ipaddress_clear = true THEN NULL ELSE COALESCE(p_ipaddress, NULL) END,
                CASE WHEN p_useragent_clear = true THEN NULL ELSE COALESCE(p_useragent, NULL) END,
                CASE WHEN p_origin_clear = true THEN NULL ELSE COALESCE(p_origin, NULL) END,
                CASE WHEN p_provisioneduserid_clear = true THEN NULL ELSE COALESCE(p_provisioneduserid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkRedemptions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkRedemption" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateMagicLinkRedemption" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Redemptions
-- Item: spUpdateMagicLinkRedemption
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MagicLinkRedemption
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMagicLinkRedemption'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateMagicLinkRedemption"(
    p_id uuid,
    p_inviteid_clear boolean DEFAULT false,
    p_inviteid uuid DEFAULT NULL,
    p_attemptedat timestamptz DEFAULT NULL,
    p_outcome text DEFAULT NULL,
    p_ipaddress_clear boolean DEFAULT false,
    p_ipaddress text DEFAULT NULL,
    p_useragent_clear boolean DEFAULT false,
    p_useragent text DEFAULT NULL,
    p_origin_clear boolean DEFAULT false,
    p_origin text DEFAULT NULL,
    p_provisioneduserid_clear boolean DEFAULT false,
    p_provisioneduserid uuid DEFAULT NULL
) RETURNS SETOF __mj."vwMagicLinkRedemptions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."MagicLinkRedemption"
    SET
        "InviteID" = CASE WHEN p_inviteid_clear = true THEN NULL ELSE COALESCE(p_inviteid, "InviteID") END,
        "AttemptedAt" = COALESCE(p_attemptedat, "AttemptedAt"),
        "Outcome" = COALESCE(p_outcome, "Outcome"),
        "IPAddress" = CASE WHEN p_ipaddress_clear = true THEN NULL ELSE COALESCE(p_ipaddress, "IPAddress") END,
        "UserAgent" = CASE WHEN p_useragent_clear = true THEN NULL ELSE COALESCE(p_useragent, "UserAgent") END,
        "Origin" = CASE WHEN p_origin_clear = true THEN NULL ELSE COALESCE(p_origin, "Origin") END,
        "ProvisionedUserID" = CASE WHEN p_provisioneduserid_clear = true THEN NULL ELSE COALESCE(p_provisioneduserid, "ProvisionedUserID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwMagicLinkRedemptions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkRedemption" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateMagicLinkRedemption" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MagicLinkRedemption table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_magic_link_redemption"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_magic_link_redemption" ON __mj."MagicLinkRedemption";

CREATE TRIGGER "trg_update_magic_link_redemption"
BEFORE UPDATE ON __mj."MagicLinkRedemption"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_magic_link_redemption"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Magic Link Redemptions
-- Item: spDeleteMagicLinkRedemption
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MagicLinkRedemption
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMagicLinkRedemption'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteMagicLinkRedemption"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."MagicLinkRedemption"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkRedemption" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteMagicLinkRedemption" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: vwApplications
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Applications
-----               SCHEMA:      __mj
-----               BASE TABLE:  Application
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwApplications"
AS
SELECT
    a.*
FROM
    __mj."Application" AS a
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwApplications'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwApplications'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwApplications'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwApplications" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwApplications" TO "cdp_Developer";
GRANT SELECT ON __mj."vwApplications" TO "cdp_Integration";
GRANT SELECT ON __mj."vwApplications" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: spCreateApplication
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Application
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateApplication"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon text DEFAULT NULL,
    p_defaultfornewuser BOOLEAN DEFAULT NULL,
    p_schemaautoaddnewentities_clear boolean DEFAULT false,
    p_schemaautoaddnewentities text DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color text DEFAULT NULL,
    p_defaultnavitems_clear boolean DEFAULT false,
    p_defaultnavitems text DEFAULT NULL,
    p_classname_clear boolean DEFAULT false,
    p_classname text DEFAULT NULL,
    p_defaultsequence integer DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_navigationstyle text DEFAULT NULL,
    p_topnavlocation_clear boolean DEFAULT false,
    p_topnavlocation text DEFAULT NULL,
    p_hidenavbariconwhenactive BOOLEAN DEFAULT NULL,
    p_path text DEFAULT NULL,
    p_autoupdatepath BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwApplications" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."Application"
        (
            "ID",
            "Name",
                "Description",
                "Icon",
                "DefaultForNewUser",
                "SchemaAutoAddNewEntities",
                "Color",
                "DefaultNavItems",
                "ClassName",
                "DefaultSequence",
                "Status",
                "NavigationStyle",
                "TopNavLocation",
                "HideNavBarIconWhenActive",
                "Path",
                "AutoUpdatePath"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                COALESCE(p_defaultfornewuser, TRUE),
                CASE WHEN p_schemaautoaddnewentities_clear = true THEN NULL ELSE COALESCE(p_schemaautoaddnewentities, NULL) END,
                CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, NULL) END,
                CASE WHEN p_defaultnavitems_clear = true THEN NULL ELSE COALESCE(p_defaultnavitems, NULL) END,
                CASE WHEN p_classname_clear = true THEN NULL ELSE COALESCE(p_classname, NULL) END,
                COALESCE(p_defaultsequence, 100),
                COALESCE(p_status, 'Active'),
                COALESCE(p_navigationstyle, 'App Switcher'),
                CASE WHEN p_topnavlocation_clear = true THEN NULL ELSE COALESCE(p_topnavlocation, NULL) END,
                COALESCE(p_hidenavbariconwhenactive, FALSE),
                p_path,
                COALESCE(p_autoupdatepath, TRUE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwApplications"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateApplication" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: spUpdateApplication
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Application
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateApplication"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon text DEFAULT NULL,
    p_defaultfornewuser BOOLEAN DEFAULT NULL,
    p_schemaautoaddnewentities_clear boolean DEFAULT false,
    p_schemaautoaddnewentities text DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color text DEFAULT NULL,
    p_defaultnavitems_clear boolean DEFAULT false,
    p_defaultnavitems text DEFAULT NULL,
    p_classname_clear boolean DEFAULT false,
    p_classname text DEFAULT NULL,
    p_defaultsequence integer DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_navigationstyle text DEFAULT NULL,
    p_topnavlocation_clear boolean DEFAULT false,
    p_topnavlocation text DEFAULT NULL,
    p_hidenavbariconwhenactive BOOLEAN DEFAULT NULL,
    p_path text DEFAULT NULL,
    p_autoupdatepath BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwApplications" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."Application"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "DefaultForNewUser" = COALESCE(p_defaultfornewuser, "DefaultForNewUser"),
        "SchemaAutoAddNewEntities" = CASE WHEN p_schemaautoaddnewentities_clear = true THEN NULL ELSE COALESCE(p_schemaautoaddnewentities, "SchemaAutoAddNewEntities") END,
        "Color" = CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, "Color") END,
        "DefaultNavItems" = CASE WHEN p_defaultnavitems_clear = true THEN NULL ELSE COALESCE(p_defaultnavitems, "DefaultNavItems") END,
        "ClassName" = CASE WHEN p_classname_clear = true THEN NULL ELSE COALESCE(p_classname, "ClassName") END,
        "DefaultSequence" = COALESCE(p_defaultsequence, "DefaultSequence"),
        "Status" = COALESCE(p_status, "Status"),
        "NavigationStyle" = COALESCE(p_navigationstyle, "NavigationStyle"),
        "TopNavLocation" = CASE WHEN p_topnavlocation_clear = true THEN NULL ELSE COALESCE(p_topnavlocation, "TopNavLocation") END,
        "HideNavBarIconWhenActive" = COALESCE(p_hidenavbariconwhenactive, "HideNavBarIconWhenActive"),
        "Path" = COALESCE(p_path, "Path"),
        "AutoUpdatePath" = COALESCE(p_autoupdatepath, "AutoUpdatePath")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwApplications"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateApplication" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Application table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_application"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_application" ON __mj."Application";

CREATE TRIGGER "trg_update_application"
BEFORE UPDATE ON __mj."Application"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_application"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Applications
-- Item: spDeleteApplication
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Application
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteApplication'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteApplication"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: Application Entities records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ApplicationEntity"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteApplicationEntity"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Application Roles records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ApplicationRole"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteApplicationRole"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Application Settings records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ApplicationSetting"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteApplicationSetting"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Conversations.ApplicationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Conversation"
        WHERE "ApplicationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Conversation"
        SET "ApplicationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Dashboard User Preferences records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."DashboardUserPreference"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteDashboardUserPreference"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Dashboards.ApplicationID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."Dashboard"
        WHERE "ApplicationID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."Dashboard"
        SET "ApplicationID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Magic Link Invite Applications records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."MagicLinkInviteApplication"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteMagicLinkInviteApplication"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Magic Link Invites records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."MagicLinkInvite"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteMagicLinkInvite"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: User Applications records via ApplicationID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."UserApplication"
        WHERE "ApplicationID" = p_id
    LOOP
        PERFORM __mj."spDeleteUserApplication"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."Application"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteApplication" TO "cdp_Integration";
