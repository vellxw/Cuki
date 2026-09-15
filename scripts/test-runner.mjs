import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export function discover(directory) {
  if (!existsSync(directory)) throw new Error(`Falta la suite obligatoria: ${directory}`);
  const files = readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? discoverOptional(path) : /\.test\.(?:ts|tsx|mjs)$/.test(entry.name) ? [path] : [];
  }).sort();
  if (!files.length) throw new Error(`La suite está vacía: ${directory}`);
  return files;
}
function discoverOptional(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const next = resolve(path, entry.name);
    return entry.isDirectory() ? discoverOptional(next) : /\.test\.(?:ts|tsx|mjs)$/.test(entry.name) ? [next] : [];
  });
}
export function parseSummary(output) {
  const result = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = [...output.matchAll(new RegExp(`^# ${key} (\\d+)\\s*$`, 'gm'))].at(-1);
    if (!match) throw new Error(`El runner no informó ${key}; no hay evidencia completa.`);
    result[key] = Number(match[1]);
  }
  if (result.tests < 1 || result.pass < 1) throw new Error('Se ejecutaron cero pruebas efectivas.');
  if (result.fail || result.cancelled || result.skipped || result.todo) throw new Error('Hay pruebas fallidas, canceladas, omitidas o pendientes.');
  if (result.tests !== result.pass) throw new Error('El total de pruebas no coincide con las aprobadas.');
  return result;
}
export async function runSuite(suite, root = resolve(import.meta.dirname, '..')) {
  if (!['core', 'integration'].includes(suite)) throw new Error(`Suite desconocida: ${suite}`);
  const files = discover(resolve(root, 'tests', suite));
  const reportDir = resolve(root, 'artifacts/verification'); mkdirSync(reportDir, { recursive: true });
  const start = Date.now(); let output = '';
  const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', ...files], {
    cwd: root, env: { ...process.env, NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', value => { output += value; process.stdout.write(value); });
  child.stderr.on('data', value => { output += value; process.stderr.write(value); });
  const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
  const exit = await new Promise((resolveExit, reject) => { child.on('error', reject); child.on('close', (code, signal) => resolveExit({ code, signal })); }).finally(() => clearTimeout(timer));
  const report = { suite, files: files.map(p => relative(root, p)), sourceCommit: process.env.GITHUB_SHA ?? null,
    startedAt: new Date(start).toISOString(), durationMs: Date.now()-start, ...exit, summary: null, passed: false, error: null };
  try {
    if (exit.code !== 0 || exit.signal) throw new Error(`El proceso terminó con ${exit.code ?? exit.signal}.`);
    report.summary = parseSummary(output); report.passed = true;
  } catch (error) { report.error = error.message; }
  writeFileSync(resolve(reportDir, `${suite}.tap`), output);
  writeFileSync(resolve(reportDir, `${suite}.json`), JSON.stringify(report, null, 2)+'\n');
  if (!report.passed) throw new Error(report.error);
  return report;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runSuite(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
