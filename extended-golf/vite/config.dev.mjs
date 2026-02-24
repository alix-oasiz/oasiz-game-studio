import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    base: './',
    resolve: {
        alias: {
            'phaser-box2d': path.resolve(__dirname, '../node_modules/phaser-box2d/dist/PhaserBox2D.js')
        }
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
    },
    server: {
        port: 8080
    }
});
