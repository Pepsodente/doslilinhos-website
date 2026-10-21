# Arquitetura proposta: PWA, stock e encomendas

## Fluxo
1. O utilizador regista na PWA uma recolha de ovos, perdas ou ajustes.
2. A PWA envia o movimento para uma API protegida no Cloudflare Worker.
3. O Worker valida o pedido e grava o movimento na base Cloudflare D1.
4. O stock é calculado por soma de movimentos, nunca alterado diretamente.
5. O website consulta apenas o stock publicável.
6. Ao reservar, uma transação confirma stock suficiente e cria a encomenda.
7. O stock fica reservado até confirmação, pagamento ou expiração.

## Tabelas essenciais
- customers: dados mínimos de clientes e consentimentos.
- sessions: sessões de autenticação.
- products: por exemplo caixa de 6 ovos.
- inventory_movements: recolha, perda, ajuste, reserva, cancelamento e venda.
- orders: encomenda e estado.
- order_items: produto, quantidade e preço no momento da encomenda.
- stock_batches: data de postura/recolha, quantidade, método e validade.

## Regras importantes
- Nunca confiar no stock mostrado no navegador.
- Confirmar stock dentro da base de dados quando a encomenda é criada.
- A PWA deve usar autenticação administrativa separada da conta de cliente.
- Guardar palavras-passe apenas com hash robusto e sessões seguras.
- Aplicar RGPD: minimização de dados, consentimento, política de privacidade e eliminação de conta.
- Definir expiração das reservas para devolver automaticamente stock não confirmado.
