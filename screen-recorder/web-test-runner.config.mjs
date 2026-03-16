import { playwrightLauncher } from '@web/test-runner-playwright';
import { esbuildPlugin } from '@web/dev-server-esbuild';

export default {
  files: ['frontend/test/**/*.test.js'],
  nodeResolve: true,
  plugins: [esbuildPlugin({ ts: true })],
  browsers: [playwrightLauncher({ product: 'chromium' })],
  testFramework: {
    config: {
      ui: 'bdd',
      timeout: 10000
    }
  }
};
