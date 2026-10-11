#!/usr/bin/env node
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createPortfolioReport, parseTickerMappings } from '../src/index.js';

const HELP = `Použití:
  node bin/degiro-portfolio.js --input Transactions.csv --output portfolio.xlsx [volby]

Volby:
  -i, --input <soubor>     Anglický export DEGIRO Transactions v CSV.
  -o, --output <soubor>    Výstupní XLSX dashboard (.xlsx), případně původní CSV (.csv).
      --verify <soubor>   Ověření počtů proti CSV se sloupci Product,Quantity.
      --tickers <soubor>  Převodní CSV (ISIN,Ticker) nebo JSON s vybranými tickery.
      --price-source <zdroj>  googlefinance (výchozí) nebo manual; pouze XLSX.
      --include-closed    Zahrnout i nulové pozice bez peněžních toků (podle ISIN).
      --force             Povolit přepsání existujícího výstupu.
  -h, --help              Zobrazit nápovědu.
  -v, --version           Zobrazit verzi.

Pořizovací hodnota používá vážený průměr a Total EUR včetně poplatků.
Celkové náklady a příjmy zahrnují skutečné obchody za celou historii ISIN.
Výsledný peněžní stav je příjem z prodejů po poplatcích minus náklady nákupů.
Uzavřené pozice s nenulovými náklady nebo příjmy se zahrnují automaticky.
XLSX načítá ceny a kurzy přes GOOGLEFINANCE až po převodu do Google Sheets.
Pro Excel použij --price-source manual a doplň aktuální ceny v EUR ručně.
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
      throw new Error('Output must not overwrite the input, reference or ticker mapping file.');
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
      tickers: { type: 'string' },
      'price-source': { type: 'string' },
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
  if (values.tickers !== undefined && !values.tickers) throw new Error('--tickers requires a non-empty file path.');
  const inputs = [values.input, values.verify, values.tickers].filter((value) => value !== undefined);
  await protectInputs(values.output, inputs);
  const transactionsCsv = await readFile(values.input, 'utf8');
  const expectedQuantitiesCsv = values.verify ? await readFile(values.verify, 'utf8') : undefined;
  const tickerMappings = values.tickers ? parseTickerMappings(await readFile(values.tickers, 'utf8'), {
    format: /** @type {'csv' | 'json'} */ (extname(values.tickers).slice(1).toLowerCase()),
  }) : undefined;
  const report = createPortfolioReport(transactionsCsv, {
    format: /** @type {'csv' | 'xlsx'} */ (extname(values.output).slice(1).toLowerCase()),
    includeClosed: values['include-closed'],
    expectedQuantitiesCsv,
    tickerMappings,
    priceSource: /** @type {import('../src/googlefinance.js').PriceSource | undefined} */ (values['price-source']),
  });
  if (report.verification) {
    const verified = report.verification;
    process.stderr.write(`Ověřeno: ${verified.productCount} názvů produktů, ${verified.isinCount} ISIN.\n`);
  }
  await writeFile(values.output, report.xlsx ?? report.csv, { encoding: 'utf8', flag: values.force ? 'w' : 'wx' });
  if (report.tickerCoverage) {
    const { mappedPositionCount, unmappedIsins } = report.tickerCoverage;
    process.stderr.write(`Tickery: ${mappedPositionCount} vyplněných pozic; bez mapování: ${unmappedIsins.length}.\n`);
    if (unmappedIsins.length) process.stderr.write(`Chybějící tickery (ISIN): ${unmappedIsins.join(', ')}.\n`);
  }
  if (report.xlsx) process.stderr.write(values['price-source'] === 'manual'
    ? 'V XLSX doplň chybějící tickery a aktuální ceny v EUR; tržní hodnoty dopočítají vzorce.\n'
    : 'Převeď XLSX do Google Sheets a doplň chybějící tickery ve sloupci C; GOOGLEFINANCE načte ceny a kurzy do EUR. V Excelu tento zdroj nefunguje.\n');
  process.stderr.write(`Zapsáno: ${values.output}; otevřené pozice: ${report.openPositionCount}; stav k ${report.portfolio.asOf}; administrativní převody: ${report.portfolio.corporateActionCount}.\n`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Chyba: ${message}\n`);
  process.exitCode = 1;
}
