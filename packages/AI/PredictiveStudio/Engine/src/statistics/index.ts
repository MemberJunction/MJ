/**
 * @module statistics
 *
 * Barrel for the statistics pre-pass — the measured step the Model Development Agent takes before
 * choosing an architecture. See `./statistics-pass` for the flow and `./gates` for how a component
 * type's inherited `StatisticalGate` rows become an admissibility verdict.
 */

export * from './seams';
export * from './gates';
export * from './statistics-pass';
