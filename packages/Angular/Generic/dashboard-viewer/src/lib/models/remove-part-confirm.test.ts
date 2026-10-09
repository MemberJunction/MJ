import { describe, it, expect } from 'vitest';
import { RemovePartConfirmOptions } from './remove-part-confirm';

describe('RemovePartConfirmOptions', () => {
    it('names the part and says the view is kept', () => {
        expect(RemovePartConfirmOptions('Revenue', 'View')).toEqual({
            title: 'Remove part',
            message: 'Remove "Revenue" from this dashboard?',
            detail: 'The view itself is not deleted.',
            confirmText: 'Remove',
        });
    });

    it.each([['Query', 'query'], ['Artifact', 'artifact'], ['WebURL', 'page']])('calls the source of a %s part a %s', (type, noun) => {
        expect(RemovePartConfirmOptions('Pipeline', type).detail).toBe(`The ${noun} itself is not deleted.`);
    });

    it('calls a part without a title "this part"', () => {
        expect(RemovePartConfirmOptions('  ', 'View').message).toBe('Remove this part from this dashboard?');
        expect(RemovePartConfirmOptions(null, 'View').message).toBe('Remove this part from this dashboard?');
    });

    it('names the part by its title without the spaces around it', () => {
        expect(RemovePartConfirmOptions('  Revenue ', 'View').message).toBe('Remove "Revenue" from this dashboard?');
    });

    it('gives no detail line for another part type', () => {
        expect(RemovePartConfirmOptions('Pipeline', 'Custom')).not.toHaveProperty('detail');
        expect(RemovePartConfirmOptions('Pipeline', undefined)).not.toHaveProperty('detail');
    });
});
