import { describe, expect, it } from 'vitest';
import type {
  MJCommunicationEndpointEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
  MJCommunicationPreferenceEntity,
} from '@memberjunction/core-entities';
import {
  ComputeTrackingSignature,
  RewriteLinksForTracking,
  V2SendService,
  VerifyTrackingSignature,
} from '../V2SendService';
import { CommsActivityWorker } from '../CommsActivityWorker';
import { ComplianceGate } from '../compliance/ComplianceGate';
import { QuietHoursRuleDriver } from '../compliance/rules/QuietHoursRuleDriver';

describe('Comms V2 Security & Correctness Regression Tests', () => {
  it('decodes &amp; in multi-query-param URLs before signing click tracking links', () => {
    const secret = 'test-secret-key-32-chars-minimum!';
    const token = 'tok-multi-param';
    const html = '<a href="https://example.org/path?a=1&amp;b=2&amp;c=hello%20world">Go</a>';

    const rewritten = RewriteLinksForTracking(html, token, secret, 'https://api.example.org');
    const match = rewritten.match(/href="([^"]+)"/);
    expect(match).not.toBeNull();

    const parsed = new URL(match![1]);
    const targetUrl = parsed.searchParams.get('u');
    const sig = parsed.searchParams.get('sig');
    expect(targetUrl).toBe('https://example.org/path?a=1&b=2&c=hello%20world');
    expect(sig).toBeTruthy();
    expect(VerifyTrackingSignature(token, targetUrl!, sig!, secret)).toBe(true);
    expect(sig).toBe(ComputeTrackingSignature(token, 'https://example.org/path?a=1&b=2&c=hello%20world', secret));
  });

  it('Hard Bounce still blocks in Shadow mode even when another suppression appears first', () => {
    const gate = new ComplianceGate();
    const sender = {
      ID: 'sender-1',
      Name: 'Default',
      EnforcementMode: 'Shadow',
    } as unknown as MJCommunicationSenderEntity;
    const endpoint = {
      ID: 'ep-1',
      NormalizedValue: 'bounced@example.com',
    } as unknown as MJCommunicationEndpointEntity;
    const adminBlock = {
      CommunicationEndpointID: 'ep-1',
      EntityID: null,
      RecordID: null,
      CommunicationSenderID: null,
      BaseMessageTypeID: null,
      CommunicationPreferenceID: null,
      Reason: 'Admin Block',
      Status: 'Active',
      ExpiresAt: null,
    } as unknown as MJCommunicationSuppressionEntity;
    const hardBounce = {
      CommunicationEndpointID: 'ep-1',
      EntityID: null,
      RecordID: null,
      CommunicationSenderID: null,
      BaseMessageTypeID: null,
      CommunicationPreferenceID: null,
      Reason: 'Hard Bounce',
      Status: 'Active',
      ExpiresAt: null,
    } as unknown as MJCommunicationSuppressionEntity;

    const result = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        MessageClass: 'Operational',
        ChannelID: 'chan-email',
        Now: new Date(),
      },
      {
        Suppressions: [adminBlock, hardBounce],
        InstanceEnforcementMode: 'Shadow',
      },
    );

    expect(result.Decision).toBe('Blocked');
    expect(result.Detail).toContain('Hard Bounce');
  });

  it('QuietHoursRuleDriver falls back to UTC on non-IANA timezone without throwing', () => {
    const driver = new QuietHoursRuleDriver();
    const merged = driver.MergeStrictest([{ startHour: 22, endHour: 6 }]);
    const sender = { ID: 's1', Configuration: null } as unknown as MJCommunicationSenderEntity;
    const endpoint = { ID: 'e1' } as unknown as MJCommunicationEndpointEntity;

    const outcome = driver.Evaluate(merged, {
      Sender: sender,
      SenderAncestors: [],
      Endpoint: endpoint,
      MessageClass: 'Marketing',
      ChannelID: 'chan-email',
      PrincipalAttributes: { Timezone: 'NOT_A_VALID_IANA_TZ' },
      Now: new Date('2026-11-19T14:00:00Z'),
    });

    expect(outcome.Passed).toBe(true);
  });

  it('ComplianceGate enforces Endpoint.Status (blocks Hard Bounced/Invalid/Erased even in Shadow, blocks Complained for Marketing)', () => {
    const gate = new ComplianceGate();
    const sender = {
      ID: 'sender-1',
      Name: 'Default',
      EnforcementMode: 'Shadow',
    } as unknown as MJCommunicationSenderEntity;

    for (const status of ['Hard Bounced', 'Invalid', 'Erased'] as const) {
      const ep = { ID: 'ep-1', NormalizedValue: 'x@example.com', Status: status } as unknown as MJCommunicationEndpointEntity;
      const res = gate.Evaluate(
        { Sender: sender, SenderAncestors: [], Endpoint: ep, MessageClass: 'Transactional', ChannelID: 'chan-email', Now: new Date() },
        { Suppressions: [], InstanceEnforcementMode: 'Shadow' },
      );
      expect(res.Decision).toBe('Blocked');
    }

    const newsletter = { ID: 'pref-1', Name: 'Newsletter', MessageClass: 'Marketing', DefaultState: 'Opted In', Status: 'Active' } as unknown as MJCommunicationPreferenceEntity;
    const complainedEp = { ID: 'ep-2', NormalizedValue: 'c@example.com', Status: 'Complained' } as unknown as MJCommunicationEndpointEntity;
    const enforceSender = { ID: 'sender-2', Name: 'Default', EnforcementMode: 'Enforce' } as unknown as MJCommunicationSenderEntity;
    const complainedMkt = gate.Evaluate(
      { Sender: enforceSender, SenderAncestors: [], Endpoint: complainedEp, Preference: newsletter, MessageClass: 'Marketing', ChannelID: 'chan-email', Now: new Date() },
      { Suppressions: [] },
    );
    expect(complainedMkt.Decision).toBe('Blocked');
    expect(complainedMkt.Reason).toBe('Spam Complaint');

    const softBouncingEp = { ID: 'ep-3', NormalizedValue: 'sb@example.com', Status: 'Soft Bouncing' } as unknown as MJCommunicationEndpointEntity;
    const softRes = gate.Evaluate(
      { Sender: enforceSender, SenderAncestors: [], Endpoint: softBouncingEp, Preference: newsletter, MessageClass: 'Marketing', ChannelID: 'chan-email', Now: new Date() },
      { Suppressions: [] },
    );
    expect(softRes.Decision).toBe('Allowed');
  });

  it('CommsActivityWorker matches SendGrid sg_message_id with .filter suffix to base ProviderMessageID', () => {
    const worker = new CommsActivityWorker() as unknown as {
      buildLogCorrelationFilter(ev: Record<string, unknown>): string | undefined;
    };
    const filter = worker.buildLogCorrelationFilter({
      CommunicationProviderID: 'prov-sg',
      ProviderMessageID: '14c5d75ce93.dfd.64b469.filter0001.16648.5515E0B88.0',
    });
    expect(filter).toContain("ProviderMessageID='14c5d75ce93.dfd.64b469.filter0001.16648.5515E0B88.0'");
    expect(filter).toContain("ProviderMessageID='14c5d75ce93.dfd.64b469'");
  });

  it('V2SendService validates body obligations and detects tampered protected elements', () => {
    const svc = new V2SendService() as unknown as {
      validateBodyObligations(
        payload: { Body?: string; HTMLBody?: string; Headers: Record<string, string> },
        obligations: Record<string, unknown>,
      ): string | undefined;
      assertProtectedElementsIntact(
        payload: { Body?: string; HTMLBody?: string; Headers: Record<string, string> },
        snapshot: Record<string, unknown>,
      ): void;
    };

    const err = svc.validateBodyObligations(
      { HTMLBody: '<p>Hello</p>', Headers: {} },
      { RequireFooterUnsubscribe: true, UnsubscribeURL: 'https://api.example.org/comms/unsubscribe/tok' },
    );
    expect(err).toContain('missing required footer unsubscribe link');

    expect(() =>
      svc.assertProtectedElementsIntact(
        { HTMLBody: '<p>Hello</p>', Headers: { 'List-Unsubscribe': '<https://evil.example>' } },
        { ListUnsubscribe: '<https://api.example.org/comms/unsubscribe/tok>' },
      ),
    ).toThrow(/Protected List-Unsubscribe header failed integrity check/);
  });
});
