import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/degiro-portfolio.js', import.meta.url));
const input = fileURLToPath(new URL('../examples/transactions.csv', import.meta.url));
const reference = fileURLToPath(new URL('../examples/expected-quantities.csv', import.meta.url));

/** @param {readonly string[]} args @returns {import('node:child_process').SpawnSyncReturns<string>} */
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('CLI exposes help, version and argument errors without writing files', () => {
  assert.equal(run(['--help']).status, 0);
  assert.match(run(['--help']).stdout, /Použití/u);
  assert.equal(run(['--version']).stdout.trim(), '1.1.0');
  assert.equal(run([]).status, 1);
  assert.equal(run(['--unknown']).status, 1);
});

test('CLI verifies before writing, requires explicit overwrite, and protects inputs and aliases', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'degiro-portfolio-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'portfolio.csv');
  const args = ['--input', input, '--output', output, '--verify', reference];
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /5 názvů produktů, 4 ISIN/u);
  const expected = await readFile(new URL('../examples/portfolio.csv', import.meta.url), 'utf8');
  assert.equal((await readFile(output, 'utf8')).replaceAll('\r\n', '\n'), expected);
  assert.equal(run(args).status, 1);
  assert.equal(run([...args, '--force']).status, 0);

  const brokenReference = join(directory, 'broken-reference.csv');
  await writeFile(brokenReference, 'Product,Quantity\nDemo Equity,999\n');
  const invalidResult = run(['-i', input, '-o', output, '--verify', brokenReference, '--force']);
  assert.equal(invalidResult.status, 1);
  assert.match(invalidResult.stderr, /mismatch/u);
  assert.equal((await readFile(output, 'utf8')).replaceAll('\r\n', '\n'), expected);

  const alias = join(directory, 'input-alias.csv');
  await symlink(input, alias);
  for (const destination of [input, alias, reference]) {
    const protectedResult = run(['-i', input, '-o', destination, '--verify', reference, '--force']);
    assert.equal(protectedResult.status, 1);
    assert.match(protectedResult.stderr, /must not overwrite/u);
  }
  const localInput = join(directory, 'input.csv');
  await writeFile(localInput, await readFile(input));
  const hardLink = join(directory, 'hard-link.csv');
  await link(localInput, hardLink);
  assert.match(run(['-i', localInput, '-o', hardLink, '--force']).stderr, /must not overwrite/u);
  assert.equal(run(['-i', join(directory, 'missing.csv'), '-o', output]).status, 1);
});
