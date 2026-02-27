import { LearnWorldsBaseParams } from './common.types';

/**
 * Parameters for AttachTags / DetachTags actions
 */
export interface TagParams extends LearnWorldsBaseParams {
  UserID: string;
  Tags: string[];
}

/**
 * Result of tag operations
 */
export interface TagResult {
  Success: boolean;
  UserID: string;
  Tags: string[];
}
