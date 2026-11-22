# Proiect Multimedia – Editor SVG (tema 6)

Proiect pentru cursul de Multimedia (ASE), student: ROBESCU Matei-Gabriel, grupa 1075.
Tema alocată: **6. Editor SVG** – editor de grafică vectorială construit cu elementul SVG (model: Google Drawings).

Cerințele complete și baremul sunt în [docs/Topic.md](docs/Topic.md). Citește-le înainte de a implementa ceva.

## Stack

- HTML, CSS și JavaScript vanilla, fără build step și fără bundler.
- CSS scris de mână (raw CSS), **fără Bootstrap** sau alte framework-uri CSS.
- Nicio bibliotecă JavaScript (nici jQuery, nici alte librării).

## Structura livrabilului

Proiectul se predă ca arhivă `6_1075_ROBESCU_Matei-Gabriel.zip` cu:

```
media/                              # imagini, sunete, video, fișiere de date
6_1075_ROBESCU_Matei-Gabriel.html   # tot codul HTML
6_1075_ROBESCU_Matei-Gabriel.css    # tot codul CSS
6_1075_ROBESCU_Matei-Gabriel.js     # tot codul JavaScript
```

- Doar cele trei fișiere `.html`, `.css`, `.js` intră în evaluare, deci codul nu se împarte în alte fișiere.
- Conțin doar cod sursă, **formatat și comentat** (comentariile în română).
- `docs/`, `AGENTS.md`, `CLAUDE.md` și `.claude/` nu fac parte din arhiva predată.

## Comentarii în cod

Proiectul **cere cod comentat**, deci:

- Comentariile sunt in romana, **fara diacritice** (ca sa nu apara probleme de encoding), intr-un ton relaxat, ca niste notite scurte.
- Codul nou sau modificat se comenteaza: ce face fiecare functie si de ce, nu fiecare linie.
- Comentariile existente nu se sterg si nu se rescriu fara cerere explicita.
- Nu se adauga comentarii in cod pe care nu il modifici.

## Type safety cu JSDoc (important)

JavaScript-ul trebuie sa fie cat mai sigur din punct de vedere al tipurilor, fara TypeScript si fara build step, doar cu JSDoc verificat de editor:

- Prima linie din fisierul `.js` este `// @ts-check`.
- Fiecare functie are JSDoc cu `@param` si `@returns` cu tipuri explicite.
- Structurile de date (figuri, stare editor, intrari de undo) se definesc cu `@typedef`; uniunile de tipuri se folosesc pentru variante (ex. `'line' | 'ellipse' | 'rect' | 'path'`).
- Variabilele care nu au tip evident au `@type`; elementele luate din DOM se castuiesc explicit (`/** @type {SVGSVGElement} */`) dupa o verificare, nu pe incredere.
- Se evita `any`, `Object` si `Function`; se verifica `null` pentru `querySelector` si `getElementById`.
- Constantele se declara cu `const`, iar obiectele de tip enum cu `@enum` sau `Object.freeze`.
- Verificarea e configurata in `jsconfig.json` (`checkJs` si `strict`). Fisierul nu face parte din arhiva predata; codul trebuie sa ramana corect si fara el.
- Comentariile JSDoc respecta aceleasi reguli ca restul comentariilor (romana, fara diacritice).

## Reguli stricte (integritate academică)

- **Nu se folosește cod JavaScript din alte surse** (internet, colegi, StackOverflow etc.). Excepție: exemplele de la curs/seminar publicate pe online.ase.ro, a căror sursă este https://github.com/liviucotfas/ase-multimedia. Codul preluat din alte surse este considerat tentativă de fraudă și se verifică automat.
- Când adaptezi un exemplu din repository-ul cursului, păstrează un comentariu care indică de unde provine ideea.
- Pentru CSS, fișiere media și fișiere de date, sursa este liberă.
- Surse de documentare acceptate: [MDN](https://developer.mozilla.org/en-US/) și [javascript.info](https://javascript.info/).
- Punctajul se acordă doar dacă studentul poate explica la evaluare ce a folosit. Scrie cod simplu și clar, fără trucuri pe care nu le-ar putea justifica.

## Barem (rezumat)

- 1p oficiu · 3p interfață HTML/CSS · 1p funcții de tratare a evenimentelor · 5p cerințele temei.
- Cerințele temei: elemente de bază (linie, elipsă, dreptunghi), culoare și grosime, selecție/ștergere/modificare, undo, mutare cu mouse-ul, căi cu editarea punctelor, export PNG/JPEG, salvare SVG, salvare automată cu Web Storage.

## Convenții de lucru

- Cod ES6+ în browser, `const`/`let`, funcții mici cu nume descriptive și comentarii care explică *de ce*.
- Manipularea SVG se face prin DOM API (`createElementNS` cu namespace-ul `http://www.w3.org/2000/svg`).
- Proiectul trebuie să ruleze deschizând direct fișierul HTML în browser, fără server.
- Commit-urile nu au linii de atribuire (vezi `.claude/settings.json`).
