import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { FormsModule } from '@angular/forms';

const meta: Meta = {
  title: 'Components/CodeEditor',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, CodeEditorModule, FormsModule],
    }),
  ],
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
The \`mj-code-editor\` component provides a CodeMirror-based code editor with syntax highlighting, line numbers, and various configuration options.

## Usage

\`\`\`html
<mj-code-editor
  [(value)]="code"
  [language]="'typescript'"
  [readonly]="false"
  [lineWrapping]="true"
  (valueChange)="onCodeChange($event)">
</mj-code-editor>
\`\`\`

## Module Import

\`\`\`typescript
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
\`\`\`

## Features
- Syntax highlighting for multiple languages
- Line numbers
- Read-only mode
- Line wrapping
- Custom placeholder text
- Optional toolbar
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// Sample code snippets
const typescriptCode = `interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
}

class UserService {
  private users: Map<string, User> = new Map();

  async createUser(data: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const user: User = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };

    this.users.set(user.id, user);
    return user;
  }

  async findUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}

export const userService = new UserService();
`;

const javascriptCode = `// Simple Express server
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API' });
});

app.get('/users', async (req, res) => {
  try {
    const users = await fetchUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/users', async (req, res) => {
  const { name, email } = req.body;
  const user = await createUser({ name, email });
  res.status(201).json(user);
});

// Start server
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`;

const sqlCode = `-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email
CREATE INDEX idx_users_email ON users(email);

-- Insert sample data
INSERT INTO users (name, email, role) VALUES
    ('Alice Johnson', 'alice@example.com', 'admin'),
    ('Bob Smith', 'bob@example.com', 'user'),
    ('Carol White', 'carol@example.com', 'user');

-- Query with joins
SELECT
    u.id,
    u.name,
    u.email,
    COUNT(o.id) AS order_count,
    COALESCE(SUM(o.total), 0) AS total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC;
`;

const pythonCode = `from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List
import asyncio

@dataclass
class Task:
    id: str
    title: str
    completed: bool = False
    due_date: Optional[datetime] = None
    tags: List[str] = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []

class TaskManager:
    """Manages a collection of tasks with async operations."""

    def __init__(self):
        self._tasks: dict[str, Task] = {}

    async def add_task(self, task: Task) -> Task:
        """Add a new task to the manager."""
        self._tasks[task.id] = task
        return task

    async def complete_task(self, task_id: str) -> Optional[Task]:
        """Mark a task as completed."""
        if task := self._tasks.get(task_id):
            task.completed = True
            return task
        return None

    async def get_pending_tasks(self) -> List[Task]:
        """Get all incomplete tasks."""
        return [t for t in self._tasks.values() if not t.completed]

async def main():
    manager = TaskManager()
    await manager.add_task(Task(id="1", title="Learn Python"))
    pending = await manager.get_pending_tasks()
    print(f"Pending tasks: {len(pending)}")

if __name__ == "__main__":
    asyncio.run(main())
`;

const jsonCode = `{
  "name": "@memberjunction/example-project",
  "version": "2.5.0",
  "description": "An example MemberJunction project",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@memberjunction/core": "^2.5.0",
    "@memberjunction/global": "^2.5.0",
    "typescript": "^5.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/memberjunction/example.git"
  }
}
`;

// Default TypeScript editor
export const Default: Story = {
  render: () => ({
    props: {
      code: typescriptCode,
      onCodeChange: (value: string) => console.log('Code changed:', value.length, 'chars'),
    },
    template: `
      <div style="width: 700px;">
        <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 8px;">
          TypeScript Editor
        </label>
        <mj-code-editor
          [(value)]="code"
          [language]="'typescript'"
          (valueChange)="onCodeChange($event)">
        </mj-code-editor>
      </div>
    `,
  }),
};

// Multiple languages
export const MultipleLanguages: Story = {
  render: () => ({
    props: {
      tsCode: typescriptCode.slice(0, 500),
      jsCode: javascriptCode.slice(0, 500),
      sqlCode: sqlCode.slice(0, 500),
      pyCode: pythonCode.slice(0, 500),
      jsonCode: jsonCode,
    },
    template: `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: 900px;">
        <div>
          <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 8px;">
            <i class="fa-brands fa-js" style="color: #f7df1e; margin-right: 6px;"></i>
            JavaScript
          </label>
          <mj-code-editor [value]="jsCode" [language]="'javascript'"></mj-code-editor>
        </div>
        <div>
          <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 8px;">
            <i class="fa-solid fa-database" style="color: #336791; margin-right: 6px;"></i>
            SQL
          </label>
          <mj-code-editor [value]="sqlCode" [language]="'sql'"></mj-code-editor>
        </div>
        <div>
          <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 8px;">
            <i class="fa-brands fa-python" style="color: #3776ab; margin-right: 6px;"></i>
            Python
          </label>
          <mj-code-editor [value]="pyCode" [language]="'python'"></mj-code-editor>
        </div>
        <div>
          <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 8px;">
            <i class="fa-solid fa-brackets-curly" style="color: #6b7280; margin-right: 6px;"></i>
            JSON
          </label>
          <mj-code-editor [value]="jsonCode" [language]="'json'"></mj-code-editor>
        </div>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The editor supports multiple languages including TypeScript, JavaScript, SQL, Python, JSON, HTML, CSS, and more.',
      },
    },
  },
};

// Read-only mode
export const ReadOnly: Story = {
  render: () => ({
    props: {
      code: typescriptCode,
    },
    template: `
      <div style="width: 700px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <label style="font-weight: 600; color: #374151;">
            Read-Only View
          </label>
          <span style="background: #fef3c7; color: #92400e; font-size: 12px; padding: 2px 8px; border-radius: 4px;">
            <i class="fa-solid fa-lock" style="margin-right: 4px;"></i>
            Read Only
          </span>
        </div>
        <mj-code-editor
          [value]="code"
          [language]="'typescript'"
          [readonly]="true">
        </mj-code-editor>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Set `[readonly]="true"` to prevent editing. Useful for displaying code snippets or source views.',
      },
    },
  },
};

// Disabled state
export const Disabled: Story = {
  render: () => ({
    props: {
      code: 'const message = "This editor is disabled";',
    },
    template: `
      <div style="width: 700px;">
        <label style="display: block; font-weight: 600; color: #9ca3af; margin-bottom: 8px;">
          Disabled Editor
        </label>
        <mj-code-editor
          [value]="code"
          [language]="'typescript'"
          [disabled]="true">
        </mj-code-editor>
        <p style="font-size: 14px; color: #6b7280; margin-top: 8px;">
          The editor is completely disabled and cannot receive focus.
        </p>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Set `[disabled]="true"` to completely disable the editor. It cannot receive focus or be interacted with.',
      },
    },
  },
};

// Line wrapping
export const LineWrapping: Story = {
  render: () => {
    const longLineCode = `// This file demonstrates line wrapping behavior
const veryLongConfigurationObject = { apiEndpoint: "https://api.example.com/v2/resources", authenticationHeader: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", maxRetries: 3, timeout: 30000 };

const anotherLongLine = "This is a very long string that would normally extend beyond the visible area of the editor, requiring horizontal scrolling to see its full content, but with line wrapping enabled, it wraps to the next line instead.";

export function processConfiguration(config: typeof veryLongConfigurationObject) {
  console.log("Processing configuration with endpoint:", config.apiEndpoint);
  return config;
}
`;

    return {
      props: {
        code: longLineCode,
      },
      template: `
        <div style="width: 600px;">
          <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 8px;">
            Line Wrapping Enabled
          </label>
          <mj-code-editor
            [value]="code"
            [language]="'typescript'"
            [lineWrapping]="true">
          </mj-code-editor>
          <p style="font-size: 14px; color: #6b7280; margin-top: 8px;">
            Long lines wrap to fit within the editor width instead of requiring horizontal scrolling.
          </p>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Enable `[lineWrapping]="true"` to wrap long lines instead of requiring horizontal scrolling.',
      },
    },
  },
};

// With placeholder
export const WithPlaceholder: Story = {
  render: () => ({
    props: {
      code: '',
    },
    template: `
      <div style="width: 700px;">
        <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 8px;">
          SQL Query Editor
        </label>
        <mj-code-editor
          [(value)]="code"
          [language]="'sql'"
          [placeholder]="'Enter your SQL query here...\\n\\nExample:\\nSELECT * FROM users WHERE active = true;'">
        </mj-code-editor>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'Use the `[placeholder]` property to show hint text when the editor is empty.',
      },
    },
  },
};

// Compact editor
export const Compact: Story = {
  render: () => ({
    props: {
      expression: 'user.role === "admin" && user.isActive',
    },
    template: `
      <div style="width: 500px;">
        <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">
          Filter Expression
        </label>
        <div style="border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden;">
          <mj-code-editor
            [(value)]="expression"
            [language]="'javascript'">
          </mj-code-editor>
        </div>
        <p style="font-size: 12px; color: #6b7280; margin-top: 4px;">
          Enter a JavaScript expression that evaluates to true/false
        </p>
      </div>
    `,
  }),
  parameters: {
    docs: {
      description: {
        story: 'The editor can be used in compact form for single expressions or short snippets.',
      },
    },
  },
};

// Side by side comparison
export const SideBySideComparison: Story = {
  render: () => {
    const beforeCode = `function calculateTotal(items) {
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  return total;
}`;

    const afterCode = `const calculateTotal = (items: Item[]): number => {
  return items.reduce((total, item) => total + item.price, 0);
};`;

    return {
      props: {
        beforeCode,
        afterCode,
      },
      template: `
        <div style="width: 900px;">
          <h3 style="margin: 0 0 16px 0; color: #374151;">Code Refactoring Example</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="background: #fef2f2; color: #991b1b; font-size: 12px; padding: 4px 8px; border-radius: 4px;">
                  <i class="fa-solid fa-minus" style="margin-right: 4px;"></i>
                  Before
                </span>
                <span style="color: #6b7280; font-size: 14px;">ES5 JavaScript</span>
              </div>
              <mj-code-editor [value]="beforeCode" [language]="'javascript'" [readonly]="true"></mj-code-editor>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="background: #f0fdf4; color: #166534; font-size: 12px; padding: 4px 8px; border-radius: 4px;">
                  <i class="fa-solid fa-plus" style="margin-right: 4px;"></i>
                  After
                </span>
                <span style="color: #6b7280; font-size: 14px;">Modern TypeScript</span>
              </div>
              <mj-code-editor [value]="afterCode" [language]="'typescript'" [readonly]="true"></mj-code-editor>
            </div>
          </div>
        </div>
      `,
    };
  },
  parameters: {
    docs: {
      description: {
        story: 'Multiple editors can be used side-by-side to compare code versions or show before/after refactoring.',
      },
    },
  },
};
