/**
 * @fileoverview Integration check bundle `'docs-slides-sheets-library'` (IT169) and client companion
 * `'docs-slides-sheets-library-client'` (IT170) — verifies the
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
 */

import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
    ArtifactPermissionEngine,
    BaseArtifactPermissionDelegate,
    BaseDocumentBlock,
    DocumentBlockExecutionResult,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    LoadArtifactPermissionDelegates,
    LoadDocumentLiveBlocks,
    MJApplicationEntityType,
    MJArtifactEntity,
    MJArtifactPermissionEntity,
    MJArtifactTypeEntityType,
    MJArtifactVersionEntity,
    MJArtifactWorkingStateEntity,
    MJUserEntityType,
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
    const workingStatesEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Artifact Working States');
    Assert(workingStatesEnt !== undefined, 'Entity "MJ: Artifact Working States" must exist in Provider.Entities');
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
    const artifactsEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Artifacts');
    Assert(artifactsEnt !== undefined, 'Entity "MJ: Artifacts" must exist in Provider.Entities');
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
        chatNav.some((item) => item.Label === 'Collections' && item.DriverClass === 'ChatCollectionsResource'),
        'Chat DefaultNavItems must include "Collections" backed by ChatCollectionsResource',
    );
    Assert(
        chatNav.some((item) => item.Label === 'Agent Activity' && item.DriverClass === 'ChatTasksResource'),
        'Chat DefaultNavItems must include "Agent Activity" backed by ChatTasksResource',
    );
    Assert(
        !chatNav.some((item) => item.Label === 'Tasks'),
        'Chat DefaultNavItems must not use the ambiguous legacy "Tasks" label',
    );
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

    const artifactsEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Artifacts');
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
        invalidDelegated.Name = `__IT169_InvalidDelegate_${suffix}`;
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
        parentDoc.Name = `__IT169_ParentDoc_${suffix}`;
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

        const reloadedWsRes = await rv.RunView<Record<string, unknown> & {
            ID: string;
            ArtifactID: string;
            YjsState: string | Buffer | null;
            Artifact: string | null;
        }>(
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

        // Duplicate working state for the same ArtifactID must fail UQ_ArtifactWorkingState_ArtifactID
        const duplicateWs = await ctx.Provider.GetEntityObject<MJArtifactWorkingStateEntity>(
            'MJ: Artifact Working States',
            systemUser,
        );
        duplicateWs.NewRecord();
        duplicateWs.ArtifactID = parentDoc.ID;
        duplicateWs.YjsState = expectedBase64;
        const dupSaved = await duplicateWs.Save();
        Assert(!dupSaved, 'UQ_ArtifactWorkingState_ArtifactID must reject a second working state for the same ArtifactID');

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
        childWhiteboard.Name = `__IT169_ChildWhiteboard_${suffix}`;
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
        const outsider = new UserInfo(ctx.Provider, {
            ID: peerRow.ID!,
            Name: peerRow.Name ?? 'Unshared Outsider',
            Email: peerRow.Email ?? 'it-artifact-viewer@integration.test',
            IsActive: true,
            UserRoles: ctx.User.UserRoles,
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
                        `[IT169 DSL3 teardown] Delete() returned false for ${label}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
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
    const wb = engine.CreateEmptyWorkbook('IT169 Financial Model', ['Model', 'Rates'], 20, 8);
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
        true,
    );
    AssertEqual(sumCell.ComputedValue, 3000, 'Initial =SUM(B2:B3) ComputedValue');
    Assert(Boolean(sumCell.FormulaStable?.includes('@RANGE(')), 'FormulaStable must encode @RANGE stable IDs');

    // Insert 1 row at top and 1 column at left -> B4 shifts to C5 with =SUM(C3:C4)
    engine.InsertRows(wb, modelSheet.SheetID, 1, 1);
    engine.InsertColumns(wb, modelSheet.SheetID, 1, 1);
    const shifted = modelSheet.Cells['C5'];
    Assert(shifted !== undefined, 'Shifted sum cell must reside at C5');
    AssertEqual(shifted!.Formula, '=SUM(C3:C4)', 'Formula coordinates must shift to =SUM(C3:C4)');
    AssertEqual(shifted!.ComputedValue, 3000, 'Shifted sum cell ComputedValue must remain 3000');

    // Cycle detection
    engine.SetCell(wb, modelSheet.SheetID, 'F2', { Formula: '=F3 + 1' }, false);
    engine.SetCell(wb, modelSheet.SheetID, 'F3', { Formula: '=F2 + 1' }, true);
    AssertEqual(modelSheet.Cells['F2'].ComputedValue, '#CYCLE!', 'Mutual cell cycle must evaluate to #CYCLE!');

    // Clear cycle cells before .xlsx export round-trip
    engine.SetCell(wb, modelSheet.SheetID, 'F2', { Value: null }, false);
    engine.SetCell(wb, modelSheet.SheetID, 'F3', { Value: null }, true);

    // 2. OpenXML .xlsx lossless export + import round-trip
    const xlsxBytes = engine.ExportToXlsxBytes(wb);
    AssertEqual(xlsxBytes[0], 0x50, '.xlsx ZIP header byte 0 ("P")');
    AssertEqual(xlsxBytes[1], 0x4b, '.xlsx ZIP header byte 1 ("K")');

    const reimported = engine.ImportFromXlsxBytes(xlsxBytes);
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

export const DocsSlidesSheetsLibraryChecks: NamedCheck[] = [
    {
        Id: 'docs-slides-sheets-library.DSL1',
        Name: 'DSL1: metadata coherence across MJ: Artifact Working States, polymorphic DelegateRecordID, Artifact Types, and Library/Chat app wiring',
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
];

for (const c of DocsSlidesSheetsLibraryChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}

// ─── IT170: Client-transport wire checks (DSLC1–DSLC4) ───────────────────────

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

async function executeGqlExpectingError(
    provider: GraphQLDataProvider,
    query: string,
    variables?: Record<string, unknown>,
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
                'IT170 DSL client grantee (mj-integration-test)',
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
            parentDoc.Name = `__IT170_SharedDoc_${suffix} (mj-integration-test — safe to delete)`;
            parentDoc.TypeID = docTypeId;
            parentDoc.UserID = ctx.User.ID;
            parentDoc.Visibility = 'Always';
            if (!(await parentDoc.Save())) {
                throw new Error(`Failed to create shared parentDoc: ${parentDoc.LatestResult?.CompleteMessage ?? ''}`);
            }
            dslClientFixture.ParentDocID = parentDoc.ID;

            const initialContent = `# IT170 Shared Strategy Document ${suffix}\n\nOwner baseline content.`;
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
            privateDoc.Name = `__IT170_PrivateDoc_${suffix} (mj-integration-test — safe to delete)`;
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
            privateVer.Content = `# IT170 Private Document ${suffix}\n\nConfidential owner content.`;
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
    const wsEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Artifact Working States');
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

    // 4. Reusing the same single-use ticket on a second WebSocket connection must be rejected immediately before opening (HTTP 401 pre-handshake -> CloseEvent 1006 + error, or 1008 Policy Violation; never open or pass on timeout)
    const replayOutcome = await new Promise<{
        opened: boolean;
        hadError: boolean;
        closedCode: number;
        timedOut: boolean;
    }>((resolve) => {
        const replaySocket = new WebSocket(wsUrl);
        let opened = false;
        let hadError = false;
        const timer = setTimeout(() => {
            try {
                replaySocket.close();
            } catch {
                // ignore
            }
            resolve({ opened, hadError, closedCode: 0, timedOut: true });
        }, 5_000);
        replaySocket.addEventListener('open', () => {
            opened = true;
        });
        replaySocket.addEventListener('close', (ev: CloseEvent) => {
            clearTimeout(timer);
            resolve({ opened, hadError, closedCode: ev.code, timedOut: false });
        });
        replaySocket.addEventListener('error', () => {
            hadError = true;
        });
    });
    Assert(
        !replayOutcome.timedOut &&
            !replayOutcome.opened &&
            (replayOutcome.closedCode === 1008 || (replayOutcome.closedCode === 1006 && replayOutcome.hadError)),
        `Replaying a consumed single-use collaboration ticket must be rejected without opening or timing out (got opened=${replayOutcome.opened}, hadError=${replayOutcome.hadError}, code=${replayOutcome.closedCode}, timedOut=${replayOutcome.timedOut})`,
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
];

for (const c of DocsSlidesSheetsLibraryClientChecks) {
    IntegrationCheckRegistry.Instance.Register(c);
}
