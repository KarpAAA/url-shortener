// Prints the mutation score of a Stryker JSON report as a Markdown table (CI job summary).
import { readFileSync } from 'node:fs';
import process from 'node:process';

const file = process.argv[2];
if (!file) {
  console.error('usage: mutation-summary.mjs <mutation.json>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(file, 'utf8'));
const DETECTED = new Set(['Killed', 'Timeout']);
const VALID = new Set(['Killed', 'Timeout', 'Survived', 'NoCoverage']);

const layers = new Map();
for (const [path, { mutants }] of Object.entries(report.files)) {
  const layer = /\/(domain|application)\//.exec(path)?.[1] ?? 'other';
  const totals = layers.get(layer) ?? { detected: 0, survived: 0, valid: 0 };
  for (const { status } of mutants) {
    if (!VALID.has(status)) continue;
    totals.valid += 1;
    if (DETECTED.has(status)) totals.detected += 1;
    else totals.survived += 1;
  }
  layers.set(layer, totals);
}

const all = [...layers.values()].reduce(
  (sum, t) => ({
    detected: sum.detected + t.detected,
    survived: sum.survived + t.survived,
    valid: sum.valid + t.valid,
  }),
  { detected: 0, survived: 0, valid: 0 },
);

const row = (name, t) =>
  `| ${name} | ${t.valid === 0 ? 'n/a' : ((t.detected / t.valid) * 100).toFixed(2)} % | ${t.detected} | ${t.survived} | ${t.valid} |`;

console.log('### Mutation score\n');
console.log('| Layer | Score | Detected | Survived | Mutants |');
console.log('|---|---|---|---|---|');
for (const [layer, totals] of [...layers].sort()) console.log(row(layer, totals));
console.log(row('**all**', all));
