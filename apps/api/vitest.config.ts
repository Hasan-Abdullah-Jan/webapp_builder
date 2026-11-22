import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 180_000, // first run downloads a mongod binary
    fileParallelism: false,
    env: { NODE_ENV: 'test', ROOT_DOMAIN: 'localhost', STOREFRONT_REVALIDATE_URL: '', JWT_SECRET: 'test-secret-test-secret-test-secret-1234', MONGODB_URI: 'mongodb://placeholder' },
  },
});
