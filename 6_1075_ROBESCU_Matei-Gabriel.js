// @ts-check

/* ---------- tipuri ---------- */

/** @typedef {'line' | 'ellipse' | 'rect'} ShapeTool uneltele care se deseneaza prin tragere */
/** @typedef {'select' | 'path' | ShapeTool} Tool */

/**
 * Un punct in coordonatele desenului (cele din viewBox).
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * Stilul unei figuri.
 * @typedef {Object} ShapeStyle
 * @property {string} stroke culoarea conturului (ex. "#000000")
 * @property {number} strokeWidth grosimea conturului
 * @property {string} fill culoarea fundalului, "none" daca nu are
 */

/**
 * Figura (linie / dreptunghi / elipsa) care se deseneaza acum, cat tin mouse-ul apasat.
 * @typedef {Object} ShapeDraft
 * @property {SVGLineElement | SVGRectElement | SVGEllipseElement} element
 * @property {Point} start unde am apasat prima data
 */

/**
 * Calea care se deseneaza acum, click cu click.
 * @typedef {Object} PathDraft
 * @property {SVGPathElement} element
 * @property {Point[]} points punctele puse pana acum
 */

/**
 * Ce se trage acum cu mouse-ul in modul selectie: toata figura sau un singur punct de cale.
 * @typedef {{type: 'move', last: Point, moved: boolean}
 *   | {type: 'handle', element: SVGPathElement, index: number, points: Point[], moved: boolean}} Drag
 */

/**
 * Starea editorului, tot ce se schimba cat timp desenez.
 * @typedef {Object} EditorState
 * @property {Tool} tool unealta activa
 * @property {ShapeStyle} style stilul pentru figurile noi
 * @property {SVGGraphicsElement | null} selected figura selectata acum
 * @property {string[]} history snapshot-uri ale desenului; ultimul e starea curenta
 * @property {ShapeDraft | null} shapeDraft figura in curs de desenare
 * @property {PathDraft | null} pathDraft calea in curs de desenare
 * @property {Drag | null} drag mutarea in curs
 */

/** namespace-ul care trebuie la createElementNS pentru elemente SVG */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** sub atatia pixeli consider ca a fost doar un click, nu o figura */
const MIN_SHAPE_SIZE = 3;

/** cate stari tin minte pentru undo */
const MAX_HISTORY = 100;

/** cheia sub care salvez desenul in localStorage */
const STORAGE_KEY = 'editor-svg-desen';

/** singurele elemente pe care le accept cand reincarc un desen (nu las orice markup sa intre) */
const ALLOWED_TAGS = ['line', 'rect', 'ellipse', 'path'];

/** singurele atribute pe care le copiez la reincarcare */
const ALLOWED_ATTRIBUTES = [
  'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'rx', 'ry', 'd',
  'stroke', 'stroke-width', 'fill', 'stroke-linecap', 'stroke-linejoin',
];

/** @type {readonly Tool[]} */
const TOOLS = ['select', 'line', 'ellipse', 'rect', 'path'];

/** @type {Record<Tool, string>} textul din status pentru fiecare unealta */
const TOOL_HINTS = {
  select: 'Selectie: click = alege, trage = muta, Delete = sterge. La cale: trage manerele, dublu-click pe maner = scoate punct, dublu-click pe cale = adauga punct',
  line: 'Unealta: linie (trage cu mouse-ul)',
  ellipse: 'Unealta: elipsa (trage cu mouse-ul)',
  rect: 'Unealta: dreptunghi (trage cu mouse-ul)',
  path: 'Unealta: cale (click pentru puncte, dublu-click sau Enter termina, Esc anuleaza)',
};

/** @type {EditorState} */
const state = {
  tool: 'select',
  style: { stroke: '#000000', strokeWidth: 2, fill: 'none' },
  selected: null,
  history: [],
  shapeDraft: null,
  pathDraft: null,
  drag: null,
};

/* ---------- elemente din pagina ---------- */

/**
 * Ia un element din pagina si verifica sa fie de tipul cerut,
 * ca sa nu lucrez cu null sau cu tipul gresit.
 * @template {Element} T
 * @param {string} selector selector CSS
 * @param {new () => T} type clasa asteptata (ex. HTMLButtonElement)
 * @returns {T}
 */
function getElement(selector, type) {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Elementul ${selector} lipseste sau are alt tip`);
  }
  return element;
}

const canvas = getElement('#canvas', SVGSVGElement);
const layer = getElement('#layer', SVGGElement);
const overlay = getElement('#overlay', SVGGElement);
const strokeColorInput = getElement('#stroke-color', HTMLInputElement);
const strokeWidthInput = getElement('#stroke-width', HTMLInputElement);
const fillColorInput = getElement('#fill-color', HTMLInputElement);
const fillNoneInput = getElement('#fill-none', HTMLInputElement);
const statusText = getElement('#status', HTMLElement);

/* ---------- helperi ---------- */

/**
 * Verifica daca un string e o unealta valida (type guard).
 * @param {string | undefined} value
 * @returns {value is Tool}
 */
function isTool(value) {
  return TOOLS.some((tool) => tool === value);
}

/**
 * Pune mai multe atribute deodata pe un element.
 * @param {Element} element
 * @param {Record<string, string | number>} attributes
 * @returns {void}
 */
function setAttributes(element, attributes) {
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
}

/**
 * Aduna o valoare la un atribut numeric (folosit la mutare).
 * @param {Element} element
 * @param {string} name numele atributului (ex. "x1")
 * @param {number} delta cu cat se muta
 * @returns {void}
 */
function shiftAttribute(element, name, delta) {
  element.setAttribute(name, String(Number(element.getAttribute(name)) + delta));
}

/**
 * Transforma pozitia mouse-ului din pixeli de ecran in coordonatele desenului,
 * ca sa mearga corect si daca se schimba marimea paginii.
 * @param {MouseEvent} event
 * @returns {Point}
 */
function getSvgPoint(event) {
  const matrix = canvas.getScreenCTM();
  if (matrix === null) {
    return { x: event.clientX, y: event.clientY };
  }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

/**
 * Pune stilul curent pe o figura.
 * @param {SVGElement} element
 * @param {ShapeStyle} style
 * @returns {void}
 */
function applyStyle(element, style) {
  setAttributes(element, {
    stroke: style.stroke,
    'stroke-width': style.strokeWidth,
    fill: style.fill,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
}

/**
 * Creeaza un element SVG nou, cu stilul curent, si il pune in desen.
 * @template {keyof SVGElementTagNameMap} K
 * @param {K} tag numele elementului (ex. "line")
 * @returns {SVGElementTagNameMap[K]}
 */
function createSvgElement(tag) {
  const element = document.createElementNS(SVG_NS, tag);
  applyStyle(element, state.style);
  layer.appendChild(element);
  return element;
}

/**
 * Distanta de la un punct la un segment si punctul cel mai apropiat de pe segment.
 * @param {Point} p
 * @param {Point} a capatul de inceput al segmentului
 * @param {Point} b capatul de sfarsit al segmentului
 * @returns {{distance: number, point: Point}}
 */
function projectOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  // t = cat de departe pe segment cade proiectia (0 = in a, 1 = in b)
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSquared));
  const point = { x: a.x + t * abx, y: a.y + t * aby };
  return { distance: Math.hypot(p.x - point.x, p.y - point.y), point };
}

/* ---------- panoul de proprietati ---------- */

/**
 * Citeste valorile din panoul de proprietati in state.style.
 * @returns {void}
 */
function readStyleFromInputs() {
  const width = Number(strokeWidthInput.value);
  state.style = {
    stroke: strokeColorInput.value,
    // grosimea ramane intre 1 si 50, orice altceva devine 1
    strokeWidth: Number.isFinite(width) && width >= 1 ? Math.min(width, 50) : 1,
    fill: fillNoneInput.checked ? 'none' : fillColorInput.value,
  };
}

/**
 * Pune in panou stilul figurii selectate, ca sa il pot modifica.
 * @param {SVGElement} element
 * @returns {void}
 */
function syncInputsFromElement(element) {
  strokeColorInput.value = element.getAttribute('stroke') ?? '#000000';
  strokeWidthInput.value = element.getAttribute('stroke-width') ?? '2';
  const fill = element.getAttribute('fill') ?? 'none';
  fillNoneInput.checked = fill === 'none';
  if (fill !== 'none') {
    fillColorInput.value = fill;
  }
  readStyleFromInputs();
}

/**
 * Cat timp trag de un camp din panou, schimb direct figura selectata (daca exista).
 * @returns {void}
 */
function onStyleInput() {
  readStyleFromInputs();
  if (state.selected !== null) {
    applyStyle(state.selected, state.style);
    renderOverlay();
  }
}

/**
 * Cand las campul din panou, salvez o stare in history (daca am modificat o figura).
 * @returns {void}
 */
function onStyleChange() {
  if (state.selected !== null) {
    pushHistory();
  }
}

/* ---------- history, undo, salvare automata ---------- */

/**
 * Salveaza starea curenta a desenului in history si in Web Storage.
 * @returns {void}
 */
function pushHistory() {
  state.history.push(layer.innerHTML);
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  }
  saveToStorage();
}

/**
 * Reface desenul dintr-un snapshot. Nu pun markup-ul direct in pagina:
 * il parsez si copiez doar elementele si atributele permise.
 * @param {string} markup continutul unui snapshot (ce a fost in layer)
 * @returns {boolean} false daca markup-ul nu se poate citi
 */
function restoreSnapshot(markup) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, 'image/svg+xml');
  if (doc.querySelector('parsererror') !== null) {
    return false;
  }

  layer.replaceChildren();
  for (const child of doc.documentElement.children) {
    if (!ALLOWED_TAGS.includes(child.localName)) {
      continue;
    }
    const element = document.createElementNS(SVG_NS, child.localName);
    for (const name of ALLOWED_ATTRIBUTES) {
      const value = child.getAttribute(name);
      if (value !== null) {
        element.setAttribute(name, value);
      }
    }
    layer.appendChild(element);
  }
  return true;
}

/**
 * Anuleaza ultimele operatii.
 * @param {number} steps cate operatii se anuleaza
 * @returns {void}
 */
function undo(steps) {
  cancelPath();
  // prima stare din history (desenul de la pornire) nu se poate anula
  const count = Math.min(steps, state.history.length - 1);
  if (count < 1) {
    return;
  }
  state.history.length -= count;
  const snapshot = state.history[state.history.length - 1];
  if (snapshot !== undefined) {
    restoreSnapshot(snapshot);
  }
  select(null);
  saveToStorage();
}

/**
 * Salveaza automat desenul curent in Web Storage.
 * @returns {void}
 */
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, layer.innerHTML);
  } catch {
    // storage plin sau blocat, nu stric nimic, doar nu se mai salveaza
  }
}

/**
 * Reincarca desenul salvat la pornire.
 * @returns {void}
 */
function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      restoreSnapshot(saved);
    }
  } catch {
    // storage blocat, pornesc cu desen gol
  }
}

/* ---------- selectie ---------- */

/**
 * Citeste punctele unei cai din atributul "d" (formatul scris de renderPath).
 * @param {SVGPathElement} element
 * @returns {Point[]}
 */
function readPathPoints(element) {
  const d = element.getAttribute('d') ?? '';
  const number = '-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?';
  const pair = new RegExp(`(${number})\\s+(${number})`, 'g');
  /** @type {Point[]} */
  const points = [];
  for (const match of d.matchAll(pair)) {
    const [, x = '0', y = '0'] = match;
    points.push({ x: Number(x), y: Number(y) });
  }
  return points;
}

/**
 * Deseneaza cadrul de selectie (si manerele, la cale) in overlay.
 * @returns {void}
 */
function renderOverlay() {
  overlay.replaceChildren();
  const element = state.selected;
  if (element === null) {
    return;
  }

  const box = element.getBBox();
  const pad = Number(element.getAttribute('stroke-width') ?? 1) / 2 + 3;
  const frame = document.createElementNS(SVG_NS, 'rect');
  setAttributes(frame, {
    class: 'selection-frame',
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + 2 * pad,
    height: box.height + 2 * pad,
  });
  overlay.appendChild(frame);

  if (element instanceof SVGPathElement) {
    readPathPoints(element).forEach((point, index) => {
      const handle = document.createElementNS(SVG_NS, 'circle');
      setAttributes(handle, { class: 'handle', cx: point.x, cy: point.y, r: 5, 'data-index': index });
      overlay.appendChild(handle);
    });
  }
}

/**
 * Selecteaza o figura (sau nimic, cu null).
 * @param {SVGGraphicsElement | null} element
 * @returns {void}
 */
function select(element) {
  state.selected = element;
  if (element !== null) {
    syncInputsFromElement(element);
  }
  renderOverlay();
}

/**
 * Sterge figura selectata.
 * @returns {void}
 */
function deleteSelected() {
  const element = state.selected;
  if (element === null) {
    return;
  }
  element.remove();
  select(null);
  pushHistory();
}

/**
 * Goleste tot desenul, dupa ce utilizatorul confirma in popup.
 * Se salveaza o stare in history, deci se poate anula cu Undo.
 * @returns {void}
 */
function clearDrawing() {
  if (layer.children.length === 0) {
    return;
  }
  if (!confirm('Sigur vrei sa stergi tot desenul?')) {
    return;
  }
  cancelPath();
  layer.replaceChildren();
  select(null);
  pushHistory();
}

/**
 * Muta o figura cu dx, dy, modificand direct coordonatele ei.
 * @param {SVGGraphicsElement} element
 * @param {number} dx
 * @param {number} dy
 * @returns {void}
 */
function moveShape(element, dx, dy) {
  if (element instanceof SVGLineElement) {
    shiftAttribute(element, 'x1', dx);
    shiftAttribute(element, 'x2', dx);
    shiftAttribute(element, 'y1', dy);
    shiftAttribute(element, 'y2', dy);
  } else if (element instanceof SVGRectElement) {
    shiftAttribute(element, 'x', dx);
    shiftAttribute(element, 'y', dy);
  } else if (element instanceof SVGEllipseElement) {
    shiftAttribute(element, 'cx', dx);
    shiftAttribute(element, 'cy', dy);
  } else if (element instanceof SVGPathElement) {
    const moved = readPathPoints(element).map((point) => ({ x: point.x + dx, y: point.y + dy }));
    renderPath(element, moved);
  }
}

/**
 * Pornire tragere in modul selectie: un maner, o figura, sau gol (deselecteaza).
 * @param {PointerEvent} event
 * @param {Point} point
 * @returns {void}
 */
function startSelectDrag(event, point) {
  const target = event.target;
  const selected = state.selected;

  if (
    target instanceof SVGCircleElement &&
    target.classList.contains('handle') &&
    selected instanceof SVGPathElement
  ) {
    state.drag = {
      type: 'handle',
      element: selected,
      index: Number(target.dataset.index),
      points: readPathPoints(selected),
      moved: false,
    };
  } else if (target instanceof SVGGraphicsElement && target.parentNode === layer) {
    select(target);
    state.drag = { type: 'move', last: point, moved: false };
  } else {
    select(null);
    return;
  }
  canvas.setPointerCapture(event.pointerId);
}

/**
 * Aplica tragerea curenta (mutare figura sau mutare punct de cale).
 * @param {Drag} drag
 * @param {Point} point pozitia curenta a mouse-ului
 * @returns {void}
 */
function applyDrag(drag, point) {
  if (drag.type === 'handle') {
    drag.points[drag.index] = point;
    renderPath(drag.element, drag.points);
  } else {
    const element = state.selected;
    if (element === null) {
      return;
    }
    moveShape(element, point.x - drag.last.x, point.y - drag.last.y);
    drag.last = point;
  }
  drag.moved = true;
  renderOverlay();
}

/**
 * Pune lista de puncte inapoi in cale, reface cadrul si salveaza in history.
 * @param {SVGPathElement} element
 * @param {Point[]} points
 * @returns {void}
 */
function commitPathPoints(element, points) {
  renderPath(element, points);
  renderOverlay();
  pushHistory();
}

/**
 * Dublu-click in modul selectie: pe un maner scoate punctul, pe cale adauga un punct.
 * @param {MouseEvent} event
 * @returns {void}
 */
function editPathWithDoubleClick(event) {
  const element = state.selected;
  if (!(element instanceof SVGPathElement)) {
    return;
  }
  const target = event.target;
  const points = readPathPoints(element);

  if (target instanceof SVGCircleElement && target.classList.contains('handle')) {
    // o cale are nevoie de minim 2 puncte
    if (points.length > 2) {
      points.splice(Number(target.dataset.index), 1);
      commitPathPoints(element, points);
    }
    return;
  }

  if (target === element) {
    const click = getSvgPoint(event);
    // caut segmentul cel mai apropiat de click si pun punctul nou pe el
    let bestIndex = 0;
    let bestDistance = Infinity;
    let bestPoint = click;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a === undefined || b === undefined) {
        continue;
      }
      const result = projectOnSegment(click, a, b);
      if (result.distance < bestDistance) {
        bestDistance = result.distance;
        bestIndex = i;
        bestPoint = result.point;
      }
    }
    points.splice(bestIndex + 1, 0, bestPoint);
    commitPathPoints(element, points);
  }
}

/* ---------- unelte ---------- */

/**
 * Schimba unealta activa si actualizeaza butoanele.
 * @param {Tool} tool
 * @returns {void}
 */
function setTool(tool) {
  // daca eram la jumatatea unei cai, o las asa cum e
  finishPath(false);
  if (tool !== 'select') {
    select(null);
  }

  state.tool = tool;
  for (const button of document.querySelectorAll('[data-tool]')) {
    const active = button.getAttribute('data-tool') === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  statusText.textContent = TOOL_HINTS[tool];
}

/* ---------- linie, elipsa, dreptunghi ---------- */

/**
 * Incepe o figura noua la punctul unde s-a apasat.
 * @param {ShapeTool} tool
 * @param {Point} start
 * @returns {ShapeDraft}
 */
function createShapeDraft(tool, start) {
  switch (tool) {
    case 'line': {
      const element = createSvgElement('line');
      setAttributes(element, { x1: start.x, y1: start.y, x2: start.x, y2: start.y });
      return { element, start };
    }
    case 'rect': {
      const element = createSvgElement('rect');
      setAttributes(element, { x: start.x, y: start.y, width: 0, height: 0 });
      return { element, start };
    }
    case 'ellipse': {
      const element = createSvgElement('ellipse');
      setAttributes(element, { cx: start.x, cy: start.y, rx: 0, ry: 0 });
      return { element, start };
    }
  }
}

/**
 * Actualizeaza figura cat timp se misca mouse-ul.
 * Dreptunghiul si elipsa se intind intre coltul de start si mouse.
 * @param {ShapeDraft} draft
 * @param {Point} point pozitia curenta a mouse-ului
 * @returns {void}
 */
function updateShapeDraft(draft, point) {
  const { element, start } = draft;

  if (element instanceof SVGLineElement) {
    setAttributes(element, { x2: point.x, y2: point.y });
  } else if (element instanceof SVGRectElement) {
    setAttributes(element, {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  } else {
    // ce a ramas e elipsa: centrul e la mijlocul "dreptunghiului" tras
    setAttributes(element, {
      cx: (start.x + point.x) / 2,
      cy: (start.y + point.y) / 2,
      rx: Math.abs(point.x - start.x) / 2,
      ry: Math.abs(point.y - start.y) / 2,
    });
  }
}

/* ---------- cale (path) ---------- */

/**
 * Scrie atributul "d" al caii din lista de puncte (segmente drepte).
 * @param {SVGPathElement} element
 * @param {Point[]} points
 * @returns {void}
 */
function renderPath(element, points) {
  const d = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  element.setAttribute('d', d);
}

/**
 * Adauga un punct la calea in curs; daca nu exista, porneste una noua.
 * @param {Point} point
 * @returns {void}
 */
function addPathPoint(point) {
  if (state.pathDraft === null) {
    const element = createSvgElement('path');
    state.pathDraft = { element, points: [point] };
  } else {
    state.pathDraft.points.push(point);
  }
  renderPath(state.pathDraft.element, state.pathDraft.points);
}

/**
 * Termina calea: o pastreaza daca are cel putin 2 puncte, altfel o sterge.
 * @param {boolean} dropLastPoint true la dublu-click, pentru ca al doilea click
 *   a pus deja un punct in plus, exact peste primul
 * @returns {void}
 */
function finishPath(dropLastPoint) {
  const draft = state.pathDraft;
  if (draft === null) {
    return;
  }
  state.pathDraft = null;

  if (dropLastPoint) {
    draft.points.pop();
  }
  if (draft.points.length < 2) {
    draft.element.remove();
    return;
  }
  renderPath(draft.element, draft.points);
  pushHistory();
}

/**
 * Renunta la calea in curs (tasta Esc).
 * @returns {void}
 */
function cancelPath() {
  state.pathDraft?.element.remove();
  state.pathDraft = null;
}

/* ---------- evenimente pe canvas ---------- */

/**
 * Apasare mouse pe canvas: incepe o figura, adauga un punct la cale sau selecteaza.
 * @param {PointerEvent} event
 * @returns {void}
 */
function onPointerDown(event) {
  // doar click stanga
  if (event.button !== 0) {
    return;
  }
  const point = getSvgPoint(event);
  const tool = state.tool;

  switch (tool) {
    case 'line':
    case 'rect':
    case 'ellipse':
      state.shapeDraft = createShapeDraft(tool, point);
      // asa primesc pointermove/pointerup si cand mouse-ul iese din canvas
      canvas.setPointerCapture(event.pointerId);
      break;
    case 'path':
      addPathPoint(point);
      break;
    case 'select':
      startSelectDrag(event, point);
      break;
  }
}

/**
 * Miscare mouse: actualizeaza figura, mutarea sau segmentul de previzualizare al caii.
 * @param {PointerEvent} event
 * @returns {void}
 */
function onPointerMove(event) {
  const point = getSvgPoint(event);

  if (state.shapeDraft !== null) {
    updateShapeDraft(state.shapeDraft, point);
  } else if (state.drag !== null) {
    applyDrag(state.drag, point);
  } else if (state.pathDraft !== null) {
    // desenez si segmentul pana la mouse, dar fara sa-l salvez in lista
    renderPath(state.pathDraft.element, [...state.pathDraft.points, point]);
  }
}

/**
 * Eliberare mouse: termina figura sau mutarea si salveaza in history.
 * @param {PointerEvent} event
 * @returns {void}
 */
function onPointerUp(event) {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  const draft = state.shapeDraft;
  if (draft !== null) {
    state.shapeDraft = null;
    const end = getSvgPoint(event);
    const distance = Math.hypot(end.x - draft.start.x, end.y - draft.start.y);
    if (distance < MIN_SHAPE_SIZE) {
      // a fost doar un click
      draft.element.remove();
    } else {
      pushHistory();
    }
    return;
  }

  const drag = state.drag;
  if (drag !== null) {
    state.drag = null;
    if (drag.moved) {
      pushHistory();
    }
  }
}

/**
 * Dublu-click: termina calea sau editeaza punctele unei cai selectate.
 * @param {MouseEvent} event
 * @returns {void}
 */
function onDoubleClick(event) {
  if (state.tool === 'path') {
    finishPath(true);
  } else if (state.tool === 'select') {
    editPathWithDoubleClick(event);
  }
}

/**
 * Taste: Enter termina calea, Esc anuleaza/deselecteaza, Delete sterge, Ctrl+Z da undo.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function onKeyDown(event) {
  // nu ma bag cand scrie omul intr-un camp din panou
  if (event.target instanceof HTMLInputElement) {
    return;
  }
  if (event.key === 'Enter') {
    finishPath(false);
  } else if (event.key === 'Escape') {
    cancelPath();
    select(null);
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.tool === 'select') {
    event.preventDefault();
    deleteSelected();
  } else if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    undo(1);
  }
}

/* ---------- export si salvare ---------- */

/**
 * Face textul unui fisier SVG complet doar din desen (fara cadrul de selectie).
 * @returns {string}
 */
function buildSvgMarkup() {
  const { width, height } = canvas.viewBox.baseVal;
  const svg = document.createElementNS(SVG_NS, 'svg');
  setAttributes(svg, { viewBox: `0 0 ${width} ${height}`, width, height });
  for (const child of layer.children) {
    svg.appendChild(child.cloneNode(true));
  }
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Descarca un fisier creat in pagina.
 * @param {Blob} blob continutul fisierului
 * @param {string} filename numele sub care se salveaza
 * @returns {void}
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Exporta desenul ca imagine raster: pun SVG-ul intr-un <img>, il desenez
 * pe un <canvas> HTML cu fundal alb si salvez rezultatul.
 * @param {'png' | 'jpeg'} format
 * @returns {void}
 */
function exportRaster(format) {
  const { width, height } = canvas.viewBox.baseVal;
  const svgBlob = new Blob([buildSvgMarkup()], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();

  image.addEventListener('load', () => {
    URL.revokeObjectURL(url);
    const bitmap = document.createElement('canvas');
    bitmap.width = width;
    bitmap.height = height;
    const context = bitmap.getContext('2d');
    if (context === null) {
      return;
    }
    // fundal alb, altfel jpeg-ul iese negru unde nu e desen
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const extension = format === 'jpeg' ? 'jpg' : 'png';
    bitmap.toBlob((blob) => {
      if (blob !== null) {
        downloadBlob(blob, `desen.${extension}`);
      }
    }, `image/${format}`, 0.92);
  });

  image.addEventListener('error', () => {
    URL.revokeObjectURL(url);
    alert('Nu am reusit sa fac exportul.');
  });

  image.src = url;
}

/**
 * Salveaza desenul ca fisier .svg.
 * @returns {void}
 */
function saveSvg() {
  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${buildSvgMarkup()}`;
  downloadBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), 'desen.svg');
}

/* ---------- legarea evenimentelor ---------- */

/**
 * Pune toti listenerii; se apeleaza o singura data la pornire.
 * @returns {void}
 */
function init() {
  for (const button of document.querySelectorAll('[data-tool]')) {
    button.addEventListener('click', () => {
      const tool = button.getAttribute('data-tool') ?? undefined;
      if (isTool(tool)) {
        setTool(tool);
      }
    });
  }

  getElement('#btn-undo', HTMLButtonElement).addEventListener('click', () => undo(1));
  getElement('#btn-delete', HTMLButtonElement).addEventListener('click', deleteSelected);
  getElement('#btn-clear', HTMLButtonElement).addEventListener('click', clearDrawing);
  getElement('#btn-export-png', HTMLButtonElement).addEventListener('click', () => exportRaster('png'));
  getElement('#btn-export-jpeg', HTMLButtonElement).addEventListener('click', () => exportRaster('jpeg'));
  getElement('#btn-save-svg', HTMLButtonElement).addEventListener('click', saveSvg);

  for (const input of [strokeColorInput, strokeWidthInput, fillColorInput, fillNoneInput]) {
    input.addEventListener('input', onStyleInput);
    input.addEventListener('change', onStyleChange);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('dblclick', onDoubleClick);
  document.addEventListener('keydown', onKeyDown);

  readStyleFromInputs();
  setTool('select');

  // desenul salvat data trecuta (daca exista) e starea de la care pornesc
  loadFromStorage();
  state.history = [layer.innerHTML];
}

init();
