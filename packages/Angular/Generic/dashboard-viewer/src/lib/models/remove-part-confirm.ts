import type { MJConfirmOptions } from '@memberjunction/ng-ui-components';

/** What each built-in part type shows, as the Remove part confirm names it. */
const PART_SOURCE_NOUNS = new Map<string, string>([
    ['View', 'view'],
    ['Query', 'query'],
    ['Artifact', 'artifact'],
    ['WebURL', 'page'],
]);

/**
 * The texts of the Remove part confirm, for MJConfirmService.ConfirmDelete. Names the part and says
 * that its source is kept. A part without a title is "this part"; a part type other than the four
 * built-in ones gets no detail line.
 */
export function RemovePartConfirmOptions(partTitle: string | null | undefined, partTypeName: string | null | undefined): Omit<MJConfirmOptions, 'type'> {
    const title = partTitle?.trim();
    const noun = partTypeName ? PART_SOURCE_NOUNS.get(partTypeName) : undefined;
    return {
        title: 'Remove part',
        message: title ? `Remove "${title}" from this dashboard?` : 'Remove this part from this dashboard?',
        ...(noun ? { detail: `The ${noun} itself is not deleted.` } : {}),
        confirmText: 'Remove',
    };
}
