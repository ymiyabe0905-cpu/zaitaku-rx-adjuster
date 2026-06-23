// public/icon.svg から iOS/PWA 用の PNG アイコンを生成する一回限りのスクリプト。
// 実行: node scripts/gen-icon.mjs（sharp が必要）
import sharp from 'sharp';

const svg = 'public/icon.svg';
const bg = '#4a90e8'; // 透明部分を塗りつぶす（iOSは不透明アイコンを推奨）

const targets = [
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
];

for (const t of targets) {
  await sharp(svg)
    .resize(t.size, t.size)
    .flatten({ background: bg })
    .png()
    .toFile(t.file);
  console.log('generated', t.file);
}
