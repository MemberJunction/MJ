import { describe, it, expect, vi } from 'vitest';
import { ApplyPlattCalibration } from '@memberjunction/ai';
import {
    CalibrateEdgeLogitToConfidence,
    EdgeDiscoveryAnsweredBy,
    EDGE_PRE_DISCOVERY_CALIBRATION_KEY,
    EDGE_PRE_DISCOVERY_CALIBRATION_MODEL,
    EDGE_PRE_DISCOVERY_CROSS_ENCODER_RESOLVED_MODEL,
    EDGE_PRE_DISCOVERY_DATA_KEY,
    EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID,
    EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION,
    EDGE_PRE_DISCOVERY_LOGIT_THRESHOLD,
    EDGE_PRE_DISCOVERY_MAX_CANDIDATES,
    EDGE_PRE_DISCOVERY_MIN_CONFIDENCE,
    IsEdgePreDiscoveryHintConfident,
    ReadEdgePreDiscoveryHint,
    ResolveEdgePreDiscoveryCalibration,
    SanitizeEdgePreDiscoveryHint,
    type EdgePreDiscoveryHint,
} from '../edge-pre-discovery';

const AGENT_A = '11111111-1111-4111-8111-111111111111';
const AGENT_B = '22222222-2222-4222-8222-222222222222';
const AGENT_C = '33333333-3333-4333-8333-333333333333';
const SECRET_AGENT = '99999999-9999-4999-8999-999999999999';
const UNKNOWN_AGENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('EdgePreDiscoveryHint contract & sanitization', () => {
    it('CalibrateEdgeLogitToConfidence maps threshold logit -2.0 to >= 0.85 and lower logits below 0.85', () => {
        expect(CalibrateEdgeLogitToConfidence(EDGE_PRE_DISCOVERY_LOGIT_THRESHOLD)).toBeGreaterThanOrEqual(
            EDGE_PRE_DISCOVERY_MIN_CONFIDENCE
        );
        expect(CalibrateEdgeLogitToConfidence(-1.0)).toBeGreaterThan(0.9);
        expect(CalibrateEdgeLogitToConfidence(-3.0)).toBeLessThan(0.75);
        expect(CalibrateEdgeLogitToConfidence(-5.0)).toBeLessThan(0.3);
        expect(CalibrateEdgeLogitToConfidence(Number.NaN)).toBe(0);
        expect(CalibrateEdgeLogitToConfidence(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('SanitizeEdgePreDiscoveryHint discards unauthorized, non-existent, malformed, and duplicate IDs', () => {
        const allowed = [{ ID: AGENT_A }, { ID: AGENT_B }, { ID: AGENT_C }];
        const forged: Record<string, unknown> = {
            CandidateAgentIds: [
                SECRET_AGENT,
                ` ${AGENT_A.toUpperCase()} `,
                UNKNOWN_AGENT,
                12345,
                null,
                AGENT_A, // duplicate
                AGENT_B,
            ],
            SuggestedAgentId: SECRET_AGENT,
            Confidence: 0.99,
            TopLogit: 2.5,
            ModelId: EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID,
        };

        const sanitized = SanitizeEdgePreDiscoveryHint(forged, allowed);
        expect(sanitized).toEqual({
            CandidateAgentIds: [AGENT_A.toUpperCase(), AGENT_B],
            ModelId: EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID,
        });
        expect(sanitized?.SuggestedAgentId).toBeUndefined();
        expect(sanitized?.Confidence).toBeUndefined();
        expect(sanitized?.TopLogit).toBeUndefined();
    });

    it('returns null when no permitted agent IDs survive sanitization or input is malformed', () => {
        const allowed = [{ ID: AGENT_A }];
        expect(SanitizeEdgePreDiscoveryHint(null, allowed)).toBeNull();
        expect(SanitizeEdgePreDiscoveryHint('not-an-object', allowed)).toBeNull();
        expect(SanitizeEdgePreDiscoveryHint([], allowed)).toBeNull();
        expect(
            SanitizeEdgePreDiscoveryHint(
                { CandidateAgentIds: [SECRET_AGENT, UNKNOWN_AGENT], SuggestedAgentId: SECRET_AGENT, Confidence: 1 },
                allowed
            )
        ).toBeNull();
        expect(SanitizeEdgePreDiscoveryHint({ CandidateAgentIds: [AGENT_A] }, [])).toBeNull();
    });

    it('caps CandidateAgentIds at EDGE_PRE_DISCOVERY_MAX_CANDIDATES', () => {
        const allowed = Array.from({ length: 40 }, (_, i) => ({
            ID: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        }));
        const raw = {
            CandidateAgentIds: allowed.map((a) => a.ID),
        };
        const sanitized = SanitizeEdgePreDiscoveryHint(raw, allowed);
        expect(sanitized?.CandidateAgentIds.length).toBe(EDGE_PRE_DISCOVERY_MAX_CANDIDATES);
    });

    it('IsEdgePreDiscoveryHintConfident rejects low TopLogit even if Confidence was forged high', () => {
        const forgedLowLogit: EdgePreDiscoveryHint = {
            CandidateAgentIds: [AGENT_A, AGENT_B],
            SuggestedAgentId: AGENT_A,
            Confidence: 0.99,
            TopLogit: -4.5,
        };
        expect(IsEdgePreDiscoveryHintConfident(forgedLowLogit)).toBe(false);

        const validConfident: EdgePreDiscoveryHint = {
            CandidateAgentIds: [AGENT_A, AGENT_B],
            SuggestedAgentId: AGENT_A,
            TopLogit: -1.8,
            Confidence: CalibrateEdgeLogitToConfidence(-1.8),
        };
        expect(IsEdgePreDiscoveryHintConfident(validConfident)).toBe(true);
    });

    it('ReadEdgePreDiscoveryHint extracts hint under EDGE_PRE_DISCOVERY_DATA_KEY', () => {
        const hint = { CandidateAgentIds: [AGENT_A] };
        expect(ReadEdgePreDiscoveryHint({ [EDGE_PRE_DISCOVERY_DATA_KEY]: hint })).toBe(hint);
        expect(ReadEdgePreDiscoveryHint(undefined)).toBeUndefined();
    });

    it('uses ApplyPlattCalibration via metadata ResolveEdgePreDiscoveryCalibration with PoC fallback', () => {
        const rawProb = 1 / (1 + Math.exp(-(-2.0)));
        const expected = Number(
            ApplyPlattCalibration(rawProb, EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION).toFixed(4)
        );
        expect(CalibrateEdgeLogitToConfidence(-2.0)).toBe(expected);

        expect(EdgeDiscoveryAnsweredBy(EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID)).toEqual({
            ModelName: EDGE_PRE_DISCOVERY_CALIBRATION_MODEL,
            ResolvedModel: EDGE_PRE_DISCOVERY_CROSS_ENCODER_RESOLVED_MODEL,
        });

        const finder = vi.fn().mockReturnValue({ A: 1.5, B: 2.2 });
        const fit = ResolveEdgePreDiscoveryCalibration(
            { FindDecisionCalibration: finder },
            EDGE_PRE_DISCOVERY_DEFAULT_MODEL_ID
        );
        expect(fit).toEqual({ A: 1.5, B: 2.2 });
        expect(finder).toHaveBeenCalledWith(EDGE_PRE_DISCOVERY_CALIBRATION_KEY, {
            ModelName: EDGE_PRE_DISCOVERY_CALIBRATION_MODEL,
            ResolvedModel: EDGE_PRE_DISCOVERY_CROSS_ENCODER_RESOLVED_MODEL,
        });

        // Falls back cleanly when lookup returns null or throws
        expect(ResolveEdgePreDiscoveryCalibration({ FindDecisionCalibration: () => null })).toEqual(
            EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION
        );
        expect(
            ResolveEdgePreDiscoveryCalibration({
                FindDecisionCalibration: () => {
                    throw new Error('engine not loaded');
                },
            })
        ).toEqual(EDGE_PRE_DISCOVERY_DEFAULT_PLATT_CALIBRATION);

        // Stricter calibration override rejects borderline logit (-2.0) even with forged Confidence
        const strictFit = { A: 1.0, B: 2.0 };
        expect(CalibrateEdgeLogitToConfidence(-2.0, strictFit)).toBe(0.5);
        expect(
            IsEdgePreDiscoveryHintConfident(
                {
                    CandidateAgentIds: [AGENT_A, AGENT_B],
                    SuggestedAgentId: AGENT_A,
                    TopLogit: -2.0,
                    Confidence: 0.99,
                },
                EDGE_PRE_DISCOVERY_MIN_CONFIDENCE,
                EDGE_PRE_DISCOVERY_LOGIT_THRESHOLD,
                strictFit
            )
        ).toBe(false);
    });
});
