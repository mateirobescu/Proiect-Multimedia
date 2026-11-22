// @ts-check

/* ---------- tipuri ---------- */

/** @typedef {'select' | 'line' | 'ellipse' | 'rect' | 'path'} Tool */

/**
 * Stilul unei figuri.
 * @typedef {Object} ShapeStyle
 * @property {string} stroke culoarea conturului (ex. "#000000")
 * @property {number} strokeWidth grosimea conturului
 * @property {string} fill culoarea fundalului, "none" daca nu are
 */

/**
 * Starea editorului, tot ce se schimba cat timp desenez.
 * @typedef {Object} EditorState
 * @property {Tool} tool unealta activa
 * @property {ShapeStyle} style stilul pentru figurile noi
 * @property {SVGElement | null} selected figura selectata acum
 * @property {string[]} history snapshot-uri ale desenului, pentru undo
 */

/** @type {readonly Tool[]} */
const TOOLS = ['select', 'line', 'ellipse', 'rect', 'path'];

/** @type {EditorState} */
const state = {
  tool: 'select',
  style: { stroke: '#000000', strokeWidth: 2, fill: 'none' },
  selected: null,
  history: [],
};

/* ---------- helperi ---------- */

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

/**
 * Verifica daca un string e o unealta valida (type guard).
 * @param {string | undefined} value
 * @returns {value is Tool}
 */
function isTool(value) {
  return TOOLS.some((tool) => tool === value);
}

/* ---------- elemente din pagina ---------- */

const canvas = getElement('#canvas', SVGSVGElement);
const strokeColorInput = getElement('#stroke-color', HTMLInputElement);
const strokeWidthInput = getElement('#stroke-width', HTMLInputElement);
const fillColorInput = getElement('#fill-color', HTMLInputElement);
const fillNoneInput = getElement('#fill-none', HTMLInputElement);
const statusText = getElement('#status', HTMLElement);

/* ---------- unelte ---------- */

/**
 * Schimba unealta activa si actualizeaza butoanele.
 * @param {Tool} tool
 * @returns {void}
 */
function setTool(tool) {
  state.tool = tool;
  for (const button of document.querySelectorAll('[data-tool]')) {
    const active = button.getAttribute('data-tool') === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  statusText.textContent = `Unealta: ${tool}`;
}

/* ---------- desenare pe canvas (de implementat) ---------- */

/**
 * Apasare mouse pe canvas: incepe o figura noua sau selecteaza una.
 * @param {PointerEvent} _event
 * @returns {void}
 */
function onPointerDown(_event) {
  // TODO: depinde de state.tool
}

/**
 * Miscare mouse: actualizeaza figura in curs de desenare sau mutarea.
 * @param {PointerEvent} _event
 * @returns {void}
 */
function onPointerMove(_event) {
  // TODO
}

/**
 * Eliberare mouse: termina figura si salveaza o intrare in history.
 * @param {PointerEvent} _event
 * @returns {void}
 */
function onPointerUp(_event) {
  // TODO
}

/* ---------- actiuni (de implementat) ---------- */

/**
 * Anuleaza ultima operatie.
 * @returns {void}
 */
function undo() {
  // TODO
}

/**
 * Sterge figura selectata.
 * @returns {void}
 */
function deleteSelected() {
  // TODO
}

/**
 * Exporta desenul ca imagine raster.
 * @param {'png' | 'jpeg'} _format
 * @returns {void}
 */
function exportRaster(_format) {
  // TODO
}

/**
 * Salveaza desenul ca fisier .svg.
 * @returns {void}
 */
function saveSvg() {
  // TODO
}

/**
 * Salveaza automat desenul curent in Web Storage.
 * @returns {void}
 */
function saveToStorage() {
  // TODO
}

/**
 * Reincarca desenul salvat la pornire.
 * @returns {void}
 */
function loadFromStorage() {
  // TODO
}

/* ---------- legarea evenimentelor ---------- */

/**
 * Citeste valorile din panoul de proprietati in state.style.
 * @returns {void}
 */
function readStyleFromInputs() {
  state.style = {
    stroke: strokeColorInput.value,
    strokeWidth: Number(strokeWidthInput.value),
    fill: fillNoneInput.checked ? 'none' : fillColorInput.value,
  };
}

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

  getElement('#btn-undo', HTMLButtonElement).addEventListener('click', undo);
  getElement('#btn-delete', HTMLButtonElement).addEventListener('click', deleteSelected);
  getElement('#btn-export-png', HTMLButtonElement).addEventListener('click', () => exportRaster('png'));
  getElement('#btn-export-jpeg', HTMLButtonElement).addEventListener('click', () => exportRaster('jpeg'));
  getElement('#btn-save-svg', HTMLButtonElement).addEventListener('click', saveSvg);

  for (const input of [strokeColorInput, strokeWidthInput, fillColorInput, fillNoneInput]) {
    input.addEventListener('input', readStyleFromInputs);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);

  readStyleFromInputs();
  setTool('select');
  loadFromStorage();
}

init();
