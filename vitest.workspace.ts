/**
 * Root Vitest workspace — `npm test` (`vitest run`) runs every package's suite
 * from the repo root, which is the single test command the constitution names.
 */
export default ['packages/shared', 'packages/server', 'packages/web'];
