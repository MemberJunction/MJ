import { CategoryOption, SeverityOption, EnvironmentOption } from './feedback.types';

/**
 * Default category options for the feedback form
 */
export const DEFAULT_CATEGORIES: CategoryOption[] = [
  {
    value: 'bug',
    label: 'Bug Report',
    description: "Something isn't working correctly"
  },
  {
    value: 'feature',
    label: 'Feature Request',
    description: 'Suggest a new feature or improvement'
  },
  {
    value: 'question',
    label: 'Question',
    description: 'Ask a question about functionality'
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Something else'
  }
];

/**
 * Default severity options for bug reports
 */
export const DEFAULT_SEVERITIES: SeverityOption[] = [
  {
    value: 'critical',
    label: 'Critical',
    description: 'System down, data loss, no workaround'
  },
  {
    value: 'major',
    label: 'Major',
    description: 'Major feature broken, difficult workaround'
  },
  {
    value: 'minor',
    label: 'Minor',
    description: 'Feature impaired but workaround exists'
  },
  {
    value: 'trivial',
    label: 'Trivial',
    description: 'Cosmetic issue, minor inconvenience'
  }
];

/**
 * Default environment options
 */
export const DEFAULT_ENVIRONMENTS: EnvironmentOption[] = [
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
  { value: 'local', label: 'Local' }
];
