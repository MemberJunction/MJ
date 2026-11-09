import { BehaviorSubject, Observable } from 'rxjs';
import type { JSONObject } from '@memberjunction/ai';
import type { IdentityVerifiedEventPayload, RealtimeChannelActor } from '@memberjunction/ai-core-plus';
import type { RealtimeChannelVerbResult } from '@memberjunction/realtime-runtime';
import type { RealtimeSessionVerificationResult } from '@memberjunction/graphql-dataprovider';

/** Where a field's current value came from. */
export type IdentityFieldSource = 'user' | 'agent' | 'host';

/** The two things a person is asked for. */
export type IdentityField = 'name' | 'email';

/** The channel's lifecycle. `collecting` covers "still getting the values" and "must send (again)". */
export type IdentityVerificationStatus = 'collecting' | 'sending' | 'code_sent' | 'verifying' | 'verified';

/** What the channel needs from the server — the two calls it makes. `GraphQLRealtimeSessionClient` fits. */
export interface IdentityVerificationService {
  Request(input: { Name: string; Email: string }): Promise<RealtimeSessionVerificationResult>;
  SubmitCode(code: string): Promise<RealtimeSessionVerificationResult>;
}

/** One field as the surface renders it. */
export interface IdentityFieldView {
  Value: string;
  /** Who supplied the value; `null` while empty. */
  Source: IdentityFieldSource | null;
  /** The user wrote it, or approved it. Anything else must not be sent. */
  Confirmed: boolean;
}

/** Everything the surface renders — an immutable snapshot, replaced on every change. */
export interface IdentityVerificationView {
  Status: IdentityVerificationStatus;
  Name: IdentityFieldView;
  Email: IdentityFieldView;
  /** The latest problem, in words a person can act on; `''` when there is none. */
  Problem: string;
  /** The server's machine-readable code for {@link Problem}, when it gave one. */
  ProblemCode: string;
  /** Both values present and confirmed, and nothing in flight or already sent for them. */
  CanSubmit: boolean;
  /** Epoch ms before which another send is refused (server back-off); `0` when none. */
  ResendAvailableAt: number;
  /** Sends the server will still allow for this session, when it said. */
  SendsRemaining: number | null;
  /** Code attempts left, when the server said. */
  AttemptsRemaining: number | null;
  /** The address the code went to (`code_sent`/`verifying`), or the verified one. */
  Destination: string;
}

/** A change the model reports so the channel can record it (events + coalesced perception). */
export interface IdentityVerificationChange {
  /** Who caused it (`system` for the server's answer / event). */
  Author: RealtimeChannelActor | 'system';
  /** The channel event this change is announced as, with its payload. */
  Event?: { Name: string; Payload: JSONObject };
}

const MAX_FIELD_LENGTH = 200;
const MAX_CODE_LENGTH = 16;
/** A deliberately permissive shape check — the server owns real validation; this only catches "not an email". */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Server error codes whose cause the person cannot fix by retrying the same code: they must request a new one. */
const NEEDS_NEW_CODE: ReadonlySet<string> = new Set(['code_expired', 'attempts_exhausted', 'no_pending_verification']);

/** What to say for an error code when the server gave no message of its own. */
const DEFAULT_PROBLEMS: Readonly<Record<string, string>> = {
  verification_unavailable: 'Email verification is not available right now.',
  invalid_input: 'Please check the details and try again.',
  invalid_email: 'That does not look like a valid email address.',
  session_not_found: 'This call is no longer active.',
  session_closed: 'This call has ended.',
  domain_blocked: 'That email address cannot be used here.',
  consumer_domain: 'Please use your work email address.',
  send_limit_reached: 'No more codes can be sent for this call.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  email_send_failed: 'We could not send the email. Please check the address and try again.',
  no_pending_verification: 'There is no code waiting. Please request a new one.',
  code_expired: 'That code has expired. Please request a new one.',
  invalid_code: 'That code is not right. Please check it and try again.',
  attempts_exhausted: 'Too many wrong codes. Please request a new one.',
  invalid_link: 'That link is no longer valid.',
  persist_failed: 'Something went wrong on our side. Please try again.',
  transport_error: 'We could not reach the server. Please try again.'
};

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function emptyField(): IdentityFieldView {
  return { Value: '', Source: null, Confirmed: false };
}

/**
 * The identity-verification state machine — framework-free, so it is testable without Angular and shared
 * by the channel (which adds the descriptor, events and perception) and the surface (which only renders
 * {@link View$} and sends the user's actions back through the channel).
 *
 * The invariants it exists to hold:
 *  - **The user is the author or the approver of everything that is sent.** A value the user typed is
 *    confirmed by being theirs; a value the agent (or the host) supplied is NOT, until the user confirms
 *    it — and only the user can ({@link Confirm} refuses any other actor). Changing a value un-sends it.
 *  - **The server's `identity.verified` event is what makes a session verified.** A successful code
 *    submission also applies it, but only as a fallback for a transport without events, and idempotently.
 *  - **A code is never stored, echoed or put in a result** — it passes through {@link EnterCode} to the
 *    server and no further.
 */
export class IdentityVerificationModel {
  private view: IdentityVerificationView = this.initialView();
  private readonly viewSubject = new BehaviorSubject<IdentityVerificationView>(this.view);
  private changeListener: ((change: IdentityVerificationChange) => void) | null = null;
  /** The values the live code was sent for, so a later change can tell it is stale. */
  private sentFor: { Name: string; Email: string } | null = null;

  /**
   * @param service The server calls.
   * @param now Clock, injectable for tests.
   */
  constructor(
    private readonly service: IdentityVerificationService | null,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** The current view, then every change. */
  public get View$(): Observable<IdentityVerificationView> {
    return this.viewSubject.asObservable();
  }

  public get View(): IdentityVerificationView {
    return this.view;
  }

  /** Registers the (single) listener told about every change — the channel. */
  public OnChange(listener: ((change: IdentityVerificationChange) => void) | null): void {
    this.changeListener = listener;
  }

  /** The channel's `GetState` snapshot (the descriptor's nouns). */
  public ToState(): JSONObject {
    const v = this.view;
    return {
      name: v.Name.Value,
      email: v.Email.Value,
      status: v.Status,
      confirmed: { name: v.Name.Confirmed, email: v.Email.Confirmed },
      problem: v.Problem
    };
  }

  // ── Verbs ──────────────────────────────────────────────────────────────────

  /** Seeds values the HOST knows (open inputs). They are unconfirmed — the user still has to approve them. */
  public Seed(inputs: JSONObject): void {
    for (const field of ['name', 'email'] as const) {
      const value = clean(inputs[field], MAX_FIELD_LENGTH);
      if (value.length > 0 && this.view[this.key(field)].Value.length === 0) {
        this.setField(field, value, 'host');
      }
    }
    this.publish({ Author: 'system' });
  }

  /** `fill` — set a field. A value the user types is confirmed by being theirs; anyone else's is not. */
  public Fill(args: JSONObject, actor: RealtimeChannelActor): RealtimeChannelVerbResult {
    if (this.view.Status === 'verified') {
      return this.fail('already_verified', 'This person is already verified; there is nothing to fill in.');
    }
    if (this.view.Status === 'sending' || this.view.Status === 'verifying') {
      return this.fail('verb_failed', 'A request is in progress; wait for it to finish.');
    }
    const field = this.readField(args['field']);
    const value = clean(args['value'], MAX_FIELD_LENGTH);
    if (field === null) {
      return this.fail('invalid_params', 'field must be "name" or "email".');
    }
    if (value.length === 0) {
      return this.fail('invalid_params', 'value must not be empty.');
    }
    if (field === 'email' && !EMAIL_SHAPE.test(value)) {
      return this.fail('invalid_params', 'That does not look like an email address. Ask the user to spell it out, then fill it again.');
    }
    const current = this.view[this.key(field)];
    // The same value again changes nothing — in particular an agent repeating what the user typed must
    // not un-confirm it. The one exception: the user typing exactly what the agent suggested IS them
    // confirming it, so that falls through and records the user as the author.
    if (current.Value === value && !(actor === 'user' && !current.Confirmed)) {
      return this.ok(`The ${field} was already set to that.`);
    }
    this.setField(field, value, actor);
    this.dropStaleCodeIfChanged();
    this.view = { ...this.view, Status: 'collecting', Problem: '', ProblemCode: '' };
    this.publish({ Author: actor, Event: { Name: 'field_filled', Payload: { field, actor, confirmed: this.view[this.key(field)].Confirmed } } });
    return this.ok(
      actor === 'agent'
        ? `The ${field} is filled in and shown to the user, who must confirm it before anything is sent.`
        : `The user entered their ${field}.`
    );
  }

  /** `confirm` — the user approves what is shown. Refused for anyone but the user, whatever the schema says. */
  public Confirm(args: JSONObject, actor: RealtimeChannelActor): RealtimeChannelVerbResult {
    if (actor !== 'user') {
      return this.fail('not_invokable_by_agent', 'Only the user can confirm their own details. Ask them to check the form and confirm.');
    }
    const requested = args['field'] === undefined ? null : this.readField(args['field']);
    if (args['field'] !== undefined && requested === null) {
      return this.fail('invalid_params', 'field must be "name" or "email" (or omitted to confirm both).');
    }
    const fields: IdentityField[] = requested ? [requested] : ['name', 'email'];
    const confirmed: IdentityField[] = [];
    for (const field of fields) {
      const f = this.view[this.key(field)];
      if (f.Value.length > 0 && !f.Confirmed) {
        this.setConfirmed(field);
        confirmed.push(field);
      }
    }
    if (confirmed.length === 0) {
      return this.fail('verb_failed', 'There is nothing to confirm.');
    }
    this.publish({ Author: 'user', Event: { Name: 'confirmed', Payload: { fields: confirmed } } });
    return this.ok('Confirmed.');
  }

  /** `submit` — send the code to the confirmed address. */
  public async Submit(): Promise<RealtimeChannelVerbResult> {
    const blocked = this.blockReasonForSend('submit');
    if (blocked) {
      return blocked;
    }
    return this.sendCode();
  }

  /** `resend` — send a fresh code to the same, already-confirmed address. */
  public async Resend(): Promise<RealtimeChannelVerbResult> {
    if (this.view.Status !== 'code_sent') {
      return this.fail('verb_failed', 'No code has been sent yet. Use submit first.');
    }
    const blocked = this.blockReasonForSend('resend');
    if (blocked) {
      return blocked;
    }
    return this.sendCode();
  }

  /** `enter_code` — hand the code the person received to the server. The code is never kept. */
  public async EnterCode(args: JSONObject): Promise<RealtimeChannelVerbResult> {
    if (this.view.Status === 'verified') {
      return this.fail('already_verified', 'This person is already verified.');
    }
    if (this.view.Status !== 'code_sent') {
      return this.fail('verb_failed', this.view.Status === 'verifying' ? 'A code is being checked; wait for the answer.' : 'No code has been sent yet. Send one first.');
    }
    const code = clean(args['code'], MAX_CODE_LENGTH);
    if (code.length === 0) {
      return this.fail('invalid_params', 'code must not be empty.');
    }
    if (!this.service) {
      return this.fail('verb_failed', 'Verification is not available in this session.');
    }
    this.view = { ...this.view, Status: 'verifying', Problem: '', ProblemCode: '' };
    this.publish({ Author: 'user', Event: { Name: 'code_entered', Payload: {} } });
    const result = await this.service.SubmitCode(code);
    if (this.view.Status === 'verified') {
      return this.ok('Verified.'); // the server's event got there first
    }
    return result.Success && result.VerificationState === 'verified' ? this.applyVerifiedFromResult(result) : this.applyCodeFailure(result);
  }

  // ── Server's word ──────────────────────────────────────────────────────────

  /**
   * The server says the person is verified (the `identity.verified` event). Idempotent. Returns whether
   * this call made the change, so the channel completes exactly once.
   */
  public MarkVerified(payload: IdentityVerifiedEventPayload): boolean {
    if (this.view.Status === 'verified') {
      return false;
    }
    const email = clean(payload.VerifiedEmail, MAX_FIELD_LENGTH);
    const name = clean(payload.VerifiedName, MAX_FIELD_LENGTH);
    this.view = {
      ...this.view,
      Status: 'verified',
      Name: name.length > 0 ? { Value: name, Source: this.view.Name.Source ?? 'user', Confirmed: true } : this.view.Name,
      Email: { Value: email, Source: this.view.Email.Source ?? 'user', Confirmed: true },
      Destination: email,
      Problem: '',
      ProblemCode: '',
      ResendAvailableAt: 0
    };
    this.sentFor = null;
    this.publish({ Author: 'system', Event: { Name: 'verified', Payload: { email, name, method: payload.Method } } });
    return true;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async sendCode(): Promise<RealtimeChannelVerbResult> {
    if (!this.service) {
      return this.fail('verb_failed', 'Verification is not available in this session.');
    }
    const { Name, Email } = { Name: this.view.Name.Value, Email: this.view.Email.Value };
    this.view = { ...this.view, Status: 'sending', Problem: '', ProblemCode: '' };
    this.publish({ Author: 'system' });
    const result = await this.service.Request({ Name, Email });
    if (this.view.Status === 'verified') {
      return this.ok('Verified.');
    }
    return result.Success ? this.applySent(result, Name, Email) : this.applySendFailure(result);
  }

  private applySent(result: RealtimeSessionVerificationResult, name: string, email: string): RealtimeChannelVerbResult {
    this.sentFor = { Name: name, Email: email };
    this.view = {
      ...this.view,
      Status: 'code_sent',
      Destination: email,
      Problem: '',
      ProblemCode: '',
      SendsRemaining: result.SendsRemaining ?? null,
      AttemptsRemaining: result.AttemptsRemaining ?? null,
      ResendAvailableAt: result.RetryAfterSeconds ? this.now() + result.RetryAfterSeconds * 1000 : 0
    };
    this.publish({ Author: 'system', Event: { Name: 'code_sent', Payload: { email } } });
    return this.ok(`A code was emailed to ${email}. The user can type it in, or open the link in the email. Do not ask them to read the code aloud.`);
  }

  private applySendFailure(result: RealtimeSessionVerificationResult): RealtimeChannelVerbResult {
    const problem = this.problemFor(result);
    this.view = {
      ...this.view,
      Status: 'collecting',
      Problem: problem,
      ProblemCode: result.ErrorCode ?? '',
      ResendAvailableAt: result.RetryAfterSeconds ? this.now() + result.RetryAfterSeconds * 1000 : this.view.ResendAvailableAt,
      SendsRemaining: result.SendsRemaining ?? this.view.SendsRemaining
    };
    this.publish({ Author: 'system', Event: { Name: 'error', Payload: { code: result.ErrorCode ?? 'unknown', stage: 'send' } } });
    return this.fail(result.ErrorCode ?? 'verb_failed', problem);
  }

  private applyCodeFailure(result: RealtimeSessionVerificationResult): RealtimeChannelVerbResult {
    const problem = this.problemFor(result);
    const code = result.ErrorCode ?? '';
    this.view = {
      ...this.view,
      Status: NEEDS_NEW_CODE.has(code) ? 'collecting' : 'code_sent',
      Problem: problem,
      ProblemCode: code,
      AttemptsRemaining: result.AttemptsRemaining ?? this.view.AttemptsRemaining
    };
    if (NEEDS_NEW_CODE.has(code)) {
      this.sentFor = null;
    }
    this.publish({ Author: 'system', Event: { Name: 'error', Payload: { code: code || 'unknown', stage: 'code' } } });
    return this.fail(code || 'verb_failed', problem);
  }

  private applyVerifiedFromResult(result: RealtimeSessionVerificationResult): RealtimeChannelVerbResult {
    const email = result.VerifiedEmail ?? this.view.Email.Value;
    this.MarkVerified({
      VerifiedEmail: email,
      VerifiedName: this.view.Name.Value,
      VerifiedAt: result.VerifiedAt ?? new Date(this.now()).toISOString(),
      Method: 'code',
      ...(result.MaxSessionDeadlineIso ? { MaxSessionDeadlineIso: result.MaxSessionDeadlineIso } : {})
    });
    return this.ok('Verified.');
  }

  /** Why a send must not go ahead, as a ready-made failure; `null` when it may. */
  private blockReasonForSend(verb: 'submit' | 'resend'): RealtimeChannelVerbResult | null {
    const v = this.view;
    if (v.Status === 'verified') {
      return this.fail('already_verified', 'This person is already verified.');
    }
    if (v.Status === 'sending' || v.Status === 'verifying') {
      return this.fail('verb_failed', 'A request is in progress; wait for it to finish.');
    }
    if (verb === 'submit' && v.Status === 'code_sent') {
      return this.fail('verb_failed', 'A code was already sent to this address. Wait for the user to enter it, or use resend.');
    }
    if (v.Name.Value.length === 0 || v.Email.Value.length === 0) {
      return this.fail('verb_failed', 'Both the name and the email are needed first. Fill in what is missing.');
    }
    if (!v.Name.Confirmed || !v.Email.Confirmed) {
      return this.fail('verb_failed', 'The user has not confirmed their details yet. Ask them to check the form and confirm; you cannot confirm for them.');
    }
    if (v.SendsRemaining === 0) {
      return this.fail('send_limit_reached', DEFAULT_PROBLEMS['send_limit_reached']);
    }
    const wait = v.ResendAvailableAt - this.now();
    if (wait > 0) {
      return this.fail('rate_limited', `Another code can be sent in ${Math.ceil(wait / 1000)} seconds.`);
    }
    return null;
  }

  /** A change to the values a code was sent for makes that code stale: back to collecting. */
  private dropStaleCodeIfChanged(): void {
    if (this.sentFor && (this.sentFor.Name !== this.view.Name.Value || this.sentFor.Email !== this.view.Email.Value)) {
      this.sentFor = null;
      this.view = { ...this.view, Destination: '', AttemptsRemaining: null };
    }
  }

  private setField(field: IdentityField, value: string, source: IdentityFieldSource): void {
    const next: IdentityFieldView = { Value: value, Source: source, Confirmed: source === 'user' };
    this.view = { ...this.view, [this.key(field)]: next };
  }

  private setConfirmed(field: IdentityField): void {
    const key = this.key(field);
    this.view = { ...this.view, [key]: { ...this.view[key], Confirmed: true } };
  }

  private key(field: IdentityField): 'Name' | 'Email' {
    return field === 'name' ? 'Name' : 'Email';
  }

  private readField(raw: unknown): IdentityField | null {
    return raw === 'name' || raw === 'email' ? raw : null;
  }

  private problemFor(result: RealtimeSessionVerificationResult): string {
    return (result.Message && result.Message.trim()) || DEFAULT_PROBLEMS[result.ErrorCode ?? ''] || 'Something went wrong. Please try again.';
  }

  private ok(message: string, extra: JSONObject = {}): RealtimeChannelVerbResult {
    return { Success: true, Result: { message, status: this.view.Status, ...extra } };
  }

  private fail(code: string, message: string): RealtimeChannelVerbResult {
    return { Success: false, ErrorCode: code, Error: message };
  }

  private initialView(): IdentityVerificationView {
    return {
      Status: 'collecting',
      Name: emptyField(),
      Email: emptyField(),
      Problem: '',
      ProblemCode: '',
      CanSubmit: false,
      ResendAvailableAt: 0,
      SendsRemaining: null,
      AttemptsRemaining: null,
      Destination: ''
    };
  }

  /** Recomputes the derived flag, publishes the snapshot, and tells the channel. */
  private publish(change: IdentityVerificationChange): void {
    const v = this.view;
    this.view = {
      ...v,
      CanSubmit: v.Status === 'collecting' && v.Name.Value.length > 0 && v.Email.Value.length > 0 && v.Name.Confirmed && v.Email.Confirmed
    };
    this.viewSubject.next(this.view);
    this.changeListener?.(change);
  }
}
