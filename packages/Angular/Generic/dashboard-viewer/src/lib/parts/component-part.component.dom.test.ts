import { describe, expect, it } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { CreateFakeProvider, renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { DashboardPanel } from '../models/dashboard-types';
import type { DashboardPartEventArgs } from '../models/dashboard-properties';
import { ComponentPartComponent } from './component-part.component';

/**
 * DOM coverage for the Interactive Component part: it renders the registered component in the React
 * host with its mapped props, hands the host its ProviderToUse (so the component's utilities read
 * through the dashboard's provider), and turns the component's declared events into part events.
 */

@Component({ standalone: true, selector: 'mj-react-component', template: '' })
class ReactHostStub {
    @Input() Provider: IMetadataProvider | null = null;
    @Input() Component: ComponentSpec | null = null;
    @Input() ComponentProps: Record<string, unknown> = {};
    @Output() ComponentEvent = new EventEmitter<{ type: string; payload: unknown }>();
    @Output() OpenEntityRecord = new EventEmitter<unknown>();
}
@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub { @Input() text = ''; }
@Component({ standalone: true, selector: 'mj-empty-state', template: '{{ Title }} {{ Message }}' })
class EmptyStateStub {
    @Input() Variant = ''; @Input() Icon = ''; @Input() Title = ''; @Input() Message = ''; @Input() Size = '';
}

const SPEC: ComponentSpec = {
    name: 'ChapterMembers',
    properties: [
        { name: 'selectedChapter', type: 'string', description: 'The chapter', required: true },
        { name: 'pageSize', type: 'number', description: 'Rows per page', required: false, defaultValue: 20 },
    ],
    events: [{ name: 'onSelectMember', description: 'A member was picked', parameters: [{ name: 'memberId', type: 'string', description: 'The member' }] }],
} as unknown as ComponentSpec;

async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
}

async function render(config: DashboardPanel['config'], chapter: string | null) {
    const requests: RunViewParams[] = [];
    const provider = CreateFakeProvider({
        runViewResults: (params: RunViewParams) => {
            requests.push(params);
            return [{ ID: 'c1', Name: 'ChapterMembers', Specification: JSON.stringify(SPEC) }];
        },
    });
    const fixture = renderComponentFixture(ComponentPartComponent, {
        imports: [ReactHostStub, LoadingStub, EmptyStateStub],
        declarations: [ComponentPartComponent],
        setup: (part) => {
            part.Provider = provider;
            part.PropertyContext = { Properties: [{ Name: 'Chapter', Type: 'string' }], Values: { Chapter: chapter } };
            part.Panel = { id: 'p1', title: 'Members', partTypeId: 'pt', config };
        },
    });
    await settle();
    fixture.detectChanges();
    const host = fixture.debugElement.query(By.directive(ReactHostStub))?.componentInstance as ReactHostStub | undefined;
    return { fixture, host, provider, requests };
}

const MAPPED = { type: 'Component', componentName: 'ChapterMembers', inputMappings: [{ Input: 'selectedChapter', Property: 'Chapter' }] };

describe('ComponentPartComponent (DOM)', () => {
    it('renders the registered component with its mapped props and prop defaults', async () => {
        const { host, requests } = await render(MAPPED, 'ch-1');
        expect(requests[0].EntityName).toBe('MJ: Components');
        expect(host?.Component?.name).toBe('ChapterMembers');
        expect(host?.ComponentProps['selectedChapter']).toBe('ch-1');
        expect(host?.ComponentProps['pageSize']).toBe(20);
    });

    it("hands the React host the part's ProviderToUse, so the component's utilities use the dashboard's provider", async () => {
        const { host, provider, fixture } = await render(MAPPED, 'ch-1');
        expect(host?.Provider).toBe(provider);
        expect(host?.Provider).toBe(fixture.componentInstance.ProviderToUse);
    });

    it("turns a declared event, called as a prop, into a part event with the event's parameters", async () => {
        const { host, fixture } = await render(MAPPED, 'ch-1');
        const events: DashboardPartEventArgs[] = [];
        fixture.componentInstance.PartEvent.subscribe(e => events.push(e));
        (host?.ComponentProps['onSelectMember'] as (id: string) => void)('m-7');
        host?.ComponentEvent.emit({ type: 'onSelectMember', payload: { memberId: 'm-8' } });
        host?.ComponentEvent.emit({ type: 'undeclared', payload: {} });
        expect(events).toEqual([
            { Event: 'onSelectMember', Values: { memberId: 'm-7' } },
            { Event: 'onSelectMember', Values: { memberId: 'm-8' } },
        ]);
    });

    it('stops and names a required prop with no value', async () => {
        const { host, fixture } = await render(MAPPED, null);
        expect(host).toBeUndefined();
        expect(fixture.nativeElement.textContent).toContain('Missing a value for "selectedChapter".');
    });

    it('asks for a component when none is chosen', async () => {
        const { host, fixture } = await render({ type: 'Component' }, null);
        expect(host).toBeUndefined();
        expect(fixture.nativeElement.textContent).toContain('No Component Selected');
    });
});
