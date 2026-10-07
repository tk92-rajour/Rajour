// Starter backend (tsx watch) og frontend (Vite) samtidig til lokal udvikling.
import { spawn } from 'node:child_process';

const procs = [
  ['server', 'npx', ['tsx', 'watch', '--env-file-if-exists=.env', 'server/index.ts']],
  ['web', 'npx', ['vite']],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    console.log(`[${name}] stoppede (kode ${code})`);
    procs.forEach((o) => o.kill());
    process.exit(code ?? 0);
  });
  return p;
});

process.on('SIGINT', () => procs.forEach((p) => p.kill()));
