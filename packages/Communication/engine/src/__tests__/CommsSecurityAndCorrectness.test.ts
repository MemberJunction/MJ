import { describe, expect, it } from 'vitest';
import type {
  MJCommunicationEndpointEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import {
  ComputeTrackingSignature,
  RewriteLinksForTracking,
  VerifyTrackingSignature,
} from '../V2SendService';
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
});
