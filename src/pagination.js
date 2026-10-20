const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

function textPosition(node, offset) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let current;
  while ((current = walker.nextNode())) {
    if (remaining <= current.length) return [current, remaining];
    remaining -= current.length;
  }
  return [node, node.childNodes.length];
}

function fragmentAt(node, offset, before) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const [target, index] = textPosition(node, offset);
  if (before) range.setEnd(target, index);
  else range.setStart(target, index);
  const clone = node.cloneNode(false);
  clone.append(range.cloneContents());
  if (!before) { clone.classList.add('continued'); clone.removeAttribute('data-anchor'); }
  return clone;
}

function splitToFit(node, measure) {
  const content = node.textContent;
  if (!content.trim() || /^H[1-6]$/.test(node.tagName) || node.tagName === 'FIGURE') return null;
  const ends = [...content.matchAll(/\S+\s*/gu)].map(match => match.index + match[0].length);
  if (ends.length < 2) return null;
  let low = 0, high = ends.length - 2, best = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const candidate = fragmentAt(node, ends[mid], true);
    measure.append(candidate);
    const fits = measure.scrollHeight <= measure.clientHeight + 1;
    candidate.remove();
    if (fits) { best = mid; low = mid + 1; } else high = mid - 1;
  }
  if (best < 0) return null;
  return [fragmentAt(node, ends[best], true), fragmentAt(node, ends[best], false), ends[best]];
}

export async function paginate(book, dimensions, onProgress, signal) {
  const measure = document.querySelector('#measure');
  measure.style.width = `${dimensions.width - dimensions.padding * 2}px`;
  measure.style.height = `${dimensions.height - 112}px`;
  measure.style.setProperty('--image-height', `${dimensions.height - 150}px`);
  measure.replaceChildren();
  const pages = [];
  const targets = new Map();
  const chapterStarts = [];
  let work = 0;
  for (let sectionIndex = 0; sectionIndex < book.sections.length; sectionIndex++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const section = book.sections[sectionIndex];
    chapterStarts.push(pages.length);
    if (!targets.has(section.path)) targets.set(section.path, pages.length);
    let consumed = 0;
    let pageOffset = 0;
    const flush = () => {
      if (!measure.childNodes.length) return;
      for (const node of measure.querySelectorAll('[data-anchor]')) if (!targets.has(node.dataset.anchor)) targets.set(node.dataset.anchor, pages.length);
      pages.push({ html: measure.innerHTML, section: sectionIndex, offset: pageOffset, title: section.title });
      measure.replaceChildren();
      pageOffset = consumed;
    };
    for (const html of section.blocks) {
      const template = document.createElement('template');
      template.innerHTML = html;
      let node = template.content.firstChild;
      if (!node) continue;
      // Image dimensions must settle before deciding page boundaries.
      await Promise.all([...node.querySelectorAll('img'), ...(node.tagName === 'IMG' ? [node] : [])].map(image => image.decode().catch(() => {})));
      while (node) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        measure.append(node);
        if (measure.scrollHeight <= measure.clientHeight + 1) {
          consumed += node.textContent.length;
          node = null;
        } else {
          node.remove();
          const split = splitToFit(node, measure);
          if (split) {
            measure.append(split[0]);
            consumed += split[2];
            flush();
            node = split[1];
          } else if (measure.textContent.trim() || measure.querySelector('img,hr')) flush();
          else {
            // A single unbreakable block (for example a wide table) gets its own scrollable page.
            const wrapper = document.createElement('div');
            wrapper.className = 'oversize-block';
            wrapper.append(node);
            measure.append(wrapper);
            consumed += node.textContent.length;
            flush();
            node = null;
          }
        }
      }
      if (++work % 20 === 0) { onProgress(sectionIndex, book.sections.length); await nextFrame(); }
    }
    flush();
  }
  measure.replaceChildren();
  return { pages, targets, chapterStarts };
}

export function pageForLocation(pages, location) {
  if (!location) return 0;
  let found = pages.findIndex(page => page.section === location.section);
  if (found < 0) return 0;
  for (let index = found; index < pages.length && pages[index].section === location.section; index++) {
    if (pages[index].offset <= location.offset) found = index;
    else break;
  }
  return found;
}
