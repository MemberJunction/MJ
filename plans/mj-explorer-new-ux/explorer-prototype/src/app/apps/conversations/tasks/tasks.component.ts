import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tasks-container">
      <h2>Tasks</h2>
      <div class="tasks-list">
        <div class="task-item" *ngFor="let task of tasks" [class.completed]="task.completed">
          <input type="checkbox" [checked]="task.completed">
          <div class="task-content">
            <h3>{{ task.title }}</h3>
            <p>{{ task.description }}</p>
            <span class="due-date">Due: {{ task.dueDate }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tasks-container {
      padding: 24px;
    }

    h2 {
      margin: 0 0 24px 0;
      color: #424242;
    }

    .tasks-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .task-item {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      transition: border-color 0.15s;

      &:hover {
        border-color: #bdbdbd;
      }

      &.completed {
        opacity: 0.6;

        h3 {
          text-decoration: line-through;
        }
      }

      input[type="checkbox"] {
        margin-top: 4px;
      }

      .task-content {
        flex: 1;

        h3 {
          margin: 0 0 8px 0;
          color: #424242;
          font-size: 16px;
        }

        p {
          margin: 0 0 8px 0;
          color: #757575;
          font-size: 14px;
        }

        .due-date {
          color: #f44336;
          font-size: 12px;
          font-weight: 500;
        }
      }
    }
  `]
})
export class TasksComponent {
  tasks = [
    {
      title: 'Review prototype designs',
      description: 'Check the new UX mockups and provide feedback',
      dueDate: 'Today',
      completed: false
    },
    {
      title: 'Update documentation',
      description: 'Add notes about the new tab system',
      dueDate: 'Tomorrow',
      completed: false
    },
    {
      title: 'Test Golden Layout integration',
      description: 'Verify tab management works correctly',
      dueDate: 'Nov 15',
      completed: true
    }
  ];
}
