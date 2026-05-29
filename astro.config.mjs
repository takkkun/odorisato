// @ts-check
import { defineConfig, envField } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://odorisato.com',
  integrations: [sitemap()],
  env: {
    schema: {
      MICROCMS_SERVICE_DOMAIN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      MICROCMS_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      PUBLIC_WORKER_URL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
});
