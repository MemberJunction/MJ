/**
 * Golden table for `GeneratePluralName` (#4815 part 2). CodeGen names new entities and their
 * base views with it, and `EntityInfo.DisplayNamePlural` shows its output to users, so every
 * rule and every irregular is pinned here: a change to the pluralizer shows up as a diff in
 * this file instead of drifting silently.
 */
import { describe, it, expect } from 'vitest';
import { GeneratePluralName, GetIrregularPlural } from '../util';

/** Every entry of the irregular table, singular -> plural (lowercase). */
const IRREGULARS: ReadonlyArray<[string, string]> = [
    ['child', 'children'], ['person', 'people'], ['mouse', 'mice'], ['foot', 'feet'],
    ['tooth', 'teeth'], ['goose', 'geese'], ['man', 'men'], ['woman', 'women'], ['ox', 'oxen'],
    ['cactus', 'cacti'], ['focus', 'foci'], ['fungus', 'fungi'], ['nucleus', 'nuclei'],
    ['syllabus', 'syllabi'], ['analysis', 'analyses'], ['diagnosis', 'diagnoses'],
    ['thesis', 'theses'], ['crisis', 'crises'], ['phenomenon', 'phenomena'],
    ['criterion', 'criteria'], ['datum', 'data'], ['appendix', 'appendices'],
    ['index', 'indices'], ['matrix', 'matrices'], ['vertex', 'vertices'], ['vortex', 'vortices'],
    ['radius', 'radii'], ['corpus', 'corpora'], ['genus', 'genera'], ['locus', 'loci'],
    ['alga', 'algae'], ['antenna', 'antennae'], ['formula', 'formulae'], ['nebula', 'nebulae'],
    ['vertebra', 'vertebrae'], ['memorandum', 'memoranda'], ['medium', 'media'],
    ['bacterium', 'bacteria'], ['curriculum', 'curricula'], ['referendum', 'referenda'],
    ['stimulus', 'stimuli'], ['automaton', 'automata'], ['beau', 'beaux'], ['bureau', 'bureaux'],
    ['tableau', 'tableaux'], ['cherub', 'cherubim'], ['seraph', 'seraphim'], ['elf', 'elves'],
    ['calf', 'calves'], ['half', 'halves'], ['knife', 'knives'], ['leaf', 'leaves'],
    ['life', 'lives'], ['loaf', 'loaves'], ['scarf', 'scarves'], ['self', 'selves'],
    ['sheaf', 'sheaves'], ['shelf', 'shelves'], ['thief', 'thieves'], ['wife', 'wives'],
    ['wolf', 'wolves'],
    // Added with #4815.
    ['axis', 'axes'], ['basis', 'bases'], ['hypothesis', 'hypotheses'], ['series', 'series'],
    ['species', 'species'], ['quiz', 'quizzes'], ['status', 'statuses'], ['alias', 'aliases'],
];

describe('GeneratePluralName — every irregular', () => {
    it.each(IRREGULARS)('%s -> %s', (singular, plural) => {
        expect(GetIrregularPlural(singular)).toBe(plural);
        expect(GeneratePluralName(singular)).toBe(plural);
    });

    it.each(IRREGULARS)('Title-case %s keeps its leading capital', (singular, plural) => {
        const title = singular.charAt(0).toUpperCase() + singular.slice(1);
        const expected = plural.charAt(0).toUpperCase() + plural.slice(1);
        expect(GeneratePluralName(title)).toBe(expected);
    });

    it.each(IRREGULARS)('an irregular plural (%s) is returned unchanged', (_singular, plural) => {
        expect(GeneratePluralName(plural)).toBe(plural);
    });
});

/** Rule cases: input -> expected plural. */
const RULES: ReadonlyArray<[string, string, string]> = [
    // Regular endings
    ['dog', 'dogs', 'default adds s'],
    ['box', 'boxes', 'x adds es'],
    ['church', 'churches', 'ch adds es'],
    ['dish', 'dishes', 'sh adds es'],
    ['buzz', 'buzzes', 'z adds es'],
    ['Address', 'Addresses', 'ss adds es'],
    ['party', 'parties', 'consonant + y -> ies'],
    ['day', 'days', 'vowel + y adds s'],
    // Already plural
    ['Customers', 'Customers', 'a plural stays'],
    ['Parties', 'Parties', 'an -ies plural stays'],
    ['Boxes', 'Boxes', 'an -es plural stays'],
    // Irregulars that used to be unreachable (#4815)
    ['Analysis', 'Analyses', 'irregular checked before the plural test'],
    ['Status', 'Statuses', 'status'],
    ['Radius', 'Radii', 'radius'],
    // Multi-word: only the last word changes
    ['Data Analysis', 'Data Analyses', 'last word of a spaced name'],
    ['Contact Person', 'Contact People', 'irregular last word'],
    ['AI Model', 'AI Models', 'acronym head kept'],
    ['user_profile', 'user_profiles', 'underscore separator'],
    ['ClusterAnalysis', 'ClusterAnalyses', 'PascalCase tail'],
    ['userProfile', 'userProfiles', 'camelCase tail'],
    // Acronyms take a lowercase s
    ['API', 'APIs', 'acronym'],
    ['URL', 'URLs', 'acronym'],
    ['ID', 'IDs', 'two-letter acronym'],
    ['API Key', 'API Keys', 'acronym head, word tail'],
    ['SMS', 'SMS', 'acronym ending in S is left as is'],
    ['PERSON', 'PEOPLE', 'all-caps irregular keeps its case'],
    // Edge cases
    ['', '', 'empty'],
];

describe('GeneratePluralName — rules', () => {
    it.each(RULES)('%s -> %s (%s)', (input, expected) => {
        expect(GeneratePluralName(input)).toBe(expected);
    });
});
