import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { TimelineModule, TimelineGroup } from '@memberjunction/ng-timeline';

// Sample event data
interface MockEvent {
  id: string;
  title: string;
  date: Date;
  description?: string;
  status?: string;
  imageUrl?: string;
  priority?: string;
  assignee?: string;
}

function createMockEvents(): MockEvent[] {
  const now = new Date();
  return [
    {
      id: '1',
      title: 'Project Kickoff Meeting',
      date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      description: 'Initial meeting to discuss project scope, timeline, and resource allocation.',
      status: 'Completed',
      priority: 'High',
      assignee: 'John Smith',
    },
    {
      id: '2',
      title: 'Requirements Gathering',
      date: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
      description: 'Collected and documented all stakeholder requirements for the new system.',
      status: 'Completed',
      priority: 'High',
      assignee: 'Sarah Johnson',
    },
    {
      id: '3',
      title: 'Design Review',
      date: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
      description: 'Reviewed and approved the initial design mockups with the design team.',
      status: 'Completed',
      priority: 'Medium',
      assignee: 'Mike Chen',
    },
    {
      id: '4',
      title: 'Development Sprint 1',
      date: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), // 14 days ago
      description: 'First development sprint focusing on core functionality.',
      status: 'Completed',
      priority: 'High',
      assignee: 'Dev Team',
    },
    {
      id: '5',
      title: 'Code Review Session',
      date: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      description: 'Thorough code review of all new features from Sprint 1.',
      status: 'Completed',
      priority: 'Medium',
      assignee: 'Tech Lead',
    },
    {
      id: '6',
      title: 'QA Testing Phase',
      date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      description: 'Quality assurance testing and bug identification.',
      status: 'In Progress',
      priority: 'High',
      assignee: 'QA Team',
    },
    {
      id: '7',
      title: 'User Acceptance Testing',
      date: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      description: 'Final testing phase with end users.',
      status: 'Planned',
      priority: 'High',
      assignee: 'Stakeholders',
    },
    {
      id: '8',
      title: 'Production Deployment',
      date: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      description: 'Deploy the application to production environment.',
      status: 'Planned',
      priority: 'Critical',
      assignee: 'DevOps Team',
    },
  ];
}

function createTimelineGroup(events: MockEvent[]): TimelineGroup {
  return TimelineGroup.FromArray(events, {
    titleField: 'title',
    dateField: 'date',
    descriptionField: 'description',
    idField: 'id',
    icon: 'fa-solid fa-calendar-check',
    color: '#4f46e5',
  });
}

const meta: Meta = {
  title: 'Components/Timeline',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, TimelineModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-timeline\` component displays events in a chronological timeline format with support for vertical/horizontal orientation, time segment grouping, and expandable cards.

## Usage

\`\`\`typescript
const group = TimelineGroup.FromArray(events, {
  titleField: 'title',
  dateField: 'date',
  descriptionField: 'description'
});
\`\`\`

\`\`\`html
<mj-timeline
  [groups]="[group]"
  orientation="vertical"
  layout="single"
  segmentGrouping="month">
</mj-timeline>
\`\`\`

## Module Import

\`\`\`typescript
import { TimelineModule, TimelineGroup } from '@memberjunction/ng-timeline';
\`\`\`

## Features
- Vertical or horizontal orientation
- Single or alternating layout
- Time segment grouping (day, week, month, quarter, year)
- Collapsible event cards
- Custom icons and colors per event
- Virtual scrolling for large datasets
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Default vertical timeline
export const Default: Story = {
  render: () => {
    const events = createMockEvents();
    const group = createTimelineGroup(events);

    return {
      props: {
        groups: [group],
      },
      template: `
        <div style="width: 600px; max-height: 600px; overflow: auto; padding: 20px; background: #fafafa; border-radius: 12px;">
          <mj-timeline
            [groups]="groups"
            orientation="vertical"
            layout="single"
            sortOrder="desc"
            segmentGrouping="none">
          </mj-timeline>
        </div>
      `,
    };
  },
};

// Horizontal timeline
export const Horizontal: Story = {
  render: () => {
    const events = createMockEvents().slice(0, 5);
    const group = TimelineGroup.FromArray(events, {
      titleField: 'title',
      dateField: 'date',
      descriptionField: 'description',
      idField: 'id',
      icon: 'fa-solid fa-flag',
      color: '#059669',
    });

    return {
      props: {
        groups: [group],
      },
      template: `
        <div style="width: 100%; overflow-x: auto; padding: 20px; background: #fafafa; border-radius: 12px;">
          <mj-timeline
            [groups]="groups"
            orientation="horizontal"
            sortOrder="asc"
            segmentGrouping="none">
          </mj-timeline>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Horizontal timeline displays events from left to right. Useful for showing milestones or a project roadmap.',
      },
    },
  },
};

// Alternating layout
export const Alternating: Story = {
  render: () => {
    const events = createMockEvents();
    const group = TimelineGroup.FromArray(events, {
      titleField: 'title',
      dateField: 'date',
      descriptionField: 'description',
      idField: 'id',
      icon: 'fa-solid fa-code-branch',
      color: '#7c3aed',
    });

    return {
      props: {
        groups: [group],
      },
      template: `
        <div style="width: 800px; max-height: 600px; overflow: auto; padding: 20px; background: #fafafa; border-radius: 12px;">
          <mj-timeline
            [groups]="groups"
            orientation="vertical"
            layout="alternating"
            sortOrder="desc"
            segmentGrouping="none">
          </mj-timeline>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Alternating layout places events on alternating sides of the timeline axis, creating a zigzag pattern.',
      },
    },
  },
};

// Grouped by month
export const GroupedByMonth: Story = {
  render: () => {
    const events = createMockEvents();
    const group = TimelineGroup.FromArray(events, {
      titleField: 'title',
      dateField: 'date',
      descriptionField: 'description',
      idField: 'id',
      icon: 'fa-solid fa-clock',
      color: '#0891b2',
    });

    return {
      props: {
        groups: [group],
      },
      template: `
        <div style="width: 600px; max-height: 600px; overflow: auto; padding: 20px; background: #fafafa; border-radius: 12px;">
          <mj-timeline
            [groups]="groups"
            orientation="vertical"
            layout="single"
            sortOrder="desc"
            segmentGrouping="month"
            [segmentsCollapsible]="true"
            [segmentsDefaultExpanded]="true">
          </mj-timeline>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Events can be grouped by time segments (day, week, month, quarter, year). Each segment header shows the date range and can be collapsed.',
      },
    },
  },
};

// With images
export const WithImages: Story = {
  render: () => {
    const eventsWithImages: MockEvent[] = [
      {
        id: '1',
        title: 'Team Photo Day',
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        description: 'Annual team photo session for the company directory.',
        imageUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=200&h=200&fit=crop',
        status: 'Completed',
      },
      {
        id: '2',
        title: 'Office Renovation',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        description: 'New collaborative workspace design unveiled.',
        imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=200&h=200&fit=crop',
        status: 'In Progress',
      },
      {
        id: '3',
        title: 'Product Launch Event',
        date: new Date(),
        description: 'Launching our newest product to the market.',
        imageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=200&h=200&fit=crop',
        status: 'Today',
      },
    ];

    const group = TimelineGroup.FromArray(eventsWithImages, {
      titleField: 'title',
      dateField: 'date',
      descriptionField: 'description',
      idField: 'id',
      imageField: 'imageUrl',
      icon: 'fa-solid fa-camera',
      color: '#dc2626',
    });

    return {
      props: {
        groups: [group],
      },
      template: `
        <div style="width: 500px; padding: 20px; background: #fafafa; border-radius: 12px;">
          <mj-timeline
            [groups]="groups"
            orientation="vertical"
            layout="single"
            sortOrder="desc"
            segmentGrouping="none">
          </mj-timeline>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Events can include images with configurable position (left or top) and size (small, medium, large).',
      },
    },
  },
};

// Empty state
export const EmptyState: Story = {
  render: () => {
    const group = TimelineGroup.FromArray([], {
      titleField: 'title',
      dateField: 'date',
      descriptionField: 'description',
      idField: 'id',
      icon: 'fa-solid fa-calendar',
      color: '#6b7280',
    });

    return {
      props: {
        groups: [group],
      },
      template: `
        <div style="width: 500px; padding: 40px; background: #fafafa; border-radius: 12px;">
          <mj-timeline
            [groups]="groups"
            orientation="vertical"
            layout="single"
            emptyMessage="No events to display">
          </mj-timeline>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'When there are no events, the timeline displays an empty state message.',
      },
    },
  },
};

// Multiple groups
export const MultipleGroups: Story = {
  render: () => {
    const now = new Date();

    const devEvents = [
      { id: 'd1', title: 'API Development', date: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), description: 'Backend API implementation', status: 'Completed' },
      { id: 'd2', title: 'Frontend Integration', date: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), description: 'Connect UI to backend services', status: 'In Progress' },
    ];

    const designEvents = [
      { id: 'g1', title: 'Wireframes', date: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000), description: 'Initial wireframe designs', status: 'Completed' },
      { id: 'g2', title: 'High-fidelity Mockups', date: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000), description: 'Detailed UI designs', status: 'Completed' },
    ];

    const devGroup = TimelineGroup.FromArray(devEvents, {
      titleField: 'title',
      dateField: 'date',
      descriptionField: 'description',
      idField: 'id',
      icon: 'fa-solid fa-code',
      color: '#2563eb',
      groupLabel: 'Development',
    });

    const designGroup = TimelineGroup.FromArray(designEvents, {
      titleField: 'title',
      dateField: 'date',
      descriptionField: 'description',
      idField: 'id',
      icon: 'fa-solid fa-palette',
      color: '#db2777',
      groupLabel: 'Design',
    });

    return {
      props: {
        groups: [devGroup, designGroup],
      },
      template: `
        <div style="width: 600px; max-height: 500px; overflow: auto; padding: 20px; background: #fafafa; border-radius: 12px;">
          <mj-timeline
            [groups]="groups"
            orientation="vertical"
            layout="single"
            sortOrder="desc"
            segmentGrouping="none">
          </mj-timeline>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Multiple groups can be displayed on the same timeline, each with their own icon and color. Events are interleaved by date.',
      },
    },
  },
};
