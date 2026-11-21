import { describe, it, expect } from 'vitest';
import { IsTemplateDataCaptureMode, TEMPLATE_DATA_CAPTURE_MODES, MAX_TEMPLATE_DATA_SHAPE_KEYS } from '../prompt-run-messages.types';

describe('IsTemplateDataCaptureMode', () => {
    it('lists the three modes', () => {
        expect(TEMPLATE_DATA_CAPTURE_MODES).toEqual(['None', 'Referenced', 'Full']);
    });
    it('accepts the three modes', () => {
        for (const mode of TEMPLATE_DATA_CAPTURE_MODES) expect(IsTemplateDataCaptureMode(mode)).toBe(true);
    });
    it('rejects other values, case-sensitively', () => {
        for (const v of ['none', 'FULL', '', 'Partial', null, undefined]) expect(IsTemplateDataCaptureMode(v)).toBe(false);
    });
    it('caps shape records at 25 keys, the action-log limit', () => {
        expect(MAX_TEMPLATE_DATA_SHAPE_KEYS).toBe(25);
    });
});
