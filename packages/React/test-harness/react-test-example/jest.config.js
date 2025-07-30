module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'jsx'],
  testMatch: [
    '**/*.test.js',
    '**/*.test.jsx'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};