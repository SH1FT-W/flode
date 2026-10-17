// Writes .gate/gate-<commit>.json from the steps gate.sh ran (.gate/steps.txt: name, status,
// seconds, log per line) and their step-<name>.json: the status of every step, the result
// of every test in it (ok / failed / flaky / new / changed, with its log) and the list of
// flaky tests. Only `failed` is red; a flaky test is listed so a pattern shows up.
//   node dev/gate/summary.mjs --commit abc1234 --clean true --only "" --restart 1 --seconds 180
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.gate');
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg, index, all) => (arg.startsWith('--') ? [arg.slice(2), all[index + 1] ?? ''] : null))
    .filter(Boolean)
);

const steps = {};
const stepsFile = path.join(OUT_DIR, 'steps.txt');
const lines = fs.existsSync(stepsFile)
  ? fs.readFileSync(stepsFile, 'utf8').split('\n').filter(Boolean)
  : [];
for (const line of lines) {
  const [name, status, seconds, log] = line.split('|');
  const file = path.join(OUT_DIR, `step-${name}.json`);
  const detail = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  steps[name] = {
    status,
    seconds: Number(seconds),
    ...(log ? { log } : {}),
    tests: detail.tests ?? [],
    ...(detail.review?.length ? { review: detail.review } : {}),
  };
}

const flaky = Object.entries(steps).flatMap(([name, step]) =>
  step.tests.filter((test) => test.status === 'flaky').map((test) => `${name}: ${test.name}`)
);
const ok = Object.values(steps).every((step) => step.status === 'ok');
const clean = args.clean === 'true';
// A gate only counts for a release when it ran in full, on a clean tree, with the HA restarted.
const counts = ok && !args.only && args.restart === '1' && clean;

const result = {
  commit: args.commit,
  clean,
  ok,
  counts_for_release: counts,
  only: args.only ?? '',
  date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  seconds: Number(args.seconds ?? 0),
  steps,
  flaky,
};
fs.writeFileSync(
  path.join(OUT_DIR, `gate-${args.commit}.json`),
  `${JSON.stringify(result, null, 2)}\n`
);

/** "12 ok, 1 flaky" — the statuses that occur among `tests`, in a fixed order. */
function tally(tests) {
  return ['ok', 'failed', 'flaky', 'new', 'changed']
    .map((status) => [status, tests.filter((test) => test.status === status).length])
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');
}

for (const [name, step] of Object.entries(steps))
  console.log(
    `  ${step.status === 'ok' ? '✓' : '✗'} ${name.padEnd(10)} ${step.seconds} s${step.tests.length > 0 ? ` · ${step.tests.length} tests: ${tally(step.tests)}` : ''}`
  );
const counted = Object.values(steps).flatMap((step) => step.tests);
console.log(`  ${counted.length} tests in all: ${tally(counted) || 'none'}`);
for (const name of flaky) console.log(`  ~ flaky (green on the second try, not red): ${name}`);
process.exit(ok ? 0 : 1);
