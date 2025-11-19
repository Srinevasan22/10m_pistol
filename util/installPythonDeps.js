import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requirementsPath = path.resolve(__dirname, '../python/requirements.txt');

if (!existsSync(requirementsPath)) {
  console.warn('[installPythonDeps] requirements.txt not found, skipping python dependency install.');
  process.exit(0);
}

const pythonCommands = ['python3', 'python'];
let lastErrorCode = 1;

for (const cmd of pythonCommands) {
  const args = ['-m', 'pip', 'install', '--no-cache-dir', '-r', requirementsPath];
  console.log(`[installPythonDeps] Running: ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit' });

  if (result.status === 0) {
    console.log('[installPythonDeps] Python dependencies installed successfully.');
    process.exit(0);
  }

  lastErrorCode = typeof result.status === 'number' ? result.status : 1;
  console.warn(`[installPythonDeps] ${cmd} failed with code ${lastErrorCode}.`);
}

console.error('[installPythonDeps] Unable to install python dependencies. Ensure python3 is available.');
process.exit(lastErrorCode);
