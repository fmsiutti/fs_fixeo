#!/usr/bin/env node
// Hook PostToolUse: formatea con Prettier el archivo que Claude acaba de editar.
// Nunca bloquea: si Prettier no está instalado todavía (proyecto sin bootstrap) o falla, sale en silencio.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

const FORMATEABLES = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.md', '.yml', '.yaml']);

let entrada = '';
process.stdin.setEncoding('utf8');
for await (const trozo of process.stdin) entrada += trozo;

try {
  const archivo = JSON.parse(entrada)?.tool_input?.file_path;
  if (!archivo || !existsSync(archivo)) process.exit(0);
  if (!FORMATEABLES.has(extname(archivo))) process.exit(0);
  if (archivo.includes('/node_modules/') || archivo.includes('/prisma/migrations/')) process.exit(0);

  execFileSync('pnpm', ['exec', 'prettier', '--write', '--log-level', 'silent', archivo], {
    cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    stdio: 'ignore',
    timeout: 15000,
  });
} catch {
  // Silencioso a propósito: el formateo es una comodidad, no una compuerta.
}
process.exit(0);
