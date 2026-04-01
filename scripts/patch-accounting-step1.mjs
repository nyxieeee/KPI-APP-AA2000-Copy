import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'dashboards', 'departments', 'AccountingDashboard.tsx');
const snippet = path.join(__dirname, 'accounting-step1-snippet.txt');

const raw = fs.readFileSync(target, 'utf8');
const lines = raw.split(/\r?\n/);
const newLines = fs.readFileSync(snippet, 'utf8').split(/\r?\n/);

const out = [...lines.slice(0, 940), ...newLines, ...lines.slice(2430)];
fs.writeFileSync(target, out.join('\n'), 'utf8');
console.log('patched', lines.length, '->', out.length);
