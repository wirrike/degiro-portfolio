# DEGIRO Portfolio

Skript pro **Node.js 24.21.0**, který z anglického CSV exportu DEGIRO **Transactions** vytvoří **XLSX dashboard** s pozicemi, celkovými náklady, příjmy z prodejů a výsledným peněžním stavem v EUR. Podporuje i původní výstup CSV. Součástí je pořizovací hodnota dosud držených kusů. Nemá žádné externí runtime ani vývojové závislosti. Používá ES moduly, JSDoc a vestavěný testovací framework Node.js.

Pořizovací hodnota zbývajících kusů včetně nákupních poplatků se počítá metodou průběžného váženého průměru. Export transakcí neobsahuje aktuální tržní ceny ani tickery. **V XLSX je lze doplnit ručně**; tržní hodnoty, výnosy a alokace se pak dopočítají vzorci. Bez těchto cen se neznámé výsledky zobrazí jako `n.a.`, nikoliv jako nulové ocenění. Výstup není výpisem hotovosti na účtu.

**Celkové náklady a příjmy** se sčítají za celou dodanou historii každého ISIN, včetně již prodaných kusů. **Výsledný peněžní stav = celkové příjmy − celkové náklady.** U plně uzavřené pozice jde o zisk nebo ztrátu z těchto obchodů po poplatcích. U otevřené pozice jde o dosavadní peněžní tok; část prostředků je stále investována do držených akcií a jejich současná tržní hodnota v tomto rozdílu není zahrnuta.

## Spuštění

Stačí Node.js 24.21.0; `npm install` není potřeba.

```sh
node --version
node bin/degiro-portfolio.js \
  --input /cesta/Transactions-en.csv \
  --output /cesta/portfolio.xlsx
```

Případně přes npm:

```sh
npm start -- --input /cesta/Transactions-en.csv --output /cesta/portfolio.xlsx
```

Adresář výstupu musí existovat. Skript standardně odmítne přepsat existující soubor. K přepsání použij `--force`; vstupní ani referenční soubor přepsat nelze, včetně jejich symbolických a pevných odkazů.

### Vyzkoušení na přiložených datech

Adresář `examples/` obsahuje pouze umělá demonstrační data, včetně splitu, přejmenování, prodeje části pozice a opakovaných dílčích plnění.

```sh
node bin/degiro-portfolio.js \
  --input examples/transactions.csv \
  --output demo-portfolio.xlsx \
  --verify examples/expected-quantities.csv
```

Pro původní formát CSV změň příponu výstupu na `.csv`; očekávaný CSV výsledek je v [examples/portfolio.csv](examples/portfolio.csv). Při opakovaném spuštění přidej `--force` nebo změň jméno výstupu.

### Volby

| Volba | Význam |
| --- | --- |
| `-i`, `--input <soubor>` | Povinná cesta k CSV exportu Transactions. |
| `-o`, `--output <soubor>` | Povinná cesta; přípona `.xlsx` vytvoří dashboard, `.csv` původní přehled. Jiné přípony se odmítnou. |
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

Přesné zlomky založené na `BigInt` zamezují kumulaci chyb binární desetinné aritmetiky při zpracování historie. V CSV se peníze zaokrouhlí na dvě desetinná místa až při zápisu; průměr na kus na šest. Poloviny se zaokrouhlují od nuly. Počet kusů se vypíše přesně, bez zbytečných nul. Kvůli samostatnému zaokrouhlení nemusí vytištěný průměr násobený počtem dát přesně vytištěnou celkovou částku. Výsledný peněžní stav se také počítá z přesných součtů; při vstupních částkách se zlomky centu se může od rozdílu zaokrouhlených nákladů a příjmů lišit o cent. Omezení číselné přesnosti XLSX je popsáno níže.

### Měny a poplatky

Referenční měna je pevně EUR a bere se přímo ze sloupce `Total EUR`. Místní cenu, `Exchange rate` ani `AutoFX Fee` skript znovu nepřepočítává. To je podstatné i pro britské pence GBX a pro historicky zaokrouhlené kurzy: další přepočet by částky změnil. Skutečné součty brokera navíc mohou mít proti součtu jednotlivých zobrazených složek centový rozdíl.

Výpočet nezahrnuje dividendy, hotovost na účtu, úroky, samostatné poplatky mimo Transactions ani daňové úpravy. Realizovaný zisk z prodané části otevřené pozice se samostatně nepočítá. Nejde o daňovou FIFO evidenci.

### Splity, změny názvu a omezení

DEGIRO může administrativní operace zobrazit jako transakce; jejich skutečný důvod bývá uveden ve výpisu účtu. Viz [vysvětlení DEGIRO](https://www.degiro.com/uk/helpdesk/orders/execution-policy/why-was-transaction-executed-without-my-confirmation).

Skript rozpozná převod, pokud pro **stejný ISIN, datum a minutu** existují současně kladné i záporné pohyby, všechny mají prázdné `Venue`, každá má `Value EUR = Total EUR` a součet částek je přesně nulový. Tím pokryje split, reverzní split a přejmenování ve vzorových datech včetně převodů s nenulovými účetními cenami. Zobrazený název se převezme z příchozí strany převodu; jinak z posledního záznamu. Pokud mají souběžné příchozí záznamy více názvů, vybere se lexikograficky poslední.

Toto je pravidlo odvozené z formátu exportu, nikoliv explicitní označení firemní události. Samotné Transactions nedovoluje spolehlivě odlišit všechny administrativní operace od skutečných obchodů. Změny ISIN, fúze, odštěpení společností, převody mezi účty, kompenzace zlomkových akcií či úpravy nabývací ceny mohou vyžadovat výpis účtu a ruční doplnění podkladů. **Pro takovou historii nelze správnou pořizovací hodnotu tímto skriptem zaručit.**

Skript odmítne prodej většího počtu kusů, než je dosud drženo, nepárový nulový peněžní pohyb nenulového počtu kusů a nerozpoznanou kombinaci nákupu a prodeje stejného ISIN v jedné minutě. Pořadí skutečných obchodů v jedné minutě nelze z těchto časů určit. Krátké pozice nejsou podporovány. Chybějící historie, která nevyvolá zápornou pozici, není automaticky zjistitelná.

Shodné řádky ani shodná `Order ID` se **nededuplikují**: mohou představovat samostatná dílčí plnění. Vstup proto nesmí vzniknout prostým sloučením překrývajících se exportů.

## Výstup

Výstup obsahuje jeden řádek na otevřený ISIN a automaticky také uzavřené pozice s nenulovými celkovými náklady nebo příjmy. Je seřazený podle názvu produktu a ISIN. `--include-closed` přidá ostatní nulové pozice. Historické názvy stejného ISIN nevytvářejí další řádky; náklady a příjmy za všechny jeho názvy se sčítají na jednom řádku.

### XLSX dashboard

Jeden list `Portfolio` vychází z první verze `v4` dodané šablony: titul vlevo nahoře, šedý blok souhrnů, tyrkysové záhlaví na řádku 5, pozice od řádku 6, zmrazených prvních pět řádků, částky v EUR, barevné zisky/ztráty a grafické pruhy alokace. Historické kopie a starší varianty ze šablony se neduplikují. Vzhled je implementovaný ve skriptu; pro spuštění není potřeba šablonu kopírovat ani předávat.

| Sloupec | Význam |
| --- | --- |
| A `ISIN`, B `Company` | Identifikátor a poslední známý název produktu. |
| C `Ticker(s)` | Ručně doplňovaný text, například burza a ticker. Nemá vliv na výpočty. |
| D `Quantity` | Aktuální počet kusů. |
| E `Bought Price` | Vážená pořizovací cena dosud drženého kusu: `Cost Basis / Quantity`; při nulovém množství 0. |
| F `Total Cost` | **Čistě vložené prostředky = celkové nákupy − příjmy z prodejů.** Může být záporný. Není to pořizovací hodnota zbývajících kusů. |
| G `Current Price` | Ručně zadávaná nezáporná cena jednoho kusu **v EUR**, nikoliv USD ani GBX. |
| H `Total Value` | `Quantity × Current Price`; uzavřená pozice má hodnotu 0 i bez ceny. |
| I `Total Return %` | `Gain/Loss / Total Purchases`. Bez nákupních nákladů není procentní výnos definovaný. |
| J `Gain/Loss` | Celkový výsledek obchodů včetně držených kusů: `Total Value + Total Sale Income − Total Purchases`. |
| K–L `Allocation` | Grafický pruh a procentní podíl na celkové aktuální hodnotě portfolia. |
| N `Total Purchases` | Celkové historické nákupní náklady včetně poplatků. |
| O `Total Sale Income` | Celkové příjmy z prodejů po poplatcích. |
| P `Net Cash Flow` | Dosavadní peněžní stav: `Total Sale Income − Total Purchases`. |
| Q `Cost Basis` | Pořizovací hodnota dosud držených kusů. |
| R `Unrealised G/L` | Nerealizovaný výsledek držených kusů: `Total Value − Cost Basis`. |

Souhrny nahoře jsou navázané na tabulku vzorci. `Total Value`, celkový výsledek a alokace zůstanou `n.a.`, dokud není oceněná každá otevřená pozice. Nula je platná zadaná cena, ne chybějící vstup. Při nulové celkové tržní hodnotě není procentní alokace definovaná. Záporná nebo textová cena nevytvoří zdánlivě platné ocenění.

Tickery a ceny mají světle žluté pozadí a modrý text. **Ceny se nestahují z internetu a samy se neaktualizují.** Pokud je původní cena v jiné měně, před vložením ji přepočti do EUR příslušným aktuálním kurzem. Datum u titulku označuje konec dodané historie transakcí, ne datum ručně doplněných cen. Každé nové spuštění vytváří nový report a nepřenáší ruční vstupy z dřívějšího XLSX; při `--force` se tyto údaje v přepisovaném výstupu ztratí.

Oproti nefunkčním náhradním vzorcům `GOOGLEFINANCE` a `SPARKLINE` v šabloně používá výstup běžné excelové vzorce a nativní podmíněné formátování. Názvy produktů jsou explicitně uložené jako text, takže se nevyhodnotí jako vzorce. `Bought Price` není čistě vložená částka na kus; `Total Return %` používá historické nákupní náklady, nikoliv čistou investici, která může být nulová či záporná. Souhrnný `Total Gain/Loss` zahrnuje realizovanou i nerealizovanou část; samotná nerealizovaná část je ve sloupci R. Výnos nezahrnuje dividendy ani další pohyby mimo Transactions.

Při vytvoření XLSX se přesné historické částky převádějí na číselné buňky s nejvýše 15 platnými číslicemi. Další přepočty provádí Excel ve své číselné aritmetice. Měnové formáty zobrazují dvě desetinná místa, ale nezaokrouhlují uložené částky na centy. Množství, které by Excel změnil kvůli omezení přesnosti, se odmítne s doporučením použít CSV. Podporováno je nejvýše 1 048 571 pozic a 32 767 znaků na textovou buňku. Formát je standardní XLSX (SpreadsheetML v ZIP); skript nepotřebuje Excel, Python, systémový ZIP ani žádný npm balíček.

### Původní CSV

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
  --output output/portfolio.xlsx \
  --verify /Users/walda/Downloads/deg/Transactions-en-outcome.csv
```

Původní exporty nejsou součástí repozitáře. Osobní data a výstupy ukládej do ignorovaných adresářů `private/` nebo `output/`.

## Testy a struktura

```sh
npm test
npm run test:coverage
```

Testy používají jen `node:test`, `node:assert` a další vestavěné moduly. Kontrolují přesnost výpočtů, celkové náklady, příjmy a jejich rozdíl, částečné prodeje, uzavření a znovuotevření, splity, přejmenování, dílčí plnění, desetinná množství, pořadí vstupu, CSV, strukturu XLSX, vzorce a jejich rozsahy, formátování, ZIP kontrolní součty, chybné podklady i CLI. GitHub Actions spouští stejnou sadu na Node.js 24.21.0.

```text
bin/degiro-portfolio.js   CLI a souborové operace
src/csv.js               Čtení a zápis CSV
src/decimal.js           Přesná racionální aritmetika a formátování
src/transactions.js      Validace a normalizace transakcí
src/portfolio.js         Výpočet pozic a pořizovací hodnoty
src/report.js            Formát výstupního portfolia
src/xlsx.js              XLSX dashboard a excelové vzorce
src/xlsx-cells.js        Typované buňky a omezení přesnosti Excelu
src/xlsx-package.js      Části XLSX a jejich vazby
src/xlsx-styles.js       Formátování podle šablony
src/xml.js               Bezpečné vytváření XML
src/zip.js               Deterministický ZIP přes node:zlib
src/verification.js      Porovnání s referenčními počty
src/portfolio-report.js  Zpracování exportu do přehledu, použitelné mimo CLI
src/index.js             Veřejné funkce
test/                    Automatické testy
examples/                Syntetické příklady
```

Výpočtové funkce nemění předané transakce, neprovádějí I/O a vracejí nové hodnoty. Lokální proměnné parseru a lokální mapy akumulátorů jsou zapouzdřené v jednotlivých funkcích. Typy jsou popsány anglickým JSDoc. Aritmetika vrací objekty s `BigInt`, proto se při použití knihovny mají převádět na text přes formátovací funkce, nikoliv přímo přes `JSON.stringify`.

### Použití jako knihovny

Veřejná funkce `createPortfolioReport(transactionsCsv, options)` provede celý postup: načtení transakcí z textu, výpočet portfolia, volitelné ověření počtů a vytvoření výstupu. Je synchronní, pracuje pouze s předanými daty a neprovádí souborové operace ani výpis do konzole. Načtení a uložení souborů zajišťuje volající aplikace.

```js
import { readFile, writeFile } from 'node:fs/promises';
import { createPortfolioReport } from './src/index.js';

const transactionsCsv = await readFile('transactions.csv', 'utf8');
const expectedQuantitiesCsv = await readFile('expected-quantities.csv', 'utf8');
const report = createPortfolioReport(transactionsCsv, {
  format: 'xlsx',
  includeClosed: true,
  expectedQuantitiesCsv,
});
await writeFile('portfolio.xlsx', report.xlsx, { flag: 'wx' });
```

Všechny volby jsou nepovinné. `format` má kvůli kompatibilitě knihovního API výchozí hodnotu `'csv'`; pro XLSX nastav `'xlsx'`. Bez `expectedQuantitiesCsv` se porovnání s referencí vynechá; dodaný prázdný nebo neplatný referenční text vyvolá chybu. `includeClosed` má výchozí hodnotu `false` a funguje stejně jako volba CLI. Neplatná data nebo nesoulad s referencí vyvolají `Error`, který může volající aplikace zachytit.

Funkce vrací objekt s pěti položkami:

| Položka | Význam |
| --- | --- |
| `csv` | Hotový výstupní CSV text. |
| `xlsx` | Binární `Buffer` s XLSX při `format: 'xlsx'`, jinak `null`. CSV zůstává dostupné i pro XLSX report. |
| `portfolio` | Všechny vypočtené pozice včetně nulových, datum stavu a počet administrativních převodů; peněžní hodnoty jsou přesné zlomky s `BigInt`. |
| `verification` | Počet ověřených názvů produktů a ISIN, nebo `null`, pokud reference nebyla zadána. |
| `openPositionCount` | Počet ISIN s nenulovým aktuálním množstvím. |

Vstupní i výstupní typy jsou popsány JSDoc v `src/portfolio-report.js`. Vstupní bod balíčku `src/index.js` exportuje také samostatné funkce `parseTransactions`, `calculatePortfolio`, `verifyQuantities`, `createPortfolioCsv` a `createPortfolioXlsx` pro použití jednotlivých kroků.

Balíček má `private: true` a licenci `UNLICENSED`: není připraven k publikaci na npm a není mu bez rozhodnutí vlastníka přidělena open-source licence.
