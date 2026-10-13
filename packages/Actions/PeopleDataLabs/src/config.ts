/** Base URL of the People Data Labs v5 API. */
export const PDLAPIEndpoint = 'https://api.peopledatalabs.com/v5';

/** Environment fallback when no Company Integration credential is supplied. Read once at module load. */
export const PDLAPIKey = process.env.PDL_API_KEY || '';

/** PDL recommends a minimum likelihood of 6 for Person Enrichment; below that, matches are guesses. */
export const DefaultMinLikelihood = 6;
