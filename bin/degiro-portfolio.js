#!/usr/bin/env node
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { calculatePortfolio, createPortfolioCsv, parseTransactions, verifyQuantities } from '../src/index.js';
import { compare, ZERO } from '../src/decimal.js';

const HELP = `Použití:
  node bin/degiro-portfolio.js --input Transactions.csv --output portfolio.csv [volby]

Volby:
  -i, --input <soubor>     Anglický export DEGIRO Transactions v CSV.
  -o, --output <soubor>    Výstupní CSV s počty a pořizovací hodnotou v EUR.
      --verify <soubor>   Ověření počtů proti CSV se sloupci Product,Quantity.
      --include-closed    Zahrnout i nulové pozice (seskupené podle ISIN).
      --force             Povolit přepsání existujícího výstupu.
  -h, --help              Zobrazit nápovědu.
  -v, --version           Zobrazit verzi.

Pořizovací hodnota používá vážený průměr a Total EUR včetně poplatků.
Výstup neobsahuje aktuální tržní ceny. Vstup musí zahrnovat celou historii.
`;

/**
 * Prevent overwriting inputs even through symbolic links or hard links.
 * @param {string} output
 * @param {readonly string[]} inputs
 * @returns {Promise<void>}
 */
async function protectInputs(output, inputs) {
  let outputStat;
  try {
    outputStat = await stat(output);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
  }
  for (const input of inputs) {
    const inputStat = await stat(input);
    if (resolve(output) === await realpath(input)
      || (outputStat && inputStat.dev === outputStat.dev && inputStat.ino === outputStat.ino)) {
      throw new Error('Output must not overwrite the input or reference file.');
    }
  }
}

/** @returns {Promise<void>} */
async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      verify: { type: 'string' },
      'include-closed': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${metadata.version}\n`);
    return;
  }
  if (!values.input || !values.output) throw new Error('Both --input and --output are required. See --help.');
  const inputs = [values.input, ...(values.verify ? [values.verify] : [])];
  await protectInputs(values.output, inputs);
  const transactions = parseTransactions(await readFile(values.input, 'utf8'));
  const portfolio = calculatePortfolio(transactions);
  if (values.verify) {
    const verified = verifyQuantities(transactions, portfolio, await readFile(values.verify, 'utf8'));
    process.stderr.write(`Ověřeno: ${verified.productCount} názvů produktů, ${verified.isinCount} ISIN.\n`);
  }
  const csv = createPortfolioCsv(portfolio, { includeClosed: values['include-closed'] });
  await writeFile(values.output, csv, { encoding: 'utf8', flag: values.force ? 'w' : 'wx' });
  const openCount = portfolio.positions.filter((position) => compare(position.quantity, ZERO) !== 0).length;
  process.stderr.write(`Zapsáno: ${values.output}; otevřené pozice: ${openCount}; stav k ${portfolio.asOf}; administrativní převody: ${portfolio.corporateActionCount}.\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Chyba: ${message}\n`);
  process.exitCode = 1;
}
