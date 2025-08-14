export type StepType = 'prompt' | 'agent' | 'action';

export interface StepProperty {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'json';
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
}

export interface StepOption {
  id: string;
  name: string;
  value: string;
  properties?: StepProperty[];
}

export interface StepTypeConfig {
  type: StepType;
  name: string;
  icon: string;
  color: string;
  options: StepOption[]; // Placeholder options for dropdown
}

export interface Step {
  id: number;
  type: StepType;
  name: string;
  selectedOption?: string;
  position: [number, number];
  config: StepTypeConfig;
  propertyValues?: { [key: string]: any };
}

// Step configurations
export const STEP_CONFIGS: { [key in StepType]: StepTypeConfig } = {
  prompt: {
    type: 'prompt',
    name: 'Prompt',
    icon: 'fa-comment',
    color: '#0076B6', // mj-blue
    options: [
      { 
        id: 'p1', 
        name: 'System Prompt', 
        value: 'system',
        properties: [
          { key: 'systemMessage', label: 'System Message', type: 'textarea', rows: 4, placeholder: 'You are a helpful assistant...' },
          { key: 'temperature', label: 'Temperature', type: 'number', min: 0, max: 2, step: 0.1, defaultValue: 0.7 },
          { key: 'maxTokens', label: 'Max Tokens', type: 'number', min: 1, max: 4096, defaultValue: 1024 }
        ]
      },
      { 
        id: 'p2', 
        name: 'User Prompt', 
        value: 'user',
        properties: [
          { key: 'userMessage', label: 'User Message', type: 'textarea', rows: 4, placeholder: 'Enter user prompt...' },
          { key: 'includeContext', label: 'Include Context', type: 'checkbox', defaultValue: true },
          { key: 'contextWindow', label: 'Context Window Size', type: 'number', min: 0, max: 10, defaultValue: 3 }
        ]
      },
      { 
        id: 'p3', 
        name: 'Assistant Prompt', 
        value: 'assistant',
        properties: [
          { key: 'assistantMessage', label: 'Assistant Response Template', type: 'textarea', rows: 3, placeholder: 'Template for assistant response...' },
          { key: 'formatType', label: 'Response Format', type: 'select', options: [
            { value: 'text', label: 'Plain Text' },
            { value: 'json', label: 'JSON' },
            { value: 'markdown', label: 'Markdown' }
          ], defaultValue: 'text' }
        ]
      }
    ]
  },
  agent: {
    type: 'agent',
    name: 'Agent',
    icon: 'fa-robot',
    color: '#092340', // navy
    options: [
      { 
        id: 'a1', 
        name: 'Research Agent', 
        value: 'research',
        properties: [
          { key: 'searchDepth', label: 'Search Depth', type: 'select', options: [
            { value: 'shallow', label: 'Shallow (Fast)' },
            { value: 'medium', label: 'Medium' },
            { value: 'deep', label: 'Deep (Thorough)' }
          ], defaultValue: 'medium' },
          { key: 'sources', label: 'Allowed Sources', type: 'text', placeholder: 'wikipedia, arxiv, pubmed...' },
          { key: 'maxResults', label: 'Max Results', type: 'number', min: 1, max: 100, defaultValue: 10 }
        ]
      },
      { 
        id: 'a2', 
        name: 'Code Agent', 
        value: 'code',
        properties: [
          { key: 'language', label: 'Programming Language', type: 'select', options: [
            { value: 'python', label: 'Python' },
            { value: 'javascript', label: 'JavaScript' },
            { value: 'typescript', label: 'TypeScript' },
            { value: 'java', label: 'Java' },
            { value: 'csharp', label: 'C#' }
          ], defaultValue: 'python' },
          { key: 'framework', label: 'Framework/Library', type: 'text', placeholder: 'React, Django, Spring...' },
          { key: 'codeStyle', label: 'Code Style', type: 'select', options: [
            { value: 'clean', label: 'Clean Code' },
            { value: 'documented', label: 'Well Documented' },
            { value: 'optimized', label: 'Performance Optimized' }
          ], defaultValue: 'clean' }
        ]
      },
      { 
        id: 'a3', 
        name: 'Analysis Agent', 
        value: 'analysis',
        properties: [
          { key: 'analysisType', label: 'Analysis Type', type: 'select', options: [
            { value: 'statistical', label: 'Statistical' },
            { value: 'sentiment', label: 'Sentiment' },
            { value: 'comparative', label: 'Comparative' }
          ], defaultValue: 'statistical' },
          { key: 'outputFormat', label: 'Output Format', type: 'select', options: [
            { value: 'report', label: 'Detailed Report' },
            { value: 'summary', label: 'Executive Summary' },
            { value: 'visualization', label: 'Visual Charts' }
          ], defaultValue: 'report' },
          { key: 'confidence', label: 'Include Confidence Scores', type: 'checkbox', defaultValue: true }
        ]
      }
    ]
  },
  action: {
    type: 'action',
    name: 'Action',
    icon: 'fa-bolt',
    color: '#AAE7FD', // light-blue
    options: [
      { 
        id: 'ac1', 
        name: 'API Call', 
        value: 'api',
        properties: [
          { key: 'endpoint', label: 'API Endpoint', type: 'text', placeholder: 'https://api.example.com/endpoint' },
          { key: 'method', label: 'HTTP Method', type: 'select', options: [
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'DELETE', label: 'DELETE' },
            { value: 'PATCH', label: 'PATCH' }
          ], defaultValue: 'GET' },
          { key: 'headers', label: 'Headers', type: 'json', rows: 3, placeholder: '{"Content-Type": "application/json"}' },
          { key: 'timeout', label: 'Timeout (ms)', type: 'number', min: 0, max: 60000, defaultValue: 5000 }
        ]
      },
      { 
        id: 'ac2', 
        name: 'Database Query', 
        value: 'database',
        properties: [
          { key: 'dbType', label: 'Database Type', type: 'select', options: [
            { value: 'mysql', label: 'MySQL' },
            { value: 'postgresql', label: 'PostgreSQL' },
            { value: 'mongodb', label: 'MongoDB' },
            { value: 'redis', label: 'Redis' }
          ], defaultValue: 'postgresql' },
          { key: 'query', label: 'Query', type: 'textarea', rows: 4, placeholder: 'SELECT * FROM users WHERE...' },
          { key: 'connectionString', label: 'Connection String', type: 'text', placeholder: 'host:port/database' },
          { key: 'useCache', label: 'Use Query Cache', type: 'checkbox', defaultValue: false }
        ]
      },
      { 
        id: 'ac3', 
        name: 'File Operation', 
        value: 'file',
        properties: [
          { key: 'operation', label: 'Operation Type', type: 'select', options: [
            { value: 'read', label: 'Read' },
            { value: 'write', label: 'Write' },
            { value: 'append', label: 'Append' },
            { value: 'delete', label: 'Delete' }
          ], defaultValue: 'read' },
          { key: 'filePath', label: 'File Path', type: 'text', placeholder: '/path/to/file.txt' },
          { key: 'encoding', label: 'Encoding', type: 'select', options: [
            { value: 'utf8', label: 'UTF-8' },
            { value: 'ascii', label: 'ASCII' },
            { value: 'base64', label: 'Base64' }
          ], defaultValue: 'utf8' },
          { key: 'createIfNotExists', label: 'Create If Not Exists', type: 'checkbox', defaultValue: true }
        ]
      }
    ]
  }
};