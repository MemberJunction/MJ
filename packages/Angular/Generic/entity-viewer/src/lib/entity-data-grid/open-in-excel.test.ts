import { describe, it, expect } from 'vitest';
import { CanOpenViewInExcel } from './open-in-excel';

const VIEW_ID = '6C0E0E8B-1F2A-4B3C-9D4E-5F6A7B8C9D0E';

describe('CanOpenViewInExcel', () => {
    it('offers Open in Excel for a saved view when the add-in is on', () => {
        expect(CanOpenViewInExcel(true, VIEW_ID, true)).toBe(true);
    });

    it('never offers it for a dynamic view, which has no saved view to name', () => {
        expect(CanOpenViewInExcel(true, null, true)).toBe(false);
        expect(CanOpenViewInExcel(true, undefined, true)).toBe(false);
        expect(CanOpenViewInExcel(true, '  ', true)).toBe(false);
    });

    it('hides it when the host doesn\'t serve the add-in', () => {
        expect(CanOpenViewInExcel(true, VIEW_ID, false)).toBe(false);
    });

    it('hides it when the host turns the button off', () => {
        expect(CanOpenViewInExcel(false, VIEW_ID, true)).toBe(false);
    });
});
