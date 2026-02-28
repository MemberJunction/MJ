import { LearnWorldsBaseParams, LearnWorldsBundle } from './common.types';

/**
 * Parameters for the GetBundles action
 */
export interface GetBundlesParams extends LearnWorldsBaseParams {
  SearchText?: string;
  MaxResults?: number;
}

/**
 * Result of the GetBundles action
 */
export interface GetBundlesResult {
  Bundles: LearnWorldsBundle[];
  TotalCount: number;
}
