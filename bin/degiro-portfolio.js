#!/usr/bin/env node
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createPortfolioReport } from '../src/index.js';

const HELP = `Použití:
  node bin/degiro-portfolio.js --input Transactions.csv --output portfolio.xlsx [volby]

Volby:
  -i, --input <soubor>     Anglický export DEGIRO Transactions v CSV.
  -o, --output <soubor>    Výstupní XLSX dashboard (.xlsx), případně původní CSV (.csv).
      --verify <soubor>   Ověření počtů proti CSV se sloupci Product,Quantity.
      --include-closed    Zahrnout i nulové pozice bez peněžních toků (podle ISIN).
      --force             Povolit přepsání existujícího výstupu.
  -h, --help              Zobrazit nápovědu.
  -v, --version           Zobrazit verzi.

Pořizovací hodnota používá vážený průměr a Total EUR včetně poplatků.
Celkové náklady a příjmy zahrnují skutečné obchody za celou historii ISIN.
Výsledný peněžní stav je příjem z prodejů po poplatcích minus náklady nákupů.
Uzavřené pozice s nenulovými náklady nebo příjmy se zahrnují automaticky.
XLSX má editovatelné tickery a aktuální ceny v EUR; hodnoty dopočítají vzorce.
Total Cost v XLSX znamená celkové nákupy minus příjmy z prodejů.
Chybějící ocenění se zobrazí jako n.a. Vstup musí zahrnovat celou historii.
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
  const transactionsCsv = await readFile(values.input, 'utf8');
  const expectedQuantitiesCsv = values.verify ? await readFile(values.verify, 'utf8') : undefined;
  const report = createPortfolioReport(transactionsCsv, {
    format: /** @type {'csv' | 'xlsx'} */ (extname(values.output).slice(1).toLowerCase()),
    includeClosed: values['include-closed'],
    expectedQuantitiesCsv,
  });
  if (report.verification) {
    const verified = report.verification;
    process.stderr.write(`Ověřeno: ${verified.productCount} názvů produktů, ${verified.isinCount} ISIN.\n`);
  }
  await writeFile(values.output, report.xlsx ?? report.csv, { encoding: 'utf8', flag: values.force ? 'w' : 'wx' });
  if (report.xlsx) process.stderr.write('V XLSX doplň tickery a aktuální ceny v EUR; ostatní tržní hodnoty dopočítají vzorce.\n');
  process.stderr.write(`Zapsáno: ${values.output}; otevřené pozice: ${report.openPositionCount}; stav k ${report.portfolio.asOf}; administrativní převody: ${report.portfolio.corporateActionCount}.\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Chyba: ${message}\n`);
  process.exitCode = 1;
}
