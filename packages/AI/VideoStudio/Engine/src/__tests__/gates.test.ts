import { describe, expect, it } from 'vitest';
import type { GateRecord } from '@memberjunction/video-studio-core';
import {
    CheckStagePrerequisite,
    ClearStaleEvidence,
    DeriveStatus,
    DescribeStageProgress,
    DescribeStoryboardForApproval,
    EvaluateGates,
    ReadApprovalDecision,
    type GateEvaluationContext,
} from '../gates.js';
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
                Kind: 'Photo',
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
        it('passes in Autonomous mode when Storyboarded validation passes', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Review.Gates = [];
            const g2 = getGate(EvaluateGates(spec, standardCtx), 'G2');
            expect(g2.Status).toBe('Passed');
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

        it('fails when ValidateVideoGenerationSpec at Storyboarded fails', () => {
            const spec = CreateDeliveredSpecFixture();
            spec.Beats[0].StartSeconds = 3; // breaks contiguous 0-start beats invariant
            const g2 = getGate(EvaluateGates(spec, standardCtx), 'G2');
            expect(g2.Status).toBe('Failed');
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
                    Category: 'Overlap',
                    Severity: 'Major',
                    Evidence: 'Headline overlaps KPI label on 9:16',
                    SuggestedFix: 'Reduce headline font size on 9:16',
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
                            Category: 'Overflow',
                            Severity: 'Blocker',
                            Evidence: 'Clipped text',
                            SuggestedFix: 'Shrink text',
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
        it('passes on DELIVERED_SPEC_FIXTURE', () => {
            expect(getGate(EvaluateGates(DELIVERED_SPEC_FIXTURE, standardCtx), 'G6').Status).toBe('Passed');
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
        it('parses structured form tokens and explicit prefix approval tokens conservatively', () => {
            expect(
                ReadApprovalDecision(
                    'Approved.\n\n@{"_mode":"form","action":"form","fields":[{"name":"decision","value":"approve"}]}',
                ),
            ).toBe('Approve');
            expect(
                ReadApprovalDecision(
                    '@{"_mode":"form","action":"form","fields":[{"name":"decision","value":"reject"}]}',
                ),
            ).toBe('Reject');
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

            // Failed G3 blocks Critic
            const failedG3Spec = CreateDeliveredSpecFixture();
            failedG3Spec.Review.Gates = [
                { Gate: 'G3', Status: 'Failed', EvidenceRefs: [], Timestamp: '2026-10-17T00:01:05.000Z' },
            ];
            const failedG3Gates = EvaluateGates(failedG3Spec, standardCtx);
            expect(
                CheckStagePrerequisite('Video Studio - Critic', failedG3Spec, failedG3Gates, standardCtx.Settings),
            ).toContain('G3 (Stills)');
        });
    });

    describe('ClearStaleEvidence and formatting helpers', () => {
        it('clears G2/G3/G4, Output.Source, and render evidence after Storyboard, and clears render evidence + G3 after Motion Engineer', () => {
            const afterStoryboard = CreateDeliveredSpecFixture();
            ClearStaleEvidence('Video Studio - Storyboard', afterStoryboard);
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
            expect(afterMotion.Review.Gates.some((g) => g.Gate === 'G3')).toBe(false);
        });

        it('formats DescribeStoryboardForApproval and DescribeStageProgress cleanly', () => {
            const spec = CreateDeliveredSpecFixture();
            const md = DescribeStoryboardForApproval(spec);
            expect(md).toContain('## Storyboard Review');
            expect(md).toContain('beat-1');
            expect(md).toContain('nar-1');

            expect(DescribeStageProgress('Video Studio - Director', spec)).toContain('Brief ready:');
            expect(DescribeStageProgress('Video Studio - Storyboard', spec)).toContain('Storyboard ready:');
        });
    });
});
