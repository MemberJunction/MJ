import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Subject } from 'rxjs';

/**
 * Tree-shaking prevention function
 */
export function LoadContactsTagsResource() {
  // Force inclusion in production builds
}

interface TagSummary {
  ID: string;
  Name: string;
  Description: string | null;
  Color: string | null;
  type: 'contact' | 'activity';
  usageCount: number;
  recentItems: { id: string; name: string; date: Date }[];
}

interface TagCloud {
  name: string;
  count: number;
  size: number;
  color: string;
}

// Simple interfaces for entity data
interface TagRecord {
  ID: string;
  Name: string;
  Description: string | null;
  Color: string | null;
}

interface TagLinkRecord {
  TagID: string;
  ContactID: string;
  ActivityID: string;
  Get(field: string): Date;
}

@RegisterClass(BaseResourceComponent, 'ContactsTagsResource')
@Component({
  selector: 'contacts-tags-resource',
  templateUrl: './contacts-tags-resource.component.html',
  styleUrls: ['./contacts-tags-resource.component.css']
})
export class ContactsTagsResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  isLoading = true;
  activeTab: 'contact' | 'activity' = 'contact';
  searchTerm = '';

  contactTags: TagSummary[] = [];
  activityTags: TagSummary[] = [];
  filteredTags: TagSummary[] = [];

  contactTagCloud: TagCloud[] = [];
  activityTagCloud: TagCloud[] = [];

  totalContactTags = 0;
  totalActivityTags = 0;
  totalTagUsage = 0;
  mostUsedTag: TagSummary | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private navService: NavigationService
  ) {
    super();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Tags';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-tags';
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadData(): Promise<void> {
    this.isLoading = true;

    try {
      const rv = new RunView();

      // Load all data in parallel
      const [
        contactTagsResult,
        activityTagsResult,
        contactTagLinksResult,
        activityTagLinksResult,
        contactsResult,
        activitiesResult
      ] = await rv.RunViews([
        {
          EntityName: 'Contact Tags',
          ExtraFilter: '',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Activity Tags',
          ExtraFilter: '',
          OrderBy: 'Name',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Contact Tag Links',
          ExtraFilter: '',
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Activity Tag Links',
          ExtraFilter: '',
          OrderBy: '__mj_CreatedAt DESC',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'Contacts',
          ExtraFilter: '',
          Fields: ['ID', 'FirstName', 'LastName'],
          ResultType: 'simple'
        },
        {
          EntityName: 'Activities',
          ExtraFilter: '',
          Fields: ['ID', 'Subject', '__mj_CreatedAt'],
          ResultType: 'simple'
        }
      ]);

      const contactTags = (contactTagsResult?.Results || []) as TagRecord[];
      const activityTags = (activityTagsResult?.Results || []) as TagRecord[];
      const contactTagLinks = (contactTagLinksResult?.Results || []) as TagLinkRecord[];
      const activityTagLinks = (activityTagLinksResult?.Results || []) as TagLinkRecord[];
      const contacts = (contactsResult?.Results || []) as { ID: string; FirstName: string; LastName: string }[];
      const activities = (activitiesResult?.Results || []) as { ID: string; Subject: string; __mj_CreatedAt: Date }[];

      // Create lookup maps
      const contactMap = new Map(contacts.map(c => [c.ID, `${c.FirstName} ${c.LastName}`]));
      const activityMap = new Map(activities.map(a => [a.ID, { name: a.Subject, date: new Date(a.__mj_CreatedAt) }]));

      // Process contact tags
      this.contactTags = contactTags.map(tag => {
        const links = contactTagLinks.filter(l => l.TagID === tag.ID);
        const recentItems = links.slice(0, 3).map(l => ({
          id: l.ContactID,
          name: contactMap.get(l.ContactID) || 'Unknown',
          date: new Date(l.Get('__mj_CreatedAt'))
        }));

        return {
          ID: tag.ID,
          Name: tag.Name,
          Description: tag.Description,
          Color: tag.Color,
          type: 'contact' as const,
          usageCount: links.length,
          recentItems
        };
      });

      // Process activity tags
      this.activityTags = activityTags.map(tag => {
        const links = activityTagLinks.filter(l => l.TagID === tag.ID);
        const recentItems = links.slice(0, 3).map(l => {
          const activity = activityMap.get(l.ActivityID);
          return {
            id: l.ActivityID,
            name: activity?.name || 'Unknown',
            date: activity?.date || new Date()
          };
        });

        return {
          ID: tag.ID,
          Name: tag.Name,
          Description: tag.Description,
          Color: tag.Color,
          type: 'activity' as const,
          usageCount: links.length,
          recentItems
        };
      });

      // Sort by usage count
      this.contactTags.sort((a, b) => b.usageCount - a.usageCount);
      this.activityTags.sort((a, b) => b.usageCount - a.usageCount);

      // Calculate totals
      this.totalContactTags = this.contactTags.length;
      this.totalActivityTags = this.activityTags.length;
      this.totalTagUsage = this.contactTags.reduce((sum, t) => sum + t.usageCount, 0) +
                           this.activityTags.reduce((sum, t) => sum + t.usageCount, 0);

      // Find most used tag
      const allTags = [...this.contactTags, ...this.activityTags];
      this.mostUsedTag = allTags.length > 0
        ? allTags.reduce((max, t) => t.usageCount > max.usageCount ? t : max, allTags[0])
        : null;

      // Generate tag clouds
      this.contactTagCloud = this.generateTagCloud(this.contactTags);
      this.activityTagCloud = this.generateTagCloud(this.activityTags);

      this.applyFilters();
    } catch (error) {
      console.error('Error loading tags data:', error);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private generateTagCloud(tags: TagSummary[]): TagCloud[] {
    if (tags.length === 0) return [];

    const maxCount = Math.max(...tags.map(t => t.usageCount), 1);
    const colors = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#FF5722', '#3F51B5'];

    return tags
      .filter(t => t.usageCount > 0)
      .slice(0, 20)
      .map((tag, index) => ({
        name: tag.Name,
        count: tag.usageCount,
        size: Math.max(0.75, (tag.usageCount / maxCount) * 1.5 + 0.5),
        color: tag.Color || colors[index % colors.length]
      }));
  }

  setActiveTab(tab: 'contact' | 'activity'): void {
    this.activeTab = tab;
    this.applyFilters();
  }

  onSearchChange(value: string): void {
    this.searchTerm = value;
    this.applyFilters();
  }

  private applyFilters(): void {
    const sourceTags = this.activeTab === 'contact' ? this.contactTags : this.activityTags;

    if (!this.searchTerm.trim()) {
      this.filteredTags = [...sourceTags];
    } else {
      const searchLower = this.searchTerm.toLowerCase();
      this.filteredTags = sourceTags.filter(tag =>
        tag.Name.toLowerCase().includes(searchLower) ||
        (tag.Description && tag.Description.toLowerCase().includes(searchLower))
      );
    }
  }

  getTagColor(tag: TagSummary): string {
    if (tag.Color) return tag.Color;
    const colors = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#E91E63'];
    const index = tag.Name.charCodeAt(0) % colors.length;
    return colors[index];
  }

  openTag(tag: TagSummary): void {
    const entityName = tag.type === 'contact' ? 'Contact Tags' : 'Activity Tags';
    const key = new CompositeKey([{ FieldName: 'ID', Value: tag.ID }]);
    this.navService.OpenEntityRecord(entityName, key);
  }

  openItem(type: 'contact' | 'activity', id: string): void {
    const entityName = type === 'contact' ? 'Contacts' : 'Activities';
    const key = new CompositeKey([{ FieldName: 'ID', Value: id }]);
    this.navService.OpenEntityRecord(entityName, key);
  }
}
