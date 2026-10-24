# Entrelinhas

Leitor web de EPUB com páginas que acompanham o arrasto do dedo ou do mouse. Os livros, o progresso e as marcações ficam no IndexedDB do navegador. Preferências de aparência ficam no armazenamento local. Não há conta, servidor de arquivos, analytics ou envio de EPUBs.

## Executar

Requer Node.js 22.12 ou superior.

```sh
cd leitor
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`. Selecione um `.epub` ou arraste-o para a biblioteca. No computador, use as setas do teclado, os botões laterais ou arraste os cantos. No celular/tablet, arraste a página. Os botões de aparência permitem alterar fonte, tamanho, espaçamento e tema.

Livros ficam disponíveis na biblioteca depois de fechar e reabrir a página. O progresso é salvo automaticamente. Cada navegador, perfil, dispositivo e endereço do site tem sua própria biblioteca. Mudar de `localhost` para o endereço publicado exige adicionar os EPUBs novamente. Mantenha os arquivos originais: limpar os dados do site, usar navegação privada ou o navegador liberar espaço pode apagar a biblioteca.

## Produção e uso offline

```sh
npm run build
npm run preview
```

O resultado está em `dist/`. Em produção, um service worker guarda o leitor para uso offline depois da primeira visita completa. O recurso requer HTTPS ou localhost. Abra a página pelo menos uma vez com internet antes de viajar e adicione os livros ao aparelho. No modo de desenvolvimento não há cache offline.

## Publicar no Vercel

Importe o repositório no Vercel e configure **Root Directory: `leitor`**, **Framework: Vite**, **Build Command: `npm run build`**, **Output Directory: `dist`**. O `vercel.json` já inclui essas configurações e cabeçalhos de segurança. Também é possível executar `npx vercel` dentro desta pasta.

Publique somente esta pasta. A estante inclui cinco edições de João Arantes: português, inglês, espanhol, francês e italiano. O catálogo em `src/catalog.js` define títulos, idiomas e caminhos para `public/books/` e `public/covers/`. Tocar em uma edição baixa seu EPUB e salva uma cópia na biblioteca local do navegador, com progresso e marcações próprios.

Ao abrir uma edição com internet, o leitor verifica o arquivo publicado. Quando houver uma atualização, substitui as cópias anteriores daquela edição; sem conexão, abre a cópia local disponível. O aplicativo e as cinco capas são guardados para uso offline. Os EPUBs são salvos no dispositivo depois de abertos. A edição portuguesa antiga foi substituída pela edição com capa padronizada.

## Compatibilidade

- EPUB 2 e EPUB 3 de texto ajustável, incluindo sumário NCX ou navegação HTML, imagens locais PNG/JPEG/GIF/WebP/AVIF/BMP e formatação básica.
- As páginas são recalculadas conforme a tela e a tipografia. A posição usa capítulo e deslocamento no texto, em vez de depender de um número de página fixo.
- O leitor aplica sua própria tipografia. Layouts editoriais complexos, CSS/fontes embutidos, EPUB de layout fixo, escrita vertical, fluxo de páginas da direita para a esquerda e DRM não são suportados nesta versão.
- Scripts, formulários, conteúdo incorporado e recursos remotos do livro são removidos. Links internos de notas e capítulos permitem navegar no texto; links externos não são ativados.
- Arquivos de até 150 MB. O espaço total disponível depende do navegador e do dispositivo.

## Estrutura

- `src/epub.js`: leitura do pacote EPUB, sumário e conteúdo sanitizado.
- `src/pagination.js`: paginação e preservação da posição entre tamanhos de tela/fonte.
- `src/storage.js`: biblioteca e arquivos locais no IndexedDB.
- `src/main.js`: biblioteca, controles e integração com StPageFlip.
- `src/page-turn.js`: ajustes de toque e renderização para StPageFlip 2.0.7.
- `vite.config.js`: compilação e cache offline do aplicativo.

Dependências: JSZip (MIT/GPL-3.0, utilizável sob MIT), DOMPurify (Apache-2.0/MPL-2.0) e StPageFlip (MIT). O deploy inclui os cinco EPUBs e suas capas indicados no catálogo. Os textos de trabalho e traduções reversas ficam fora da publicação.
