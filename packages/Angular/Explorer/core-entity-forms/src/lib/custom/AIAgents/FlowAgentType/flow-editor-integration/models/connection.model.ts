export interface BooleanCondition {
  expression: string; // e.g., "success", "error", "completed"
  label?: string; // Optional label for the connection
}

export interface Connection {
  id: string;
  source: number; // Step ID
  target: number; // Step ID
  sourceOutput: string;
  targetInput: string;
  condition?: BooleanCondition; // Optional boolean condition
}

// Common boolean conditions
export const COMMON_CONDITIONS = [
  { expression: 'success', label: 'Success' },
  { expression: 'error', label: 'Error' },
  { expression: 'completed', label: 'Completed' },
  { expression: 'failed', label: 'Failed' },
  { expression: 'timeout', label: 'Timeout' },
  { expression: 'true', label: 'True' },
  { expression: 'false', label: 'False' }
];