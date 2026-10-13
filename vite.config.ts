import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cp } from 'node:fs/promises';
export default defineConfig({ plugins: [react(), { name: 'copy-welding-knowledge', async closeBundle() { await cp('knowledge', 'dist/knowledge', { recursive: true }); } }] });
