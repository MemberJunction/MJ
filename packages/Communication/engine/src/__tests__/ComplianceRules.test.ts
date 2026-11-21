import { describe, expect, it } from 'vitest';
import type {
  ComplianceEvalContext,
  PrincipalAttributes,
} from '@memberjunction/communication-types';
import type {
  MJCommunicationEndpointEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationSenderEntity,
} from '@memberjunction/core-entities';
import {
  ConsentEvidenceRuleDriver,
  ConsentExpiryRuleDriver,
  ConsentModelRuleDriver,
  QuietHoursRuleDriver,
  RequireDoubleOptInRuleDriver,
  SenderIdentificationRuleDriver,
  TrackingConsentRuleDriver,
  UnsubscribeHonorWindowRuleDriver,
  UnsubscribeMechanismRuleDriver,
} from '../compliance/rules';

function makeContext(overrides: Partial<ComplianceEvalContext> = {}): ComplianceEvalContext {
  const sender = {
    ID: 'sender-1',
    Name: 'Example Association',
    FromName: 'Example Association Team',
    PostalAddress: '100 Example Ave, Springfield, IL',
    Configuration: null,
  } as MJCommunicationSenderEntity;

  const endpoint = {
    ID: 'ep-1',
    BaseMessageTypeID: 'chan-email',
    NormalizedValue: 'user@example.com',
  } as MJCommunicationEndpointEntity;

  return {
    Sender: sender,
    SenderAncestors: [],
    Endpoint: endpoint,
    MessageClass: 'Marketing',
    ChannelID: 'chan-email',
    Now: new Date('2026-06-15T12:00:00Z'),
    ...overrides,
  };
}

describe('Compliance Rule Drivers', () => {
  describe('ConsentModelRuleDriver', () => {
    const driver = new ConsentModelRuleDriver();

    it('merges opt-in over opt-out and preserves softOptIn only when all opt-in regimes allow it', () => {
      expect(driver.MergeStrictest([{ model: 'opt-out' }, { model: 'opt-in', softOptIn: true }])).toEqual({
        Model: 'opt-in',
        SoftOptIn: true,
      });
      expect(
        driver.MergeStrictest([
          { model: 'opt-in', softOptIn: true },
          { model: 'opt-in', softOptIn: false },
        ]),
      ).toEqual({
        Model: 'opt-in',
        SoftOptIn: false,
      });
    });

    it('allows softOptIn for existing customer without preference row, blocks non-existing', () => {
      const merged = { Model: 'opt-in' as const, SoftOptIn: true };
      const existingAttrs: PrincipalAttributes = { IsExistingCustomer: true };
      expect(driver.Evaluate(merged, makeContext({ PrincipalAttributes: existingAttrs })).Passed).toBe(
        true,
      );
      expect(driver.Evaluate(merged, makeContext()).Passed).toBe(false);
    });
  });

  describe('RequireDoubleOptInRuleDriver', () => {
    const driver = new RequireDoubleOptInRuleDriver();

    it('requires OptInMethod === Double and State === Opted In', () => {
      const merged = driver.MergeStrictest([{ required: false }, { required: true }]);
      expect(merged.Required).toBe(true);

      const singlePref = {
        State: 'Opted In',
        OptInMethod: 'Single',
      } as MJCommunicationPrincipalPreferenceEntity;
      expect(driver.Evaluate(merged, makeContext({ PrincipalPreference: singlePref })).Passed).toBe(
        false,
      );

      const doublePref = {
        State: 'Opted In',
        OptInMethod: 'Double',
      } as MJCommunicationPrincipalPreferenceEntity;
      expect(driver.Evaluate(merged, makeContext({ PrincipalPreference: doublePref })).Passed).toBe(
        true,
      );
    });
  });

  describe('ConsentEvidenceRuleDriver', () => {
    const driver = new ConsentEvidenceRuleDriver();

    it('merges true per field and validates source, timestamp, consentText', () => {
      const merged = driver.MergeStrictest([
        { requireSource: true },
        { requireTimestamp: true, requireConsentText: true },
      ]);
      expect(merged).toEqual({
        RequireSource: true,
        RequireTimestamp: true,
        RequireConsentText: true,
      });

      const incomplete = {
        ConsentSource: 'Signup Form',
        ConsentAt: new Date(),
        ConsentText: '',
      } as MJCommunicationPrincipalPreferenceEntity;
      const fail = driver.Evaluate(merged, makeContext({ PrincipalPreference: incomplete }));
      expect(fail.Passed).toBe(false);
      expect(fail.FailureReason).toContain('ConsentText');

      const complete = {
        ConsentSource: 'Signup Form',
        ConsentAt: new Date(),
        ConsentText: 'I agree to receive marketing emails.',
      } as MJCommunicationPrincipalPreferenceEntity;
      expect(driver.Evaluate(merged, makeContext({ PrincipalPreference: complete })).Passed).toBe(
        true,
      );
    });
  });

  describe('ConsentExpiryRuleDriver', () => {
    const driver = new ConsentExpiryRuleDriver();

    it('picks shortest maxDays and blocks expired consent', () => {
      const merged = driver.MergeStrictest([{ maxDays: 730 }, { maxDays: 180 }]);
      expect(merged.MaxDays).toBe(180);

      const oldConsent = {
        ConsentAt: new Date('2025-01-01T00:00:00Z'),
        ExpiresAt: null,
      } as MJCommunicationPrincipalPreferenceEntity;
      expect(driver.Evaluate(merged, makeContext({ PrincipalPreference: oldConsent })).Passed).toBe(
        false,
      );

      const freshConsent = {
        ConsentAt: new Date('2026-05-01T00:00:00Z'),
        ExpiresAt: null,
      } as MJCommunicationPrincipalPreferenceEntity;
      expect(driver.Evaluate(merged, makeContext({ PrincipalPreference: freshConsent })).Passed).toBe(
        true,
      );

      const impliedMerged = driver.MergeStrictest([{ maxDays: 730, impliedOnly: true }]);
      expect(impliedMerged.ImpliedOnly).toBe(true);
      const oldExpressConsent = {
        ConsentAt: new Date('2020-01-01T00:00:00Z'),
        OptInMethod: 'Double',
        ConsentSource: 'Signup Form',
        ExpiresAt: null,
      } as MJCommunicationPrincipalPreferenceEntity;
      expect(driver.Evaluate(impliedMerged, makeContext({ PrincipalPreference: oldExpressConsent })).Passed).toBe(
        true,
      );
      const oldImpliedConsent = {
        ConsentAt: new Date('2020-01-01T00:00:00Z'),
        OptInMethod: null,
        ConsentSource: 'Import',
        ExpiresAt: null,
      } as MJCommunicationPrincipalPreferenceEntity;
      expect(driver.Evaluate(impliedMerged, makeContext({ PrincipalPreference: oldImpliedConsent })).Passed).toBe(
        false,
      );
    });
  });

  describe('UnsubscribeMechanismRuleDriver', () => {
    const driver = new UnsubscribeMechanismRuleDriver();

    it('merges required over optional and sets obligations', () => {
      const merged = driver.MergeStrictest([
        { oneClickHeader: 'optional', footerLink: 'required' },
        { oneClickHeader: 'required', footerLink: 'optional' },
      ]);
      expect(merged).toEqual({ OneClickHeader: 'required', FooterLink: 'required' });

      const outcome = driver.Evaluate(merged, makeContext());
      expect(outcome.ObligationsPatch).toEqual({
        RequireOneClickHeader: true,
        RequireFooterUnsubscribe: true,
      });
    });
  });

  describe('UnsubscribeHonorWindowRuleDriver', () => {
    const driver = new UnsubscribeHonorWindowRuleDriver();

    it('picks shortest maxHours', () => {
      expect(driver.MergeStrictest([{ maxHours: 240 }, { maxHours: 24 }])).toEqual({
        MaxHours: 24,
      });
    });
  });

  describe('SenderIdentificationRuleDriver', () => {
    const driver = new SenderIdentificationRuleDriver();

    it('requires postal address and sender name when merged true', () => {
      const merged = driver.MergeStrictest([{ requirePostalAddress: true }, { requireSenderName: true }]);
      expect(driver.Evaluate(merged, makeContext()).Passed).toBe(true);

      const noAddressSender = {
        ID: 'sender-2',
        Name: 'NoAddr',
        FromName: 'NoAddr',
        PostalAddress: null,
      } as MJCommunicationSenderEntity;
      expect(driver.Evaluate(merged, makeContext({ Sender: noAddressSender })).Passed).toBe(false);
    });
  });

  describe('QuietHoursRuleDriver', () => {
    const driver = new QuietHoursRuleDriver();

    it('merges union of windows and defers using principal -> jurisdiction -> sender timezone fallback', () => {
      const merged = driver.MergeStrictest([
        { startHour: 21, endHour: 8 },
        { startHour: 20, endHour: 9 },
      ]);
      expect(merged.Windows).toHaveLength(2);

      // 03:00 UTC is 22:00 EST (America/New_York) -> inside quiet hours 20:00-09:00
      const nightCtx = {
        ...makeContext({
          Now: new Date('2026-01-15T03:00:00Z'),
          PrincipalAttributes: { Timezone: 'America/New_York' },
        }),
      };
      const outcome = driver.Evaluate(merged, nightCtx);
      expect(outcome.Passed).toBe(false);
      expect(outcome.Decision).toBe('Deferred');
      expect(outcome.DeferUntil).toBeInstanceOf(Date);
      expect(outcome.DeferUntil!.getTime()).toBeGreaterThan(nightCtx.Now.getTime());

      // Multi-zone country fallback when PrincipalAttributes.Timezone is absent
      const multiZoneCtx = {
        ...makeContext({ Now: new Date('2026-01-15T03:00:00Z') }),
        JurisdictionTimezones: ['America/New_York', 'America/Los_Angeles'],
      };
      expect(driver.Evaluate(merged, multiZoneCtx).Decision).toBe('Deferred');
    });
  });

  describe('TrackingConsentRuleDriver', () => {
    const driver = new TrackingConsentRuleDriver();

    it('merges consent-required over allowed and gates on Opted In state', () => {
      const merged = driver.MergeStrictest([
        { openPixel: 'allowed', clickTracking: 'allowed' },
        { openPixel: 'consent-required', clickTracking: 'prohibited' },
      ]);
      expect(merged).toEqual({ OpenPixel: 'consent-required', ClickTracking: 'prohibited' });

      const noConsent = driver.Evaluate(merged, makeContext());
      expect(noConsent.ObligationsPatch).toEqual({
        AllowOpenPixel: false,
        AllowClickTracking: false,
      });

      const optedIn = { State: 'Opted In' } as MJCommunicationPrincipalPreferenceEntity;
      const withConsent = driver.Evaluate(merged, makeContext({ PrincipalPreference: optedIn }));
      expect(withConsent.ObligationsPatch).toEqual({
        AllowOpenPixel: true,
        AllowClickTracking: false,
      });
    });
  });
});
