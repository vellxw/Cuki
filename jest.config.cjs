module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/mobile/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/apps/mobile/android/', '/apps/mobile/ios/'],
  setupFilesAfterEnv: ['<rootDir>/tests/mobile/setup.ts'],
  clearMocks: true,
  reporters: ['default','<rootDir>/scripts/jest-evidence.cjs'],
  testTimeout: 15000,
};
