import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseWorkHandler } from '../handlers/BaseWorkHandler';
import { IsWorkHandlerRegistered } from '../handlers/ResolveWorkHandler';
import { ExpandSubscriptionRequests, PlanHostedSubscriptions } from '../host/HostedSubscriptionPlanner';
import type { HostedSubscriptionPlan, RunnableSubscriptionPlan } from '../host/HostedSubscriptionPlanner';
import { BuildHostScenario, IDS, RecordingWorkHandler, TestHandlerProbe } from './runtimeFakes';

function byName(plans: HostedSubscriptionPlan[], name: string): HostedSubscriptionPlan {
    const plan = plans.find(p => p.Name === name);
    if (!plan) {
        throw new Error(`no plan for ${name}`);
    }
    return plan;
}

function runnable(plans: HostedSubscriptionPlan[], name: string): RunnableSubscriptionPlan {
    const plan = byName(plans, name);
    if (plan.Kind !== 'Runnable') {
        throw new Error(`${name} is ${plan.State}: ${plan.Reason}`);
    }
    return plan;
}

describe('IsWorkHandlerRegistered', () => {
    it('answers from the ClassFactory without constructing the handler', () => {
        MJGlobal.Instance.ClassFactory.Register(BaseWorkHandler, RecordingWorkHandler, 'test.probe-handler');
        const before = RecordingWorkHandler.Constructed;
        expect(IsWorkHandlerRegistered(' Test.Probe-Handler ')).toBe(true);
        expect(IsWorkHandlerRegistered('test.no-such-handler')).toBe(false);
        expect(IsWorkHandlerRegistered('  ')).toBe(false);
        expect(RecordingWorkHandler.Constructed).toBe(before);
    });
});

describe('ExpandSubscriptionRequests', () => {
    it("expands '*' to MJWorker subscriptions, sorted, and lets explicit entries override concurrency", () => {
        const { Engine } = BuildHostScenario();
        const expanded = ExpandSubscriptionRequests([{ Name: '*', Concurrency: 2 }, { Name: 'INTEGRATION.APPLY', Concurrency: 9 }], Engine);
        expect(expanded.map(e => [e.Name, e.Concurrency])).toEqual([
            ['email.ordered', 2], ['email.subscriber-update', 2], ['integration.apply', 9],
            ['integration.audit', 2], ['integration.paused', 2],
        ]);
    });
});

describe('PlanHostedSubscriptions', () => {
    it('reports an unknown named subscription as an error', async () => {
        const { Engine } = BuildHostScenario();
        const [plan] = await PlanHostedSubscriptions([{ Name: 'nope', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(plan).toEqual({ Kind: 'Blocked', Name: 'nope', State: 'Error', Reason: "Subscription 'nope' not found" });
    });

    it('refuses an External subscription named explicitly', async () => {
        const { Engine } = BuildHostScenario();
        const [plan] = await PlanHostedSubscriptions([{ Name: 'email.dashboard', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(plan).toMatchObject({ State: 'Unsupported', Reason: "HostType 'External' subscriptions run outside MJ" });
    });

    it('pauses subscriptions that are not Active and subscriptions whose topic is Disabled', async () => {
        const scenario = BuildHostScenario();
        const plans = await PlanHostedSubscriptions([{ Name: '*', Concurrency: 1 }], scenario.Engine, TestHandlerProbe);
        expect(byName(plans, 'integration.paused')).toMatchObject({ State: 'Paused', Reason: 'Subscription status is Paused' });

        scenario.Engine.Topics = scenario.Engine.Topics.map(t => (t.Name === 'integration.batch-ready' ? Object.assign(t, { Status: 'Disabled' }) : t));
        const again = await PlanHostedSubscriptions([{ Name: 'integration.apply', Concurrency: 1 }], scenario.Engine, TestHandlerProbe);
        expect(again[0]).toMatchObject({ State: 'Paused', Reason: "Topic 'integration.batch-ready' is Disabled" });
    });

    it('reports a transport driver failure as an error', async () => {
        const { Engine } = BuildHostScenario();
        Engine.DriverErrors.set(IDS.AwsTransport, new Error('credentials rejected'));
        const [plan] = await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(plan).toMatchObject({ State: 'Error', Reason: 'Transport driver unavailable: credentials rejected' });
    });

    it('refuses Ordered on a cloud transport and runs it on the Database transport', async () => {
        const scenario = BuildHostScenario();
        const [cloud] = await PlanHostedSubscriptions([{ Name: 'email.ordered', Concurrency: 1 }], scenario.Engine, TestHandlerProbe);
        expect(cloud.Kind).toBe('Blocked');
        expect(cloud.Kind === 'Blocked' ? cloud.State : '').toBe('Unsupported');
        expect(cloud.Kind === 'Blocked' ? cloud.Reason : '').toContain('Database transport');

        const database = runnable(await PlanHostedSubscriptions([{ Name: 'integration.apply', Concurrency: 1 }], scenario.Engine, TestHandlerProbe), 'integration.apply');
        expect(database.ConsumerDriver).toBe(scenario.DatabaseDriver);
    });

    it('reports a missing or blank handler key', async () => {
        const { Engine } = BuildHostScenario();
        const [missing] = await PlanHostedSubscriptions([{ Name: 'integration.audit', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(missing).toMatchObject({ State: 'HandlerNotRegistered', Reason: "No BaseWorkHandler is registered for HandlerKey 'handler.missing'" });

        Object.assign(Engine.Subscription('integration.audit'), { HandlerKey: null });
        const [blank] = await PlanHostedSubscriptions([{ Name: 'integration.audit', Concurrency: 1 }], Engine, TestHandlerProbe);
        expect(blank).toMatchObject({ State: 'HandlerNotRegistered', Reason: "No BaseWorkHandler is registered for HandlerKey '(none)'" });
    });

    it('runs a subscription on its topic driver with a signature that tracks concurrency, constructing no handler', async () => {
        const scenario = BuildHostScenario();
        const before = RecordingWorkHandler.Constructed;
        const first = runnable(await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 1 }], scenario.Engine, TestHandlerProbe), 'email.subscriber-update');
        const second = runnable(await PlanHostedSubscriptions([{ Name: 'email.subscriber-update', Concurrency: 3 }], scenario.Engine, TestHandlerProbe), 'email.subscriber-update');
        expect(first.ConsumerDriver).toBe(scenario.AwsDriver);
        expect(first.HandlerKey).toBe('handler.ok');
        expect(first.Signature).not.toBe(second.Signature);
        expect(RecordingWorkHandler.Constructed).toBe(before);
    });
});
