import { describe, it, expect } from 'vitest';
import { AUTO_SHOW_TASKPANE_ID, BuildExcelAddinManifest, EscapeXml } from '../manifest-builder';

const options = {
    AddinId: 'AAEB4761-75CC-4DB1-99BD-7790FAD307C6',
    Version: '1.0.0.0',
    ServerName: 'Cheese Federation',
    AddinUrl: 'https://api.example.org/api/office/excel/',
    ExplorerUrl: 'https://explorer.example.org/app',
};

describe('BuildExcelAddinManifest', () => {
    const xml = BuildExcelAddinManifest(options);

    it('is a TaskPaneApp for Excel workbooks with this host\'s identity', () => {
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        expect(xml).toContain('xsi:type="TaskPaneApp"');
        expect(xml).toContain(`<Id>${options.AddinId}</Id>`);
        expect(xml).toContain('<Host Name="Workbook"/>');
        expect(xml).toContain('<DisplayName DefaultValue="Cheese Federation"/>');
        expect(xml).toContain('<Permissions>ReadWriteDocument</Permissions>');
    });

    it('points every URL at the add-in base without a doubled slash', () => {
        expect(xml).toContain('<SourceLocation DefaultValue="https://api.example.org/api/office/excel/taskpane.html"/>');
        expect(xml).toContain('<IconUrl DefaultValue="https://api.example.org/api/office/excel/assets/icon-32.png"/>');
        expect(xml).toContain('<HighResolutionIconUrl DefaultValue="https://api.example.org/api/office/excel/assets/icon-64.png"/>');
        expect(xml).toContain('assets/icon-16.png');
        expect(xml).toContain('assets/icon-80.png');
        expect(xml).not.toContain('excel//');
    });

    it('lists Explorer\'s origin as an app domain', () => {
        expect(xml).toContain('<AppDomain>https://explorer.example.org</AppDomain>');
    });

    it('requires the Excel and dialog API sets the pane uses', () => {
        expect(xml).toContain('<Set Name="ExcelApi" MinVersion="1.4"/>');
        expect(xml).toContain('<Set Name="DialogApi" MinVersion="1.1"/>');
    });

    it('opens the pane under the auto-show TaskpaneId from a ribbon button on the Data tab', () => {
        expect(xml).toContain(`<TaskpaneId>${AUTO_SHOW_TASKPANE_ID}</TaskpaneId>`);
        expect(xml).toContain('<OfficeTab id="TabData">');
        expect(xml).toContain('xsi:type="VersionOverridesV1_0"');
    });

    it('keeps the base manifest elements in schema order', () => {
        const order = ['<Id>', '<Version>', '<ProviderName>', '<DefaultLocale>', '<DisplayName', '<Description', '<IconUrl',
            '<HighResolutionIconUrl', '<SupportUrl', '<AppDomains>', '<Hosts>', '<Requirements>', '<DefaultSettings>',
            '<Permissions>', '<VersionOverrides'];
        const positions = order.map(tag => xml.indexOf(tag));
        expect(positions.every(p => p >= 0)).toBe(true);
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it('escapes host text', () => {
        const hostile = BuildExcelAddinManifest({ ...options, ServerName: 'A & B <"Co">' });
        expect(hostile).toContain('<DisplayName DefaultValue="A &amp; B &lt;&quot;Co&quot;&gt;"/>');
        expect(hostile).not.toContain('A & B <"Co">');
    });
});

describe('EscapeXml', () => {
    it('escapes the five XML specials', () => {
        expect(EscapeXml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
    });
});
