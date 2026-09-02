import { access, copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sourceDirectory = fileURLToPath(
  new URL('../../docs/media/cast/', import.meta.url),
);
const targetDirectory = fileURLToPath(
  new URL('../public/cast/', import.meta.url),
);
const checkOnly = process.argv.includes('--check');

async function pngNames(directory) {
  try {
    await access(directory, constants.R_OK);
    return (await readdir(directory))
      .filter((name) => name.endsWith('.png'))
      .sort();
  } catch {
    return [];
  }
}

const sourceNames = await pngNames(sourceDirectory);
if (sourceNames.length === 0) {
  throw new Error(`No source cast artwork found in ${sourceDirectory}.`);
}

if (checkOnly) {
  const targetNames = await pngNames(targetDirectory);
  const sameNames = sourceNames.join('\n') === targetNames.join('\n');
  let sameContents = sameNames;
  if (sameNames) {
    for (const name of sourceNames) {
      const source = await readFile(`${sourceDirectory}/${name}`);
      const target = await readFile(`${targetDirectory}/${name}`);
      if (!source.equals(target)) {
        sameContents = false;
        break;
      }
    }
  }
  if (!sameContents) {
    console.error('Cast artwork is out of sync. Run npm run assets:sync.');
    process.exitCode = 1;
  }
} else {
  await mkdir(targetDirectory, { recursive: true });
  await Promise.all(
    sourceNames.map((name) =>
      copyFile(`${sourceDirectory}/${name}`, `${targetDirectory}/${name}`),
    ),
  );
  console.log(`Synced ${sourceNames.length} cast assets.`);
}
