import { describe, expect, it } from 'vitest';
import type { RubricNodeSnapshot } from '@memberjunction/rubrics-base';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';

import {
    BuildBeatsTable,
    BuildBoundValuesTable,
    BuildRepairBrief,
    BuildRubricCriteriaText,
    BuildTimelineTable,
    PickSheetsForCall,
} from '../review/critic-input.js';

describe('critic-input pure builders', () => {
    it('BuildRubricCriteriaText lists every Criterion node, omits Group nodes, and includes generated-assets-are-honest-and-disclosed', () => {
        const nodes: RubricNodeSnapshot[] = [
            {
                id: 'group-1',
                key: 'visual-craft',
                name: 'Visual Craft',
                description: 'Visual hierarchy and motion',
                guidance: 'Check layout and timing',
                nodeType: 'Group',
                sequence: 1,
                weight: 40,
                isAdvisory: false,
                isGate: false,
                evidenceRequired: false,
                rationaleRequired: false,
            },
            {
                id: 'crit-1',
                parentId: 'group-1',
                key: 'text-legibility-and-contrast',
                name: 'Text Legibility and Contrast',
                description: 'All on-screen text is readable at target resolution.',
                guidance: 'Inspect headlines and captions across frames.',
                nodeType: 'Criterion',
                sequence: 1,
                weight: 20,
                isAdvisory: false,
                isGate: false,
                evidenceRequired: true,
                rationaleRequired: true,
            },
            {
                id: 'group-2',
                key: 'integrity',
                name: 'Integrity & Disclosure',
                description: 'Truthfulness of data and assets',
                guidance: 'Verify bound data and generated assets',
                nodeType: 'Group',
                sequence: 2,
                weight: 60,
                isAdvisory: false,
                isGate: true,
                evidenceRequired: false,
                rationaleRequired: false,
            },
            {
                id: 'crit-2',
                parentId: 'group-2',
                key: 'generated-assets-are-honest-and-disclosed',
                name: 'Generated Assets Are Honest and Disclosed',
                description: 'No generated person is presented as real, no garbled generated text or look-alike logos.',
                guidance: 'Verify provenance and visual integrity of generated assets.',
                nodeType: 'Criterion',
                sequence: 1,
                weight: 30,
                isAdvisory: false,
                isGate: true,
                evidenceRequired: true,
                rationaleRequired: true,
            },
        ];

        const text = BuildRubricCriteriaText(nodes);

        expect(text).toContain(
            '- text-legibility-and-contrast (Text Legibility and Contrast, weight 20): All on-screen text is readable at target resolution. Inspect headlines and captions across frames.',
        );
        expect(text).toContain(
            '- generated-assets-are-honest-and-disclosed (Generated Assets Are Honest and Disclosed, weight 30): No generated person is presented as real, no garbled generated text or look-alike logos. Verify provenance and visual integrity of generated assets.',
        );
        expect(text).not.toContain('visual-craft');
        expect(text).not.toContain('Visual Craft');
        expect(text).not.toContain('Integrity & Disclosure');
    });

    it('BuildBeatsTable, BuildTimelineTable, and BuildBoundValuesTable render times and bound values', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Beats: [
                {
                    Key: 'hook',
                    Label: 'Hook Beat',
                    StartSeconds: 0,
                    EndSeconds: 4.5,
                    EntryState: 'Dark blank',
                    ExitState: 'KPI visible',
                    Purpose: 'Hook viewer with ARR growth',
                    OnScreenText: ['Revenue {yoy_growth}', 'Q3 2026'],
                    DataRefs: ['arr_total', 'yoy_growth'],
                    AssetRefs: ['hero_bg'],
                    LayoutNotes: { '16:9': 'Centered' },
                },
                {
                    Key: 'proof',
                    Label: 'Proof Beat',
                    StartSeconds: 4.5,
                    EndSeconds: 10.0,
                    EntryState: 'KPI visible',
                    ExitState: 'Chart settled',
                    Purpose: 'Show ARR breakdown',
                    OnScreenText: ['{arr_total} ARR'],
                    DataRefs: ['arr_total', 'yoy_growth'],
                    AssetRefs: [],
                    LayoutNotes: { '16:9': 'Split' },
                },
            ],
            Audio: {
                Captions: 'Burned',
                Narration: {
                    VoiceID: 'warm-narrator',
                    Provider: 'ElevenLabs',
                    Script: [
                        {
                            Key: 'line-1',
                            BeatKey: 'hook',
                            StartSeconds: 0.2,
                            DurationSeconds: 3.6,
                            Text: 'Annual recurring revenue jumped forty-two percent.',
                        },
                    ],
                },
                Cues: [
                    {
                        Key: 'cue-1',
                        BeatKey: 'hook',
                        TimestampSeconds: 0.5,
                        Kind: 'Sfx',
                        AssetKey: 'whoosh_sfx',
                        Notes: 'Transition hit',
                    },
                ],
            },
            DataBindings: [
                {
                    Key: 'arr_total',
                    Label: 'Total ARR',
                    Source: { Kind: 'Inline' },
                    Shape: 'Scalar',
                    Format: { Kind: 'Currency', Currency: 'USD', Decimals: 1 },
                },
                {
                    Key: 'yoy_growth',
                    Label: 'YoY Growth',
                    Source: { Kind: 'Inline' },
                    Shape: 'Scalar',
                    Format: { Kind: 'Percent', Decimals: 0 },
                },
            ],
        };

        const beatsTable = BuildBeatsTable(spec);
        expect(beatsTable).toContain('| hook |');
        expect(beatsTable).toContain('0.00');
        expect(beatsTable).toContain('4.50');
        expect(beatsTable).toContain('5.50');
        expect(beatsTable).toContain('Revenue {yoy_growth} / Q3 2026');
        expect(beatsTable).toContain('arr_total');

        const timelineTable = BuildTimelineTable(spec);
        expect(timelineTable).toContain('line-1');
        expect(timelineTable).toContain('0.20');
        expect(timelineTable).toContain('3.80');
        expect(timelineTable).toContain('Annual recurring revenue jumped forty-two percent.');
        expect(timelineTable).toContain('cue-1');
        expect(timelineTable).toContain('0.50');
        expect(timelineTable).toContain('Sfx');

        const boundValues = BuildBoundValuesTable(spec, {
            arr_total: 12400000,
            yoy_growth: 0.42,
        });
        expect(boundValues).toContain('arr_total');
        expect(boundValues).toContain('Total ARR');
        expect(boundValues).toContain('$12.4M');
        expect(boundValues).toContain('yoy_growth');
        expect(boundValues).toContain('42%');
    });

    it('PickSheetsForCall: 6 grids + 1 strip gives 4 grids + the strip; 2 + 1 gives all 3', () => {
        const sixGridsPlusStrip = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'strip'];
        expect(PickSheetsForCall(sixGridsPlusStrip)).toEqual(['g1', 'g2', 'g3', 'g4', 'strip']);

        const twoGridsPlusStrip = ['g1', 'g2', 'strip'];
        expect(PickSheetsForCall(twoGridsPlusStrip)).toEqual(['g1', 'g2', 'strip']);
    });

    it('BuildRepairBrief lists open defects from the newest round and appends the patch-only instruction', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Review: {
                Gates: [],
                Rounds: [
                    {
                        Round: 1,
                        Timestamp: '2026-10-16T12:00:00.000Z',
                        Summary: 'Round 1 issues',
                        Defects: [
                            {
                                Key: 'r1-16:9-1',
                                Format: '16:9',
                                Timestamp: 2.5,
                                Beat: 'hook',
                                Criterion: 'text-legibility-and-contrast',
                                Severity: 'Major',
                                Evidence: 'Headline overflows right margin',
                                Fix: 'Reduce headline font-size to 64px',
                                Status: 'Open',
                            },
                            {
                                Key: 'r1-9:16-1',
                                Format: '9:16',
                                Timestamp: 5.0,
                                Beat: 'proof',
                                Criterion: 'data-accuracy',
                                Severity: 'Minor',
                                Evidence: 'Already fixed',
                                Fix: 'N/A',
                                Status: 'Fixed',
                            },
                        ],
                    },
                ],
            },
        };

        const brief = BuildRepairBrief(spec);
        expect(brief).toContain('16:9');
        expect(brief).toContain('hook');
        expect(brief).toContain('2.5s');
        expect(brief).toContain('Headline overflows right margin');
        expect(brief).toContain('Reduce headline font-size to 64px');
        expect(brief).toContain('text-legibility-and-contrast');
        expect(brief).not.toContain('Already fixed');
        expect(brief).toContain(
            'Patch only these sections. Keep every other part of the composition unchanged.',
        );
    });
});
