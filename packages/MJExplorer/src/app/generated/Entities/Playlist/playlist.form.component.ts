import { Component } from '@angular/core';
import { PlaylistEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Playlists') // Tell MemberJunction about this class
@Component({
    selector: 'gen-playlist-form',
    templateUrl: './playlist.form.component.html'
})
export class PlaylistFormComponent extends BaseFormComponent {
    public record!: PlaylistEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'playlistSongs', sectionName: 'Playlist Songs', isExpanded: false }
        ]);
    }
}

export function LoadPlaylistFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
