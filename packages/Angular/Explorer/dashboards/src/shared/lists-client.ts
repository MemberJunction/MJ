import type { ApplyResult } from '@memberjunction/lists-base';

export { CreateListsClient } from '@memberjunction/ng-list-management';

/** Number of records the operation could not process. */
export function ListResultFailedCount(result: ApplyResult): number {
  return result.Counts?.Failed ?? result.Errors?.length ?? 0;
}

/** True when the operation ran but some records failed. */
export function IsPartialListResult(result: ApplyResult): boolean {
  return result.ResultCode === 'PARTIAL_SUCCESS';
}

/** `count` followed by `noun`, with an "s" when `count` is not 1. */
export function PluralizeRecords(count: number, noun = 'record'): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** A message for the notification service. */
export interface ListResultNotice {
  Message: string;
  Style: 'success' | 'warning' | 'error';
  Duration: number;
}

/** The notice for a list duplicate: the number of members copied, or why it failed. */
export function DuplicateListNotice(result: ApplyResult): ListResultNotice {
  const copied = PluralizeRecords(result.Counts?.Added ?? 0, 'item');
  if (result.Success) return { Message: `List duplicated with ${copied}`, Style: 'success', Duration: 3000 };
  if (IsPartialListResult(result)) {
    return { Message: `List duplicated with ${copied}; ${ListResultFailedCount(result)} failed to copy`, Style: 'warning', Duration: 6000 };
  }
  return { Message: `Failed to duplicate list: ${result.Message}`, Style: 'error', Duration: 6000 };
}
