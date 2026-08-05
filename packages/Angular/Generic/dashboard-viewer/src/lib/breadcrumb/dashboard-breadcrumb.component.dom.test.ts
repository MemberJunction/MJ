import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, text, hasClass, attr, capture } from '@memberjunction/ng-test-utils';
import { DashboardBreadcrumbComponent, BreadcrumbNavigateEvent } from './dashboard-breadcrumb.component';

/**
 * DOM-level spec for <mj-dashboard-breadcrumb> — a module-declared (standalone:false),
 * OnPush leaf. This spec covers the entity-data-free surface of the template: the
 * @if (Visible) gating, the always-present root item (RootLabel / RootIcon bindings,
 * Size class), and the root Navigate(null) @Output. The category @for and dashboard-name
 * branches require MJDashboardCategoryEntity / MJDashboardEntity instances — whose only
 * construction path is the metadata provider (not bootstrapped in DOM unit tests) — so
 * they are intentionally left to a higher-level test (see deferred note).
 */
describe('DashboardBreadcrumbComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<DashboardBreadcrumbComponent> {
    return renderComponentFixture(DashboardBreadcrumbComponent, {
      declarations: [DashboardBreadcrumbComponent],
      inputs,
    });
  }

  it('renders the breadcrumb container with the root item by default', () => {
    const f = render();
    expect(query(f, '.dashboard-breadcrumb')).not.toBeNull();
    expect(query(f, '.breadcrumb-item.root')).not.toBeNull();
  });

  it('hides the whole breadcrumb when Visible is false', () => {
    const f = render({ Visible: false });
    expect(query(f, '.dashboard-breadcrumb')).toBeNull();
  });

  it('renders the default root label and icon', () => {
    const f = render();
    expect(text(f, '.breadcrumb-item.root span')).toBe('Dashboards');
    expect(attr(f, '.breadcrumb-item.root i', 'class')).toContain('fa-gauge-high');
  });

  it('binds a custom RootLabel and RootIcon', () => {
    const f = render({ RootLabel: 'Home', RootIcon: 'fa-solid fa-house' });
    expect(text(f, '.breadcrumb-item.root span')).toBe('Home');
    expect(attr(f, '.breadcrumb-item.root i', 'class')).toContain('fa-house');
  });

  it('applies the large class when Size is large', () => {
    const f = render({ Size: 'large' });
    expect(hasClass(f, '.dashboard-breadcrumb', 'large')).toBe(true);
  });

  it('does not apply the large class for the normal size', () => {
    const f = render({ Size: 'normal' });
    expect(hasClass(f, '.dashboard-breadcrumb', 'large')).toBe(false);
  });

  it('renders no category crumbs when there are no Categories', () => {
    const f = render();
    expect(query(f, '.breadcrumb-separator')).toBeNull();
  });

  it('emits Navigate with a null category when the root item is clicked', () => {
    const f = render();
    const navigated = capture<BreadcrumbNavigateEvent>(f.componentInstance.Navigate);
    (f.nativeElement.querySelector('.breadcrumb-item.root') as HTMLButtonElement).click();
    expect(navigated).toHaveLength(1);
    expect(navigated[0].CategoryId).toBeNull();
    expect(navigated[0].Category).toBeNull();
  });

  it('marks the root as a drop target while a drag hovers over it', () => {
    const f = render();
    const root = f.nativeElement.querySelector('.breadcrumb-item.root') as HTMLButtonElement;
    const dragEvent = new Event('dragover', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragEvent, 'dataTransfer', { value: { dropEffect: '' } });
    root.dispatchEvent(dragEvent);
    f.detectChanges();
    expect(root.classList.contains('drop-target')).toBe(true);
  });
});
