import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages（プロジェクトサイト）で公開するため base をリポジトリ名に合わせる。
// ローカルでも問題なく動作する。
export default defineConfig({
  plugins: [react()],
  base: '/zaitaku-rx-adjuster/',
});
