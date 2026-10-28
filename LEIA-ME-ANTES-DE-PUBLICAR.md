# Instalação da atualização Dos Lilinhos

1. Guardar uma cópia do repositório atual.
2. Copiar `src/index.js`, `public/index.html`, `public/style.css` e `public/script.js`.
3. Manter os atuais `public/admin.html`, `public/admin.js` e a imagem PNG.
4. Copiar `wrangler.jsonc` e `package.json`.
5. No terminal do projeto: `npm install`.
6. Aplicar a migração: `npx wrangler d1 migrations apply doslilinhos-producao --remote`.
7. Configurar o segredo administrativo: `npx wrangler secret put ADMIN_TOKEN`.
8. Testar: `npm run dev`.
9. Publicar: `npm run deploy`.

Nota: o stock é a soma de `inventory_movements.quantity_eggs`. Se a PWA atual usa outra tabela ou outro nome de coluna, adaptar apenas a função `stock()` em `src/index.js` antes do deploy.
