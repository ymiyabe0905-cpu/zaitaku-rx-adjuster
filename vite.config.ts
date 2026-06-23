import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ローカル試作用の最小設定。base を相対パスにしておくと、
// dist/ をそのままファイルとして開いても崩れにくい。
export default defineConfig({
  plugins: [react()],
  base: './',
});
