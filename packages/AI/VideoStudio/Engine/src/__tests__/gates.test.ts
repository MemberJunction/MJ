import { describe, expect, it } from 'vitest';
import { ValidateVideoGenerationSpec, type GateRecord } from '@memberjunction/video-studio-core';
import {
    CheckStagePrerequisite,
    ClearStaleEvidence,
    DeriveStatus,
    DescribeStageProgress,
    DescribeStoryboardForApproval,
    EvaluateGates,
    ReadApprovalDecision,
    RequestRegeneration,
    type GateEvaluationContext,
} from '../gates.js';
import { VideoStudioAgent } from '../agents/video-studio-agent.js';
import { DEFAULT_VIDEO_STUDIO_SETTINGS, ParseVideoStudioSettings } from '../settings.js';
import { CreateDeliveredSpecFixture, DELIVERED_SPEC_FIXTURE } from './fixtures/delivered-spec.fixture.js';

function getGate(gates: ReadonlyArray<GateRecord>, gateId: GateRecord['Gate']): GateRecord {
    const found = gates.find((g) => g.Gate === gateId);
    if (!found) {
        throw new Error(`Gate ${gateId} not found`);
    }
    return found;
}

describe('VideoStudio gates', () => {
    const standardCtx: GateEvaluationContext = {
        Settings: { ...DEFAULT_VIDEO_STUDIO_SETTINGS },
        Now: '2026-10-17T00:02:00.000Z',
        BrandKitInScope: true,
    };

    const draftSettings = ParseVideoStudioSettings([
        { Name: 'VideoStudio.MaxRepairRounds', Value: '0' },
        { Name: 'VideoStudio.RenderQuality', Value: 'draft' },
    ]);

    describe('Gate G1 (Facts)', () => {
        it('passes on a complete brief with resolved requirements and bindings', () => {
            const spec = CreateDeliveredSpecFixture();
            const gates = EvaluateGates(spec, standardCtx);
            expect(getGate(gates, 'G1').Status).toBe('Passed');
        });

        it('fails when Film.OneSentence, Film.Audience, DurationSeconds <= 0, or Formats is missing/empty', () => {
            const noOneSentence = CreateDeliveredSpecFixture();
            noOneSentence.Film.OneSentence = '  ';
            expect(getGate(EvaluateGates(noOneSentence, standardCtx), 'G1').Status).toBe('Failed');

            const noAudience = CreateDeliveredSpecFixture();
            noAudience.Film.Audience = '';
            expect(getGate(EvaluateGates(noAudience, standardCtx), 'G1').Status).toBe('Failed');

            const badDuration = CreateDeliveredSpecFixture();
            badDuration.Film.DurationSeconds = 0;
            expect(getGate(EvaluateGates(badDuration, standardCtx), 'G1').Status).toBe('Failed');

            const emptyFormats = CreateDeliveredSpecFixture();
            emptyFormats.Film.Formats = [];
            emptyFormats.Deliverables.Formats = [];
            expect(getGate(EvaluateGates(emptyFormats, standardCtx), 'G1').Status).toBe('Failed');
        });

        it('returns Blocked when BrandKitInScope is false', () => {
            const spec = CreateDeliveredSpecFixture();
            const gates = EvaluateGates(spec, { ...standardCtx, BrandKitInScope: false });
            const g1 = getGate(gates, 'G1');
            expect(g1.Status).toBe('Blocked');
            expect(g1.Notes).toContain('BrandKitID is not in scope');
        });

        it('returns Blocked when a MustUse requirement is unmet', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Assets.Required.push({
                Key: 'missing_exec_headshot',
                Kind: 'Image',
                Description: 'Executive portrait',
                MustUse: true,
                AllowGenerated: false,
            });
            const g1 = getGate(EvaluateGates(spec, standardCtx), 'G1');
            expect(g1.Status).toBe('Blocked');
            expect(g1.Notes).toContain('UnmetMustUseRequirement');
        });

        it('returns Blocked when AllowGenerated is false on a requirement satisfied by a Generated asset', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Assets.Required[0].SatisfiedByAssetKey = 'hero_abstract_grid';
            const g1 = getGate(EvaluateGates(spec, standardCtx), 'G1');
            expect(g1.Status).toBe('Blocked');
            expect(g1.Notes).toContain('GeneratedAssetNotAllowedForRequirement');
        });

        it('returns Blocked for incomplete DataBindings across Query, View, Artifact, and Inline', () => {
            const querySpec = CreateDeliveredSpecFixture();
            querySpec.DataBindings = [{ Key: 'q1', Source: { Kind: 'Query' }, Shape: 'Scalar' }];
            expect(getGate(EvaluateGates(querySpec, standardCtx), 'G1').Status).toBe('Blocked');

            const viewSpec = CreateDeliveredSpecFixture();
            viewSpec.DataBindings = [
                { Key: 'v1', Source: { Kind: 'View', EntityName: 'Members' }, Shape: 'Series' },
            ];
            expect(getGate(EvaluateGates(viewSpec, standardCtx), 'G1').Status).toBe('Blocked');

            const artifactSpec = CreateDeliveredSpecFixture();
            artifactSpec.DataBindings = [{ Key: 'a1', Source: { Kind: 'Artifact' }, Shape: 'Table' }];
            expect(getGate(EvaluateGates(artifactSpec, standardCtx), 'G1').Status).toBe('Blocked');

            const inlineSpec = CreateDeliveredSpecFixture();
            inlineSpec.DataBindings.push({
                Key: 'missing_inline_metric',
                Source: { Kind: 'Inline' },
                Shape: 'Scalar',
            });
            expect(getGate(EvaluateGates(inlineSpec, standardCtx), 'G1').Status).toBe('Blocked');
        });
    });

    describe('Gate G2 (Plan)', () => {
        it('passes in Autonomous mode when Storyboarded validation passes, even when Interaction is omitted or omits MaxRepairRounds', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Review.Gates = [];
            const g2 = getGate(EvaluateGates(spec, standardCtx), 'G2');
            expect(g2.Status).toBe('Passed');

            const withoutInteraction = CreateDeliveredSpecFixture() as Partial<ReturnType<typeof CreateDeliveredSpecFixture>>;
            delete withoutInteraction.Interaction;
            withoutInteraction.Review = { Gates: [], Rounds: [] };
            const g2WithoutInteraction = getGate(EvaluateGates(withoutInteraction, standardCtx), 'G2');
            expect(g2WithoutInteraction.Status).toBe('Passed');

            const actionStyleInteraction = CreateDeliveredSpecFixture();
            actionStyleInteraction.Interaction = { Mode: 'Autonomous' } as ReturnType<typeof CreateDeliveredSpecFixture>['Interaction'];
            actionStyleInteraction.Review.Gates = [];
            const g1ActionStyle = getGate(EvaluateGates(actionStyleInteraction, standardCtx), 'G1');
            const g2ActionStyle = getGate(EvaluateGates(actionStyleInteraction, standardCtx), 'G2');
            expect(g1ActionStyle.Status).toBe('Passed');
            expect(g2ActionStyle.Status).toBe('Passed');
        });

        it('returns Pending with AwaitingApproval in ApproveStoryboard mode without approval, and Passed once Approved', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Interaction.Mode = 'ApproveStoryboard';
            spec.Review.Gates = spec.Review.Gates.filter((g) => g.Gate !== 'G2');

            const pending = getGate(EvaluateGates(spec, standardCtx), 'G2');
            expect(pending.Status).toBe('Pending');
            expect(pending.Notes).toBe('AwaitingApproval');

            spec.Review.Gates.push({
                Gate: 'G2',
                Status: 'Passed',
                Notes: 'Approved',
                EvidenceRefs: ['approval:run-1'],
                Timestamp: '2026-10-17T00:00:25.000Z',
            });
            const approved = getGate(EvaluateGates(spec, standardCtx), 'G2');
            expect(approved.Status).toBe('Passed');
            expect(approved.Notes).toBe('Approved');
        });

        it('fails when ValidateVideoGenerationSpec at Storyboarded fails (including a narration-less storyboard with MissingNarrationScript)', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Beats[0].StartSeconds = 3; // breaks contiguous 0-start beats invariant
            const g2 = getGate(EvaluateGates(spec, standardCtx), 'G2');
            expect(g2.Status).toBe('Failed');

            const silentSpec = CreateDeliveredSpecFixture();
            silentSpec.Audio = { Cues: [], Captions: 'None' };
            silentSpec.Deliverables.Captions = false;
            for (const beat of silentSpec.Beats) {
                delete beat.NarrationKey;
            }
            const g2Silent = getGate(EvaluateGates(silentSpec, standardCtx), 'G2');
            expect(g2Silent.Status).toBe('Failed');
            expect(g2Silent.Notes).toContain('MissingNarrationScript');
        });

        it('fails with GenerationDurationExceedsLimit when a 25s generation request exceeds a 20s MaxGeneratedVideoSeconds cap', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Assets.Generate = [
                {
                    Key: 'gen-over-cap',
                    Prompt: 'Aerial skyline dolly shot',
                    Kind: 'Video',
                    Purpose: 'Illustrative clip',
                    ReferenceKeys: [],
                    DurationSeconds: 25,
                    Format: '16:9',
                    Status: 'Pending',
                },
            ];
            const g2 = getGate(
                EvaluateGates(spec, {
                    ...standardCtx,
                    Settings: { ...standardCtx.Settings, MaxGeneratedVideoSeconds: 20 },
                }),
                'G2',
            );
            expect(g2.Status).toBe('Failed');
            expect(g2.Notes).toContain('GenerationDurationExceedsLimit');
        });
    });

    describe('Gate G3 (Stills)', () => {
        it('passes when ContactSheetFileIDs exist for all deliverable formats and Render recorded G3 Passed', () => {
            const spec = CreateDeliveredSpecFixture();
            expect(getGate(EvaluateGates(spec, standardCtx), 'G3').Status).toBe('Passed');
        });

        it('preserves G3 Failed when ContactSheetFileIDs exist and Render recorded G3 Failed', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Review.Gates = [
                {
                    Gate: 'G3',
                    Status: 'Failed',
                    EvidenceRefs: [],
                    Notes: 'Blank frame detected on beat-2',
                    Timestamp: '2026-10-17T00:01:05.000Z',
                },
            ];
            const g3 = getGate(EvaluateGates(spec, standardCtx), 'G3');
            expect(g3.Status).toBe('Failed');
            expect(g3.Notes).toBe('Blank frame detected on beat-2');
        });

        it('returns Pending when ContactSheetFileIDs are missing for any format even if payload forged G3 Passed', () => {
            const spec = CreateDeliveredSpecFixture();
            delete spec.Output!.ContactSheetFileIDs!['9:16'];
            const g3 = getGate(EvaluateGates(spec, standardCtx), 'G3');
            expect(g3.Status).toBe('Pending');
        });
    });

    describe('Gate G4 (Rough Cut)', () => {
        it('passes in Autonomous mode when Videos exist for all formats and a critic round is >= RenderedAt', () => {
            const spec = CreateDeliveredSpecFixture();
            expect(getGate(EvaluateGates(spec, standardCtx), 'G4').Status).toBe('Passed');
        });

        it('returns Pending in ApproveStoryboardAndRoughCut mode until G4 Notes === Approved', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Interaction.Mode = 'ApproveStoryboardAndRoughCut';
            spec.Review.Gates = spec.Review.Gates.filter((g) => g.Gate !== 'G4');

            const pending = getGate(EvaluateGates(spec, standardCtx), 'G4');
            expect(pending.Status).toBe('Pending');
            expect(pending.Notes).toBe('AwaitingApproval');

            spec.Review.Gates.push({
                Gate: 'G4',
                Status: 'Passed',
                Notes: 'Approved',
                EvidenceRefs: ['approval:run-2'],
                Timestamp: '2026-10-17T00:01:15.000Z',
            });
            const approved = getGate(EvaluateGates(spec, standardCtx), 'G4');
            expect(approved.Status).toBe('Passed');
            expect(approved.Notes).toBe('Approved');
        });

        it('fails when Output.Videos is missing a format or when no critic round is >= RenderedAt', () => {
            const missingVideo = CreateDeliveredSpecFixture();
            delete missingVideo.Output!.Videos!['9:16'];
            expect(getGate(EvaluateGates(missingVideo, standardCtx), 'G4').Status).toBe('Failed');

            const staleRound = CreateDeliveredSpecFixture();
            staleRound.Review.Rounds[0].Timestamp = '2026-10-16T23:59:00.000Z';
            expect(getGate(EvaluateGates(staleRound, standardCtx), 'G4').Status).toBe('Failed');
        });
    });

    describe('Gate G5 (Repair)', () => {
        it('passes when newest critic round has no Open Blocker or Major defects', () => {
            const spec = CreateDeliveredSpecFixture();
            expect(getGate(EvaluateGates(spec, standardCtx), 'G5').Status).toBe('Passed');
        });

        it('fails when newest critic round has an Open Blocker or Major defect and repair budget remains', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Review.Rounds[0].Defects = [
                {
                    Beat: 'beat-1',
                    Timestamp: 2.0,
                    Severity: 'Major',
                    Evidence: 'Headline overlaps KPI label on 9:16',
                    Fix: 'Reduce headline font size on 9:16',
                    Status: 'Open',
                },
            ];
            expect(getGate(EvaluateGates(spec, standardCtx), 'G5').Status).toBe('Failed');
        });

        it('passes with budget note when Open Blocker/Major defects remain but Rounds.length - 1 >= MaxRepairRounds', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Review.Rounds = [
                {
                    Round: 1,
                    Timestamp: '2026-10-17T00:01:10.000Z',
                    ContactSheetFileIDs: { '16:9': ['12121212-3434-4565-8787-989898989898'] },
                    Defects: [
                        {
                            Beat: 'beat-1',
                            Timestamp: 1.5,
                            Severity: 'Blocker',
                            Evidence: 'Clipped text',
                            Fix: 'Shrink text',
                            Status: 'Open',
                        },
                    ],
                },
            ];
            // Draft has MaxRepairRounds = 0 -> after 1 round, rounds.length - 1 (0) >= 0
            const draftG5 = getGate(
                EvaluateGates(spec, { ...standardCtx, Settings: draftSettings }),
                'G5',
            );
            expect(draftG5.Status).toBe('Passed');
            expect(draftG5.Notes).toContain('Repair budget reached');
        });
    });

    describe('Gate G6 (Final)', () => {
        it('passes on DELIVERED_SPEC_FIXTURE and ValidateVideoGenerationSpec at Delivered returns Valid = true', () => {
            expect(getGate(EvaluateGates(DELIVERED_SPEC_FIXTURE, standardCtx), 'G6').Status).toBe('Passed');
            const validation = ValidateVideoGenerationSpec(CreateDeliveredSpecFixture(), 'Delivered');
            expect(validation.Valid).toBe(true);
            expect(validation.Errors).toEqual([]);
        });

        it('fails when a deliverable format is missing in Output.Videos', () => {
            const spec = CreateDeliveredSpecFixture();
            delete spec.Output!.Videos!['16:9'];
            expect(getGate(EvaluateGates(spec, standardCtx), 'G6').Status).toBe('Failed');
        });

        it('fails when Deliverables.Poster is true and Output.PosterFileID is missing', () => {
            const spec = CreateDeliveredSpecFixture();
            delete spec.Output!.PosterFileID;
            expect(getGate(EvaluateGates(spec, standardCtx), 'G6').Status).toBe('Failed');
        });

        it('fails when Audio.Captions is Sidecar with narration and Output.CaptionsFileID is missing', () => {
            const spec = CreateDeliveredSpecFixture();
            delete spec.Output!.CaptionsFileID;
            expect(getGate(EvaluateGates(spec, standardCtx), 'G6').Status).toBe('Failed');
        });

        it('fails when a narration line lacks AudioFileID or RenderMetadata is missing', () => {
            const missingVoice = CreateDeliveredSpecFixture();
            delete missingVoice.Audio.Narration!.Script[0].AudioFileID;
            expect(getGate(EvaluateGates(missingVoice, standardCtx), 'G6').Status).toBe('Failed');

            const missingMeta = CreateDeliveredSpecFixture();
            delete missingMeta.Output!.RenderMetadata;
            expect(getGate(EvaluateGates(missingMeta, standardCtx), 'G6').Status).toBe('Failed');
        });
    });

    describe('DeriveStatus', () => {
        it('returns Blocked when G1 is Blocked and never returns Delivered even on DELIVERED_SPEC_FIXTURE', () => {
            const blockedSpec = CreateDeliveredSpecFixture();
            const blockedGates = EvaluateGates(blockedSpec, { ...standardCtx, BrandKitInScope: false });
            expect(DeriveStatus(blockedSpec, blockedGates)).toBe('Blocked');

        const fullSpec = CreateDeliveredSpecFixture();
            const fullGates = EvaluateGates(fullSpec, standardCtx);
            expect(DeriveStatus(fullSpec, fullGates)).toBe('Reviewed');
        });

        it('walks the progression Briefing -> Styled -> Storyboarded -> Approved -> PreProduced -> Composed -> RoughCut -> Reviewed', () => {
            const spec = CreateDeliveredSpecFixture();

            // Reviewed -> RoughCut when critic round is removed
            spec.Review.Rounds = [];
            expect(DeriveStatus(spec, EvaluateGates(spec, standardCtx))).toBe('RoughCut');

            // RoughCut -> Composed when Videos and ContactSheetFileIDs are removed
            delete spec.Output!.Videos;
            delete spec.Output!.ContactSheetFileIDs;
            expect(DeriveStatus(spec, EvaluateGates(spec, standardCtx))).toBe('Composed');

            // Composed -> PreProduced when Output.Source is removed
            delete spec.Output!.Source;
            expect(DeriveStatus(spec, EvaluateGates(spec, standardCtx))).toBe('PreProduced');

            // PreProduced -> Approved when narration AudioFileID is not yet resolved
            delete spec.Audio.Narration!.Script[0].AudioFileID;
            expect(DeriveStatus(spec, EvaluateGates(spec, standardCtx))).toBe('Approved');

            // Approved -> Storyboarded under ApproveStoryboard without G2 approval
            spec.Interaction.Mode = 'ApproveStoryboard';
            spec.Review.Gates = spec.Review.Gates.filter((g) => g.Gate !== 'G2');
            expect(DeriveStatus(spec, EvaluateGates(spec, standardCtx))).toBe('Storyboarded');

            // Storyboarded -> Styled when Beats is empty
            spec.Beats = [];
            expect(DeriveStatus(spec, EvaluateGates(spec, standardCtx))).toBe('Styled');

            // Styled -> Briefing when Style.Palette is empty
            spec.Style.Palette = [];
            expect(DeriveStatus(spec, EvaluateGates(spec, standardCtx))).toBe('Briefing');
        });
    });

    describe('ReadApprovalDecision', () => {
        it('parses structured form tokens and explicit prefix approval tokens conservatively, with leading Approved./Rejected. line taking precedence', () => {
            expect(
                ReadApprovalDecision(
                    'Approved.\n\n@{"_mode":"form","action":"form","fields":[{"name":"decision","value":"approve"}]}',
                ),
            ).toBe('Approve');
            expect(
                ReadApprovalDecision(
                    'Rejected.\n\n@{"_mode":"form","action":"form","fields":[{"name":"decision","value":"approve"}]}',
                ),
            ).toBe('Reject');
            expect(
                ReadApprovalDecision(
                    'Approved.\n\n@{"_mode":"form","action":"form","fields":[{"name":"decision","value":"reject"}]}',
                ),
            ).toBe('Approve');
            expect(
                ReadApprovalDecision(
                    '@{"_mode":"form","action":"form","fields":[{"name":"decision","value":"reject"}]}',
                ),
            ).toBe('Reject');
            expect(ReadApprovalDecision('Rejected.\n\nApprove once beat 2 is shorter')).toBe('Reject');
            expect(ReadApprovalDecision('Approved.\n\nlooks great')).toBe('Approve');
            expect(ReadApprovalDecision('@form:{"decision":"approve"}')).toBe('Approve');
            expect(ReadApprovalDecision('@form:{"decision":"reject"}')).toBe('Reject');
            expect(ReadApprovalDecision('Approve')).toBe('Approve');
            expect(ReadApprovalDecision('approved, use the Q3 numbers')).toBe('Approve');
            expect(ReadApprovalDecision('looks fine')).toBe('Reject');
            expect(ReadApprovalDecision('')).toBeNull();
            expect(ReadApprovalDecision(null)).toBeNull();
        });
    });

    describe('CheckStagePrerequisite', () => {
        it('enforces stage prerequisites for each sub-agent and repair round budget', () => {
            const spec = CreateDeliveredSpecFixture();
            const gates = EvaluateGates(spec, standardCtx);

            expect(CheckStagePrerequisite('Video Studio - Director', spec, gates, standardCtx.Settings)).toBeNull();
            expect(CheckStagePrerequisite('Video Studio - Art Director', spec, gates, standardCtx.Settings)).toBeNull();
            expect(CheckStagePrerequisite('Video Studio - Storyboard', spec, gates, standardCtx.Settings)).toBeNull();
            expect(CheckStagePrerequisite('Video Studio - Pre-Production', spec, gates, standardCtx.Settings)).toBeNull();
            expect(CheckStagePrerequisite('Video Studio - Render', spec, gates, standardCtx.Settings)).toBeNull();
            expect(CheckStagePrerequisite('Video Studio - Critic', spec, gates, standardCtx.Settings)).toBeNull();

            // Draft settings have MaxRepairRounds = 0, and spec already has 1 round -> Motion Engineer refused
            expect(CheckStagePrerequisite('Video Studio - Motion Engineer', spec, gates, draftSettings)).toContain(
                'G5 (Repair)',
            );

            // Unapproved G2 blocks Pre-Production
            const unapprovedSpec = CreateDeliveredSpecFixture();
            unapprovedSpec.Interaction.Mode = 'ApproveStoryboard';
            unapprovedSpec.Review.Gates = unapprovedSpec.Review.Gates.filter((g) => g.Gate !== 'G2');
            const unapprovedGates = EvaluateGates(unapprovedSpec, standardCtx);
            expect(
                CheckStagePrerequisite('Video Studio - Pre-Production', unapprovedSpec, unapprovedGates, standardCtx.Settings),
            ).toContain('G2 (Plan)');

            // Missing Output.Source blocks Render
            const noSourceSpec = CreateDeliveredSpecFixture();
            delete noSourceSpec.Output!.Source!['9:16'];
            expect(CheckStagePrerequisite('Video Studio - Render', noSourceSpec, gates, standardCtx.Settings)).toContain(
                '9:16',
            );

            // Failed G3 blocks Critic (including lowercase/uppercase stage name variants)
            const failedG3Spec = CreateDeliveredSpecFixture();
            failedG3Spec.Review.Gates = [
                { Gate: 'G3', Status: 'Failed', EvidenceRefs: [], Timestamp: '2026-10-17T00:01:05.000Z' },
            ];
            const failedG3Gates = EvaluateGates(failedG3Spec, standardCtx);
            expect(
                CheckStagePrerequisite('Video Studio - Critic', failedG3Spec, failedG3Gates, standardCtx.Settings),
            ).toContain('G3 (Stills)');
            expect(
                CheckStagePrerequisite('video studio - pre-production', unapprovedSpec, unapprovedGates, standardCtx.Settings),
            ).toContain('G2 (Plan)');
            expect(
                CheckStagePrerequisite('VIDEO STUDIO - MOTION ENGINEER', spec, gates, draftSettings),
            ).toContain('G5 (Repair)');
        });
    });

    describe('ClearStaleEvidence and formatting helpers', () => {
        it('clears G2/G3/G4, Output.Source, and render evidence after Storyboard (case-insensitively), and clears render evidence + G3/G4 after Motion Engineer and Pre-Production', () => {
            const afterStoryboard = CreateDeliveredSpecFixture();
            ClearStaleEvidence('video studio - storyboard', afterStoryboard);
            expect(afterStoryboard.Output?.Source).toBeUndefined();
            expect(afterStoryboard.Output?.Videos).toBeUndefined();
            expect(afterStoryboard.Output?.ContactSheetFileIDs).toBeUndefined();
            expect(afterStoryboard.Output?.PosterFileID).toBeUndefined();
            expect(afterStoryboard.Output?.RenderMetadata).toBeUndefined();
            expect(
                afterStoryboard.Review.Gates.some((g) => g.Gate === 'G2' || g.Gate === 'G3' || g.Gate === 'G4'),
            ).toBe(false);

            const afterMotion = CreateDeliveredSpecFixture();
            ClearStaleEvidence('Video Studio - Motion Engineer', afterMotion);
            expect(afterMotion.Output?.Source).toBeDefined();
            expect(afterMotion.Output?.Videos).toBeUndefined();
            expect(afterMotion.Output?.ContactSheetFileIDs).toBeUndefined();
            expect(afterMotion.Review.Gates.some((g) => g.Gate === 'G2')).toBe(true);
            expect(afterMotion.Review.Gates.some((g) => g.Gate === 'G3' || g.Gate === 'G4')).toBe(false);

            const afterPreProd = CreateDeliveredSpecFixture();
            ClearStaleEvidence('Video Studio - Pre-Production', afterPreProd);
            expect(afterPreProd.Review.Gates.some((g) => g.Gate === 'G2')).toBe(true);
            expect(afterPreProd.Review.Gates.some((g) => g.Gate === 'G3' || g.Gate === 'G4')).toBe(false);
        });

        it('formats DescribeStoryboardForApproval and DescribeStageProgress cleanly', () => {
            const spec = CreateDeliveredSpecFixture();
            const md = DescribeStoryboardForApproval(spec);
            expect(md).toContain('## Storyboard Review');
            expect(md).toContain('beat-1');
            expect(md).toContain('nar-1');

            expect(DescribeStageProgress('Video Studio - Director', spec)).toContain('Brief ready:');
            expect(DescribeStageProgress('video studio - storyboard', spec)).toContain('Storyboard ready:');
        });
    });

    describe('VS-GEN-6 generation status, prerequisite, and regeneration', () => {
        it('returns Blocked from DeriveStatus when a generation request is Blocked and names the blocked request in CheckStagePrerequisite', () => {
            const spec = CreateDeliveredSpecFixture();
            delete spec.Output;
            spec.Review.Gates = spec.Review.Gates.filter((g) => g.Gate === 'G1' || g.Gate === 'G2');
            spec.Assets.Generate = [
                {
                    Key: 'gen-blocked',
                    Kind: 'Image',
                    Purpose: 'Backdrop illustration',
                    Prompt: 'Photorealistic CEO avatar talking',
                    ReferenceKeys: [],
                    Status: 'Blocked',
                    BlockedReason: 'ScreenRule:SyntheticPerson:ceo',
                },
            ];

            const gates = EvaluateGates(spec, standardCtx);
            expect(DeriveStatus(spec, gates)).toBe('Blocked');

            const prereqError = CheckStagePrerequisite('Video Studio - Motion Engineer', spec, gates, standardCtx.Settings);
            expect(prereqError).toContain('gen-blocked');
            expect(prereqError).toContain('ScreenRule:SyntheticPerson:ceo');
        });

        it('allows RequestRegeneration once and refuses on the second call at MaxRegenerations = 1', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Assets.Approved.push({
                Key: 'gen-ill',
                Kind: 'Image',
                FileID: '11111111-2222-4333-8444-555555555555',
                Source: 'Generated by Pre-Production via FLUX 3',
                Provenance: 'Generated',
                Usage: 'Abstract backdrop',
                MustUse: false,
            });
            spec.Assets.Generate = [
                {
                    Key: 'gen-ill',
                    Kind: 'Image',
                    Purpose: 'Abstract backdrop',
                    Prompt: 'Abstract geometric ribbon',
                    ReferenceKeys: [],
                    Status: 'Generated',
                },
            ];

            const first = RequestRegeneration(spec, 'gen-ill', 1);
            expect(first.Allowed).toBe(true);
            expect(first.Spec.Assets?.Approved.some((a) => a.Key === 'gen-ill')).toBe(false);
            expect(first.Spec.Assets?.Generate?.[0]?.Status).toBe('Pending');
            expect(first.Spec.Assets?.Generate?.[0]?.RegenerationCount).toBe(1);

            // Simulate re-generation before attempting a second regeneration
            first.Spec.Assets?.Approved.push({
                Key: 'gen-ill',
                Kind: 'Image',
                FileID: '11111111-2222-4333-8444-555555555555',
                Source: 'Generated by Pre-Production via FLUX 3',
                Provenance: 'Generated',
                Usage: 'Abstract backdrop',
                MustUse: false,
            });
            if (first.Spec.Assets?.Generate?.[0]) {
                first.Spec.Assets.Generate[0].Status = 'Generated';
            }

            const second = RequestRegeneration(first.Spec, 'gen-ill', 1);
            expect(second.Allowed).toBe(false);
            expect(second.Spec.Assets?.Approved.some((a) => a.Key === 'gen-ill')).toBe(true);
            expect(second.Spec.Assets?.Generate?.[0]?.Status).toBe('Generated');
            expect(second.Spec.Assets?.Generate?.[0]?.RegenerationCount).toBe(1);
        });

        it('resets a Generated asset in VideoStudioAgent.ApplyStageResult after Critic on round 1 and leaves it on round 2', () => {
            const agent = new VideoStudioAgent() as unknown as {
                ApplyStageResult(
                    params: unknown,
                    stageName: string,
                    payload: Partial<typeof DELIVERED_SPEC_FIXTURE>,
                    stageSucceeded?: boolean,
                ): Partial<typeof DELIVERED_SPEC_FIXTURE>;
            };
            const spec = CreateDeliveredSpecFixture();
            spec.Assets.Approved.push({
                Key: 'gen-ill',
                Kind: 'Image',
                FileID: '11111111-2222-4333-8444-555555555555',
                Source: 'Generated by Pre-Production via FLUX 3',
                Provenance: 'Generated',
                Usage: 'Abstract backdrop',
                MustUse: false,
                Generation: {
                    ModelID: 'A1B2C3D4-E5F6-4789-8012-34567890ABCD',
                    PromptRunID: 'B2C3D4E5-F6A7-4890-9123-4567890ABCDE',
                    Prompt: 'Abstract geometric ribbon',
                    ReferenceKeys: [],
                },
            });
            spec.Assets.Generate = [
                {
                    Key: 'gen-ill',
                    Kind: 'Image',
                    Purpose: 'Abstract backdrop',
                    Prompt: 'Abstract geometric ribbon',
                    ReferenceKeys: [],
                    Status: 'Generated',
                },
            ];
            spec.Review.Rounds = [
                {
                    Round: 1,
                    Timestamp: '2026-10-17T00:01:30.000Z',
                    ContactSheetFileIDs: { '16:9': ['12121212-3434-4565-8787-989898989898'] },
                    Defects: [
                        {
                            Beat: 'beat-1',
                            Timestamp: 2.0,
                            Severity: 'Major',
                            Status: 'Open',
                            AssetKey: 'gen-ill',
                            Evidence: 'Visual artifact in gen-ill.',
                            Fix: 'Regenerate gen-ill.',
                        },
                    ],
                },
            ];

            // Round 1: Critic defect triggers regeneration -> asset removed from Approved, request reset to Pending, Status drops to Approved
            const afterRound1 = agent.ApplyStageResult(
                { payload: spec },
                'Video Studio - Critic',
                spec,
            );
            expect(afterRound1.Assets?.Approved.some((a) => a.Key === 'gen-ill')).toBe(false);
            expect(afterRound1.Assets?.Generate?.[0]?.Status).toBe('Pending');
            expect(afterRound1.Assets?.Generate?.[0]?.RegenerationCount).toBe(1);
            expect(afterRound1.Status).toBe('Approved');

            // Simulate re-generation and re-render before round 2 Critic review
            afterRound1.Assets?.Approved.push({
                Key: 'gen-ill',
                Kind: 'Image',
                FileID: '11111111-2222-4333-8444-555555555555',
                Source: 'Generated by Pre-Production via FLUX 3',
                Provenance: 'Generated',
                Usage: 'Abstract backdrop',
                MustUse: false,
                Generation: {
                    ModelID: 'A1B2C3D4-E5F6-4789-8012-34567890ABCD',
                    PromptRunID: 'B2C3D4E5-F6A7-4890-9123-4567890ABCDE',
                    Prompt: 'Abstract geometric ribbon',
                    ReferenceKeys: [],
                },
            });
            if (afterRound1.Assets?.Generate?.[0]) {
                afterRound1.Assets.Generate[0].Status = 'Generated';
            }
            afterRound1.Review?.Rounds.push({
                Round: 2,
                Timestamp: '2026-10-17T00:02:30.000Z',
                ContactSheetFileIDs: { '16:9': ['12121212-3434-4565-8787-989898989898'] },
                Defects: [
                    {
                        Beat: 'beat-1',
                        Timestamp: 2.0,
                        Severity: 'Major',
                        Status: 'Open',
                        AssetKey: 'gen-ill',
                        Evidence: 'Visual artifact persists in gen-ill.',
                        Fix: 'Replace asset.',
                    },
                ],
            });

            // Round 2: RegenerationCount is already 1 (MaxRegenerations = 1) -> leaves asset in Approved and request Generated
            const afterRound2 = agent.ApplyStageResult(
                { payload: afterRound1 },
                'Video Studio - Critic',
                afterRound1,
            );
            expect(afterRound2.Assets?.Approved.some((a) => a.Key === 'gen-ill')).toBe(true);
            expect(afterRound2.Assets?.Generate?.[0]?.Status).toBe('Generated');
            expect(afterRound2.Assets?.Generate?.[0]?.RegenerationCount).toBe(1);
        });
    });
});

