import { Component, OnInit } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

/** Rubrics home in the AI application. Lists rubrics and opens their forms. */
@RegisterClass(BaseResourceComponent, 'RubricsResource')
@Component({
    standalone: false,
    selector: 'mj-rubrics-resource',
    templateUrl: './rubrics-resource.component.html',
    styleUrls: ['./rubrics-resource.component.css'],
})
export class RubricsResourceComponent extends BaseResourceComponent implements OnInit {
    public Loading = true;
    public Rubrics: { ID: string; Name: string }[] = [];
    public Scales: { ID: string; Name: string }[] = [];

    public override async ngOnInit(): Promise<void> {
        super.ngOnInit();
        await this.Load();
        this.NotifyLoadComplete();
    }

    public async Load(): Promise<void> {
        this.Loading = true;
        try {
            const view = new RunView();
            const result = await view.RunView({ EntityName: 'MJ: Rubrics', ResultType: 'simple', MaxRows: 200, OrderBy: 'Name' });
            this.Rubrics = ((result.Results ?? []) as { ID: string; Name: string }[]);
            const scales = await view.RunView({ EntityName: 'MJ: Rubric Scales', ResultType: 'simple', MaxRows: 200, OrderBy: 'Name' });
            this.Scales = ((scales.Results ?? []) as { ID: string; Name: string }[]);
        } finally {
            this.Loading = false;
        }
    }

    public Open(id: string): void {
        this.navigationService.OpenEntityRecord('MJ: Rubrics', CompositeKey.FromID(id));
    }

    public OpenScale(id: string): void {
        this.navigationService.OpenEntityRecord('MJ: Rubric Scales', CompositeKey.FromID(id));
    }

    public override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Rubrics';
    }

    public override async GetResourceIconClass(_data: ResourceData): Promise<string> {
        return 'fa-solid fa-scale-balanced';
    }
}
