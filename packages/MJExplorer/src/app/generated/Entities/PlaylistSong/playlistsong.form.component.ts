import { Component } from '@angular/core';
import { PlaylistSongEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Playlist Songs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-playlistsong-form',
    templateUrl: './playlistsong.form.component.html'
})
export class PlaylistSongFormComponent extends BaseFormComponent {
    public record!: PlaylistSongEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadPlaylistSongFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
