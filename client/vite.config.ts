import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// host: true exposes the dev server on your LAN so a phone on the same Wi-Fi can open it.
// allowedHosts: true lets a tunnel (cloudflared/ngrok) share the demo with judges.
// The proxy keeps API calls same-origin, so the phone never needs to know the API's address.
const api = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
export default defineConfig({
  plugins: [react()],
  server: { host: true, allowedHosts: true, proxy: { '/api': api, '/health': api } },
  preview: { host: true, allowedHosts: true, proxy: { '/api': api, '/health': api } }
});
