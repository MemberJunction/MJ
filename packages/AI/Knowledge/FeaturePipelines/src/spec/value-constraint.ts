/**
 * @fileoverview Value constraint specifications for DataFeatureSpec outputs.
 * Pure types without dependency on @memberjunction/core or database entities.
 * @module @memberjunction/feature-pipelines
 */

export type ViolationPolicy = 'fail' | 'null' | 'coerce-to-other';

export type ValueConstraint =
  | { Type: 'enum'; Values?: string[]; FromFieldMetadata?: boolean; ValueDescriptions?: Record<string, string>; OnViolation: ViolationPolicy }
  | { Type: 'lookup'; Entity?: string; MatchField?: string; OnViolation: ViolationPolicy }
  | { Type: 'numeric'; Min?: number; Max?: number; Integer?: boolean; Levels?: string[]; OnViolation: ViolationPolicy }
  | { Type: 'money'; Min?: number; Max?: number; CurrencyCode?: string; OnViolation: ViolationPolicy }
  | { Type: 'date'; Min?: string; Max?: string; OnViolation: ViolationPolicy }
  | { Type: 'boolean'; Threshold?: number; OnViolation: ViolationPolicy }
  | { Type: 'freetext'; MaxLength?: number; OnViolation?: ViolationPolicy };

/**
 * Concrete resolved constraint after metadata expansion (e.g. FromFieldMetadata resolved into concrete values).
 */
export interface ResolvedConstraint {
  Type: ValueConstraint['Type'];
  OnViolation: ViolationPolicy;
  AllowedValues?: string[];
  ValueDescriptions?: Record<string, string>;
  Min?: number;
  Max?: number;
  Integer?: boolean;
  Levels?: string[];
  Threshold?: number;
  CurrencyCode?: string;
  MinDate?: string;
  MaxDate?: string;
  MaxLength?: number;
  RelatedEntityName?: string;
  LookupMatchField?: string;
}
