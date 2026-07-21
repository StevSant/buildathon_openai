// @pulso/adapters — concrete implementations of the @pulso/core ports. Consumers
// import from "@pulso/adapters"; composition roots (Edge Functions, app lib) pick
// the adapters they need and inject them into the use-cases.
export * from './identity';
export * from './ai';
export * from './persistence';
export * from './messaging';
