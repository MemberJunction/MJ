/**
 * work-bus-core.checks.ts — the 'work-bus-core' bundle (WBC1–WBC10): deterministic integration
 * checks for MJ 6.3's Work Bus & Software Factory core layers against the real database, with
 * zero LLM calls and zero Open App dependency.
 *
 * What it proves:
 *   - WBC1: MJ: Conversation Types & virtual Conversation.Type (read/filter parity + Chat/Comment defaults + AutoEnsureOnSave)
 *   - WBC2: Type-row ExtensionEntity save validation rejects non-existent or non-IS-A-child entities
 *   - WBC3: 2-level IS-A chain save (FieldSuggestion -> Comment -> Conversation), promotion from unextended comment, and OnSubtypeChange='Refuse'
 *   - WBC4: Entity opt-in gate (Configuration.Comments.AllowedCommentTypes) blocks Field Suggestions on non-opted-in entities
 *   - WBC5: Newer open Field Suggestion on the same field automatically supersedes the older one
 *   - WBC6: AcceptFieldSuggestion applies SuggestedValue as the accepting user, audits/persists, and refuses unauthorized users
 *   - WBC7: RejectFieldSuggestion stamps Outcome='Rejected' without modifying the target record
 *   - WBC8: FieldSuggestionPostSaveHook (PostSaveHook -> OnRecordChanged) automatically supersedes pending suggestions when the target field is edited directly
 *   - WBC9: AnchoredConversationPostRunViewHook enforces read security across MJ: Comments and MJ: Field Suggestions IS-A views
 *   - WBC10: Shared Always-On Agent Layer — AgentWakeTriggerService.TriggerWakeForWorkstream coalescing + Schedule Next Agent Wake gate alias normalization
 */
import { CompositeKey, RunView } from '@memberjunction/core';
import type { EntityInfo, IEntityConfiguration, UserInfo } from '@memberjunction/core';
import {
    COMMENT_TYPE_CODES,
    CONVERSATION_TYPE_CODES,
    ConversationEngine,
    MJCommentEntity,
    MJCommentTypeEntity,
    MJConversationEntity,
    MJConversationTypeEntity,
    MJEntityEntity,
    MJFieldSuggestionEntity,
    MJListEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import {
    EnsureAnchoredConversationReadHookRegistered,
    EnsureFieldSuggestionPostSaveHookRegistered,
} from '@memberjunction/core-entities-server';
import { ActionEngineServer } from '@memberjunction/actions';
import { ActionParam, ActionResult, RunActionParams } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentWakeTriggerService } from '@memberjunction/ai-agents';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    SEEDED_NOGRANT_EMAIL,
    findUserByEmail,
} from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

const BUNDLE = 'work-bus-core';
const FIXTURE_TAG = '(mj-integration-test work-bus-core — safe to delete)';
const OPTED_IN_ENTITY_NAME = 'MJ: Lists';
const NON_OPTED_IN_ENTITY_NAME = 'MJ: List Categories';

interface WorkBusCoreFixture {
    ListsEntityID: string;
    OriginalListsConfig: string | null;
    ListsConfigMutated: boolean;
    FixtureListID: string;
    ChiefOfStaffAgentID: string;
    NoGrantUser: UserInfo | null;
    CreatedConversationIDs: string[];
    CreatedRoutineIDs: string[];
    CreatedActionLogIDs: string[];
    CreatedExtraListIDs: string[];
}

let fixture: WorkBusCoreFixture | null = null;

function fx(): WorkBusCoreFixture {
    Assert(fixture != null, 'work-bus-core fixture missing (bundle Setup did not run)');
    return fixture!;
}

function errorSources(result: { Errors: Array<{ Source: string }> }): string[] {
    return result.Errors.map((e) => e.Source);
}

function liveEntityInfo(ctx: IntegrationCheckContext, name: string): EntityInfo {
    const info = ctx.Provider.EntityByName(name);
    Assert(info != null, `Entity '${name}' not found in provider metadata`);
    return info!;
}

function inputParam(name: string, value: unknown): ActionParam {
    return { Name: name, Type: 'Input', Value: value } as ActionParam;
}

async function runCoreAction(
    actionName: string,
    user: UserInfo,
    params: ActionParam[]
): Promise<ActionResult> {
    const action = ActionEngineServer.Instance.Actions.find(
        (a) => a.Name === actionName && a.Status === 'Active'
    );
    Assert(!!action, `Need active action '${actionName}'`);
    const runParams = new RunActionParams();
    runParams.Action = action!;
    runParams.ContextUser = user;
    runParams.Params = params;
    runParams.Filters = [];
    const result = await ActionEngineServer.Instance.RunAction(runParams);
    if (result.LogEntry?.ID) {
        fx().CreatedActionLogIDs.push(result.LogEntry.ID);
    }
    return result;
}

async function createSuggestion(
    ctx: IntegrationCheckContext,
    anchorKey: string,
    suggestedValue: string,
    label: string
): Promise<MJFieldSuggestionEntity> {
    const suggestion = await ctx.Provider.GetEntityObject<MJFieldSuggestionEntity>(
        'MJ: Field Suggestions',
        ctx.User
    );
    suggestion.NewRecord();
    suggestion.Name = `${label} ${FIXTURE_TAG}`;
    suggestion.UserID = ctx.User.ID;
    suggestion.LinkedEntityID = fx().ListsEntityID;
    suggestion.LinkedRecordID = fx().FixtureListID;
    suggestion.AnchorType = 'Field';
    suggestion.AnchorKey = anchorKey;
    suggestion.AnchorMetadata = JSON.stringify({
        fieldName: anchorKey,
        anchorDisplayName: anchorKey,
    });
    suggestion.SuggestedValue = suggestedValue;
    suggestion.Source = 'LLM';
    suggestion.Confidence = 0.92;
    const saved = await suggestion.Save();
    Assert(
        saved,
        `Saving MJ: Field Suggestions (${label}) failed: ${suggestion.LatestResult?.CompleteMessage ?? ''}`
    );
    fx().CreatedConversationIDs.push(suggestion.ID);
    return suggestion;
}

export const WorkBusCoreChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.WBC1`,
        Name: 'WBC1: MJ: Conversation Types seeds all 5 canonical types, virtual Conversation.Type filters on RunView, and anchored conversations AutoEnsureOnSave an MJ: Comments row',
        Fn: async (ctx) => {
            await ConversationEngine.Instance.Config(false, ctx.User, ctx.Provider);

            for (const code of [
                CONVERSATION_TYPE_CODES.CHAT,
                CONVERSATION_TYPE_CODES.SKIP,
                CONVERSATION_TYPE_CODES.ROUTINE,
                CONVERSATION_TYPE_CODES.MEETING_ROOM,
                CONVERSATION_TYPE_CODES.COMMENT,
            ]) {
                const ct = ConversationEngine.Instance.TypeByCode(code);
                Assert(ct != null, `Expected MJ: Conversation Types row for code '${code}'`);
            }
            for (const code of [
                COMMENT_TYPE_CODES.COMMENT,
                COMMENT_TYPE_CODES.FIELD_SUGGESTION,
            ]) {
                const cmtType = ConversationEngine.Instance.CommentTypeByCode(code);
                Assert(cmtType != null, `Expected MJ: Comment Types row for code '${code}'`);
            }

            const skipType = ConversationEngine.Instance.TypeByCode(CONVERSATION_TYPE_CODES.SKIP)!;
            const skipConv = await ctx.Provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                ctx.User
            );
            skipConv.NewRecord();
            skipConv.Name = `WBC1 Skip ${FIXTURE_TAG}`;
            skipConv.UserID = ctx.User.ID;
            skipConv.TypeID = skipType.ID;
            Assert(
                await skipConv.Save(),
                `Saving Skip conversation failed: ${skipConv.LatestResult?.CompleteMessage ?? ''}`
            );
            fx().CreatedConversationIDs.push(skipConv.ID);
            AssertEqual(skipConv.Type, 'Skip', 'Virtual Type column must read back as Skip');

            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const skipLookup = await rv.RunView<{ ID: string; Type: string }>(
                {
                    EntityName: 'MJ: Conversations',
                    ExtraFilter: `ID='${skipConv.ID}' AND Type='Skip'`,
                    Fields: ['ID', 'Type'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User
            );
            Assert(skipLookup.Success, `RunView filter on virtual Type failed: ${skipLookup.ErrorMessage}`);
            AssertEqual(skipLookup.Results.length, 1, 'Virtual Type filter must match the saved Skip conversation');

            // Unanchored conversation with omitted TypeID defaults to Chat
            const defaultChat = await ctx.Provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                ctx.User
            );
            defaultChat.NewRecord();
            defaultChat.Name = `WBC1 Default Chat ${FIXTURE_TAG}`;
            defaultChat.UserID = ctx.User.ID;
            Assert(
                await defaultChat.Save(),
                `Saving default Chat conversation failed: ${defaultChat.LatestResult?.CompleteMessage ?? ''}`
            );
            fx().CreatedConversationIDs.push(defaultChat.ID);
            AssertEqual(defaultChat.Type, 'Chat', 'Unanchored conversation with omitted TypeID must default to Chat');

            // Anchored conversation with omitted TypeID defaults to Comment and AutoEnsureOnSave creates MJ: Comments
            const anchored = await ctx.Provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                ctx.User
            );
            anchored.NewRecord();
            anchored.Name = `WBC1 Anchored Note ${FIXTURE_TAG}`;
            anchored.UserID = ctx.User.ID;
            anchored.LinkedEntityID = fx().ListsEntityID;
            anchored.LinkedRecordID = fx().FixtureListID;
            anchored.AnchorType = 'Record';
            Assert(
                await anchored.Save(),
                `Saving anchored conversation failed: ${anchored.LatestResult?.CompleteMessage ?? ''}`
            );
            fx().CreatedConversationIDs.push(anchored.ID);
            AssertEqual(anchored.Type, 'Comment', 'Anchored conversation with omitted TypeID must default to Comment');

            const commentRow = await ctx.Provider.GetEntityObject<MJCommentEntity>(
                'MJ: Comments',
                ctx.User
            );
            Assert(
                await commentRow.Load(anchored.ID),
                'AutoEnsureOnSave on MJ: Conversations must create the MJ: Comments child row in the same transaction'
            );
        },
    },
    {
        Id: `${BUNDLE}.WBC2`,
        Name: 'WBC2: Type-row ExtensionEntity validation rejects missing or non-IS-A-child entities and accepts valid IS-A children',
        Fn: async (ctx) => {
            const unknownExt = await ctx.Provider.GetEntityObject<MJConversationTypeEntity>(
                'MJ: Conversation Types',
                ctx.User
            );
            unknownExt.NewRecord();
            unknownExt.Name = `Invalid Unknown ${FIXTURE_TAG}`;
            unknownExt.Code = 'IT_WBC2_UNKNOWN';
            unknownExt.ExtensionEntity = 'MJ: Definitely Not An Entity';
            const unknownErrors = errorSources(unknownExt.Validate());
            Assert(
                unknownErrors.includes('ExtensionEntity'),
                `Expected ExtensionEntity validation error for unknown entity, got [${unknownErrors.join(', ')}]`
            );

            const nonChildExt = await ctx.Provider.GetEntityObject<MJConversationTypeEntity>(
                'MJ: Conversation Types',
                ctx.User
            );
            nonChildExt.NewRecord();
            nonChildExt.Name = `Invalid NonChild ${FIXTURE_TAG}`;
            nonChildExt.Code = 'IT_WBC2_NONCHILD';
            nonChildExt.ExtensionEntity = OPTED_IN_ENTITY_NAME;
            const nonChildErrors = errorSources(nonChildExt.Validate());
            Assert(
                nonChildErrors.includes('ExtensionEntity'),
                `Expected ExtensionEntity validation error when naming '${OPTED_IN_ENTITY_NAME}' (not an IS-A child of MJ: Conversations), got [${nonChildErrors.join(', ')}]`
            );

            const validCommentType = await ctx.Provider.GetEntityObject<MJCommentTypeEntity>(
                'MJ: Comment Types',
                ctx.User
            );
            validCommentType.NewRecord();
            validCommentType.Name = `Valid Field Suggestion Alias ${FIXTURE_TAG}`;
            validCommentType.Code = 'IT_WBC2_VALID';
            validCommentType.ExtensionEntity = 'MJ: Field Suggestions';
            const validErrors = errorSources(validCommentType.Validate());
            Assert(
                !validErrors.includes('ExtensionEntity'),
                `Valid IS-A child 'MJ: Field Suggestions' must pass ExtensionEntity validation, got [${validErrors.join(', ')}]`
            );
        },
    },
    {
        Id: `${BUNDLE}.WBC3`,
        Name: 'WBC3: 2-level IS-A chain save writes FieldSuggestion -> Comment -> Conversation under one UUID, allows null->extension promotion, and refuses extension->null demotion under OnSubtypeChange=Refuse',
        Fn: async (ctx) => {
            const suggestion = await createSuggestion(
                ctx,
                'Description',
                'WBC3 initial suggested description',
                'WBC3 Chain'
            );

            // Verify all three IS-A levels exist under the exact same primary key
            const conv = await ctx.Provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                ctx.User
            );
            Assert(await conv.Load(suggestion.ID), 'Root MJ: Conversations row must exist for saved FieldSuggestion');
            AssertEqual(conv.Type, 'Comment', 'Root Conversation.Type must be Comment');

            const comment = await ctx.Provider.GetEntityObject<MJCommentEntity>(
                'MJ: Comments',
                ctx.User
            );
            Assert(await comment.Load(suggestion.ID), 'Middle MJ: Comments row must exist for saved FieldSuggestion');
            Assert(
                comment.ISAChild != null && comment.ISAChild.EntityInfo.Name === 'MJ: Field Suggestions',
                'Loading MJ: Comments must discover its MJ: Field Suggestions IS-A child'
            );

            // Attempt to change the saved FieldSuggestion comment's CommentTypeID back to plain COMMENT (ExtensionEntity = null):
            // under OnSubtypeChange = 'Refuse' (default), moving away from an existing extension child is refused
            const plainCommentType = ConversationEngine.Instance.CommentTypeByCode(
                COMMENT_TYPE_CODES.COMMENT
            )!;
            comment.CommentTypeID = plainCommentType.ID;
            const demoteSaved = await comment.Save();
            Assert(
                !demoteSaved,
                'Changing a saved MJ: Comments record from FIELD_SUGGESTION to plain COMMENT must be refused under OnSubtypeChange=Refuse'
            );

            // Moving from a plain comment (no extension child) to FIELD_SUGGESTION IS allowed, provided required child fields are populated
            const plainConv = await ctx.Provider.GetEntityObject<MJConversationEntity>(
                'MJ: Conversations',
                ctx.User
            );
            plainConv.NewRecord();
            plainConv.Name = `WBC3 Promote ${FIXTURE_TAG}`;
            plainConv.UserID = ctx.User.ID;
            plainConv.LinkedEntityID = fx().ListsEntityID;
            plainConv.LinkedRecordID = fx().FixtureListID;
            plainConv.AnchorType = 'Field';
            plainConv.AnchorKey = 'Name';
            Assert(await plainConv.Save(), `Plain comment save failed: ${plainConv.LatestResult?.CompleteMessage ?? ''}`);
            fx().CreatedConversationIDs.push(plainConv.ID);

            const promoteComment = await ctx.Provider.GetEntityObject<MJCommentEntity>(
                'MJ: Comments',
                ctx.User
            );
            Assert(await promoteComment.Load(plainConv.ID), 'Plain comment row must load');
            const fsType = ConversationEngine.Instance.CommentTypeByCode(
                COMMENT_TYPE_CODES.FIELD_SUGGESTION
            )!;
            promoteComment.CommentTypeID = fsType.ID;
            const attachedChild = (await promoteComment.ReconcileISAChild()) as MJFieldSuggestionEntity | null;
            Assert(attachedChild != null, 'ReconcileISAChild must attach MJ: Field Suggestions on promotion');
            attachedChild!.SuggestedValue = `Promoted List Name ${FIXTURE_TAG}`;
            attachedChild!.Source = 'Agent';
            Assert(
                await promoteComment.Save(),
                `Promoting unextended comment to Field Suggestion must succeed: ${promoteComment.LatestResult?.CompleteMessage ?? ''}`
            );
        },
    },
    {
        Id: `${BUNDLE}.WBC4`,
        Name: 'WBC4: Entity opt-in gate refuses Field Suggestions on entities whose Configuration.Comments.AllowedCommentTypes excludes FIELD_SUGGESTION',
        Fn: async (ctx) => {
            const nonOptedIn = liveEntityInfo(ctx, NON_OPTED_IN_ENTITY_NAME);
            Assert(
                !nonOptedIn.IsCommentTypeAllowed(COMMENT_TYPE_CODES.FIELD_SUGGESTION, 'Field Suggestion'),
                `Precondition: '${NON_OPTED_IN_ENTITY_NAME}' must not opt into FIELD_SUGGESTION by default`
            );

            const rejected = await ctx.Provider.GetEntityObject<MJFieldSuggestionEntity>(
                'MJ: Field Suggestions',
                ctx.User
            );
            rejected.NewRecord();
            rejected.Name = `WBC4 Blocked ${FIXTURE_TAG}`;
            rejected.UserID = ctx.User.ID;
            rejected.LinkedEntityID = nonOptedIn.ID;
            rejected.LinkedRecordID = '00000000-0000-0000-0000-000000000001';
            rejected.AnchorType = 'Field';
            rejected.AnchorKey = 'Name';
            rejected.SuggestedValue = 'Should not save';
            rejected.Source = 'LLM';

            const saved = await rejected.Save();
            if (saved) {
                fx().CreatedConversationIDs.push(rejected.ID);
            }
            Assert(!saved, `Saving a Field Suggestion on non-opted-in entity '${NON_OPTED_IN_ENTITY_NAME}' must fail`);
        },
    },
    {
        Id: `${BUNDLE}.WBC5`,
        Name: 'WBC5: Saving a newer open Field Suggestion on the same field automatically marks the earlier suggestion Superseded',
        Fn: async (ctx) => {
            const older = await createSuggestion(
                ctx,
                'Description',
                'WBC5 older proposed description',
                'WBC5 Older'
            );
            const newer = await createSuggestion(
                ctx,
                'Description',
                'WBC5 newer proposed description',
                'WBC5 Newer'
            );

            const reloadedOlder = await ctx.Provider.GetEntityObject<MJFieldSuggestionEntity>(
                'MJ: Field Suggestions',
                ctx.User
            );
            Assert(await reloadedOlder.Load(older.ID), 'Could not reload older suggestion');
            AssertEqual(reloadedOlder.Outcome, 'Superseded', 'Older suggestion must be marked Superseded');
            AssertEqual(reloadedOlder.IsResolved, true, 'Older suggestion must be marked IsResolved = true');

            const reloadedNewer = await ctx.Provider.GetEntityObject<MJFieldSuggestionEntity>(
                'MJ: Field Suggestions',
                ctx.User
            );
            Assert(await reloadedNewer.Load(newer.ID), 'Could not reload newer suggestion');
            AssertEqual(reloadedNewer.Outcome, null, 'Newer suggestion must remain pending (Outcome = null)');
            AssertEqual(reloadedNewer.IsResolved, false, 'Newer suggestion must remain open');
        },
    },
    {
        Id: `${BUNDLE}.WBC6`,
        Name: 'WBC6: AcceptFieldSuggestion writes SuggestedValue to the target record as the accepting user, stamps Accepted, and refuses users lacking update permission',
        Fn: async (ctx) => {
            const proposed = `Accepted description ${Date.now()} ${FIXTURE_TAG}`;
            const suggestion = await createSuggestion(ctx, 'Description', proposed, 'WBC6 Accept');

            // Unauthorized user check first (if seeded no-grant user is present)
            if (fx().NoGrantUser) {
                let unauthorizedThrew = false;
                try {
                    await ConversationEngine.Instance.AcceptFieldSuggestion(
                        suggestion.ID,
                        fx().NoGrantUser!,
                        ctx.Provider
                    );
                } catch {
                    unauthorizedThrew = true;
                }
                Assert(
                    unauthorizedThrew,
                    'AcceptFieldSuggestion must reject a user who lacks update permissions on the target record'
                );
            }

            const accepted = await ConversationEngine.Instance.AcceptFieldSuggestion(
                suggestion.ID,
                ctx.User,
                ctx.Provider
            );
            AssertEqual(accepted.Outcome, 'Accepted', 'Suggestion Outcome must become Accepted');
            AssertEqual(accepted.IsResolved, true, 'Accepted suggestion must set IsResolved = true');
            Assert(
                UUIDsEqual(accepted.ResolvedByUserID, ctx.User.ID),
                'Accepted suggestion must stamp ResolvedByUserID to the accepting user'
            );

            const targetList = await ctx.Provider.GetEntityObject<MJListEntity>('MJ: Lists', ctx.User);
            Assert(await targetList.Load(fx().FixtureListID), 'Could not reload target MJ: Lists record');
            AssertEqual(
                targetList.Description,
                proposed,
                'Target record Description must equal the accepted SuggestedValue'
            );
        },
    },
    {
        Id: `${BUNDLE}.WBC7`,
        Name: 'WBC7: RejectFieldSuggestion stamps Outcome=Rejected and IsResolved=true without altering the target record',
        Fn: async (ctx) => {
            const beforeList = await ctx.Provider.GetEntityObject<MJListEntity>('MJ: Lists', ctx.User);
            Assert(await beforeList.Load(fx().FixtureListID), 'Could not load target list before reject');
            const priorDescription = beforeList.Description;

            const suggestion = await createSuggestion(
                ctx,
                'Description',
                'WBC7 rejected value that must never land',
                'WBC7 Reject'
            );
            const rejected = await ConversationEngine.Instance.RejectFieldSuggestion(
                suggestion.ID,
                ctx.User,
                ctx.Provider
            );
            AssertEqual(rejected.Outcome, 'Rejected', 'Suggestion Outcome must become Rejected');
            AssertEqual(rejected.IsResolved, true, 'Rejected suggestion must set IsResolved = true');
            Assert(
                UUIDsEqual(rejected.ResolvedByUserID, ctx.User.ID),
                'Rejected suggestion must stamp ResolvedByUserID'
            );

            const afterList = await ctx.Provider.GetEntityObject<MJListEntity>('MJ: Lists', ctx.User);
            Assert(await afterList.Load(fx().FixtureListID), 'Could not reload target list after reject');
            AssertEqual(
                afterList.Description,
                priorDescription,
                'Rejecting a Field Suggestion must leave the target record unchanged'
            );
        },
    },
    {
        Id: `${BUNDLE}.WBC8`,
        Name: 'WBC8: Direct edit of a target field supersedes pending Field Suggestions on that field via FieldSuggestionPostSaveHook',
        Fn: async (ctx) => {
            EnsureFieldSuggestionPostSaveHookRegistered();
            const pendingOnDesc = await createSuggestion(
                ctx,
                'Description',
                'WBC8 AI guessed description',
                'WBC8 Pending Desc'
            );
            const pendingOnName = await createSuggestion(
                ctx,
                'Name',
                `WBC8 Unrelated Name Suggestion ${FIXTURE_TAG}`,
                'WBC8 Pending Name'
            );

            // Directly update ONLY Description on the target MJ: Lists record
            const targetList = await ctx.Provider.GetEntityObject<MJListEntity>('MJ: Lists', ctx.User);
            Assert(await targetList.Load(fx().FixtureListID), 'Could not load target list for direct edit');
            targetList.Description = `Human authoritative edit ${Date.now()} ${FIXTURE_TAG}`;
            Assert(
                await targetList.Save(),
                `Direct edit of MJ: Lists failed: ${targetList.LatestResult?.CompleteMessage ?? ''}`
            );

            const reloadedDescSuggestion = await ctx.Provider.GetEntityObject<MJFieldSuggestionEntity>(
                'MJ: Field Suggestions',
                ctx.User
            );
            Assert(await reloadedDescSuggestion.Load(pendingOnDesc.ID), 'Could not reload Description suggestion');
            AssertEqual(
                reloadedDescSuggestion.Outcome,
                'Superseded',
                'Direct edit to Description must mark pending Description suggestion Superseded'
            );
            AssertEqual(
                reloadedDescSuggestion.IsResolved,
                true,
                'Superseded Description suggestion must be marked IsResolved = true'
            );

            const reloadedNameSuggestion = await ctx.Provider.GetEntityObject<MJFieldSuggestionEntity>(
                'MJ: Field Suggestions',
                ctx.User
            );
            Assert(await reloadedNameSuggestion.Load(pendingOnName.ID), 'Could not reload Name suggestion');
            AssertEqual(
                reloadedNameSuggestion.Outcome,
                null,
                'Pending suggestion on untouched Name field must remain pending'
            );
        },
    },
    {
        Id: `${BUNDLE}.WBC9`,
        Name: 'WBC9: AnchoredConversationPostRunViewHook filters MJ: Comments and MJ: Field Suggestions views when caller cannot read the linked record',
        Fn: async (ctx) => {
            EnsureAnchoredConversationReadHookRegistered();
            const suggestion = await createSuggestion(
                ctx,
                'Description',
                'WBC9 protected suggestion',
                'WBC9 Security'
            );

            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const ownerRead = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Field Suggestions',
                    ExtraFilter: `ID='${suggestion.ID}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User
            );
            Assert(ownerRead.Success, `Owner RunView on MJ: Field Suggestions failed: ${ownerRead.ErrorMessage}`);
            AssertEqual(ownerRead.Results.length, 1, 'Authorized user must see the Field Suggestion');

            const bundleLoad = await ConversationEngine.Instance.LoadAnchoredCommentsAndSuggestions(
                [suggestion.ID],
                ctx.User,
                ctx.Provider,
                true
            );
            Assert(
                Array.from(bundleLoad.SuggestionsByConversationId.values()).some((s) => UUIDsEqual(s.ID, suggestion.ID)),
                'LoadAnchoredCommentsAndSuggestions must return the saved Field Suggestion'
            );

            if (!fx().NoGrantUser) {
                console.warn(
                    `  ⚠ WBC9 no-grant probe skipped — '${SEEDED_NOGRANT_EMAIL}' not found (push metadata-optional/integration-test).`
                );
                return;
            }
            // NoGrantUser lacks CanRead on MJ: Field Suggestions (entity permission gate) OR linked record read gate
            const deniedRead = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Field Suggestions',
                    ExtraFilter: `ID='${suggestion.ID}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                fx().NoGrantUser!
            );
            Assert(
                !deniedRead.Success || deniedRead.Results.length === 0,
                'User without read rights on the linked record must never receive MJ: Field Suggestions rows'
            );
        },
    },
    {
        Id: `${BUNDLE}.WBC10`,
        Name: 'WBC10: AgentWakeTriggerService.TriggerWakeForWorkstream coalesces multi-event wakes onto one workstream routine and Schedule Next Agent Wake normalizes legacy gate keys',
        Fn: async (ctx) => {
            const workstreamKey = `task:wbc10-${Date.now()}`;

            const first = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: ctx.User.ID,
                targetAgentID: fx().ChiefOfStaffAgentID,
                workstreamKey,
                wakeReason: 'Task moved to Ready for factory',
                resumeState: {
                    triggerType: 'TaskStatusChanged',
                    newStatus: 'Ready for factory',
                },
                contextUser: ctx.User,
                metadataProvider: ctx.Provider,
            });
            Assert(first.triggered, `First workstream wake failed (${first.resultCode}): ${first.reason}`);
            AssertEqual(first.resultCode, 'WAKE_SCHEDULED', 'Expected WAKE_SCHEDULED');
            Assert(first.routineID != null, 'Expected routineID from TriggerWakeForWorkstream');
            fx().CreatedRoutineIDs.push(first.routineID!);

            const second = await AgentWakeTriggerService.Instance.TriggerWakeForWorkstream({
                targetUserID: ctx.User.ID,
                targetAgentName: 'Chief of Staff',
                workstreamKey,
                wakeReason: 'CI check suite completed on PR #42',
                resumeState: {
                    triggerType: 'GitHubCheckSuiteCompleted',
                    conclusion: 'success',
                },
                contextUser: ctx.User,
                metadataProvider: ctx.Provider,
            });
            Assert(second.triggered, `Second workstream wake failed (${second.resultCode}): ${second.reason}`);
            Assert(
                UUIDsEqual(second.routineID, first.routineID),
                'Events on the same workstreamKey before claim must coalesce onto the same MJ: User Routines row'
            );

            const routine = await ctx.Provider.GetEntityObject<MJUserRoutineEntity>(
                'MJ: User Routines',
                ctx.User
            );
            Assert(await routine.Load(first.routineID!), 'Could not load coalesced wake routine');
            const pending = routine.WakeConfigurationObject?.resumeState?.pendingEvents;
            Assert(
                Array.isArray(pending) && pending.length >= 2,
                `Expected >= 2 coalesced pendingEvents on routine WakeConfigurationObject, got ${JSON.stringify(pending)}`
            );

            // Schedule Next Agent Wake normalizes legacy prompt field names into canonical WakeGateEvaluator keys
            const aliasKey = `wbc10-alias-${Date.now()}`;
            const actionRes = await runCoreAction('Schedule Next Agent Wake', ctx.User, [
                inputParam('AgentID', fx().ChiefOfStaffAgentID),
                inputParam('WorkstreamKey', aliasKey),
                inputParam('ScheduleMode', 'Adaptive'),
                inputParam('DelayMinutes', 30),
                inputParam('WakeReason', 'Poll harness build status'),
                inputParam(
                    'WakeConfigurationJSON',
                    JSON.stringify({
                        watchedEntities: [
                            {
                                entityName: 'MJ: Lists',
                                filter: "Name LIKE 'WBC%'",
                                trackChangesOnly: true,
                            },
                        ],
                        wakeGate: {
                            tier1Expression: 'TotalChangedRecords > 0',
                            tier2DecisionQuestion: 'Did a tracked task change meaningfully?',
                        },
                    })
                ),
            ]);
            Assert(
                actionRes.Success,
                `Schedule Next Agent Wake failed: ${actionRes.Message ?? ''}`
            );

            const rv = RunView.FromMetadataProvider(ctx.Provider);
            const aliasRoutines = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: User Routines',
                    ExtraFilter: `UserID='${ctx.User.ID}' AND Name LIKE '%${aliasKey}%'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                ctx.User
            );
            Assert(aliasRoutines.Success && aliasRoutines.Results.length === 1, 'Expected saved alias wake routine');
            fx().CreatedRoutineIDs.push(aliasRoutines.Results[0].ID);

            const aliasRoutine = await ctx.Provider.GetEntityObject<MJUserRoutineEntity>(
                'MJ: User Routines',
                ctx.User
            );
            Assert(await aliasRoutine.Load(aliasRoutines.Results[0].ID), 'Could not load alias wake routine');
            const wakeCfg = aliasRoutine.WakeConfigurationObject;
            AssertEqual(
                wakeCfg?.wakeGate?.tier1Expression,
                'totalChangedCount > 0',
                'TotalChangedRecords must normalize to totalChangedCount'
            );
            AssertEqual(
                wakeCfg?.wakeGate?.tier2Decision?.question,
                'Did a tracked task change meaningfully?',
                'tier2DecisionQuestion must normalize to tier2Decision.question'
            );
            AssertEqual(
                wakeCfg?.watchedEntities?.[0]?.extraFilter,
                "Name LIKE 'WBC%'",
                'watchedEntities[].filter must normalize to extraFilter'
            );
            AssertEqual(
                wakeCfg?.watchedEntities?.[0]?.includeRecordChanges,
                true,
                'watchedEntities[].trackChangesOnly must normalize to includeRecordChanges'
            );
        },
    },
];

for (const check of WorkBusCoreChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        await AIEngine.Instance.Config(false, ctx.User);
        await ActionEngineServer.Instance.Config(false, ctx.User);
        await ConversationEngine.Instance.Config(false, ctx.User, ctx.Provider);
        EnsureAnchoredConversationReadHookRegistered();
        EnsureFieldSuggestionPostSaveHookRegistered();

        const cosAgent = AIEngine.Instance.Agents.find((a) => a.Name === 'Chief of Staff');
        Assert(!!cosAgent, "Need the 'Chief of Staff' agent in AIEngine.Instance.Agents");

        const listsInfo = liveEntityInfo(ctx, OPTED_IN_ENTITY_NAME);
        const entityRecord = await ctx.Provider.GetEntityObject<MJEntityEntity>('MJ: Entities', ctx.User);
        Assert(await entityRecord.Load(listsInfo.ID), `Could not load MJ: Entities row for '${OPTED_IN_ENTITY_NAME}'`);
        const originalConfig = entityRecord.Configuration;

        // Opt MJ: Lists into FIELD_SUGGESTION for the duration of this bundle; restored verbatim in Teardown
        const parsedConfig: IEntityConfiguration = entityRecord.Configuration
            ? (JSON.parse(entityRecord.Configuration) as IEntityConfiguration)
            : {};
        const nextConfig: IEntityConfiguration = {
            ...parsedConfig,
            Comments: {
                ...(parsedConfig.Comments ?? {}),
                Enabled: true,
                AllowedCommentTypes: [COMMENT_TYPE_CODES.COMMENT, COMMENT_TYPE_CODES.FIELD_SUGGESTION],
            },
        };
        entityRecord.Configuration = JSON.stringify(nextConfig);
        Assert(
            await entityRecord.Save(),
            `Updating Configuration on '${OPTED_IN_ENTITY_NAME}' failed: ${entityRecord.LatestResult?.CompleteMessage ?? ''}`
        );
        await ctx.Provider.Refresh();

        const fixtureList = await ctx.Provider.GetEntityObject<MJListEntity>('MJ: Lists', ctx.User);
        fixtureList.NewRecord();
        fixtureList.Name = `Work Bus Core Fixture ${FIXTURE_TAG}`;
        fixtureList.Description = 'Initial description before suggestions';
        fixtureList.EntityID = listsInfo.ID;
        fixtureList.UserID = ctx.User.ID;
        Assert(
            await fixtureList.Save(),
            `Saving fixture MJ: Lists row failed: ${fixtureList.LatestResult?.CompleteMessage ?? ''}`
        );

        fixture = {
            ListsEntityID: listsInfo.ID,
            OriginalListsConfig: originalConfig,
            ListsConfigMutated: true,
            FixtureListID: fixtureList.ID,
            ChiefOfStaffAgentID: cosAgent!.ID,
            NoGrantUser: findUserByEmail(UserCache.Users, SEEDED_NOGRANT_EMAIL) ?? null,
            CreatedConversationIDs: [],
            CreatedRoutineIDs: [],
            CreatedActionLogIDs: [],
            CreatedExtraListIDs: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = null;
        if (!f) {
            return;
        }

        // Delete created conversations / comments / field suggestions from leaf up so IS-A FKs clean up cleanly
        const uniqueConvIds = Array.from(new Set(f.CreatedConversationIDs)).reverse();
        for (const id of uniqueConvIds) {
            const fs = await ctx.Provider.GetEntityObject<MJFieldSuggestionEntity>('MJ: Field Suggestions', ctx.User);
            if (await fs.Load(id)) {
                await fs.Delete().catch(() => undefined);
                continue;
            }
            const comment = await ctx.Provider.GetEntityObject<MJCommentEntity>('MJ: Comments', ctx.User);
            if (await comment.Load(id)) {
                await comment.Delete().catch(() => undefined);
                continue;
            }
            const conv = await ctx.Provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', ctx.User);
            if (await conv.Load(id)) {
                await conv.Delete().catch(() => undefined);
            }
        }

        // Delete created routines
        for (const id of Array.from(new Set(f.CreatedRoutineIDs))) {
            const routine = await ctx.Provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', ctx.User);
            if (await routine.Load(id)) {
                await routine.Delete().catch(() => undefined);
            }
        }

        // Delete action execution logs
        for (const id of Array.from(new Set(f.CreatedActionLogIDs))) {
            const log = await ctx.Provider.GetEntityObject('MJ: Action Execution Logs', ctx.User);
            if (await log.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: id }]))) {
                await log.Delete().catch(() => undefined);
            }
        }

        // Delete fixture list(s)
        for (const listId of [...f.CreatedExtraListIDs, f.FixtureListID]) {
            const list = await ctx.Provider.GetEntityObject<MJListEntity>('MJ: Lists', ctx.User);
            if (await list.Load(listId)) {
                await list.Delete().catch(() => undefined);
            }
        }

        // Restore MJ: Lists Configuration verbatim and refresh metadata
        if (f.ListsConfigMutated) {
            const entityRecord = await ctx.Provider.GetEntityObject<MJEntityEntity>('MJ: Entities', ctx.User);
            if (await entityRecord.Load(f.ListsEntityID)) {
                entityRecord.Configuration = f.OriginalListsConfig;
                await entityRecord.Save().catch(() => undefined);
                await ctx.Provider.Refresh().catch(() => undefined);
            }
        }
    },
});
