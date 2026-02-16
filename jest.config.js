/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/types/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testPathIgnorePatterns: ['/node_modules/', '/src/types/test.ts', '/src/cli/commands/test.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!chalk|ansi-styles|supports-color|has-flag|color-convert|color-name)'
  ],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  modulePaths: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.\\./utils/logger)\\.js$': '$1.ts',
    '^(\\./logger)\\.js$': '$1.ts',
    '^(\\.\\./types/config)\\.js$': '$1.ts',
    '^(\\.\\./types/.+)\\.js$': '$1.ts',
    '^(\\./schema)\\.js$': '$1.ts',
    '^(\\.\\./config/server-schema)\\.js$': '$1.ts'
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json'
      }
    ]
  }
}