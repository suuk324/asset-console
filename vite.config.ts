import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        desktop: resolve(rootDir, 'index.html'),
        mobile: resolve(rootDir, 'mobile.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/examples/jsm/loaders/3DMLoader.js')) {
            return 'three-rhino-loader'
          }
          if (id.includes('node_modules/three/examples/jsm/controls/OrbitControls.js')) {
            return 'three-orbit-controls'
          }
          if (id.includes('node_modules/three/examples/jsm')) {
            return 'three-extras'
          }
          if (id.includes('node_modules/three/src/renderers/')) {
            return 'three-renderer'
          }
          if (id.includes('node_modules/three/src/animation/')) {
            return 'three-animation'
          }
          if (id.includes('node_modules/three/src/extras/')) {
            return 'three-extras-core'
          }
          if (id.includes('node_modules/three/src/math/')) {
            return 'three-math'
          }
          if (id.includes('node_modules/three/src/constants.js')) {
            return 'three-foundation'
          }
          if (id.includes('node_modules/three/src/utils.js')) {
            return 'three-foundation'
          }
          if (id.includes('node_modules/three/src/Three.Core.js')) {
            return 'three-foundation'
          }
          if (
            id.includes('node_modules/three/src/core/') ||
            id.includes('node_modules/three/src/cameras/') ||
            id.includes('node_modules/three/src/scenes/') ||
            id.includes('node_modules/three/src/lights/') ||
            id.includes('node_modules/three/src/helpers/')
          ) {
            return 'three-scene'
          }
          if (
            id.includes('node_modules/three/src/objects/') ||
            id.includes('node_modules/three/src/geometries/')
          ) {
            return 'three-objects'
          }
          if (id.includes('node_modules/three/src/materials/')) {
            return 'three-materials'
          }
          if (id.includes('node_modules/three/src/textures/')) {
            return 'three-textures'
          }
          if (id.includes('node_modules/three')) {
            return 'three-core'
          }
          return undefined
        },
      },
    },
  },
  plugins: [react()],
})
