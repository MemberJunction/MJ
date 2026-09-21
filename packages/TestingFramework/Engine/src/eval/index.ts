/**
 * The framework-free evaluation core (test plan §2.1).
 *
 * Everything exported here is a pure function over plain data. Nothing imports the testing engine,
 * so the same logic runs behind `IOracle` wrappers today and would run unchanged behind a bespoke
 * runner if the framework turns out to be a poor fit — which is the documented fallback the rule
 * exists to keep cheap.
 */
export * from './decision';
export * from './matchers';
export * from './expectation';
export * from './wellFormed';
export * from './corpus';
export * from './history';
