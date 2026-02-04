import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { MarkdownModule } from '@memberjunction/ng-markdown';

const meta: Meta = {
  title: 'Components/Markdown',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, MarkdownModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-markdown\` component renders markdown content with support for syntax highlighting, Mermaid diagrams, collapsible headings, and GitHub-style alerts.

## Usage

\`\`\`html
<mj-markdown
  [data]="markdownContent"
  [enableMermaid]="true"
  [enableCollapsibleHeadings]="true"
  [enableCodeCopy]="true">
</mj-markdown>
\`\`\`

## Module Import

\`\`\`typescript
import { MarkdownModule } from '@memberjunction/ng-markdown';
\`\`\`

## Features
- GitHub-flavored markdown rendering
- Syntax highlighting for code blocks
- Mermaid diagram support
- Collapsible headings
- Code copy button
- GitHub-style alerts ([!NOTE], [!WARNING], etc.)
- Tables, lists, blockquotes
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Basic markdown
const basicMarkdown = `# Welcome to Markdown

This is a **bold** statement and this is *italicized*.

## Features

Here's what you can do:

- Create bullet lists
- Add **bold** and *italic* text
- Include [links](https://example.com)
- Write \`inline code\`

### Blockquotes

> This is a blockquote. It can span multiple lines
> and include other markdown elements.

### Horizontal Rules

---

That's a horizontal rule above.
`;

export const Default: Story = {
  render: () => ({
    props: {
      content: basicMarkdown,
    },
    template: `
      <div style="max-width: 700px; padding: 24px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
        <mj-markdown [data]="content"></mj-markdown>
      </div>
    `,
  }),
};

// Code highlighting
const codeMarkdown = `# Code Examples

## TypeScript

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users');
  const data = await response.json();
  return data.users;
}

// Usage
const users = await fetchUsers();
users.forEach(user => console.log(user.name));
\`\`\`

## Python

\`\`\`python
def fibonacci(n: int) -> list[int]:
    """Generate Fibonacci sequence up to n terms."""
    sequence = []
    a, b = 0, 1
    for _ in range(n):
        sequence.append(a)
        a, b = b, a + b
    return sequence

# Generate first 10 Fibonacci numbers
fib = fibonacci(10)
print(fib)  # [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
\`\`\`

## SQL

\`\`\`sql
SELECT
    u.id,
    u.name,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 5
ORDER BY total_spent DESC
LIMIT 10;
\`\`\`

## JSON

\`\`\`json
{
  "name": "my-project",
  "version": "1.0.0",
  "dependencies": {
    "typescript": "^5.0.0",
    "express": "^4.18.0"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
\`\`\`
`;

export const CodeHighlighting: Story = {
  render: () => ({
    props: {
      content: codeMarkdown,
    },
    template: `
      <div style="max-width: 800px; padding: 24px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
        <mj-markdown [data]="content" [enableCodeCopy]="true"></mj-markdown>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Code blocks are syntax highlighted based on the language specified. The copy button allows easy copying of code snippets.',
      },
    },
  },
};

// Mermaid diagrams
const mermaidMarkdown = `# Diagrams with Mermaid

## Flowchart

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Fix the issue]
    E --> B
    C --> F[Deploy]
\`\`\`

## Sequence Diagram

\`\`\`mermaid
sequenceDiagram
    participant User
    participant API
    participant Database

    User->>API: Request data
    API->>Database: Query
    Database-->>API: Results
    API-->>User: JSON response
\`\`\`

## Entity Relationship

\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    USER {
        string id PK
        string name
        string email
    }
    ORDER ||--|{ ITEM : contains
    ORDER {
        string id PK
        date created
        float total
    }
    ITEM {
        string id PK
        string name
        int quantity
    }
\`\`\`

## Pie Chart

\`\`\`mermaid
pie title Project Time Distribution
    "Development" : 45
    "Testing" : 25
    "Documentation" : 15
    "Meetings" : 15
\`\`\`
`;

export const MermaidDiagrams: Story = {
  render: () => ({
    props: {
      content: mermaidMarkdown,
    },
    template: `
      <div style="max-width: 800px; padding: 24px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
        <mj-markdown [data]="content" [enableMermaid]="true"></mj-markdown>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Mermaid diagrams render flowcharts, sequence diagrams, ER diagrams, pie charts, and more. Enable with `[enableMermaid]="true"`.',
      },
    },
  },
};

// Collapsible headings
const collapsibleMarkdown = `# Project Documentation

Click on any heading to expand or collapse its content.

## Getting Started

This section covers the basics of getting started with the project.

### Prerequisites

Before you begin, ensure you have:
- Node.js 18 or higher
- npm or yarn
- A code editor

### Installation

Run the following commands:

\`\`\`bash
npm install
npm run build
npm start
\`\`\`

## API Reference

Detailed API documentation for all endpoints.

### Authentication

All API requests require authentication via Bearer token.

\`\`\`http
Authorization: Bearer <your-token>
\`\`\`

### Endpoints

#### GET /users

Returns a list of all users.

#### POST /users

Creates a new user.

## Troubleshooting

Common issues and their solutions.

### Build Errors

If you encounter build errors, try:

1. Delete node_modules
2. Clear npm cache
3. Reinstall dependencies

### Runtime Errors

Check the logs for detailed error messages.
`;

export const CollapsibleHeadings: Story = {
  render: () => ({
    props: {
      content: collapsibleMarkdown,
    },
    template: `
      <div style="max-width: 700px; padding: 24px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
        <mj-markdown [data]="content" [enableCollapsibleHeadings]="true"></mj-markdown>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'When enabled, headings become collapsible sections. Click a heading to expand or collapse its content. Great for long documentation.',
      },
    },
  },
};

// GitHub alerts
const alertsMarkdown = `# Status Updates

> [!NOTE]
> This is a note callout. Use it for helpful information that users should be aware of.

> [!TIP]
> This is a tip callout. Great for suggesting best practices or helpful hints.

> [!IMPORTANT]
> This is an important callout. Use it for crucial information users shouldn't miss.

> [!WARNING]
> This is a warning callout. Alerts users to potential issues or gotchas.

> [!CAUTION]
> This is a caution callout. Use it for things that could cause problems if ignored.

## Usage in Documentation

These alerts help highlight important information:

> [!NOTE]
> Version 2.0 introduces breaking changes. Please review the migration guide before upgrading.

> [!TIP]
> Use environment variables for sensitive configuration values instead of hardcoding them.
`;

export const GitHubAlerts: Story = {
  render: () => ({
    props: {
      content: alertsMarkdown,
    },
    template: `
      <div style="max-width: 700px; padding: 24px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
        <mj-markdown [data]="content"></mj-markdown>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'GitHub-style alerts provide visual callouts for notes, tips, important information, warnings, and cautions.',
      },
    },
  },
};

// Tables
const tablesMarkdown = `# Data Tables

## Simple Table

| Name | Role | Department |
|------|------|------------|
| Alice | Developer | Engineering |
| Bob | Designer | Design |
| Carol | Manager | Operations |

## Aligned Columns

| Left | Center | Right |
|:-----|:------:|------:|
| L1 | C1 | R1 |
| L2 | C2 | R2 |
| L3 | C3 | R3 |

## Complex Table

| Feature | Free Plan | Pro Plan | Enterprise |
|---------|:---------:|:--------:|:----------:|
| Users | 5 | 50 | Unlimited |
| Storage | 1 GB | 100 GB | 1 TB |
| Support | Email | Priority | Dedicated |
| API Access | No | Yes | Yes |
| SSO | No | No | Yes |
| Price | $0/mo | $29/mo | Custom |
`;

export const Tables: Story = {
  render: () => ({
    props: {
      content: tablesMarkdown,
    },
    template: `
      <div style="max-width: 700px; padding: 24px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
        <mj-markdown [data]="content"></mj-markdown>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Markdown tables render with proper styling. Columns can be left, center, or right aligned.',
      },
    },
  },
};

// All features combined
const allFeaturesMarkdown = `# Complete Feature Demo

> [!NOTE]
> This demo showcases all markdown features in one place.

## Code and Diagrams

Here's some TypeScript:

\`\`\`typescript
const greeting = (name: string): string => {
  return \`Hello, \${name}!\`;
};
\`\`\`

And a simple flowchart:

\`\`\`mermaid
flowchart LR
    A[Input] --> B[Process]
    B --> C[Output]
\`\`\`

## Lists and Formatting

**Things to remember:**

1. First item
2. Second item
   - Nested bullet
   - Another nested item
3. Third item

## Table Example

| Status | Count | Percentage |
|--------|------:|----------:|
| Active | 150 | 75% |
| Pending | 30 | 15% |
| Closed | 20 | 10% |

## Links and Images

Visit [our documentation](https://docs.example.com) for more information.

---

*Last updated: January 2025*
`;

export const AllFeatures: Story = {
  render: () => ({
    props: {
      content: allFeaturesMarkdown,
    },
    template: `
      <div style="max-width: 800px; padding: 24px; background: white; border-radius: 12px; border: 1px solid #e5e7eb;">
        <mj-markdown
          [data]="content"
          [enableMermaid]="true"
          [enableCollapsibleHeadings]="true"
          [enableCodeCopy]="true">
        </mj-markdown>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Kitchen sink example demonstrating all markdown features together: code highlighting, Mermaid diagrams, alerts, tables, lists, and formatting.',
      },
    },
  },
};
