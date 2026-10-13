import { describe, it, expect, beforeEach } from 'vitest';
import { Component, Input, OnDestroy, OnInit, type Type } from '@angular/core';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import type { MediaPlacement } from '@memberjunction/ai-realtime-client/media';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeChannelPaneComponent } from './realtime-channel-pane.component';

/** Every surface created and destroyed, in order, by the channel it belongs to. */
const lifecycle: string[] = [];

@Component({ selector: 'mj-test-channel-surface', standalone: true, template: '<span class="surface">{{ Channel }}</span>' })
class TestSurfaceComponent implements OnInit, OnDestroy {
  @Input() public Channel = '';
  public ngOnInit(): void {
    lifecycle.push(`created ${this.Channel}`);
  }
  public ngOnDestroy(): void {
    lifecycle.push(`destroyed ${this.Channel}`);
  }
}

/** A channel whose surface records its life, and whose plugin records binds and unbinds. */
class TestChannel extends BaseRealtimeChannelClient<TestSurfaceComponent> {
  public constructor(private readonly label: string) {
    super();
  }
  public get ChannelName(): string { return 'Whiteboard'; }
  public get ToolNamePrefix(): string { return 'Whiteboard_'; }
  public get TabTitle(): string { return 'Whiteboard'; }
  public get TabIcon(): string { return 'fa-solid fa-chalkboard'; }
  public GetToolDefinitions(): RealtimeToolDefinition[] { return []; }
  public ApplyAgentTool(): string { return '{}'; }
  public override GetSurfaceComponent(): Type<TestSurfaceComponent> | null { return TestSurfaceComponent; }
  public override BindSurface(instance: TestSurfaceComponent): void {
    instance.Channel = this.label;
    lifecycle.push(`bound ${this.label}`);
  }
  public override UnbindSurface(): void {
    lifecycle.push(`unbound ${this.label}`);
  }
  public override OnSurfaceVisibilityChange(visible: boolean): void {
    lifecycle.push(`${visible ? 'shown' : 'hidden'} ${this.label}`);
  }
  public override OnSurfacePlacementChange(placement: MediaPlacement): void {
    lifecycle.push(`on ${placement} ${this.label}`);
  }
}

/** A channel with no surface (server-only): the pane must never tell it about one. */
class ServerOnlyChannel extends TestChannel {
  public override GetSurfaceComponent(): Type<TestSurfaceComponent> | null {
    return null;
  }
}

describe('RealtimeChannelPaneComponent (DOM)', () => {
  beforeEach(() => {
    lifecycle.length = 0;
  });

  const render = (plugin: TestChannel, visible = true) => {
    const f = renderComponentFixture(RealtimeChannelPaneComponent, { inputs: { Plugin: plugin, Visible: visible } });
    f.detectChanges();
    return f;
  };

  it("creates the plugin's surface and binds it before the surface initializes", () => {
    const f = render(new TestChannel('first'));
    expect(lifecycle).toEqual(['bound first', 'shown first', 'on tab first', 'created first']);
    expect(f.nativeElement.parentElement?.querySelector('.surface')?.textContent).toBe('first');
  });

  it("releases the old plugin's surface and creates the new plugin's when handed another plugin", () => {
    const f = render(new TestChannel('first'));
    lifecycle.length = 0;
    f.componentRef.setInput('Plugin', new TestChannel('second'));
    f.detectChanges();
    expect(lifecycle).toEqual(['unbound first', 'destroyed first', 'bound second', 'shown second', 'on tab second', 'created second']);
  });

  it('keeps the surface when handed the same plugin again', () => {
    const plugin = new TestChannel('first');
    const f = render(plugin);
    lifecycle.length = 0;
    f.componentRef.setInput('Plugin', plugin);
    f.detectChanges();
    expect(lifecycle).toEqual([]);
  });

  it('unbinds and destroys the surface when the pane is destroyed', () => {
    const f = render(new TestChannel('first'));
    lifecycle.length = 0;
    f.destroy();
    // Angular clears the pane's view container before the pane's ngOnDestroy runs, so the order is Angular's.
    expect(new Set(lifecycle)).toEqual(new Set(['unbound first', 'destroyed first']));
  });

  it('tells the plugin its surface is out of sight from the start when it is created hidden', () => {
    render(new TestChannel('first'), false);
    expect(lifecycle).toEqual(['bound first', 'hidden first', 'on tab first', 'created first']);
  });

  it('tells the plugin each time its surface goes out of sight and comes back', () => {
    const f = render(new TestChannel('first'));
    lifecycle.length = 0;
    f.componentRef.setInput('Visible', false);
    f.detectChanges();
    f.componentRef.setInput('Visible', false);
    f.detectChanges();
    f.componentRef.setInput('Visible', true);
    f.detectChanges();
    expect(lifecycle).toEqual(['hidden first', 'shown first']);
  });

  it('never tells a channel without a surface about visibility', () => {
    const f = render(new ServerOnlyChannel('server'));
    f.componentRef.setInput('Visible', false);
    f.detectChanges();
    expect(lifecycle).toEqual([]);
  });

  it('tells the plugin where its surface is placed after binding, and of every move', () => {
    const f = renderComponentFixture(RealtimeChannelPaneComponent, { inputs: { Plugin: new TestChannel('first'), Placement: 'stage' } });
    f.detectChanges();
    expect(lifecycle).toEqual(['bound first', 'shown first', 'on stage first', 'created first']);
    lifecycle.length = 0;
    f.componentRef.setInput('Placement', 'stage');
    f.detectChanges();
    f.componentRef.setInput('Placement', 'hidden');
    f.detectChanges();
    expect(lifecycle).toEqual(['on hidden first']);
  });

  it('never tells a channel without a surface about its placement', () => {
    const f = render(new ServerOnlyChannel('server'));
    f.componentRef.setInput('Placement', 'stage');
    f.detectChanges();
    expect(lifecycle).toEqual([]);
  });
});
