# Fluxo automático de emails e aprovações

Remetente: `Da terra para ti 🌱 <encomendas@doslilinhos.pt>`

## Incluído
- emails neutros para todos os produtos;
- símbolos específicos apenas na lista de produtos;
- aprovação/rejeição administrativa de pedidos e subscrições;
- estados de preparação, pronto e concluído;
- histórico de emails e eventos;
- comunicação moderna, direta e com emojis discretos;
- integração por Resend.

## Secrets no Cloudflare
- `RESEND_API_KEY`
- `EMAIL_FROM` = `Da terra para ti 🌱 <encomendas@doslilinhos.pt>`
- `EMAIL_REPLY_TO` = `encomendas@doslilinhos.pt`
- `ADMIN_EMAIL` = `encomendas@doslilinhos.pt`
- `SITE_URL` = `https://doslilinhos.pt`

## Ordem
1. Verificar o domínio no Resend.
2. Aplicar `migrations/0004_email_workflow.sql` uma única vez.
3. Copiar `src/email-service.js` e `src/workflow-routes.js`.
4. Seguir `INTEGRAR-NO-WORKER.md`.
5. Acrescentar `public/admin-workflow-addon.js` ao painel administrativo.
6. Testar primeiro com um pedido e uma subscrição de teste.
