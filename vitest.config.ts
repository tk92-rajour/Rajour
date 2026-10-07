import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    env: { TZ: 'Europe/Copenhagen' },
  },
});
