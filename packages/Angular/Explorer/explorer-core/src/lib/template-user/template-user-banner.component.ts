import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { Metadata } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';

/**
 * A banner across the top of Explorer while the signed-in user is a template user (`User.IsTemplate`).
 *
 * A template user exists to be copied: its pinned apps, views, settings, dashboards and conversations
 * become the starting point for new users. Working in one by mistake changes what every future copy
 * gets, so the banner is loud and stays up for the whole session.
 */
@Component({
  selector: 'mj-template-user-banner',
  standalone: true,
  template: `
    @if (TemplateEmail(); as email) {
      <div class="template-user-banner" role="alert">
        <i class="fa-solid fa-clone" aria-hidden="true"></i>
        <span>
          <strong>Template user.</strong>
          You are signed in as {{ email }}, a template. Everything you set up here (pinned apps, views,
          settings, dashboards, conversations) is copied to new users created from this template.
        </span>
      </div>
    }
  `,
  styles: [`
    :host {
      flex-shrink: 0;
      width: 100%;
    }

    .template-user-banner {
      background: var(--mj-status-error-bg);
      color: var(--mj-status-error-text);
      border-bottom: 2px solid var(--mj-status-error-border);
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 14px;
    }

    .template-user-banner i {
      font-size: 16px;
      flex-shrink: 0;
    }

    .template-user-banner span {
      text-align: center;
    }

    @media (max-width: 480px) {
      .template-user-banner {
        padding: 6px 12px;
        font-size: 13px;
      }
    }
  `],
})
export class TemplateUserBannerComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  /** The template user's email while one is signed in; null otherwise. A signal, so a late sign-in redraws. */
  public readonly TemplateEmail = signal<string | null>(null);

  ngOnInit(): void {
    // The current user is known once the provider signs in; the replaying listener covers a banner
    // created after that happened.
    MJGlobal.Instance.GetEventListener(true)
      .pipe(
        filter((e) => e.event === MJEventType.LoggedIn),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.Refresh());
    this.Refresh();
  }

  /** Re-reads the current user. */
  public Refresh(): void {
    const user = Metadata.Provider?.CurrentUser; // global-provider-ok: the Explorer shell runs under the single signed-in provider
    this.TemplateEmail.set(user?.IsTemplate === true ? user.Email || user.Name : null);
  }
}
