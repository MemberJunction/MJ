import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { DeepDiffModule } from '@memberjunction/ng-deep-diff';

const meta: Meta = {
  title: 'Components/DeepDiff',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, DeepDiffModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-deep-diff\` component displays a visual comparison between two JavaScript objects, highlighting additions, removals, and modifications.

## Usage

\`\`\`html
<mj-deep-diff
  [oldValue]="originalObject"
  [newValue]="modifiedObject"
  [showUnchanged]="false"
  [expandAll]="true"
  [title]="'Configuration Changes'">
</mj-deep-diff>
\`\`\`

## Module Import

\`\`\`typescript
import { DeepDiffModule } from '@memberjunction/ng-deep-diff';
\`\`\`

## Features
- Visual diff with color-coded changes
- Added (green), Removed (red), Modified (yellow)
- Nested object support with collapsible sections
- Optional display of unchanged values
- Summary statistics of changes
- Value truncation for long strings
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Simple object diff
export const Default: Story = {
  render: () => ({
    props: {
      oldValue: {
        name: 'John Doe',
        email: 'john@example.com',
        role: 'user',
        active: true,
      },
      newValue: {
        name: 'John Doe',
        email: 'john.doe@company.com',
        role: 'admin',
        active: true,
        department: 'Engineering',
      },
    },
    template: `
      <div style="max-width: 600px;">
        <mj-deep-diff
          [oldValue]="oldValue"
          [newValue]="newValue"
          [title]="'User Profile Changes'"
          [showSummary]="true">
        </mj-deep-diff>
      </div>
    `,
  }),
};

// Nested objects
export const NestedObjects: Story = {
  render: () => ({
    props: {
      oldValue: {
        user: {
          id: '12345',
          profile: {
            firstName: 'Jane',
            lastName: 'Smith',
            preferences: {
              theme: 'light',
              notifications: true,
              language: 'en',
            },
          },
          permissions: ['read', 'write'],
        },
        metadata: {
          createdAt: '2024-01-15',
          updatedAt: '2024-06-20',
        },
      },
      newValue: {
        user: {
          id: '12345',
          profile: {
            firstName: 'Jane',
            lastName: 'Smith-Johnson',
            preferences: {
              theme: 'dark',
              notifications: true,
              language: 'en',
              timezone: 'America/New_York',
            },
          },
          permissions: ['read', 'write', 'delete'],
        },
        metadata: {
          createdAt: '2024-01-15',
          updatedAt: '2025-01-20',
          version: 2,
        },
      },
    },
    template: `
      <div style="max-width: 700px;">
        <mj-deep-diff
          [oldValue]="oldValue"
          [newValue]="newValue"
          [title]="'Account Settings Diff'"
          [expandAll]="true"
          [showSummary]="true">
        </mj-deep-diff>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Deep nested objects are displayed hierarchically. The diff traverses all levels to show changes at any depth.',
      },
    },
  },
};

// Array changes
export const ArrayChanges: Story = {
  render: () => ({
    props: {
      oldValue: {
        tags: ['frontend', 'react', 'typescript'],
        contributors: [
          { name: 'Alice', commits: 45 },
          { name: 'Bob', commits: 32 },
        ],
        versions: ['1.0.0', '1.1.0', '1.2.0'],
      },
      newValue: {
        tags: ['frontend', 'angular', 'typescript', 'testing'],
        contributors: [
          { name: 'Alice', commits: 52 },
          { name: 'Bob', commits: 32 },
          { name: 'Carol', commits: 18 },
        ],
        versions: ['1.0.0', '1.1.0', '1.2.0', '2.0.0'],
      },
    },
    template: `
      <div style="max-width: 600px;">
        <mj-deep-diff
          [oldValue]="oldValue"
          [newValue]="newValue"
          [title]="'Project Updates'"
          [expandAll]="true"
          [showSummary]="true">
        </mj-deep-diff>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Array changes show added, removed, and modified elements. Objects within arrays are compared by their structure.',
      },
    },
  },
};

// Show unchanged values
export const ShowUnchanged: Story = {
  render: () => ({
    props: {
      oldValue: {
        id: 'cfg-001',
        name: 'Production Config',
        environment: 'production',
        settings: {
          debug: false,
          logLevel: 'error',
          cacheEnabled: true,
          cacheTTL: 3600,
        },
        endpoints: {
          api: 'https://api.example.com',
          auth: 'https://auth.example.com',
        },
      },
      newValue: {
        id: 'cfg-001',
        name: 'Production Config',
        environment: 'production',
        settings: {
          debug: false,
          logLevel: 'warn',
          cacheEnabled: true,
          cacheTTL: 7200,
        },
        endpoints: {
          api: 'https://api.example.com',
          auth: 'https://auth.example.com',
        },
      },
    },
    template: `
      <div style="max-width: 600px;">
        <h3 style="margin: 0 0 16px 0; color: #374151;">With Unchanged Values Visible</h3>
        <mj-deep-diff
          [oldValue]="oldValue"
          [newValue]="newValue"
          [title]="'Configuration Comparison'"
          [showUnchanged]="true"
          [expandAll]="true">
        </mj-deep-diff>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Enable `[showUnchanged]="true"` to display values that haven\'t changed. Unchanged values appear in gray.',
      },
    },
  },
};

// With summary
export const WithSummary: Story = {
  render: () => ({
    props: {
      oldValue: {
        database: {
          host: 'localhost',
          port: 5432,
          name: 'myapp_dev',
          ssl: false,
        },
        redis: {
          host: 'localhost',
          port: 6379,
        },
        logging: {
          level: 'debug',
          format: 'json',
        },
      },
      newValue: {
        database: {
          host: 'db.production.com',
          port: 5432,
          name: 'myapp_prod',
          ssl: true,
          poolSize: 20,
        },
        redis: {
          host: 'redis.production.com',
          port: 6379,
          cluster: true,
        },
        logging: {
          level: 'error',
          format: 'json',
          retention: '30d',
        },
        monitoring: {
          enabled: true,
          endpoint: 'https://metrics.example.com',
        },
      },
    },
    template: `
      <div style="max-width: 700px;">
        <mj-deep-diff
          [oldValue]="oldValue"
          [newValue]="newValue"
          [title]="'Environment Migration: Dev → Prod'"
          [showSummary]="true"
          [expandAll]="true">
        </mj-deep-diff>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The summary shows statistics: number of additions, removals, and modifications.',
      },
    },
  },
};

// Large objects with truncation
export const LargeObjects: Story = {
  render: () => {
    const generateLargeObject = (prefix: string) => ({
      metadata: {
        id: `${prefix}-12345`,
        version: '2.5.0',
        description: 'This is a very long description that demonstrates how the diff component handles text truncation for values that exceed a reasonable display length in the comparison view.',
        tags: Array.from({ length: 20 }, (_, i) => `tag-${i + 1}`),
      },
      config: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => [`setting${i + 1}`, `value-${prefix}-${i + 1}`])
      ),
    });

    return {
      props: {
        oldValue: generateLargeObject('old'),
        newValue: {
          ...generateLargeObject('new'),
          additionalField: 'This field was added',
          config: {
            ...Object.fromEntries(
              Array.from({ length: 15 }, (_, i) => [`setting${i + 1}`, `value-new-${i + 1}`])
            ),
            newSetting: 'enabled',
          },
        },
      },
      template: `
        <div style="max-width: 700px; max-height: 500px; overflow: auto;">
          <mj-deep-diff
            [oldValue]="oldValue"
            [newValue]="newValue"
            [title]="'Large Configuration Diff'"
            [showSummary]="true"
            [maxDepth]="5"
            [truncateValues]="50">
          </mj-deep-diff>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Large objects with many properties and long values are handled gracefully. Use `[maxDepth]` and `[truncateValues]` to control display.',
      },
    },
  },
};

// API response diff
export const APIResponseDiff: Story = {
  render: () => ({
    props: {
      oldValue: {
        status: 200,
        data: {
          users: [
            { id: 1, name: 'User A', status: 'active' },
            { id: 2, name: 'User B', status: 'active' },
          ],
          pagination: {
            page: 1,
            perPage: 10,
            total: 2,
          },
        },
        meta: {
          requestId: 'req-abc123',
          duration: 45,
        },
      },
      newValue: {
        status: 200,
        data: {
          users: [
            { id: 1, name: 'User A', status: 'active' },
            { id: 2, name: 'User B', status: 'inactive' },
            { id: 3, name: 'User C', status: 'active' },
          ],
          pagination: {
            page: 1,
            perPage: 10,
            total: 3,
          },
        },
        meta: {
          requestId: 'req-def456',
          duration: 52,
        },
      },
    },
    template: `
      <div style="max-width: 600px;">
        <mj-deep-diff
          [oldValue]="oldValue"
          [newValue]="newValue"
          [title]="'API Response Comparison'"
          [expandAll]="true"
          [showSummary]="true">
        </mj-deep-diff>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Useful for comparing API responses to identify changes in data or structure.',
      },
    },
  },
};

// No differences
export const NoDifferences: Story = {
  render: () => ({
    props: {
      value: {
        name: 'Test Object',
        items: ['a', 'b', 'c'],
        nested: {
          key: 'value',
        },
      },
    },
    template: `
      <div style="max-width: 500px;">
        <mj-deep-diff
          [oldValue]="value"
          [newValue]="value"
          [title]="'Identical Objects'"
          [showSummary]="true">
        </mj-deep-diff>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When objects are identical, the diff shows no changes. The summary will indicate zero differences.',
      },
    },
  },
};

// Collapsed by default
export const CollapsedByDefault: Story = {
  render: () => ({
    props: {
      oldValue: {
        section1: { a: 1, b: 2, c: 3 },
        section2: { x: 'foo', y: 'bar' },
        section3: { enabled: true, options: ['opt1', 'opt2'] },
      },
      newValue: {
        section1: { a: 1, b: 5, c: 3 },
        section2: { x: 'foo', y: 'baz', z: 'qux' },
        section3: { enabled: false, options: ['opt1', 'opt2', 'opt3'] },
      },
    },
    template: `
      <div style="max-width: 600px;">
        <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
          Click on section headers to expand and see the differences.
        </p>
        <mj-deep-diff
          [oldValue]="oldValue"
          [newValue]="newValue"
          [title]="'Collapsible Sections'"
          [expandAll]="false"
          [showSummary]="true">
        </mj-deep-diff>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'With `[expandAll]="false"`, sections start collapsed. Click to expand individual sections.',
      },
    },
  },
};
