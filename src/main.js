import './style.css';
import { PageFlip } from 'page-flip/dist/js/page-flip.module.js';
import { readEpub } from './epub.js';
import { paginate, pageForLocation } from './pagination.js';
import { configurePageTurner } from './page-turn.js';
import { getBooks, getFile, storeBook, saveBook, removeBook, loadPreferences, savePreferences } from './storage.js';
import { featuredEditions, editionForRecord } from './catalog.js';
import { setupPwa } from './pwa.js';

const $ = selector => document.querySelector(selector);
const icons = {
  book: '<path d="M12 5C8.5 2.5 5 3 2 4v15c3-1 6.5-1 10 1 3.5-2 7-2 10-1V4c-3-1-6.5-1.5-10 1v15"/>',
  shield: '<path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  arrowLeft: '<path d="M20 12H4m7-7-7 7 7 7"/>', chevronLeft: '<path d="m15 5-7 7 7 7"/>', chevronRight: '<path d="m9 5 7 7-7 7"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  bookmark: '<path d="M6 3h12v19l-6-4-6 4V3Z"/>', expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });

const preferences = loadPreferences();
let books = [];
let activeBook = null;
let activeRecord = null;
let layout = null;
let flip = null;
let layoutController;
let layoutVersion = 0;
let layoutKey = '';
let resizeTimer;
let toastTimer;
let pendingRemoval;
let importing = false;
let rebuilding = false;
let currentIndex = 0;
let locationIndex = 0;
let saveWarning = false;
let loadingFeatured = false;
const shelfUrls = [];

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6000);
}
setupPwa({ toast });
function busy(message, detail = 'Preparando suas páginas') {
  $('#busy-text').textContent = message;
  $('#busy-detail').textContent = detail;
  $('#busy').hidden = false;
}
function showError(error) {
  console.error(error);
  toast(error?.message || 'Não foi possível abrir este livro. Tente outro EPUB.');
}
function applyPreferences() {
  document.body.dataset.theme = preferences.theme;
  document.documentElement.style.setProperty('--reading-size', `${preferences.size}px`);
  document.documentElement.style.setProperty('--reading-font', preferences.font === 'sans' ? 'Arial, Helvetica, sans-serif' : 'Georgia, "Times New Roman", serif');
  document.documentElement.style.setProperty('--reading-line', preferences.spacing === 'wide' ? '1.85' : '1.6');
  $('#font-value').textContent = `${preferences.size} px`;
  $('#font-smaller').disabled = preferences.size <= 14;
  $('#font-larger').disabled = preferences.size >= 28;
  for (const key of ['font', 'theme', 'spacing']) document.querySelectorAll(`[data-${key}]`).forEach(button => {
    if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset[key] === preferences[key]));
  });
}

function renderLibrary() {
  shelfUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  $('#shelf').replaceChildren();
  const otherBooks = books.filter(book => !editionForRecord(book)).sort((a, b) => b.lastOpened - a.lastOpened);
  const entries = [
    ...featuredEditions.map(edition => {
      const record = books.filter(book => editionForRecord(book)?.id === edition.id).sort((a, b) => b.lastOpened - a.lastOpened)[0] || null;
      return { book: { ...record, title: edition.title, author: edition.author, percent: record?.percent || 0 }, featured: edition, record };
    }),
    ...otherBooks.map(book => ({ book, featured: false, record: book })),
  ];
  $('#book-count').textContent = entries.length;
  $('#dropzone').hidden = true;
  for (const [index, entry] of entries.entries()) {
    const { book, featured, record } = entry;
    const article = document.createElement('article');
    article.className = featured ? 'book-card featured-book-card' : 'book-card';
    if (featured) article.dataset.edition = featured.id;
    const open = document.createElement('button');
    open.className = 'book-open';
    open.setAttribute('aria-label', `Ler ${book.title}, por ${book.author}${featured ? `, em ${featured.language}` : ''}`);
    let cover;
    if (featured) {
      const object = document.createElement('div'); object.className = 'featured-book-object';
      const pages = document.createElement('span'); pages.className = 'featured-book-pages'; pages.setAttribute('aria-hidden', 'true');
      cover = document.createElement('div'); cover.className = 'shelf-cover featured-shelf-cover';
      const image = document.createElement('img'); image.src = `${import.meta.env.BASE_URL}${featured.cover}`; image.alt = '';
      cover.append(image); object.append(pages, cover); open.append(object);
    } else {
      cover = document.createElement('div'); cover.className = `shelf-cover cover-color-${(index - 1 + 4) % 4}`;
      if (book.cover) {
        const url = URL.createObjectURL(book.cover);
        shelfUrls.push(url);
        const image = document.createElement('img'); image.src = url; image.alt = ''; cover.append(image);
      } else {
        const top = document.createElement('span'); top.className = 'shelf-cover-label'; top.textContent = 'ENTRELINHAS · BIBLIOTECA PESSOAL';
        const title = document.createElement('strong'); title.textContent = book.title;
        const star = document.createElement('span'); star.className = 'shelf-cover-star'; star.textContent = '✳';
        const author = document.createElement('span'); author.className = 'shelf-cover-author'; author.textContent = book.author;
        cover.append(top, title, star, author);
      }
      open.append(cover);
    }
    const info = document.createElement('div'); info.className = 'book-info';
    if (featured) {
      const language = document.createElement('span'); language.className = 'book-language'; language.textContent = featured.language; info.append(language);
    }
    const title = document.createElement('h3'); title.textContent = book.title;
    const author = document.createElement('p'); author.textContent = book.author;
    const track = document.createElement('div'); track.className = 'book-track';
    const bar = document.createElement('span'); bar.style.width = `${book.percent || 0}%`; track.append(bar);
    const status = document.createElement('span'); status.className = 'book-status';
    status.textContent = featured
      ? (record?.location ? `Continuar leitura · ${record.percent || 0}%` : 'Edição do site · Toque para ler')
      : (book.location ? `Continuar leitura · ${book.percent || 0}%` : 'Começar a leitura');
    info.append(title, author, track, status); open.append(info);
    open.addEventListener('click', () => featured ? openFeaturedBook(featured, record) : openStored(book));
    article.append(open);
    if (!featured || record) {
      const remove = document.createElement('button'); remove.className = 'remove-book icon-button'; remove.innerHTML = icon('trash'); remove.setAttribute('aria-label', `Remover ${book.title}`);
      remove.addEventListener('click', () => {
        pendingRemoval = book.id;
        $('#remove-description').textContent = book.title;
        $('#remove-dialog').showModal();
      });
      article.append(remove);
    }
    $('#shelf').append(article);
  }
}

async function fingerprint(bytes, filename) {
  if (crypto.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  let hash = 2166136261;
  for (const byte of new Uint8Array(bytes)) hash = Math.imul(hash ^ byte, 16777619);
  return `${filename}:${bytes.byteLength}:${hash >>> 0}`;
}

async function importFile(file, edition = null) {
  if (!file || importing || loadingFeatured) return;
  if (!/\.epub$/i.test(file.name)) { toast('Escolha um arquivo com a extensão .epub.'); return; }
  if (file.size > 150 * 1024 * 1024) { toast('Este EPUB é muito grande. Abra um arquivo de até 150 MB.'); return; }
  importing = true;
  busy('Abrindo sua próxima história…');
  let parsed;
  try {
    const bytes = await file.arrayBuffer();
    const id = await fingerprint(bytes, file.name);
    const existing = books.find(book => book.id === id);
    parsed = await readEpub(bytes, file.name, detail => { $('#busy-detail').textContent = detail; });
    const record = existing || { id, title: parsed.title, author: parsed.author, cover: parsed.cover, filename: file.name, addedAt: Date.now(), lastOpened: Date.now(), percent: 0, bookmarks: [] };
    if (edition) record.siteEdition = edition.id;
    try {
      await storeBook(record, bytes);
      if (!existing) books.push(record);
    } catch (error) { if (!existing) record.sessionOnly = true; console.error(error); toast('O navegador não conseguiu guardar o arquivo. Você pode ler agora; mantenha o EPUB original para abrir depois.'); }
    await activate(parsed, record);
    parsed = null;
  } catch (error) { parsed?.dispose(); showError(error); }
  finally { importing = false; $('#file-input').value = ''; $('#busy').hidden = true; }
}

async function openFeaturedBook(edition, record) {
  if (importing || loadingFeatured) return;
  loadingFeatured = true;
  busy('Verificando a edição do livro…', 'Se houver uma versão nova, a cópia salva será substituída');
  let file;
  let latestId;
  let latestRecord;
  let verificationError;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${edition.epub}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível carregar o livro incluído neste site.');
    const bytes = await response.arrayBuffer();
    file = new File([bytes], edition.filename, { type: 'application/epub+zip' });
    latestId = await fingerprint(bytes, file.name);
    latestRecord = books.find(book => book.id === latestId) || null;
  } catch (error) {
    verificationError = error;
  } finally {
    loadingFeatured = false;
    $('#busy').hidden = true;
  }
  if (verificationError) {
    if (record && !record.sessionOnly) {
      toast('Sem conexão para verificar a edição. Abrindo a cópia salva neste navegador.');
      await openStored(record);
    } else showError(verificationError);
    return;
  }

  try {
    const obsoleteRecords = books.filter(book => editionForRecord(book)?.id === edition.id && book.id !== latestId);
    if (obsoleteRecords.length) {
      for (const oldRecord of obsoleteRecords) await removeBook(oldRecord.id);
      const obsoleteIds = new Set(obsoleteRecords.map(book => book.id));
      books = books.filter(book => !obsoleteIds.has(book.id));
      renderLibrary();
      if (!latestRecord) toast('Uma nova edição foi encontrada. A leitura será reiniciada.');
    }

    const currentRecord = books.find(book => book.id === latestId);
    if (currentRecord && !currentRecord.sessionOnly && await getFile(currentRecord.id)) {
      await openStored(currentRecord);
    } else if (file) await importFile(file, edition);
  } catch (error) { showError(error); }
}

async function openStored(record) {
  if (importing || loadingFeatured) return;
  importing = true;
  busy('Voltando à sua leitura…');
  let parsed;
  try {
    const bytes = await getFile(record.id);
    if (!bytes) throw new Error('O arquivo não está mais neste navegador. Adicione o EPUB novamente para recuperar sua leitura.');
    parsed = await readEpub(bytes, record.filename, detail => { $('#busy-detail').textContent = detail; });
    await activate(parsed, record);
    parsed = null;
  } catch (error) { parsed?.dispose(); showError(error); }
  finally { importing = false; $('#busy').hidden = true; }
}

async function activate(book, record) {
  activeBook?.dispose();
  activeBook = book;
  activeRecord = record;
  activeRecord.lastOpened = Date.now();
  activeRecord.bookmarks ||= [];
  saveWarning = false;
  $('#reading-title').textContent = book.title;
  $('#reading-author').textContent = book.author;
  document.title = `${book.title} · Entrelinhas`;
  $('#library').hidden = true;
  $('.library-header').hidden = true;
  $('#reader').hidden = false;
  document.body.classList.add('is-reading');
  window.scrollTo(0, 0);
  applyPreferences();
  layoutKey = '';
  try { await rebuild(record.location); }
  catch (error) { await closeReader(); throw error; }
  $('#toc-button').focus({ preventScroll: true });
}

function dimensions() {
  const rect = $('#reading-stage').getBoundingClientRect();
  const spread = rect.width >= 900 && rect.height >= 430;
  const width = spread ? Math.min(490, Math.floor((rect.width - 136) / 2)) : Math.min(570, Math.floor(rect.width - (rect.width < 600 ? 24 : 120)));
  return { width: Math.max(220, width), height: Math.max(240, Math.min(800, Math.floor(rect.height - (rect.width < 600 ? 16 : 32)))), spread, padding: width < 380 ? 24 : 38 };
}

function location() {
  const page = layout?.pages[locationIndex];
  return page ? { section: page.section, offset: page.offset } : activeRecord?.location;
}

async function persistRecord() {
  if (!activeRecord || activeRecord.sessionOnly) return;
  try { await saveBook(activeRecord); }
  catch (error) { console.error(error); if (!saveWarning) { saveWarning = true; toast('Não foi possível salvar o progresso neste navegador. Verifique o espaço livre do dispositivo.'); } }
}

async function rebuild(restore = location()) {
  if (!activeBook || $('#reader').hidden) return;
  const dims = dimensions();
  const key = JSON.stringify([dims, preferences.size, preferences.font, preferences.spacing]);
  if (key === layoutKey && layout) return;
  const version = ++layoutVersion;
  layoutController?.abort();
  layoutController = new AbortController();
  rebuilding = true;
  busy('Acomodando as páginas…', 'Ajustando o livro à sua tela');
  try {
    const result = await paginate(activeBook, dims, (index, total) => { $('#busy-detail').textContent = `Organizando o texto · ${Math.round((index + 1) / total * 100)}%`; }, layoutController.signal);
    if (version !== layoutVersion) return;
    layout = result;
    layoutKey = key;
    const index = pageForLocation(layout.pages, restore);
    const mount = $('#book-mount');
    mount.style.width = `${dims.width * (dims.spread ? 2 : 1)}px`;
    mount.style.height = `${dims.height}px`;
    mount.style.setProperty('--page-padding', `${dims.padding}px`);
    mount.style.setProperty('--image-height', `${dims.height - 150}px`);
    const nodes = layout.pages.map((page, pageIndex) => {
      const leaf = document.createElement('div');
      leaf.className = 'leaf';
      const paper = document.createElement('div'); paper.className = 'page-paper';
      const head = document.createElement('div'); head.className = 'running-head'; head.textContent = activeBook.title;
      const content = document.createElement('div'); content.className = 'page-content'; content.lang = activeBook.language; content.innerHTML = page.html;
      const number = document.createElement('div'); number.className = 'page-number'; number.textContent = pageIndex + 1;
      paper.append(head, content, number); leaf.append(paper);
      return leaf;
    });
    const settings = { width: dims.width, height: dims.height, minWidth: dims.width, maxWidth: dims.width, minHeight: dims.height, maxHeight: dims.height, usePortrait: !dims.spread };
    if (!flip) {
      nodes.forEach(node => mount.append(node));
      flip = new PageFlip(mount, { ...settings, size: 'fixed', autoSize: false, startPage: index, showCover: false, drawShadow: true, maxShadowOpacity: 0.3, flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 750, mobileScrollSupport: false, swipeDistance: 40, showPageCorners: true, clickEventForward: true, disableFlipByClick: true });
      flip.on('flip', event => { if (!rebuilding) updatePosition(event.data); });
      flip.loadFromHTML(nodes);
      // Keep one renderer for the app's lifetime.
      configurePageTurner(flip, () => !$('#reader').hidden && !document.hidden);
    } else {
      Object.assign(flip.getSettings(), settings);
      mount.style.minWidth = `${dims.width * (dims.spread ? 2 : 1)}px`;
      mount.style.minHeight = `${dims.height}px`;
      flip.updateFromHtml(nodes);
      flip.update();
    }
    flip.turnToPage(index);
    rebuilding = false;
    updatePosition(flip.getCurrentPageIndex(), index);
    renderContents();
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
  } finally {
    if (version === layoutVersion) { rebuilding = false; $('#busy').hidden = true; }
  }
}

function updatePosition(index, focus = index) {
  if (!layout?.pages[index] || !activeRecord) return;
  currentIndex = index;
  const total = layout.pages.length;
  const end = Math.min(total, index + (flip.getOrientation() === 'landscape' ? 2 : 1));
  locationIndex = focus >= index && focus < end ? focus : index;
  const page = layout.pages[locationIndex];
  const percent = end === total ? 100 : Math.round(index / Math.max(1, total - 1) * 100);
  $('#chapter-label').textContent = page.title;
  $('#page-label').textContent = `${index + 1}${end > index + 1 ? `–${end}` : ''} de ${total}`;
  $('#percent-label').textContent = `${percent}%`;
  $('#progress').max = total - 1;
  $('#progress').value = index;
  $('#progress').style.setProperty('--progress', `${percent}%`);
  $('#progress').setAttribute('aria-valuetext', `Página ${index + 1} de ${total}, ${percent}%`);
  $('#previous').disabled = index === 0;
  $('#next').disabled = end === total;
  $('#previous-mobile').disabled = index === 0;
  $('#next-mobile').disabled = end === total;
  activeRecord.location = { section: page.section, offset: page.offset };
  activeRecord.percent = percent;
  activeRecord.lastOpened = Date.now();
  persistRecord();
  updateBookmarkButton();
  document.querySelectorAll('.chapter-item').forEach(button => {
    const active = Number(button.dataset.page) === index || Number(button.dataset.section) === page.section;
    if (active) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
  });
  // Hidden sheets must not contribute hundreds of links to the keyboard tab order.
  document.querySelectorAll('#book-mount .leaf').forEach((leaf, leafIndex) => {
    leaf.setAttribute('aria-hidden', String(leafIndex < index || leafIndex >= end));
    leaf.querySelectorAll('[data-book-target]').forEach(link => { link.tabIndex = leafIndex >= index && leafIndex < end ? 0 : -1; });
  });
}

function goTo(index) {
  if (!flip || rebuilding) return;
  flip.turnToPage(Math.max(0, Math.min(layout.pages.length - 1, index)));
  updatePosition(flip.getCurrentPageIndex(), index);
}

function renderContents() {
  const panel = $('#chapters-panel'); panel.replaceChildren();
  const toc = activeBook.toc.length ? activeBook.toc : activeBook.sections.map((section, index) => ({ label: section.title, page: layout.chapterStarts[index] }));
  for (const [index, item] of toc.entries()) {
    const page = item.page ?? layout.targets.get(item.target) ?? layout.targets.get(item.target?.split('#')[0]);
    if (page === undefined) continue;
    const button = document.createElement('button'); button.className = 'chapter-item'; button.dataset.page = page; button.dataset.section = layout.pages[page].section;
    if (layout.pages[page].section === layout.pages[locationIndex].section) button.setAttribute('aria-current', 'location');
    const n = document.createElement('span'); n.className = 'chapter-order'; n.textContent = String(index + 1).padStart(2, '0');
    const label = document.createElement('span'); label.textContent = item.label;
    const p = document.createElement('small'); p.textContent = page + 1;
    button.append(n, label, p); button.addEventListener('click', () => { $('#contents-dialog').close(); goTo(page); }); panel.append(button);
  }
  renderBookmarks();
}

function markAtCurrentPage(mark) { return pageForLocation(layout.pages, mark.location) === currentIndex || (flip.getOrientation() === 'landscape' && pageForLocation(layout.pages, mark.location) === currentIndex + 1); }
function updateBookmarkButton() {
  const marked = activeRecord.bookmarks.some(markAtCurrentPage);
  $('#bookmark-button').setAttribute('aria-pressed', String(marked));
  $('#bookmark-button').setAttribute('aria-label', marked ? 'Remover marcação desta página' : 'Marcar página');
  $('#bookmark-button').title = marked ? 'Remover marcação' : 'Marcar página';
}
function renderBookmarks() {
  $('#marks-count').textContent = activeRecord.bookmarks.length;
  const panel = $('#marks-panel'); panel.replaceChildren();
  if (!activeRecord.bookmarks.length) { const empty = document.createElement('p'); empty.className = 'empty-marks'; empty.textContent = 'Uma passagem para guardar? Toque no marcador durante a leitura. Suas páginas marcadas aparecem aqui.'; panel.append(empty); return; }
  for (const mark of [...activeRecord.bookmarks].sort((a, b) => a.location.section - b.location.section || a.location.offset - b.location.offset)) {
    const row = document.createElement('div'); row.className = 'mark-row';
    const page = pageForLocation(layout.pages, mark.location);
    const button = document.createElement('button'); button.className = 'mark-link';
    const title = document.createElement('strong'); title.textContent = mark.title;
    const excerpt = document.createElement('span'); excerpt.textContent = mark.excerpt;
    const number = document.createElement('small'); number.textContent = `Página ${page + 1}`;
    button.append(title, excerpt, number); button.addEventListener('click', () => { $('#contents-dialog').close(); goTo(page); });
    const remove = document.createElement('button'); remove.className = 'icon-button'; remove.innerHTML = icon('close'); remove.setAttribute('aria-label', `Remover marcação da página ${page + 1}`);
    remove.addEventListener('click', () => { activeRecord.bookmarks = activeRecord.bookmarks.filter(entry => entry.id !== mark.id); persistRecord(); renderBookmarks(); updateBookmarkButton(); });
    row.append(button, remove); panel.append(row);
  }
}

async function closeReader() {
  layoutController?.abort(); layoutVersion++; rebuilding = false;
  await persistRecord();
  $('#reader').hidden = true;
  $('#library').hidden = false;
  $('.library-header').hidden = false;
  document.body.classList.remove('is-reading');
  document.title = 'Entrelinhas · Leitor EPUB';
  document.body.dataset.theme = 'paper';
  activeBook?.dispose(); activeBook = null; activeRecord = null;
  $('#busy').hidden = true;
  renderLibrary();
  $('#shelf .book-open')?.focus({ preventScroll: true });
}

document.querySelectorAll('.import-trigger').forEach(button => button.addEventListener('click', () => $('#file-input').click()));
$('#file-input').addEventListener('change', event => importFile(event.target.files[0]));
let dragCounter = 0;
document.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); dragCounter++; if (!activeBook) $('#dropzone').classList.add('drag-over'); } });
document.addEventListener('dragleave', () => { if (--dragCounter <= 0) { dragCounter = 0; $('#dropzone').classList.remove('drag-over'); } });
document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
document.addEventListener('drop', event => { if (event.dataTransfer.files.length) { event.preventDefault(); dragCounter = 0; $('#dropzone').classList.remove('drag-over'); if (!activeBook) importFile(event.dataTransfer.files[0]); else toast('Volte à biblioteca para abrir outro EPUB.'); } });
$('#back-library').addEventListener('click', closeReader);
$('#toc-button').addEventListener('click', () => { renderBookmarks(); $('#contents-dialog').showModal(); });
$('#settings-button').addEventListener('click', () => $('#settings-dialog').showModal());
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
$('#cancel-remove').addEventListener('click', () => $('#remove-dialog').close());
$('#confirm-remove').addEventListener('click', async () => {
  try { await removeBook(pendingRemoval); books = books.filter(book => book.id !== pendingRemoval); $('#remove-dialog').close(); renderLibrary(); toast('Livro removido deste navegador.'); }
  catch (error) { showError(error); }
});
function switchTab(marks) {
  $('#chapters-tab').setAttribute('aria-selected', String(!marks)); $('#marks-tab').setAttribute('aria-selected', String(marks));
  $('#chapters-tab').tabIndex = marks ? -1 : 0; $('#marks-tab').tabIndex = marks ? 0 : -1;
  $('#chapters-panel').hidden = marks; $('#marks-panel').hidden = !marks;
}
$('#chapters-tab').addEventListener('click', () => switchTab(false));
$('#marks-tab').addEventListener('click', () => switchTab(true));
$('.tabs').addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const marks = event.key === 'End' || (event.key !== 'Home' && $('#marks-tab').getAttribute('aria-selected') !== 'true'); switchTab(marks); $(marks ? '#marks-tab' : '#chapters-tab').focus(); } });
$('#previous').addEventListener('click', () => { if (!rebuilding && currentIndex > 0) flip?.flipPrev('bottom'); });
$('#next').addEventListener('click', () => { if (!rebuilding && !$('#next').disabled) flip?.flipNext('bottom'); });
$('#previous-mobile').addEventListener('click', () => { if (!rebuilding && currentIndex > 0) flip?.flipPrev('bottom'); });
$('#next-mobile').addEventListener('click', () => { if (!rebuilding && !$('#next-mobile').disabled) flip?.flipNext('bottom'); });
$('#progress').addEventListener('input', event => goTo(Number(event.target.value)));
$('#bookmark-button').addEventListener('click', () => {
  if (!activeRecord || rebuilding) return;
  const existing = activeRecord.bookmarks.filter(markAtCurrentPage);
  if (existing.length) { activeRecord.bookmarks = activeRecord.bookmarks.filter(mark => !existing.includes(mark)); toast('Marcação removida.'); }
  else {
    const page = layout.pages[locationIndex]; const content = document.createElement('div'); content.innerHTML = page.html;
    activeRecord.bookmarks.push({ id: `${page.section}:${page.offset}`, location: location(), title: page.title, excerpt: content.textContent.trim().slice(0, 120) + '…' });
    toast('Página marcada. Você a encontra no sumário.');
  }
  persistRecord(); updateBookmarkButton(); renderBookmarks();
});
$('#fullscreen-button').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('A tela cheia não está disponível neste navegador.'); }
});
if (!document.fullscreenEnabled) $('#fullscreen-button').hidden = true;

function changePreference(key, value) {
  const restore = location();
  preferences[key] = value; savePreferences(preferences); applyPreferences();
  if (key !== 'theme') { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => rebuild(restore).catch(showError), 200); }
}
$('#font-smaller').addEventListener('click', () => changePreference('size', Math.max(14, preferences.size - 1)));
$('#font-larger').addEventListener('click', () => changePreference('size', Math.min(28, preferences.size + 1)));
for (const key of ['font', 'theme', 'spacing']) document.querySelectorAll(`button[data-${key}]`).forEach(button => button.addEventListener('click', () => changePreference(key, button.dataset[key])));
document.addEventListener('keydown', event => {
  if (!activeBook || rebuilding || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName) && !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.matches('input,textarea,select')) return;
  if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); if (!$('#next').disabled) flip.flipNext('bottom'); }
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); if (!$('#previous').disabled) flip.flipPrev('bottom'); }
});
function followBookLink(event) {
  const link = event.target.closest('[data-book-target]');
  if (!link || (event.type === 'keydown' && event.key !== 'Enter')) return;
  event.preventDefault(); event.stopPropagation();
  const target = layout.targets.get(link.dataset.bookTarget) ?? layout.targets.get(link.dataset.bookTarget.split('#')[0]);
  if (target !== undefined) goTo(target);
}
$('#book-mount').addEventListener('click', followBookLink);
$('#book-mount').addEventListener('keydown', followBookLink);
new ResizeObserver(() => {
  if (!activeBook || importing || $('#reader').hidden) return;
  clearTimeout(resizeTimer); resizeTimer = setTimeout(() => rebuild().catch(showError), 300);
}).observe($('#reading-stage'));
window.addEventListener('pagehide', () => { if (activeRecord) persistRecord(); });

try { books = await getBooks(); renderLibrary(); }
catch (error) { console.error(error); renderLibrary(); toast('O armazenamento local está indisponível. Você ainda pode abrir um EPUB para ler nesta sessão.'); }
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(error => console.warn('Offline indisponível:', error));
