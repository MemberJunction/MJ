import { describe, it, expect } from 'vitest';
import {
    DEFAULT_EXCEL_ADDIN_ID,
    DEFAULT_EXCEL_ADDIN_VERSION,
    DEFAULT_EXCEL_KEY_LIFETIME_DAYS,
    DEFAULT_EXCEL_MAX_ROWS,
    DEFAULT_EXCEL_STORE_TYPE,
    ParseExcelAddinSettings,
} from '../settings';

describe('ParseExcelAddinSettings', () => {
    it('fills defaults from ExplorerUrl alone and trims its trailing slash', () => {
        const result = ParseExcelAddinSettings({ ExplorerUrl: 'https://explorer.example.org/' });
        expect(result.Success).toBe(true);
        expect(result.Settings).toEqual({
            ExplorerUrl: 'https://explorer.example.org',
            ServerName: 'MemberJunction',
            AddinId: DEFAULT_EXCEL_ADDIN_ID,
            Version: DEFAULT_EXCEL_ADDIN_VERSION,
            KeyLifetimeDays: DEFAULT_EXCEL_KEY_LIFETIME_DAYS,
            Store: DEFAULT_EXCEL_STORE_TYPE,
            StoreType: DEFAULT_EXCEL_STORE_TYPE,
            MaxRows: DEFAULT_EXCEL_MAX_ROWS,
        });
    });

    it('keeps a path on ExplorerUrl', () => {
        expect(ParseExcelAddinSettings({ ExplorerUrl: 'https://example.org/app/' }).Settings?.ExplorerUrl).toBe('https://example.org/app');
    });

    it('accepts every setting a host may give, upper-casing the GUID', () => {
        const result = ParseExcelAddinSettings({
            ExplorerUrl: 'http://localhost:4201',
            ServerName: '  Cheese Federation ',
            AddinId: '0f8fad5b-d9cb-469f-a165-70867728950e',
            Version: '2.1.0.0',
            KeyLifetimeDays: 30,
            Store: 'https://sharepoint.example.org/catalog',
            StoreType: 'SPCatalog',
            MaxRows: 5000,
        });
        expect(result.Success).toBe(true);
        expect(result.Settings?.ServerName).toBe('Cheese Federation');
        expect(result.Settings?.AddinId).toBe('0F8FAD5B-D9CB-469F-A165-70867728950E');
        expect(result.Settings?.Store).toBe('https://sharepoint.example.org/catalog');
        expect(result.Settings?.StoreType).toBe('SPCatalog');
    });

    it('defaults Store to StoreType when only StoreType is given', () => {
        const result = ParseExcelAddinSettings({ ExplorerUrl: 'https://e.org', StoreType: 'OMEX' });
        expect(result.Settings?.Store).toBe('OMEX');
    });

    it.each([
        [{}, 'ExplorerUrl'],
        [null, 'ExplorerUrl'],
        [{ ExplorerUrl: 'ftp://e.org' }, 'ExplorerUrl'],
        [{ ExplorerUrl: 'not a url' }, 'ExplorerUrl'],
        [{ ExplorerUrl: 'https://e.org', AddinId: 'nope' }, 'AddinId'],
        [{ ExplorerUrl: 'https://e.org', Version: 'v1' }, 'Version'],
        [{ ExplorerUrl: 'https://e.org', KeyLifetimeDays: 0 }, 'KeyLifetimeDays'],
        [{ ExplorerUrl: 'https://e.org', KeyLifetimeDays: 366 }, 'KeyLifetimeDays'],
        [{ ExplorerUrl: 'https://e.org', KeyLifetimeDays: 1.5 }, 'KeyLifetimeDays'],
        [{ ExplorerUrl: 'https://e.org', MaxRows: 2000000 }, 'MaxRows'],
        [{ ExplorerUrl: 'https://e.org', ServerName: '' }, 'ServerName'],
        [{ ExplorerUrl: 'https://e.org', StoreType: 7 }, 'StoreType'],
    ])('refuses %j, naming %s', (raw, setting) => {
        const result = ParseExcelAddinSettings(raw);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(setting);
    });
});
