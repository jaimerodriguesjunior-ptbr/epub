import JSZip from 'jszip';
import DOMPurify from 'dompurify';

const parser = new DOMParser();
const containers = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE']);
const allowedTags = ['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'hr', 'em', 'i', 'b', 'strong', 'u', 's', 'small', 'sup', 'sub', 'blockquote', 'pre', 'code', 'ol', 'ul', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'img', 'a', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'ruby', 'rt', 'rp'];

export function resolvePath(base, reference = '') {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) return null;
  const [path, fragment] = reference.split('#');
  let decoded;
  try { decoded = decodeURIComponent(path.split('?')[0]); } catch { decoded = path.split('?')[0]; }
  const parts = (decoded ? (decoded.startsWith('/') ? '' : base.slice(0, base.lastIndexOf('/') + 1)) + decoded : base).split('/');
  const normalized = [];
  for (const part of parts) {
    if (part === '..') normalized.pop();
    else if (part && part !== '.') normalized.push(part);
  }
  let anchor = fragment;
  try { anchor = fragment ? decodeURIComponent(fragment) : fragment; } catch { /* Preserve malformed fragments as literal IDs. */ }
  return normalized.join('/') + (anchor ? `#${anchor}` : '');
}

function xml(source, description) {
  const document = parser.parseFromString(source, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error(`O ${description} do EPUB está inválido.`);
  return document;
}
const elements = (root, name) => [...root.getElementsByTagNameNS('*', name)];
const text = (root, name) => elements(root, name)[0]?.textContent?.trim() || '';

export async function readEpub(bytes, filename, onProgress = () => {}) {
  let archive;
  try { archive = await JSZip.loadAsync(bytes); }
  catch { throw new Error('Não foi possível ler este EPUB. O arquivo pode estar incompleto, danificado ou protegido.'); }
  const urls = [];
  const assetCache = new Map();
  const dispose = () => urls.forEach(url => URL.revokeObjectURL(url));
  try {
    const containerFile = archive.file('META-INF/container.xml');
    if (!containerFile) throw new Error('Este arquivo não parece ser um EPUB válido.');
    const container = xml(await containerFile.async('string'), 'contêiner');
    const packagePath = elements(container, 'rootfile')[0]?.getAttribute('full-path');
    const packageFile = archive.file(packagePath || '');
    if (!packageFile) throw new Error('Não foi possível encontrar o conteúdo deste EPUB.');
    const opf = xml(await packageFile.async('string'), 'índice');
    const title = text(opf, 'title') || filename.replace(/\.epub$/i, '');
    const author = elements(opf, 'creator').map(node => node.textContent.trim()).filter(Boolean).join(', ') || 'Autor não informado';
    const language = text(opf, 'language') || 'pt-BR';
    const manifest = new Map(elements(opf, 'manifest')[0] ? elements(elements(opf, 'manifest')[0], 'item').map(item => [item.getAttribute('id'), {
      path: resolvePath(packagePath, item.getAttribute('href')),
      type: item.getAttribute('media-type'), properties: item.getAttribute('properties') || '',
    }]) : []);
    if (elements(opf, 'meta').some(node => node.getAttribute('property') === 'rendition:layout' && node.textContent.trim() === 'pre-paginated')) {
      throw new Error('Este EPUB tem páginas de layout fixo. Por enquanto, abra um EPUB de texto ajustável.');
    }
    const encryption = archive.file('META-INF/encryption.xml');
    if (encryption) {
      const encrypted = await encryption.async('string');
      if (/adobe\.com\/adept|readium\.org\/2014\/01\/lcp/i.test(encrypted)) throw new Error('Este EPUB tem proteção DRM e precisa ser aberto no aplicativo autorizado pela loja.');
    }
    const asset = async path => {
      if (!path) return null;
      const cleanPath = path.split('#')[0];
      if (!assetCache.has(cleanPath)) assetCache.set(cleanPath, (async () => {
        const file = archive.file(cleanPath);
        if (!file) return null;
        const type = [...manifest.values()].find(item => item.path === cleanPath)?.type || 'application/octet-stream';
        if (!/^image\/(?:png|jpeg|gif|webp|avif|bmp)$/i.test(type)) return null;
        const url = URL.createObjectURL(new Blob([await file.async('uint8array')], { type }));
        urls.push(url);
        return url;
      })());
      return assetCache.get(cleanPath);
    };

    const navItem = [...manifest.values()].find(item => item.properties.split(/\s+/).includes('nav'));
    let toc = [];
    if (navItem && archive.file(navItem.path)) {
      const nav = parser.parseFromString(await archive.file(navItem.path).async('string'), 'text/html');
      const navRoot = [...nav.querySelectorAll('nav')].find(node => (node.getAttribute('epub:type') || node.getAttribute('role') || '').includes('toc')) || nav.querySelector('nav');
      toc = [...(navRoot?.querySelectorAll('a[href]') || [])].map(link => ({ label: link.textContent.trim(), target: resolvePath(navItem.path, link.getAttribute('href')) })).filter(item => item.target && item.label);
    }
    if (!toc.length) {
      const ncxItem = [...manifest.values()].find(item => item.type === 'application/x-dtbncx+xml');
      if (ncxItem && archive.file(ncxItem.path)) {
        const ncx = xml(await archive.file(ncxItem.path).async('string'), 'sumário');
        toc = elements(ncx, 'navPoint').map(point => ({ label: text(elements(point, 'navLabel')[0] || point, 'text'), target: resolvePath(ncxItem.path, elements(point, 'content')[0]?.getAttribute('src') || '') })).filter(item => item.label && item.target);
      }
    }

    const sections = [];
    if (elements(opf, 'spine')[0]?.getAttribute('page-progression-direction') === 'rtl') throw new Error('Este EPUB usa leitura da direita para a esquerda, ainda não suportada nesta versão.');
    const spine = elements(opf, 'itemref').filter(item => item.getAttribute('linear') !== 'no');
    for (let spineIndex = 0; spineIndex < spine.length; spineIndex++) {
      const item = manifest.get(spine[spineIndex].getAttribute('idref'));
      if (!item?.path || !archive.file(item.path)) continue;
      onProgress(`Lendo o conteúdo · ${spineIndex + 1} de ${spine.length}`);
      const source = await archive.file(item.path).async('string');
      const sourceDocument = parser.parseFromString(source, 'text/html');
      // Convert common SVG cover wrappers into ordinary local images before sanitizing.
      for (const svg of sourceDocument.querySelectorAll('svg')) {
        const image = svg.querySelector('image');
        const href = image?.getAttribute('href') || image?.getAttribute('xlink:href');
        if (href) { const img = sourceDocument.createElement('img'); img.setAttribute('src', href); img.alt = svg.querySelector('title')?.textContent || 'Ilustração'; svg.replaceWith(img); }
      }
      const safe = DOMPurify.sanitize(sourceDocument.body.innerHTML, {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: ['id', 'class', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'lang', 'dir', 'epub:type'],
        ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
        RETURN_DOM_FRAGMENT: true,
      });
      for (const node of safe.querySelectorAll('[id]')) { node.dataset.anchor = `${item.path}#${node.id}`; node.removeAttribute('id'); }
      for (const node of safe.querySelectorAll('[class]')) {
        // Book styles do not enter the application. Keep only conventional alignment/ornament hints.
        node.className = [...node.classList].filter(name => ['center', 'right', 'justify', 'byline', 'ornament', 'divider', 'scene-heading'].includes(name)).map(name => `epub-${name}`).join(' ');
      }
      await Promise.all([...safe.querySelectorAll('img')].map(async img => {
        const url = await asset(resolvePath(item.path, img.getAttribute('src') || ''));
        if (url) { img.src = url; img.draggable = false; }
        else img.replaceWith(sourceDocument.createTextNode(img.alt ? `[${img.alt}]` : ''));
      }));
      for (const link of safe.querySelectorAll('a')) {
        const href = link.getAttribute('href');
        const target = href ? resolvePath(item.path, href) : null;
        link.removeAttribute('href');
        if (target) { link.dataset.bookTarget = target; link.setAttribute('role', 'link'); link.tabIndex = 0; }
      }
      let section = { title: toc.find(entry => entry.target.split('#')[0] === item.path)?.label || title, path: item.path, blocks: [] };
      const add = node => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.textContent.trim()) { const p = document.createElement('p'); p.textContent = node.textContent; section.blocks.push(p.outerHTML); }
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (containers.has(node.tagName)) {
          if (node.dataset.anchor) { const marker = document.createElement('span'); marker.dataset.anchor = node.dataset.anchor; marker.className = 'anchor-marker'; section.blocks.push(marker.outerHTML); }
          [...node.childNodes].forEach(add); return;
        }
        if (/^H[12]$/.test(node.tagName) && section.blocks.some(block => !block.includes('class="anchor-marker"'))) {
          sections.push(section);
          section = { title: node.textContent.trim() || title, path: item.path, blocks: [] };
        } else if (/^H[12]$/.test(node.tagName)) section.title = node.textContent.trim() || title;
        section.blocks.push(node.outerHTML);
      };
      [...safe.childNodes].forEach(add);
      if (section.blocks.length) sections.push(section);
    }
    if (!sections.length) throw new Error('Não encontramos páginas de texto neste EPUB.');
    const coverId = elements(opf, 'meta').find(node => node.getAttribute('name') === 'cover')?.getAttribute('content');
    const coverItem = manifest.get(coverId) || [...manifest.values()].find(item => item.properties.split(/\s+/).includes('cover-image'));
    let cover;
    if (coverItem) {
      const coverUrl = await asset(coverItem.path);
      if (coverUrl) cover = new Blob([await archive.file(coverItem.path.split('#')[0]).async('uint8array')], { type: coverItem.type });
    }
    return { title, author, language, sections, toc, cover, dispose };
  } catch (error) { dispose(); throw error; }
}
