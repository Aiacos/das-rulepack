// Many tests spawn the pipeline's command line: under load a spawn can take longer than vitest's 5 s default, and the suite
// then fails on timeouts that say nothing about the code. One generous limit for all, instead of a limit per slow test.
export default { test: { testTimeout: 60000, hookTimeout: 60000 } };
