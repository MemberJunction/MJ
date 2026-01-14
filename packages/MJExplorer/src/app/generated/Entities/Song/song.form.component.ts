import { Component } from '@angular/core';
import { SongEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Songs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-song-form',
    templateUrl: './song.form.component.html'
})
export class SongFormComponent extends BaseFormComponent {
    public record!: SongEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'listeningHistories', sectionName: 'Listening Histories', isExpanded: false },
            { sectionKey: 'playlistSongs', sectionName: 'Playlist Songs', isExpanded: false },
            { sectionKey: 'songJournals', sectionName: 'Song Journals', isExpanded: false }
        ]);
    }
}

export function LoadSongFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
