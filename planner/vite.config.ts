import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { roomPlugin } from '../room/server.mjs';

export default defineConfig(({ mode }) => {
  const room = loadEnv(mode, process.cwd(), 'ROOM_');
  return {
    plugins: [svelte(), roomPlugin({ key: room.ROOM_KEY, repository: room.ROOM_REPO, branch: room.ROOM_BRANCH })],
    server: { host: true, allowedHosts: true },
  };
});
