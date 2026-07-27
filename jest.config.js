module.exports = {
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/tests/setupEnv.js'],
    setupFilesAfterEnv: ['<rootDir>/tests/setupRedis.js'],
    globalSetup: '<rootDir>/tests/globalSetup.js',
    globalTeardown: '<rootDir>/tests/globalTeardown.js',
    testMatch: ['<rootDir>/tests/**/*.test.js'],

    // The suite shares one database, so files must not run concurrently.
    maxWorkers: 1,

    testTimeout: 20_000,
    collectCoverageFrom: ['src/**/*.js'],
    // Surface anything that keeps the event loop alive after the run.
    detectOpenHandles: true,
};
