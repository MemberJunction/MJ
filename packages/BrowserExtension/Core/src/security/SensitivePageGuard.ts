/**
 * @fileoverview Zero-Trust `SensitivePageGuard` for the MemberJunction Browser Extension.
 *
 * Enforces three layers of protection before any DOM probe or screenshot leaves the active tab:
 * 1. **Blocked-Domain Enforcement:** Password vaults (`*.1password.com`, `*.bitwarden.com`), consumer banking
 *    (`*.bank.*`), browser-internal pages (`chrome://*`), and admin-configured `BlockedDomains` wildcards.
 * 2. **Automatic Field Redaction:** `input[type="password"]`, credit-card (`autocomplete="cc-*"`), and OTP
 *    (`autocomplete="one-time-code"`) field values are masked to `'••••••••'` before leaving the content script.
 * 3. **Auth / MFA Challenge Detection:** Detects login, SSO, MFA, or passkey prompts during guided workflows so
 *    `LocalBrowserChannel` automatically pauses autonomous execution (`WaitForUserAction`) until the user completes sign-in.
 *
 * @module @memberjunction/browser-extension-core
 */

import { BoundingBox, InteractiveElement } from '@memberjunction/computer-use/browser-probe';
import type { BrowserPageStateSnapshot } from '../types/extension-types.js';

/** Sentinel string used to mask redacted password, credit-card, and OTP values. */
export const REDACTED_SENTINEL = '••••••••';

/** Default blocked domain patterns enforced when no custom list is supplied. */
export const DEFAULT_BLOCKED_DOMAINS: readonly string[] = Object.freeze([
    '*.1password.com',
    '*.1password.ca',
    '*.1password.eu',
    '*.bitwarden.com',
    '*.lastpass.com',
    '*.dashlane.com',
    '*.keepersecurity.com',
    '*.duosecurity.com',
    '*.bank.*',
]);

/**
 * Options for constructing {@link SensitivePageGuard}.
 */
export interface SensitivePageGuardOptions {
    /** Additional wildcard domain or URL patterns to block. */
    ExtraBlockedDomains?: string[];
}

/**
 * Zero-trust guard protecting sensitive domains, credentials, payment fields, and authentication screens.
 */
export class SensitivePageGuard {
    private readonly blockedPatterns: string[];

    public constructor(options: SensitivePageGuardOptions = {}) {
        this.blockedPatterns = Array.from(
            new Set([...DEFAULT_BLOCKED_DOMAINS, ...(options.ExtraBlockedDomains ?? [])])
        );
    }

    /**
     * Extracts the lowercase hostname from a URL or hostname string.
     */
    public ExtractHostname(urlOrHostname: string): string {
        const trimmed = (urlOrHostname ?? '').trim().toLowerCase();
        if (!trimmed) {
            return '';
        }
        if (trimmed.includes('://')) {
            try {
                return new URL(trimmed).hostname.toLowerCase();
            } catch {
                return trimmed;
            }
        }
        return trimmed.split('/')[0];
    }

    /**
     * Returns `true` when the given URL or hostname matches a blocked domain or internal browser scheme.
     */
    public IsDomainBlocked(url: string): boolean {
        const raw = (url ?? '').trim().toLowerCase();
        if (!raw) {
            return true;
        }
        if (
            raw.startsWith('chrome://') ||
            raw.startsWith('edge://') ||
            raw.startsWith('brave://') ||
            raw.startsWith('chrome-extension://') ||
            raw.startsWith('devtools://')
        ) {
            return true;
        }

        const host = this.ExtractHostname(raw);
        if (!host) {
            return false;
        }

        for (const pattern of this.blockedPatterns) {
            const cleanPattern = pattern.trim().toLowerCase().replace(/^\*:\/\//, '').replace(/\/\*$/, '');
            if (!cleanPattern) {
                continue;
            }
            const regexStr =
                '^' +
                cleanPattern
                    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\*/g, '.*') +
                '$';
            if (new RegExp(regexStr, 'i').test(host)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Masks a form field's value to {@link REDACTED_SENTINEL} if it is a password, credit-card (`cc-*`),
     * OTP (`one-time-code`), or secret field.
     */
    public SanitizeFieldValue(field: {
        TagName: string;
        InputType?: string;
        Autocomplete?: string;
        Name?: string;
        Id?: string;
        AriaLabel?: string;
        Value: string;
    }): string {
        if (!field.Value) {
            return field.Value;
        }
        if (this.IsSensitiveFieldDescriptor(field)) {
            return REDACTED_SENTINEL;
        }
        return field.Value;
    }

    /**
     * Checks whether a field descriptor represents a password, credit-card, OTP, or secret input.
     */
    public IsSensitiveFieldDescriptor(field: {
        TagName?: string;
        InputType?: string;
        Autocomplete?: string;
        Name?: string;
        Id?: string;
        AriaLabel?: string;
    }): boolean {
        const inputType = (field.InputType ?? '').trim().toLowerCase();
        if (inputType === 'password') {
            return true;
        }

        const auto = (field.Autocomplete ?? '').trim().toLowerCase();
        if (auto) {
            const tokens = auto.split(/\s+/);
            for (const token of tokens) {
                if (
                    token.startsWith('cc-') ||
                    token === 'one-time-code' ||
                    token === 'current-password' ||
                    token === 'new-password'
                ) {
                    return true;
                }
            }
        }

        const combined = [field.Name ?? '', field.Id ?? '', field.AriaLabel ?? '']
            .join(' ')
            .toLowerCase();

        return /\b(password|passcode|passphrase|one[-_]?time[-_]?code|otp|totp|2fa|mfa[-_]?code|cvv|cvc|card[-_]?number|cc[-_]?num|ssn|social[-_]?security|client[-_]?secret|api[-_]?secret)\b/.test(
            combined
        );
    }

    /**
     * Detects whether a page is currently presenting an authentication, login, SSO, or MFA challenge screen.
     */
    public DetectAuthOrMfaScreen(signals: {
        Url: string;
        Title: string;
        VisibleText: string;
        HasPasswordInput: boolean;
        HasOtpInput: boolean;
    }): boolean {
        if (signals.HasPasswordInput || signals.HasOtpInput) {
            return true;
        }
        const url = (signals.Url ?? '').toLowerCase();
        const title = (signals.Title ?? '').toLowerCase();

        if (
            /\/(login|signin|sign-in|mfa|2fa|two-factor|webauthn|passkey|oauth2?\/v?\d*\/authorize)(\/|\?|$)/.test(url) ||
            url.includes('login.microsoftonline.com/') ||
            url.includes('accounts.google.com/v3/signin')
        ) {
            return true;
        }

        if (
            /\b(sign in|log in|two-factor authentication|multi-factor authentication|verify your identity|enter verification code)\b/.test(
                title
            )
        ) {
            return true;
        }

        return false;
    }

    /**
     * Returns a sanitized copy of a {@link BrowserPageStateSnapshot} with sensitive element values masked.
     */
    public SanitizePageSnapshot(snapshot: BrowserPageStateSnapshot): BrowserPageStateSnapshot {
        const sanitizedElements = snapshot.InteractiveElements.map((el) => {
            const clone = new InteractiveElement();
            clone.Index = el.Index;
            clone.Role = el.Role;
            clone.Name = el.Name;
            clone.Selector = el.Selector;
            clone.Scope = el.Scope;
            clone.Scrollable = el.Scrollable;
            clone.Disabled = el.Disabled;
            if (el.BoundingBox) {
                const box = new BoundingBox();
                box.XMin = el.BoundingBox.XMin;
                box.YMin = el.BoundingBox.YMin;
                box.XMax = el.BoundingBox.XMax;
                box.YMax = el.BoundingBox.YMax;
                clone.BoundingBox = box;
            }
            const isSensitive = this.IsSensitiveFieldDescriptor({
                Name: el.Name,
                AriaLabel: el.Scope,
            });
            clone.Value = isSensitive && el.Value ? REDACTED_SENTINEL : el.Value;
            return clone;
        });

        return {
            ...snapshot,
            InteractiveElements: sanitizedElements,
        };
    }
}
