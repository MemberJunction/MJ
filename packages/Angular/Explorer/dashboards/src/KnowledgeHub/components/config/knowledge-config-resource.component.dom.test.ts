import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { BaseEntity, RunView } from '@memberjunction/core';
import type { BaseEntityEvent, RunViewResult } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { KnowledgeConfigResourceComponent } from './knowledge-config-resource.component';

/**
 * A credential added while the Knowledge Hub configuration tab is cached shows up in its
 * credential pickers when the user comes back to the tab, without a page reload.
 */

type NavigationDouble = Pick<NavigationService, 'QueryParamChanged$' | 'ResourceReattached$' | 'ObserveTabQueryParams'>;
type LoadSeams = { loadConfiguration(): Promise<void>; emitAgentContext(): void; registerAgentTools(): void };

function navigationDouble(): NavigationDouble {
    return {
        QueryParamChanged$: new Subject(),
        ResourceReattached$: new Subject<BaseResourceComponent>(),
        ObserveTabQueryParams: () => new Subject<Record<string, string>>(),
    } as Pick<NavigationService, 'QueryParamChanged$' | 'ResourceReattached$'> as NavigationDouble;
}

function credentialSaved(): void {
    const args: Pick<BaseEntityEvent, 'type' | 'entityName'> = { type: 'save', entityName: 'MJ: Credentials' };
    MJGlobal.Instance.RaiseEvent({ component: {}, event: MJEventType.ComponentEvent, eventCode: BaseEntity.BaseEventCode, args });
}

async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('KnowledgeConfigResourceComponent reattach', () => {
    afterEach(() => vi.restoreAllMocks());

    function create(navigation: NavigationDouble): KnowledgeConfigResourceComponent {
        const cdr: Pick<ChangeDetectorRef, 'detectChanges' | 'markForCheck'> = { detectChanges: () => undefined, markForCheck: () => undefined };
        TestBed.configureTestingModule({
            providers: [{ provide: NavigationService, useValue: navigation }, { provide: ChangeDetectorRef, useValue: cdr }],
        });
        const component = TestBed.runInInjectionContext(() => new KnowledgeConfigResourceComponent());
        const seams = component as unknown as LoadSeams;
        vi.spyOn(seams, 'loadConfiguration').mockResolvedValue(undefined);
        vi.spyOn(seams, 'emitAgentContext').mockImplementation(() => undefined);
        vi.spyOn(seams, 'registerAgentTools').mockImplementation(() => undefined);
        component.ngOnInit();
        component.ngAfterViewInit();
        return component;
    }

    it('reloads the credential list on reattach after a credential is saved', async () => {
        const result: Pick<RunViewResult<Record<string, unknown>>, 'Success' | 'Results'> = {
            Success: true, Results: [{ ID: 'cred-1', Name: 'Sample Credential' }],
        };
        const runView = vi.fn().mockResolvedValue(result);
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as Pick<RunView, 'RunView'> as RunView);
        const navigation = navigationDouble();
        const component = create(navigation);

        credentialSaved();
        navigation.ResourceReattached$.next(component);
        await flush();

        expect(runView).toHaveBeenCalledTimes(1);
        expect(component.AvailableCredentials).toEqual([{ ID: 'cred-1', Name: 'Sample Credential' }]);
        component.ngOnDestroy();
    });

    it('does not reload on reattach when no credential changed', async () => {
        const runView = vi.fn();
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as Pick<RunView, 'RunView'> as RunView);
        const navigation = navigationDouble();
        const component = create(navigation);

        navigation.ResourceReattached$.next(component);
        await flush();

        expect(runView).not.toHaveBeenCalled();
        component.ngOnDestroy();
    });
});
