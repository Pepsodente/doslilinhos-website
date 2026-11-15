const adminOrderReferences = new Map();

const $ = selector =>
  document.querySelector(selector);

const esc = value => {
  const replacements = {
    '\u0026': '\u0026amp;',
    '\u003C': '\u0026lt;',
    '\u003E': '\u0026gt;',
    '\u0022': '\u0026quot;',
    '\u0027': '\u0026#39;'
  };

  return String(value ?? '').replace(
    /[\u0026\u003C\u003E\u0022\u0027]/g,
    character => replacements[character]
  );
};

let token =
  sessionStorage.getItem('dl_admin_token') || '';

let data = {
  orders: [],
  subscriptions: []
};

let view = 'orders';
let summary = 'all';
let auditEvents = [];
let fiscalDocs = [];
const busy = new Set();

const PORTAL_AT_URL =
  'https://irs.portaldasfinancas.gov.pt/recibos/portal/emitir/emitirDocumentos';

const frequencies = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal'
};

const labels = {
  pending: 'Por aprovar',
  payment: 'A aguardar pagamento',
  paid: 'Pago',
  preparing: 'Em preparação',
  ready: 'Pronto',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  confirmed: 'Confirmado',
  requested: 'Por aprovar',
  active: 'Ativa',
  paused: 'Pausada',
  rejected: 'Recusada',
  issue: 'Problema em análise',
  refund: 'Reembolso pendente',
  refunded: 'Reembolsada',
  refund_failed: 'Falha no reembolso',
  invoice: 'Por faturar',
  credit: 'Nota de crédito pendente',
  not_required: 'Não aplicável',
  issued: 'Emitido',
  succeeded: 'Concluído',
  failed: 'Falhou'
};

function msg(text) {
  const message = $('#message');

  if (!message) {
    return;
  }

  message.textContent = text;
  message.classList.remove('hidden');

  window.setTimeout(
    () => {
      message.classList.add('hidden');
    },
    4500
  );
}

async function api(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(
    path,
    {
      ...options,
      headers
    }
  );

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error(
      `Resposta inválida do servidor: HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    throw new Error(
      result.error || 'Erro no pedido.'
    );
  }

  return result;
}

function money(cents) {
  return new Intl.NumberFormat(
    'pt-PT',
    {
      style: 'currency',
      currency: 'EUR'
    }
  ).format(
    (Number(cents) || 0) / 100
  );
}

function date(value) {
  if (!value) {
    return '—';
  }

  const normalized =
    String(value).includes('T')
      ? String(value)
      : `${String(value).replace(' ', 'T')}Z`;

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return esc(value);
  }

  return new Intl.DateTimeFormat(
    'pt-PT',
    {
      dateStyle: 'short',
      timeStyle: 'short'
    }
  ).format(parsed);
}

function orderState(order) {
  if (order.incident_status === 'reported') {
    if (order.refund_status === 'pending') {
      return 'refund';
    }

    if (order.refund_status === 'succeeded') {
      return 'refunded';
    }

    if (order.refund_status === 'failed') {
      return 'refund_failed';
    }

    return 'issue';
  }

  if (order.credit_note_status === 'pending') {
    return 'credit';
  }

  if (order.approval_status === 'preparing') {
    return 'preparing';
  }

  if (order.payment_status === 'pending') {
    return 'payment';
  }

  if (
    order.payment_status === 'paid' &&
    order.invoice_status === 'pending'
  ) {
    return 'invoice';
  }

  if (
    order.payment_status === 'paid' &&
    order.status === 'confirmed'
  ) {
    return 'paid';
  }

  if (order.approval_status === 'pending') {
    return 'pending';
  }

  return order.status;
}

function badge(key) {
  let cssClass = '';

  if (key === 'payment') {
    cssClass = 'warn';
  } else if (
    [
      'paid',
      'completed',
      'active',
      'issued',
      'succeeded'
    ].includes(key)
  ) {
    cssClass = 'paid';
  } else if (
    [
      'cancelled',
      'rejected',
      'expired',
      'failed',
      'refund_failed'
    ].includes(key)
  ) {
    cssClass = 'danger';
  }

  return `
    <span class="badge ${cssClass}">
      ${labels[key] || esc(key)}
    </span>
  `;
}

function updateSummary() {
  const orders = data.orders || [];

  $('#s-all').textContent = orders.length;

  $('#s-pending').textContent =
    orders.filter(
      order => orderState(order) === 'pending'
    ).length;

  $('#s-payment').textContent =
    orders.filter(
      order => orderState(order) === 'payment'
    ).length;

  $('#s-preparing').textContent =
    orders.filter(
      order => orderState(order) === 'preparing'
    ).length;

  $('#s-ready').textContent =
    orders.filter(
      order => orderState(order) === 'ready'
    ).length;

  $('#s-issue').textContent =
    orders.filter(
      order => orderState(order) === 'issue'
    ).length;

  $('#s-refund').textContent =
    orders.filter(
      order =>
        ['refund', 'refund_failed'].includes(
          orderState(order)
        )
    ).length;

  $('#s-invoice').textContent =
    orders.filter(
      order => orderState(order) === 'invoice'
    ).length;

  $('#s-credit').textContent =
    orders.filter(
      order => orderState(order) === 'credit'
    ).length;
}

function filters() {
  const states =
    view === 'orders'
      ? [
          ...new Set(
            (data.orders || [])
              .map(orderState)
              .filter(Boolean)
          )
        ]
      : [
          ...new Set(
            (data.subscriptions || [])
              .map(item => item.status)
              .filter(Boolean)
          )
        ];

  $('#state-filter').innerHTML =
    `
      <option value="all">
        Todos os estados
      </option>
    ` +
    states.map(
      state => `
        <option value="${esc(state)}">
          ${labels[state] || esc(state)}
        </option>
      `
    ).join('');
}

function atReferenceAction(order) {
  const id = Number(order.id);

  if (order.atReference) {
    return `
      <button
        type="button"
        class="btn secondary copy-at-reference"
        data-order-id="${id}"
        title="${esc(order.atReference)}"
      >
        Copiar referência AT
      </button>
    `;
  }

  return `
    <button
      type="button"
      class="btn secondary"
      disabled
      title="${esc(
        order.atReferenceError ||
        'A fotografia fiscal ainda não está disponível.'
      )}"
    >
      Referência AT indisponível
    </button>
  `;
}

function actions(order) {
  const state = orderState(order);
  const id = Number(order.id);
  const referenceButton = atReferenceAction(order);

  const problemButton = `
    <button
      type="button"
      class="btn danger"
      data-incident="${id}"
    >
      Problema
    </button>
  `;

  if (
    [
      'refunded',
      'completed',
      'cancelled',
      'expired'
    ].includes(state)
  ) {
    return referenceButton;
  }

  if (state === 'pending') {
    return `
      <button
        type="button"
        class="btn"
        data-act="approve"
        data-kind="order"
        data-id="${id}"
      >
        Aprovar
      </button>

      <button
        type="button"
        class="btn danger"
        data-act="reject"
        data-kind="order"
        data-id="${id}"
      >
        Recusar
      </button>

      ${referenceButton}
      ${problemButton}
    `;
  }

  if (state === 'payment') {
    return `
      ${
        order.payment_url
          ? `
            <button
              type="button"
              class="btn secondary"
              data-copy="${esc(order.payment_url)}"
            >
              Copiar pagamento
            </button>
          `
          : ''
      }

      ${referenceButton}
      ${problemButton}
    `;
  }

  if (state === 'invoice') {
    return `
      <button
        type="button"
        class="btn"
        data-fiscal="invoice"
        data-id="${id}"
      >
        Registar fatura
      </button>

      <a
        class="btn secondary"
        href="${PORTAL_AT_URL}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir AT
      </a>

      ${referenceButton}
      ${problemButton}
    `;
  }

  if (state === 'paid') {
    return `
      <button
        type="button"
        class="btn"
        data-act="preparing"
        data-kind="order"
        data-id="${id}"
      >
        Preparar
      </button>

      ${referenceButton}
      ${problemButton}
    `;
  }

  if (state === 'preparing') {
    return `
      <button
        type="button"
        class="btn"
        data-act="ready"
        data-kind="order"
        data-id="${id}"
      >
        Marcar como pronto
      </button>

      ${referenceButton}
      ${problemButton}
    `;
  }

  if (state === 'ready') {
    return `
      <button
        type="button"
        class="btn"
        data-act="complete"
        data-kind="order"
        data-id="${id}"
      >
        Concluir
      </button>

      ${referenceButton}
      ${problemButton}
    `;
  }

  if (state === 'credit') {
    return `
      <button
        type="button"
        class="btn"
        data-fiscal="credit-note"
        data-id="${id}"
      >
        Registar nota de crédito
      </button>

      <a
        class="btn secondary"
        href="${PORTAL_AT_URL}"
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir AT
      </a>

      ${referenceButton}
    `;
  }

  return referenceButton;
}

function renderOrders(query, stateFilter) {
  const rows =
    (data.orders || []).filter(order => {
      const state = orderState(order);

      const matchesSummary =
        summary === 'all' ||
        state === summary;

      const matchesState =
        stateFilter === 'all' ||
        state === stateFilter;

      const searchable = `
        ${order.order_number || ''}
        ${order.name || ''}
        ${order.email || ''}
        ${order.atReference || ''}
      `.toLowerCase();

      return (
        matchesSummary &&
        matchesState &&
        searchable.includes(query)
      );
    });

  $('#thead').innerHTML = `
    <tr>
      <th>Encomenda</th>
      <th>Cliente</th>
      <th>Estado</th>
      <th>Pagamento</th>
      <th>Valor</th>
      <th>Data</th>
      <th>Ações</th>
    </tr>
  `;

  $('#tbody').innerHTML =
    rows.map(
      order => `
        <tr>
          <td>
            <strong>
              ${esc(order.order_number)}
            </strong>

            ${
              order.atReference
                ? `
                  <div class="at-reference-preview">
                    ${esc(order.atReference)}
                  </div>
                `
                : ''
            }
          </td>

          <td>
            ${esc(order.name)}

            <div class="muted">
              ${esc(order.email)}
            </div>
          </td>

          <td>
            ${badge(orderState(order))}
          </td>

          <td>
            ${badge(
              order.payment_status ||
              'not_required'
            )}
          </td>

          <td>
            ${money(order.total_cents)}
          </td>

          <td>
            ${date(order.created_at)}
          </td>

          <td>
            <div class="actions">
              ${actions(order)}
            </div>
          </td>
        </tr>
      `
    ).join('');

  $('#empty').classList.toggle(
    'hidden',
    rows.length > 0
  );
}

function renderSubscriptions(query, stateFilter) {
  const rows =
    (data.subscriptions || []).filter(
      subscription => {
        const matchesState =
          stateFilter === 'all' ||
          subscription.status === stateFilter;

        const searchable = `
          ${subscription.product || ''}
          ${subscription.name || ''}
          ${subscription.email || ''}
        `.toLowerCase();

        return (
          matchesState &&
          searchable.includes(query)
        );
      }
    );

  $('#thead').innerHTML = `
    <tr>
      <th>Produto</th>
      <th>Cliente</th>
      <th>Frequência</th>
      <th>Quantidade</th>
      <th>Estado</th>
      <th>Data</th>
      <th>Ações</th>
    </tr>
  `;

  $('#tbody').innerHTML =
    rows.map(
      subscription => `
        <tr>
          <td>
            <strong>
              ${esc(subscription.product)}
            </strong>
          </td>

          <td>
            ${esc(subscription.name)}

            <div class="muted">
              ${esc(subscription.email)}
            </div>
          </td>

          <td>
            ${esc(
              frequencies[
                subscription.frequency
              ] ||
              subscription.frequency
            )}
          </td>

          <td>
            ${Number(
              subscription.eggs_per_delivery
            )}
            unidades
          </td>

          <td>
            ${badge(subscription.status)}
          </td>

          <td>
            ${date(subscription.created_at)}
          </td>

          <td>
            <div class="actions">
              ${
                subscription.status === 'requested'
                  ? `
                    <button
                      type="button"
                      class="btn"
                      data-act="approve"
                      data-kind="subscription"
                      data-id="${Number(
                        subscription.id
                      )}"
                    >
                      Aprovar
                    </button>

                    <button
                      type="button"
                      class="btn danger"
                      data-act="reject"
                      data-kind="subscription"
                      data-id="${Number(
                        subscription.id
                      )}"
                    >
                      Recusar
                    </button>
                  `
                  : ''
              }
            </div>
          </td>
        </tr>
      `
    ).join('');

  $('#empty').classList.toggle(
    'hidden',
    rows.length > 0
  );
}

function renderAudit(query) {
  const rows =
    auditEvents.filter(event => {
      const searchable = `
        ${event.reference || ''}
        ${event.action || ''}
        ${event.actor || ''}
        ${event.reason || ''}
      `.toLowerCase();

      return searchable.includes(query);
    });

  $('#thead').innerHTML = `
    <tr>
      <th>Data</th>
      <th>Entidade</th>
      <th>Referência</th>
      <th>Ação</th>
      <th>Alteração</th>
      <th>Autor</th>
      <th>Resultado</th>
    </tr>
  `;

  $('#tbody').innerHTML =
    rows.map(
      event => `
        <tr>
          <td>${date(event.created_at)}</td>

          <td>${esc(event.entity_type)}</td>

          <td>
            <strong>
              ${esc(
                event.reference ||
                event.entity_id
              )}
            </strong>
          </td>

          <td>${esc(event.action)}</td>

          <td>
            <span class="muted">
              ${esc(
                event.from_status || '—'
              )}
              →
              ${esc(
                event.to_status || '—'
              )}
            </span>

            ${
              event.reason
                ? `
                  <div>
                    ${esc(event.reason)}
                  </div>
                `
                : ''
            }
          </td>

          <td>${esc(event.actor)}</td>

          <td>${badge(event.result)}</td>
        </tr>
      `
    ).join('');

  $('#empty').classList.toggle(
    'hidden',
    rows.length > 0
  );
}

function renderFiscalDocuments(query) {
  const rows =
    fiscalDocs.filter(documentItem => {
      const searchable = `
        ${documentItem.order_number || ''}
        ${documentItem.document_number || ''}
        ${documentItem.name || ''}
      `.toLowerCase();

      return searchable.includes(query);
    });

  $('#thead').innerHTML = `
    <tr>
      <th>Data</th>
      <th>Encomenda</th>
      <th>Cliente</th>
      <th>Tipo</th>
      <th>Documento</th>
      <th>Valor</th>
      <th>Estado</th>
    </tr>
  `;

  $('#tbody').innerHTML =
    rows.map(
      documentItem => `
        <tr>
          <td>
            ${date(documentItem.document_date)}
          </td>

          <td>
            <strong>
              ${esc(documentItem.order_number)}
            </strong>
          </td>

          <td>
            ${esc(documentItem.name)}

            <div class="muted">
              ${esc(documentItem.email)}
            </div>
          </td>

          <td>
            ${esc(documentItem.document_type)}
          </td>

          <td>
            ${
              documentItem.document_url
                ? `
                  <a
                    href="${esc(
                      documentItem.document_url
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ${esc(
                      documentItem.document_number
                    )}
                  </a>
                `
                : esc(
                    documentItem.document_number
                  )
            }
          </td>

          <td>
            ${money(documentItem.total_cents)}
          </td>

          <td>
            ${badge(documentItem.status)}
          </td>
        </tr>
      `
    ).join('');

  $('#empty').classList.toggle(
    'hidden',
    rows.length > 0
  );
}

function render() {
  updateSummary();

  const query =
    String($('#search')?.value || '')
      .toLowerCase();

  const stateFilter =
    $('#state-filter')?.value || 'all';

  if (view === 'orders') {
    renderOrders(
      query,
      stateFilter
    );

    return;
  }

  if (view === 'subscriptions') {
    renderSubscriptions(
      query,
      stateFilter
    );

    return;
  }

  if (view === 'audit') {
    renderAudit(query);

    return;
  }

  renderFiscalDocuments(query);
}

async function load() {
  try {
    data = await api(
      '/api/admin/workflow'
    );

    adminOrderReferences.clear();

    for (
      const order of data.orders || []
    ) {
      if (order.atReference) {
        adminOrderReferences.set(
          Number(order.id),
          String(order.atReference)
        );
      }
    }

    const auditResponse =
      await api('/api/admin/audit');

    auditEvents =
      auditResponse.events || [];

    const fiscalResponse =
      await api(
        '/api/admin/fiscal-documents'
      );

    fiscalDocs =
      fiscalResponse.documents || [];

    $('#login').classList.add('hidden');
    $('#dashboard').classList.remove('hidden');
    $('#logout').classList.remove('hidden');

    filters();
    render();
  } catch (error) {
    sessionStorage.removeItem(
      'dl_admin_token'
    );

    token = '';

    $('#dashboard').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#logout').classList.add('hidden');

    msg(error.message);
  }
}

async function transition(
  kind,
  id,
  action,
  payload = {}
) {
  const key =
    `${kind}:${id}:${action}`;

  if (busy.has(key)) {
    return;
  }

  busy.add(key);
  render();

  try {
    await api(
      kind === 'order'
        ? `/api/admin/orders/${id}/${action}`
        : `/api/admin/subscriptions/${id}/${action}`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );

    msg(
      'Estado atualizado e email enviado.'
    );

    await load();
  } catch (error) {
    msg(error.message);
  } finally {
    busy.delete(key);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(
      text
    );

    return true;
  } catch {
    const field =
      document.createElement('textarea');

    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';

    document.body.appendChild(field);

    field.select();

    const copied =
      document.execCommand('copy');

    field.remove();

    return copied;
  }
}

$('#login-form').onsubmit =
  event => {
    event.preventDefault();

    token = $('#token').value.trim();

    sessionStorage.setItem(
      'dl_admin_token',
      token
    );

    load();
  };

$('#logout').onclick = () => {
  sessionStorage.removeItem(
    'dl_admin_token'
  );

  location.reload();
};

$('#refresh').onclick = load;

document
  .querySelectorAll('.tab')
  .forEach(button => {
    button.onclick = () => {
      view = button.dataset.view;
      summary = 'all';

      document
        .querySelectorAll('.tab')
        .forEach(item => {
          item.classList.toggle(
            'active',
            item === button
          );
        });

      filters();
      render();
    };
  });

document
  .querySelectorAll('[data-summary]')
  .forEach(button => {
    button.onclick = () => {
      summary =
        button.dataset.summary;

      view = 'orders';

      document
        .querySelectorAll(
          '[data-summary]'
        )
        .forEach(item => {
          item.classList.toggle(
            'active',
            item === button
          );
        });

      document
        .querySelectorAll('.tab')
        .forEach(item => {
          item.classList.toggle(
            'active',
            item.dataset.view ===
              'orders'
          );
        });

      filters();
      render();
    };
  });

$('#search').oninput = render;
$('#state-filter').onchange = render;

document.addEventListener(
  'click',
  async event => {
    const atButton =
      event.target.closest(
        '.copy-at-reference'
      );

    if (atButton) {
      const orderId = Number(
        atButton.dataset.orderId
      );

      const reference =
        adminOrderReferences.get(
          orderId
        );

      if (!reference) {
        msg(
          'A referência AT desta encomenda não está disponível.'
        );

        return;
      }

      const copied =
        await copyText(reference);

      if (!copied) {
        msg(
          'Não foi possível copiar a referência.'
        );

        return;
      }

      const original =
        atButton.textContent;

      atButton.textContent =
        'Referência copiada ✓';

      atButton.classList.add('copied');

      msg(
        `Referência copiada: ${reference}`
      );

      window.setTimeout(
        () => {
          atButton.textContent =
            original;

          atButton.classList.remove(
            'copied'
          );
        },
        2200
      );

      return;
    }

    const paymentButton =
      event.target.closest('[data-copy]');

    if (paymentButton) {
      const copied =
        await copyText(
          paymentButton.dataset.copy
        );

      msg(
        copied
          ? 'Link de pagamento copiado.'
          : 'Não foi possível copiar o link.'
      );

      return;
    }

    const fiscalButton =
      event.target.closest('[data-fiscal]');

    if (fiscalButton) {
      const form = $('#fiscal-form');

      form.reset();
      form.id.value =
        fiscalButton.dataset.id;

      form.kind.value =
        fiscalButton.dataset.fiscal;

      $('#fiscal-title').textContent =
        fiscalButton.dataset.fiscal ===
        'invoice'
          ? 'Registar fatura emitida na ATGo'
          : 'Registar nota de crédito';

      $('#fiscal-type-label')
        .classList.toggle(
          'hidden',
          fiscalButton.dataset.fiscal !==
            'invoice'
        );

      $('#fiscal-dialog').showModal();

      return;
    }

    const incidentButton =
      event.target.closest(
        '[data-incident]'
      );

    if (incidentButton) {
      const form = $('#incident-form');

      form.reset();
      form.id.value =
        incidentButton.dataset.incident;

      $('#incident-dialog').showModal();

      return;
    }

    const actionButton =
      event.target.closest('[data-act]');

    if (!actionButton) {
      return;
    }

    const {
      kind,
      id,
      act
    } = actionButton.dataset;

    if (act === 'approve') {
      const form = $('#approve-form');

      form.kind.value = kind;
      form.id.value = id;

      $('#approve-title').textContent =
        kind === 'order'
          ? 'Aprovar encomenda e pedir pagamento'
          : 'Aprovar subscrição';

      $('#hours-label')
        .classList.toggle(
          'hidden',
          kind !== 'order'
        );

      $('#approve-dialog').showModal();

      return;
    }

    if (act === 'reject') {
      const note =
        prompt(
          'Motivo a enviar ao cliente:'
        ) ||
        'Indisponibilidade temporária.';

      await transition(
        kind,
        id,
        act,
        {
          note
        }
      );

      return;
    }

    actionButton.disabled = true;

    await transition(
      kind,
      id,
      act
    );
  }
);

$('#fiscal-form').onsubmit =
  async event => {
    event.preventDefault();

    const formData =
      new FormData(
        event.currentTarget
      );

    const amount =
      Math.round(
        Number(
          String(
            formData.get('amount')
          ).replace(',', '.')
        ) * 100
      );

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      msg('Indica um total válido.');

      return;
    }

    try {
      await api(
        `/api/admin/orders/${formData.get('id')}/${formData.get('kind')}`,
        {
          method: 'POST',
          body: JSON.stringify({
            documentType:
              formData.get('documentType'),

            documentNumber:
              formData.get('documentNumber'),

            documentDate:
              formData.get('documentDate'),

            totalCents:
              amount,

            documentUrl:
              formData.get('documentUrl'),

            notes:
              formData.get('notes')
          })
        }
      );

      $('#fiscal-dialog').close();

      msg(
        'Documento fiscal registado e email enviado.'
      );

      await load();
    } catch (error) {
      msg(error.message);
    }
  };

$('#incident-form')
  .refundMode
  .onchange = event => {
    $('#partial-refund')
      .classList.toggle(
        'hidden',
        event.target.value !==
          'partial'
      );
  };

$('#incident-form').onsubmit =
  async event => {
    event.preventDefault();

    const formData =
      new FormData(
        event.currentTarget
      );

    if (
      formData.get('confirmation') !==
      'ANULAR'
    ) {
      msg(
        'Escreve ANULAR exatamente para confirmar.'
      );

      return;
    }

    const refundMode =
      formData.get('refundMode');

    const amount =
      refundMode === 'partial'
        ? Math.round(
            Number(
              String(
                formData.get(
                  'refundAmount'
                )
              ).replace(',', '.')
            ) * 100
          )
        : null;

    try {
      await api(
        `/api/admin/orders/${formData.get('id')}/incident`,
        {
          method: 'POST',
          body: JSON.stringify({
            confirmation: 'ANULAR',
            reason:
              formData.get('reason'),
            customerNote:
              formData.get(
                'customerNote'
              ),
            refundMode,
            amountCents: amount
          })
        }
      );

      $('#incident-dialog').close();

      msg(
        'Problema registado. O cliente será contactado.'
      );

      await load();
    } catch (error) {
      msg(error.message);
    }
  };

$('#approve-form').onsubmit =
  event => {
    event.preventDefault();

    const formData =
      new FormData(
        event.currentTarget
      );

    const kind =
      formData.get('kind');

    const id =
      formData.get('id');

    const amount =
      Math.round(
        Number(
          String(
            formData.get('amount')
          ).replace(',', '.')
        ) * 100
      );

    if (
      !Number.isFinite(amount) ||
      amount < 50
    ) {
      msg(
        'Indica um valor válido, mínimo 0,50 €.'
      );

      return;
    }

    const payload =
      kind === 'order'
        ? {
            totalCents: amount,
            paymentHours:
              Number(
                formData.get('hours')
              ) || 24,
            location:
              formData.get('location'),
            pickupAt:
              formData.get('date') ||
              null
          }
        : {
            priceCents: amount,
            location:
              formData.get('location'),
            firstDelivery:
              formData.get('date') ||
              null
          };

    $('#approve-dialog').close();

    transition(
      kind,
      id,
      'approve',
      payload
    );
  };

document
  .querySelectorAll('[data-close]')
  .forEach(button => {
    button.onclick = () => {
      button
        .closest('dialog')
        .close();
    };
  });

if (token) {
  load();
}
