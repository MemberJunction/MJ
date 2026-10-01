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
    public Rubrics: { ID: string; Name: string; Status: string; Version: string; HasDraft: boolean }[] = [];
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
            const versions = await view.RunView({ EntityName: 'MJ: Rubric Versions', ResultType: 'simple', MaxRows: 500 });
            const versionRows = (versions.Results ?? []) as { RubricID: string; Status: string; MajorVersion: number; MinorVersion: number; PatchVersion: number }[];
            this.Rubrics = ((result.Results ?? []) as { ID: string; Name: string; Status: string }[]).map(rubric => {
                const mine = versionRows.filter(row => row.RubricID === rubric.ID);
                const published = mine.find(row => row.Status === 'Published');
                return {
                    ID: rubric.ID,
                    Name: rubric.Name,
                    Status: rubric.Status ?? '',
                    Version: published ? `${published.MajorVersion}.${published.MinorVersion}.${published.PatchVersion}` : '—',
                    HasDraft: mine.some(row => row.Status === 'Draft'),
                };
            });
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
