import { describe, it, expect } from 'vitest';
import {
    CanOpenViewInExcel,
    ExcelSourceMenuDescription,
    ExcelSourceTooltip,
    OPEN_ENTITY_IN_EXCEL_TOOLTIP,
    OPEN_VIEW_IN_EXCEL_TOOLTIP,
    ResolveGridExcelSource,
} from './open-in-excel';

const VIEW_ID = '6C0E0E8B-1F2A-4B3C-9D4E-5F6A7B8C9D0E';
const ENTITY_ID = '9B8A7C6D-5E4F-4321-8765-1A2B3C4D5E6F';

describe('CanOpenViewInExcel', () => {
    it('offers Open in Excel for a saved view when the add-in is on', () => {
        expect(CanOpenViewInExcel(true, VIEW_ID, true)).toBe(true);
    });

    it('returns false when no saved view ID is provided', () => {
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

describe('ResolveGridExcelSource', () => {
    it('prefers a saved view source when SavedViewID is present', () => {
        expect(
            ResolveGridExcelSource({
                ShowButton: true,
                AddinEnabled: true,
                SavedViewID: VIEW_ID,
                EntityID: ENTITY_ID,
            }),
        ).toEqual({ Kind: 'View', ID: VIEW_ID });
    });

    it('resolves an Entity source for an unscoped (Default) entity grid', () => {
        expect(
            ResolveGridExcelSource({
                ShowButton: true,
                AddinEnabled: true,
                SavedViewID: null,
                EntityID: ENTITY_ID,
            }),
        ).toEqual({ Kind: 'Entity', ID: ENTITY_ID });
    });

    it('returns null for a scoped related-entity subgrid with ExtraFilter and no SavedViewID', () => {
        expect(
            ResolveGridExcelSource({
                ShowButton: true,
                AddinEnabled: true,
                SavedViewID: null,
                EntityID: ENTITY_ID,
                ExtraFilter: "OrganizationID = '11111111-1111-1111-1111-111111111111'",
            }),
        ).toBeNull();
        expect(
            ResolveGridExcelSource({
                ShowButton: true,
                AddinEnabled: true,
                SavedViewID: null,
                EntityID: ENTITY_ID,
                ExtraFilter: { default: "OrganizationID = '1'", sqlserver: "OrganizationID = '1'" },
            }),
        ).toBeNull();
    });

    it('returns null for an ad-hoc AlternateBaseView without a SavedViewID', () => {
        expect(
            ResolveGridExcelSource({
                ShowButton: true,
                AddinEnabled: true,
                SavedViewID: null,
                EntityID: ENTITY_ID,
                AlternateBaseView: 'vwPeopleCustom',
            }),
        ).toBeNull();
    });

    it('returns null when the add-in is disabled or ShowButton is false', () => {
        expect(ResolveGridExcelSource({ ShowButton: true, AddinEnabled: false, EntityID: ENTITY_ID })).toBeNull();
        expect(ResolveGridExcelSource({ ShowButton: false, AddinEnabled: true, EntityID: ENTITY_ID })).toBeNull();
    });

    it('returns source-appropriate tooltips and menu descriptions', () => {
        expect(ExcelSourceTooltip({ Kind: 'View', ID: VIEW_ID })).toBe(OPEN_VIEW_IN_EXCEL_TOOLTIP);
        expect(ExcelSourceTooltip({ Kind: 'Entity', ID: ENTITY_ID })).toBe(OPEN_ENTITY_IN_EXCEL_TOOLTIP);
        expect(ExcelSourceMenuDescription({ Kind: 'View', ID: VIEW_ID })).toContain('saved view');
        expect(ExcelSourceMenuDescription({ Kind: 'Entity', ID: ENTITY_ID })).toContain('entity records');
    });
});
