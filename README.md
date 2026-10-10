# DEGIRO Portfolio

Skript pro **Node.js 24.21.0**, který z anglického CSV exportu DEGIRO **Transactions** vytvoří přehled pozic, jejich celkových nákladů, čistých příjmů z prodejů a výsledného peněžního stavu v EUR. Součástí je i pořizovací hodnota dosud držených kusů. Nemá žádné externí runtime ani vývojové závislosti. Používá ES moduly, JSDoc a vestavěný testovací framework Node.js.

„Za kolik“ zde znamená **pořizovací hodnotu zbývajících kusů včetně nákupních poplatků**, počítanou metodou průběžného váženého průměru. Export transakcí neobsahuje aktuální tržní ceny. Výstup proto není aktuálním tržním oceněním ani výpisem hotovosti.

**Celkové náklady a příjmy** se sčítají za celou dodanou historii každého ISIN, včetně již prodaných kusů. **Výsledný peněžní stav = celkové příjmy − celkové náklady.** U plně uzavřené pozice jde o zisk nebo ztrátu z těchto obchodů po poplatcích. U otevřené pozice jde o dosavadní peněžní tok; část prostředků je stále investována do držených akcií a jejich současná tržní hodnota v tomto rozdílu není zahrnuta.

## Spuštění

Stačí Node.js 24.21.0; `npm install` není potřeba.

```sh
node --version
node bin/degiro-portfolio.js \
  --input /cesta/Transactions-en.csv \
  --output /cesta/portfolio.csv
```

Případně přes npm:

```sh
npm start -- --input /cesta/Transactions-en.csv --output /cesta/portfolio.csv
```

Adresář výstupu musí existovat. Skript standardně odmítne přepsat existující soubor. K přepsání použij `--force`; vstupní ani referenční soubor přepsat nelze, včetně jejich symbolických a pevných odkazů.

### Vyzkoušení na přiložených datech

Adresář `examples/` obsahuje pouze umělá demonstrační data, včetně splitu, přejmenování, prodeje části pozice a opakovaných dílčích plnění.

```sh
node bin/degiro-portfolio.js \
  --input examples/transactions.csv \
  --output demo-portfolio.csv \
  --verify examples/expected-quantities.csv
```

Očekávaný výsledek je v [examples/portfolio.csv](examples/portfolio.csv). Při opakovaném spuštění přidej `--force` nebo změň jméno výstupu.

### Volby

| Volba | Význam |
| --- | --- |
| `-i`, `--input <soubor>` | Povinná cesta k CSV exportu Transactions. |
| `-o`, `--output <soubor>` | Povinná cesta k výstupnímu CSV. |
| `--verify <soubor>` | Před zápisem ověří počty proti referenčnímu CSV. |
| `--include-closed` | Zahrne i nulové pozice bez nákladů a příjmů, stále jeden řádek na ISIN. |
| `--force` | Povolí přepsání existujícího výstupu. |
| `-h`, `--help` | Česká nápověda. |
| `-v`, `--version` | Verze programu. |

Průběh a chyby se vypisují na standardní chybový výstup. Návratový kód `0` znamená úspěch, `1` chybu. Při neplatném vstupu nebo neúspěšném ověření se výstup nezapisuje.

## Vstup

Podporovaný formát je anglický export DEGIRO s oddělovačem čárkou, např.:

```csv
Date,Time,Product,ISIN,Reference exchange,Venue,Quantity,Price,,Local value,,Value EUR,Exchange rate,AutoFX Fee,Transaction and/or third party fees EUR,Total EUR,Order ID
```

Povinné sloupce jsou `Date`, `Time`, `Product`, `ISIN`, `Venue`, `Quantity`, `Value EUR` a `Total EUR`. Vyhledávají se podle názvu, takže na jejich pořadí nezáleží. Ostatní sloupce se ignorují; prázdné názvy měnových sloupců jsou povoleny.

- Kódování UTF-8, volitelný BOM; konce řádků LF, CRLF nebo CR.
- Uvozovky, čárky a víceřádkové názvy produktů podle pravidel CSV; dvojitá uvozovka uvnitř pole se zapisuje jako `""`.
- Datum `DD-MM-YYYY`, čas `HH:mm`. Čas se neinterpretuje v jiném časovém pásmu.
- Čísla v evropském zápisu, např. `"1234,56"`, `"1.234,56"`, `-2`, `"0,5"`. Desetinná tečka ve vstupu Transactions se nepodporuje; tečka je zde oddělovač tisíců.
- Nejvýše 18 desetinných míst a 100 znaků na číslo. Povinné částky nesmějí být prázdné.
- ISIN musí mít odpovídající tvar o 12 znacích; kontrolní číslice se neověřuje.

**Vstup musí obsahovat úplnou historii od nulového stavu účtu.** Soubory se načítají do paměti. Skript je určen pro běžné osobní exporty, nikoliv pro streamové zpracování mnohagigabajtových souborů.

## Výpočet

1. Transakce se seřadí chronologicky a seskupí podle ISIN. Stejný titul obchodovaný na více burzách zůstane jedinou pozicí.
2. Nákup přičte počet kusů, pořizovací hodnotu a celkové historické náklady `−Total EUR`. Tato částka už obsahuje poplatky uvedené brokerem. Poplatky se znovu nepřičítají.
3. Prodej odečte kusy a jejich dosavadní průměrnou pořizovací hodnotu a přičte `Total EUR` k čistým příjmům z prodejů. Prodejní poplatky jsou v této částce již zohledněny. Výnos z prodeje ani prodejní poplatky nemění pořizovací cenu zbývajících kusů.
4. Úplné uzavření pozice vynuluje pořizovací hodnotu zbývajících kusů. Případný nový nákup začíná nový průměr. Celkové náklady i příjmy se zachovají za celou dodanou historii ISIN, i při znovuotevření pozice.
5. U rozpoznaných administrativních převodů se změní množství nebo název při zachování pořizovací hodnoty zbývajících kusů i dosavadních celkových nákladů a příjmů. Jejich účetní částky se do nákladů ani příjmů nepřičítají.
6. Výsledný peněžní stav se vypočte jako součet čistých příjmů z prodejů minus součet nákladů všech skutečných nákupů.

Příklad: nákup 2 kusů za celkem 202 EUR a dalšího kusu za 121 EUR dává 3 kusy za 323 EUR. Po prodeji jednoho kusu zůstávají 2 kusy za `323 × 2 / 3` EUR. Split 1 : 10 změní počet na 20 kusů, ale tuto celkovou hodnotu nezmění. Po následném prodeji 5 kusů zbývá 15 kusů s pořizovací hodnotou 161,50 EUR.

Pokud první prodej přinesl čistých 219 EUR a druhý 99 EUR, `Total costs EUR` bude 323,00 EUR, `Total income EUR` bude 318,00 EUR a `Net cash flow EUR` bude −5,00 EUR. Stále držených 15 kusů má pořizovací hodnotu 161,50 EUR v samostatném sloupci `Cost basis EUR`. Příjem je součet peněžních částek z prodejů po poplatcích; pořizovací hodnota prodaných kusů se od něj neodečítá. Při poplatcích převyšujících cenu prodeje může být příjem záporný.

Při nákupu za 100 EUR a následném úplném prodeji za čistých 120 EUR bude počet kusů 0, celkové náklady 100 EUR, celkové příjmy 120 EUR a výsledný stav +20 EUR. Hodnota zbývajících kusů v `Cost basis EUR` bude 0 EUR.

Přesné zlomky založené na `BigInt` zamezují kumulaci chyb binární desetinné aritmetiky. Peníze se zaokrouhlí na dvě desetinná místa až při zápisu; průměr na kus na šest. Poloviny se zaokrouhlují od nuly. Počet kusů se vypíše přesně, bez zbytečných nul. Kvůli samostatnému zaokrouhlení nemusí vytištěný průměr násobený počtem dát přesně vytištěnou celkovou částku. Výsledný peněžní stav se také počítá z přesných součtů; při vstupních částkách se zlomky centu se může od rozdílu zaokrouhlených nákladů a příjmů lišit o cent.

### Měny a poplatky

Referenční měna je pevně EUR a bere se přímo ze sloupce `Total EUR`. Místní cenu, `Exchange rate` ani `AutoFX Fee` skript znovu nepřepočítává. To je podstatné i pro britské pence GBX a pro historicky zaokrouhlené kurzy: další přepočet by částky změnil. Skutečné součty brokera navíc mohou mít proti součtu jednotlivých zobrazených složek centový rozdíl.

Výpočet nezahrnuje dividendy, hotovost na účtu, úroky, samostatné poplatky mimo Transactions ani daňové úpravy. Realizovaný zisk z prodané části otevřené pozice se samostatně nepočítá. Nejde o daňovou FIFO evidenci.

### Splity, změny názvu a omezení

DEGIRO může administrativní operace zobrazit jako transakce; jejich skutečný důvod bývá uveden ve výpisu účtu. Viz [vysvětlení DEGIRO](https://www.degiro.com/uk/helpdesk/orders/execution-policy/why-was-transaction-executed-without-my-confirmation).

Skript rozpozná převod, pokud pro **stejný ISIN, datum a minutu** existují současně kladné i záporné pohyby, všechny mají prázdné `Venue`, každá má `Value EUR = Total EUR` a součet částek je přesně nulový. Tím pokryje split, reverzní split a přejmenování ve vzorových datech včetně převodů s nenulovými účetními cenami. Zobrazený název se převezme z příchozí strany převodu; jinak z posledního záznamu. Pokud mají souběžné příchozí záznamy více názvů, vybere se lexikograficky poslední.

Toto je pravidlo odvozené z formátu exportu, nikoliv explicitní označení firemní události. Samotné Transactions nedovoluje spolehlivě odlišit všechny administrativní operace od skutečných obchodů. Změny ISIN, fúze, odštěpení společností, převody mezi účty, kompenzace zlomkových akcií či úpravy nabývací ceny mohou vyžadovat výpis účtu a ruční doplnění podkladů. **Pro takovou historii nelze správnou pořizovací hodnotu tímto skriptem zaručit.**

Skript odmítne prodej většího počtu kusů, než je dosud drženo, nepárový nulový peněžní pohyb nenulového počtu kusů a nerozpoznanou kombinaci nákupu a prodeje stejného ISIN v jedné minutě. Pořadí skutečných obchodů v jedné minutě nelze z těchto časů určit. Krátké pozice nejsou podporovány. Chybějící historie, která nevyvolá zápornou pozici, není automaticky zjistitelná.

Shodné řádky ani shodná `Order ID` se **nededuplikují**: mohou představovat samostatná dílčí plnění. Vstup proto nesmí vzniknout prostým sloučením překrývajících se exportů.

## Výstupní CSV

Výstup obsahuje jeden řádek na otevřený ISIN a automaticky také uzavřené pozice s nenulovými celkovými náklady nebo příjmy. Je seřazený podle názvu produktu a ISIN. `--include-closed` přidá ostatní nulové pozice. Historické názvy stejného ISIN nevytvářejí další řádky; náklady a příjmy za všechny jeho názvy se sčítají na jednom řádku.

| Sloupec | Význam |
| --- | --- |
| `Product` | Poslední známý název produktu. |
| `ISIN` | Identifikátor sjednocené pozice. |
| `Quantity` | Zbývající počet kusů, případně desetinný. |
| `Average cost EUR` | Pořizovací hodnota na zbývající kus, 6 desetinných míst. |
| `Cost basis EUR` | Celková pořizovací hodnota zbývajících kusů, 2 desetinná místa. |
| `Total costs EUR` | Součet `−Total EUR` ze všech skutečných nákupů daného ISIN včetně poplatků, 2 desetinná místa. Zachovává se i po úplném prodeji. |
| `Total income EUR` | Součet `Total EUR` ze skutečných prodejů daného ISIN za celou dodanou historii, po poplatcích, 2 desetinná místa. |
| `Net cash flow EUR` | Výsledný peněžní stav: `Total income EUR − Total costs EUR`, 2 desetinná místa. |
| `Currency` | Vždy `EUR`. |
| `As of` | Datum poslední transakce v celém vstupu, `YYYY-MM-DD`. |
| `Cost basis method` | Vždy `weighted-average`. |

CSV používá UTF-8 bez BOM, čárky jako oddělovače, CRLF mezi záznamy a **desetinnou tečku**. V českém tabulkovém editoru při importu zvol čárku a odpovídající anglické číselné nastavení. Názvy produktů začínající znakem vzorce (`=`, `+`, `-`, `@`, případně po mezerách) dostanou ochranný apostrof.

Stav „k datu“ vyjadřuje konec dodané historie; skript neověřuje, zda po tomto datu proběhly další transakce.

## Ověření proti referenčnímu CSV

Referenční soubor má formát:

```csv
Product,Quantity
Demo Equity,0
Demo Renamed,15
Demo Pence,12
Demo Closed,0
Demo Zero,0
```

Obsahuje **všechny názvy** ze vstupu, včetně historických a nulových. Číselný formát reference používá desetinnou tečku. Duplicitní názvy, chybějící řádky, neznámé produkty a nejednoznačný název použitý pro více ISIN jsou chyba.

Ověření má dvě části: porovná součty pohybů jednotlivých názvů s referencí a poté referenci seskupí podle ISIN a porovná s počty ze skutečně vypočteného portfolia. Rozpoznaný split či přejmenování se tedy prověřuje i ve výsledném portfoliu. Reference s počty sama neověřuje ceny; ty pokrývají samostatné testy s ručně vypočtenými hodnotami.

Pro původní vzorové soubory spusť:

```sh
node bin/degiro-portfolio.js \
  --input /Users/walda/Downloads/deg/Transactions-en.csv \
  --output portfolio-verified.csv \
  --verify /Users/walda/Downloads/deg/Transactions-en-outcome.csv
```

Původní exporty nejsou součástí repozitáře. Osobní data a výstupy ukládej do ignorovaných adresářů `private/` nebo `output/`.

## Testy a struktura

```sh
npm test
npm run test:coverage
```

Testy používají jen `node:test`, `node:assert` a další vestavěné moduly. Kontrolují přesnost výpočtů, celkové náklady, příjmy a jejich rozdíl, částečné prodeje, uzavření a znovuotevření, splity, přejmenování, dílčí plnění, desetinná množství, pořadí vstupu, CSV, chybné podklady i CLI. GitHub Actions spouští stejnou sadu na Node.js 24.21.0.

```text
bin/degiro-portfolio.js   CLI a souborové operace
src/csv.js               Čtení a zápis CSV
src/decimal.js           Přesná racionální aritmetika a formátování
src/transactions.js      Validace a normalizace transakcí
src/portfolio.js         Výpočet pozic a pořizovací hodnoty
src/report.js            Formát výstupního portfolia
src/verification.js      Porovnání s referenčními počty
src/portfolio-report.js  Zpracování exportu do přehledu, použitelné mimo CLI
src/index.js             Veřejné funkce
test/                    Automatické testy
examples/                Syntetické příklady
```

Výpočtové funkce nemění předané transakce, neprovádějí I/O a vracejí nové hodnoty. Lokální proměnné parseru a lokální mapy akumulátorů jsou zapouzdřené v jednotlivých funkcích. Typy jsou popsány anglickým JSDoc. Aritmetika vrací objekty s `BigInt`, proto se při použití knihovny mají převádět na text přes formátovací funkce, nikoliv přímo přes `JSON.stringify`.

### Použití jako knihovny

Veřejná funkce `createPortfolioReport(transactionsCsv, options)` provede celý postup: načtení transakcí z textu, výpočet portfolia, volitelné ověření počtů a vytvoření výstupního CSV. Je synchronní, pracuje pouze s předanými daty a neprovádí souborové operace ani výpis do konzole. Načtení a uložení souborů zajišťuje volající aplikace.

```js
import { readFile, writeFile } from 'node:fs/promises';
import { createPortfolioReport } from './src/index.js';

const transactionsCsv = await readFile('transactions.csv', 'utf8');
const expectedQuantitiesCsv = await readFile('expected-quantities.csv', 'utf8');
const report = createPortfolioReport(transactionsCsv, {
  includeClosed: true,
  expectedQuantitiesCsv,
});
await writeFile('portfolio.csv', report.csv, { encoding: 'utf8', flag: 'wx' });
```

Obě volby jsou nepovinné. Bez `expectedQuantitiesCsv` se porovnání s referencí vynechá; dodaný prázdný nebo neplatný referenční text vyvolá chybu. `includeClosed` má výchozí hodnotu `false` a funguje stejně jako volba CLI. Neplatná data nebo nesoulad s referencí vyvolají `Error`, který může volající aplikace zachytit.

Funkce vrací objekt se čtyřmi položkami:

| Položka | Význam |
| --- | --- |
| `csv` | Hotový výstupní CSV text. |
| `portfolio` | Všechny vypočtené pozice včetně nulových, datum stavu a počet administrativních převodů; peněžní hodnoty jsou přesné zlomky s `BigInt`. |
| `verification` | Počet ověřených názvů produktů a ISIN, nebo `null`, pokud reference nebyla zadána. |
| `openPositionCount` | Počet ISIN s nenulovým aktuálním množstvím. |

Vstupní i výstupní typy jsou popsány JSDoc v `src/portfolio-report.js`. Vstupní bod balíčku `src/index.js` exportuje také samostatné funkce `parseTransactions`, `calculatePortfolio`, `verifyQuantities` a `createPortfolioCsv` pro použití jednotlivých kroků.

Balíček má `private: true` a licenci `UNLICENSED`: není připraven k publikaci na npm a není mu bez rozhodnutí vlastníka přidělena open-source licence.
