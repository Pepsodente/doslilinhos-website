# Integração no `src/index.js`

1. No início do ficheiro:

```js
import { sendEmail } from './email-service.js';
import { workflowRoute } from './workflow-routes.js';
```

2. No início do método `fetch`, antes das rotas existentes:

```js
const workflowResponse = await workflowRoute(request, env);
if (workflowResponse) return workflowResponse;
```

3. Depois de criar uma reserva/encomenda, enviar os dois emails:

```js
const emailData = {
  name: customer.name,
  email: customer.email,
  number: orderNumber,
  items: [{ name: product.name, quantity: `${quantityEggs} unidades` }],
  note: body.notes,
  url: `${env.SITE_URL}/encomendas.html`,
  adminUrl: `${env.SITE_URL}/admin.html`
};
ctx.waitUntil(Promise.allSettled([
  sendEmail(env, env.DB, { type: 'order_received', to: customer.email, data: emailData, customerId: customer.id, orderId }),
  sendEmail(env, env.DB, { type: 'order_admin', to: env.ADMIN_EMAIL, data: emailData, customerId: customer.id, orderId })
]));
```

4. Depois de criar um pedido de subscrição:

```js
ctx.waitUntil(sendEmail(env, env.DB, {
  type: 'subscription_received',
  to: customer.email,
  customerId: customer.id,
  subscriptionId,
  data: {
    name: customer.name,
    product: product.name,
    quantity: `${body.eggs} unidades`,
    frequency: frequencyLabels[body.frequency],
    shortage: shortageLabels[body.shortagePreference],
    url: `${env.SITE_URL}/subscricoes.html`
  }
}));
```

> Se o Worker atual não recebe `ctx`, alterar a assinatura para `async fetch(request, env, ctx)`.
