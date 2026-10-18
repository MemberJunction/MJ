import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, attr, click, ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import type { MJReactComponent } from '@memberjunction/ng-react';
import { InteractiveComponentHostComponent } from './interactive-component-host.component';
import { RealtimeInteractiveComponentSurfaceComponent } from './realtime-interactive-component-surface.component';
import { ComponentInstanceEngine } from './component-instance-engine';
import { ReactComponentHandle } from './react-component-handle';
import type { ComponentActivity, IInteractiveComponentHandle, ResolvedComponentArtifact } from './interactive-component-types';
import { MakeArtifact, MakeSpec } from '../../../../__tests__/helpers/interactive-component-fixtures';

/** Stands in for `mj-react-component`, whose React bootstrap cannot run in jsdom. Same inputs and outputs. */
@Component({ selector: 'mj-react-component', standalone: true, template: '' })
class StubReactComponent {
  @Input() Component: unknown;
  @Input() ComponentProps: unknown;
  @Input() Provider: unknown;
  @Output() ComponentEvent = new EventEmitter<{ type: string; payload: unknown }>();
  @Output() StateChange = new EventEmitter<{ path: string; value: unknown }>();
  @Output() Initialized = new EventEmitter<void>();
}

function stubReactInHost(): void {
  TestBed.overrideComponent(InteractiveComponentHostComponent, { set: { imports: [StubReactComponent] } });
}

const REVENUE = MakeArtifact('A1', 'V1', 1, MakeSpec({ title: 'Revenue' }), 'Revenue dashboard');
const PIPELINE = MakeArtifact('A2', 'P1', 1, MakeSpec({ title: 'Pipeline' }), 'Pipeline board');

describe('RealtimeInteractiveComponentSurfaceComponent (DOM)', () => {
  let engine: ComponentInstanceEngine;

  beforeEach(() => {
    engine = new ComponentInstanceEngine(4);
    stubReactInHost();
  });

  const render = (activity: ((id: string, a: ComponentActivity) => void) | null = null, agentName = 'Sage') =>
    renderComponentFixture(RealtimeInteractiveComponentSurfaceComponent, {
      providers: [],
      setup: (instance) => {
        instance.AgentName = agentName;
        instance.ActivityHandler = activity;
        instance.Engine = engine;
      },
    });

  it('shows an empty state naming the agent while nothing is open', () => {
    const f = render();
    expect(text(f, '.ic-empty__title')).toBe('No component open');
    expect(text(f, '.ic-empty__hint')).toContain('Sage');
    expect(query(f, '.ic-tabs')).toBeNull();
  });

  it('renders a tab per open component, with its name and version, and marks the active one', () => {
    engine.Add(REVENUE, {});
    engine.Add(PIPELINE, {});
    engine.SetActive('c1');
    const f = render();
    const tabs = queryAll(f, '[role="tab"]');
    expect(tabs).toHaveLength(2);
    
    expect(tabs[0].textContent).toContain('Revenue dashboard');
    expect(tabs[0].textContent).toContain('v1');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');
  });

  it('keeps EVERY component mounted and hides the inactive ones, so switching never loses state', () => {
    engine.Add(REVENUE, {});
    engine.Add(PIPELINE, {});
    engine.SetActive('c1');
    const f = render();
    const panes = queryAll(f, '[role="tabpanel"]');
    expect(panes.map((p) => p.getAttribute('data-instance'))).toEqual(['c1', 'c2']);
    expect(panes.map((p) => p.hasAttribute('hidden'))).toEqual([false, true]);
    expect(queryAll(f, 'mj-interactive-component-host')).toHaveLength(2);
  });

  it('follows the engine: a component opened or closed by the agent appears and disappears', () => {
    const f = render();
    engine.Add(REVENUE, {});
    f.detectChanges();
    expect(queryAll(f, '[role="tab"]')).toHaveLength(1);
    engine.Remove('c1');
    f.detectChanges();
    expect(query(f, '.ic-empty')).not.toBeNull();
  });

  it('a version swap keeps the same pane element (the component is not remounted) and updates the version badge', () => {
    engine.Add(REVENUE, {});
    const f = render();
    const pane = query(f, '[data-instance="c1"]');
    engine.SwapVersion('c1', MakeArtifact('A1', 'V2', 2, MakeSpec({ title: 'Revenue v2' }), 'Revenue dashboard'));
    f.detectChanges();
    expect(query(f, '[data-instance="c1"]')).toBe(pane);
    expect(text(f, '.ic-tab__version')).toBe('v2');
  });

  it('clicking a tab reports it to the channel (which owns the active flag)', () => {
    engine.Add(REVENUE, {});
    engine.Add(PIPELINE, {});
    const activity = vi.fn();
    const f = render(activity);
    click(f, '.ic-tab:first-child');
    expect(activity).toHaveBeenCalledWith('c1', { Kind: 'selected' });
  });

  it('without a channel handler a tab click activates the instance directly', () => {
    engine.Add(REVENUE, {});
    engine.Add(PIPELINE, {});
    const f = render(null);
    click(f, '.ic-tab:first-child');
    expect(engine.ActiveID).toBe('c1');
  });

  it('the close button closes the component the user is looking at, and only that one', () => {
    engine.Add(REVENUE, {});
    engine.Add(PIPELINE, {});
    engine.SetActive('c1');
    const activity = vi.fn();
    const f = render(activity);
    click(f, '.ic-close');
    expect(activity).toHaveBeenCalledTimes(1);
    expect(activity).toHaveBeenCalledWith('c1', { Kind: 'closed' });
  });

  it('names the component the close button will close', () => {
    engine.Add(REVENUE, {});
    const f = render();
    expect(attr(f, '.ic-close', 'aria-label')).toBe('Close Revenue dashboard');
  });

  it('the close button sits outside the tab list, so the tabs contain only tabs', () => {
    engine.Add(REVENUE, {});
    const f = render();
    expect(query(f, '[role="tablist"] .ic-close')).toBeNull();
    expect(queryAll(f, '[role="tablist"] > *').every((el) => el.getAttribute('role') === 'tab')).toBe(true);
  });

  it('arrow keys, Home and End move between tabs', () => {
    engine.Add(REVENUE, {});
    engine.Add(PIPELINE, {});
    const activity = vi.fn();
    const f = render(activity);
    const tab = query(f, '.ic-tab:first-child') as HTMLElement;
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(activity).toHaveBeenLastCalledWith('c2', { Kind: 'selected' });
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(activity).toHaveBeenLastCalledWith('c2', { Kind: 'selected' });
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(activity).toHaveBeenLastCalledWith('c1', { Kind: 'selected' });
    const before = activity.mock.calls.length;
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(activity.mock.calls).toHaveLength(before);
  });

  it("hands the active pane's element to a frame capturer, and null when nothing is open", () => {
    engine.Add(REVENUE, {});
    engine.Add(PIPELINE, {});
    engine.SetActive('c2');
    const f = render();
    expect(f.componentInstance.GetActiveElement()).toBe(query(f, '[data-instance="c2"]'));
    engine.Remove('c1');
    engine.Remove('c2');
    f.detectChanges();
    expect(f.componentInstance.GetActiveElement()).toBeNull();
  });

  it('attaches a component handle to the engine when its host reports one, and clears it when a new version loads', () => {
    engine.Add(REVENUE, {});
    const f = render();
    const handle: IInteractiveComponentHandle = new ReactComponentHandle({} as MJReactComponent);
    f.componentInstance.OnHandleChange('c1', handle);
    expect(engine.Get('c1')?.Handle).toBe(handle);
    f.componentInstance.OnHandleChange('c1', null);
    expect(engine.Get('c1')?.Handle).toBeNull();
  });

  it('forwards what happens inside a component to the channel, tagged with the instance', () => {
    engine.Add(REVENUE, {});
    const activity = vi.fn();
    const f = render(activity);
    f.componentInstance.OnActivity('c1', { Kind: 'event', Name: 'rowSelected', Payload: { id: 1 } });
    expect(activity).toHaveBeenCalledWith('c1', { Kind: 'event', Name: 'rowSelected', Payload: { id: 1 } });
  });

  it('has no accessibility violations, empty or populated', async () => {
    const empty = render();
    await ExpectNoAxeViolations(empty);
    engine.Add(REVENUE, {});
    engine.Add(PIPELINE, {});
    TestBed.resetTestingModule();
    stubReactInHost();
    const populated = render();
    await ExpectNoAxeViolations(populated);
  });
});

describe('InteractiveComponentHostComponent (DOM)', () => {
  beforeEach(() => stubReactInHost());

  const spec = MakeSpec();
  const render = () =>
    renderComponentFixture(InteractiveComponentHostComponent, { providers: [], inputs: { Spec: spec, Inputs: { year: 2026 } } });

  it('passes the spec and the inputs to the component it hosts', () => {
    const f = render();
    const stub = f.debugElement.query((d) => d.name === 'mj-react-component').componentInstance as StubReactComponent;
    expect(stub.Component).toBe(spec);
    expect(stub.ComponentProps).toEqual({ year: 2026 });
  });

  it('hands out a live handle once the component has initialized, and reports that it did', () => {
    const f = render();
    const handles: Array<IInteractiveComponentHandle | null> = [];
    const activity: ComponentActivity[] = [];
    f.componentInstance.HandleChange.subscribe((h) => handles.push(h));
    f.componentInstance.Activity.subscribe((a) => activity.push(a));
    const stub = f.debugElement.query((d) => d.name === 'mj-react-component').componentInstance as StubReactComponent;
    stub.Initialized.emit();
    expect(handles).toHaveLength(1);
    expect(handles[0]).toBeInstanceOf(ReactComponentHandle);
    expect(handles[0]?.IsReady).toBe(true);
    expect(activity).toEqual([{ Kind: 'initialized' }]);
  });

  it('maps a component event and a state change to activity', () => {
    const f = render();
    const activity: ComponentActivity[] = [];
    f.componentInstance.Activity.subscribe((a) => activity.push(a));
    const stub = f.debugElement.query((d) => d.name === 'mj-react-component').componentInstance as StubReactComponent;
    stub.ComponentEvent.emit({ type: 'rowSelected', payload: { id: 7 } });
    stub.StateChange.emit({ path: 'filters.region', value: 'EMEA' });
    expect(activity).toEqual([{ Kind: 'event', Name: 'rowSelected', Payload: { id: 7 } }, { Kind: 'state' }]);
  });

  it('a new Spec (a new version) drops the handle until the new version has initialized', () => {
    const f = render();
    const handles: Array<IInteractiveComponentHandle | null> = [];
    f.componentInstance.HandleChange.subscribe((h) => handles.push(h));
    const next: ResolvedComponentArtifact = MakeArtifact('A1', 'V2', 2, MakeSpec({ code: 'function Revenue2() { return null; }' }));
    f.componentRef.setInput('Spec', next.Spec);
    f.detectChanges();
    expect(handles).toEqual([null]);
    const stub = f.debugElement.query((d) => d.name === 'mj-react-component').componentInstance as StubReactComponent;
    expect(stub.Component).toBe(next.Spec);
  });

  it("exposes its own element for frame capture", () => {
    const f = render();
    expect(f.componentInstance.Element).toBe(f.nativeElement);
  });
});

describe('ReactComponentHandle', () => {
  /** What `MJReactComponent` offers the handle. */
  class FakeReact {
    public Calls: string[] = [];
    public HasMethod(name: string): boolean {
      this.Calls.push(`has:${name}`);
      return name === 'known';
    }
    public InvokeMethod(name: string, ...args: unknown[]): unknown {
      this.Calls.push(`invoke:${name}:${JSON.stringify(args)}`);
      return name === 'async' ? Promise.resolve('later') : 'now';
    }
    public GetCurrentDataState(): object {
      return { title: 'x' };
    }
    public Refresh(): void { this.Calls.push('refresh'); }
    public Print(): void { this.Calls.push('print'); }
    public validate(): unknown { return { valid: true }; }
    public IsDirty(): boolean { return true; }
    public Reset(): void { this.Calls.push('reset'); }
    public ScrollTo(target: unknown): void { this.Calls.push(`scroll:${JSON.stringify(target)}`); }
    public Focus(target?: string): void { this.Calls.push(`focus:${target ?? ''}`); }
  }

  it('delegates to the component, awaiting sync and async method results alike', async () => {
    const react = new FakeReact();
    const handle = new ReactComponentHandle(react as unknown as MJReactComponent);
    expect(handle.IsReady).toBe(true);
    expect(handle.HasMethod('known')).toBe(true);
    expect(handle.HasMethod('other')).toBe(false);
    expect(await handle.InvokeMethod('sync', [1, 'a'])).toBe('now');
    expect(await handle.InvokeMethod('async', [])).toBe('later');
    expect(handle.GetCurrentDataState()).toEqual({ title: 'x' });
    expect(handle.Validate()).toEqual({ valid: true });
    expect(handle.IsDirty()).toBe(true);
    handle.Refresh();
    handle.Print();
    handle.Reset();
    handle.ScrollTo('#a');
    handle.Focus('input');
    expect(react.Calls).toEqual(['has:known', 'has:other', 'invoke:sync:[1,"a"]', 'invoke:async:[]', 'refresh', 'print', 'reset', 'scroll:"#a"', 'focus:input']);
  });
});
