const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  reporter: 'list',
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    hasTouch: true,
    viewport: { width: 1440, height: 1000 }
  },
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30000
  }
});
