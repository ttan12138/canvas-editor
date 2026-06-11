import { defineConfig } from 'vite'
import typescript from '@rollup/plugin-typescript'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import legacy from '@vitejs/plugin-legacy'
import * as path from 'path'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const name = 'canvas-editor'
  const resolve = {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url))
    }
  }
  const test = {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    css: false,
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/editor/**'],
      exclude: [
        'src/editor/interface/**',
        'src/editor/dataset/constant/**',
        'src/editor/dataset/enum/**',
        'src/editor/core/draw/particle/latex/utils/symbols.ts',
        'src/editor/core/draw/particle/latex/utils/hershey.ts'
      ]
    }
  }
  if (mode === 'lib') {
    return {
      resolve,
      test,
      plugins: [
        cssInjectedByJsPlugin({
          styleId: `${name}-style`,
          topExecutionPriority: true
        }),
        {
          ...typescript({
            tsconfig: './tsconfig.json',
            include: ['./src/editor/**'],
            outDir: 'lib'
          }),
          apply: 'build',
          declaration: true,
          declarationDir: 'lib/types/',
          rootDir: '/'
        }
      ],
      build: {
        outDir: 'lib',
        lib: {
          name,
          fileName: name,
          entry: path.resolve(__dirname, 'src/editor/index.ts')
        },
        sourcemap: true,
        target: 'es2015'
      }
    }
  }
  return {
    resolve,
    test,
    base: `/${name}/`,
    server: {
      host: '0.0.0.0',
      port: 3000
    },
    plugins: [
      legacy({
        targets: ['ie >= 11', 'chrome 52', 'Android 4.1', 'iOS 7.1'],
        renderModernChunks: true,
        additionalLegacyPolyfills: [
          'regenerator-runtime/runtime',
          'core-js/stable'
        ]
      })
    ],
    build: {
      outDir: 'build',
      target: ['es2015', 'chrome52'],
      minify: 'terser'
    }
  }
})
