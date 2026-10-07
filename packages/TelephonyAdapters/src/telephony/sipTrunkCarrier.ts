/**
 * @fileoverview The narrow interface a SIP-trunk carrier has to satisfy to carry phone calls to and from LiveKit SIP.
 *
 * In the room-based call path the carrier is only a pipe: it terminates the phone network and speaks SIP to LiveKit. It
 * does not run the agent, route the call or transfer it; MJ and LiveKit do that. So the carrier interface is small, and
 * it is about *configuration* rather than calls: what the carrier's trunk must be set to so it points at LiveKit, whether
 * the settings MJ was given look right, and whether that looks healthy.
 *
 * Twilio Elastic SIP Trunking is the first implementation. It validates and describes configuration only; it makes no
 * Twilio REST calls, so it needs no Twilio credentials and cannot change anything on the Twilio account. Another carrier
 * (Telnyx, Bandwidth, a SIP provider) is another implementation of {@link ISipTrunkCarrier}.
 *
 * **Vendor details here are not live-verified.** The Twilio hostname shapes and the settings an Elastic SIP Trunk needs
 * are written from Twilio's and LiveKit's documentation; confirm them against a real trunk (see
 * `plans/realtime/bridges-and-widget/LIVE-CALL-CHECKLIST.md`).
 *
 * @module @memberjunction/telephony-adapters
 */

import { LogError } from '@memberjunction/core';
import { IsValidE164 } from './outboundCallPolicy.js';

/** What a carrier's trunk has to be set to, as steps an operator can follow. */
export interface SipTrunkDescription {
    /** The carrier's name, as the operator knows it. */
    Carrier: string;
    /** Ordered, plain-language settings to apply on the carrier side. */
    Steps: string[];
}

/** What the validation is told about the deployment. */
export interface SipTrunkValidationContext {
    /** The numbers the deployment answers (E.164). */
    Numbers: readonly string[];
    /** Whether the deployment dials out through the carrier (outbound calls, fallback legs, number transfers). */
    DialOut: boolean;
}

/** The outcome of checking a carrier's settings. Problems stop the carrier working; warnings are worth reading. */
export interface SipTrunkConfigCheck {
    Valid: boolean;
    Problems: string[];
    Warnings: string[];
}

/** A carrier's health as far as MJ can tell. */
export interface SipTrunkHealth {
    Healthy: boolean;
    /** What the verdict is based on (a configuration check, a probe). */
    Detail: string;
}

/** A number the carrier terminates for the deployment. */
export interface SipTrunkNumber {
    Number: string;
}

/** What a SIP-trunk carrier implements. Deliberately narrow: describe, validate, report health, optionally list numbers. */
export interface ISipTrunkCarrier {
    /** A stable identifier (`twilio-elastic-sip`). */
    readonly Name: string;
    /** The settings the carrier's trunk needs so it talks to LiveKit SIP. */
    DescribeTrunk(): SipTrunkDescription;
    /** Checks the settings MJ holds for this carrier. */
    ValidateConfig(context: SipTrunkValidationContext): SipTrunkConfigCheck;
    /** Reports health. An implementation that does not contact the carrier says so in {@link SipTrunkHealth.Detail}. */
    CheckHealth(context: SipTrunkValidationContext): Promise<SipTrunkHealth>;
    /** The numbers the carrier terminates for the deployment, when it can say. */
    ListNumbers?(): Promise<SipTrunkNumber[]>;
}

/** Settings for a Twilio Elastic SIP Trunk carrying calls to and from LiveKit SIP. */
export interface TwilioElasticSipTrunkSettings {
    type: 'twilio-elastic-sip';
    /**
     * The LiveKit SIP URI the Twilio trunk's ORIGINATION URI points at (calls arriving from the phone network are sent
     * there), e.g. `sip:<project>.sip.livekit.cloud`.
     */
    originationUri?: string;
    /**
     * The trunk's TERMINATION URI on Twilio (calls MJ places go out through it): `<name>.pstn.twilio.com`, or a regional form
     * `<name>.pstn.<region>.twilio.com`. Needed only when the deployment dials out.
     */
    terminationUri?: string;
    /** How Twilio authenticates LiveKit's outbound requests on the termination side. */
    terminationAuth?: 'credential-list' | 'ip-acl';
    /** The Twilio numbers associated with the trunk (E.164). */
    numbers?: string[];
}

/** Every carrier's settings, discriminated by `type`. */
export type SipTrunkCarrierSettings = TwilioElasticSipTrunkSettings;

const TWILIO_TERMINATION_HOST = /^[a-z0-9-]+\.pstn(\.[a-z0-9-]+)?\.twilio\.com$/i;
const SIP_URI = /^sips?:[^\s]+$/i;

/** A Twilio Elastic SIP Trunk, validated from configuration alone. */
export class TwilioElasticSipTrunkCarrier implements ISipTrunkCarrier {
    public readonly Name = 'twilio-elastic-sip';

    constructor(private readonly settings: TwilioElasticSipTrunkSettings) {}

    public DescribeTrunk(): SipTrunkDescription {
        return {
            Carrier: 'Twilio Elastic SIP Trunking',
            Steps: [
                'In Twilio, create an Elastic SIP Trunk (Voice > Manage > Elastic SIP Trunking).',
                `Origination: add an Origination URI that points at your LiveKit SIP endpoint${this.settings.originationUri ? ` (${this.settings.originationUri})` : ''}; calls from the phone network are sent there.`,
                'Phone numbers: associate each number the deployment answers with the trunk.',
                'Termination: set a Termination SIP URI (<name>.pstn.twilio.com) and authenticate LiveKit with a credential list or an IP access control list; only needed to dial out.',
                'In LiveKit, create an inbound trunk for the same numbers and an outbound trunk that uses the Termination URI and those credentials.',
            ],
        };
    }

    public ValidateConfig(context: SipTrunkValidationContext): SipTrunkConfigCheck {
        const problems: string[] = [];
        const warnings: string[] = [];
        this.checkOrigination(problems);
        this.checkNumbers(context, problems, warnings);
        if (context.DialOut) {
            this.checkTermination(problems, warnings);
        }
        return { Valid: problems.length === 0, Problems: problems, Warnings: warnings };
    }

    public async CheckHealth(context: SipTrunkValidationContext): Promise<SipTrunkHealth> {
        const check = this.ValidateConfig(context);
        return {
            Healthy: check.Valid,
            Detail: check.Valid
                ? 'The trunk settings look valid. This is a configuration check only; Twilio was not contacted.'
                : `The trunk settings have problems: ${check.Problems.join(' ')} (configuration check only; Twilio was not contacted).`,
        };
    }

    public async ListNumbers(): Promise<SipTrunkNumber[]> {
        return (this.settings.numbers ?? []).map((n) => ({ Number: n }));
    }

    private checkOrigination(problems: string[]): void {
        const uri = this.settings.originationUri?.trim();
        if (!uri) {
            problems.push('originationUri is not set: Twilio needs the LiveKit SIP URI it should send inbound calls to.');
        } else if (!SIP_URI.test(uri)) {
            problems.push(`originationUri '${uri}' is not a SIP URI (expected sip:… or sips:…).`);
        }
    }

    private checkNumbers(context: SipTrunkValidationContext, problems: string[], warnings: string[]): void {
        const declared = this.settings.numbers ?? [];
        for (const number of declared) {
            if (!IsValidE164(number)) {
                problems.push(`The trunk number '${number}' is not E.164 (for example +14155550123).`);
            }
        }
        if (declared.length === 0) {
            warnings.push('The trunk lists no numbers, so the check cannot confirm the deployment\'s numbers are on it.');
            return;
        }
        for (const number of context.Numbers) {
            if (!declared.includes(number)) {
                warnings.push(`The deployment answers ${number}, which is not on the trunk's number list.`);
            }
        }
    }

    private checkTermination(problems: string[], warnings: string[]): void {
        const host = this.settings.terminationUri?.trim();
        if (!host) {
            problems.push('terminationUri is not set, but the deployment dials out: Twilio needs a Termination SIP URI.');
        } else if (!TWILIO_TERMINATION_HOST.test(host)) {
            problems.push(`terminationUri '${host}' does not look like a Twilio termination URI (<name>.pstn.twilio.com).`);
        }
        if (!this.settings.terminationAuth) {
            warnings.push('terminationAuth is not set: Twilio only accepts outbound calls from LiveKit when it authenticates with a credential list or an IP access control list.');
        }
    }
}

/**
 * Builds the carrier for the settings, or `undefined` when none are given or the type is unknown (logged: a typo in the
 * carrier type must be visible, but a missing carrier block is allowed because the check is optional).
 */
export function CreateSipTrunkCarrier(settings: SipTrunkCarrierSettings | undefined): ISipTrunkCarrier | undefined {
    if (!settings) {
        return undefined;
    }
    switch (settings.type) {
        case 'twilio-elastic-sip':
            return new TwilioElasticSipTrunkCarrier(settings);
        default:
            LogError(`[Telephony][LiveKitSip] unknown carrier type '${(settings as { type?: string }).type ?? ''}'; skipping the carrier check.`);
            return undefined;
    }
}
