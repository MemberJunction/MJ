import { describe, it, expect, beforeEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RenderComponentFixture, Query, QueryAll, CreateFakeProvider } from '@memberjunction/ng-test-utils';
import type { IMetadataProvider } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { InteractiveComponentHostComponent } from './interactive-component-host.component';
import { ReactComponentHandle } from './react-component-handle';
import type { ComponentActivity, IInteractiveComponentHandle } from './interactive-component-types';
import { MakeSpec } from '../../../../__tests__/helpers/interactive-component-fixtures';

/**
 * DOM spec for the host the Interactive Component channel mounts each component in.
 *
 * The seam is `mj-react-component`: it boots MJ's React runtime, which cannot run in jsdom (and is not what is under
 * test). The stand-in below has the same selector, inputs and outputs, so the host's template binds to it exactly as it
 * binds to the real one, and it carries the methods the host's handle delegates to so the handle can be exercised
 * end to end. What is asserted is the host's own contract: what it passes down, what it reports up, and when it hands
 * out (and takes back) a handle.
 */
@Component({ selector: 'mj-react-component', standalone: true, template: '' })
class StubReactComponent {
    @Input() Component: ComponentSpec | undefined;
    @Input() ComponentProps: object | undefined;
    @Input() Provider: IMetadataProvider | null = null;
    @Output() ComponentEvent = new EventEmitter<{ type: string; payload: unknown }>();
    @Output() StateChange = new EventEmitter<{ path: string; value: unknown }>();
    @Output() Initialized = new EventEmitter<void>();

    public Calls: string[] = [];
    public HasMethod(name: string): boolean {
        return name === 'highlight';
    }
    public InvokeMethod(name: string, ...args: unknown[]): unknown {
        this.Calls.push(`${name}(${args.join(',')})`);
        return `ran ${name}`;
    }
    public GetCurrentDataState(): object {
        return { source: 'stub' };
    }
    public Refresh(): void {
        this.Calls.push('refresh');
    }
}

type HostFixture = ComponentFixture<InteractiveComponentHostComponent>;

interface RenderedHost {
    Fixture: HostFixture;
    Activity: ComponentActivity[];
    Handles: Array<IInteractiveComponentHandle | null>;
}

const SPEC = MakeSpec({ title: 'Revenue' });

function render(inputs: Record<string, unknown> = {}): RenderedHost {
    const activity: ComponentActivity[] = [];
    const handles: Array<IInteractiveComponentHandle | null> = [];
    const fixture = RenderComponentFixture(InteractiveComponentHostComponent, {
        providers: [],
        inputs: { Spec: SPEC, ...inputs },
        setup: (host) => {
            host.Activity.subscribe((a) => activity.push(a));
            host.HandleChange.subscribe((h) => handles.push(h));
        },
    });
    return { Fixture: fixture, Activity: activity, Handles: handles };
}

const reactStub = (fixture: HostFixture): StubReactComponent => fixture.debugElement.query(By.directive(StubReactComponent)).componentInstance;

describe('InteractiveComponentHostComponent (DOM)', () => {
    beforeEach(() => {
        TestBed.overrideComponent(InteractiveComponentHostComponent, { set: { imports: [StubReactComponent] } });
    });

    describe('what it renders and passes down', () => {
        it('hosts exactly one react component, styled as the host fills it', () => {
            const { Fixture: f } = render();
            const hosted = QueryAll(f, 'mj-react-component');
            expect(hosted).toHaveLength(1);
            expect(hosted[0].classList.contains('ic-host__component')).toBe(true);
        });

        it('passes the Spec to the component it hosts', () => {
            const { Fixture: f } = render();
            expect(reactStub(f).Component).toBe(SPEC);
        });

        it("passes the Inputs through as the component's props", () => {
            expect(reactStub(render({ Inputs: { year: 2026, region: 'EMEA' } }).Fixture).ComponentProps).toEqual({ year: 2026, region: 'EMEA' });
        });

        it('passes no props when no Inputs are given', () => {
            expect(reactStub(render().Fixture).ComponentProps).toEqual({});
        });

        it("forwards the session provider so the component's data access runs as the signed-in user", () => {
            const provider = CreateFakeProvider();
            expect(reactStub(render({ Provider: provider }).Fixture).Provider).toBe(provider);
        });

        it('forwards no provider when the session has none', () => {
            expect(reactStub(render().Fixture).Provider).toBeNull();
        });

        it('keeps passing new Inputs down as they change, without remounting the component', () => {
            const { Fixture: f } = render({ Inputs: { year: 2025 } });
            const before = Query(f, 'mj-react-component');
            f.componentRef.setInput('Inputs', { year: 2026 });
            f.detectChanges();
            expect(reactStub(f).ComponentProps).toEqual({ year: 2026 });
            expect(Query(f, 'mj-react-component')).toBe(before);
        });

        it('exposes its own element, which is what a frame capturer rasterizes', () => {
            const { Fixture: f } = render();
            expect(f.componentInstance.Element).toBe(f.nativeElement);
            expect(f.componentInstance.Element.contains(Query(f, 'mj-react-component'))).toBe(true);
        });
    });

    describe('Activity: what the user does in the component', () => {
        it('reports a component event with its type and payload', () => {
            const { Fixture: f, Activity } = render();
            reactStub(f).ComponentEvent.emit({ type: 'rowSelected', payload: { id: 7 } });
            expect(Activity).toEqual([{ Kind: 'event', Name: 'rowSelected', Payload: { id: 7 } }]);
        });

        it('reports an event that carries no payload, without inventing one', () => {
            const { Fixture: f, Activity } = render();
            reactStub(f).ComponentEvent.emit({ type: 'closed', payload: undefined });
            expect(Activity).toEqual([{ Kind: 'event', Name: 'closed', Payload: undefined }]);
        });

        it('reports a state change as a bare notification: the channel learns THAT it changed, not what changed', () => {
            const { Fixture: f, Activity } = render();
            reactStub(f).StateChange.emit({ path: 'filters.region', value: 'EMEA' });
            expect(Activity).toEqual([{ Kind: 'state' }]);
        });

        it('reports events in the order they happened', () => {
            const { Fixture: f, Activity } = render();
            const stub = reactStub(f);
            stub.ComponentEvent.emit({ type: 'a', payload: 1 });
            stub.StateChange.emit({ path: 'x', value: 1 });
            stub.ComponentEvent.emit({ type: 'b', payload: 2 });
            expect(Activity.map((a) => a.Kind)).toEqual(['event', 'state', 'event']);
            expect(Activity.filter((a) => a.Kind === 'event').map((a) => a.Name)).toEqual(['a', 'b']);
        });
    });

    describe('HandleChange: the live handle', () => {
        it('stays silent until the component has initialized: there is nothing to drive yet', () => {
            const { Handles, Activity } = render();
            expect(Handles).toEqual([]);
            expect(Activity).toEqual([]);
        });

        it('hands out a ready handle once the component initializes, and reports that it did', () => {
            const { Fixture: f, Handles, Activity } = render();
            reactStub(f).Initialized.emit();
            expect(Handles).toHaveLength(1);
            expect(Handles[0]).toBeInstanceOf(ReactComponentHandle);
            expect(Handles[0]?.IsReady).toBe(true);
            expect(Activity).toEqual([{ Kind: 'initialized' }]);
        });

        it('hands out a handle that drives the component that was rendered, not some other', async () => {
            const { Fixture: f, Handles } = render();
            const stub = reactStub(f);
            stub.Initialized.emit();
            const handle = Handles[0];
            expect(handle?.HasMethod('highlight')).toBe(true);
            expect(handle?.HasMethod('missing')).toBe(false);
            expect(await handle?.InvokeMethod('highlight', ['row-3', 2])).toBe('ran highlight');
            expect(handle?.GetCurrentDataState()).toEqual({ source: 'stub' });
            handle?.Refresh();
            expect(stub.Calls).toEqual(['highlight(row-3,2)', 'refresh']);
        });

        it('does not drop the handle for a re-render of the same Spec', () => {
            const { Fixture: f, Handles } = render();
            reactStub(f).Initialized.emit();
            f.componentRef.setInput('Spec', SPEC);
            f.detectChanges();
            expect(Handles).toHaveLength(1);
        });

        it('takes the handle back the moment a new version arrives, and not before', () => {
            const { Fixture: f, Handles } = render();
            const next = MakeSpec({ title: 'Revenue v2', code: 'function RevenueDashboard2() { return null; }' });
            expect(Handles).toEqual([]); // the first Spec is not a "new version"
            f.componentRef.setInput('Spec', next);
            f.detectChanges();
            expect(Handles).toEqual([null]);
            expect(reactStub(f).Component).toBe(next);
        });

        it('reinitializes the SAME element in place for a version swap and issues a fresh handle', () => {
            const { Fixture: f, Handles, Activity } = render();
            const element = Query(f, 'mj-react-component');
            reactStub(f).Initialized.emit();
            f.componentRef.setInput('Spec', MakeSpec({ title: 'Revenue v2' }));
            f.detectChanges();
            reactStub(f).Initialized.emit();
            expect(Query(f, 'mj-react-component')).toBe(element);
            expect(Handles).toHaveLength(3);
            expect(Handles[1]).toBeNull();
            expect(Handles[2]).toBeInstanceOf(ReactComponentHandle);
            expect(Handles[2]).not.toBe(Handles[0]);
            expect(Activity.map((a) => a.Kind)).toEqual(['initialized', 'initialized']);
        });
    });
});
