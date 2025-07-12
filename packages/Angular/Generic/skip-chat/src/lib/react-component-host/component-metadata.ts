/**
 * Component metadata for component registry system
 */
export interface ComponentMetadata {
  /** List of child component names required by this component */
  requiredChildComponents: string[];
  /** Context for component resolution (e.g., 'CRM', 'Finance', 'Standard') */
  componentContext: string;
  /** Version of the component specification */
  version: string;
}