import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// VITE_BASE: percorso sotto cui il sito è pubblicato (ad esempio «/sito/» nell'ambiente di prova tutto in uno).
export default defineConfig({ plugins: [react()], envDir: '../..', base: process.env.VITE_BASE ?? '/', server: { port: 5173 } });
