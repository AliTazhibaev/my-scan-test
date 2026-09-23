import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Plugin to copy static assets that aren't in public/
function copyStaticAssets() {
  const assetsToCopy = [
    'favicon.svg', 'logo.svg', 'qr-logo.svg',
    'manifest.json', 'robots.txt', 'sitemap.xml', 'CNAME',
    'mbank-qr.jpg', 'bg-dark.png', 'bg-light.png',
    'sw.js', 'service-account.json',
  ];
  return {
    name: 'copy-static-assets',
    writeBundle() {
      const outDir = 'dist';
      assetsToCopy.forEach(file => {
        if (existsSync(file)) {
          copyFileSync(file, join(outDir, file));
        }
      });
      // Copy textures directory recursively
      if (existsSync('textures')) {
        copyDirSync('textures', join(outDir, 'textures'));
      }
    }
  };
}

function copyDirSync(src, dest) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  readdirSync(src).forEach(entry => {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  });
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        admin: resolve(__dirname, 'admin.html'),
        milling: resolve(__dirname, 'milling.html'),
      },
    },
  },
  plugins: [copyStaticAssets()],
  server: {
    port: 3000,
    open: '/index.html',
  },
});
