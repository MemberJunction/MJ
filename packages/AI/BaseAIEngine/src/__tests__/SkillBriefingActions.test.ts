import { describe, it, expect } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
    MJAIAgentSkillEntity,
    MJAISkillActionEntity,
    MJAISkillEntity,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '../BaseAIEngine';

function buildBaseEngineWithFixtures(): {
    engine: AIEngineBase;
    cosAgent: MJAIAgentEntityExtended;
    user: UserInfo;
} {
    const engine = AIEngineBase.Instance;
    const priv = engine as unknown as {
        _skills: MJAISkillEntity[];
        _skillActions: MJAISkillActionEntity[];
        _agentSkills: MJAIAgentSkillEntity[];
        _skillPermissions: unknown[];
    };

    const tasksSkill = {
        ID: 'skill-tasks',
        Name: 'Chief of Staff Tasks & To-dos',
        Status: 'Active',
        ActivationMode: 'Auto',
    } as unknown as MJAISkillEntity;

    const planningSkill = {
        ID: 'skill-planning',
        Name: 'Strategic Plan & OKRs',
        Status: 'Active',
        ActivationMode: 'Auto',
    } as unknown as MJAISkillEntity;

    const deprecatedSkill = {
        ID: 'skill-old',
        Name: 'Deprecated Skill',
        Status: 'Deprecated',
        ActivationMode: 'Auto',
    } as unknown as MJAISkillEntity;

    priv._skills = [tasksSkill, planningSkill, deprecatedSkill];
    priv._skillActions = [
        { ID: 'sa-1', SkillID: 'skill-tasks', ActionID: 'act-find-tasks', Role: 'Tool', ExposeToModel: true },
        { ID: 'sa-2', SkillID: 'skill-tasks', ActionID: 'act-tasks-briefing', Role: 'Briefing', ExposeToModel: false },
        { ID: 'sa-3', SkillID: 'skill-planning', ActionID: 'act-planning-briefing', Role: 'Both', ExposeToModel: true },
        { ID: 'sa-4', SkillID: 'skill-old', ActionID: 'act-old-briefing', Role: 'Briefing', ExposeToModel: false },
    ] as unknown as MJAISkillActionEntity[];

    priv._agentSkills = [
        { ID: 'as-1', AgentID: 'agent-cos', SkillID: 'skill-tasks', Status: 'Active' },
        { ID: 'as-2', AgentID: 'agent-cos', SkillID: 'skill-planning', Status: 'Active' },
        { ID: 'as-3', AgentID: 'agent-cos', SkillID: 'skill-old', Status: 'Active' },
    ] as unknown as MJAIAgentSkillEntity[];
    priv._skillPermissions = [];

    const cosAgent = {
        ID: 'agent-cos',
        Name: 'Chief of Staff',
        AcceptsSkills: 'All',
        SkillActivationMode: 'Auto',
    } as unknown as MJAIAgentEntityExtended;

    const user = {
        ID: 'user-1',
        Name: 'Alice',
        Email: 'alice@example.com',
        Type: 'User',
        UserRoles: [],
    } as unknown as UserInfo;

    return { engine, cosAgent, user };
}

describe('AIEngineBase — AISkillAction.Role Briefing Contributor Discovery', () => {
    it('GetSkillBriefingActionIDs returns only Briefing and Both roles, excluding Tool', () => {
        const { engine } = buildBaseEngineWithFixtures();
        expect(engine.GetSkillBriefingActionIDs('skill-tasks')).toEqual(['act-tasks-briefing']);
        expect(engine.GetSkillBriefingActionIDs('skill-planning')).toEqual(['act-planning-briefing']);
    });

    it('GetBriefingActionsForAgent collects Briefing/Both actions across active granted skills and excludes deprecated skills', () => {
        const { engine, cosAgent, user } = buildBaseEngineWithFixtures();
        const entries = engine.GetBriefingActionsForAgent(cosAgent, user);

        expect(entries.map((e) => ({ skill: e.skill.Name, actionID: e.actionID }))).toEqual([
            { skill: 'Chief of Staff Tasks & To-dos', actionID: 'act-tasks-briefing' },
            { skill: 'Strategic Plan & OKRs', actionID: 'act-planning-briefing' },
        ]);
    });

    it('respects AcceptsSkills=None and returns an empty array', () => {
        const { engine, cosAgent, user } = buildBaseEngineWithFixtures();
        const noSkillsAgent = { ...cosAgent, AcceptsSkills: 'None' } as unknown as MJAIAgentEntityExtended;
        expect(engine.GetBriefingActionsForAgent(noSkillsAgent, user)).toEqual([]);
    });
});
