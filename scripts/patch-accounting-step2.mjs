import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'dashboards', 'departments', 'AccountingDashboard.tsx');
const snippet = path.join(__dirname, 'accounting-step2-snippet.txt');

const raw = fs.readFileSync(target, 'utf8');
const lines = raw.split(/\r?\n/);
const newLines = fs.readFileSync(snippet, 'utf8').split(/\r?\n/);

// Replace lines 1022–1207 (1-based): indices 1021–1206 inclusive
const out = [...lines.slice(0, 1021), ...newLines, ...lines.slice(1207)];
fs.writeFileSync(target, out.join('\n'), 'utf8');
console.log('step2 patched', lines.length, '->', out.length);
