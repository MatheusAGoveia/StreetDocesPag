import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const directory = new URL('../public/images/', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');
for (const name of await readdir(directory)) {
  if (!name.endsWith('.png')) continue;
  const input = join(directory, name);
  const output = join(directory, name.replace(/\.png$/, '.webp'));
  await sharp(input).resize({ width: name === 'hero.png' ? 1600 : 960, withoutEnlargement: true }).webp({ quality: 82, effort: 6 }).toFile(output);
  console.log(`${name} → ${output}`);
}
