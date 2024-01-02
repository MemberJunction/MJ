import { Component, OnInit } from '@angular/core';
import { BaseResourceComponent, ResourceData } from '../generic/base-resource-component';
import { RegisterClass } from '@memberjunction/global';

export function LoadSearchResultsResource() {
    const test = new SearchResultsResource(); // this looks really dumb. Thing is, in production builds, tree shaking causes the class below to not be included in the bundle. This is a hack to force it to be included.
}

@RegisterClass(BaseResourceComponent, 'Search Results')
@Component({
    selector: 'search-results-resource',
    template: `<app-single-search-result [entity]="Data.Configuration.Entity" [searchInput]="Data.Configuration.SearchInput" (loadComplete)="NotifyLoadComplete()" (loadStarted)="NotifyLoadStarted()"></app-single-search-result>`
})
export class SearchResultsResource extends BaseResourceComponent implements OnInit {
    ngOnInit(): void {

    }
    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return `Search (${data.Configuration.Entity}): ${data.Configuration.SearchInput}`;
    }
}