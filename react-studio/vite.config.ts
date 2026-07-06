import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: true,
    allowedHosts: true,
    // reach up into the sibling planner/ folder so we can import the REAL
    // themes.json + app.css (single source of truth — the studio never keeps
    // its own copy that could drift from the app).
    fs: { allow: ['..'] },
  },
});
