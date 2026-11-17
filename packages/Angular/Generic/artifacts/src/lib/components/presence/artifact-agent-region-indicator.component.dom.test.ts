/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ArtifactsModule } from '../../artifacts.module';
import { ArtifactAgentRegionIndicatorComponent } from './artifact-agent-region-indicator.component';
import { type CollaboratorPresence } from '../../services/document-collaboration.service';

describe('ArtifactAgentRegionIndicatorComponent', () => {
  it('ArtifactAgentRegionIndicatorComponent renders slide/doc region indicator with acting-for user and suppresses exit phase', () => {
    TestBed.configureTestingModule({
      imports: [ArtifactsModule, ArtifactAgentRegionIndicatorComponent],
    });

    const fixture = TestBed.createComponent(ArtifactAgentRegionIndicatorComponent);
    const component = fixture.componentInstance;

    const slideAgent: CollaboratorPresence = {
      ClientID: 0x70000005,
      UserID: 'agent:deck-1',
      Name: 'Slide Builder',
      AgentName: 'Slide Builder',
      ActingForUserName: 'Amith',
      Color: 'var(--mj-brand-primary)',
      CanEdit: true,
      IsAgent: true,
      AgentPhase: 'settled',
      ActionSummary: 'Updated KPI region',
      AgentLocation: {
        Domain: 'slides',
        SlideID: 'slide-2',
        SlideNumber: 2,
        ElementID: 'reg-kpi',
      },
    };

    component.Agent = slideAgent;
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('[data-testid="artifact-agent-region-indicator"]') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.tagName).toBe('BUTTON');
    expect(badge.getAttribute('type')).toBe('button');
    expect(badge.textContent).toContain('Slide Builder');
    expect(badge.textContent).toContain('for Amith');
    expect(badge.textContent).toContain('Slide 2 · reg-kpi');
    expect(badge.classList.contains('is-settled')).toBe(true);

    // Unsafe CSS url(...) injection in Agent.Color must fall back to var(--mj-brand-primary)
    component.Agent = { ...slideAgent, Color: 'url(https://evil.example/leak.png)' };
    fixture.detectChanges();
    const sanitizedBadge = fixture.nativeElement.querySelector('[data-testid="artifact-agent-region-indicator"]') as HTMLElement;
    expect(sanitizedBadge.style.getPropertyValue('--mj-agent-accent')).toBe('var(--mj-brand-primary)');

    component.Agent = slideAgent;
    fixture.detectChanges();

    const jumpSpy = vi.fn();
    component.JumpToAgent.subscribe(jumpSpy);
    (fixture.nativeElement.querySelector('[data-testid="artifact-agent-region-indicator"]') as HTMLElement).click();
    expect(jumpSpy).toHaveBeenCalledWith(slideAgent);

    // Exit phase hides the region indicator
    component.Agent = { ...slideAgent, AgentPhase: 'exit' };
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="artifact-agent-region-indicator"]'),
    ).toBeNull();
  });
});
