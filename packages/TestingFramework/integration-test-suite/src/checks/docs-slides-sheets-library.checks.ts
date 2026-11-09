/**
 * @fileoverview Integration check bundle `'docs-slides-sheets-library'` (IT164) — verifies the
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

import { RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
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
} from '@memberjunction/core-entities';
import { ArtifactToolResult, BaseArtifactToolLibrary } from '@memberjunction/ai-core-plus';
import {
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
    NamedCheck,
    SkipCheck,
} from '@memberjunction/testing-integration';

// Ensure side-effect @RegisterClass registrations are active when this bundle is imported
LoadArtifactPermissionDelegates();
LoadDocumentLiveBlocks();
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
    // 1. MJ: Artifact Working States entity & FK metadata
    const workingStatesEnt = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Artifact Working States');
    Assert(workingStatesEnt !== undefined, 'Entity "MJ: Artifact Working States" must exist in Provider.Entities');
    AssertEqual(workingStatesEnt!.BaseTable, 'ArtifactWorkingState', 'MJ: Artifact Working States BaseTable');
    AssertEqual(workingStatesEnt!.BaseView, 'vwArtifactWorkingStates', 'MJ: Artifact Working States BaseView');

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

    // 4. Library & Chat application wiring
    const appsRes = await rv.RunView<MJApplicationEntityType>(
        {
            EntityName: 'MJ: Applications',
            ExtraFilter: "ID IN ('EB07016C-AE35-4EF9-804B-91563529A08A', '7A873E1A-692E-43FA-97F8-57D8161A985C')",
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(appsRes.Success, `RunView on MJ: Applications failed: ${appsRes.ErrorMessage}`);

    const libraryApp = appsRes.Results.find((a) => UUIDsEqual(a.ID, 'EB07016C-AE35-4EF9-804B-91563529A08A'));
    Assert(libraryApp !== undefined, 'Library application (EB07016C-AE35-4EF9-804B-91563529A08A) must exist');
    AssertEqual(libraryApp!.Name, 'Library', 'Library application Name');
    AssertEqual(libraryApp!.NavigationStyle, 'Both', 'Library NavigationStyle');
    AssertEqual(libraryApp!.TopNavLocation, 'Left of User Menu', 'Library TopNavLocation');
    const libraryNav = parseNavItems(libraryApp!.DefaultNavItems);
    Assert(
        libraryNav.some((item) => item.DriverClass === 'LibraryResource'),
        'Library DefaultNavItems must register LibraryResource',
    );

    const chatApp = appsRes.Results.find((a) => UUIDsEqual(a.ID, '7A873E1A-692E-43FA-97F8-57D8161A985C'));
    Assert(chatApp !== undefined, 'Chat application (7A873E1A-692E-43FA-97F8-57D8161A985C) must exist');
    const chatNav = parseNavItems(chatApp!.DefaultNavItems);
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

    let foundLower: Set<string> | null = null;
    if (ctx.Pool) {
        const result = await ctx.Pool.request().query<{ name: string }>(`
            SELECT o.name
              FROM sys.objects o
              JOIN sys.schemas s ON o.schema_id = s.schema_id
             WHERE s.name = '${ctx.Schema}'
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
                  WHERE nsp.nspname = '${ctx.Schema}'
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
            `Constraint "${name}" must exist in schema ${ctx.Schema}`,
        );
    }

    const rv = RunView.FromMetadataProvider(ctx.Provider);
    for (const entityName of [
        'MJ: Artifact Working States',
        'MJ: Artifacts',
        'MJ: Artifact Versions',
        'MJ: Artifact Permissions',
        'MJ: Collections',
    ]) {
        const [simpleRes, countRes] = await Promise.all([
            rv.RunView<{ ID: string }>(
                { EntityName: entityName, MaxRows: 3, ResultType: 'simple' },
                ctx.User,
            ),
            rv.RunView<{ ID: string }>(
                { EntityName: entityName, ResultType: 'count_only' },
                ctx.User,
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
        invalidDelegated.Name = `__IT164_InvalidDelegate_${suffix}`;
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
        parentDoc.Name = `__IT164_ParentDoc_${suffix}`;
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

        // 3. Create MJArtifactWorkingStateEntity with binary Yjs state (base64) and verify 1:1 UQ constraint
        const sampleYjsBytes = Buffer.from([0x01, 0x03, 0x79, 0x6a, 0x73, 0x2d, 0x63, 0x72, 0x64, 0x74]);
        const expectedBase64 = sampleYjsBytes.toString('base64');

        workingState = await ctx.Provider.GetEntityObject<MJArtifactWorkingStateEntity>(
            'MJ: Artifact Working States',
            ctx.User,
        );
        workingState.NewRecord();
        workingState.ArtifactID = parentDoc.ID;
        workingState.YjsState = expectedBase64;
        workingState.LastModifiedByUserID = ctx.User.ID;
        Assert(
            await workingState.Save(),
            `Failed to save MJArtifactWorkingStateEntity: ${workingState.LatestResult?.CompleteMessage ?? ''}`,
        );

        // Reload via RunView to verify VARBINARY round-trip and virtual view columns
        const reloadedWsRes = await rv.RunView<{
            ID: string;
            ArtifactID: string;
            YjsState: string | Buffer | null;
            Artifact: string;
        }>(
            {
                EntityName: 'MJ: Artifact Working States',
                ExtraFilter: `ID = '${workingState.ID}'`,
                ResultType: 'simple',
            },
            ctx.User,
        );
        Assert(reloadedWsRes.Success && reloadedWsRes.Results.length === 1, 'Working state row must reload via RunView');
        AssertEqual(reloadedWsRes.Results[0].Artifact, parentDoc.Name, 'Virtual Artifact column on vwArtifactWorkingStates');

        // Duplicate working state for the same ArtifactID must fail UQ_ArtifactWorkingState_ArtifactID
        const duplicateWs = await ctx.Provider.GetEntityObject<MJArtifactWorkingStateEntity>(
            'MJ: Artifact Working States',
            ctx.User,
        );
        duplicateWs.NewRecord();
        duplicateWs.ArtifactID = parentDoc.ID;
        duplicateWs.YjsState = expectedBase64;
        const dupSaved = await duplicateWs.Save();
        Assert(!dupSaved, 'UQ_ArtifactWorkingState_ArtifactID must reject a second working state for the same ArtifactID');

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
        childWhiteboard.Name = `__IT164_ChildWhiteboard_${suffix}`;
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

        // Unshared outsider (with valid entity-level roles) is denied on childWhiteboard via parent delegation
        const outsider = new UserInfo(ctx.Provider, {
            ID: '00000000-0000-0000-0000-000000000099',
            Name: 'Unshared Outsider',
            Email: 'outsider-it164@example.invalid',
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

        // If a second active user exists in MJ: Users, grant Read-Only on parentDoc and verify cascade to childWhiteboard
        const otherUsersRes = await rv.RunView<MJUserEntityType>(
            {
                EntityName: 'MJ: Users',
                ExtraFilter: `ID <> '${ctx.User.ID}' AND IsActive = 1`,
                MaxRows: 1,
                ResultType: 'simple',
            },
            ctx.User,
        );
        if (otherUsersRes.Success && otherUsersRes.Results.length > 0 && otherUsersRes.Results[0].ID) {
            const peerRow = otherUsersRes.Results[0];
            const peerUser = new UserInfo(ctx.Provider, {
                ID: peerRow.ID!,
                Name: peerRow.Name ?? 'Peer User',
                Email: peerRow.Email ?? 'peer@example.invalid',
                IsActive: true,
                UserRoles: ctx.User.UserRoles,
            });

            sharedPerm = await ctx.Provider.GetEntityObject<MJArtifactPermissionEntity>(
                'MJ: Artifact Permissions',
                ctx.User,
            );
            sharedPerm.NewRecord();
            sharedPerm.ArtifactID = parentDoc.ID;
            sharedPerm.UserID = peerUser.ID;
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
                peerUser,
            );
            AssertEqual(cascadedPeerPerms.CanRead, true, 'Parent Read share must cascade CanRead=true to child OLE artifact');
            AssertEqual(cascadedPeerPerms.CanEdit, false, 'Parent Read-only share must keep CanEdit=false on child OLE artifact');
            AssertEqual(cascadedPeerPerms.Source, 'Delegate', 'Cascaded child permission Source must be Delegate');
        }
    } finally {
        if (sharedPerm?.IsSaved) {
            await sharedPerm.Delete();
        }
        if (childWhiteboard?.IsSaved) {
            await childWhiteboard.Delete();
        }
        if (workingState?.IsSaved) {
            await workingState.Delete();
        }
        if (parentVer?.IsSaved) {
            await parentVer.Delete();
        }
        if (parentDoc?.IsSaved) {
            await parentDoc.Delete();
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
        BlockID: 'blk-it164-artifact-types',
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
    const wb = engine.CreateEmptyWorkbook('IT164 Financial Model', ['Model', 'Rates'], 20, 8);
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
        TableID: 'tbl-it164-types',
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
    Assert(tableRes['tbl-it164-types']?.Success === true, 'LiveTable against MJ: Artifact Types must succeed');
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
