import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'plugins/openai': 'src/plugins/openai.ts',
    'plugins/langchain': 'src/plugins/langchain.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  external: [
    'openai',
    '@langchain/core',
    '@langchain/core/callbacks/base',
    '@langchain/core/load/serializable',
    '@langchain/core/outputs',
  ],
  clean: true,
});
