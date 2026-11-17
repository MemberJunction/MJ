import { Component, OnInit, computed, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BasePublicPage } from '@memberjunction/ng-public-host';

interface LumenFeature {
  Icon: string;
  Title: string;
  Text: string;
}

interface LumenPlan {
  Key: string;
  Name: string;
  Price: string;
  Unit: string;
  Summary: string;
  Items: string[];
  Action: 'signup' | 'contact';
}

interface LumenQuestion {
  Question: string;
  Answer: string;
}

/** Bar heights, in percent, for the dashboard picture in the hero. */
const HERO_BARS = [42, 58, 51, 66, 73, 61, 84, 79, 92];

const FEATURES: LumenFeature[] = [
  { Icon: 'fa-solid fa-plug', Title: 'Connect your data', Text: 'Bring in spreadsheets, databases and the tools your team already uses, in a few clicks.' },
  { Icon: 'fa-solid fa-chart-line', Title: 'Dashboards that stay current', Text: 'Charts refresh on their own, so the numbers in the meeting are today\'s numbers.' },
  { Icon: 'fa-solid fa-users', Title: 'Built for the whole team', Text: 'Share a dashboard with a link. Comment on a chart. Everyone sees the same thing.' },
  { Icon: 'fa-solid fa-shield-halved', Title: 'Access you control', Text: 'Decide who sees which data, down to the row. Every change is recorded.' },
];

const PLANS: LumenPlan[] = [
  {
    Key: 'starter', Name: 'Starter', Price: '$0', Unit: 'for up to 5 people', Summary: 'For small teams getting started.',
    Items: ['3 dashboards', '2 data connections', 'Daily refresh'], Action: 'signup',
  },
  {
    Key: 'team', Name: 'Team', Price: '$12', Unit: 'per person, per month', Summary: 'For teams that run on their numbers.',
    Items: ['Unlimited dashboards', '20 data connections', 'Hourly refresh', 'Comments and alerts'], Action: 'signup',
  },
  {
    Key: 'business', Name: 'Business', Price: 'Custom', Unit: 'billed yearly', Summary: 'For organizations with many teams.',
    Items: ['Everything in Team', 'Row-level access rules', 'Single sign-on', 'Priority support'], Action: 'contact',
  },
];

const QUESTIONS: LumenQuestion[] = [
  { Question: 'Do I need a credit card to start?', Answer: 'No. The Starter plan is free for up to 5 people, with no card and no time limit.' },
  { Question: 'Can I change plans later?', Answer: 'Yes. Change plans at any time from your account settings. We prorate the difference.' },
  { Question: 'Where is my data stored?', Answer: 'In the region you choose when you create your account. You can export all of it at any time.' },
];

/**
 * Public landing page for the fictional product Acme Lumen. Visitors see it at `/p/lumen`
 * without signing in. "Create account" opens the identity provider's sign-up form.
 */
@Component({
  selector: 'acme-lumen-landing-page',
  templateUrl: './lumen-landing-page.component.html',
  styleUrl: './lumen-landing-page.component.css',
})
export class LumenLandingPageComponent extends BasePublicPage implements OnInit {
  private readonly title = inject(Title);

  public readonly Bars = HERO_BARS;
  public readonly Features = FEATURES;
  public readonly Plans = PLANS;
  public readonly Questions = QUESTIONS;
  public readonly Year = new Date().getFullYear();

  /** The plan to highlight: `?plan=<key>` when it names a plan, otherwise Team. */
  public readonly HighlightedPlan = this.Context.QueryParams.get('plan') ?? 'team';

  /** The logo from the sign-in page design, when Login Studio has one. */
  public readonly LogoURL = computed(() => {
    const logos = this.Context.Brand()?.Logos;
    return logos?.wordmarkURL ?? logos?.lightMarkURL ?? null;
  });

  ngOnInit(): void {
    this.title.setTitle('Lumen — dashboards your whole team can read');
  }

  public OnCreateAccount(): void {
    this.Context.StartSignUp();
  }

  public OnSignIn(): void {
    this.Context.StartSignIn();
  }

  public OnPlanAction(plan: LumenPlan): void {
    if (plan.Action === 'signup') {
      this.Context.StartSignUp();
    } else {
      window.location.href = 'mailto:sales@example.com?subject=Lumen%20Business';
    }
  }
}
