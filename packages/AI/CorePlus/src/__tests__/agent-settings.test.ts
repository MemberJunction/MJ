import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ParseAgentSettings } from '../agent-settings';

const __filename = fileURLToPath(import.meta.url);
const CORE_PLUS_AGENT_SETTINGS = join(dirname(__filename), '../agent-settings.ts');
const METADATA_AGENT_SETTINGS = join(dirname(__filename), '../../../../../metadata/entities/JSONType-interfaces/IAgentSettings.ts');

function extractInterfaceBody(filePath: string): string {
    const text = readFileSync(filePath, 'utf8');
    const start = text.indexOf('export interface IAgentSettings {');
    if (start === -1) return '';
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1).trim();
            }
        }
    }
    return '';
}

describe('ParseAgentSettings', () => {
    it('keeps metadata/entities/JSONType-interfaces/IAgentSettings.ts and packages/AI/CorePlus/src/agent-settings.ts in exact lockstep', () => {
        const coreBody = extractInterfaceBody(CORE_PLUS_AGENT_SETTINGS);
        const metadataBody = extractInterfaceBody(METADATA_AGENT_SETTINGS);
        expect(coreBody.length).toBeGreaterThan(100);
        expect(coreBody).toBe(metadataBody);
    });

    it('returns null for absent, blank, malformed and non-object payloads (an app with no usable settings has no app layer)', () => {
        expect(ParseAgentSettings(null)).toBeNull();
        expect(ParseAgentSettings(undefined)).toBeNull();
        expect(ParseAgentSettings('   ')).toBeNull();
        expect(ParseAgentSettings('{nope')).toBeNull();
        expect(ParseAgentSettings('[1]')).toBeNull();
        expect(ParseAgentSettings('"x"')).toBeNull();
    });

    it('parses the whole shape, including Realtime.Channels and BrowserExtension, without touching it', () => {
        const settings = ParseAgentSettings(
            JSON.stringify({
                DefaultAgentID: 'A1',
                RelevantAgents: [{ AgentID: 'A2', Label: 'Skip' }],
                ClientTools: [{ Name: 'Export', Priority: 1 }],
                Realtime: {
                    Disclosure: 'silent',
                    Channels: {
                        Include: ['IdentityVerification', 'LocalBrowser'],
                        Exclude: ['Media'],
                        Config: { Media: { a: 1 } },
                        DisplayPolicy: { Media: 'on-demand' },
                    },
                },
                BrowserExtension: {
                    DefaultControlBackend: 'content-script',
                    AllowDebuggerCDP: true,
                    BrandKitID: 'BK-1',
                    BlockedDomains: ['*.1password.com'],
                    ContextRules: [
                        {
                            Key: 'common.organization.by-domain',
                            SourceApp: '@mj-biz-apps/common',
                            Name: 'Organization by Domain',
                            Priority: 10,
                            IsActive: true,
                            UrlMatch: { IncludePatterns: ['*://*/*'], ExcludePatterns: ['*://*.google.com/*'] },
                            Extractor: { DriverClass: 'StandardPageExtractor' },
                            EntityResolution: {
                                EntityName: 'MJ_BizApps_Common: Organizations',
                                FilterTemplate: "WebsiteDomain = '{{hostnameRoot}}'",
                                MaxRows: 5,
                            },
                        },
                    ],
                    EntityFacets: [
                        {
                            Key: 'sales.active-deals',
                            AnchorEntityName: 'MJ_BizApps_Common: Organizations',
                            ApplicationName: 'Sales',
                            Title: 'Active Deals',
                            IconClass: 'fa-solid fa-handshake',
                            Sequence: 1,
                            Query: {
                                EntityName: 'MJ_BizApps_Sales: Deals',
                                FilterTemplate: "OrganizationID = '{{AnchorRecordID}}'",
                                MaxRows: 5,
                            },
                            Surface: {
                                Renderer: 'entity-cards',
                                EmptyStateBehavior: 'show-quick-create',
                            },
                        },
                    ],
                },
            }),
        );
        expect(settings?.DefaultAgentID).toBe('A1');
        expect(settings?.RelevantAgents).toHaveLength(1);
        expect(settings?.ClientTools?.[0].Name).toBe('Export');
        expect(settings?.Realtime?.Channels?.Include).toEqual(['IdentityVerification', 'LocalBrowser']);
        expect(settings?.Realtime?.Channels?.DisplayPolicy).toEqual({ Media: 'on-demand' });
        expect(settings?.BrowserExtension?.DefaultControlBackend).toBe('content-script');
        expect(settings?.BrowserExtension?.AllowDebuggerCDP).toBe(true);
        expect(settings?.BrowserExtension?.ContextRules).toHaveLength(1);
        expect(settings?.BrowserExtension?.EntityFacets).toHaveLength(1);
    });

    it('drops container members of the wrong type instead of coercing them', () => {
        const settings = ParseAgentSettings(
            JSON.stringify({
                RelevantAgents: 'x',
                ClientTools: {},
                Realtime: 5,
                BrowserExtension: 'bad',
                DefaultAgentID: 'A',
            }),
        );
        expect(settings).toEqual({ DefaultAgentID: 'A' });

        const nestedBad = ParseAgentSettings(
            JSON.stringify({
                BrowserExtension: {
                    DefaultControlBackend: 'content-script',
                    ContextRules: 'not-an-array',
                    EntityFacets: 123,
                    BlockedDomains: {},
                },
            }),
        );
        expect(nestedBad?.BrowserExtension).toEqual({ DefaultControlBackend: 'content-script' });
    });

    it('keeps an explicit null Realtime or BrowserExtension block', () => {
        expect(ParseAgentSettings(JSON.stringify({ Realtime: null, BrowserExtension: null }))).toEqual({
            Realtime: null,
            BrowserExtension: null,
        });
    });
});
