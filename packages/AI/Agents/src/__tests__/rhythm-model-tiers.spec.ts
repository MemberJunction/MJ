import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentRhythmTemplateEntity,
    MJUserRoutineEntity,
} from '@memberjunction/core-entities';
import {
    NormalizeModelTierName,
    RHYTHM_DEFAULT_TIER_CATALOG,
    RHYTHM_TIER_TO_CONFIGURATION_NAME,
    ResolveAgentConfigurationIDInput,
    ResolveConfigurationNameForTier,
    ResolveDefaultTierForWorkstreamKey,
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
        expect(NormalizeModelTierName('unknown-tier')).toBeNull();
    });

    it('seeds core Chief of Staff rhythm template metadata with valid AI Configuration lookups', () => {
        const repoRoot = path.resolve(__dirname, '../../../../..');
        const templatePath = path.join(repoRoot, 'metadata/rhythm-templates/.chief-of-staff-rhythm-templates.json');
        const configPath = path.join(repoRoot, 'metadata/ai-configurations/.ai-configurations.json');

        const templates = JSON.parse(fs.readFileSync(templatePath, 'utf8')) as RhythmTemplateMetadataRecord[];
        const configs = JSON.parse(fs.readFileSync(configPath, 'utf8')) as AIConfigMetadataRecord[];
        const configNames = new Set(configs.map((c) => c.fields.Name));

        const byKey = new Map(templates.map((t) => [t.fields.WorkstreamKey, t]));
        expect(byKey.get('calendar-daily-review')?.fields.DefaultAgentConfigurationID).toBe(
            '@lookup:MJ: AI Configurations.Name=Fast'
        );
        expect(byKey.get('calendar-weekly-review')?.fields.DefaultAgentConfigurationID).toBe(
            '@lookup:MJ: AI Configurations.Name=Standard'
        );
        expect(byKey.get('capability-review')?.fields.DefaultAgentConfigurationID).toBe(
            '@lookup:MJ: AI Configurations.Name=Standard'
        );

        for (const tmpl of templates) {
            const lookup = tmpl.fields.DefaultAgentConfigurationID;
            expect(lookup).toBeTruthy();
            const matchedName = lookup?.replace('@lookup:MJ: AI Configurations.Name=', '') ?? '';
            expect(configNames.has(matchedName)).toBe(true);
        }
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
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewMock } as unknown as RunView);

        // User 1 uses template default (AgentConfigurationID null -> falls back to template Fast/Draft tier)
        const user1Routine = {
            AgentConfigurationID: null,
            TargetID: cosAgentID,
            WakeConfiguration: null,
            WakeConfigurationObject: {
                workstreamKey: 'calendar-daily-review',
                resumeState: { rhythmTemplateID: templateID },
            },
        } as unknown as MJUserRoutineEntity;

        // User 2 overrides their routine to High Power without affecting User 1 or template
        const user2Routine = {
            AgentConfigurationID: HIGH_POWER_CONFIG_ID,
            TargetID: cosAgentID,
            WakeConfiguration: null,
            WakeConfigurationObject: {
                workstreamKey: 'calendar-daily-review',
                resumeState: { rhythmTemplateID: templateID },
            },
        } as unknown as MJUserRoutineEntity;

        const user1Resolved = await ResolveWakeAgentConfigurationID({
            routine: user1Routine,
            contextUser: TEST_USER,
            metadataProvider: {} as MJAIAgentRhythmTemplateEntity['ContextUser'] & NonNullable<unknown>,
        });
        const user2Resolved = await ResolveWakeAgentConfigurationID({
            routine: user2Routine,
            contextUser: TEST_USER,
            metadataProvider: {} as MJAIAgentRhythmTemplateEntity['ContextUser'] & NonNullable<unknown>,
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
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewMock } as unknown as RunView);

        const routine = {
            AgentConfigurationID: null,
            TargetID: cosAgentID,
            WakeConfiguration: JSON.stringify({ workstreamKey: 'calendar-weekly-review' }),
            WakeConfigurationObject: null,
        } as unknown as MJUserRoutineEntity;

        const resolved = await ResolveWakeAgentConfigurationID({
            routine,
            contextUser: TEST_USER,
            metadataProvider: {} as NonNullable<unknown>,
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
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runViewMock } as unknown as RunView);

        const byTier = await ResolveAgentConfigurationIDInput({
            modelTier: 'High',
            contextUser: TEST_USER,
            metadataProvider: {} as NonNullable<unknown>,
        });
        expect(byTier).toEqual({ Provided: true, ConfigurationID: HIGH_POWER_CONFIG_ID });

        const byID = await ResolveAgentConfigurationIDInput({
            agentConfigurationID: FAST_CONFIG_ID,
            contextUser: TEST_USER,
            metadataProvider: {} as NonNullable<unknown>,
        });
        expect(byID).toEqual({ Provided: true, ConfigurationID: FAST_CONFIG_ID });

        const missing = await ResolveAgentConfigurationIDInput({
            agentConfigurationID: '99999999-9999-9999-9999-999999999999',
            contextUser: TEST_USER,
            metadataProvider: {} as NonNullable<unknown>,
        });
        expect(missing.Provided).toBe(true);
        expect(missing.ConfigurationID).toBeNull();
        expect(missing.ErrorMessage).toContain('was not found');

        const omitted = await ResolveAgentConfigurationIDInput({
            contextUser: TEST_USER,
            metadataProvider: {} as NonNullable<unknown>,
        });
        expect(omitted).toEqual({ Provided: false, ConfigurationID: null });
    });
});
