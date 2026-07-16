import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { Subject } from 'rxjs';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { ComponentBrowserComponent } from './component-browser.component';
import { ComponentStudioStateService } from '../../services/component-studio-state.service';

/**
 * DOM coverage for <mj-component-browser> — the Component Studio browser. Its list body is driven by
 * the ComponentStudioStateService; a fake with empty collections renders the empty list, letting us
 * cover the header actions the component OWNS: the New Component button and the Import dropdown
 * (toggle + From Artifact/File/Text), which emit NewComponent / ImportFrom* outputs. mj-loading +
 * mj-empty-state are stubbed; mjButton imported. Single synchronous render.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub { @Input() text = ''; }

// Minimal state service: empty collections + default-returning helpers so the list body renders empty.
function fakeState(): ComponentStudioStateService {
  const zeroFns = ['ClearAllFilters', 'FormatNamespace', 'GetComponentDescription', 'GetComponentLoadedAt', 'GetComponentName', 'GetComponentNamespace', 'GetComponentStatus', 'GetComponentType', 'GetComponentTypeColor', 'GetComponentTypeIcon', 'GetComponentUpdatedAt', 'GetComponentVersion', 'GetNamespaceColor', 'ToggleCategory', 'ToggleFilterPanel', 'ToggleShowAllCategories', 'ToggleShowDeprecatedComponents', 'ToggleShowOnlyFavorites'];
  const s: Record<string, unknown> = {
    StateChanged: new Subject<void>(),
    SearchQuery: '', IsLoading: false, IsFilterPanelExpanded: false,
    ShowAllCategories: false, ShowDeprecatedComponents: false, ShowOnlyFavorites: false,
    AllComponents: [], FilteredComponents: [], AvailableCategories: [],
    GetVisibleCategories: () => [], GetActiveFilterCount: () => 0, GetDeprecatedCount: () => 0,
    IsCategorySelected: () => false, IsFavorite: () => false, IsFileLoadedComponent: () => false,
  };
  for (const fn of zeroFns) s[fn] = () => '';
  return s as unknown as ComponentStudioStateService;
}

const render = () =>
  renderComponentFixture(ComponentBrowserComponent, {
    imports: [MJButtonDirective, MJEmptyStateComponent, LoadingStub],
    declarations: [ComponentBrowserComponent],
    providers: [{ provide: ComponentStudioStateService, useValue: fakeState() }],
  });

const headerBtn = (f: ReturnType<typeof render>, label: string) => queryAll(f, '.browser-header button').find((b) => b.textContent?.includes(label)) as HTMLElement;

describe('ComponentBrowserComponent (DOM)', () => {
  it('renders the New Component and Import header actions', () => {
    const fixture = render();
    expect(headerBtn(fixture, 'New Component')).toBeTruthy();
    expect(headerBtn(fixture, 'Import')).toBeTruthy();
  });

  it('emits NewComponent when the New Component button is clicked', () => {
    const fixture = render();
    const created = capture(fixture.componentInstance.NewComponent);
    headerBtn(fixture, 'New Component').click();
    expect(created.length).toBe(1);
  });

  it('reveals the import dropdown items when Import is toggled', () => {
    const fixture = render();
    expect(query(fixture, '.dropdown-menu')).toBeNull();
    headerBtn(fixture, 'Import').click();
    fixture.detectChanges();
    expect(queryAll(fixture, '.dropdown-menu .dropdown-item').length).toBe(3);
  });

  it('emits the matching Import output for each dropdown item', () => {
    const fixture = render();
    const artifact = capture(fixture.componentInstance.ImportFromArtifact);
    const file = capture(fixture.componentInstance.ImportFromFile);
    const text = capture(fixture.componentInstance.ImportFromText);
    headerBtn(fixture, 'Import').click();
    fixture.detectChanges();
    const items = queryAll(fixture, '.dropdown-menu .dropdown-item');
    (items[0] as HTMLElement).click(); // From Artifact
    (items[1] as HTMLElement).click(); // From File
    (items[2] as HTMLElement).click(); // From Text
    expect(artifact.length).toBe(1);
    expect(file.length).toBe(1);
    expect(text.length).toBe(1);
  });
});
