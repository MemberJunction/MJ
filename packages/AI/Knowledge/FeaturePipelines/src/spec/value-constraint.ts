/**
 * @fileoverview Value constraint specifications for DataFeatureSpec outputs.
 * Pure types without dependency on @memberjunction/core or database entities.
 * @module @memberjunction/feature-pipelines
 */

export type ViolationPolicy = 'fail' | 'null' | 'coerce-to-other';

export type ValueConstraint =
  | { Type: 'enum'; Values?: string[]; FromFieldMetadata?: boolean; OnViolation: ViolationPolicy }
  | { Type: 'lookup'; Entity?: string; MatchField?: string; OnViolation: ViolationPolicy }
  | { Type: 'numeric'; Min?: number; Max?: number; Integer?: boolean; OnViolation: ViolationPolicy }
  | { Type: 'money'; Min?: number; Max?: number; CurrencyCode?: string; OnViolation: ViolationPolicy }
  | { Type: 'date'; Min?: string; Max?: string; OnViolation: ViolationPolicy }
  | { Type: 'boolean'; OnViolation: ViolationPolicy }
  | { Type: 'freetext'; MaxLength?: number; OnViolation?: ViolationPolicy };

/**
 * Concrete resolved constraint after metadata expansion (e.g. FromFieldMetadata resolved into concrete values).
 */
export interface ResolvedConstraint {
  Type: ValueConstraint['Type'];
  OnViolation: ViolationPolicy;
  AllowedValues?: string[];
  Min?: number;
  Max?: number;
  Integer?: boolean;
  CurrencyCode?: string;
  MinDate?: string;
  MaxDate?: string;
  MaxLength?: number;
  RelatedEntityName?: string;
  LookupMatchField?: string;
}
