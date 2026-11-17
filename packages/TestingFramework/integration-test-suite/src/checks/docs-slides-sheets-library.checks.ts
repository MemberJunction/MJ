/**
 * @fileoverview Integration check bundle `'docs-slides-sheets-library'` (IT170) and client companion
 * `'docs-slides-sheets-library-client'` (IT171) — verifies the
 * collaborative MJ Docs, Slides, Sheets, Yjs Working States, Delegated OLE Permissions, and
 * Library / Chat application substrate against the live database and metadata provider.
 *
 * Registered check IDs:
 *   - `docs-slides-sheets-library.DSL1` — Metadata coherence (`MJ: Artifact Working States`, `MJ: Artifacts` polymorphic `DelegateRecordID -> DelegateEntityID`), `MJ: Artifact Types` (`Markdown Document`, `Presentation`, `Excel Spreadsheet`, `Whiteboard`), and `Library` + `Chat` (`Agent Activity`) application metadata
 *   - `docs-slides-sheets-library.DSL2` — Physical catalog PK, UQ, FK, and CHECK constraints on `ArtifactWorkingState` and `Artifact`, plus live `RunView` (`simple` and `count_only`) across artifact & collection views
 *   - `docs-slides-sheets-library.DSL3` — (`RequiresMutation: true`) Live DB CRUD for `MJArtifactWorkingStateEntity`, 1:1 `UQ_ArtifactWorkingState_ArtifactID` & `CK_Artifact_DelegateBinding` enforcement, and `O4` delegated OLE permissions (`ParentArtifactPermissionDelegate`)
 *   - `docs-slides-sheets-library.DSL4` — `DocumentLiveBlockEngine` live DB `EntityView` execution, `O5` freeze security-acknowledgment gate, frozen snapshot replay, tamper rejection, and `:::mj-block` Markdown directive round-trip
 *   - `docs-slides-sheets-library.DSL5` — `SlideDeckEngine` Markdown-to-16:9-deck conversion with speaker notes & live blocks, single-slide mutation isolation, concurrent-safe slide reorder, contrast-safe brand theme derivation, and `O6` presenter freeze
 *   - `docs-slides-sheets-library.DSL6` — `SpreadsheetEngine` stable-ID formula coordinate shifting (`@RANGE`), cycle detection, live DB `=MJ.VIEW` + `LiveTable` evaluation with SQL-injection rejection (`#MJ_ACCESS_DENIED!`), and `.xlsx` OpenXML round-trip
 *   - `docs-slides-sheets-library.DSL7` — `MJGlobal.ClassFactory` resolution and headless execution of `DocumentToolLibrary`, `SlideDeckToolLibrary`, `SpreadsheetToolLibrary`, and `WhiteboardToolLibrary` with SHA-256 optimistic concurrency guards
 *   - `docs-slides-sheets-library.DSL8` — (`RequiresMutation: true`) `NW-2` ancestor-cascading collection permissions (`ResolveCollectionAncestryPermissions`, `BuildReadableArtifactIdSet`), `CanShare` escalation / re-parenting guards, and `count_only` ACL oracle blocking
 *   - `docs-slides-sheets-library.DSL9` — HMAC frozen snapshot verification & tamper rejection, `>256`-cell range watcher recalculation & `UnfreezeLiveTable` purge, `__proto__` guard, formula AST depth cap (`128`), and `!queryInfo` fail-closed gate
 *   - `docs-slides-sheets-library.DSL10` — `NW-5` `ArtifactSynthesisEngine` prompt-injection strip (`SavedQuery`/`EntityView`/`Frozen` removal, backtick fence normalization) and deterministic fallback synthesis
 */

import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import { createServer as createNetServer } from 'node:net';
import { resolve as resolvePath } from 'node:path';
import { DatabaseProviderBase, IMetadataProvider, Metadata, RunQuery, RunView, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import {
    ArtifactCreateGuestShareLinkOperation,
    ArtifactEvaluateAiFormulaOperation,
    ArtifactLogComplianceAuditOperation,
    ArtifactPermissionEngine,
    ArtifactRevokeGuestShareLinkOperation,
    ArtifactSynthesizeFromSourcesOperation,
    ArtifactSynthesisEngine,
    BaseArtifactPermissionDelegate,
    BaseDocumentBlock,
    ComputeFrozenSnapshotHash,
    DocumentBlockExecutionResult,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    FrozenBlockSnapshot,
    LoadArtifactPermissionDelegates,
    LoadDocumentLiveBlocks,
    MJAPIKeyScopeEntity,
    MJAPIScopeEntityType,
    MJApplicationEntityType,
    MJArtifactEntity,
    MJArtifactPermissionEntity,
    MJArtifactTypeEntityType,
    MJArtifactVersionEntity,
    MJArtifactWorkingStateEntity,
    MJCollectionArtifactEntity,
    MJCollectionEntity,
    MJCollectionPermissionEntity,
    MJConversationEntity,
    MJRemoteOperationEntityType,
    MJUserEntityType,
    MJUserRoleEntityType,
    ParentArtifactPermissionDelegate,
    SLIDE_DECK_THEME_PRESETS,
    SlideDeckEngine,
    SpreadsheetEngine,
    ValidateFrozenBlockSnapshot,
} from '@memberjunction/core-entities';
import { ArtifactToolResult, BaseArtifactToolLibrary } from '@memberjunction/ai-core-plus';
import {
    MJArtifactEntityServer,
    MJArtifactVersionEntityServer,
    MJArtifactWorkingStateEntityServer,
} from '@memberjunction/core-entities-server';
import {
    ArtifactToolManager,
    DocumentToolLibrary,
    SlideDeckToolLibrary,
    SpreadsheetToolLibrary,
    WhiteboardToolLibrary,
} from '@memberjunction/ai-agents';
import {
    Assert,
    AssertEqual,
    IntegrationCheckContext,
    IntegrationCheckRegistry,
    LoadClientConfig,
    NamedCheck,
    SkipCheck,
} from '@memberjunction/testing-integration';
import {
    BuildUserKeyProviderWithRetry,
    DeleteMintedUserKeys,
    MintFullAccessUserKey,
    MintedUserKeyIds,
} from './fls-client.checks';
import { CloseWireSession } from './wire-sessions';

// Ensure side-effect @RegisterClass registrations are active when this bundle is imported
LoadArtifactPermissionDelegates();
LoadDocumentLiveBlocks();
void MJArtifactEntityServer;
void MJArtifactVersionEntityServer;
void MJArtifactWorkingStateEntityServer;
void DocumentToolLibrary;
void SlideDeckToolLibrary;
void SpreadsheetToolLibrary;
void WhiteboardToolLibrary;

interface DefaultNavItemShape {
    Label?: string;
    DriverClass?: string;
    ResourceType?: string;
    Icon?: string;
}

function parseNavItems(raw: string | null | undefined): DefaultNavItemShape[] {
    if (!raw) {
        return [];
    }
    const parsed: DefaultNavItemShape[] = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
}

function extractToolData<T extends object>(res: ArtifactToolResult, contextLabel: string): T {
    Assert(res.success, `${contextLabel} failed: ${res.errorMessage ?? 'unknown error'}`);
    Assert(typeof res.data === 'object' && res.data !== null, `${contextLabel} must return an object payload`);
    return res.data as T;
}

// ─── DSL1: Metadata coherence, Artifact Types, and Library / Chat wiring ──────

async function checkDsl1MetadataAndAppWiring(ctx: IntegrationCheckContext): Promise<void> {
    // 1. MJ: Artifact Working States entity & FK metadata (IncludeInAPI=true for CodeGen entity class, all 5 Allow*API=false, TrackRecordChanges=false, Developer/Integration-only CRUD permissions)
    const workingStatesEnt = ctx.Provider.EntityByName('MJ: Artifact Working States');
    Assert(workingStatesEnt !== undefined, 'Entity "MJ: Artifact Working States" must exist via Provider.EntityByName');
    AssertEqual(workingStatesEnt!.BaseTable, 'ArtifactWorkingState', 'MJ: Artifact Working States BaseTable');
    AssertEqual(workingStatesEnt!.BaseView, 'vwArtifactWorkingStates', 'MJ: Artifact Working States BaseView');
    AssertEqual(workingStatesEnt!.TrackRecordChanges, false, 'MJ: Artifact Working States must have TrackRecordChanges=false (B1)');
    AssertEqual(workingStatesEnt!.IncludeInAPI, true, 'MJ: Artifact Working States must keep IncludeInAPI=true so CodeGen generates MJArtifactWorkingStateEntity');
    AssertEqual(workingStatesEnt!.AllowCreateAPI, false, 'MJ: Artifact Working States must have AllowCreateAPI=false');
    AssertEqual(workingStatesEnt!.AllowUpdateAPI, false, 'MJ: Artifact Working States must have AllowUpdateAPI=false');
    AssertEqual(workingStatesEnt!.AllowDeleteAPI, false, 'MJ: Artifact Working States must have AllowDeleteAPI=false');
    AssertEqual(workingStatesEnt!.AllowAllRowsAPI, false, 'MJ: Artifact Working States must have AllowAllRowsAPI=false (B1)');
    AssertEqual(workingStatesEnt!.AllowUserSearchAPI, false, 'MJ: Artifact Working States must have AllowUserSearchAPI=false (B1)');
    const roleNameByNormId = new Map<string, string>(
        ctx.Provider.Roles.map((r) => [NormalizeUUID(r.ID), r.Name]),
    );
    const resolvePermRoleName = (perm: { Role: string | null; RoleID: string | null }): string | null =>
        perm.Role ?? (perm.RoleID ? (roleNameByNormId.get(NormalizeUUID(perm.RoleID)) ?? null) : null);

    const wsUiPerm = workingStatesEnt!.Permissions.find((p) => resolvePermRoleName(p) === 'UI' && !p.IsDeny);
    AssertEqual(wsUiPerm?.CanRead ?? false, false, 'MJ: Artifact Working States must deny UI role CanRead');
    for (const perm of workingStatesEnt!.Permissions) {
        const hasAnyPermission = Boolean(perm.CanRead || perm.CanCreate || perm.CanUpdate || perm.CanDelete);
        if (!hasAnyPermission || perm.IsDeny) {
            continue;
        }
        const roleName = resolvePermRoleName(perm);
        Assert(
            roleName === 'Developer' || roleName === 'Integration',
            `Only Developer/Integration roles may hold server-internal permission on MJ: Artifact Working States (found '${roleName}')`,
        );
    }

    const wsFields = new Set(workingStatesEnt!.Fields.map((f) => f.Name));
    for (const reqField of ['ID', 'ArtifactID', 'YjsState', 'LastModifiedByUserID', 'Artifact', 'LastModifiedByUser']) {
        Assert(wsFields.has(reqField), `MJ: Artifact Working States must expose field '${reqField}'`);
    }
    const wsArtifactFk = workingStatesEnt!.Fields.find((f) => f.Name === 'ArtifactID');
    AssertEqual(wsArtifactFk?.RelatedEntity, 'MJ: Artifacts', 'MJ: Artifact Working States.ArtifactID RelatedEntity');

    // 2. MJ: Artifacts DelegateEntityID + polymorphic DelegateRecordID -> DelegateEntityID (Rule 2e)
    const artifactsEnt = ctx.Provider.EntityByName('MJ: Artifacts');
    Assert(artifactsEnt !== undefined, 'Entity "MJ: Artifacts" must exist via Provider.EntityByName');
    const delegateEntityField = artifactsEnt!.Fields.find((f) => f.Name === 'DelegateEntityID');
    const delegateRecordField = artifactsEnt!.Fields.find((f) => f.Name === 'DelegateRecordID');
    Assert(delegateEntityField !== undefined, 'MJ: Artifacts.DelegateEntityID must exist');
    Assert(delegateRecordField !== undefined, 'MJ: Artifacts.DelegateRecordID must exist');
    AssertEqual(delegateEntityField!.RelatedEntity, 'MJ: Entities', 'MJ: Artifacts.DelegateEntityID RelatedEntity');
    AssertEqual(
        delegateRecordField!.EntityIDFieldName,
        'DelegateEntityID',
        'MJ: Artifacts.DelegateRecordID polymorphic EntityIDFieldName',
    );

    // 3. MJ: Artifact Types live records for Docs, Slides, Sheets, and Whiteboard
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const typesRes = await rv.RunView<MJArtifactTypeEntityType>(
        {
            EntityName: 'MJ: Artifact Types',
            ExtraFilter: "Name IN ('Markdown Document', 'Presentation', 'Excel Spreadsheet', 'Whiteboard')",
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(typesRes.Success, `RunView on MJ: Artifact Types failed: ${typesRes.ErrorMessage}`);

    const expectedTypes: ReadonlyArray<{
        Name: string;
        DriverClass: string;
        ToolLibraryClass: string;
    }> = [
        {
            Name: 'Markdown Document',
            DriverClass: 'MarkdownArtifactViewerPlugin',
            ToolLibraryClass: 'DocumentToolLibrary',
        },
        {
            Name: 'Presentation',
            DriverClass: 'SlideDeckArtifactViewerPlugin',
            ToolLibraryClass: 'SlideDeckToolLibrary',
        },
        {
            Name: 'Excel Spreadsheet',
            DriverClass: 'SpreadsheetArtifactViewerPlugin',
            ToolLibraryClass: 'SpreadsheetToolLibrary',
        },
        {
            Name: 'Whiteboard',
            DriverClass: 'WhiteboardArtifactViewerPlugin',
            ToolLibraryClass: 'WhiteboardToolLibrary',
        },
    ];

    for (const expected of expectedTypes) {
        const row = typesRes.Results.find((r) => r.Name === expected.Name);
        Assert(row !== undefined, `MJ: Artifact Types must include '${expected.Name}'`);
        AssertEqual(row!.DriverClass, expected.DriverClass, `${expected.Name} DriverClass`);
        AssertEqual(row!.ToolLibraryClass, expected.ToolLibraryClass, `${expected.Name} ToolLibraryClass`);
        Assert(Boolean(row!.IsEnabled), `${expected.Name} must be enabled`);
    }

    // 4. Library, File Browser, & Chat application wiring
    const appsRes = await rv.RunView<MJApplicationEntityType>(
        {
            EntityName: 'MJ: Applications',
            ExtraFilter: "ID IN ('DB6B9D62-CB8E-417D-8A04-4CBC5F65CD9A', 'EB07016C-AE35-4EF9-804B-91563529A08A', '7A873E1A-692E-43FA-97F8-57D8161A985C')",
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(appsRes.Success, `RunView on MJ: Applications failed: ${appsRes.ErrorMessage}`);

    const libraryApp = appsRes.Results.find((a) => UUIDsEqual(a.ID, 'DB6B9D62-CB8E-417D-8A04-4CBC5F65CD9A'));
    Assert(libraryApp !== undefined, 'Dedicated Library application (DB6B9D62-CB8E-417D-8A04-4CBC5F65CD9A) must exist');
    AssertEqual(libraryApp!.Name, 'Library', 'Library application Name');
    AssertEqual(libraryApp!.DefaultForNewUser, true, 'Library DefaultForNewUser');
    AssertEqual(libraryApp!.NavigationStyle, 'Both', 'Library NavigationStyle');
    AssertEqual(libraryApp!.TopNavLocation, 'Left of User Menu', 'Library TopNavLocation');
    const libraryNav = parseNavItems(libraryApp!.DefaultNavItems);
    Assert(
        libraryNav.some((item) => item.DriverClass === 'LibraryResource'),
        'Library DefaultNavItems must register LibraryResource',
    );

    const fileBrowserApp = appsRes.Results.find((a) => UUIDsEqual(a.ID, 'EB07016C-AE35-4EF9-804B-91563529A08A'));
    Assert(fileBrowserApp !== undefined, 'File Browser application (EB07016C-AE35-4EF9-804B-91563529A08A) must remain intact');
    AssertEqual(fileBrowserApp!.Name, 'File Browser', 'File Browser application Name preserved');
    const fbNav = parseNavItems(fileBrowserApp!.DefaultNavItems);
    Assert(
        fbNav.some((item) => item.DriverClass === 'FileBrowserResource'),
        'File Browser DefaultNavItems must retain FileBrowserResource for T118 compatibility',
    );

    const chatApp = appsRes.Results.find((a) => UUIDsEqual(a.ID, '7A873E1A-692E-43FA-97F8-57D8161A985C'));
    Assert(chatApp !== undefined, 'Chat application (7A873E1A-692E-43FA-97F8-57D8161A985C) must exist');
    const chatNav = parseNavItems(chatApp!.DefaultNavItems);
    Assert(
        chatNav.some((item) => item.Label === 'Library' && item.DriverClass === 'ChatCollectionsResource'),
        'Chat DefaultNavItems must include "Library" backed by ChatCollectionsResource',
    );
    Assert(
        chatNav.some((item) => item.Label === 'Agent Activity' && item.DriverClass === 'ChatTasksResource'),
        'Chat DefaultNavItems must include "Agent Activity" backed by ChatTasksResource',
    );
    Assert(
        !chatNav.some((item) => item.Label === 'Tasks'),
        'Chat DefaultNavItems must not use the ambiguous legacy "Tasks" label',
    );

    // 5. All 5 Artifact.* Remote Operations and artifact API scopes must be seeded in metadata
    const expectedRemoteOps = [
        'Artifact.EvaluateAiFormula',
        'Artifact.SynthesizeFromSources',
        'Artifact.LogComplianceAudit',
        'Artifact.CreateGuestShareLink',
        'Artifact.RevokeGuestShareLink',
    ];
    const remoteOpsRes = await rv.RunView<MJRemoteOperationEntityType>(
        {
            EntityName: 'MJ: Remote Operations',
            ExtraFilter: `OperationKey IN (${expectedRemoteOps.map((k) => `'${k}'`).join(',')})`,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(remoteOpsRes.Success, `RunView on MJ: Remote Operations failed: ${remoteOpsRes.ErrorMessage}`);
    for (const opKey of expectedRemoteOps) {
        const opRow = remoteOpsRes.Results.find((r) => r.OperationKey === opKey);
        Assert(opRow !== undefined, `MJ: Remote Operations must seed '${opKey}'`);
        AssertEqual(opRow!.Status, 'Active', `Remote operation '${opKey}' must have Status='Active'`);
    }

    const expectedArtifactScopes = ['artifact', 'artifact:read', 'artifact:edit', 'artifact:comment', 'artifact:share'];
    const scopesRes = await rv.RunView<MJAPIScopeEntityType>(
        {
            EntityName: 'MJ: API Scopes',
            ExtraFilter: `FullPath IN (${expectedArtifactScopes.map((s) => `'${s}'`).join(',')})`,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(scopesRes.Success, `RunView on MJ: API Scopes failed: ${scopesRes.ErrorMessage}`);
    for (const scopePath of expectedArtifactScopes) {
        const scopeRow = scopesRes.Results.find((s) => s.FullPath === scopePath);
        Assert(scopeRow !== undefined, `MJ: API Scopes must seed '${scopePath}'`);
    }
}

// ─── DSL2: Physical catalog constraints and base view RunViews ────────────────

async function checkDsl2PhysicalConstraintsAndViews(ctx: IntegrationCheckContext): Promise<void> {
    const expectedConstraints = [
        'PK_ArtifactWorkingState',
        'UQ_ArtifactWorkingState_ArtifactID',
        'FK_ArtifactWorkingState_Artifact',
        'FK_ArtifactWorkingState_LastModifiedByUser',
        'FK_Artifact_DelegateEntity',
        'CK_Artifact_DelegateBinding',
    ];

    const schemaName = ctx.Schema || '__mj';
    let foundLower: Set<string> | null = null;
    if (ctx.Pool) {
        const result = await ctx.Pool.request().query<{ name: string }>(`
            SELECT o.name
              FROM sys.objects o
              JOIN sys.schemas s ON o.schema_id = s.schema_id
             WHERE s.name = '${schemaName}'
               AND o.name IN (${expectedConstraints.map((c) => `'${c}'`).join(', ')})
        `);
        foundLower = new Set(result.recordset.map((r) => r.name.toLowerCase()));
    } else {
        const platformKey = Reflect.get(ctx.Provider, 'PlatformKey');
        const executeSql = Reflect.get(ctx.Provider, 'ExecuteSQL');
        if (platformKey === 'postgresql' && typeof executeSql === 'function') {
            const rows: Array<{ name: string }> = await executeSql.call(
                ctx.Provider,
                `SELECT con.conname AS "name"
                   FROM pg_constraint con
                   JOIN pg_namespace nsp ON nsp.oid = con.connamespace
                  WHERE nsp.nspname = '${schemaName}'
                    AND con.conname IN (${expectedConstraints.map((c) => `'${c.toLowerCase()}'`).join(', ')})`,
            );
            foundLower = new Set(rows.map((r) => String(r.name).toLowerCase()));
        } else {
            SkipCheck('no catalog access on this run path: needs an mssql pool or PostgreSQL ExecuteSQL');
        }
    }

    for (const name of expectedConstraints) {
        Assert(
            foundLower!.has(name.toLowerCase()),
            `Constraint "${name}" must exist in schema ${schemaName}`,
        );
    }

    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const systemUser = UserCache.Instance.GetSystemUser() ?? ctx.User;
    for (const entityName of [
        'MJ: Artifact Working States',
        'MJ: Artifacts',
        'MJ: Artifact Versions',
        'MJ: Artifact Permissions',
        'MJ: Collections',
    ]) {
        const actor = entityName === 'MJ: Artifact Working States' ? systemUser : ctx.User;
        const [simpleRes, countRes] = await Promise.all([
            rv.RunView<{ ID: string }>(
                { EntityName: entityName, MaxRows: 3, ResultType: 'simple' },
                actor,
            ),
            rv.RunView<{ ID: string }>(
                { EntityName: entityName, ResultType: 'count_only' },
                actor,
            ),
        ]);
        Assert(simpleRes.Success, `RunView (simple) failed on '${entityName}': ${simpleRes.ErrorMessage}`);
        Assert(countRes.Success, `RunView (count_only) failed on '${entityName}': ${countRes.ErrorMessage}`);
    }
}

// ─── DSL3: Live DB Working State CRUD, Constraints, and O4 Delegated Perms ───

async function checkDsl3LiveWorkingStateAndDelegatedPerms(ctx: IntegrationCheckContext): Promise<void> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const typesRes = await rv.RunView<MJArtifactTypeEntityType>(
        {
            EntityName: 'MJ: Artifact Types',
            ExtraFilter: "Name IN ('Markdown Document', 'Whiteboard')",
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(typesRes.Success, `Failed to load Markdown Document & Whiteboard artifact types: ${typesRes.ErrorMessage}`);
    const docType = typesRes.Results.find((t) => t.Name === 'Markdown Document');
    const wbType = typesRes.Results.find((t) => t.Name === 'Whiteboard');
    Assert(Boolean(docType?.ID && wbType?.ID), 'Markdown Document and Whiteboard types must exist with IDs');
    const docTypeId = docType!.ID!;
    const wbTypeId = wbType!.ID!;

    const artifactsEnt = ctx.Provider.EntityByName('MJ: Artifacts');
    Assert(artifactsEnt !== undefined, 'MJ: Artifacts EntityInfo must exist');

    let parentDoc: MJArtifactEntity | null = null;
    let parentVer: MJArtifactVersionEntity | null = null;
    let workingState: MJArtifactWorkingStateEntity | null = null;
    let childWhiteboard: MJArtifactEntity | null = null;
    let sharedPerm: MJArtifactPermissionEntity | null = null;

    try {
        // 1. Verify CK_Artifact_DelegateBinding rejects half-populated delegation
        const invalidDelegated = await ctx.Provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        invalidDelegated.NewRecord();
        invalidDelegated.Name = `__IT170_InvalidDelegate_${suffix}`;
        invalidDelegated.TypeID = docTypeId;
        invalidDelegated.UserID = ctx.User.ID;
        invalidDelegated.Visibility = 'Always';
        invalidDelegated.DelegateEntityID = artifactsEnt!.ID;
        invalidDelegated.DelegateRecordID = null;
        const invalidSaved = await invalidDelegated.Save();
        Assert(!invalidSaved, 'CK_Artifact_DelegateBinding must reject DelegateEntityID without DelegateRecordID');

        // 2. Create throwaway parent Document + Version 1
        parentDoc = await ctx.Provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        parentDoc.NewRecord();
        parentDoc.Name = `__IT170_ParentDoc_${suffix}`;
        parentDoc.Description = 'Integration test parent document for Yjs working state and OLE delegation';
        parentDoc.TypeID = docTypeId;
        parentDoc.UserID = ctx.User.ID;
        parentDoc.Visibility = 'Always';
        Assert(
            await parentDoc.Save(),
            `Failed to save parent MJArtifactEntity: ${parentDoc.LatestResult?.CompleteMessage ?? ''}`,
        );

        parentVer = await ctx.Provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
        parentVer.NewRecord();
        parentVer.ArtifactID = parentDoc.ID;
        parentVer.VersionNumber = 1;
        parentVer.Name = parentDoc.Name;
        parentVer.UserID = ctx.User.ID;
        parentVer.ContentMode = 'Text';
        parentVer.Content = `# Integration Test Document ${suffix}\n\nInitial version checkpoint.`;
        Assert(
            await parentVer.Save(),
            `Failed to save MJArtifactVersionEntity: ${parentVer.LatestResult?.CompleteMessage ?? ''}`,
        );

        // 3. Create MJArtifactWorkingStateEntity with binary Yjs state (base64) as systemUser and verify full multi-byte VARBINARY(MAX) round-trip + 1:1 UQ constraint
        const systemUser = UserCache.Instance.GetSystemUser() ?? ctx.User;
        const sampleYjsBytes = Buffer.from([0x01, 0x03, 0x79, 0x6a, 0x73, 0x2d, 0x63, 0x72, 0x64, 0x74]);
        const expectedBase64 = sampleYjsBytes.toString('base64');

        workingState = await ctx.Provider.GetEntityObject<MJArtifactWorkingStateEntity>(
            'MJ: Artifact Working States',
            systemUser,
        );
        workingState.NewRecord();
        workingState.ArtifactID = parentDoc.ID;
        workingState.YjsState = expectedBase64;
        workingState.LastModifiedByUserID = ctx.User.ID;
        Assert(
            await workingState.Save(),
            `Failed to save MJArtifactWorkingStateEntity: ${workingState.LatestResult?.CompleteMessage ?? ''}`,
        );

        // Verify MJArtifactWorkingStateEntityServer rejects non-system writes while systemUser Load() + RunView + Save() round-trips full multi-byte VARBINARY(MAX)
        const reloadedEntity = await ctx.Provider.GetEntityObject<MJArtifactWorkingStateEntity>(
            'MJ: Artifact Working States',
            systemUser,
        );
        Assert(
            await reloadedEntity.Load(workingState.ID),
            'System user must be able to Load() MJ: Artifact Working States',
        );
        AssertEqual(
            reloadedEntity.YjsState,
            expectedBase64,
            'Load() must preserve full multi-byte VARBINARY(MAX) payload without 1-byte truncation',
        );

        interface WorkingStateSimpleRow {
            ID: string;
            ArtifactID: string;
            YjsState: string | Buffer | null;
            Artifact: string | null;
        }
        const reloadedWsRes = await rv.RunView<WorkingStateSimpleRow>(
            {
                EntityName: 'MJ: Artifact Working States',
                ExtraFilter: `ID = '${workingState.ID}'`,
                IncludeBinaryFields: true,
                ResultType: 'simple',
            },
            systemUser,
        );
        Assert(reloadedWsRes.Success && reloadedWsRes.Results.length === 1, 'Working state row must reload via RunView');
        AssertEqual(reloadedWsRes.Results[0].Artifact, parentDoc.Name, 'Virtual Artifact column on vwArtifactWorkingStates');

        const updatedYjsBase64 = Buffer.from([0x01, 0x05, 0x79, 0x6a, 0x73, 0x2d, 0x76, 0x32]).toString('base64');
        reloadedEntity.YjsState = updatedYjsBase64;
        Assert(
            await reloadedEntity.Save(),
            `Server-side working state update via Save() failed: ${reloadedEntity.LatestResult?.CompleteMessage ?? ''}`,
        );

        // Duplicate Save() on MJArtifactWorkingStateEntityServer converges idempotently onto the single 1:1 row,
        // while raw SQL insert / sproc create against the base table is rejected by UQ_ArtifactWorkingState_ArtifactID.
        const duplicateWs = await ctx.Provider.GetEntityObject<MJArtifactWorkingStateEntity>(
            'MJ: Artifact Working States',
            systemUser,
        );
        duplicateWs.NewRecord();
        duplicateWs.ArtifactID = parentDoc.ID;
        duplicateWs.YjsState = expectedBase64;
        const dupSaved = await duplicateWs.Save();
        Assert(dupSaved, 'MJArtifactWorkingStateEntityServer.Save() must converge idempotently on ArtifactID');

        const afterUpsertRes = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Artifact Working States',
                ExtraFilter: `ArtifactID = '${parentDoc.ID}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            systemUser,
        );
        Assert(
            afterUpsertRes.Success && afterUpsertRes.Results.length === 1 && UUIDsEqual(afterUpsertRes.Results[0].ID, workingState.ID),
            'Upsert Save() must preserve exactly one working state row with the original ID',
        );

        if (ctx.Provider instanceof DatabaseProviderBase) {
            const schema = ctx.Provider.ConfigData.MJCoreSchemaName || '__mj';
            let rawDupRejected = false;
            try {
                if (ctx.Provider.PlatformKey === 'sqlserver') {
                    const spCreate = ctx.Provider.QuoteSchemaAndView(schema, 'spCreateArtifactWorkingState');
                    await ctx.Provider.ExecuteSQL(
                        `EXEC ${spCreate} @ID = @p0, @ArtifactID = @p1, @YjsState = @p2`,
                        [randomUUID(), parentDoc.ID, sampleYjsBytes],
                        { isMutation: true },
                        systemUser,
                    );
                } else {
                    const table = ctx.Provider.QuoteSchemaAndView(schema, 'ArtifactWorkingState');
                    const colId = ctx.Provider.QuoteIdentifier('ID');
                    const colArt = ctx.Provider.QuoteIdentifier('ArtifactID');
                    const colState = ctx.Provider.QuoteIdentifier('YjsState');
                    await ctx.Provider.ExecuteSQL(
                        `INSERT INTO ${table} (${colId}, ${colArt}, ${colState}) VALUES ($1, $2, $3)`,
                        [randomUUID(), parentDoc.ID, sampleYjsBytes],
                        { isMutation: true },
                        systemUser,
                    );
                }
            } catch {
                rawDupRejected = true;
            }
            Assert(rawDupRejected, 'UQ_ArtifactWorkingState_ArtifactID must reject a second working state row at the DB level');
        }

        // Verify MJArtifactEntityServer blocks self-delegation (B2)
        parentDoc.DelegateEntityID = artifactsEnt!.ID;
        parentDoc.DelegateRecordID = parentDoc.ID;
        const selfDelegatedSaved = await parentDoc.Save();
        Assert(!selfDelegatedSaved, 'MJArtifactEntityServer must reject self-delegation (B2)');
        await parentDoc.Load(parentDoc.ID);

        // 4. Create inline OLE child Whiteboard delegated to parentDoc (O4)
        const registeredDelegate = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactPermissionDelegate>(
            BaseArtifactPermissionDelegate,
            'MJ: Artifacts',
        );
        Assert(
            registeredDelegate instanceof ParentArtifactPermissionDelegate,
            'ParentArtifactPermissionDelegate must resolve for MJ: Artifacts',
        );

        childWhiteboard = await ctx.Provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        childWhiteboard.NewRecord();
        childWhiteboard.Name = `__IT170_ChildWhiteboard_${suffix}`;
        childWhiteboard.TypeID = wbTypeId;
        childWhiteboard.UserID = ctx.User.ID;
        childWhiteboard.Visibility = 'Always';
        childWhiteboard.DelegateEntityID = artifactsEnt!.ID;
        childWhiteboard.DelegateRecordID = parentDoc.ID;
        Assert(
            await childWhiteboard.Save(),
            `Failed to save delegated child Whiteboard: ${childWhiteboard.LatestResult?.CompleteMessage ?? ''}`,
        );

        // Owner of parentDoc resolves full access on childWhiteboard
        const ownerChildPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            ctx.Provider,
            childWhiteboard.ID,
            ctx.User,
        );
        Assert(ownerChildPerms.CanRead && ownerChildPerms.CanEdit, 'Parent owner must have CanRead + CanEdit on child');

        // Resolve a real seeded second user from MJ: Users so FK constraints on UserID are satisfied and refusals come strictly from ACL checks
        const seededPeerRes = await rv.RunView<MJUserEntityType>(
            {
                EntityName: 'MJ: Users',
                ExtraFilter: `ID <> '${ctx.User.ID}' AND IsActive = 1`,
                OrderBy: "CASE WHEN Email = 'it-artifact-viewer@integration.test' THEN 0 ELSE 1 END",
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(
            seededPeerRes.Success && seededPeerRes.Results.length > 0 && Boolean(seededPeerRes.Results[0].ID),
            'DSL3 requires at least one real active non-owner user row in MJ: Users (seed metadata-optional/integration-test)',
        );
        const peerRow = seededPeerRes.Results[0];
        const peerRolesRes = await rv.RunView<MJUserRoleEntityType>(
            {
                EntityName: 'MJ: User Roles',
                ExtraFilter: `UserID = '${peerRow.ID}'`,
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(peerRolesRes.Success, `Failed to load MJ: User Roles for outsider peer: ${peerRolesRes.ErrorMessage}`);
        const peerUserRoles = peerRolesRes.Results.map(
            (r) =>
                new UserRoleInfo({
                    UserID: peerRow.ID!,
                    RoleID: r.RoleID,
                    Role: r.Role ?? '',
                }),
        );
        const outsider = new UserInfo(ctx.Provider, {
            ID: peerRow.ID!,
            Name: peerRow.Name ?? 'Unshared Outsider',
            Email: peerRow.Email ?? 'it-artifact-viewer@integration.test',
            IsActive: true,
            UserRoles: peerUserRoles,
        });

        const outsiderPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            ctx.Provider,
            childWhiteboard.ID,
            outsider,
        );
        AssertEqual(outsiderPerms.CanRead, false, 'Unshared outsider must be denied CanRead on delegated child');
        AssertEqual(outsiderPerms.CanEdit, false, 'Unshared outsider must be denied CanEdit on delegated child');
        AssertEqual(outsiderPerms.Source, 'Denied', 'Explicit delegate denial resolves Source=Denied');
        Assert(
            outsiderPerms.Reason.includes('delegate entity'),
            `Delegated denial Reason must cite delegate entity (got: ${outsiderPerms.Reason})`,
        );

        // Verify non-system restricted user cannot Save() MJ: Artifact Working States directly
        const unauthorizedWs = await ctx.Provider.GetEntityObject<MJArtifactWorkingStateEntity>(
            'MJ: Artifact Working States',
            outsider,
        );
        unauthorizedWs.NewRecord();
        unauthorizedWs.ArtifactID = parentDoc.ID;
        unauthorizedWs.YjsState = expectedBase64;
        const unauthorizedWsSaved = await unauthorizedWs.Save();
        Assert(!unauthorizedWsSaved, 'Non-system restricted user must be refused Save() on MJ: Artifact Working States');

        // Verify real seeded user without CanEdit is refused Save() on MJ: Artifact Versions specifically by MJArtifactVersionEntityServer ACL check
        const unauthorizedVer = await ctx.Provider.GetEntityObject<MJArtifactVersionEntity>(
            'MJ: Artifact Versions',
            outsider,
        );
        unauthorizedVer.NewRecord();
        unauthorizedVer.ArtifactID = parentDoc.ID;
        unauthorizedVer.VersionNumber = 2;
        unauthorizedVer.Name = 'Unauthorized Version Save';
        unauthorizedVer.UserID = outsider.ID;
        unauthorizedVer.ContentMode = 'Text';
        unauthorizedVer.Content = '# Unauthorized Version Injection';
        const unauthorizedVerSaved = await unauthorizedVer.Save();
        const verErrorMsg = unauthorizedVer.LatestResult?.CompleteMessage ?? '';
        Assert(!unauthorizedVerSaved, 'Restricted user without CanEdit must be refused Save() on MJ: Artifact Versions');
        Assert(
            verErrorMsg.includes('does not hold Edit permission on artifact'),
            `MJArtifactVersionEntityServer must refuse Save() with artifact ACL message, not FK error (got: ${verErrorMsg})`,
        );

        // Verify ArtifactToolManager refuses mutating agent tool calls when running as a user without CanEdit
        const readonlyToolMgr = new ArtifactToolManager();
        readonlyToolMgr.Initialize(
            [
                {
                    artifactId: parentDoc.ID,
                    versionId: parentVer.ID,
                    versionNumber: 1,
                    name: parentDoc.Name,
                    typeName: 'Markdown Document',
                    toolLibraryClass: 'DocumentToolLibrary',
                    content: parentVer.Content ?? '',
                },
            ],
            {
                contextUser: outsider,
                provider: ctx.Provider,
            },
        );
        const deniedToolRes = await readonlyToolMgr.ExecuteSingleToolCall({
            artifactId: 'A',
            tool: 'replace_block',
            input: {
                blockId: 'b-0',
                markdown: '# Unauthorized Agent Mutation',
            },
        });
        Assert(!deniedToolRes.result.success, 'ArtifactToolManager must refuse mutating tool calls for a user without CanEdit');

        // Grant Read-Only on parentDoc to the real seeded user and verify cascade to childWhiteboard
        sharedPerm = await ctx.Provider.GetEntityObject<MJArtifactPermissionEntity>(
            'MJ: Artifact Permissions',
            ctx.User,
        );
        sharedPerm.NewRecord();
        sharedPerm.ArtifactID = parentDoc.ID;
        sharedPerm.UserID = outsider.ID;
        sharedPerm.CanRead = true;
        sharedPerm.CanEdit = false;
        sharedPerm.CanDelete = false;
        sharedPerm.CanShare = false;
        Assert(
            await sharedPerm.Save(),
            `Failed to save parent MJArtifactPermissionEntity: ${sharedPerm.LatestResult?.CompleteMessage ?? ''}`,
        );

        const cascadedPeerPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            ctx.Provider,
            childWhiteboard.ID,
            outsider,
        );
        AssertEqual(cascadedPeerPerms.CanRead, true, 'Parent Read share must cascade CanRead=true to child OLE artifact');
        AssertEqual(cascadedPeerPerms.CanEdit, false, 'Parent Read-only share must keep CanEdit=false on child OLE artifact');
        AssertEqual(cascadedPeerPerms.Source, 'Delegate', 'Cascaded child permission Source must be Delegate');
    } finally {
        const teardownTargets: Array<{ label: string; entity: { IsSaved: boolean; Delete(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null } | null }> = [
            { label: 'sharedPerm', entity: sharedPerm },
            { label: 'childWhiteboard', entity: childWhiteboard },
            { label: 'workingState', entity: workingState },
            { label: 'parentVer', entity: parentVer },
            { label: 'parentDoc', entity: parentDoc },
        ];
        for (const { label, entity } of teardownTargets) {
            if (entity?.IsSaved) {
                const deleted = await entity.Delete();
                if (!deleted) {
                    console.warn(
                        `[IT170 DSL3 teardown] Delete() returned false for ${label}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            }
        }
    }
}

// ─── DSL4: DocumentLiveBlockEngine live execution & O5 freeze gate ────────────

async function checkDsl4DocumentLiveBlocksAndFreeze(ctx: IntegrationCheckContext): Promise<void> {
    const engine = DocumentLiveBlockEngine.Instance;

    for (const kind of ['EntityView', 'SavedQuery', 'DashboardPart', 'InteractiveComponent', 'Artifact'] as const) {
        const handler = engine.GetBlockHandler(kind);
        Assert(handler instanceof BaseDocumentBlock, `DocumentLiveBlockEngine must register handler for '${kind}'`);
    }

    // 1. Live EntityView execution against real database MJ: Artifact Types
    const liveSpec: DocumentBlockSpec = {
        BlockID: 'blk-it169-artifact-types',
        Kind: 'EntityView',
        Mode: 'Live',
        Title: 'Governed Office Artifact Types',
        EntityName: 'MJ: Artifact Types',
        Fields: ['ID', 'Name', 'DriverClass', 'ToolLibraryClass'],
        ExtraFilter: "Name IN ('Markdown Document', 'Presentation', 'Excel Spreadsheet', 'Whiteboard')",
        OrderBy: 'Name ASC',
    };

    const liveRes = await engine.ExecuteBlock(liveSpec, ctx.User, ctx.Provider);
    Assert(liveRes.Success, `Live EntityView block failed: ${liveRes.ErrorMessage ?? ''}`);
    AssertEqual(liveRes.Rows.length, 4, 'Live EntityView block must return all 4 office artifact types');
    const colNames = liveRes.Columns.map((c) => c.Name);
    Assert(colNames.includes('Name') && colNames.includes('ToolLibraryClass'), 'Projected columns must include Name & ToolLibraryClass');

    // 2. O5 Freeze security warning gate: must refuse acknowledgeSecurityWarning = false
    const unacknowledgedFreeze = await engine.FreezeBlock(liveSpec, ctx.User, false, ctx.Provider);
    Assert(!unacknowledgedFreeze.Success, 'FreezeBlock must fail closed when acknowledgeSecurityWarning is false');

    // 3. Acknowledge warning -> freezes snapshot with FrozenByUserID & FrozenAt
    const freezeRes = await engine.FreezeBlock(liveSpec, ctx.User, true, ctx.Provider);
    Assert(freezeRes.Success && freezeRes.UpdatedSpec !== undefined, 'FreezeBlock with acknowledgment must succeed');
    const frozenSpec = freezeRes.UpdatedSpec!;
    AssertEqual(frozenSpec.Mode, 'Frozen', 'Frozen block Mode');
    AssertEqual(frozenSpec.FrozenSnapshot?.FrozenByUserID, ctx.User.ID, 'FrozenSnapshot.FrozenByUserID');
    AssertEqual(frozenSpec.FrozenSnapshot?.SecurityWarningAcknowledged, true, 'FrozenSnapshot.SecurityWarningAcknowledged');
    AssertEqual(frozenSpec.FrozenSnapshot?.Rows.length, 4, 'FrozenSnapshot row count');

    // 4. Tampered snapshot with SecurityWarningAcknowledged: false must fail closed on ExecuteBlock
    const tamperedSpec: DocumentBlockSpec = {
        ...frozenSpec,
        FrozenSnapshot: {
            ...frozenSpec.FrozenSnapshot!,
            SecurityWarningAcknowledged: false,
        },
    };
    const tamperedExec = await engine.ExecuteBlock(tamperedSpec, ctx.User, ctx.Provider);
    Assert(!tamperedExec.Success, 'Tampered FrozenSnapshot without SecurityWarningAcknowledged must fail closed');

    // 4b. ValidateFrozenBlockSnapshot accepts server HMAC-SHA256 signatures and flags unsigned or plain-SHA256 forged hashes as unverified
    const validSigCheck = ValidateFrozenBlockSnapshot(frozenSpec.FrozenSnapshot);
    Assert(validSigCheck.Valid && validSigCheck.SnapshotVerified, 'HMAC-signed FrozenSnapshot must verify as SnapshotVerified=true');

    const forgedPlainShaCheck = ValidateFrozenBlockSnapshot({
        ...frozenSpec.FrozenSnapshot!,
        SnapshotContentHash: 'a'.repeat(64),
    });
    AssertEqual(forgedPlainShaCheck.SnapshotVerified, false, 'Plain SHA-256 without hmac-sha256: prefix must be rejected as SnapshotVerified=false');

    // 4c. Live EntityView block evaluation is denied for a user without read access to the target entity
    const zeroRolesUser = new UserInfo(ctx.Provider, {
        ID: '00000000-0000-0000-0000-000000000098',
        Name: 'No Roles Viewer',
        Email: 'noroles-it169@example.invalid',
        IsActive: true,
        UserRoles: [],
    });
    const deniedLiveExec = await engine.ExecuteBlock(liveSpec, zeroRolesUser, ctx.Provider);
    Assert(!deniedLiveExec.Success && deniedLiveExec.AccessDenied === true, 'Live EntityView execution must be denied for a user without entity CanRead');

    // 5. Markdown :::mj-block directive lossless round-trip
    const directive = engine.SerializeBlockToMarkdownDirective(frozenSpec);
    const md = `# Executive Report\n\n${directive}\n\n## Next Steps\nShipped.`;
    const parsedSegments = engine.ParseMarkdownDirectives(md).filter((s) => s.Type === 'mj-block');
    AssertEqual(parsedSegments.length, 1, 'ParseMarkdownDirectives must recover 1 mj-block segment');
    AssertEqual(parsedSegments[0].BlockSpec?.BlockID, frozenSpec.BlockID, 'Round-tripped BlockID');
    AssertEqual(parsedSegments[0].BlockSpec?.Mode, 'Frozen', 'Round-tripped Frozen Mode');
}

// ─── DSL5: SlideDeckEngine conversion, isolation, themes & O6 presenter freeze

async function checkDsl5SlideDeckEngine(_ctx: IntegrationCheckContext): Promise<void> {
    const engine = SlideDeckEngine.Instance;

    const markdown = [
        '# Board Strategy Update',
        'Unified Docs, Slides, Sheets, and Library.',
        '> Speaker Notes: Open with customer momentum.',
        '',
        '## Architecture Highlights',
        '- Real-time Yjs CRDT co-editing',
        '- Viewer-scoped RLS and FLS live blocks',
        '',
        '## Live Platform Metrics',
        ':::mj-block',
        '{"BlockID":"blk-slide-ev","Kind":"EntityView","Mode":"Live","Title":"Artifact Types","EntityName":"MJ: Artifact Types","DisplayMode":"table"}',
        ':::',
    ].join('\n');

    const deck = engine.ConvertMarkdownToSlideDeck(markdown, 'Board Strategy Update');
    AssertEqual(deck.AspectRatio, '16:9', 'Default SlideDeckSpec AspectRatio');
    AssertEqual(deck.Slides.length, 3, 'Markdown conversion slide count');
    AssertEqual(deck.Slides[0].Layout, 'Title', 'First slide Layout');
    Assert(deck.Slides[0].SpeakerNotes.includes('customer momentum'), 'Speaker notes extracted');
    AssertEqual(deck.Slides[2].Layout, 'LiveDataSlide', 'Third slide LiveDataSlide Layout');

    // Single-slide isolation
    const slide1Before = JSON.stringify(deck.Slides[0]);
    const slide3Before = JSON.stringify(deck.Slides[2]);
    const { Deck: updatedDeck } = engine.UpdateSlideMetadata(deck, deck.Slides[1].SlideID, {
        Title: 'Updated Architecture Highlights',
    });
    AssertEqual(JSON.stringify(updatedDeck.Slides[0]), slide1Before, 'Slide 1 untouched when updating Slide 2');
    AssertEqual(JSON.stringify(updatedDeck.Slides[2]), slide3Before, 'Slide 3 untouched when updating Slide 2');

    // Concurrent-safe reorder preserves slides omitted from orderedSlideIds
    const reordered = engine.ReorderSlides(updatedDeck, [deck.Slides[2].SlideID, deck.Slides[0].SlideID]);
    AssertEqual(reordered.Slides.length, 3, 'ReorderSlides must preserve omitted slides');
    AssertEqual(reordered.Slides[0].SlideID, deck.Slides[2].SlideID, 'Reordered first SlideID');

    // Contrast-safe brand theme derivation + preset application
    const darkThemed = engine.ApplyTheme(reordered, {
        OrganizationName: 'MJ Enterprise',
        PrimaryColor: '#6366F1',
        BackgroundColor: '#0F172A',
    });
    AssertEqual(darkThemed.Theme.TextColor.toUpperCase(), '#F8FAFC', 'Dark brand background derives light foreground');
    const presetDeck = engine.ApplyTheme(darkThemed, SLIDE_DECK_THEME_PRESETS[0].ThemeID);
    AssertEqual(presetDeck.Theme.ThemeID, SLIDE_DECK_THEME_PRESETS[0].ThemeID, 'Preset ThemeID applied');

    // O6 Presenter Freeze
    const execMap = new Map<string, DocumentBlockExecutionResult>([
        [
            'blk-slide-ev',
            {
                Success: true,
                BlockID: 'blk-slide-ev',
                Kind: 'EntityView',
                Mode: 'Live',
                Columns: [{ Name: 'Name', DisplayName: 'Name' }],
                Rows: [{ Name: 'Presentation' }],
                TotalRowCount: 1,
            },
        ],
    ]);
    const frozenForPres = engine.FreezeDeckLiveBlocksForPresentation(deck, execMap, {
        ID: 'presenter-user-id',
        Name: 'Presenter User',
    });
    const frozenRegionBlock = engine.ExtractRegionBlockSpec(frozenForPres.Slides[2].Regions[0]);
    AssertEqual(frozenRegionBlock?.Mode, 'Frozen', 'Presenter freeze converts Live block to Frozen');
    AssertEqual(frozenRegionBlock?.FrozenSnapshot?.Rows.length, 1, 'Presenter freeze preserves snapshot rows');
}

// ─── DSL6: SpreadsheetEngine stable-ID formulas, live =MJ.VIEW & .xlsx ────────

async function checkDsl6SpreadsheetEngineAndLiveData(ctx: IntegrationCheckContext): Promise<void> {
    const engine = SpreadsheetEngine.Instance;
    engine.ClearViewerFunctionCache();

    // 1. Stable-ID formula coordinate shifting & cycle detection
    const wb = engine.CreateEmptyWorkbook('IT170 Financial Model', ['Model', 'Rates'], 20, 8);
    const modelSheet = wb.Worksheets[0];
    const ratesSheet = wb.Worksheets[1];

    engine.SetCell(wb, ratesSheet.SheetID, 'B2', { Value: 0.1, Style: { FormatType: 'percent' } }, false);
    engine.SetCell(wb, modelSheet.SheetID, 'B2', { Value: 1200, Style: { FormatType: 'currency' } }, false);
    engine.SetCell(wb, modelSheet.SheetID, 'B3', { Value: 1800, Style: { FormatType: 'currency' } }, false);
    const sumCell = engine.SetCell(
        wb,
        modelSheet.SheetID,
        'B4',
        { Formula: '=SUM(B2:B3)', Style: { Bold: true, FormatType: 'currency' } },
        false,
    );
    await engine.EvaluateWorkbookIsolated(wb);
    AssertEqual(modelSheet.Cells['B4']?.ComputedValue, 3000, 'Initial =SUM(B2:B3) ComputedValue');
    Assert(Boolean((modelSheet.Cells['B4']?.FormulaStable ?? sumCell.FormulaStable)?.includes('@RANGE(')), 'FormulaStable must encode @RANGE stable IDs');

    // Insert 1 row at top and 1 column at left -> B4 shifts to C5 with =SUM(C3:C4)
    engine.InsertRows(wb, modelSheet.SheetID, 1, 1, undefined, false);
    engine.InsertColumns(wb, modelSheet.SheetID, 1, 1, undefined, false);
    await engine.EvaluateWorkbookIsolated(wb);
    const shifted = modelSheet.Cells['C5'];
    Assert(shifted !== undefined, 'Shifted sum cell must reside at C5');
    AssertEqual(shifted!.Formula, '=SUM(C3:C4)', 'Formula coordinates must shift to =SUM(C3:C4)');
    AssertEqual(shifted!.ComputedValue, 3000, 'Shifted sum cell ComputedValue must remain 3000');

    // Cycle detection
    engine.SetCell(wb, modelSheet.SheetID, 'F2', { Formula: '=F3 + 1' }, false);
    engine.SetCell(wb, modelSheet.SheetID, 'F3', { Formula: '=F2 + 1' }, false);
    await engine.EvaluateWorkbookIsolated(wb);
    AssertEqual(modelSheet.Cells['F2'].ComputedValue, '#CYCLE!', 'Mutual cell cycle must evaluate to #CYCLE!');

    // Clear cycle cells before .xlsx export round-trip
    engine.SetCell(wb, modelSheet.SheetID, 'F2', { Value: null }, false);
    engine.SetCell(wb, modelSheet.SheetID, 'F3', { Value: null }, false);
    await engine.EvaluateWorkbookIsolated(wb);

    // 2. OpenXML .xlsx lossless export + import round-trip
    const xlsxBytes = engine.ExportToXlsxBytes(wb, true, { SkipEvaluate: true });
    AssertEqual(xlsxBytes[0], 0x50, '.xlsx ZIP header byte 0 ("P")');
    AssertEqual(xlsxBytes[1], 0x4b, '.xlsx ZIP header byte 1 ("K")');

    const reimported = await engine.ImportFromXlsxBytesIsolated(xlsxBytes);
    AssertEqual(reimported.Worksheets.length, 2, 'Reimported worksheet count');
    AssertEqual(reimported.Worksheets[0].Cells['C5']?.Formula, '=SUM(C3:C4)', 'Reimported formula at C5');
    AssertEqual(reimported.Worksheets[0].Cells['C5']?.ComputedValue, 3000, 'Reimported ComputedValue at C5');

    // 3. Live DB LiveTable + =MJ.VIEW custom function + SQL injection guard
    const liveWb = engine.CreateEmptyWorkbook('Live Governance Workbook', ['ArtifactTypes'], 25, 10);
    const liveSheet = liveWb.Worksheets[0];
    liveSheet.LiveTables.push({
        TableID: 'tbl-it169-types',
        Title: 'Office Artifact Types',
        SourceType: 'EntityView',
        EntityName: 'MJ: Artifact Types',
        ExtraFilter: "Name IN ('Markdown Document', 'Presentation', 'Excel Spreadsheet', 'Whiteboard')",
        Fields: ['Name', 'ToolLibraryClass'],
        AnchorCell: 'A1',
        IncludeHeaders: true,
        Mode: 'Live',
    });
    engine.SetCell(
        liveWb,
        liveSheet.SheetID,
        'E2',
        { Formula: '=MJ.VIEW("MJ: Artifact Types", "", "DROP TABLE Artifact")' },
        false,
    );

    const tableRes = await engine.RefreshLiveTables(liveWb, ctx.User, ctx.Provider);
    Assert(tableRes['tbl-it169-types']?.Success === true, 'LiveTable against MJ: Artifact Types must succeed');
    AssertEqual(liveSheet.Cells['A1']?.ComputedValue, 'Name', 'LiveTable header A1');
    Assert(liveSheet.Cells['A2']?.ComputedValue !== null, 'LiveTable first data row A2 must populate');

    await engine.EvaluateMjCustomFunctions(liveWb, ctx.User, ctx.Provider);
    AssertEqual(
        liveSheet.Cells['E2']?.ComputedValue,
        '#MJ_ACCESS_DENIED!',
        'Unsafe SQL in =MJ.VIEW filter must be rejected with #MJ_ACCESS_DENIED!',
    );
}

// ─── DSL7: Agent Artifact Tool Libraries ClassFactory & Headless Execution ────

async function checkDsl7ArtifactToolLibraries(_ctx: IntegrationCheckContext): Promise<void> {
    // 1. DocumentToolLibrary
    const docLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'DocumentToolLibrary',
    );
    Assert(docLib instanceof DocumentToolLibrary, 'ClassFactory must resolve DocumentToolLibrary');

    const sampleDoc = '# Product Roadmap\n\nInitial summary paragraph.\n\n## Milestones\n\n- Wave 1 complete\n';
    const blocksRes = await docLib!.InvokeTool('get_blocks', {}, sampleDoc);
    const blocksPayload = extractToolData<{
        blocks: Array<{ blockId: string; kind: string }>;
        revisionHash: string;
    }>(blocksRes, 'DocumentToolLibrary.get_blocks');
    Assert(blocksPayload.blocks.length >= 3, 'DocumentToolLibrary.get_blocks must parse logical blocks');

    // Optimistic concurrency conflict check
    const staleDocRes = await docLib!.InvokeTool(
        'replace_block',
        {
            blockId: blocksPayload.blocks[1].blockId,
            markdown: 'Should fail on stale hash.',
            expectedRevisionHash: 'stale-revision-hash',
        },
        sampleDoc,
    );
    Assert(!staleDocRes.success, 'DocumentToolLibrary.replace_block must reject stale expectedRevisionHash');

    const validDocRes = await docLib!.InvokeTool(
        'replace_block',
        {
            blockId: blocksPayload.blocks[1].blockId,
            markdown: 'Updated executive summary with Yjs collaboration.',
            expectedRevisionHash: blocksPayload.revisionHash,
        },
        sampleDoc,
    );
    const updatedDocPayload = extractToolData<{ updatedContent: string }>(
        validDocRes,
        'DocumentToolLibrary.replace_block',
    );
    Assert(
        updatedDocPayload.updatedContent.includes('Updated executive summary with Yjs collaboration.'),
        'DocumentToolLibrary.replace_block must update target block content',
    );

    // 2. SlideDeckToolLibrary
    const slideLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'SlideDeckToolLibrary',
    );
    Assert(slideLib instanceof SlideDeckToolLibrary, 'ClassFactory must resolve SlideDeckToolLibrary');

    const genDeckRes = await slideLib!.InvokeTool(
        'generate_deck_from_markdown',
        { markdown: updatedDocPayload.updatedContent, title: 'Roadmap Deck' },
        '',
    );
    const genDeckPayload = extractToolData<{ updatedContent: string }>(
        genDeckRes,
        'SlideDeckToolLibrary.generate_deck_from_markdown',
    );
    const addSlideRes = await slideLib!.InvokeTool(
        'add_slide',
        { layout: 'BigNumber', title: 'Adoption Velocity' },
        genDeckPayload.updatedContent,
    );
    const addSlidePayload = extractToolData<{ updatedContent: string }>(addSlideRes, 'SlideDeckToolLibrary.add_slide');
    Assert(addSlidePayload.updatedContent.includes('Adoption Velocity'), 'SlideDeckToolLibrary.add_slide must add slide');

    // 3. SpreadsheetToolLibrary
    const sheetLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'SpreadsheetToolLibrary',
    );
    Assert(sheetLib instanceof SpreadsheetToolLibrary, 'ClassFactory must resolve SpreadsheetToolLibrary');

    const writeCellsRes = await sheetLib!.InvokeTool(
        'write_cells',
        {
            cells: [
                { address: 'B2', value: 2400, formatType: 'currency' },
                { address: 'B3', value: 1600, formatType: 'currency' },
                { address: 'B4', formula: '=SUM(B2:B3)', formatType: 'currency' },
            ],
        },
        '',
    );
    const writeCellsPayload = extractToolData<{
        updatedContent: string;
        revisionHash: string;
        updatedCells: Array<{ address: string; computedValue: number }>;
    }>(writeCellsRes, 'SpreadsheetToolLibrary.write_cells');
    const b4 = writeCellsPayload.updatedCells.find((c) => c.address === 'B4');
    AssertEqual(b4?.computedValue, 4000, 'SpreadsheetToolLibrary headless =SUM(B2:B3) evaluation');

    // 4. WhiteboardToolLibrary
    const wbLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'WhiteboardToolLibrary',
    );
    Assert(wbLib instanceof WhiteboardToolLibrary, 'ClassFactory must resolve WhiteboardToolLibrary');

    const upsertNodesRes = await wbLib!.InvokeTool(
        'upsert_nodes',
        {
            nodes: [
                { id: 'n-client', label: 'MJ Explorer', shapeType: 'rectangle', x: 80, y: 100 },
                { id: 'n-yjs', label: 'MJServer Yjs Relay', shapeType: 'rectangle', x: 360, y: 100 },
            ],
        },
        '',
    );
    const upsertNodesPayload = extractToolData<{ updatedContent: string }>(
        upsertNodesRes,
        'WhiteboardToolLibrary.upsert_nodes',
    );
    const connectRes = await wbLib!.InvokeTool(
        'connect_nodes',
        { connections: [{ fromId: 'n-client', toId: 'n-yjs', label: 'WebSocket CRDT' }] },
        upsertNodesPayload.updatedContent,
    );
    const connectPayload = extractToolData<{ updatedContent: string }>(
        connectRes,
        'WhiteboardToolLibrary.connect_nodes',
    );
    const summaryRes = await wbLib!.InvokeTool('get_board_summary', {}, connectPayload.updatedContent);
    const summaryPayload = extractToolData<{ totalElements: number }>(
        summaryRes,
        'WhiteboardToolLibrary.get_board_summary',
    );
    AssertEqual(summaryPayload.totalElements, 3, 'Whiteboard must contain 2 shape nodes + 1 connector');
}

// ─── DSL8: NW-2 ancestor-cascading collection ACL, CanShare guards & count oracle ──

async function checkDsl8CollectionAncestryAclAndGuards(ctx: IntegrationCheckContext): Promise<void> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);

    const peerRes = await rv.RunView<MJUserEntityType>(
        {
            EntityName: 'MJ: Users',
            ExtraFilter: `ID <> '${ctx.User.ID}' AND IsActive = 1`,
            OrderBy: "CASE WHEN Email = 'it-artifact-viewer@integration.test' THEN 0 ELSE 1 END",
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(peerRes.Success && peerRes.Results.length > 0 && Boolean(peerRes.Results[0].ID), 'DSL8 requires an active non-owner user row in MJ: Users');
    const peerRow = peerRes.Results[0];

    const peerRolesRes = await rv.RunView<MJUserRoleEntityType>(
        {
            EntityName: 'MJ: User Roles',
            ExtraFilter: `UserID = '${peerRow.ID}'`,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(peerRolesRes.Success, `Failed to load MJ: User Roles for peer user: ${peerRolesRes.ErrorMessage}`);
    const peerUser = new UserInfo(ctx.Provider, {
        ID: peerRow.ID!,
        Name: peerRow.Name ?? 'Peer Reader',
        Email: peerRow.Email ?? 'it-artifact-viewer@integration.test',
        IsActive: true,
        UserRoles: peerRolesRes.Results.map(
            (r) =>
                new UserRoleInfo({
                    UserID: peerRow.ID!,
                    RoleID: r.RoleID,
                    Role: r.Role ?? '',
                }),
        ),
    });

    const typeRes = await rv.RunView<MJArtifactTypeEntityType>(
        {
            EntityName: 'MJ: Artifact Types',
            ExtraFilter: "Name = 'Markdown Document'",
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(typeRes.Success && typeRes.Results.length > 0, 'Markdown Document artifact type must exist');
    const docTypeId = typeRes.Results[0].ID!;

    const envRes = await rv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Environments',
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(envRes.Success && envRes.Results.length > 0, 'At least one MJ: Environments row must exist');
    const envId = envRes.Results[0].ID;

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let rootCol: MJCollectionEntity | null = null;
    let midCol: MJCollectionEntity | null = null;
    let leafCol: MJCollectionEntity | null = null;
    let sharedArt: MJArtifactEntity | null = null;
    let privateArt: MJArtifactEntity | null = null;
    let sharedVer: MJArtifactVersionEntity | null = null;
    let privateVer: MJArtifactVersionEntity | null = null;
    let colArt: MJCollectionArtifactEntity | null = null;
    let rootSharePerm: MJCollectionPermissionEntity | null = null;

    try {
        rootCol = await ctx.Provider.GetEntityObject<MJCollectionEntity>('MJ: Collections', ctx.User);
        rootCol.NewRecord();
        rootCol.Name = `__IT170_RootCol_${suffix}`;
        rootCol.OwnerID = ctx.User.ID;
        rootCol.EnvironmentID = envId;
        Assert(await rootCol.Save(), `Failed saving rootCol: ${rootCol.LatestResult?.CompleteMessage ?? ''}`);

        midCol = await ctx.Provider.GetEntityObject<MJCollectionEntity>('MJ: Collections', ctx.User);
        midCol.NewRecord();
        midCol.Name = `__IT170_MidCol_${suffix}`;
        midCol.ParentID = rootCol.ID;
        midCol.OwnerID = ctx.User.ID;
        midCol.EnvironmentID = envId;
        Assert(await midCol.Save(), `Failed saving midCol: ${midCol.LatestResult?.CompleteMessage ?? ''}`);

        leafCol = await ctx.Provider.GetEntityObject<MJCollectionEntity>('MJ: Collections', ctx.User);
        leafCol.NewRecord();
        leafCol.Name = `__IT170_LeafCol_${suffix}`;
        leafCol.ParentID = midCol.ID;
        leafCol.OwnerID = ctx.User.ID;
        leafCol.EnvironmentID = envId;
        Assert(await leafCol.Save(), `Failed saving leafCol: ${leafCol.LatestResult?.CompleteMessage ?? ''}`);

        sharedArt = await ctx.Provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        sharedArt.NewRecord();
        sharedArt.Name = `__IT170_ColShared_${suffix}`;
        sharedArt.TypeID = docTypeId;
        sharedArt.UserID = ctx.User.ID;
        sharedArt.EnvironmentID = envId;
        sharedArt.Visibility = 'Always';
        Assert(await sharedArt.Save(), `Failed saving sharedArt: ${sharedArt.LatestResult?.CompleteMessage ?? ''}`);

        sharedVer = await ctx.Provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
        sharedVer.NewRecord();
        sharedVer.ArtifactID = sharedArt.ID;
        sharedVer.VersionNumber = 1;
        sharedVer.Name = sharedArt.Name;
        sharedVer.UserID = ctx.User.ID;
        sharedVer.ContentMode = 'Text';
        sharedVer.Content = '# Collection Shared Document';
        Assert(await sharedVer.Save(), `Failed saving sharedVer: ${sharedVer.LatestResult?.CompleteMessage ?? ''}`);

        privateArt = await ctx.Provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        privateArt.NewRecord();
        privateArt.Name = `__IT170_ColPrivate_${suffix}`;
        privateArt.TypeID = docTypeId;
        privateArt.UserID = ctx.User.ID;
        privateArt.EnvironmentID = envId;
        privateArt.Visibility = 'Always';
        Assert(await privateArt.Save(), `Failed saving privateArt: ${privateArt.LatestResult?.CompleteMessage ?? ''}`);

        privateVer = await ctx.Provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
        privateVer.NewRecord();
        privateVer.ArtifactID = privateArt.ID;
        privateVer.VersionNumber = 1;
        privateVer.Name = privateArt.Name;
        privateVer.UserID = ctx.User.ID;
        privateVer.ContentMode = 'Text';
        privateVer.Content = '# Secret Unshared Document';
        Assert(await privateVer.Save(), `Failed saving privateVer: ${privateVer.LatestResult?.CompleteMessage ?? ''}`);

        colArt = await ctx.Provider.GetEntityObject<MJCollectionArtifactEntity>('MJ: Collection Artifacts', ctx.User);
        colArt.NewRecord();
        colArt.CollectionID = leafCol.ID;
        colArt.ArtifactVersionID = sharedVer.ID;
        Assert(await colArt.Save(), `Failed saving colArt: ${colArt.LatestResult?.CompleteMessage ?? ''}`);

        // Before share: outsider has no collection ancestry permission on leafCol
        const beforePerms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            ctx.Provider,
            leafCol.ID,
            peerUser,
        );
        AssertEqual(beforePerms.CanRead, false, 'Unshared peer must not read descendant collection before share');

        // Share rootCol (Read-only, no CanShare) -> must cascade 2 hops down to leafCol & sharedArt
        rootSharePerm = await ctx.Provider.GetEntityObject<MJCollectionPermissionEntity>('MJ: Collection Permissions', ctx.User);
        rootSharePerm.NewRecord();
        rootSharePerm.CollectionID = rootCol.ID;
        rootSharePerm.UserID = peerUser.ID;
        rootSharePerm.CanRead = true;
        rootSharePerm.CanEdit = false;
        rootSharePerm.CanShare = false;
        Assert(await rootSharePerm.Save(), `Failed saving rootSharePerm: ${rootSharePerm.LatestResult?.CompleteMessage ?? ''}`);

        const cascadedPerms = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
            ctx.Provider,
            leafCol.ID,
            peerUser,
        );
        AssertEqual(cascadedPerms.CanRead, true, '3-hop ancestor share must cascade CanRead=true to leaf collection');
        AssertEqual(cascadedPerms.CanEdit, false, 'Read-only ancestor share must preserve CanEdit=false on leaf collection');
        AssertEqual(cascadedPerms.CanShare, false, 'Read-only ancestor share must preserve CanShare=false on leaf collection');

        const readableSet = await ArtifactPermissionEngine.Instance.BuildReadableArtifactIdSet(ctx.Provider, peerUser);
        const normSharedId = NormalizeUUID(sharedArt.ID);
        const normPrivateId = NormalizeUUID(privateArt.ID);
        let foundShared = false;
        let foundPrivate = false;
        for (const id of readableSet) {
            if (NormalizeUUID(id) === normSharedId) foundShared = true;
            if (NormalizeUUID(id) === normPrivateId) foundPrivate = true;
        }
        Assert(foundShared, 'BuildReadableArtifactIdSet must include artifact inside descendant of shared collection');
        Assert(!foundPrivate, 'BuildReadableArtifactIdSet must exclude unshared private artifact');

        // P0-2: peerUser (CanShare=false) must be refused escalating or granting permissions on artifact/collection
        const escArtifactPerm = await ctx.Provider.GetEntityObject<MJArtifactPermissionEntity>('MJ: Artifact Permissions', peerUser);
        escArtifactPerm.NewRecord();
        escArtifactPerm.ArtifactID = sharedArt.ID;
        escArtifactPerm.UserID = peerUser.ID;
        escArtifactPerm.CanRead = true;
        escArtifactPerm.CanEdit = true;
        escArtifactPerm.CanShare = false;
        Assert(!(await escArtifactPerm.Save()), 'CanShare=false peer must be refused creating MJArtifactPermissionEntity');

        const escColPerm = await ctx.Provider.GetEntityObject<MJCollectionPermissionEntity>('MJ: Collection Permissions', peerUser);
        escColPerm.NewRecord();
        escColPerm.CollectionID = leafCol.ID;
        escColPerm.UserID = peerUser.ID;
        escColPerm.CanRead = true;
        escColPerm.CanEdit = true;
        escColPerm.CanShare = false;
        Assert(!(await escColPerm.Save()), 'CanShare=false peer must be refused creating MJCollectionPermissionEntity');

        const illegalColArt = await ctx.Provider.GetEntityObject<MJCollectionArtifactEntity>('MJ: Collection Artifacts', peerUser);
        illegalColArt.NewRecord();
        illegalColArt.CollectionID = leafCol.ID;
        illegalColArt.ArtifactVersionID = privateVer.ID;
        Assert(!(await illegalColArt.Save()), 'Read-only collection peer must be refused adding unowned artifact to collection');

        // P0-3: count_only RunView on MJ: Artifact Versions for unshared privateArt must return 0 (no count oracle)
        const countRes = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID = '${privateArt.ID}'`,
                ResultType: 'count_only',
            },
            peerUser,
        );
        AssertEqual(countRes.TotalRowCount, 0, 'count_only RunView as outsider on unshared Artifact Versions must return 0');
    } finally {
        const targets: Array<{ label: string; entity: { IsSaved: boolean; Delete(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null } | null }> = [
            { label: 'rootSharePerm', entity: rootSharePerm },
            { label: 'colArt', entity: colArt },
            { label: 'privateVer', entity: privateVer },
            { label: 'sharedVer', entity: sharedVer },
            { label: 'privateArt', entity: privateArt },
            { label: 'sharedArt', entity: sharedArt },
            { label: 'leafCol', entity: leafCol },
            { label: 'midCol', entity: midCol },
            { label: 'rootCol', entity: rootCol },
        ];
        for (const { label, entity } of targets) {
            if (entity?.IsSaved) {
                const ok = await entity.Delete();
                if (!ok) {
                    console.warn(`[IT170 DSL8 teardown] Delete() failed for ${label}: ${entity.LatestResult?.CompleteMessage ?? 'save failed'}`);
                }
            }
        }
    }
}

// ─── DSL9: HMAC snapshots, >256 range watcher, Freeze->Unfreeze purge, __proto__ & AST cap ──

async function checkDsl9SecurityHardeningAndEngineGuards(ctx: IntegrationCheckContext): Promise<void> {
    // 1. P0-6: HMAC FrozenBlockSnapshot signing + tamper / unsigned rejection
    const testSecret = 'it170-hmac-test-signing-secret-32bytes!';
    const baseSnapshot: Omit<FrozenBlockSnapshot, 'SnapshotContentHash'> = {
        FrozenAt: new Date().toISOString(),
        FrozenByUserID: ctx.User.ID,
        FrozenByUserName: ctx.User.Name || 'IT170',
        Columns: [{ Name: 'Name', DisplayName: 'Name' }],
        Rows: [{ Name: 'Alpha' }],
        TotalRowCount: 1,
        SecurityWarningAcknowledged: true,
    };
    const hmacHash = ComputeFrozenSnapshotHash(baseSnapshot, testSecret);
    Assert(hmacHash.startsWith('hmac-sha256:'), `ComputeFrozenSnapshotHash with secret must emit hmac-sha256 prefix (got: ${hmacHash})`);
    const validCheck = ValidateFrozenBlockSnapshot({ ...baseSnapshot, SnapshotContentHash: hmacHash }, testSecret);
    Assert(validCheck.Valid && validCheck.SnapshotVerified, 'Valid HMAC-signed frozen snapshot must pass ValidateFrozenBlockSnapshot');

    const tamperedCheck = ValidateFrozenBlockSnapshot(
        { ...baseSnapshot, Rows: [{ Name: 'Tampered' }], SnapshotContentHash: hmacHash },
        testSecret,
    );
    Assert(!tamperedCheck.Valid && !tamperedCheck.SnapshotVerified, 'Tampered frozen snapshot must fail ValidateFrozenBlockSnapshot');

    const legacyHash = ComputeFrozenSnapshotHash(baseSnapshot);
    const unsignedCheck = ValidateFrozenBlockSnapshot({ ...baseSnapshot, SnapshotContentHash: legacyHash }, testSecret);
    Assert(!unsignedCheck.Valid && !unsignedCheck.SnapshotVerified, 'Unsigned legacy hash must fail ValidateFrozenBlockSnapshot when HMAC secret is active');

    // 2. P0-7: >256-cell rangeWatchersBySheet invalidation & FreezeLiveTable -> UnfreezeLiveTable purge
    const sheetEngine = SpreadsheetEngine.Instance;
    const wb = sheetEngine.CreateEmptyWorkbook('IT170 Guard Workbook');
    const sheet = wb.Worksheets[0];
    sheetEngine.SetCell(wb, sheet.SheetID, 'A1', { Value: 10 }, false);
    sheetEngine.SetCell(wb, sheet.SheetID, 'Z20', { Value: 32 }, false);
    sheetEngine.SetCell(wb, sheet.SheetID, 'AA1', { Formula: '=SUM(A1:Z20)' }, false);
    await sheetEngine.EvaluateWorkbookIsolated(wb);
    AssertEqual(sheet.Cells['AA1']?.ComputedValue, 42, 'Initial =SUM(A1:Z20) over 520 cells must evaluate to 42');

    sheetEngine.SetCell(wb, sheet.SheetID, 'Z20', { Value: 108 }, false);
    await sheetEngine.EvaluateWorkbookIsolated(wb);
    AssertEqual(sheet.Cells['AA1']?.ComputedValue, 118, '>256-cell rangeWatchersBySheet must recalculate =SUM(A1:Z20) to 118 when Z20 changes');

    // Attach LiveTable, freeze, verify FrozenSnapshot present, then unfreeze and confirm purge
    sheet.LiveTables.push({
        TableID: 'lt-it170-purge',
        Title: 'IT170 Live Table',
        SourceType: 'EntityView',
        Mode: 'Live',
        AnchorCell: 'C1',
        EntityName: 'MJ: Artifact Types',
        Fields: ['Name'],
        MaxRows: 5,
    });
    const fakeExecResult: DocumentBlockExecutionResult = {
        BlockID: 'lt-it170-purge',
        Kind: 'EntityView',
        Mode: 'Live',
        Success: true,
        Columns: [{ Name: 'Name', DisplayName: 'Name' }],
        Rows: [{ Name: 'Markdown Document' }],
        TotalRowCount: 1,
    };
    const frozenTable = sheetEngine.FreezeLiveTable(wb, sheet.SheetID, 'lt-it170-purge', fakeExecResult, ctx.User, true, undefined, undefined, false);
    AssertEqual(frozenTable.Mode, 'Frozen', 'FreezeLiveTable must set Mode=Frozen');
    Assert(Boolean(frozenTable.FrozenSnapshot), 'FreezeLiveTable must populate FrozenSnapshot');
    const unfrozenTable = sheetEngine.UnfreezeLiveTable(wb, sheet.SheetID, 'lt-it170-purge', false);
    await sheetEngine.EvaluateWorkbookIsolated(wb);
    AssertEqual(unfrozenTable.Mode, 'Live', 'UnfreezeLiveTable must revert Mode=Live');
    AssertEqual(unfrozenTable.FrozenSnapshot, undefined, 'UnfreezeLiveTable must purge FrozenSnapshot');

    // 3. __proto__ prototype-pollution guard on workbook JSON parsing
    const pollutedJson = '{"Worksheets":[{"SheetID":"s1","Name":"Sheet1","Cells":{"__proto__":{"Value":"pwned"},"A1":{"Value":7}}}]}';
    const parsedWb = await sheetEngine.ParseWorkbookIsolated(pollutedJson);
    AssertEqual((Object.prototype as { Value?: string }).Value, undefined, '__proto__ cell payload must never pollute Object.prototype');
    AssertEqual(Object.prototype.hasOwnProperty.call(parsedWb.Worksheets[0].Cells, '__proto__'), false, '__proto__ key must be stripped from worksheet Cells');

    // 4. AST recursion depth guard (> MAX_AST_DEPTH = 128)
    const deepFormula = `=${'('.repeat(145)}42${')'.repeat(145)}`;
    let depthOutcome: string | number | boolean | null = null;
    try {
        sheetEngine.SetCell(wb, sheet.SheetID, 'AB1', { Formula: deepFormula }, false);
        await sheetEngine.EvaluateWorkbookIsolated(wb);
        depthOutcome = sheet.Cells['AB1']?.ComputedValue ?? null;
    } catch (err) {
        depthOutcome = err instanceof Error ? err.message : String(err);
    }
    Assert(depthOutcome !== 42, 'Deeply nested formula exceeding MAX_AST_DEPTH must not evaluate unchecked');

    // 5. SQL injection filter guard in ValidateExtraFilter
    const badFilter = sheetEngine.ValidateExtraFilter('1=1; DROP TABLE [__mj].[User]');
    AssertEqual(badFilter.Valid, false, 'ValidateExtraFilter must reject SQL injection statement');
}

// ─── DSL10: NW-5 ArtifactSynthesisEngine sanitization & deterministic fallback ─

async function checkDsl10SynthesisSanitizationAndFallback(): Promise<void> {
    const synth = ArtifactSynthesisEngine.Instance;
    const allowedSourceId = '11111111-1111-1111-1111-111111111111';
    const forbiddenExternalId = '99999999-9999-9999-9999-999999999999';

    const hostileMarkdown = [
        '# Executive Briefing',
        '',
        ':::mj-block',
        JSON.stringify({ BlockID: 'bad-query', Kind: 'SavedQuery', Mode: 'Live', QueryID: 'leak-query' }),
        ':::',
        '',
        ':::mj-block',
        JSON.stringify({ BlockID: 'bad-view', Kind: 'EntityView', Mode: 'Frozen', EntityName: 'MJ: Users' }),
        ':::',
        '',
        ':::mj-block',
        JSON.stringify({ BlockID: 'bad-foreign', Kind: 'Artifact', Mode: 'Live', ArtifactID: forbiddenExternalId }),
        ':::',
        '',
        '```mj-block',
        JSON.stringify({ BlockID: 'good-chart', Kind: 'Artifact', Mode: 'Live', ArtifactID: allowedSourceId, ChartID: 'chart-1' }),
        '```',
    ].join('\n');

    const normalized = await synth.NormalizeSynthesizedOutputIsolated({
        TargetKind: 'document',
        RawOutput: hostileMarkdown,
        FallbackTitle: 'Clean Synthesis Doc',
        AllowedSourceArtifactIds: [allowedSourceId],
        AvailableChartRefs: [
            {
                ArtifactID: allowedSourceId,
                ArtifactName: 'Allowed Workbook',
                WorksheetName: 'Sheet1',
                ChartID: 'chart-1',
                ChartTitle: 'Revenue',
                RangeAddress: 'A1:B5',
            },
        ],
    });
    Assert(!normalized.Content.includes('SavedQuery'), 'NormalizeSynthesizedOutput must strip SavedQuery injection');
    Assert(!normalized.Content.includes('EntityView'), 'NormalizeSynthesizedOutput must strip EntityView injection');
    Assert(!normalized.Content.includes(forbiddenExternalId), 'NormalizeSynthesizedOutput must strip unpermitted ArtifactID embeds');
    Assert(!normalized.Content.includes('```mj-block'), 'NormalizeSynthesizedOutput must normalize triple-backtick mj-block fences');
    Assert(normalized.Content.includes(':::mj-block') && normalized.Content.includes(allowedSourceId), 'Allowed source chart link must survive as :::mj-block');
    Assert(normalized.Warnings.length > 0, 'NormalizeSynthesizedOutput must emit warnings when stripping hostile blocks');

    const digests = [
        await synth.ExtractSourceDigestIsolated({
            ArtifactID: allowedSourceId,
            Name: 'Q1 Revenue',
            ArtifactType: 'Markdown Document',
            Content: '# Q1 Summary\n\nRevenue grew 18% YoY.',
        }),
    ];
    const docFallback = synth.BuildDeterministicFallbackSynthesis(digests, 'document', 'Board Memo', 'Summarize Q1', false);
    Assert(docFallback.Content.includes('Board Memo'), 'Fallback document synthesis must include requested title');

    const slideFallback = synth.BuildDeterministicFallbackSynthesis(digests, 'presentation', 'Board Deck', 'Summarize Q1', false);
    const parsedDeck = SlideDeckEngine.Instance.ParseDeckSpec(slideFallback.Content);
    Assert(parsedDeck.Slides.length >= 1, 'Fallback presentation synthesis must parse into a valid SlideDeckSpec');

    const sheetFallback = synth.BuildDeterministicFallbackSynthesis(digests, 'spreadsheet', 'Board Model', 'Summarize Q1', false);
    const parsedWb = await SpreadsheetEngine.Instance.ParseWorkbookIsolated(sheetFallback.Content);
    Assert(parsedWb.Worksheets.length >= 1, 'Fallback spreadsheet synthesis must parse into a valid WorkbookSpec');
}

export const DocsSlidesSheetsLibraryChecks: NamedCheck[] = [
    {
        Id: 'docs-slides-sheets-library.DSL1',
        Name: 'DSL1: metadata coherence across MJ: Artifact Working States, polymorphic DelegateRecordID, Artifact Types, Remote Ops, API Scopes, and Library/Chat app wiring',
        Fn: checkDsl1MetadataAndAppWiring,
    },
    {
        Id: 'docs-slides-sheets-library.DSL2',
        Name: 'DSL2: physical catalog PK, UQ, FK, and CHECK constraints on ArtifactWorkingState and Artifact plus base view RunViews',
        Fn: checkDsl2PhysicalConstraintsAndViews,
    },
    {
        Id: 'docs-slides-sheets-library.DSL3',
        Name: 'DSL3: live DB CRUD for MJArtifactWorkingStateEntity, 1:1 UQ & DelegateBinding CHECK enforcement, and O4 ParentArtifactPermissionDelegate cascade',
        Fn: checkDsl3LiveWorkingStateAndDelegatedPerms,
        RequiresMutation: true,
    },
    {
        Id: 'docs-slides-sheets-library.DSL4',
        Name: 'DSL4: DocumentLiveBlockEngine live DB EntityView execution, O5 freeze security gate, tamper rejection, and :::mj-block round-trip',
        Fn: checkDsl4DocumentLiveBlocksAndFreeze,
    },
    {
        Id: 'docs-slides-sheets-library.DSL5',
        Name: 'DSL5: SlideDeckEngine Markdown conversion, single-slide isolation, brand theme contrast derivation, and O6 presenter freeze',
        Fn: checkDsl5SlideDeckEngine,
    },
    {
        Id: 'docs-slides-sheets-library.DSL6',
        Name: 'DSL6: SpreadsheetEngine stable-ID formula coordinate shifting, cycle detection, live DB =MJ.VIEW + LiveTable, and .xlsx round-trip',
        Fn: checkDsl6SpreadsheetEngineAndLiveData,
    },
    {
        Id: 'docs-slides-sheets-library.DSL7',
        Name: 'DSL7: ClassFactory resolution and headless execution of DocumentToolLibrary, SlideDeckToolLibrary, SpreadsheetToolLibrary, and WhiteboardToolLibrary',
        Fn: checkDsl7ArtifactToolLibraries,
    },
    {
        Id: 'docs-slides-sheets-library.DSL8',
        Name: 'DSL8: NW-2 ancestor-cascading collection ACL, BuildReadableArtifactIdSet, CanShare escalation/collection guards, and count_only oracle prevention',
        Fn: checkDsl8CollectionAncestryAclAndGuards,
        RequiresMutation: true,
    },
    {
        Id: 'docs-slides-sheets-library.DSL9',
        Name: 'DSL9: HMAC frozen snapshot validation, >256-cell rangeWatchersBySheet & UnfreezeLiveTable purge, __proto__ guard, AST depth cap, and SQL filter gate',
        Fn: checkDsl9SecurityHardeningAndEngineGuards,
    },
    {
        Id: 'docs-slides-sheets-library.DSL10',
        Name: 'DSL10: NW-5 ArtifactSynthesisEngine prompt-injection block strip, backtick normalization, and deterministic fallback synthesis',
        Fn: checkDsl10SynthesisSanitizationAndFallback,
    },
];

for (const c of DocsSlidesSheetsLibraryChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}

// ─── IT171: Client-transport wire checks (DSLC1–DSLC4) ───────────────────────

const CLIENT_BUNDLE = 'docs-slides-sheets-library-client';
const GRANTEE_EMAIL = 'it-artifact-viewer@integration.test';

interface DslClientFixture extends MintedUserKeyIds {
    SkipReason?: string;
    ProvisionError?: string;
    OwnerProvider?: GraphQLDataProvider;
    GranteeProvider?: GraphQLDataProvider;
    GranteeUserID?: string;
    ParentDocID?: string;
    ParentVerID?: string;
    ParentVerContent?: string;
    PrivateDocID?: string;
    PrivateVerID?: string;
    SharedPermID?: string;
}

let dslClientFixture: DslClientFixture = { CreatedKeyIds: [], CreatedScopeRuleIds: [] };

function resolveDslWireProvider(ctx: IntegrationCheckContext): GraphQLDataProvider | null {
    if (ctx.Provider instanceof GraphQLDataProvider) {
        return ctx.Provider;
    }
    const globalProvider: IMetadataProvider = Metadata.Provider; // global-provider-ok: client bootstrap installs GraphQLDataProvider as process global
    return globalProvider instanceof GraphQLDataProvider ? globalProvider : null;
}

function requireDslClientFixture(): DslClientFixture {
    if (dslClientFixture.ProvisionError) {
        Assert(false, `${CLIENT_BUNDLE} fixture provisioning failed: ${dslClientFixture.ProvisionError}`);
    }
    if (dslClientFixture.SkipReason || !dslClientFixture.OwnerProvider || !dslClientFixture.GranteeProvider) {
        SkipCheck(
            dslClientFixture.SkipReason ??
                'client-transport fixture not provisioned (seed metadata-optional/integration-test and start MJAPI)',
        );
    }
    return dslClientFixture;
}

type GraphQLVariablePrimitive = string | number | boolean | null | undefined;
interface GraphQLVariableObject {
    [key: string]: GraphQLVariableValue;
}
type GraphQLVariableValue = GraphQLVariablePrimitive | GraphQLVariableObject | GraphQLVariableValue[];

async function executeGqlExpectingError(
    provider: GraphQLDataProvider,
    query: string,
    variables?: GraphQLVariableObject,
): Promise<string> {
    try {
        const res = (await provider.ExecuteGQL(query, variables ?? {})) as {
            errors?: Array<{ message?: string }>;
        } | null;
        if (res && Array.isArray(res.errors) && res.errors.length > 0) {
            return res.errors.map((e) => e.message ?? '').join('; ');
        }
        return '';
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(CLIENT_BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        dslClientFixture = { CreatedKeyIds: [], CreatedScopeRuleIds: [] };
        const ownerProvider = resolveDslWireProvider(ctx);
        if (!ownerProvider) {
            dslClientFixture.SkipReason = 'no GraphQL wire provider (runs on client transport against a live MJAPI)';
            return;
        }
        dslClientFixture.OwnerProvider = ownerProvider;

        const rv = RunView.FromMetadataProvider(ownerProvider);
        const granteeRes = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Users',
                ExtraFilter: `Email = '${GRANTEE_EMAIL}' AND IsActive = 1`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            ctx.User,
        );
        const granteeId = granteeRes.Success && granteeRes.Results.length === 1 ? granteeRes.Results[0].ID : undefined;
        if (!granteeId) {
            dslClientFixture.SkipReason = `seeded user '${GRANTEE_EMAIL}' not found (run: pnpm mj sync push --dir=metadata-optional/integration-test)`;
            return;
        }
        dslClientFixture.GranteeUserID = granteeId;

        try {
            const rawKey = await MintFullAccessUserKey(
                ctx,
                dslClientFixture,
                granteeId,
                'IT171 DSL client grantee (mj-integration-test)',
            );
            const builtProvider = await BuildUserKeyProviderWithRetry(rawKey);
            dslClientFixture.GranteeProvider = builtProvider as GraphQLDataProvider;

            const typesRes = await rv.RunView<{ ID: string; Name: string }>(
                {
                    EntityName: 'MJ: Artifact Types',
                    ExtraFilter: "Name = 'Markdown Document'",
                    Fields: ['ID', 'Name'],
                    ResultType: 'simple',
                },
                ctx.User,
            );
            if (!typesRes.Success || typesRes.Results.length === 0) {
                throw new Error("Markdown Document artifact type not found over GraphQL wire");
            }
            const docTypeId = typesRes.Results[0].ID;
            const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            // 1. Shared Read-Only artifact + version 1
            const parentDoc = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
            parentDoc.NewRecord();
            parentDoc.Name = `__IT171_SharedDoc_${suffix} (mj-integration-test — safe to delete)`;
            parentDoc.TypeID = docTypeId;
            parentDoc.UserID = ctx.User.ID;
            parentDoc.Visibility = 'Always';
            if (!(await parentDoc.Save())) {
                throw new Error(`Failed to create shared parentDoc: ${parentDoc.LatestResult?.CompleteMessage ?? ''}`);
            }
            dslClientFixture.ParentDocID = parentDoc.ID;

            const initialContent = `# IT171 Shared Strategy Document ${suffix}\n\nOwner baseline content.`;
            const parentVer = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>(
                'MJ: Artifact Versions',
                ctx.User,
            );
            parentVer.NewRecord();
            parentVer.ArtifactID = parentDoc.ID;
            parentVer.VersionNumber = 1;
            parentVer.Name = parentDoc.Name;
            parentVer.UserID = ctx.User.ID;
            parentVer.ContentMode = 'Text';
            parentVer.Content = initialContent;
            if (!(await parentVer.Save())) {
                throw new Error(`Failed to create shared parentVer: ${parentVer.LatestResult?.CompleteMessage ?? ''}`);
            }
            dslClientFixture.ParentVerID = parentVer.ID;
            dslClientFixture.ParentVerContent = initialContent;

            // Grant Read-Only permission (CanRead=true, CanEdit=false) to grantee
            const sharedPerm = await ownerProvider.GetEntityObject<MJArtifactPermissionEntity>(
                'MJ: Artifact Permissions',
                ctx.User,
            );
            sharedPerm.NewRecord();
            sharedPerm.ArtifactID = parentDoc.ID;
            sharedPerm.UserID = granteeId;
            sharedPerm.CanRead = true;
            sharedPerm.CanEdit = false;
            sharedPerm.CanDelete = false;
            sharedPerm.CanShare = false;
            if (!(await sharedPerm.Save())) {
                throw new Error(`Failed to create read-only MJArtifactPermission: ${sharedPerm.LatestResult?.CompleteMessage ?? ''}`);
            }
            dslClientFixture.SharedPermID = sharedPerm.ID;

            // 2. Private unshared artifact + version 1
            const privateDoc = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
            privateDoc.NewRecord();
            privateDoc.Name = `__IT171_PrivateDoc_${suffix} (mj-integration-test — safe to delete)`;
            privateDoc.TypeID = docTypeId;
            privateDoc.UserID = ctx.User.ID;
            privateDoc.Visibility = 'Always';
            if (!(await privateDoc.Save())) {
                throw new Error(`Failed to create privateDoc: ${privateDoc.LatestResult?.CompleteMessage ?? ''}`);
            }
            dslClientFixture.PrivateDocID = privateDoc.ID;

            const privateVer = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>(
                'MJ: Artifact Versions',
                ctx.User,
            );
            privateVer.NewRecord();
            privateVer.ArtifactID = privateDoc.ID;
            privateVer.VersionNumber = 1;
            privateVer.Name = privateDoc.Name;
            privateVer.UserID = ctx.User.ID;
            privateVer.ContentMode = 'Text';
            privateVer.Content = `# IT171 Private Document ${suffix}\n\nConfidential owner content.`;
            if (!(await privateVer.Save())) {
                throw new Error(`Failed to create privateVer: ${privateVer.LatestResult?.CompleteMessage ?? ''}`);
            }
            dslClientFixture.PrivateVerID = privateVer.ID;
        } catch (err) {
            dslClientFixture.ProvisionError = err instanceof Error ? err.message : String(err);
        }
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const fx = dslClientFixture;
        dslClientFixture = { CreatedKeyIds: [], CreatedScopeRuleIds: [] };
        const ownerProvider = fx.OwnerProvider ?? resolveDslWireProvider(ctx);
        if (fx.GranteeProvider) {
            CloseWireSession(fx.GranteeProvider);
        }
        if (ownerProvider) {
            const deleteById = async (
                entityName: 'MJ: Artifact Permissions' | 'MJ: Artifact Versions' | 'MJ: Artifacts',
                id: string | undefined,
            ): Promise<void> => {
                if (!id) {
                    return;
                }
                try {
                    const ent = await ownerProvider.GetEntityObject<
                        MJArtifactPermissionEntity | MJArtifactVersionEntity | MJArtifactEntity
                    >(entityName, ctx.User);
                    if (await ent.Load(id)) {
                        const deleted = await ent.Delete();
                        if (!deleted) {
                            console.warn(
                                `[${CLIENT_BUNDLE}] teardown Delete() returned false for ${entityName}(${id}): ${ent.LatestResult?.CompleteMessage ?? ''}`,
                            );
                        }
                    }
                } catch (err) {
                    console.warn(`[${CLIENT_BUNDLE}] teardown failed for ${entityName}(${id}):`, err);
                }
            };
            await deleteById('MJ: Artifact Permissions', fx.SharedPermID);
            await deleteById('MJ: Artifact Versions', fx.ParentVerID);
            await deleteById('MJ: Artifacts', fx.ParentDocID);
            await deleteById('MJ: Artifact Versions', fx.PrivateVerID);
            await deleteById('MJ: Artifacts', fx.PrivateDocID);
        }
        await DeleteMintedUserKeys(ctx, fx);
    },
});

async function checkDslc1WorkingStateUnreachableOverGraphQL(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const wsEnt = ctx.Provider.EntityByName('MJ: Artifact Working States');
    Assert(wsEnt !== undefined, 'MJ: Artifact Working States metadata must exist');
    AssertEqual(wsEnt!.IncludeInAPI, true, 'MJ: Artifact Working States IncludeInAPI must be true for CodeGen entity support');
    AssertEqual(wsEnt!.AllowCreateAPI, false, 'MJ: Artifact Working States AllowCreateAPI must be false');
    AssertEqual(wsEnt!.AllowUpdateAPI, false, 'MJ: Artifact Working States AllowUpdateAPI must be false');
    AssertEqual(wsEnt!.AllowDeleteAPI, false, 'MJ: Artifact Working States AllowDeleteAPI must be false');
    const clientRoleNameByNormId = new Map<string, string>(
        ctx.Provider.Roles.map((r) => [NormalizeUUID(r.ID), r.Name]),
    );
    const resolveClientPermRoleName = (perm: { Role: string | null; RoleID: string | null }): string | null =>
        perm.Role ?? (perm.RoleID ? (clientRoleNameByNormId.get(NormalizeUUID(perm.RoleID)) ?? null) : null);

    const wsClientUiPerm = wsEnt!.Permissions.find((p) => resolveClientPermRoleName(p) === 'UI' && !p.IsDeny);
    AssertEqual(wsClientUiPerm?.CanRead ?? false, false, 'MJ: Artifact Working States must deny UI role CanRead');
    for (const perm of wsEnt!.Permissions) {
        const hasAnyPermission = Boolean(perm.CanRead || perm.CanCreate || perm.CanUpdate || perm.CanDelete);
        if (!hasAnyPermission || perm.IsDeny) {
            continue;
        }
        const roleName = resolveClientPermRoleName(perm);
        Assert(
            roleName === 'Developer' || roleName === 'Integration',
            `Only Developer/Integration roles may hold server-internal permission on MJ: Artifact Working States (found '${roleName}')`,
        );
    }

    // 1. Create / Update / Delete mutations are omitted from the GraphQL schema entirely (AllowCreate/Update/DeleteAPI=false)
    const createMutationErr = await executeGqlExpectingError(
        fx.OwnerProvider!,
        `mutation ProbeCreateWorkingState($input: CreateMJArtifactWorkingStateInput!) {
            CreateMJArtifactWorkingState(input: $input) { ID }
        }`,
        {
            input: {
                ArtifactID: fx.ParentDocID!,
                YjsState: 'AQID',
            },
        },
    );
    Assert(
        createMutationErr.includes('CreateMJArtifactWorkingState') ||
            createMutationErr.includes('CreateMJArtifactWorkingStateInput'),
        `CreateMJArtifactWorkingState mutation over GraphQL must be rejected by the schema (got: ${createMutationErr || 'no error'})`,
    );

    const updateMutationErr = await executeGqlExpectingError(
        fx.OwnerProvider!,
        `mutation ProbeUpdateWorkingState($input: UpdateMJArtifactWorkingStateInput!) {
            UpdateMJArtifactWorkingState(input: $input) { ID }
        }`,
        {
            input: {
                ID: '00000000-0000-0000-0000-000000000000',
                ArtifactID: fx.ParentDocID!,
                YjsState: 'AQID',
            },
        },
    );
    Assert(
        updateMutationErr.includes('UpdateMJArtifactWorkingState') ||
            updateMutationErr.includes('UpdateMJArtifactWorkingStateInput'),
        `UpdateMJArtifactWorkingState mutation over GraphQL must be rejected by the schema (got: ${updateMutationErr || 'no error'})`,
    );

    // 2. Restricted non-system user querying MJArtifactWorkingState(ID) or RunView over GraphQL is denied
    const singleQueryErr = await executeGqlExpectingError(
        fx.GranteeProvider!,
        `query ProbeWorkingState($id: String!) {
            MJArtifactWorkingState(ID: $id) { ID }
        }`,
        { id: '00000000-0000-0000-0000-000000000000' },
    );
    Assert(
        singleQueryErr.toLowerCase().includes('permission') || singleQueryErr.includes('MJArtifactWorkingState'),
        `Non-system user querying MJArtifactWorkingState(ID) must be denied (got: ${singleQueryErr || 'no error'})`,
    );

    const granteeRv = RunView.FromMetadataProvider(fx.GranteeProvider!);
    const granteeWsView = await granteeRv.RunView<{ ID: string }>({
        EntityName: 'MJ: Artifact Working States',
        ResultType: 'simple',
    });
    Assert(
        !granteeWsView.Success || granteeWsView.Results.length === 0,
        'Non-system user RunView on MJ: Artifact Working States must return zero rows or fail closed',
    );
}

async function checkDslc2RestrictedUserVersionSaveRefusedOverApi(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const granteeProvider = fx.GranteeProvider!;

    // 1. Raw GraphQL CreateMJArtifactVersion mutation as Read-Only grantee (who holds entity-level CanCreate on MJ: Artifact Versions via 'Integration Test: Collaborative Artifacts') must be refused specifically by MJArtifactVersionEntityServer's artifact-level CanEdit check
    const createErr = await executeGqlExpectingError(
        granteeProvider,
        `mutation UnauthorizedCreateVersion($input: CreateMJArtifactVersionInput!) {
            CreateMJArtifactVersion(input: $input) { ID VersionNumber }
        }`,
        {
            input: {
                ArtifactID: fx.ParentDocID!,
                VersionNumber: 2,
                Name: 'Unauthorized Grantee Version 2',
                UserID: fx.GranteeUserID!,
                ContentMode: 'Text',
                Content: '# Injected by Read-Only Grantee',
            },
        },
    );
    Assert(
        createErr.includes('does not hold Edit permission on artifact'),
        `Read-only grantee CreateMJArtifactVersion over GraphQL must be refused by MJArtifactVersionEntityServer artifact ACL check (got: ${createErr || 'no error'})`,
    );

    // 2. Raw GraphQL UpdateMJArtifactVersion mutation on version 1 as Read-Only grantee must be refused specifically by MJArtifactVersionEntityServer's artifact-level CanEdit check
    const updateErr = await executeGqlExpectingError(
        granteeProvider,
        `mutation UnauthorizedUpdateVersion($input: UpdateMJArtifactVersionInput!) {
            UpdateMJArtifactVersion(input: $input) { ID Content }
        }`,
        {
            input: {
                ID: fx.ParentVerID!,
                ArtifactID: fx.ParentDocID!,
                VersionNumber: 1,
                UserID: ctx.User.ID,
                ContentMode: 'Text',
                Content: '# Overwritten by Read-Only Grantee',
                OldValues___: [{ Key: 'Content', Value: fx.ParentVerContent! }],
            },
        },
    );
    Assert(
        updateErr.includes('does not hold Edit permission on artifact'),
        `Read-only grantee UpdateMJArtifactVersion over GraphQL must be refused by MJArtifactVersionEntityServer artifact ACL check (got: ${updateErr || 'no error'})`,
    );

    // 3. Verify PostRunView read enforcement on MJ: Artifact Versions: grantee cannot read unshared PrivateDocID versions via RunView, while readable ParentDocID version is returned
    const granteeRv = RunView.FromMetadataProvider(granteeProvider);
    const privateVers = await granteeRv.RunView<{ ID: string; Content: string | null }>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID = '${fx.PrivateDocID!}'`,
        Fields: ['ID', 'Content'],
        ResultType: 'simple',
        BypassCache: true,
    });
    Assert(
        !privateVers.Success || privateVers.Results.length === 0,
        'PostRunView on MJArtifactVersionEntityServer must strip unshared artifact versions from RunView results',
    );

    const readableVers = await granteeRv.RunView<{ ID: string }>({
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID = '${fx.ParentDocID!}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    });
    Assert(
        readableVers.Success && readableVers.Results.length === 1,
        'Shared Read-Only grantee must still receive versions for readable ParentDocID',
    );

    // 4. Verify database still holds only version 1 with its original content untouched
    const rv = RunView.FromMetadataProvider(fx.OwnerProvider!);
    const verRows = await rv.RunView<{ ID: string; VersionNumber: number; Content: string | null }>(
        {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID = '${fx.ParentDocID!}'`,
            Fields: ['ID', 'VersionNumber', 'Content'],
            ResultType: 'simple',
            BypassCache: true,
        },
        ctx.User,
    );
    Assert(verRows.Success && verRows.Results.length === 1, 'Parent artifact must still have exactly 1 version after refused writes');
    AssertEqual(verRows.Results[0].Content, fx.ParentVerContent!, 'Parent artifact version 1 Content must remain untouched');
}

async function checkDslc3TicketMintSocketUpgradeAndReadOnlyRejection(): Promise<void> {
    const fx = requireDslClientFixture();
    const granteeProvider = fx.GranteeProvider!;

    const MINT_TICKET_MUTATION = `
        mutation MintArtifactCollaborationTicket($artifactId: String!) {
            MintArtifactCollaborationTicket(artifactId: $artifactId) {
                Success
                ErrorMessage
                Ticket
                WsPath
                WsUrl
                CanRead
                CanEdit
            }
        }
    `;

    // 1. Unshared private artifact must refuse ticket minting
    const privateTicketRes = (await granteeProvider.ExecuteGQL(MINT_TICKET_MUTATION, {
        artifactId: fx.PrivateDocID!,
    })) as {
        MintArtifactCollaborationTicket?: {
            Success: boolean;
            ErrorMessage?: string | null;
        };
    } | null;
    Assert(
        privateTicketRes?.MintArtifactCollaborationTicket?.Success === false,
        'MintArtifactCollaborationTicket must refuse unshared private artifact',
    );

    // 2. Shared Read-Only artifact mints a read-only ticket (CanRead=true, CanEdit=false)
    const ticketRes = (await granteeProvider.ExecuteGQL(MINT_TICKET_MUTATION, {
        artifactId: fx.ParentDocID!,
    })) as {
        MintArtifactCollaborationTicket?: {
            Success: boolean;
            ErrorMessage?: string | null;
            Ticket?: string | null;
            WsPath?: string | null;
            WsUrl?: string | null;
            CanRead: boolean;
            CanEdit: boolean;
        };
    } | null;
    const minted = ticketRes?.MintArtifactCollaborationTicket;
    Assert(minted?.Success === true && Boolean(minted.Ticket), `MintArtifactCollaborationTicket failed: ${minted?.ErrorMessage ?? ''}`);
    AssertEqual(minted!.CanRead, true, 'Read-only grantee ticket CanRead');
    AssertEqual(minted!.CanEdit, false, 'Read-only grantee ticket CanEdit');

    const clientCfg = LoadClientConfig();
    const httpUrl = new URL(clientCfg.Url);
    const wsScheme = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const rawPath = minted!.WsPath && minted!.WsPath.startsWith('/') ? minted!.WsPath : '/collaboration/yjs';
    const wsUrl = `${wsScheme}//${httpUrl.host}${rawPath}?ticket=${encodeURIComponent(minted!.Ticket!)}&artifactId=${encodeURIComponent(fx.ParentDocID!)}`;

    // 3. Upgrade WebSocket to /collaboration/yjs with the minted ticket, send a Yjs sync update frame, and verify readonly-rejected
    const wsOutcome = await new Promise<{
        upgraded: boolean;
        readonlyRejected: boolean;
        rejectedMessage: string;
    }>((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        socket.binaryType = 'arraybuffer';
        let upgraded = false;
        let writeSent = false;

        const timer = setTimeout(() => {
            try {
                socket.close();
            } catch {
                // ignore
            }
            reject(new Error(`Timed out waiting for WebSocket upgrade / readonly-rejected from ${wsUrl}`));
        }, 10_000);

        socket.addEventListener('open', () => {
            upgraded = true;
            if (!writeSent) {
                writeSent = true;
                // Send Yjs sync update frame (MESSAGE_SYNC=0x00, SYNC_STEP_UPDATE=0x02, payload=[0x00])
                socket.send(new Uint8Array([0x00, 0x02, 0x00]));
            }
        });

        socket.addEventListener('message', (event: MessageEvent) => {
            const textPayload =
                typeof event.data === 'string'
                    ? event.data
                    : event.data instanceof ArrayBuffer
                      ? new TextDecoder().decode(new Uint8Array(event.data))
                      : '';
            if (textPayload.includes('readonly-rejected')) {
                clearTimeout(timer);
                socket.close();
                resolve({
                    upgraded,
                    readonlyRejected: true,
                    rejectedMessage: textPayload,
                });
            }
        });

        socket.addEventListener('error', () => {
            clearTimeout(timer);
            reject(new Error(`WebSocket error connecting to ${wsUrl}`));
        });
    });

    Assert(wsOutcome.upgraded, 'WebSocket upgrade to /collaboration/yjs with valid ticket must succeed');
    Assert(wsOutcome.readonlyRejected, 'Read-only peer Yjs update frame must be rejected with readonly-rejected');

    // 4. Replaying a consumed single-use ticket (or presenting a forged invalid ticket) MUST be rejected specifically with HTTP 401/403 pre-handshake or WebSocket close code 4401/4403 — so 500/502 or TCP ECONNRESET fails DSLC3!
    const probeWebSocketRejection = (
        targetWsUrl: string,
    ): Promise<{
        opened: boolean;
        upgradeStatusCode: number | undefined;
        closeCode: number | undefined;
        errorMessage: string | undefined;
        timedOut: boolean;
    }> =>
        new Promise((resolve) => {
            const parsedTarget = new URL(targetWsUrl);
            const isSecure = parsedTarget.protocol === 'wss:' || parsedTarget.protocol === 'https:';
            const requestFn = isSecure ? https.request : http.request;
            let settled = false;
            const settle = (result: {
                opened: boolean;
                upgradeStatusCode: number | undefined;
                closeCode: number | undefined;
                errorMessage: string | undefined;
                timedOut: boolean;
            }): void => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                resolve(result);
            };

            const req = requestFn({
                protocol: isSecure ? 'https:' : 'http:',
                hostname: parsedTarget.hostname,
                port: parsedTarget.port || (isSecure ? 443 : 80),
                path: `${parsedTarget.pathname}${parsedTarget.search}`,
                method: 'GET',
                headers: {
                    Connection: 'Upgrade',
                    Upgrade: 'websocket',
                    'Sec-WebSocket-Version': '13',
                    'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
                },
            });

            const timer = setTimeout(() => {
                req.destroy();
                settle({
                    opened: false,
                    upgradeStatusCode: undefined,
                    closeCode: undefined,
                    errorMessage: undefined,
                    timedOut: true,
                });
            }, 5_000);

            // Equivalent to `ws.on('unexpected-response', (_req, res) => ...)` on raw RFC 6455 HTTP upgrade
            req.on('response', (res) => {
                const upgradeStatusCode = res.statusCode;
                res.resume();
                settle({
                    opened: false,
                    upgradeStatusCode,
                    closeCode: undefined,
                    errorMessage: undefined,
                    timedOut: false,
                });
            });

            req.on('upgrade', (_res, socket, head) => {
                const chunks: Buffer[] = head.length > 0 ? [Buffer.from(head)] : [];
                const tryExtractCloseCode = (): number | undefined => {
                    const combined = Buffer.concat(chunks);
                    if (combined.length < 2) {
                        return undefined;
                    }
                    const opcode = combined[0] & 0x0f;
                    if (opcode !== 0x08) {
                        return undefined;
                    }
                    const masked = (combined[1] & 0x80) !== 0;
                    let payloadLen = combined[1] & 0x7f;
                    let offset = 2;
                    if (payloadLen === 126) {
                        if (combined.length < 4) return undefined;
                        payloadLen = combined.readUInt16BE(2);
                        offset = 4;
                    } else if (payloadLen === 127) {
                        return undefined;
                    }
                    if (masked) {
                        offset += 4;
                    }
                    if (payloadLen < 2 || combined.length < offset + 2) {
                        return undefined;
                    }
                    return combined.readUInt16BE(offset);
                };

                const immediateClose = tryExtractCloseCode();
                if (immediateClose !== undefined) {
                    socket.destroy();
                    settle({
                        opened: false,
                        upgradeStatusCode: 101,
                        closeCode: immediateClose,
                        errorMessage: undefined,
                        timedOut: false,
                    });
                    return;
                }

                socket.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                    const parsedClose = tryExtractCloseCode();
                    if (parsedClose !== undefined) {
                        socket.destroy();
                        settle({
                            opened: false,
                            upgradeStatusCode: 101,
                            closeCode: parsedClose,
                            errorMessage: undefined,
                            timedOut: false,
                        });
                    }
                });
                socket.on('close', () => {
                    settle({
                        opened: true,
                        upgradeStatusCode: 101,
                        closeCode: tryExtractCloseCode(),
                        errorMessage: undefined,
                        timedOut: false,
                    });
                });
                socket.on('error', (err: Error) => {
                    settle({
                        opened: true,
                        upgradeStatusCode: 101,
                        closeCode: tryExtractCloseCode(),
                        errorMessage: err.message,
                        timedOut: false,
                    });
                });
            });

            req.on('error', (err: Error) => {
                settle({
                    opened: false,
                    upgradeStatusCode: undefined,
                    closeCode: undefined,
                    errorMessage: err.message,
                    timedOut: false,
                });
            });

            req.end();
        });

    const replayOutcome = await probeWebSocketRejection(wsUrl);
    Assert(
        !replayOutcome.timedOut &&
            !replayOutcome.opened &&
            (replayOutcome.upgradeStatusCode === 401 ||
                replayOutcome.upgradeStatusCode === 403 ||
                replayOutcome.closeCode === 4401 ||
                replayOutcome.closeCode === 4403),
        `Replaying a consumed single-use collaboration ticket must reject with HTTP 401/403 or close 4401/4403 (got upgradeStatusCode=${String(replayOutcome.upgradeStatusCode)}, closeCode=${String(replayOutcome.closeCode)}, opened=${replayOutcome.opened}, error=${String(replayOutcome.errorMessage)}, timedOut=${replayOutcome.timedOut})`,
    );

    const invalidTicketUrl = `${wsScheme}//${httpUrl.host}${rawPath}?ticket=invalid.forged.ticket&artifactId=${encodeURIComponent(fx.ParentDocID!)}`;
    const invalidOutcome = await probeWebSocketRejection(invalidTicketUrl);
    Assert(
        !invalidOutcome.timedOut &&
            !invalidOutcome.opened &&
            (invalidOutcome.upgradeStatusCode === 401 ||
                invalidOutcome.upgradeStatusCode === 403 ||
                invalidOutcome.closeCode === 4401 ||
                invalidOutcome.closeCode === 4403),
        `Invalid collaboration ticket must reject with HTTP 401/403 or close 4401/4403 (got upgradeStatusCode=${String(invalidOutcome.upgradeStatusCode)}, closeCode=${String(invalidOutcome.closeCode)}, opened=${invalidOutcome.opened}, error=${String(invalidOutcome.errorMessage)}, timedOut=${invalidOutcome.timedOut})`,
    );
}

async function checkDslc4LiveBlockDeniedWithoutReadAccess(): Promise<void> {
    const fx = requireDslClientFixture();
    const granteeProvider = fx.GranteeProvider!;

    const EXECUTE_LIVE_BLOCK_QUERY = `
        query ExecuteDocumentLiveBlock($specJson: String!, $hostArtifactId: String) {
            ExecuteDocumentLiveBlock(specJson: $specJson, hostArtifactId: $hostArtifactId) {
                Success
                AccessDenied
                ErrorMessage
                ResultJSON
            }
        }
    `;

    // 1. Live block hosted in an unshared artifact (PrivateDocID) must be denied
    const deniedHostBlock = (await granteeProvider.ExecuteGQL(EXECUTE_LIVE_BLOCK_QUERY, {
        specJson: JSON.stringify({
            BlockID: 'blk-it165-denied-host',
            Kind: 'EntityView',
            Mode: 'Live',
            EntityName: 'MJ: Artifact Types',
            Fields: ['ID', 'Name'],
            MaxRows: 5,
        }),
        hostArtifactId: fx.PrivateDocID!,
    })) as {
        ExecuteDocumentLiveBlock?: {
            Success: boolean;
            AccessDenied: boolean;
            ErrorMessage?: string | null;
        };
    } | null;
    Assert(
        deniedHostBlock?.ExecuteDocumentLiveBlock?.Success === false &&
            deniedHostBlock?.ExecuteDocumentLiveBlock?.AccessDenied === true,
        'ExecuteDocumentLiveBlock must fail closed with AccessDenied=true when the caller lacks CanRead on hostArtifactId',
    );

    // 2. EntityView block targeting 'MJ: AI Agent Runs' (which 'Integration Test: Conversation Authorship' has no CanRead on) must be denied even inside a readable host artifact
    const deniedEntityBlock = (await granteeProvider.ExecuteGQL(EXECUTE_LIVE_BLOCK_QUERY, {
        specJson: JSON.stringify({
            BlockID: 'blk-it165-denied-entity',
            Kind: 'EntityView',
            Mode: 'Live',
            EntityName: 'MJ: AI Agent Runs',
            Fields: ['ID', 'Status'],
            MaxRows: 5,
        }),
        hostArtifactId: fx.ParentDocID!,
    })) as {
        ExecuteDocumentLiveBlock?: {
            Success: boolean;
            AccessDenied: boolean;
            ErrorMessage?: string | null;
        };
    } | null;
    Assert(
        deniedEntityBlock?.ExecuteDocumentLiveBlock?.Success === false &&
            deniedEntityBlock?.ExecuteDocumentLiveBlock?.AccessDenied === true,
        'ExecuteDocumentLiveBlock must fail closed with AccessDenied=true when the caller lacks CanRead on the target entity',
    );
    Assert(
        (deniedEntityBlock?.ExecuteDocumentLiveBlock?.ErrorMessage ?? '').toLowerCase().includes('permission'),
        `EntityView live block denial must cite missing read permission (got: ${deniedEntityBlock?.ExecuteDocumentLiveBlock?.ErrorMessage ?? ''})`,
    );

    // 3. Artifact block targeting unshared PrivateDocID inside readable ParentDocID must be denied
    const deniedArtifactBlock = (await granteeProvider.ExecuteGQL(EXECUTE_LIVE_BLOCK_QUERY, {
        specJson: JSON.stringify({
            BlockID: 'blk-it165-denied-artifact',
            Kind: 'Artifact',
            Mode: 'Live',
            ArtifactID: fx.PrivateDocID!,
        }),
        hostArtifactId: fx.ParentDocID!,
    })) as {
        ExecuteDocumentLiveBlock?: {
            Success: boolean;
            AccessDenied: boolean;
            ErrorMessage?: string | null;
        };
    } | null;
    Assert(
        deniedArtifactBlock?.ExecuteDocumentLiveBlock?.Success === false &&
            deniedArtifactBlock?.ExecuteDocumentLiveBlock?.AccessDenied === true,
        'ExecuteDocumentLiveBlock must deny an Artifact block when the caller lacks CanRead on the referenced artifact',
    );

    // 4. Positive control: EntityView block on MJ: Artifact Types inside readable ParentDocID succeeds for Read-Only grantee
    const allowedEntityBlock = (await granteeProvider.ExecuteGQL(EXECUTE_LIVE_BLOCK_QUERY, {
        specJson: JSON.stringify({
            BlockID: 'blk-it165-allowed-types',
            Kind: 'EntityView',
            Mode: 'Live',
            EntityName: 'MJ: Artifact Types',
            Fields: ['ID', 'Name'],
            MaxRows: 5,
        }),
        hostArtifactId: fx.ParentDocID!,
    })) as {
        ExecuteDocumentLiveBlock?: {
            Success: boolean;
            AccessDenied: boolean;
            ErrorMessage?: string | null;
        };
    } | null;
    Assert(
        allowedEntityBlock?.ExecuteDocumentLiveBlock?.Success === true &&
            !allowedEntityBlock?.ExecuteDocumentLiveBlock?.AccessDenied,
        `ExecuteDocumentLiveBlock positive control on readable entity + host artifact failed: ${allowedEntityBlock?.ExecuteDocumentLiveBlock?.ErrorMessage ?? ''}`,
    );
}

// ─── DSLC5: All 6 Artifact.* Remote Operations over GraphQL ──────────────────

async function checkDslc5ArtifactRemoteOperations(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const ownerProvider = fx.OwnerProvider!;
    const granteeProvider = fx.GranteeProvider!;

    // Derive a non-admin UserInfo for grantee wire calls where UserInfo.ID must match grantee
    const granteeUser = new UserInfo(ownerProvider, {
        ID: fx.GranteeUserID!,
        Name: 'IT171 Grantee Reader',
        Email: GRANTEE_EMAIL,
        IsActive: true,
        UserRoles: [],
    });

    // 1. Artifact.EvaluateAiFormula — invalid/missing ArtifactID rejected; read-only grantee rejected; owner succeeds on empty Cells batch
    const badFormulaIdRes = await new ArtifactEvaluateAiFormulaOperation().Execute(
        { ArtifactID: '', Cells: [] },
        { provider: ownerProvider, user: ctx.User },
    );
    AssertEqual(badFormulaIdRes.Success, false, 'Artifact.EvaluateAiFormula must reject empty ArtifactID');

    const granteeFormulaRes = await new ArtifactEvaluateAiFormulaOperation().Execute(
        {
            ArtifactID: fx.ParentDocID!,
            Cells: [{ SheetID: 's1', Address: 'A1', Prompt: 'Summarize', ContextValuesJSON: '[]', InputHash: 'h1' }],
        },
        { provider: granteeProvider, user: granteeUser },
    );
    AssertEqual(granteeFormulaRes.Success, false, 'Artifact.EvaluateAiFormula must refuse read-only grantee');

    const ownerEmptyFormulaRes = await new ArtifactEvaluateAiFormulaOperation().Execute(
        { ArtifactID: fx.ParentDocID!, Cells: [] },
        { provider: ownerProvider, user: ctx.User },
    );
    Assert(ownerEmptyFormulaRes.Success, `Artifact.EvaluateAiFormula empty-cell validation failed for owner: ${ownerEmptyFormulaRes.ErrorMessage ?? ''}`);

    // 2. Artifact.SynthesizeFromSources — refuses unreadable private source for grantee; deterministic fallback succeeds for owner
    const deniedSynthRes = await new ArtifactSynthesizeFromSourcesOperation().Execute(
        {
            SourceArtifactIds: [fx.PrivateDocID!],
            TargetKind: 'document',
            Goal: 'Should fail for unshared source',
            Title: 'Forbidden Synth',
        },
        { provider: granteeProvider, user: granteeUser },
    );
    AssertEqual(deniedSynthRes.Success, false, 'Artifact.SynthesizeFromSources must deny unreadable SourceArtifactIds');

    const ownerSynthRes = await new ArtifactSynthesizeFromSourcesOperation().Execute(
        {
            SourceArtifactIds: [fx.ParentDocID!],
            TargetKind: 'document',
            Goal: 'Concise executive brief',
            Title: `__IT171_Synth_${Date.now()}`,
            LinkChartsAndRanges: false,
        },
        { provider: ownerProvider, user: ctx.User },
    );
    Assert(ownerSynthRes.Success && Boolean(ownerSynthRes.Output?.ArtifactID), `Artifact.SynthesizeFromSources failed for owner: ${ownerSynthRes.ErrorMessage ?? ''}`);
    try {
        AssertEqual(ownerSynthRes.Output!.ArtifactTypeName, 'Markdown Document', 'Synthesized target ArtifactTypeName');
    } finally {
        const synthVerId = ownerSynthRes.Output?.VersionID;
        const synthArtId = ownerSynthRes.Output?.ArtifactID;
        if (synthVerId) {
            const vEnt = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
            if (await vEnt.Load(synthVerId)) await vEnt.Delete();
        }
        if (synthArtId) {
            const aEnt = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
            if (await aEnt.Load(synthArtId)) await aEnt.Delete();
        }
    }

    // 3. Artifact.LogComplianceAudit — rejects forged permission event & unreadable artifact; accepts allowlisted event
    const forgedAuditRes = await new ArtifactLogComplianceAuditOperation().Execute(
        {
            AuditLogTypeName: 'Artifact Permission Changed',
            ArtifactID: fx.ParentDocID!,
            ArtifactVersionID: fx.ParentVerID!,
            Summary: 'Attempted forged audit',
        },
        { provider: ownerProvider, user: ctx.User },
    );
    AssertEqual(forgedAuditRes.Success, false, 'Artifact.LogComplianceAudit must reject non-allowlisted event types');

    const deniedAuditRes = await new ArtifactLogComplianceAuditOperation().Execute(
        {
            AuditLogTypeName: 'Artifact Exported',
            ArtifactID: fx.PrivateDocID!,
            ArtifactVersionID: fx.PrivateVerID!,
            Summary: 'Unauthorized export attempt',
        },
        { provider: granteeProvider, user: granteeUser },
    );
    AssertEqual(deniedAuditRes.Success, false, 'Artifact.LogComplianceAudit must deny unreadable PrivateDocID');

    const validAuditRes = await new ArtifactLogComplianceAuditOperation().Execute(
        {
            AuditLogTypeName: 'Artifact Exported',
            ArtifactID: fx.ParentDocID!,
            ArtifactVersionID: fx.ParentVerID!,
            Summary: 'IT171 DSLC5 valid compliance export check',
        },
        { provider: ownerProvider, user: ctx.User },
    );
    Assert(validAuditRes.Success, `Artifact.LogComplianceAudit failed on allowlisted event: ${validAuditRes.ErrorMessage ?? ''}`);

    // 4. Guest share lifecycle via native Magic Link resource-share: CreateGuestShareLink -> MagicLinkInvite binding -> RevokeGuestShareLink
    const granteeCreateShareRes = await new ArtifactCreateGuestShareLinkOperation().Execute(
        { ArtifactID: fx.ParentDocID!, VersionID: fx.ParentVerID!, ExpiresInHours: 1, Label: 'Unauthorized Share' },
        { provider: granteeProvider, user: granteeUser },
    );
    AssertEqual(granteeCreateShareRes.Success, false, 'Read-only grantee without CanShare must be refused CreateGuestShareLink');

    const createShareRes = await new ArtifactCreateGuestShareLinkOperation().Execute(
        { ArtifactID: fx.ParentDocID!, VersionID: fx.ParentVerID!, ExpiresInHours: 1, Label: 'IT171 Wire Link' },
        { provider: ownerProvider, user: ctx.User },
    );
    Assert(
        createShareRes.Success &&
            Boolean(createShareRes.Output?.Token) &&
            Boolean(createShareRes.Output?.LinkID) &&
            Boolean(createShareRes.Output?.MagicLinkInviteID),
        `CreateGuestShareLink failed: ${createShareRes.ErrorMessage ?? ''}`,
    );
    const shareLinkId = createShareRes.Output!.LinkID;
    const magicInviteId = createShareRes.Output!.MagicLinkInviteID;
    Assert(
        (createShareRes.Output!.ShareUrlPath ?? '').includes('/magic-link/redeem?token='),
        `Expected ShareUrlPath to route through /magic-link/redeem, got ${createShareRes.Output!.ShareUrlPath ?? ''}`,
    );

    const rv = RunView.FromMetadataProvider(ownerProvider);
    const inviteCheck = await rv.RunView<{ ID: string; Kind: string; IdentityMode: string; Status: string; ResourceID: string }>(
        {
            EntityName: 'MJ: Magic Link Invites',
            ExtraFilter: `ID = '${magicInviteId}'`,
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(inviteCheck.Success && inviteCheck.Results.length === 1, 'Backing MJ: Magic Link Invites row must exist for guest share');
    AssertEqual(inviteCheck.Results[0].Kind, 'resource-share', 'Backing Magic Link Invite must have Kind=resource-share');
    AssertEqual(inviteCheck.Results[0].IdentityMode, 'anonymous', 'Backing Magic Link Invite must have IdentityMode=anonymous');
    AssertEqual(inviteCheck.Results[0].Status, 'Active', 'Backing Magic Link Invite must initially be Active');

    const granteeRevokeRes = await new ArtifactRevokeGuestShareLinkOperation().Execute(
        { ArtifactID: fx.ParentDocID!, VersionID: fx.ParentVerID!, LinkID: shareLinkId },
        { provider: granteeProvider, user: granteeUser },
    );
    AssertEqual(granteeRevokeRes.Success, false, 'Read-only grantee without CanShare must be refused RevokeGuestShareLink');

    const revokeRes = await new ArtifactRevokeGuestShareLinkOperation().Execute(
        { ArtifactID: fx.ParentDocID!, VersionID: fx.ParentVerID!, LinkID: shareLinkId },
        { provider: ownerProvider, user: ctx.User },
    );
    Assert(revokeRes.Success && revokeRes.Output?.Revoked === true, `RevokeGuestShareLink failed: ${revokeRes.ErrorMessage ?? ''}`);

    const afterRevokeInvite = await rv.RunView<{ Status: string }>(
        {
            EntityName: 'MJ: Magic Link Invites',
            ExtraFilter: `ID = '${magicInviteId}'`,
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User,
    );
    AssertEqual(afterRevokeInvite.Results[0]?.Status, 'Revoked', 'Revoking guest share link must mark backing Magic Link Invite as Revoked');
}

// ─── DSLC6: NW-1 Magic Link Guest Share Redeem + GraphQL Snapshot + Frozen Gate ──

interface PublicGuestFrozenProvenanceItem {
    TargetType: string;
    TargetID: string;
    ArtifactID?: string | null;
    BlockID?: string | null;
    SlideID?: string | null;
    RegionID?: string | null;
    LiveTableID?: string | null;
    SnapshotVerified: boolean;
    FrozenByUserName: string;
    FrozenAt: string;
}

interface PublicGuestShareResponse {
    Success: boolean;
    Valid: boolean;
    ErrorCode?: string | null;
    ErrorMessage?: string | null;
    ArtifactID?: string | null;
    DriverClass?: string | null;
    Content?: string | null;
    Configuration?: string | null;
    FrozenProvenance?: PublicGuestFrozenProvenanceItem[] | null;
    ShareMode?: string | null;
    ReadOnly?: boolean;
}

async function checkDslc6PublicGuestSharePreAuthAndFrozenGate(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const ownerProvider = fx.OwnerProvider!;
    const clientCfg = LoadClientConfig();
    const gqlUrl = new URL('/graphql', clientCfg.Url).toString();

    const typesRv = RunView.FromMetadataProvider(ownerProvider);
    const typeRes = await typesRv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Artifact Types', ExtraFilter: "Name = 'Markdown Document'", MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    Assert(typeRes.Success && typeRes.Results.length > 0, 'Markdown Document artifact type required for DSLC6');
    const docTypeId = typeRes.Results[0].ID;

    const compTypeRes = await typesRv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Artifact Types', ExtraFilter: "Name = 'Component'", MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    const compTypeId = compTypeRes.Success ? compTypeRes.Results[0]?.ID : undefined;

    let liveArtifact: MJArtifactEntity | null = null;
    let liveVer: MJArtifactVersionEntity | null = null;
    let compArtifact: MJArtifactEntity | null = null;
    let compVer: MJArtifactVersionEntity | null = null;
    let shareArt: MJArtifactEntity | null = null;
    let shareVer: MJArtifactVersionEntity | null = null;

    try {
        // 1. Live unfrozen document must be refused external guest share (FROZEN_REQUIRED)
        liveArtifact = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        liveArtifact.NewRecord();
        liveArtifact.Name = `__IT171_LiveBlockDoc_${Date.now()}`;
        liveArtifact.TypeID = docTypeId;
        liveArtifact.UserID = ctx.User.ID;
        liveArtifact.Visibility = 'Always';
        Assert(await liveArtifact.Save(), 'Failed saving temporary live-block doc for DSLC6');

        liveVer = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
        liveVer.NewRecord();
        liveVer.ArtifactID = liveArtifact.ID;
        liveVer.VersionNumber = 1;
        liveVer.Name = liveArtifact.Name;
        liveVer.UserID = ctx.User.ID;
        liveVer.ContentMode = 'Text';
        liveVer.Content = [
            '# Live Block Host',
            '',
            ':::mj-block',
            JSON.stringify({ BlockID: 'blk-live', Kind: 'EntityView', Mode: 'Live', EntityName: 'MJ: Users', MaxRows: 5 }),
            ':::',
        ].join('\n');
        Assert(await liveVer.Save(), 'Failed saving live-block doc v1');

        const liveShareAttempt = await new ArtifactCreateGuestShareLinkOperation().Execute(
            { ArtifactID: liveArtifact.ID, VersionID: liveVer.ID, ExpiresInHours: 1, Label: 'Should Fail Live' },
            { provider: ownerProvider, user: ctx.User },
        );
        AssertEqual(liveShareAttempt.Success, false, 'Guest share creation must refuse artifacts containing unfrozen Live blocks');

        // 1b. Component artifacts execute client code and must be refused guest sharing
        if (compTypeId) {
            compArtifact = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
            compArtifact.NewRecord();
            compArtifact.Name = `__IT171_ComponentRefuse_${Date.now()}`;
            compArtifact.TypeID = compTypeId;
            compArtifact.UserID = ctx.User.ID;
            compArtifact.Visibility = 'Always';
            Assert(await compArtifact.Save(), 'Failed saving temporary component artifact for DSLC6');

            compVer = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
            compVer.NewRecord();
            compVer.ArtifactID = compArtifact.ID;
            compVer.VersionNumber = 1;
            compVer.Name = compArtifact.Name;
            compVer.UserID = ctx.User.ID;
            compVer.ContentMode = 'Text';
            compVer.Content = JSON.stringify({ name: 'BlockedGuestComp', code: 'export default () => null;' });
            Assert(await compVer.Save(), 'Failed saving component artifact v1');

            const compShareAttempt = await new ArtifactCreateGuestShareLinkOperation().Execute(
                { ArtifactID: compArtifact.ID, VersionID: compVer.ID, ExpiresInHours: 1 },
                { provider: ownerProvider, user: ctx.User },
            );
            AssertEqual(compShareAttempt.Success, false, 'Guest share creation must refuse executable Component artifacts');
        }

        // 2. Frozen document succeeds, rejects GET ?token=, and resolves via POST /guest-share/resolve + @Public() GraphQL with DriverClass & FrozenProvenance
        shareArt = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        shareArt.NewRecord();
        shareArt.Name = `__IT171_PublicGuestDoc_${Date.now()}`;
        shareArt.TypeID = docTypeId;
        shareArt.UserID = ctx.User.ID;
        shareArt.Visibility = 'Always';
        Assert(await shareArt.Save(), 'Failed saving public guest share doc');

        const freezeRes = (await ownerProvider.ExecuteGQL(
            `mutation FreezeForGuest($specJson: String!, $ack: Boolean!, $hostArtifactId: String) {
                FreezeDocumentLiveBlock(
                    specJson: $specJson
                    acknowledgeSecurityWarning: $ack
                    hostArtifactId: $hostArtifactId
                ) {
                    Success ErrorMessage UpdatedSpecJSON
                }
            }`,
            {
                specJson: JSON.stringify({
                    BlockID: 'blk-guest-frozen',
                    Kind: 'EntityView',
                    Mode: 'Live',
                    EntityName: 'MJ: Artifact Types',
                    ExtraFilter: "Name = 'Markdown Document'",
                    MaxRows: 1,
                }),
                ack: true,
                hostArtifactId: shareArt.ID,
            },
        )) as {
            FreezeDocumentLiveBlock?: { Success: boolean; ErrorMessage?: string | null; UpdatedSpecJSON?: string | null };
        } | null;
        Assert(
            freezeRes?.FreezeDocumentLiveBlock?.Success === true && Boolean(freezeRes.FreezeDocumentLiveBlock.UpdatedSpecJSON),
            `FreezeDocumentLiveBlock for DSLC6 failed: ${freezeRes?.FreezeDocumentLiveBlock?.ErrorMessage ?? ''}`,
        );

        shareVer = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
        shareVer.NewRecord();
        shareVer.ArtifactID = shareArt.ID;
        shareVer.VersionNumber = 1;
        shareVer.Name = shareArt.Name;
        shareVer.UserID = ctx.User.ID;
        shareVer.ContentMode = 'Text';
        shareVer.Content = [
            '# Public Frozen Executive Report',
            '',
            'Approved external release.',
            '',
            ':::mj-block',
            freezeRes!.FreezeDocumentLiveBlock!.UpdatedSpecJSON!,
            ':::',
        ].join('\n');
        Assert(await shareVer.Save(), 'Failed saving public guest share doc v1');

        const shareCreated = await new ArtifactCreateGuestShareLinkOperation().Execute(
            { ArtifactID: shareArt.ID, VersionID: shareVer.ID, ExpiresInHours: 2, Label: 'Public Press Release' },
            { provider: ownerProvider, user: ctx.User },
        );
        Assert(
            shareCreated.Success && Boolean(shareCreated.Output?.Token) && Boolean(shareCreated.Output?.ShareUrlPath),
            `Failed creating public guest share token: ${shareCreated.ErrorMessage ?? ''}`,
        );
        const token = shareCreated.Output!.Token!;
        const linkId = shareCreated.Output!.LinkID;
        const redeemUrl = new URL(shareCreated.Output!.ShareUrlPath!, clientCfg.Url);
        const redeemEndpoint = `${redeemUrl.origin}${redeemUrl.pathname}`;

        // Unauthenticated GET /magic-link/redeem?token=... serves safe HTML interstitial without redeeming; format=json returns 405
        const getHtmlResp = await fetch(redeemUrl.toString(), { method: 'GET' });
        AssertEqual(getHtmlResp.status, 200, 'Safe GET /magic-link/redeem must serve interstitial HTML');
        const getJsonResp = await fetch(`${redeemEndpoint}?token=${encodeURIComponent(token)}&format=json`, { method: 'GET' });
        AssertEqual(getJsonResp.status, 405, 'GET /magic-link/redeem?format=json must refuse redemption with HTTP 405');

        // POST /magic-link/redeem?format=json exchanges token for RS256 session JWT
        const redeemPostResp = await fetch(`${redeemEndpoint}?format=json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, rt: redeemUrl.searchParams.get('rt') ?? undefined }),
        });
        AssertEqual(redeemPostResp.status, 200, 'POST /magic-link/redeem?format=json must return HTTP 200');
        const redeemJson = (await redeemPostResp.json()) as { success?: boolean; token?: string; errorCode?: string };
        Assert(redeemJson.success === true && Boolean(redeemJson.token), 'POST /magic-link/redeem must mint a session JWT');
        const guestJwt = redeemJson.token!;

        const resolveSnapshotQuery = `query ResolveGuestArtifactSnapshot {
            ResolveGuestArtifactSnapshot {
                Success Valid ErrorCode ArtifactID DriverClass ShareMode ReadOnly Content Configuration
                FrozenProvenance { TargetType TargetID BlockID SnapshotVerified FrozenByUserName FrozenAt }
            }
        }`;

        // Unauthenticated GraphQL call (no Bearer JWT) must be refused
        const unauthGqlResp = await fetch(gqlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: resolveSnapshotQuery }),
        });
        const unauthGqlJson = (await unauthGqlResp.json()) as {
            errors?: Array<{ message: string }>;
            data?: { ResolveGuestArtifactSnapshot?: PublicGuestShareResponse };
        };
        Assert(
            unauthGqlResp.status === 401 ||
                Boolean(unauthGqlJson.errors?.length) ||
                unauthGqlJson.data?.ResolveGuestArtifactSnapshot?.Valid !== true,
            'ResolveGuestArtifactSnapshot must fail closed without an authenticated Magic Link session',
        );

        // Authenticated Magic Link Bearer JWT resolves frozen snapshot with DriverClass & FrozenProvenance
        const guestGqlResp = await fetch(gqlUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${guestJwt}`,
            },
            body: JSON.stringify({ query: resolveSnapshotQuery }),
        });
        AssertEqual(guestGqlResp.status, 200, 'Authenticated Magic Link GraphQL ResolveGuestArtifactSnapshot must return HTTP 200');
        const guestGqlJson = (await guestGqlResp.json()) as {
            data?: { ResolveGuestArtifactSnapshot?: PublicGuestShareResponse };
        };
        const resolved = guestGqlJson.data?.ResolveGuestArtifactSnapshot;
        Assert(resolved?.Valid === true && resolved?.ReadOnly === true, 'ResolveGuestArtifactSnapshot must return Valid=true & ReadOnly=true');
        AssertEqual(resolved?.ShareMode, 'Frozen', 'ResolveGuestArtifactSnapshot ShareMode must be Frozen');
        AssertEqual(resolved?.DriverClass, 'MarkdownArtifactViewerPlugin', 'ResolveGuestArtifactSnapshot must return DriverClass');
        Assert(
            Array.isArray(resolved?.FrozenProvenance) &&
                resolved.FrozenProvenance.some((p) => p.BlockID === 'blk-guest-frozen' && p.SnapshotVerified === true),
            'ResolveGuestArtifactSnapshot must return server-verified FrozenProvenance with SnapshotVerified=true for blk-guest-frozen',
        );
        Assert(!(resolved?.Configuration ?? '').includes('GuestShareLinks'), 'Guest share metadata must scrub GuestShareLinks from Configuration');

        // Forged Magic Link token must reject fail-closed on POST /magic-link/redeem
        const invalidResp = await fetch(`${redeemEndpoint}?format=json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'forged-invalid-token' }),
        });
        const invalidJson = (await invalidResp.json()) as { success?: boolean; errorCode?: string };
        AssertEqual(invalidJson.success, false, 'Forged guest share token must fail redemption');

        // Revoke then confirm immediate revocation on both /magic-link/redeem and existing session JWT
        const revokeRes = await new ArtifactRevokeGuestShareLinkOperation().Execute(
            { ArtifactID: shareArt.ID, VersionID: shareVer.ID, LinkID: linkId },
            { provider: ownerProvider, user: ctx.User },
        );
        Assert(revokeRes.Success && revokeRes.Output?.Revoked === true, 'Owner revoke of guest link failed');

        const afterRevokeRedeemResp = await fetch(`${redeemEndpoint}?format=json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        const afterRevokeRedeemJson = (await afterRevokeRedeemResp.json()) as { success?: boolean; errorCode?: string };
        AssertEqual(afterRevokeRedeemJson.success, false, 'Revoked token must be rejected on POST /magic-link/redeem');
        AssertEqual(afterRevokeRedeemJson.errorCode, 'revoked', 'Revoked token must return errorCode=revoked');

        const afterRevokeGqlResp = await fetch(gqlUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${guestJwt}`,
            },
            body: JSON.stringify({ query: resolveSnapshotQuery }),
        });
        const afterRevokeGqlJson = (await afterRevokeGqlResp.json()) as {
            data?: { ResolveGuestArtifactSnapshot?: PublicGuestShareResponse };
        };
        AssertEqual(afterRevokeGqlJson.data?.ResolveGuestArtifactSnapshot?.Valid, false, 'Previously minted session JWT must reject immediately after invite revocation');
        AssertEqual(afterRevokeGqlJson.data?.ResolveGuestArtifactSnapshot?.ErrorCode, 'REVOKED', 'Revoked session JWT must return ErrorCode=REVOKED');
    } finally {
        for (const ent of [liveVer, liveArtifact, compVer, compArtifact, shareVer, shareArt]) {
            if (ent?.IsSaved) {
                await ent.Delete();
            }
        }
    }
}

// ─── DSLC7: DocumentCollaborationResolver mutations + ArtifactFileDownloadUrl ──

async function checkDslc7CollaborationResolverAndFileDownloadUrl(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const ownerProvider = fx.OwnerProvider!;
    const granteeProvider = fx.GranteeProvider!;
    const clientCfg = LoadClientConfig();

    // 1. VerifyFrozenBlockSnapshot requires authentication & hostArtifactId and rejects tampered snapshot
    const unauthVerifyResp = await fetch(clientCfg.Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: `query VerifyFrozen($specJson: String!, $hostArtifactId: String!) {
                VerifyFrozenBlockSnapshot(specJson: $specJson, hostArtifactId: $hostArtifactId) { Valid SnapshotVerified ErrorMessage }
            }`,
            variables: {
                specJson: JSON.stringify({ BlockID: 'b1', Kind: 'EntityView', Mode: 'Frozen' }),
                hostArtifactId: fx.ParentDocID!,
            },
        }),
    });
    const unauthVerifyJson = (await unauthVerifyResp.json()) as {
        error?: string;
        data?: { VerifyFrozenBlockSnapshot?: { Valid: boolean; SnapshotVerified: boolean } };
        errors?: Array<{ message: string }>;
    };
    const unauthBlocked =
        !unauthVerifyResp.ok ||
        Boolean(unauthVerifyJson.error) ||
        Boolean(unauthVerifyJson.errors?.length) ||
        unauthVerifyJson.data?.VerifyFrozenBlockSnapshot?.Valid === false;
    Assert(unauthBlocked, 'Unauthenticated VerifyFrozenBlockSnapshot must fail closed');

    const tamperedSpec = JSON.stringify({
        BlockID: 'blk-tamper',
        Kind: 'EntityView',
        Mode: 'Frozen',
        FrozenSnapshot: {
            FrozenAt: new Date().toISOString(),
            FrozenByUserID: ctx.User.ID,
            FrozenByUserName: ctx.User.Name || 'Owner',
            Columns: [{ Name: 'Name', DisplayName: 'Name' }],
            Rows: [{ Name: 'Forged' }],
            TotalRowCount: 1,
            SecurityWarningAcknowledged: true,
            SnapshotContentHash: 'hmac-sha256:0000000000000000000000000000000000000000000000000000000000000000',
        },
    });
    const authVerifyRes = (await ownerProvider.ExecuteGQL(
        `query VerifyFrozen($specJson: String!, $hostArtifactId: String!) {
            VerifyFrozenBlockSnapshot(specJson: $specJson, hostArtifactId: $hostArtifactId) { Valid SnapshotVerified ErrorMessage }
        }`,
        { specJson: tamperedSpec, hostArtifactId: fx.ParentDocID! },
    )) as { VerifyFrozenBlockSnapshot?: { Valid: boolean; SnapshotVerified: boolean } } | null;
    AssertEqual(authVerifyRes?.VerifyFrozenBlockSnapshot?.Valid, false, 'Tampered FrozenSnapshot must fail VerifyFrozenBlockSnapshot');
    AssertEqual(authVerifyRes?.VerifyFrozenBlockSnapshot?.SnapshotVerified, false, 'Tampered SnapshotVerified must be false');

    // 2. ExecuteAnchoredCommentAgentMention: Read-only grantee must be refused edit mode
    const mentionRes = (await granteeProvider.ExecuteGQL(
        `mutation Mention($artifactId: String!, $agentHandle: String!, $agentMode: String!, $commentBody: String!) {
            ExecuteAnchoredCommentAgentMention(
                artifactId: $artifactId
                agentHandle: $agentHandle
                agentMode: $agentMode
                commentBody: $commentBody
            ) { Success ErrorMessage }
        }`,
        {
            artifactId: fx.ParentDocID!,
            agentHandle: 'Sage',
            agentMode: 'edit',
            commentBody: '@Sage rewrite section 1',
        },
    )) as { ExecuteAnchoredCommentAgentMention?: { Success: boolean; ErrorMessage?: string | null } } | null;
    AssertEqual(mentionRes?.ExecuteAnchoredCommentAgentMention?.Success, false, 'Read-only grantee must be refused ExecuteAnchoredCommentAgentMention in edit mode');

    // 3. ArtifactFileDownloadUrl must deny read access to unshared PrivateVerID
    const fileUrlErr = await executeGqlExpectingError(
        granteeProvider,
        `query GetFileUrl($id: String!) { ArtifactFileDownloadUrl(artifactVersionId: $id) }`,
        { id: fx.PrivateVerID! },
    );
    Assert(
        /permission|not found|denied/i.test(fileUrlErr),
        `ArtifactFileDownloadUrl must refuse unshared artifact version (got: ${fileUrlErr || 'no error'})`,
    );

    // 4. CommitArtifactInlineEdit + RestoreArtifactVersion round-trip on an isolated disposable artifact
    const rv = RunView.FromMetadataProvider(ownerProvider);
    const typeRes = await rv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Artifact Types', ExtraFilter: "Name = 'Markdown Document'", MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    Assert(typeRes.Success && typeRes.Results.length > 0, 'Markdown Document type required for DSLC7');

    let tempArt: MJArtifactEntity | null = null;
    try {
        tempArt = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        tempArt.NewRecord();
        tempArt.Name = `__IT171_CollabMut_${Date.now()}`;
        tempArt.TypeID = typeRes.Results[0].ID;
        tempArt.UserID = ctx.User.ID;
        tempArt.Visibility = 'Always';
        Assert(await tempArt.Save(), 'Failed creating temp artifact for CommitArtifactInlineEdit');

        const v1 = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
        v1.NewRecord();
        v1.ArtifactID = tempArt.ID;
        v1.VersionNumber = 1;
        v1.Name = tempArt.Name;
        v1.UserID = ctx.User.ID;
        v1.ContentMode = 'Text';
        v1.Content = '# Baseline v1';
        Assert(await v1.Save(), 'Failed saving v1 for CommitArtifactInlineEdit');

        // Read-only grantee cannot CommitArtifactInlineEdit or RestoreArtifactVersion
        const deniedCommit = (await granteeProvider.ExecuteGQL(
            `mutation CommitEdit($artifactId: String!, $content: String!, $saveVersion: Boolean) {
                CommitArtifactInlineEdit(artifactId: $artifactId, content: $content, saveVersion: $saveVersion) {
                    Success ErrorMessage
                }
            }`,
            { artifactId: tempArt.ID, content: '# Hijack', saveVersion: true },
        )) as { CommitArtifactInlineEdit?: { Success: boolean } } | null;
        AssertEqual(deniedCommit?.CommitArtifactInlineEdit?.Success, false, 'Unshared/non-editor must be refused CommitArtifactInlineEdit');

        const deniedRestore = (await granteeProvider.ExecuteGQL(
            `mutation RestoreVer($artifactId: String!, $sourceVersionId: String!) {
                RestoreArtifactVersion(artifactId: $artifactId, sourceVersionId: $sourceVersionId) {
                    Success ErrorMessage
                }
            }`,
            { artifactId: tempArt.ID, sourceVersionId: v1.ID },
        )) as { RestoreArtifactVersion?: { Success: boolean } } | null;
        AssertEqual(deniedRestore?.RestoreArtifactVersion?.Success, false, 'Unshared/non-editor must be refused RestoreArtifactVersion');

        // Owner commits inline edit v2 then restores v1 into v3
        const commitRes = (await ownerProvider.ExecuteGQL(
            `mutation CommitEdit($artifactId: String!, $content: String!, $saveVersion: Boolean) {
                CommitArtifactInlineEdit(artifactId: $artifactId, content: $content, saveVersion: $saveVersion) {
                    Success VersionID VersionNumber ErrorMessage
                }
            }`,
            { artifactId: tempArt.ID, content: '# Edited v2', saveVersion: true },
        )) as { CommitArtifactInlineEdit?: { Success: boolean; VersionNumber?: number; ErrorMessage?: string | null } } | null;
        Assert(commitRes?.CommitArtifactInlineEdit?.Success === true, `Owner CommitArtifactInlineEdit failed: ${commitRes?.CommitArtifactInlineEdit?.ErrorMessage ?? ''}`);
        AssertEqual(commitRes?.CommitArtifactInlineEdit?.VersionNumber, 2, 'CommitArtifactInlineEdit must create VersionNumber 2');

        const restoreRes = (await ownerProvider.ExecuteGQL(
            `mutation RestoreVer($artifactId: String!, $sourceVersionId: String!) {
                RestoreArtifactVersion(artifactId: $artifactId, sourceVersionId: $sourceVersionId) {
                    Success VersionNumber ErrorMessage
                }
            }`,
            { artifactId: tempArt.ID, sourceVersionId: v1.ID },
        )) as { RestoreArtifactVersion?: { Success: boolean; VersionNumber?: number; ErrorMessage?: string | null } } | null;
        Assert(restoreRes?.RestoreArtifactVersion?.Success === true, `Owner RestoreArtifactVersion failed: ${restoreRes?.RestoreArtifactVersion?.ErrorMessage ?? ''}`);
        AssertEqual(restoreRes?.RestoreArtifactVersion?.VersionNumber, 3, 'RestoreArtifactVersion must append VersionNumber 3 with v1 content');
    } finally {
        if (tempArt?.IsSaved) {
            const verList = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID = '${tempArt.ID}'`,
                    Fields: ['ID'],
                    OrderBy: 'VersionNumber DESC',
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User,
            );
            if (verList.Success) {
                for (const row of verList.Results) {
                    const vEnt = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
                    if (await vEnt.Load(row.ID)) {
                        await vEnt.Delete();
                    }
                }
            }
            await tempArt.Delete();
        }
    }
}

// ─── DSLC8: WebSocket Yjs server meta-map tamper rejection & heading lock guard ──

// Valid Y.Doc.getMap('meta').set('versionNumber', 999) encoded as YJS_MESSAGE_SYNC(0) + Update(2)
const YJS_META_TAMPER_FRAME_HEX = '0002220101f7f2cc810a002801046d6574610d76657273696f6e4e756d626572017da70f00';
// Valid Y.Doc.getText('content').insert(0, 'LOCKED_MUTATION') encoded as YJS_MESSAGE_SYNC(0) + Update(2)
const YJS_TEXT_INSERT_AT_0_FRAME_HEX = '0002230101d5e5d8e00200040107636f6e74656e740f4c4f434b45445f4d55544154494f4e00';

async function sendWsFrameExpectingReadonlyRejected(wsUrl: string, payload: Uint8Array): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        socket.binaryType = 'arraybuffer';
        const timer = setTimeout(() => {
            try {
                socket.close();
            } catch {
                // ignore
            }
            reject(new Error(`Timed out waiting for readonly-rejected from ${wsUrl}`));
        }, 10_000);

        socket.addEventListener('open', () => {
            socket.send(payload);
        });
        socket.addEventListener('message', (event: MessageEvent) => {
            const textPayload =
                typeof event.data === 'string'
                    ? event.data
                    : event.data instanceof ArrayBuffer
                      ? new TextDecoder().decode(new Uint8Array(event.data))
                      : '';
            if (textPayload.includes('readonly-rejected')) {
                clearTimeout(timer);
                socket.close();
                resolve(textPayload);
            }
        });
        socket.addEventListener('error', () => {
            clearTimeout(timer);
            reject(new Error(`WebSocket connection failed for ${wsUrl}`));
        });
    });
}

async function checkDslc8WebSocketMetaAndLockRejection(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const ownerProvider = fx.OwnerProvider!;
    const granteeProvider = fx.GranteeProvider!;
    const clientCfg = LoadClientConfig();
    const httpUrl = new URL(clientCfg.Url);
    const wsScheme = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    const MINT_TICKET_MUTATION = `
        mutation MintTicket($artifactId: String!) {
            MintArtifactCollaborationTicket(artifactId: $artifactId) {
                Success ErrorMessage Ticket WsPath CanRead CanEdit
            }
        }
    `;

    const rv = RunView.FromMetadataProvider(ownerProvider);
    const typeRes = await rv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Artifact Types', ExtraFilter: "Name = 'Markdown Document'", MaxRows: 1, ResultType: 'simple' },
        ctx.User,
    );
    Assert(typeRes.Success && typeRes.Results.length > 0, 'Markdown Document type required for DSLC8');

    let lockedDoc: MJArtifactEntity | null = null;
    let lockedVer: MJArtifactVersionEntity | null = null;
    let editorPerm: MJArtifactPermissionEntity | null = null;

    try {
        lockedDoc = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        lockedDoc.NewRecord();
        lockedDoc.Name = `__IT171_LockedWsDoc_${Date.now()}`;
        lockedDoc.TypeID = typeRes.Results[0].ID;
        lockedDoc.UserID = ctx.User.ID;
        lockedDoc.Visibility = 'Always';
        Assert(await lockedDoc.Save(), 'Failed saving locked WS test artifact');

        lockedVer = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
        lockedVer.NewRecord();
        lockedVer.ArtifactID = lockedDoc.ID;
        lockedVer.VersionNumber = 1;
        lockedVer.Name = lockedDoc.Name;
        lockedVer.UserID = ctx.User.ID;
        lockedVer.ContentMode = 'Text';
        lockedVer.Content = '<!-- mj-lock: owner-only -->\n# Protected Heading\nLocked paragraph text.';
        Assert(await lockedVer.Save(), 'Failed saving locked WS doc v1');

        // 1. Even the Artifact OWNER cannot tamper with Y.Doc.getMap('meta') over WebSocket (R8-1)
        const ownerTicketRes = (await ownerProvider.ExecuteGQL(MINT_TICKET_MUTATION, {
            artifactId: lockedDoc.ID,
        })) as {
            MintArtifactCollaborationTicket?: { Success: boolean; Ticket?: string | null; WsPath?: string | null; CanEdit: boolean };
        } | null;
        Assert(ownerTicketRes?.MintArtifactCollaborationTicket?.Success === true && ownerTicketRes.MintArtifactCollaborationTicket.CanEdit === true, 'Owner must receive CanEdit WS ticket');
        const ownerWsPath = ownerTicketRes!.MintArtifactCollaborationTicket!.WsPath || '/collaboration/yjs';
        const ownerWsUrl = `${wsScheme}//${httpUrl.host}${ownerWsPath}?ticket=${encodeURIComponent(ownerTicketRes!.MintArtifactCollaborationTicket!.Ticket!)}&artifactId=${encodeURIComponent(lockedDoc.ID)}`;
        const metaRejectMsg = await sendWsFrameExpectingReadonlyRejected(ownerWsUrl, Buffer.from(YJS_META_TAMPER_FRAME_HEX, 'hex'));
        Assert(metaRejectMsg.includes('readonly-rejected'), `WS meta tamper must reply readonly-rejected (got: ${metaRejectMsg})`);

        // 2. Grant CanEdit=true to non-owner peer, then verify Yjs insert into locked heading section is rejected
        editorPerm = await ownerProvider.GetEntityObject<MJArtifactPermissionEntity>('MJ: Artifact Permissions', ctx.User);
        editorPerm.NewRecord();
        editorPerm.ArtifactID = lockedDoc.ID;
        editorPerm.UserID = fx.GranteeUserID!;
        editorPerm.CanRead = true;
        editorPerm.CanEdit = true;
        editorPerm.CanDelete = false;
        editorPerm.CanShare = false;
        Assert(await editorPerm.Save(), 'Failed granting CanEdit to peer for locked section test');

        const editorTicketRes = (await granteeProvider.ExecuteGQL(MINT_TICKET_MUTATION, {
            artifactId: lockedDoc.ID,
        })) as {
            MintArtifactCollaborationTicket?: { Success: boolean; Ticket?: string | null; WsPath?: string | null; CanEdit: boolean };
        } | null;
        Assert(editorTicketRes?.MintArtifactCollaborationTicket?.Success === true && editorTicketRes.MintArtifactCollaborationTicket.CanEdit === true, 'Shared editor must receive CanEdit WS ticket');
        const editorWsPath = editorTicketRes!.MintArtifactCollaborationTicket!.WsPath || '/collaboration/yjs';
        const editorWsUrl = `${wsScheme}//${httpUrl.host}${editorWsPath}?ticket=${encodeURIComponent(editorTicketRes!.MintArtifactCollaborationTicket!.Ticket!)}&artifactId=${encodeURIComponent(lockedDoc.ID)}`;
        const lockRejectMsg = await sendWsFrameExpectingReadonlyRejected(editorWsUrl, Buffer.from(YJS_TEXT_INSERT_AT_0_FRAME_HEX, 'hex'));
        Assert(lockRejectMsg.includes('readonly-rejected'), `Non-owner write into <!-- mj-lock --> must reply readonly-rejected (got: ${lockRejectMsg})`);
    } finally {
        await new Promise((r) => setTimeout(r, 100));
        for (const ent of [editorPerm, lockedVer, lockedDoc]) {
            if (ent?.IsSaved) {
                await ent.Delete();
            }
        }
    }
}

// ─── DSLC9: API-key scope enforcement (artifact:read / artifact:edit / artifact:share) ──

async function mintScopedOwnerKey(
    ctx: IntegrationCheckContext,
    tracker: MintedUserKeyIds,
    scopePaths: string[],
    label: string,
): Promise<string> {
    const engine = GetAPIKeyEngine();
    const created = await engine.CreateAPIKey({ UserId: ctx.User.ID, Label: label }, ctx.User);
    Assert(created.Success && Boolean(created.RawKey) && Boolean(created.APIKeyId), `CreateAPIKey(${label}) failed: ${created.Error ?? ''}`);
    tracker.CreatedKeyIds.push(created.APIKeyId!);

    for (const fullPath of scopePaths) {
        const scope = engine.Scopes.find((s) => s.FullPath === fullPath);
        Assert(scope !== undefined, `Expected API scope '${fullPath}' in engine.Scopes`);
        const rule = await ctx.Provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User);
        rule.NewRecord();
        rule.APIKeyID = created.APIKeyId!;
        rule.ScopeID = scope!.ID;
        rule.ResourcePattern = '*';
        rule.PatternType = 'Include';
        rule.IsDeny = false;
        rule.Priority = 0;
        Assert(await rule.Save(), `Failed saving API key scope '${fullPath}': ${rule.LatestResult?.CompleteMessage ?? ''}`);
        tracker.CreatedScopeRuleIds.push(rule.ID);
    }
    return created.RawKey!;
}

async function checkDslc9ArtifactApiKeyScopeEnforcement(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const tempTracker: MintedUserKeyIds = { CreatedKeyIds: [], CreatedScopeRuleIds: [] };
    let noArtifactReadProvider: GraphQLDataProvider | undefined;
    let readOnlyScopeProvider: GraphQLDataProvider | undefined;

    try {
        // Key A: standard entity/view/dataset/user read only (NO artifact:read, NO artifact:edit, NO artifact:share)
        const keyNoArtifact = await mintScopedOwnerKey(
            ctx,
            tempTracker,
            ['user:read', 'dataset:read', 'entity:read', 'view:run'],
            'IT171 Owner Key Without Artifact Scopes',
        );
        noArtifactReadProvider = (await BuildUserKeyProviderWithRetry(keyNoArtifact)) as GraphQLDataProvider;

        const deniedReadPermsErr = await executeGqlExpectingError(
            noArtifactReadProvider,
            `query Perms($artifactId: String!) { ResolveArtifactUserPermissions(artifactId: $artifactId) { CanRead } }`,
            { artifactId: fx.ParentDocID! },
        );
        Assert(
            deniedReadPermsErr.length > 0,
            'Owner API key missing artifact:read scope must be refused ResolveArtifactUserPermissions',
        );

        // Key B: adds artifact:read, but omits artifact:edit and artifact:share
        const keyReadOnly = await mintScopedOwnerKey(
            ctx,
            tempTracker,
            ['user:read', 'dataset:read', 'entity:read', 'view:run', 'artifact:read'],
            'IT171 Owner Key Read-Only Artifact Scope',
        );
        readOnlyScopeProvider = (await BuildUserKeyProviderWithRetry(keyReadOnly)) as GraphQLDataProvider;

        const allowedPermsRes = (await readOnlyScopeProvider.ExecuteGQL(
            `query Perms($artifactId: String!) { ResolveArtifactUserPermissions(artifactId: $artifactId) { CanRead CanEdit CanShare } }`,
            { artifactId: fx.ParentDocID! },
        )) as { ResolveArtifactUserPermissions?: { CanRead: boolean; CanEdit: boolean } } | null;
        AssertEqual(
            allowedPermsRes?.ResolveArtifactUserPermissions?.CanRead,
            true,
            'Owner API key WITH artifact:read must resolve ResolveArtifactUserPermissions',
        );

        const deniedEditErr = await executeGqlExpectingError(
            readOnlyScopeProvider,
            `mutation CommitEdit($artifactId: String!, $content: String!) {
                CommitArtifactInlineEdit(artifactId: $artifactId, content: $content) { Success }
            }`,
            { artifactId: fx.ParentDocID!, content: '# Scope Denied Edit' },
        );
        Assert(
            deniedEditErr.length > 0,
            'Owner API key missing artifact:edit scope must be refused CommitArtifactInlineEdit',
        );

        const deniedShareOp = await new ArtifactCreateGuestShareLinkOperation().Execute(
            { ArtifactID: fx.ParentDocID!, VersionID: fx.ParentVerID!, ExpiresInHours: 1, Label: 'Scope Denied Share' },
            { provider: readOnlyScopeProvider, user: ctx.User },
        );
        AssertEqual(
            deniedShareOp.Success,
            false,
            'Owner API key missing artifact:share scope must be refused Artifact.CreateGuestShareLink',
        );
    } finally {
        if (noArtifactReadProvider) CloseWireSession(noArtifactReadProvider);
        if (readOnlyScopeProvider) CloseWireSession(readOnlyScopeProvider);
        await DeleteMintedUserKeys(ctx, tempTracker);
    }
}

// ─── DSLC10: ClientClauseScreen (AssertUnscopedRead) on protected entities (`P0-R1`) ──

async function checkDslc10ClientClauseScreenProtectedSubqueries(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const granteeRv = RunView.FromMetadataProvider(fx.GranteeProvider!);
    const ownerRv = RunView.FromMetadataProvider(fx.OwnerProvider!);

    const protectedSubqueryProbes: ReadonlyArray<{ label: string; extraFilter: string }> = [
        { label: 'vwArtifacts', extraFilter: 'ID IN (SELECT UserID FROM vwArtifacts)' },
        { label: 'vwArtifactVersions', extraFilter: 'ID IN (SELECT UserID FROM vwArtifactVersions)' },
        { label: 'vwCollections', extraFilter: 'ID IN (SELECT OwnerID FROM vwCollections)' },
    ];

    for (const probe of protectedSubqueryProbes) {
        const granteeRes = await granteeRv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Users',
                ExtraFilter: probe.extraFilter,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(
            !granteeRes.Success &&
                /row-level access via server RunView hooks|unscoped|ClientClauseScreen|Invalid ExtraFilter/i.test(
                    granteeRes.ErrorMessage ?? '',
                ),
            `ClientClauseScreen must block grantee subquery over protected ${probe.label} (got Success=${granteeRes.Success}, Error=${granteeRes.ErrorMessage ?? ''})`,
        );

        const ownerRes = await ownerRv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Users',
                ExtraFilter: probe.extraFilter,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(
            !ownerRes.Success &&
                /row-level access via server RunView hooks|unscoped|ClientClauseScreen|Invalid ExtraFilter/i.test(
                    ownerRes.ErrorMessage ?? '',
                ),
            `ClientClauseScreen must block even admin subquery over protected ${probe.label} (got Success=${ownerRes.Success}, Error=${ownerRes.ErrorMessage ?? ''})`,
        );
    }
}

// ─── DSLC11: MJ: Collections (`P0-R2`) unauthorized read/write rejection ──

async function checkDslc11CollectionUnauthorizedReadWriteRejection(): Promise<void> {
    const fx = requireDslClientFixture();
    const ownerProvider = fx.OwnerProvider!;
    const granteeProvider = fx.GranteeProvider!;
    const ownerRv = RunView.FromMetadataProvider(ownerProvider);
    const granteeRv = RunView.FromMetadataProvider(granteeProvider);

    const envRes = await ownerRv.RunView<{ ID: string }>({
        EntityName: 'MJ: Environments',
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
    });
    const environmentId = envRes.Success && envRes.Results.length > 0 ? envRes.Results[0].ID : undefined;

    let privateCol: MJCollectionEntity | null = null;
    try {
        privateCol = await ownerProvider.GetEntityObject<MJCollectionEntity>('MJ: Collections', ownerProvider.CurrentUser);
        privateCol.NewRecord();
        privateCol.Name = `__IT171_PrivateCol_${Date.now()}`;
        privateCol.OwnerID = ownerProvider.CurrentUser.ID;
        if (environmentId) {
            privateCol.EnvironmentID = environmentId;
        }
        Assert(
            await privateCol.Save(),
            `Failed creating owner private collection: ${privateCol.LatestResult?.CompleteMessage ?? ''}`,
        );

        // 1. Unauthorized RunView simple + count_only must return 0 rows
        const readSimple = await granteeRv.RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ID = '${privateCol.ID}'`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
            BypassCache: true,
        });
        Assert(
            !readSimple.Success || readSimple.Results.length === 0,
            'Unauthorized grantee must not read private MJ: Collections via RunView simple',
        );

        const readCount = await granteeRv.RunView<{ ID: string }>({
            EntityName: 'MJ: Collections',
            ExtraFilter: `ID = '${privateCol.ID}'`,
            ResultType: 'count_only',
            BypassCache: true,
        });
        AssertEqual(
            readCount.TotalRowCount ?? 0,
            0,
            'Unauthorized grantee count_only on private MJ: Collections must return 0',
        );

        // 2. Unauthorized UpdateMJCollection & DeleteMJCollection over GraphQL must be rejected
        const updateErr = await executeGqlExpectingError(
            granteeProvider,
            `mutation UnauthorizedUpdateCol($input: UpdateMJCollectionInput!) {
                UpdateMJCollection(input: $input) { ID Name }
            }`,
            {
                input: {
                    ID: privateCol.ID,
                    Name: 'Hijacked Collection',
                    OwnerID: ownerProvider.CurrentUser.ID,
                    OldValues___: [{ Key: 'Name', Value: privateCol.Name }],
                },
            },
        );
        Assert(
            updateErr.length > 0,
            'Unauthorized grantee UpdateMJCollection on private collection must be rejected',
        );

        const deleteErr = await executeGqlExpectingError(
            granteeProvider,
            `mutation UnauthorizedDeleteCol($ID: String!) {
                DeleteMJCollection(ID: $ID) { ID }
            }`,
            { ID: privateCol.ID },
        );
        Assert(
            deleteErr.length > 0,
            'Unauthorized grantee DeleteMJCollection on private collection must be rejected',
        );

        // 3. Unauthorized child collection under ParentID or linking an artifact into privateCol must be rejected
        const childErr = await executeGqlExpectingError(
            granteeProvider,
            `mutation UnauthorizedChildCol($input: CreateMJCollectionInput!) {
                CreateMJCollection(input: $input) { ID }
            }`,
            {
                input: {
                    Name: `__IT171_HijackChild_${Date.now()}`,
                    OwnerID: fx.GranteeUserID!,
                    ParentID: privateCol.ID,
                    ...(environmentId ? { EnvironmentID: environmentId } : {}),
                },
            },
        );
        Assert(
            childErr.length > 0,
            'Unauthorized grantee CreateMJCollection with ParentID pointing to private collection must be rejected',
        );

        const linkErr = await executeGqlExpectingError(
            granteeProvider,
            `mutation UnauthorizedColArtifact($input: CreateMJCollectionArtifactInput!) {
                CreateMJCollectionArtifact(input: $input) { ID }
            }`,
            {
                input: {
                    CollectionID: privateCol.ID,
                    ArtifactVersionID: fx.ParentVerID!,
                },
            },
        );
        Assert(
            linkErr.length > 0,
            'Unauthorized grantee CreateMJCollectionArtifact into private collection must be rejected',
        );
    } finally {
        if (privateCol?.IsSaved) {
            await privateCol.Delete();
        }
    }
}

// ─── DSLC12: StartRealtimeClientSession cross-user conversationId IDOR rejection (`P1-5`) ──

async function checkDslc12StartRealtimeSessionConversationIdor(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const ownerProvider = fx.OwnerProvider!;
    const granteeProvider = fx.GranteeProvider!;
    const ownerRv = RunView.FromMetadataProvider(ownerProvider);

    const envRes = await ownerRv.RunView<{ ID: string }>({
        EntityName: 'MJ: Environments',
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
    });
    const environmentId = envRes.Success && envRes.Results.length > 0 ? envRes.Results[0].ID : undefined;

    const agentRes = await ownerRv.RunView<{ ID: string; Name: string }>({
        EntityName: 'MJ: AI Agents',
        ExtraFilter: "Status = 'Active'",
        Fields: ['ID', 'Name'],
        MaxRows: 1,
        ResultType: 'simple',
    });
    const activeAgentId = agentRes.Success && agentRes.Results.length > 0 ? agentRes.Results[0].ID : undefined;

    let foreignConv: MJConversationEntity | null = null;
    try {
        // Create a conversation owned by GranteeUserID, then attempt to bind OwnerProvider's realtime session to it
        foreignConv = await ownerProvider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
        foreignConv.NewRecord();
        foreignConv.Name = `__IT171_IDOR_Conv_${Date.now()}`;
        foreignConv.UserID = fx.GranteeUserID!;
        if (environmentId) {
            foreignConv.EnvironmentID = environmentId;
        }
        Assert(
            await foreignConv.Save(),
            `Failed creating foreign-owned conversation for DSLC12: ${foreignConv.LatestResult?.CompleteMessage ?? ''}`,
        );

        const START_REALTIME_MUTATION = `
            mutation StartSessionIdorProbe($targetAgentId: String, $conversationId: String) {
                StartRealtimeClientSession(targetAgentId: $targetAgentId, conversationId: $conversationId) {
                    AgentSessionId
                    ConversationId
                    EphemeralToken
                }
            }
        `;

        // 1. Cross-user call by OwnerProvider (who holds agent:execute & CanRun) against Grantee-owned conversationId must hit P1-5 ownership refusal
        const ownerIdorErr = await executeGqlExpectingError(ownerProvider, START_REALTIME_MUTATION, {
            targetAgentId: activeAgentId ?? null,
            conversationId: foreignConv.ID,
        });
        Assert(
            /Access denied: you do not have access to the requested conversation|not authorized to start a session on this conversation/i.test(ownerIdorErr),
            `StartRealtimeClientSession must reject cross-user conversationId with IDOR authorization error (got: ${ownerIdorErr || 'no error'})`,
        );

        // 2. Also verify GranteeProvider cannot start a session on a foreign conversationId
        const ownerOwnedConv = await ownerProvider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
        ownerOwnedConv.NewRecord();
        ownerOwnedConv.Name = `__IT171_Owner_Conv_${Date.now()}`;
        ownerOwnedConv.UserID = ctx.User.ID;
        if (environmentId) {
            ownerOwnedConv.EnvironmentID = environmentId;
        }
        if (await ownerOwnedConv.Save()) {
            try {
                const granteeIdorErr = await executeGqlExpectingError(granteeProvider, START_REALTIME_MUTATION, {
                    targetAgentId: activeAgentId ?? null,
                    conversationId: ownerOwnedConv.ID,
                });
                Assert(
                    granteeIdorErr.length > 0,
                    'Grantee StartRealtimeClientSession on owner-owned conversationId must be rejected',
                );
            } finally {
                await ownerOwnedConv.Delete();
            }
        }
        } finally {
        if (foreignConv?.IsSaved) {
            await foreignConv.Delete();
        }
    }
}

// ─── DSLC13: B4 Default-off guest sharing refusal against ephemeral MJAPI ─────

async function allocateFreeTcpPort(): Promise<number> {
    return new Promise<number>((res, rej) => {
        const srv = createNetServer();
        srv.unref();
        srv.on('error', rej);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            srv.close(() => (port > 0 ? res(port) : rej(new Error('Failed to allocate ephemeral TCP port'))));
        });
    });
}

async function waitForHealthcheck(baseUrl: string, childExited: () => string | null, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const exitMsg = childExited();
        if (exitMsg !== null) {
            throw new Error(`Ephemeral MJAPI exited before healthcheck became ready: ${exitMsg}`);
        }
        try {
            const resp = await fetch(`${baseUrl}/healthcheck`);
            if (resp.ok) {
                return;
            }
        } catch {
            // Still booting
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Ephemeral MJAPI did not become healthy within ${timeoutMs}ms`);
}

async function checkDslc13GuestShareDisabledRefusal(_ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const mjapiDir = resolvePath(process.cwd(), 'packages/MJAPI');
    const mjapiEntry = resolvePath(mjapiDir, 'dist/index.js');
    if (!existsSync(mjapiEntry)) {
        SkipCheck(`Built MJAPI entrypoint not found at ${mjapiEntry}; build mj_api to verify B4 default-off refusal.`);
    }

    const clientCfg = LoadClientConfig();
    const apiKey = (process.env.MJ_API_KEY || clientCfg.MJAPIKey || '').trim();
    if (!apiKey) {
        SkipCheck('MJ_API_KEY is required to invoke ExecuteRemoteOperation against ephemeral MJAPI for DSLC13.');
    }

    const port = await allocateFreeTcpPort();
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    delete childEnv.MJ_ARTIFACT_GUEST_SHARING_ENABLED;
    childEnv.GRAPHQL_PORT = String(port);
    childEnv.MJ_API_KEY = apiKey;
    childEnv.MJ_DISABLE_TASK_GRAPH_DISPATCHER = '1';
    childEnv.MJ_REST_API_ENABLED = 'false';
    childEnv.MJ_TELEMETRY_ENABLED = 'false';

    const logs: string[] = [];
    let exitedMsg: string | null = null;
    const child = spawn(process.execPath, [mjapiEntry], {
        cwd: mjapiDir,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const appendLog = (chunk: Buffer): void => {
        logs.push(chunk.toString('utf8'));
        if (logs.length > 40) {
            logs.shift();
        }
    };
    child.stdout?.on('data', appendLog);
    child.stderr?.on('data', appendLog);
    child.on('exit', (code, signal) => {
        exitedMsg = `code=${code}, signal=${signal}, tail=${logs.join('').slice(-800)}`;
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    try {
        await waitForHealthcheck(baseUrl, () => exitedMsg, 60_000);

        const gqlResp = await fetch(`${baseUrl}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-mj-api-key': apiKey,
            },
            body: JSON.stringify({
                query: `mutation TryCreateDisabledGuestShare($input: ExecuteRemoteOperationInput!) {
                    ExecuteRemoteOperation(input: $input) {
                        success
                        resultCode
                        errorMessage
                    }
                }`,
                variables: {
                    input: {
                        operationKey: 'Artifact.CreateGuestShareLink',
                        inputJSON: JSON.stringify({
                            ArtifactID: fx.ParentDocID!,
                            VersionID: fx.ParentVerID!,
                            ExpiresInHours: 1,
                            Label: 'DSLC13 Disabled Check',
                        }),
                        invokeMode: 'sync',
                    },
                },
            }),
        });
        AssertEqual(gqlResp.status, 200, 'GraphQL ExecuteRemoteOperation HTTP status on default-off MJAPI');
        const gqlJson = (await gqlResp.json()) as {
            data?: {
                ExecuteRemoteOperation?: {
                    success?: boolean;
                    resultCode?: string | null;
                    errorMessage?: string | null;
                };
            };
        };
        const opRes = gqlJson.data?.ExecuteRemoteOperation;
        AssertEqual(
            opRes?.success,
            false,
            'Artifact.CreateGuestShareLink must refuse when magicLink.artifactGuestSharing.enabled is default-off',
        );
        AssertEqual(
            opRes?.resultCode,
            'GUEST_SHARING_DISABLED',
            `Expected resultCode=GUEST_SHARING_DISABLED, got ${opRes?.resultCode ?? ''} (${opRes?.errorMessage ?? ''})`,
        );
        Assert(
            (opRes?.errorMessage ?? '').includes('magicLink.artifactGuestSharing.enabled must be true'),
            `Expected B4 errorMessage explanation, got: ${opRes?.errorMessage ?? ''}`,
        );

        const unauthRedeemResp = await fetch(`${baseUrl}/magic-link/redeem?format=json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'mlt_disabled_check' }),
        });
        AssertEqual(
            unauthRedeemResp.status,
            401,
            `Unauthenticated POST ${baseUrl}/magic-link/redeem must be blocked by auth middleware (HTTP 401, not public route); got HTTP ${unauthRedeemResp.status}`,
        );

        // Verify /magic-link/redeem is unmounted (not serving GET 405 Method Not Allowed or POST redeem JSON)
        const authedGetRedeemResp = await fetch(`${baseUrl}/magic-link/redeem?format=json`, {
            method: 'GET',
            headers: {
                'x-mj-api-key': apiKey,
            },
        });
        Assert(
            authedGetRedeemResp.status === 404 || authedGetRedeemResp.status === 400,
            `Authenticated GET ${baseUrl}/magic-link/redeem?format=json must remain unmounted (HTTP 404 or 400, not 405/200); got HTTP ${authedGetRedeemResp.status}`,
        );

        const authedRedeemResp = await fetch(`${baseUrl}/magic-link/redeem?format=json`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-mj-api-key': apiKey,
            },
            body: JSON.stringify({ token: 'mlt_disabled_check' }),
        });
        // Express falls through to Apollo GraphQL on POST when /magic-link is unmounted (HTTP 400 or 404), never HTTP 200 or redeem JSON
        Assert(
            authedRedeemResp.status === 404 || authedRedeemResp.status === 400,
            `Authenticated POST ${baseUrl}/magic-link/redeem must remain unmounted (HTTP 404 or Apollo fallback 400); got HTTP ${authedRedeemResp.status}`,
        );
        const authedBodyText = await authedRedeemResp.text();
        Assert(
            !authedBodyText.includes('"success"') && !authedBodyText.includes('MAGIC_LINK'),
            `Authenticated POST ${baseUrl}/magic-link/redeem must not reach magic-link handler; got body: ${authedBodyText.slice(0, 200)}`,
        );
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGTERM');
            await new Promise<void>((res) => {
                const timer = setTimeout(() => {
                    if (child.exitCode === null && child.signalCode === null) {
                        child.kill('SIGKILL');
                    }
                    res();
                }, 3000);
                child.once('exit', () => {
                    clearTimeout(timer);
                    res();
                });
            });
        }
    }
}

async function checkDslc14ChildDelegateCountOracleAndStoredQueries(ctx: IntegrationCheckContext): Promise<void> {
    const fx = requireDslClientFixture();
    const ownerProvider = fx.OwnerProvider!;
    const granteeProvider = fx.GranteeProvider!;

    const artEntity = ownerProvider.EntityByName('MJ: Artifacts');
    Assert(Boolean(artEntity?.ID), 'MJ: Artifacts entity metadata is required for DSLC14');
    const typesRv = RunView.FromMetadataProvider(ownerProvider);
    const typeRes = await typesRv.RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Artifact Types',
            ExtraFilter: "Name = 'Markdown Document'",
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(typeRes.Success && typeRes.Results.length === 1, 'Markdown Document artifact type required for DSLC14');
    const docTypeId = typeRes.Results[0].ID;
    const probeMarker = `DSLC14_CHILD_PROBE_${randomUUID()}`;

    let childArtId: string | undefined;
    let childVerId: string | undefined;
    try {
        const childArt = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
        childArt.NewRecord();
        childArt.Name = `__IT171_ChildDelegatedSecret_${Date.now()} (mj-integration-test — safe to delete)`;
        childArt.TypeID = docTypeId;
        childArt.UserID = ctx.User.ID;
        childArt.Visibility = 'Always';
        childArt.DelegateEntityID = artEntity!.ID;
        childArt.DelegateRecordID = fx.PrivateDocID!;
        Assert(await childArt.Save(), `Failed saving child delegated artifact: ${childArt.LatestResult?.CompleteMessage ?? ''}`);
        childArtId = childArt.ID;

        const childVer = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
        childVer.NewRecord();
        childVer.ArtifactID = childArt.ID;
        childVer.VersionNumber = 1;
        childVer.Name = childArt.Name;
        childVer.UserID = ctx.User.ID;
        childVer.ContentMode = 'Text';
        childVer.Content = `# Child Secret\n\nConfidential payload ${probeMarker}`;
        Assert(await childVer.Save(), `Failed saving child delegated version: ${childVer.LatestResult?.CompleteMessage ?? ''}`);
        childVerId = childVer.ID;

        // 1. R1: Non-grantee User B cannot probe child delegated artifact versions via count_only + LIKE filter
        const granteeCountRes = await RunView.FromMetadataProvider(granteeProvider).RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `Content LIKE '%${probeMarker}%'`,
                ResultType: 'count_only',
            },
            granteeProvider.CurrentUser,
        );
        Assert(
            granteeCountRes.Success,
            `Grantee count_only on MJ: Artifact Versions must succeed safely without SQL errors: ${granteeCountRes.ErrorMessage}`,
        );
        AssertEqual(
            granteeCountRes.TotalRowCount,
            0,
            'Grantee count_only LIKE on private child delegated artifact version must return TotalRowCount=0 (no R1 oracle leak)',
        );
        AssertEqual(granteeCountRes.RowCount, 0, 'Grantee count_only RowCount must be 0');

        // Also confirm a plain non-system user runs a filtered simple RunView on MJ: Artifact Versions and receives readable shared rows
        const granteeSharedRes = await RunView.FromMetadataProvider(granteeProvider).RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ArtifactID = '${fx.ParentDocID!}'`,
                Fields: ['ID'],
                ResultType: 'simple',
            },
            granteeProvider.CurrentUser,
        );
        Assert(
            granteeSharedRes.Success && granteeSharedRes.Results.length >= 1,
            `Plain user filtered RunView on shared MJ: Artifact Versions must return readable rows: ${granteeSharedRes.ErrorMessage}`,
        );

        // 2. Owner still observes exact count 1 for the child delegated artifact version
        const ownerCountRes = await typesRv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `Content LIKE '%${probeMarker}%'`,
                ResultType: 'count_only',
            },
            ctx.User,
        );
        Assert(ownerCountRes.Success, `Owner count_only failed: ${ownerCountRes.ErrorMessage}`);
        AssertEqual(ownerCountRes.TotalRowCount, 1, 'Owner count_only must see 1 matching child delegated version');

        // 3. R2: All 3 shipped stored SQL queries execute cleanly without SQL errors (no invalid ca.ArtifactID)
        const rq = new RunQuery(ownerProvider);
        const byIdQueryRes = await rq.RunQuery(
            {
                QueryName: 'GetArtifactVersionsByID',
                CategoryPath: '/MJ/AI/Agents/',
                Parameters: { versionIds: [fx.ParentVerID!] },
            },
            ctx.User,
        );
        Assert(byIdQueryRes.Success, `GetArtifactVersionsByID failed: ${byIdQueryRes.ErrorMessage}`);
        Assert(byIdQueryRes.Results.length >= 1, 'GetArtifactVersionsByID must return readable ParentVerID');

        const dummyConvId = '00000000-0000-4000-8000-000000000000';
        const convCompleteRes = await rq.RunQuery(
            {
                QueryName: 'GetConversationComplete',
                CategoryPath: 'MJ/Conversations',
                Parameters: { ConversationID: dummyConvId },
            },
            ctx.User,
        );
        Assert(convCompleteRes.Success, `GetConversationComplete failed: ${convCompleteRes.ErrorMessage}`);

        const convMapRes = await rq.RunQuery(
            {
                QueryName: 'GetConversationArtifactsMap',
                CategoryPath: 'MJ/Conversations',
                Parameters: { ConversationID: dummyConvId },
            },
            ctx.User,
        );
        Assert(convMapRes.Success, `GetConversationArtifactsMap failed: ${convMapRes.ErrorMessage}`);

        // 4. B5: Non-system RunViews of MJ: Artifact Guest Share Links & MJ: Collection Artifacts stay below SQL Server's 260-table limit
        const guestLinkViewRes = await typesRv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Artifact Guest Share Links',
                Fields: ['ID'],
                MaxRows: 5,
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(
            guestLinkViewRes.Success,
            `Non-system RunView on MJ: Artifact Guest Share Links must succeed without 260-table overflow (B5): ${guestLinkViewRes.ErrorMessage}`,
        );
        const colArtViewRes = await typesRv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Collection Artifacts',
                Fields: ['ID'],
                MaxRows: 5,
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(
            colArtViewRes.Success,
            `Non-system RunView on MJ: Collection Artifacts must succeed without 260-table overflow (B5): ${colArtViewRes.ErrorMessage}`,
        );

        // 5. B3: Grantee calling GetConversationComplete or GetConversationArtifactsForAgent on a conversation
        // anchored to a record they cannot read receives 0 rows
        const convEntity = ownerProvider.EntityByName('MJ: Conversations');
        const userEntity = ownerProvider.EntityByName('MJ: Users');
        if (convEntity && userEntity) {
            const anchoredConv = await ownerProvider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                ctx.User,
            );
            anchoredConv.NewRecord();
            anchoredConv.UserID = ctx.User.ID;
            anchoredConv.Name = `__IT171_AnchoredAclCheck_${Date.now()} (mj-integration-test — safe to delete)`;
            anchoredConv.AnchorType = 'Record';
            anchoredConv.LinkedEntityID = userEntity.ID;
            anchoredConv.LinkedRecordID = ctx.User.ID;
            if (await anchoredConv.Save()) {
                try {
                    const granteeRq = new RunQuery(granteeProvider);
                    const b3CompleteRes = await granteeRq.RunQuery(
                        {
                            QueryName: 'GetConversationComplete',
                            CategoryPath: 'MJ/Conversations',
                            Parameters: { ConversationID: anchoredConv.ID },
                        },
                        granteeProvider.CurrentUser,
                    );
                    Assert(
                        b3CompleteRes.Success,
                        `Grantee GetConversationComplete failed unexpectedly: ${b3CompleteRes.ErrorMessage}`,
                    );
                    AssertEqual(
                        b3CompleteRes.Results.length,
                        0,
                        'Grantee calling GetConversationComplete on an unreadable non-artifact anchored conversation must return 0 rows (B3)',
                    );

                    const b3ForAgentRes = await granteeRq.RunQuery(
                        {
                            QueryName: 'GetConversationArtifactsForAgent',
                            CategoryPath: 'MJ/Conversations',
                            Parameters: { ConversationID: anchoredConv.ID },
                        },
                        granteeProvider.CurrentUser,
                    );
                    Assert(
                        b3ForAgentRes.Success,
                        `Grantee GetConversationArtifactsForAgent failed unexpectedly: ${b3ForAgentRes.ErrorMessage}`,
                    );
                    AssertEqual(
                        b3ForAgentRes.Results.length,
                        0,
                        'Grantee calling GetConversationArtifactsForAgent on an unreadable non-artifact anchored conversation must return 0 rows (N1/B3)',
                    );
                } finally {
                    await anchoredConv.Delete();
                }
            }
        }
    } finally {
        if (childVerId) {
            const v = await ownerProvider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
            if (await v.Load(childVerId)) {
                await v.Delete();
            }
        }
        if (childArtId) {
            const a = await ownerProvider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', ctx.User);
            if (await a.Load(childArtId)) {
                await a.Delete();
            }
        }
    }
}

export const DocsSlidesSheetsLibraryClientChecks: NamedCheck[] = [
    {
        Id: 'docs-slides-sheets-library-client.DSLC1',
        Name: 'DSLC1: MJ: Artifact Working States is excluded from the GraphQL schema and unreachable via query or mutation',
        Fn: checkDslc1WorkingStateUnreachableOverGraphQL,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC2',
        Name: 'DSLC2: a restricted read-only user Save() on MJ: Artifact Versions is refused through the GraphQL API',
        Fn: checkDslc2RestrictedUserVersionSaveRefusedOverApi,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC3',
        Name: 'DSLC3: MintArtifactCollaborationTicket + WebSocket upgrade to /collaboration/yjs succeeds and rejects a read-only peer write',
        Fn: checkDslc3TicketMintSocketUpgradeAndReadOnlyRejection,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC4',
        Name: 'DSLC4: ExecuteDocumentLiveBlock denies EntityView and Artifact blocks when the caller lacks read access',
        Fn: checkDslc4LiveBlockDeniedWithoutReadAccess,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC5',
        Name: 'DSLC5: all 5 Artifact.* Remote Operations over GraphQL wire (EvaluateAiFormula, SynthesizeFromSources, LogComplianceAudit, GuestShare Create/Revoke via Magic Link)',
        Fn: checkDslc5ArtifactRemoteOperations,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC6',
        Name: 'DSLC6: NW-1 Magic Link resource-share /magic-link/redeem + ResolveGuestArtifactSnapshot, DriverClass & FrozenProvenance, Component & Live block gates, and immediate revocation',
        Fn: checkDslc6PublicGuestSharePreAuthAndFrozenGate,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC7',
        Name: 'DSLC7: DocumentCollaborationResolver wire endpoints (VerifyFrozenBlockSnapshot, ExecuteAnchoredCommentAgentMention, CommitArtifactInlineEdit, RestoreArtifactVersion) + ArtifactFileDownloadUrl',
        Fn: checkDslc7CollaborationResolverAndFileDownloadUrl,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC8',
        Name: 'DSLC8: WebSocket Yjs server meta-map tamper rejection and <!-- mj-lock --> protected-heading non-owner write rejection',
        Fn: checkDslc8WebSocketMetaAndLockRejection,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC9',
        Name: 'DSLC9: API-key scope enforcement (artifact:read, artifact:edit, artifact:share) over GraphQL independent of artifact ownership',
        Fn: checkDslc9ArtifactApiKeyScopeEnforcement,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC10',
        Name: 'DSLC10: ClientClauseScreen (AssertUnscopedRead) blocks direct base-view subqueries on protected artifact/collection entities (P0-R1)',
        Fn: checkDslc10ClientClauseScreenProtectedSubqueries,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC11',
        Name: 'DSLC11: MJ: Collections (P0-R2) unauthorized read, count_only, update, delete, child-reparent, and artifact-link rejection',
        Fn: checkDslc11CollectionUnauthorizedReadWriteRejection,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC12',
        Name: 'DSLC12: StartRealtimeClientSession cross-user conversationId IDOR rejection (P1-5)',
        Fn: checkDslc12StartRealtimeSessionConversationIdor,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC13',
        Name: 'DSLC13: Default-off magicLink.artifactGuestSharing.enabled refuses CreateGuestShareLink and leaves /magic-link/redeem unmounted (B4)',
        Fn: checkDslc13GuestShareDisabledRefusal,
    },
    {
        Id: 'docs-slides-sheets-library-client.DSLC14',
        Name: 'DSLC14: Child delegated artifact count_only blocks LIKE oracle for non-owners and all 3 shipped artifact/conversation stored queries execute cleanly (R1, R2)',
        Fn: checkDslc14ChildDelegateCountOracleAndStoredQueries,
    },
];

for (const c of DocsSlidesSheetsLibraryClientChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
