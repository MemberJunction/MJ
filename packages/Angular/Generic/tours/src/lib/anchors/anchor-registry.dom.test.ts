import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  RegisterFormAnchorContainer,
  UnregisterFormAnchorContainer,
} from '@memberjunction/ng-base-forms';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnchorRegistry } from './anchor-registry';
import { DomTourAnchorBridge } from './dom-tour-anchor-bridge';
import { MJTourAnchorDirective } from './mj-tour-anchor.directive';

@Component({
  standalone: true,
  imports: [MJTourAnchorDirective],
  template: `<button type="button" [mjTourAnchor]="key" aria-label="Save Deal">Save</button>`,
})
class AnchorTestHostComponent {
  public key = 'sales.deals.save';
}

describe('AnchorRegistry, MJTourAnchorDirective & DomTourAnchorBridge', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('registers and unregisters via [mjTourAnchor] directive and computes visible accessible names', () => {
    const fixture = TestBed.createComponent(AnchorTestHostComponent);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('button') as HTMLElement;
    expect(btn.getAttribute('data-mj-tour-anchor')).toBe('sales.deals.save');
    expect(AnchorRegistry.Instance.GetElement('sales.deals.save')).toBe(btn);

    const visible = AnchorRegistry.Instance.GetVisibleAnchors();
    expect(visible.some((v) => v.AnchorKey === 'sales.deals.save' && v.AccessibleName === 'Save Deal')).toBe(true);

    fixture.destroy();
    expect(AnchorRegistry.Instance.GetElement('sales.deals.save')).toBeNull();
  });

  it('WaitFor resolves via MutationObserver without polling when element appears asynchronously', async () => {
    const waitPromise = AnchorRegistry.Instance.WaitFor('async.portal.btn', 1500);

    setTimeout(() => {
      const btn = document.createElement('button');
      btn.setAttribute('data-mj-tour-anchor', 'async.portal.btn');
      btn.textContent = 'Continue';
      document.body.appendChild(btn);
    }, 20);

    const resolved = await waitPromise;
    expect(resolved).not.toBeNull();
    expect(resolved?.textContent).toBe('Continue');
  });

  it('DomTourAnchorBridge resolves FormField via FormAnchorNavigator settle and Role/NavItem/Selector', async () => {
    const formHost = document.createElement('mj-record-form-container');
    const settledField = document.createElement('div');
    settledField.setAttribute('data-field-name', 'Amount');
    settledField.textContent = 'Amount';
    formHost.appendChild(settledField);
    document.body.appendChild(formHost);

    const navSpy = vi.fn(async () => settledField);
    RegisterFormAnchorContainer(formHost, {
      EntityName: 'Deals',
      NavigateToTourAnchor: navSpy,
    });

    const bridge = new DomTourAnchorBridge();
    try {
      const formRes = await bridge.ResolveElement({
        Strategy: 'FormField',
        Entity: 'Deals',
        Field: 'Amount',
      });
      expect(navSpy).toHaveBeenCalledWith(
        expect.objectContaining({ AnchorType: 'Field', AnchorKey: 'Amount' }),
      );
      expect(formRes.Info.Found).toBe(true);
      expect(formRes.Info.Resolution).toBe('Semantic');
      expect(formRes.Element).toBe(settledField);

      const navBtn = document.createElement('button');
      navBtn.setAttribute('data-mj-nav-key', 'sales-pipeline');
      navBtn.textContent = 'Pipeline';
      document.body.appendChild(navBtn);

      const navRes = await bridge.ResolveAnchor({ Strategy: 'NavItem', NavItemKey: 'sales-pipeline' });
      expect(navRes.Found).toBe(true);
      expect(navRes.Resolution).toBe('Semantic');

      const roleBtn = document.createElement('button');
      roleBtn.setAttribute('aria-label', 'Renew Membership');
      document.body.appendChild(roleBtn);

      const roleRes = await bridge.ResolveAnchor({
        Strategy: 'Role',
        Role: 'button',
        Name: 'Renew Membership',
      });
      expect(roleRes.Found).toBe(true);
      expect(roleRes.Resolution).toBe('Role');

      const selRes = await bridge.ResolveAnchor({
        Strategy: 'Selector',
        Selector: '[data-mj-nav-key="sales-pipeline"]',
      });
      expect(selRes.Found).toBe(true);
      expect(selRes.Resolution).toBe('Selector');
    } finally {
      UnregisterFormAnchorContainer(formHost);
    }
  });
});
