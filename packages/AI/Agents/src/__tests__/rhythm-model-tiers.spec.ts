import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJUserRoutineEntity } from '@memberjunction/core-entities';
import {
    NormalizeModelTierName,
    RHYTHM_DEFAULT_TIER_CATALOG,
    RHYTHM_TIER_TO_CONFIGURATION_NAME,
    ResolveAgentConfigurationIDInput,
    ResolveCatalogDefaultAgentConfigurationID,
    ResolveConfigurationNameForTier,
    ResolveDefaultTierForWorkstreamKey,
    ResolveRoutineSeededAgentConfigurationID,
    ResolveSeededRoutineAgentConfigurationID,
    ResolveWakeAgentConfigurationID,
} from '../rhythm-model-tiers';

const FAST_CONFIG_ID = '3A1C5A15-8DAA-44E5-A098-F20085E6C93F';
const STANDARD_CONFIG_ID = 'A76B1550-A6D8-4491-9EF6-A38A8F660FBC';
const HIGH_POWER_CONFIG_ID = 'B6B9D780-52B2-431B-93AB-AC83FEF78553';

const TEST_USER = new UserInfo(null, {
    ID: '11111111-1111-1111-1111-111111111111',
    Name: 'Alice User',
    Email: 'alice@example.com',
});

interface RhythmTemplateMetadataRecord {
    fields: {
        WorkstreamKey: string;
        Name: string;
        DefaultAgentConfigurationID?: string | null;
    };
}

interface AIConfigMetadataRecord {
    fields: {
        Name: string;
        Status: string;
    };
    primaryKey: {
        ID: string;
    };
}

class StubRunView extends RunView {
    private readonly handler: RunView['RunView'];

    public constructor(handler: RunView['RunView']) {
        super();
        this.handler = handler;
    }

    public override RunView: RunView['RunView'] = (params, contextUser) => this.handler(params, contextUser);
}

const STUB_METADATA_PROVIDER: IMetadataProvider = {
    GetEntityObject: vi.fn(),
} as Partial<IMetadataProvider> as IMetadataProvider;

describe('Rhythm Model Tiers (Slice 1)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('classifies Draft, Standard, and High rhythm templates cleanly', () => {
        expect(RHYTHM_TIER_TO_CONFIGURATION_NAME).toEqual({
            Draft: 'Fast',
            Standard: 'Standard',
            High: 'High Power',
        });

        expect(ResolveConfigurationNameForTier('Draft')).toBe('Fast');
        expect(ResolveConfigurationNameForTier('Standard')).toBe('Standard');
        expect(ResolveConfigurationNameForTier('High')).toBe('High Power');

        // Draft tier rhythms
        for (const key of ['tasks-daily-triage', 'calendar-daily-review', 'planning-huddle-prep', 'daily-15five']) {
            const spec = ResolveDefaultTierForWorkstreamKey(key);
            expect(spec?.Tier).toBe('Draft');
            expect(spec?.DefaultConfigurationName).toBe('Fast');
        }

        // Standard tier rhythms
        for (const key of [
            'tasks-weekly-review',
            'planning-weekly-okr-review',
            'planning-period-close',
            'calendar-weekly-review',
            'capability-review',
        ]) {
            const spec = ResolveDefaultTierForWorkstreamKey(key);
            expect(spec?.Tier).toBe('Standard');
            expect(spec?.DefaultConfigurationName).toBe('Standard');
        }

        // High tier rhythms
        for (const key of ['planning-midquarter-checkpoint', 'growth-coaching', 'project-risk-review']) {
            const spec = ResolveDefaultTierForWorkstreamKey(key);
            expect(spec?.Tier).toBe('High');
            expect(spec?.DefaultConfigurationName).toBe('High Power');
        }

        expect(RHYTHM_DEFAULT_TIER_CATALOG.length).toBeGreaterThanOrEqual(12);
    });

    it('normalizes logical tier aliases and configuration names consistently', () => {
        expect(NormalizeModelTierName('Draft')).toBe('Draft');
        expect(NormalizeModelTierName('fast')).toBe('Draft');
        expect(NormalizeModelTierName('standard')).toBe('Standard');
        expect(NormalizeModelTierName('High')).toBe('High');
        expect(NormalizeModelTierName('High Power')).toBe('High');
        expect(NormalizeModelTierName('high-power')).toBe('High');
        expect(NormalizeModelTierName('unrecognized-tier')).toBeNull();
    });

    it('seeds all 10 contracted rhythm templates and core CoS templates in metadata with valid AI Configuration lookups', () => {
        const repoRoot = path.resolve(__dirname, '../../../../..');
        const templatePath = path.join(repoRoot, 'metadata/rhythm-templates/.chief-of-staff-rhythm-templates.json');
        const configPath = path.join(repoRoot, 'metadata/ai-configurations/.ai-configurations.json');

        const templates = JSON.parse(fs.readFileSync(templatePath, 'utf8')) as RhythmTemplateMetadataRecord[];
        const configs = JSON.parse(fs.readFileSync(configPath, 'utf8')) as AIConfigMetadataRecord[];
        const configNames = new Set(configs.map((c) => c.fields.Name));

        const byKey = new Map(templates.map((t) => [t.fields.WorkstreamKey, t]));

        // Draft tier (Fast): Daily triage, calendar guard, huddle prep, 15Five draft
        for (const key of ['tasks-daily-triage', 'calendar-daily-review', 'planning-huddle-prep', 'daily-15five']) {
            expect(byKey.get(key)?.fields.DefaultAgentConfigurationID).toBe('@lookup:MJ: AI Configurations.Name=Fast');
        }

        // Standard tier (Standard): Weekly review, weekly OKR review, period close (+ weekly calendar & capability review)
        for (const key of [
            'tasks-weekly-review',
            'planning-weekly-okr-review',
            'planning-period-close',
            'calendar-weekly-review',
            'capability-review',
        ]) {
            expect(byKey.get(key)?.fields.DefaultAgentConfigurationID).toBe('@lookup:MJ: AI Configurations.Name=Standard');
        }

        // High tier (High Power): Mid-quarter checkpoint, growth coaching, project risk review
        for (const key of ['planning-midquarter-checkpoint', 'growth-coaching', 'project-risk-review']) {
            expect(byKey.get(key)?.fields.DefaultAgentConfigurationID).toBe('@lookup:MJ: AI Configurations.Name=High Power');
        }

        expect(templates.length).toBeGreaterThanOrEqual(12);

        for (const tmpl of templates) {
            const lookup = tmpl.fields.DefaultAgentConfigurationID;
            expect(lookup).toBeTruthy();
            const matchedName = lookup?.replace('@lookup:MJ: AI Configurations.Name=', '') ?? '';
            expect(configNames.has(matchedName)).toBe(true);
        }
    });

    it('falls back to resolving canonical configuration ID from RHYTHM_DEFAULT_TIER_CATALOG when DB template DefaultAgentConfigurationID is null', async () => {
        const runViewMock = vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Agent Rhythm Templates') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: '84586912-01F6-467A-B870-529D8D64AD26',
                            AgentID: '22222222-2222-2222-2222-222222222222',
                            WorkstreamKey: 'planning-midquarter-checkpoint',
                            DefaultAgentConfigurationID: null,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Configurations') {
                if (params.ExtraFilter?.includes("Name='High Power'")) {
                    return { Success: true, Results: [{ ID: HIGH_POWER_CONFIG_ID, Name: 'High Power', Status: 'Active' }] };
                }
                if (params.ExtraFilter?.includes("Name='Fast'")) {
                    return { Success: true, Results: [{ ID: FAST_CONFIG_ID, Name: 'Fast', Status: 'Active' }] };
                }
                if (params.ExtraFilter?.includes("Name='Standard'")) {
                    return { Success: true, Results: [{ ID: STANDARD_CONFIG_ID, Name: 'Standard', Status: 'Active' }] };
                }
            }
            return { Success: true, Results: [] };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(new StubRunView(runViewMock));

        // 1. Direct catalog resolution
        const catalogHigh = await ResolveCatalogDefaultAgentConfigurationID({
            workstreamKey: 'project-risk-review',
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(catalogHigh).toBe(HIGH_POWER_CONFIG_ID);

        // 2. Seeded routine creation fallback when templateDefaultAgentConfigurationID is null
        const seededFallback = await ResolveRoutineSeededAgentConfigurationID({
            templateDefaultAgentConfigurationID: null,
            workstreamKey: 'tasks-daily-triage',
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(seededFallback).toBe(FAST_CONFIG_ID);

        // Explicit null still wins when user clears configuration
        const explicitCleared = await ResolveRoutineSeededAgentConfigurationID({
            explicitAgentConfigurationID: null,
            templateDefaultAgentConfigurationID: STANDARD_CONFIG_ID,
            workstreamKey: 'tasks-weekly-review',
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(explicitCleared).toBeNull();

        // 3. Wake-time resolution falls back to catalog when both routine & DB template have null config
        const wakeResolved = await ResolveWakeAgentConfigurationID({
            routine: {
                AgentConfigurationID: null,
                TargetID: '22222222-2222-2222-2222-222222222222',
                WakeConfiguration: null,
                WakeConfigurationObject: { workstreamKey: 'planning-midquarter-checkpoint' },
            },
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(wakeResolved).toBe(HIGH_POWER_CONFIG_ID);
    });

    it('ships additive migration SQL adding DefaultAgentConfigurationID and AgentConfigurationID FKs', () => {
        const repoRoot = path.resolve(__dirname, '../../../../..');
        const migrationPath = path.join(repoRoot, 'migrations/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        expect(sql).toContain('ALTER TABLE [${flyway:defaultSchema}].[AIAgentRhythmTemplate]');
        expect(sql).toContain('[DefaultAgentConfigurationID] UNIQUEIDENTIFIER NULL');
        expect(sql).toContain('FK_AIAgentRhythmTemplate_AIConfiguration');

        expect(sql).toContain('ALTER TABLE [${flyway:defaultSchema}].[UserRoutine]');
        expect(sql).toContain('[AgentConfigurationID] UNIQUEIDENTIFIER NULL');
        expect(sql).toContain('FK_UserRoutine_AIConfiguration');
    });

    it('ships verified PostgreSQL counterpart matching T-SQL schema additions and policy defaults (CR-DUAL-DIALECT-CONTRACT)', () => {
        const repoRoot = path.resolve(__dirname, '../../../../..');
        const tsMigrationPath = path.join(repoRoot, 'migrations/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.sql');
        const pgMigrationPath = path.join(
            repoRoot,
            'migrations-pg/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.pg.sql'
        );

        const tsSql = fs.readFileSync(tsMigrationPath, 'utf8');
        expect(tsSql).not.toMatch(/deferred to the release build engineer/i);
        expect(tsSql).toContain('V202611220625__v6.3.x__Rhythm_Model_Tiers.pg.sql');

        expect(fs.existsSync(pgMigrationPath)).toBe(true);
        const pgSql = fs.readFileSync(pgMigrationPath, 'utf8');

        // Zero SQLConverter gap/error markers
        expect(pgSql).not.toContain('-- Could not parse');
        expect(pgSql).not.toContain('-- ERROR converting batch');
        expect(pgSql).not.toContain('-- UNPARSED');

        // Schema additions: DefaultAgentConfigurationID & AgentConfigurationID + FKs + views + functions
        expect(pgSql).toContain('ALTER TABLE __mj."AIAgentRhythmTemplate"');
        expect(pgSql).toContain('ADD COLUMN "DefaultAgentConfigurationID" UUID NULL');
        expect(pgSql).toContain('FK_AIAgentRhythmTemplate_AIConfiguration');

        expect(pgSql).toContain('ALTER TABLE __mj."UserRoutine"');
        expect(pgSql).toContain('ADD COLUMN "AgentConfigurationID" UUID NULL');
        expect(pgSql).toContain('FK_UserRoutine_AIConfiguration');

        expect(pgSql).toContain('CREATE OR REPLACE VIEW "__mj"."vwAIAgentRhythmTemplates"');
        expect(pgSql).toContain('CREATE OR REPLACE VIEW "__mj"."vwUserRoutines"');
        expect(pgSql).toContain('CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRhythmTemplate"');
        expect(pgSql).toContain('CREATE OR REPLACE FUNCTION "__mj"."spCreateUserRoutine"');

        // Policy defaults: Autonomous, DraftOnly, ProposeWithApproval, Disabled
        expect(pgSql).toContain('ALTER COLUMN "CoordinationMode" SET DEFAULT \'Autonomous\'');
        expect(pgSql).toContain('ALTER COLUMN "CalendarChannelMode" SET DEFAULT \'ProposeWithApproval\'');
        expect(pgSql).toContain('ALTER COLUMN "PhoneChannelMode" SET DEFAULT \'Disabled\'');
        expect(pgSql).toContain('CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentUserPolicy"');
        expect(pgSql).toContain("COALESCE(p_coordinationmode, 'Autonomous')");
        expect(pgSql).toContain("COALESCE(p_emailchannelmode, 'DraftOnly')");
        expect(pgSql).toContain("COALESCE(p_calendarchannelmode, 'ProposeWithApproval')");
        expect(pgSql).toContain("COALESCE(p_phonechannelmode, 'Disabled')");

        // Never emit unconditional DROP CONSTRAINT "DF_*" (PG defines defaults inline without named DF_* constraints)
        expect(pgSql).not.toMatch(/DROP\s+CONSTRAINT\s+"DF_/i);
        expect(pgSql).toContain('DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_CoordinationMode"');
        expect(pgSql).toContain('DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_CalendarChannelMode"');
        expect(pgSql).toContain('DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_PhoneChannelMode"');

        // Verify compatibility with inline defaults defined in V202610171900__v6.2.x__AIAgentUserPolicy_And_UserRoutine_Wake.pg.sql
        const priorPgMigrationPath = path.join(
            repoRoot,
            'migrations-pg/v6/V202610171900__v6.2.x__AIAgentUserPolicy_And_UserRoutine_Wake.pg.sql'
        );
        const priorPgSql = fs.readFileSync(priorPgMigrationPath, 'utf8');
        expect(priorPgSql).toContain('CREATE TABLE __mj."AIAgentUserPolicy"');
        expect(priorPgSql).not.toContain('DF_AIAgentUserPolicy_');
        expect(priorPgSql).toMatch(/"EmailChannelMode"\s+VARCHAR\(20\)\s+NOT\s+NULL\s+DEFAULT\s+\(\s*'DraftOnly'\s*\)/i);
    });

    it('emits valid PL/pgSQL control flow for every CREATE OR REPLACE FUNCTION in the PG counterpart (CR-PG-UPDATE-BODY-SCOPELOCK)', () => {
        const repoRoot = path.resolve(__dirname, '../../../../..');
        const pgMigrationPath = path.join(
            repoRoot,
            'migrations-pg/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.pg.sql'
        );
        const pgSql = fs.readFileSync(pgMigrationPath, 'utf8');

        // Zero standalone LIMIT 0; statements (the prior IF @@ROWCOUNT = 0 -> SELECT TOP 0 bug)
        expect(pgSql).not.toMatch(/^\s*LIMIT\s+0\s*;/im);
        expect(pgSql).not.toContain('WHERE 1=0');

        // Extract every CREATE OR REPLACE FUNCTION "__mj"."..." ... $$ LANGUAGE plpgsql; body
        const fnMatches = [
            ...pgSql.matchAll(
                /CREATE OR REPLACE FUNCTION "__mj"\."(\w+)"[\s\S]*?\$\$\s*([\s\S]*?)\n\$\$ LANGUAGE plpgsql;/g
            ),
        ];
        const fnNames = fnMatches.map((m) => m[1]);
        expect(fnNames).toEqual(
            expect.arrayContaining([
                'spCreateAIAgentRhythmTemplate',
                'spUpdateAIAgentRhythmTemplate',
                'spCreateUserRoutine',
                'spUpdateUserRoutine',
                'spCreateAIAgentUserPolicy',
            ])
        );

        for (const [, fnName, body] of fnMatches) {
            const ifThenCount = (body.match(/\bIF\b[\s\S]*?\bTHEN\b/gi) ?? []).length;
            const endIfCount = (body.match(/\bEND\s+IF\s*;/gi) ?? []).length;
            expect(endIfCount, `${fnName} IF...THEN / END IF; balance`).toBe(ifThenCount);

            // Every statement immediately preceding ELSE must end with a semicolon
            const lines = body.split('\n');
            for (let idx = 0; idx < lines.length; idx++) {
                if (/^\s*ELSE\s*$/i.test(lines[idx])) {
                    let prevIdx = idx - 1;
                    while (prevIdx >= 0 && !lines[prevIdx].trim()) {
                        prevIdx--;
                    }
                    expect(prevIdx, `${fnName} statement before ELSE`).toBeGreaterThanOrEqual(0);
                    expect(lines[prevIdx].trimEnd().endsWith(';'), `${fnName} line before ELSE: ${lines[prevIdx]}`).toBe(true);
                }
            }
        }

        // Verify both spUpdate* functions guard empty updates cleanly before RETURN QUERY
        for (const fnName of ['spUpdateAIAgentRhythmTemplate', 'spUpdateUserRoutine']) {
            const match = fnMatches.find((m) => m[1] === fnName);
            expect(match, `${fnName} should exist`).toBeDefined();
            const body = match![2];
            expect(body).toContain('IF v_updated_count = 0 THEN');
            expect(body).toContain('RETURN;');
            expect(body).toContain('RETURN QUERY');
            expect(body).toContain('END IF;');
        }
    });

    it('seeds routine AgentConfigurationID from template default on creation unless explicitly overridden', () => {
        expect(
            ResolveSeededRoutineAgentConfigurationID({
                templateDefaultAgentConfigurationID: FAST_CONFIG_ID,
            })
        ).toBe(FAST_CONFIG_ID);

        expect(
            ResolveSeededRoutineAgentConfigurationID({
                explicitAgentConfigurationID: HIGH_POWER_CONFIG_ID,
                templateDefaultAgentConfigurationID: FAST_CONFIG_ID,
            })
        ).toBe(HIGH_POWER_CONFIG_ID);

        // Explicit null clears configuration even when template defines a default
        expect(
            ResolveSeededRoutineAgentConfigurationID({
                explicitAgentConfigurationID: null,
                templateDefaultAgentConfigurationID: FAST_CONFIG_ID,
            })
        ).toBeNull();
    });

    it('resolves routine.AgentConfigurationID ?? template.DefaultAgentConfigurationID at wake time across users', async () => {
        const templateID = 'F0294D16-F2B7-4DA2-897F-B9FB27FD5BF5';
        const cosAgentID = '22222222-2222-2222-2222-222222222222';

        const runViewMock = vi.fn().mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agent Rhythm Templates') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: templateID,
                            AgentID: cosAgentID,
                            WorkstreamKey: 'calendar-daily-review',
                            DefaultAgentConfigurationID: FAST_CONFIG_ID,
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(new StubRunView(runViewMock));

        // User 1 uses template default (AgentConfigurationID null -> falls back to template Fast/Draft tier)
        const user1Routine: Pick<
            MJUserRoutineEntity,
            'AgentConfigurationID' | 'TargetID' | 'WakeConfiguration' | 'WakeConfigurationObject'
        > = {
            AgentConfigurationID: null,
            TargetID: cosAgentID,
            WakeConfiguration: null,
            WakeConfigurationObject: {
                workstreamKey: 'calendar-daily-review',
                resumeState: { rhythmTemplateID: templateID },
            },
        };

        // User 2 overrides their routine to High Power without affecting User 1 or template
        const user2Routine: Pick<
            MJUserRoutineEntity,
            'AgentConfigurationID' | 'TargetID' | 'WakeConfiguration' | 'WakeConfigurationObject'
        > = {
            AgentConfigurationID: HIGH_POWER_CONFIG_ID,
            TargetID: cosAgentID,
            WakeConfiguration: null,
            WakeConfigurationObject: {
                workstreamKey: 'calendar-daily-review',
                resumeState: { rhythmTemplateID: templateID },
            },
        };

        const user1Resolved = await ResolveWakeAgentConfigurationID({
            routine: user1Routine,
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        const user2Resolved = await ResolveWakeAgentConfigurationID({
            routine: user2Routine,
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });

        expect(user1Resolved).toBe(FAST_CONFIG_ID);
        expect(user2Resolved).toBe(HIGH_POWER_CONFIG_ID);
    });

    it('falls back to workstreamKey template lookup when rhythmTemplateID is absent from wakeConfig', async () => {
        const cosAgentID = '33333333-3333-3333-3333-333333333333';
        const runViewMock = vi.fn().mockResolvedValue({
            Success: true,
            Results: [
                {
                    ID: '01532AD0-302D-4C70-A054-608866F86670',
                    AgentID: cosAgentID,
                    WorkstreamKey: 'calendar-weekly-review',
                    DefaultAgentConfigurationID: STANDARD_CONFIG_ID,
                },
            ],
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(new StubRunView(runViewMock));

        const routine: Pick<
            MJUserRoutineEntity,
            'AgentConfigurationID' | 'TargetID' | 'WakeConfiguration' | 'WakeConfigurationObject'
        > = {
            AgentConfigurationID: null,
            TargetID: cosAgentID,
            WakeConfiguration: JSON.stringify({ workstreamKey: 'calendar-weekly-review' }),
            WakeConfigurationObject: null,
        };

        const resolved = await ResolveWakeAgentConfigurationID({
            routine,
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(resolved).toBe(STANDARD_CONFIG_ID);
    });

    it('resolves logical ModelTier names and validates UUID overrides via MJ: AI Configurations', async () => {
        const runViewMock = vi.fn().mockImplementation(async (params: { ExtraFilter?: string }) => {
            if (params.ExtraFilter?.includes("Name='High Power'")) {
                return {
                    Success: true,
                    Results: [{ ID: HIGH_POWER_CONFIG_ID, Name: 'High Power', Status: 'Active' }],
                };
            }
            if (params.ExtraFilter?.includes(FAST_CONFIG_ID)) {
                return {
                    Success: true,
                    Results: [{ ID: FAST_CONFIG_ID, Name: 'Fast', Status: 'Active' }],
                };
            }
            return { Success: true, Results: [] };
        });
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(new StubRunView(runViewMock));

        const byTier = await ResolveAgentConfigurationIDInput({
            modelTier: 'High',
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(byTier).toEqual({ Provided: true, ConfigurationID: HIGH_POWER_CONFIG_ID });

        const byID = await ResolveAgentConfigurationIDInput({
            agentConfigurationID: FAST_CONFIG_ID,
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(byID).toEqual({ Provided: true, ConfigurationID: FAST_CONFIG_ID });

        const missing = await ResolveAgentConfigurationIDInput({
            agentConfigurationID: '99999999-9999-9999-9999-999999999999',
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(missing.Provided).toBe(true);
        expect(missing.ConfigurationID).toBeNull();
        expect(missing.ErrorMessage).toContain('was not found');

        const omitted = await ResolveAgentConfigurationIDInput({
            contextUser: TEST_USER,
            metadataProvider: STUB_METADATA_PROVIDER,
        });
        expect(omitted).toEqual({ Provided: false, ConfigurationID: null });
    });
});
