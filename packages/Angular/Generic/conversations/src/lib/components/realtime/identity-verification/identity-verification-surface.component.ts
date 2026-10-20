import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, ViewChild, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import type { JSONObject } from '@memberjunction/ai';
import type { RealtimeChannelVerbResult } from '@memberjunction/realtime-runtime';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { IdentityVerificationModel, type IdentityField, type IdentityVerificationView } from './identity-verification-model';

/** Sends one of the user's actions to the channel (which runs it as the `user`). */
export type IdentityVerificationDispatch = (verb: string, args: JSONObject) => Promise<RealtimeChannelVerbResult>;

/**
 * The IDENTITY VERIFICATION surface (`mj-identity-verification-surface`) — a small, accessible form that
 * renders the channel's state and sends the user's own actions back through it. It owns no rules: whether
 * a value counts as confirmed, whether a code can be sent, what a failure means are the
 * {@link IdentityVerificationModel}'s decisions; this only shows them.
 *
 * Details the agent filled in are marked "Suggested" and carry a Confirm control until the user approves
 * them; a value the user types is theirs and needs no confirmation. Mobile-first: one column, 44px tap
 * targets, 16px inputs (no iOS zoom), the right keyboard and autofill hints per field. Colour comes only
 * from `--mj-*` design tokens, so it follows the host's theme (including dark mode).
 */
@Component({
  standalone: true,
  selector: 'mj-identity-verification-surface',
  imports: [MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './identity-verification-surface.component.html',
  styleUrls: ['./identity-verification-surface.component.css']
})
export class IdentityVerificationSurfaceComponent implements OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private modelSub: Subscription | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private model: IdentityVerificationModel | null = null;

  /** The current snapshot, or `null` until a model is bound. */
  public View: IdentityVerificationView | null = null;

  /** Name of the agent, for the "Suggested by …" marker. */
  @Input() AgentName = 'The assistant';

  /** Seconds until another send is allowed (0 = now). Recomputed on a 1s tick while a cooldown runs. */
  public ResendWaitSeconds = 0;

  /** True while an action is in flight from THIS surface (disables double-submits). */
  public Busy = false;

  /**
   * Why the user's last action was refused before it reached the server (a malformed email, a missing
   * detail) — the model's own `Problem` only covers what the SERVER said. Cleared by the next action.
   */
  public ActionProblem = '';

  /** The code the user is typing. Never leaves this component except through {@link SubmitCode}. */
  public CodeDraft = '';

  /** The unconfirmed drafts the user is typing, per field. */
  public Drafts: Record<IdentityField, string> = { name: '', email: '' };

  /** Where the user's actions go — wired by the channel; a no-op until then. */
  @Input() Dispatch: IdentityVerificationDispatch = async () => ({ Success: false, Error: 'Not connected.' });

  @ViewChild('codeInput') private codeInput?: ElementRef<HTMLInputElement>;

  /** The state engine this surface renders. */
  @Input()
  public set Model(value: IdentityVerificationModel | null) {
    if (value === this.model) {
      return;
    }
    this.modelSub?.unsubscribe();
    this.model = value;
    this.modelSub = value?.View$.subscribe((view) => this.onView(view)) ?? null;
  }
  public get Model(): IdentityVerificationModel | null {
    return this.model;
  }

  public ngOnDestroy(): void {
    this.modelSub?.unsubscribe();
    this.stopTick();
  }

  // ── Template helpers ───────────────────────────────────────────────────────

  /** What to show in an input: the user's draft, else the stored value. */
  public ValueFor(field: IdentityField): string {
    return this.Drafts[field] !== '' ? this.Drafts[field] : this.View ? this.fieldView(field).Value : '';
  }

  /** The agent or host suggested this value and the user has not approved it yet. */
  public IsSuggested(field: IdentityField): boolean {
    const f = this.View ? this.fieldView(field) : null;
    return !!f && f.Value.length > 0 && !f.Confirmed && this.Drafts[field] === '';
  }

  /** Who suggested it, for the label. */
  public SuggestedBy(field: IdentityField): string {
    return this.View && this.fieldView(field).Source === 'host' ? 'this page' : this.AgentName;
  }

  public get Locked(): boolean {
    return !!this.View && (this.View.Status === 'sending' || this.View.Status === 'verifying' || this.View.Status === 'verified');
  }

  public get CodeStage(): boolean {
    return !!this.View && (this.View.Status === 'code_sent' || this.View.Status === 'verifying');
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  public OnDraft(field: IdentityField, event: Event): void {
    this.Drafts[field] = (event.target as HTMLInputElement).value;
  }

  /** Commits what the user typed in a field (blur / Enter) — the user's own value, confirmed by being theirs. */
  public async CommitField(field: IdentityField): Promise<void> {
    const draft = this.Drafts[field].trim();
    if (draft === '') {
      this.Drafts[field] = '';
      return;
    }
    await this.run('fill', { field, value: draft });
    // Keep the draft if the model refused it (e.g. a malformed email) so the user can correct it, not retype it.
    if (this.View && this.fieldView(field).Value === draft) {
      this.Drafts[field] = '';
    }
    this.cdr.markForCheck();
  }

  public async ConfirmField(field: IdentityField): Promise<void> {
    await this.run('confirm', { field });
  }

  public async ConfirmAll(): Promise<void> {
    await this.run('confirm', {});
  }

  public async SendCode(): Promise<void> {
    await this.commitPendingDrafts();
    await this.run('submit', {});
  }

  public async Resend(): Promise<void> {
    await this.run('resend', {});
  }

  public OnCodeInput(event: Event): void {
    this.CodeDraft = (event.target as HTMLInputElement).value;
  }

  public async SubmitCode(): Promise<void> {
    const code = this.CodeDraft;
    if (code.trim() === '') {
      return;
    }
    const outcome = await this.run('enter_code', { code });
    if (outcome.Success) {
      this.CodeDraft = '';
    }
    this.cdr.markForCheck();
  }

  public get HasUnconfirmed(): boolean {
    return !!this.View && ((this.View.Name.Value !== '' && !this.View.Name.Confirmed) || (this.View.Email.Value !== '' && !this.View.Email.Confirmed));
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private fieldView(field: IdentityField) {
    return field === 'name' ? this.View!.Name : this.View!.Email;
  }

  /** Commits fields the user typed but did not blur out of, so pressing "Send code" never drops them. */
  private async commitPendingDrafts(): Promise<void> {
    for (const field of ['name', 'email'] as const) {
      if (this.Drafts[field].trim() !== '') {
        await this.CommitField(field);
      }
    }
  }

  private async run(verb: string, args: JSONObject): Promise<RealtimeChannelVerbResult> {
    this.Busy = true;
    this.cdr.markForCheck();
    try {
      const outcome = await this.Dispatch(verb, args);
      this.ActionProblem = outcome.Success ? '' : (outcome.Error ?? 'That did not work. Please try again.');
      return outcome;
    } finally {
      this.Busy = false;
      this.cdr.markForCheck();
    }
  }

  private onView(view: IdentityVerificationView): void {
    const enteredCodeStage = this.View?.Status !== 'code_sent' && view.Status === 'code_sent';
    this.View = view;
    this.syncCooldown();
    this.cdr.markForCheck();
    if (enteredCodeStage) {
      // The code box did not exist until this render; move focus into it once it does.
      queueMicrotask(() => this.codeInput?.nativeElement.focus());
    }
  }

  private syncCooldown(): void {
    const remaining = this.View ? Math.max(0, Math.ceil((this.View.ResendAvailableAt - Date.now()) / 1000)) : 0;
    this.ResendWaitSeconds = remaining;
    if (remaining > 0 && this.tick === null) {
      this.tick = setInterval(() => this.onTick(), 1000);
    } else if (remaining === 0) {
      this.stopTick();
    }
  }

  private onTick(): void {
    this.syncCooldown();
    this.cdr.markForCheck();
  }

  private stopTick(): void {
    if (this.tick !== null) {
      clearInterval(this.tick);
      this.tick = null;
    }
  }
}
