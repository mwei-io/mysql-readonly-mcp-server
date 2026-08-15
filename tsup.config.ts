// 打包配置：入口打包为带 shebang 的单文件 ESM，便于 node 直接启动
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
