const DB_NAME = 'entrelinhas';
let database;

function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('books', { keyPath: 'id' });
      db.createObjectStore('files');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
    request.onblocked = () => { database = null; reject(new Error('Feche outras abas do leitor e tente novamente.')); };
  });
  return database;
}

async function transact(stores, mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let request;
    try { request = operation(tx); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Não foi possível salvar neste navegador.'));
  });
}

export const getBooks = () => transact(['books'], 'readonly', tx => tx.objectStore('books').getAll());
export const getFile = id => transact(['files'], 'readonly', tx => tx.objectStore('files').get(id));
export const saveBook = book => transact(['books'], 'readwrite', tx => tx.objectStore('books').put(book));
export const storeBook = (book, bytes) => transact(['books', 'files'], 'readwrite', tx => {
  tx.objectStore('files').put(bytes, book.id);
  return tx.objectStore('books').put(book);
});
export const removeBook = id => transact(['books', 'files'], 'readwrite', tx => {
  tx.objectStore('files').delete(id);
  return tx.objectStore('books').delete(id);
});

export function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('entrelinhas-preferences') || '{}');
    return {
      size: Math.max(14, Math.min(28, Number(saved.size) || 18)),
      font: saved.font === 'sans' ? 'sans' : 'serif',
      theme: ['paper', 'sepia', 'night'].includes(saved.theme) ? saved.theme : 'paper',
      spacing: saved.spacing === 'wide' ? 'wide' : 'normal',
    };
  } catch { return { size: 18, font: 'serif', theme: 'paper', spacing: 'normal' }; }
}

export function savePreferences(preferences) {
  try { localStorage.setItem('entrelinhas-preferences', JSON.stringify(preferences)); } catch { /* Reading still works when settings storage is disabled. */ }
}
