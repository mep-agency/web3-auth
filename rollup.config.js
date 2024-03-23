import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescriptPlugin from 'rollup-plugin-typescript2';
import postCssPlugin from 'rollup-plugin-postcss';
import typescript from 'typescript';
import autoprefixer from 'autoprefixer';

import pkg from './package.json' assert { type: 'json' };

export default {
  input: ['src/index.ts', 'src/back-end.ts', 'src/front-end.ts', 'src/errors.ts'],
  output: [
    {
      dir: './dist/cjs',
      format: 'cjs',
    },
    {
      dir: './dist/esm',
      format: 'es',
    },
  ],
  external: [...Object.keys(pkg.peerDependencies || {})],
  plugins: [
    nodeResolve(),
    commonjs(),
    typescriptPlugin({
      typescript: typescript,
    }),
    postCssPlugin({
      // Extract the CSS into a standalone file.
      extract: 'styles.css',
      // You will have to use CSS Modules.
      modules: {
        generateScopedName: '__web3auth__[local]___[hash:base64:5]',
      },
      plugins: [autoprefixer],
    }),
  ],
};
