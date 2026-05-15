// One-shot icon generator. Reads SOURCE, produces:
//   assets/icon.png  — 256×256 with subtle padding so the mark breathes inside Windows' rounded mask
//   assets/icon.ico  — multi-resolution (16, 24, 32, 48, 64, 128, 256)
// Re-run after editing the source: `node scripts/generate-icons.mjs`.

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, '..', 'dockshift-web', 'static', 'icons', 'icon-multicolor-dark.png');
const ASSETS = resolve(ROOT, 'assets');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const PAD = 0.08;

async function renderAt(size) {
  const inner = Math.round(size * (1 - PAD * 2));
  const offset = Math.round((size - inner) / 2);
  const resized = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: resized, top: offset, left: offset }])
    .png()
    .toBuffer();
}

await mkdir(ASSETS, { recursive: true });

const buffers = await Promise.all(SIZES.map(renderAt));

await writeFile(resolve(ASSETS, 'icon.png'), buffers[SIZES.indexOf(256)]);
const ico = await pngToIco(buffers);
await writeFile(resolve(ASSETS, 'icon.ico'), ico);

console.log(`✓ assets/icon.png (256×256, ${buffers[SIZES.indexOf(256)].length} bytes)`);
console.log(`✓ assets/icon.ico (${SIZES.join(',')}, ${ico.length} bytes)`);
