import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// Reads secrets into this local process only; neither values nor matching bytes
// are printed. Run after a production build. Never uploads anything.
const root = process.cwd();
const local = parseEnv(
  await readFile(resolve(root, '.env.local'), 'utf8').catch(() => ''),
);
const secrets = Object.entries(local).filter(
  ([name, value]) =>
    /(PASSWORD|SECRET|API_KEY|ENCRYPTION_KEY|ACCESS_TOKEN)$/.test(name) &&
    value.length >= 8,
);
async function files(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = resolve(path, entry.name);
    result.push(...(entry.isDirectory() ? await files(name) : [name]));
  }
  return result;
}
const matches = [];
for (const file of await files(resolve(root, 'dist/client'))) {
  const content = await readFile(file);
  for (const [name, value] of secrets)
    if (content.includes(Buffer.from(value)))
      matches.push({ variable: name, file: file.replace(root + '/', '') });
}
console.log(
  JSON.stringify({
    localSecretVariablesChecked: secrets.length,
    clientBuildLeaks: matches.length,
    locations: matches,
  }),
);
process.exit(matches.length ? 1 : 0);
