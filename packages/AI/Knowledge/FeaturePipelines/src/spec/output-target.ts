/**
 * @fileoverview Output target specifications for DataFeatureSpec outputs.
 * Pure types without dependency on @memberjunction/core or database entities.
 * @module @memberjunction/feature-pipelines
 */

export type OutputTarget =
  /**
   * MODE 1 — a field on the processed row. Write semantics are DERIVED from the
   * field's metadata: TSType coercion for numeric/date/boolean, the CHECK
   * value list for an enum, and for a foreign key the allowed set comes from
   * RelatedEntityID — resolved by matching MatchField and writing the related row's
   * ID. The spec never restates what metadata already knows.
   */
  | {
      Mode: 'field';
      EntityFieldName: string;
      /** FK only: which column of the related entity the model's answer matches. Default 'Name'. */
      LookupMatchField?: string;
      /** FK only: what to do when no related row matches. Default 'null'. */
      OnLookupMiss?: 'null' | 'fail' | 'create';
    }

  /**
   * MODE 2 — a related child row. FanOutRef promotes an array result to N rows
   * (one per element). Values resolve from $ (result), record (parent row) and
   * $run (provenance) alike.
   */
  | {
      Mode: 'child';
      EntityName: string;
      ParentField: string;
      Map: Record<string, string>;
      FanOutRef?: string;
    }

  /**
   * MODE 3 — a tag, through the MJ Tagging system. The pipeline states WHERE in the
   * taxonomy this feature is allowed to live and how far it may grow, so one entity
   * can constrain different features to different subtrees.
   */
  | {
      Mode: 'tags';
      /** Root tag this feature's values must live under. Required — an unrooted feature pollutes the taxonomy. */
      RootTagID: string;
      /** How deep below the root a value may be placed/created. 1 = direct children only. */
      MaxDepth?: number;
      /** Maps to TagEngine's TaxonomyMode. Default 'constrained'. */
      Growth?: 'constrained' | 'auto-grow' | 'hybrid';
      /** Minimum semantic-match score to accept an existing tag. */
      MatchThreshold?: number;
      /** Entity the TaggedItem points at. Default: the processed entity. */
      TaggedEntityName?: string;
    };
