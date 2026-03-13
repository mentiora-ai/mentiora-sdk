import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'plugins/openai': 'src/plugins/openai.ts',
    'plugins/langchain': 'src/plugins/langchain.ts',
    'ui/headless': 'src/ui/headless/index.ts',
    'ui/index': 'src/ui/index.ts',
    'ui/themes': 'src/ui/themes/index.ts',
  },
  // Use UI tsconfig for DTS — DOM + JSX is harmless for non-UI entries
  // and avoids duplicated type declarations across separate builds.
  tsconfig: 'tsconfig.ui.json',
  format: ['cjs', 'esm'],
  dts: true,
  external: [
    'openai',
    '@langchain/core',
    '@langchain/core/callbacks/base',
    '@langchain/core/load/serializable',
    '@langchain/core/outputs',
    'react',
    'react-dom',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  clean: true,
});
