export const featuredEditions = [
  { id: 'pt-BR', title: 'Meninos Contra a Guerra', author: 'João Arantes', language: 'Português', epub: 'books/meninos-contra-a-guerra-pt-br.epub', cover: 'covers/meninos-contra-a-guerra-pt-br.png', filename: 'Meninos Contra a Guerra.epub' },
  { id: 'en-US', title: 'Boys Against the War', author: 'João Arantes', language: 'Inglês', epub: 'books/boys-against-the-war-en.epub', cover: 'covers/boys-against-the-war-en.png', filename: 'Boys Against the War.epub' },
  { id: 'es-419', title: 'Chicos Contra la Guerra', author: 'João Arantes', language: 'Espanhol', epub: 'books/chicos-contra-la-guerra-es.epub', cover: 'covers/chicos-contra-la-guerra-es.png', filename: 'Chicos contra la guerra.epub' },
  { id: 'fr-FR', title: 'Des Garçons Contre la Guerre', author: 'João Arantes', language: 'Francês', epub: 'books/des-garcons-contre-la-guerre-fr.epub', cover: 'covers/des-garcons-contre-la-guerre-fr.png', filename: 'Des garçons contre la guerre.epub' },
  { id: 'it-IT', title: 'Ragazzi Contro la Guerra', author: 'João Arantes', language: 'Italiano', epub: 'books/ragazzi-contro-la-guerra-it.epub', cover: 'covers/ragazzi-contro-la-guerra-it.png', filename: 'Ragazzi contro la guerra.epub' },
];

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export function editionForRecord(book) {
  return featuredEditions.find(edition =>
    book.siteEdition === edition.id ||
    (normalize(book.title) === normalize(edition.title) && normalize(book.author) === normalize(edition.author))
  ) || null;
}
