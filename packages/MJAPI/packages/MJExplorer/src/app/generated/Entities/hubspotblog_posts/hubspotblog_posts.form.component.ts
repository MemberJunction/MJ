import { Component } from '@angular/core';
import { hubspotblog_postsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Blog Posts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotblog_posts-form',
    templateUrl: './hubspotblog_posts.form.component.html'
})
export class hubspotblog_postsFormComponent extends BaseFormComponent {
    public record!: hubspotblog_postsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'publishingSettings', sectionName: 'Publishing Settings', isExpanded: true },
            { sectionKey: 'syndication', sectionName: 'Syndication', isExpanded: true },
            { sectionKey: 'mediaAndSEO', sectionName: 'Media and SEO', isExpanded: false },
            { sectionKey: 'postContent', sectionName: 'Post Content', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

