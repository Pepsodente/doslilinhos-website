const $=(s,p=document)=>p.querySelector(s),$$=(s,p=document)=>[...p.querySelectorAll(s)];let me=null,mode='login',stock={};const freq={weekly:'Semanal',biweekly:'Quinzenal',monthly:'Mensal'},substat={requested:'A aguardar aprovação',active:'Ativa',paused:'Pausada',cancelled:'Cancelada',rejected:'Recusada'},status={pending:'Pedido recebido',confirmed:'Confirmada',completed:'Concluída',cancelled:'Cancelada',expired:'Expirada'};function notice(t){const e=document.createElement('div');e.className='notice';e.textContent=t;document.body.append(e);setTimeout(()=>e.remove(),5000)}async function api(p,o={}){const r=await fetch(p,{...o,headers:{Accept:'application/json',...(o.body?{'Content-Type':'application/json'}:{}),...(o.headers||{})}}),d=await r.json();if(!r.ok||d.success===false)throw new Error(d.error||`Erro ${r.status}`);return d}$('#year')&&($('#year').textContent=new Date().getFullYear());$('#menuButton')?.addEventListener('click',()=>document.body.classList.toggle('menu-open'));$('#avatarButton')?.addEventListener('click',e=>{e.stopPropagation();const x=$('#avatarMenu').classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',x)});$('#avatarMenu')?.addEventListener('click',e=>e.stopPropagation());document.addEventListener('click',()=>$('#avatarMenu')?.classList.remove('open'));async function session(){const d=await api('/api/auth/me');me=d.customer;document.body.classList.toggle('authenticated',d.authenticated);if(me){$('#menuName').textContent=me.username||me.name;$('#menuEmail').textContent=me.email;$('#welcomeTitle')&&($('#welcomeTitle').textContent=`Olá, ${me.username||me.name}`)}else if(document.body.classList.contains('requires-auth'))location.href='/?login=1'}session().catch(console.error);
function auth(selectedMode) {
  mode = selectedMode;

  const registering =
    selectedMode === 'register';

  const dialog = $('#authDialog');
  const form = $('#authForm');
  const title = $('#authTitle');
  const submitButton = $('#authSubmit');
  const switchButton = $('#authSwitch');
  const message = $('#authMessage');
  const identifier = $('#authIdentifier');
  const email = $('#authEmail');
  const recoveryLink = $('#recoverAccessLink');

  /*
   * Campos exclusivos da criação de conta.
   * São identificados pelos nomes, sem depender
   * apenas da classe register-field.
   */
  const registrationNames = [
    'name',
    'username',
    'email',
    'passwordConfirmation',
    'notificationsEnabled',
    'privacyAccepted'
  ];

  for (const name of registrationNames) {
    const control =
      form?.elements.namedItem(name);

    if (!control) {
      continue;
    }

    const field =
      control.closest('label');

    control.disabled = !registering;

    if (name === 'privacyAccepted') {
      control.required = registering;
    }

    if (
      name === 'name' ||
      name === 'username' ||
      name === 'email' ||
      name === 'passwordConfirmation'
    ) {
      control.required = registering;
    }

    if (field) {
      field.hidden = !registering;

      if (registering) {
        field.style.removeProperty(
          'display'
        );
      } else {
        field.style.setProperty(
          'display',
          'none',
          'important'
        );
      }
    }
  }

  /*
   * Identificador usado apenas no login.
   */
  if (identifier) {
    const identifierField =
      identifier.closest('label');

    identifier.disabled = registering;
    identifier.required = !registering;

    if (identifierField) {
      identifierField.hidden = registering;

      if (registering) {
        identifierField.style.setProperty(
          'display',
          'none',
          'important'
        );
      } else {
        identifierField.style.removeProperty(
          'display'
        );
      }
    }
  }

  /*
   * Ajustar a palavra-passe ao modo atual.
   */
  const password =
    form?.elements.namedItem(
      'password'
    );

  if (password) {
    password.required = true;

    password.autocomplete =
      registering
        ? 'new-password'
        : 'current-password';
  }

  if (title) {
    title.textContent =
      registering
        ? 'Criar conta'
        : 'Entrar';
  }

  if (submitButton) {
    submitButton.textContent =
      registering
        ? 'Criar conta'
        : 'Entrar';
  }

  if (switchButton) {
    switchButton.textContent =
      registering
        ? 'Já tem conta? Entrar'
        : 'Ainda não tem conta? Criar conta';
  }

  if (recoveryLink) {
    recoveryLink.hidden = registering;

    if (registering) {
      recoveryLink.style.setProperty(
        'display',
        'none',
        'important'
      );
    } else {
      recoveryLink.style.setProperty(
        'display',
        'block',
        'important'
      );
    }
  }

  if (message) {
    message.textContent = '';
  }

  if (dialog && !dialog.open) {
    dialog.showModal();
  }
}
$$('[data-auth]').forEach(b=>b.onclick=()=>auth(b.dataset.auth));$('#authSwitch')?.addEventListener('click',()=>auth(mode==='login'?'register':'login'));$$('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('#authForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f),body={password:d.get('password')};if(mode==='login')body.identifier=String(d.get('identifier')||'').trim();if(mode==='register'){body.email=String(d.get('email')||'').trim();const u=String(d.get('username')||'').trim(),c=String(d.get('passwordConfirmation')||'');if(!/^[A-Za-z0-9._-]{3,30}$/.test(u))return $('#authMessage').textContent='Nome de utilizador inválido ou com espaços.';if(body.password!==c)return $('#authMessage').textContent='As palavras-passe não coincidem.';Object.assign(body,{name:d.get('name'),username:u,passwordConfirmation:c,notificationsEnabled:!!d.get('notificationsEnabled'),privacyAccepted:!!d.get('privacyAccepted')})}try{await api(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify(body)});f.reset();location.href='/area-cliente.html'}catch(x){$('#authMessage').textContent=x.message}});$('#logoutButton')?.addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});location.href='/'});async function loadStock(){if(!$('#stockPanel'))return;const d=await api('/api/stock');stock=d.stock;$('#stockPanel').textContent=`${stock.availableEggs} ovos disponíveis`;$('#eggFormats').innerHTML=[6,12,18,30].filter(x=>x<=stock.availableEggs).map((x,i)=>`<button class="format ${i?'':'active'}" data-eggs="${x}">${x} ovos</button>`).join('');$$('.format').forEach(b=>b.onclick=()=>{$$('.format').forEach(x=>x.classList.toggle('active',x===b))})}loadStock().catch(console.error);$('#reserveButton')?.addEventListener('click',()=>{if(!me)return auth('login');const e=$('.format.active')?.dataset.eggs;if(!e)return;$('#orderSummary').textContent=`Pedido de ${e} ovos`;$('#orderDialog').dataset.eggs=e;$('#orderDialog').showModal()});$('#orderForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f),eggs=Number($('#orderDialog').dataset.eggs);await api('/api/reservations',{method:'POST',body:JSON.stringify({packs:eggs/6,notes:d.get('notes'),termsAccepted:!!d.get('termsAccepted')})});location.href='/encomendas.html'});$('#subscribeButton')?.addEventListener('click',()=>me?$('#subscriptionDialog').showModal():auth('login'));$('#subscriptionForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.currentTarget);await api('/api/subscriptions',{method:'POST',body:JSON.stringify({eggs:+d.get('eggs'),frequency:d.get('frequency'),shortagePreference:d.get('shortage'),termsAccepted:!!d.get('termsAccepted')})});location.href='/subscricoes.html'});
function escapeHtml(value) {
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
}

function formatOrderMoney(cents) {
  return new Intl.NumberFormat(
    'pt-PT',
    {
      style: 'currency',
      currency: 'EUR'
    }
  ).format(
    Number(cents || 0) / 100
  );
}

function formatOrderDate(value) {
  if (!value) {
    return '';
  }

  const normalized =
    String(value).includes('T')
      ? String(value)
      : `${String(value).replace(' ', 'T')}Z`;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return new Intl.DateTimeFormat(
    'pt-PT',
    {
      dateStyle: 'short'
    }
  ).format(date);
}

function orderStatusLabel(order) {
  if (order.payment_status === 'pending') {
    return 'A aguardar pagamento';
  }

  if (order.payment_status === 'paid') {
    return 'Pagamento recebido';
  }

  if (order.payment_status === 'refunded') {
    return 'Pagamento reembolsado';
  }

  if (order.payment_status === 'refund_pending') {
    return 'Reembolso em processamento';
  }

  if (order.payment_status === 'refund_failed') {
    return 'Reembolso por verificar';
  }

  const labels = {
    pending: 'Pedido recebido',
    confirmed: 'Confirmada',
    ready: 'Pronta',
    completed: 'Concluída',
    cancelled: 'Cancelada',
    expired: 'Expirada'
  };

  return (
    labels[order.status] ||
    escapeHtml(order.status) ||
    'Em processamento'
  );
}

function orderDocumentCard({
  type,
  label,
  status: documentStatus,
  number,
  date,
  url
}) {
  const iconLabels = {
    receipt: 'RC',
    invoice: 'FT',
    credit: 'NC'
  };

  const iconLabel =
    iconLabels[type] || 'PDF';

  if (
    documentStatus === 'available' &&
    url
  ) {
    return `
      <article class="order-document">
        <span
          class="document-icon ${type}"
          aria-hidden="true"
        >
          ${iconLabel}
        </span>

        <div class="document-information">
          <strong>
            ${escapeHtml(label)}
          </strong>

          <small>
            ${
              escapeHtml(
                number ||
                'Documento disponível'
              )
            }
            ${
              date
                ? ` · ${formatOrderDate(date)}`
                : ''
            }
          </small>
        </div>

        <a
          class="document-download"
          href="${escapeHtml(url)}"
          target="_blank"
          rel="noopener"
        >
          Descarregar PDF
        </a>
      </article>
    `;
  }

  if (
    documentStatus === 'processing' ||
    documentStatus === 'pending'
  ) {
    const statusText =
      documentStatus === 'processing'
        ? 'A processar'
        : 'A aguardar emissão';

    return `
      <article class="order-document pending">
        <span
          class="document-icon ${type}"
          aria-hidden="true"
        >
          ${iconLabel}
        </span>

        <div class="document-information">
          <strong>
            ${escapeHtml(label)}
          </strong>

          <small>
            ${statusText}
          </small>
        </div>

        <span class="document-status">
          ${statusText}
        </span>
      </article>
    `;
  }

  return `
    <article class="order-document uailable">
      <span
        class="document-icon ${type}"
        aria-hidden="true"
      >
        ${iconLabel}
      </span>

      <div class="document-information">
        <strong>
          ${escapeHtml(label)}
        </strong>

        <small>
          Não disponível
        </small>
      </div>
    </article>
  `;
}

async function loadOrders() {
  const ordersList = $('#ordersList');

  if (!ordersList) {
    return;
  }

  try {
    const data = await api(
      '/api/my/orders'
    );

    const orders =
      Array.isArray(data.orders)
        ? data.orders
        : [];

    if (!orders.length) {
      ordersList.innerHTML = `
        <div class="empty-state">
          <h2>
            Ainda não existem encomendas
          </h2>

          <p>
            Quando fizeres uma reserva,
            poderás acompanhar aqui o pedido,
            o pagamento e os documentos.
          </p>

          <a
            class="button solid"
            href="/produtos.html"
          >
            Ver produtos
          </a>
        </div>
      `;

      return;
    }

    ordersList.innerHTML =
      orders.map(order => {
        const documents =
          order.documents || {};

        const receipt =
          documents.receipt || {
            status: 'not_available'
          };

        const invoice =
          documents.invoice || {
            status: 'not_available'
          };

        const creditNote =
          documents.creditNote || {
            status: 'not_available'
          };

        const showCreditNote =
          creditNote.status === 'available' ||
          creditNote.status === 'pending';

        const technicalOrder =
          String(
            order.internal_notes || ''
          ).startsWith('TESTE TÉCNICO');

        return `
          <article
            class="order-card"
            id="pedido-${Number(order.id)}"
          >
            <header class="order-card-head">
              <div>
                <p class="order-reference">
                  Encomenda
                </p>

                <h2>
                  ${escapeHtml(order.order_number)}
                </h2>

                <span
                  class="
                    order-status
                    payment-${
                      escapeHtml(
                        order.payment_status ||
                        'unknown'
                      )
                    }
                  "
                >
                  ${orderStatusLabel(order)}
                </span>
              </div>

              <div class="order-total">
                <small>Total</small>

                <strong>
                  ${formatOrderMoney(
                    order.total_cents
                  )}
                </strong>
              </div>
            </header>

            <div class="order-summary">
              <div>
                <span>Quantidade</span>

                <strong>
                  ${Number(
                    order.quantity_eggs || 0
                  )}
                  ovos
                </strong>
              </div>

              <div>
                <span>Data do pedido</span>

                <strong>
                  ${formatOrderDate(
                    order.created_at
                  )}
                </strong>
              </div>

              ${
                order.paid_at
                  ? `
                    <div>
                      <span>
                        Data do pagamento
                      </span>

                      <strong>
                        ${formatOrderDate(
                          order.paid_at
                        )}
                      </strong>
                    </div>
                  `
                  : ''
              }
            </div>

            ${
              order.payment_url &&
              order.payment_status === 'pending'
                ? `
                  <div class="order-payment-action">
                    <a
                      class="button solid"
                      href="${
                        escapeHtml(
                          order.payment_url
                        )
                      }"
                    >
                      Concluir pagamento
                    </a>
                  </div>
                `
                : ''
            }

            <section class="order-documents">
              <h3>Documentos</h3>

              ${orderDocumentCard({
                type: 'receipt',
                label:
                  'Recibo / comprovativo de pagamento',
                status:
                  receipt.status,
                number:
                  receipt.number,
                date:
                  receipt.issuedAt,
                url:
                  receipt.url
              })}

              ${orderDocumentCard({
                type: 'invoice',
                label: 'Fatura',
                status:
                  invoice.status,
                number:
                  invoice.number,
                date:
                  invoice.date,
                url:
                  invoice.url
              })}

              ${
                showCreditNote
                  ? orderDocumentCard({
                      type: 'credit',
                      label:
                        'Nota de crédito',
                      status:
                        creditNote.status,
                      number:
                        creditNote.number,
                      date:
                        creditNote.date,
                      url:
                        creditNote.url
                    })
                  : ''
              }
            </section>

            ${
              technicalOrder
                ? `
                  <div class="technical-order-warning">
                    Encomenda técnica:
                    não preparar, expedir ou cobrar.
                  </div>
                `
                : ''
            }
          </article>
        `;
      }).join('');
  } catch (error) {
    console.error(error);

    ordersList.innerHTML = `
      <div class="form-message error">
        ${
          escapeHtml(
            error.message ||
            'Não foi possível carregar as encomendas.'
          )
        }
      </div>
    `;
  }
}

loadOrders().catch(console.error);
async function loadSubs(){if(!$('#subscriptionsList'))return;const d=await api('/api/my/subscriptions');$('#subscriptionsList').innerHTML=d.subscriptions.length?d.subscriptions.map(s=>`<article><strong>${s.eggs_per_delivery} ovos · ${freq[s.frequency]}</strong><p><span class="status">${substat[s.status]}</span></p></article>`).join(''):'<p>Ainda não existem subscrições.</p>'}loadSubs().catch(console.error);async function profile(){if(!$('#profileForm'))return;await session();const f=$('#profileForm');f.name.value=me.name;f.username.value=me.username||'';f.email.value=me.email;f.notificationsEnabled.checked=!!me.notifications_enabled;f.onsubmit=async e=>{e.preventDefault();const d=new FormData(f);await api('/api/my/profile',{method:'PATCH',body:JSON.stringify({name:d.get('name'),username:d.get('username'),notificationsEnabled:!!d.get('notificationsEnabled')})});notice('Perfil atualizado.')}}profile().catch(console.error);$('#passwordForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f);if(d.get('newPassword')!==d.get('newPasswordConfirmation'))return notice('As palavras-passe não coincidem.');await api('/api/my/password',{method:'PATCH',body:JSON.stringify(Object.fromEntries(d))});f.reset();notice('Palavra-passe alterada.')});const dd=$('#deleteAccountDialog'),di=$('#deleteConfirmation'),db=$('#confirmDeleteAccount'),dm=$('#deleteAccountMessage');$('#openDeleteAccount')?.addEventListener('click',()=>{di.value='';db.disabled=true;dd.showModal();di.focus()});di?.addEventListener('input',()=>db.disabled=di.value!=='ELIMINAR');db?.addEventListener('click',async()=>{if(di.value!=='ELIMINAR')return;db.disabled=true;db.textContent='A eliminar...';try{await api('/api/my/account',{method:'DELETE',body:JSON.stringify({confirmation:di.value})});location.href='/?conta=eliminada'}catch(x){dm.textContent=x.message;db.disabled=false}});if(new URLSearchParams(location.search).has('login'))auth('login');
// Mantem o simbolo do Livro de Reclamacoes pequeno e totalmente visivel no rodape.
function resizeLivroReclamacoesIcon() {
  const title = [...document.querySelectorAll('svg title')].find(node =>
    (node.textContent || '').trim().toUpperCase().includes('LIVRO DE RECLAMA')
  );
  const svg = title?.closest('svg');
  if (!svg) return;

  const link = svg.closest('a');

  svg.setAttribute('width', '44');
  svg.setAttribute('height', '44');
  svg.style.setProperty('width', '44px', 'important');
  svg.style.setProperty('height', '44px', 'important');
  svg.style.setProperty('min-width', '44px', 'important');
  svg.style.setProperty('min-height', '44px', 'important');
  svg.style.setProperty('max-width', '44px', 'important');
  svg.style.setProperty('max-height', '44px', 'important');
  svg.style.setProperty('display', 'block', 'important');
  svg.style.setProperty('flex', '0 0 44px', 'important');
  svg.style.setProperty('overflow', 'visible', 'important');

  if (link) {
    link.style.setProperty('display', 'inline-flex', 'important');
    link.style.setProperty('width', '44px', 'important');
    link.style.setProperty('height', '44px', 'important');
    link.style.setProperty('min-width', '44px', 'important');
    link.style.setProperty('min-height', '44px', 'important');
    link.style.setProperty('align-items', 'center', 'important');
    link.style.setProperty('justify-content', 'center', 'important');
    link.style.setProperty('overflow', 'visible', 'important');
    link.style.setProperty('margin-bottom', '8px', 'important');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', resizeLivroReclamacoesIcon);
} else {
  resizeLivroReclamacoesIcon();
}
/* =========================================================
   ÁREA DE CLIENTE
   ========================================================= */

function customerOrderStatus(order) {
  if (order.payment_status === 'paid') {
    return 'Pagamento recebido';
  }

  if (order.payment_status === 'pending') {
    return 'A aguardar pagamento';
  }

  const labels = {
    pending: 'Pedido recebido',
    confirmed: 'Confirmada',
    ready: 'Pronta',
    completed: 'Concluída',
    cancelled: 'Cancelada',
    expired: 'Expirada'
  };

  return (
    labels[order.status] ||
    order.status ||
    'Em processamento'
  );
}

function customerOrderCard(order) {
  return `
    <article class="customer-panel-card">
      <div>
        <strong>
          ${escapeHtml(
            order.order_number ||
            `Pedido ${order.id}`
          )}
        </strong>

        <small>
          ${formatOrderDate(order.created_at)}
        </small>
      </div>

      <div>
        <strong>
          ${formatOrderMoney(order.total_cents)}
        </strong>

        <small>
          ${escapeHtml(
            customerOrderStatus(order)
          )}
        </small>
      </div>
    </article>
  `;
}

function customerSubscriptionCard(subscription) {
  const frequencyLabel =
    freq[subscription.frequency] ||
    subscription.frequency ||
    'Frequência não indicada';

  const statusLabel =
    substat[subscription.status] ||
    subscription.status ||
    'Estado não indicado';

  return `
    <article class="customer-panel-card">
      <div>
        <strong>
          ${Number(
            subscription.eggs_per_delivery ||
            subscription.eggs ||
            0
          )} ovos
        </strong>

        <small>
          ${escapeHtml(frequencyLabel)}
        </small>
      </div>

      <span class="status">
        ${escapeHtml(statusLabel)}
      </span>
    </article>
  `;
}

function countCustomerDocuments(orders) {
  return orders.reduce(
    (total, order) => {
      const documents =
        order.documents || {};

      const hasReceipt =
        documents.receipt?.status ===
          'available' ||
        order.receipt_status === 'issued';

      const hasInvoice =
        documents.invoice?.status ===
          'available' ||
        order.invoice_status ===
          'available';

      const hasCreditNote =
        documents.creditNote?.status ===
          'available' ||
        order.credit_note_status ===
          'available';

      return (
        total +
        Number(hasReceipt) +
        Number(hasInvoice) +
        Number(hasCreditNote)
      );
    },
    0
  );
}

function openCustomerView(
  viewName,
  updateAddress = true
) {
  const targetPanel =
    document.querySelector(
      `#view-${viewName}`
    );

  if (!targetPanel) {
    return;
  }

  document
    .querySelectorAll(
      '.customer-nav-button'
    )
    .forEach(button => {
      const selected =
        button.dataset.view === viewName;

      button.classList.toggle(
        'active',
        selected
      );

      if (selected) {
        button.setAttribute(
          'aria-current',
          'page'
        );
      } else {
        button.removeAttribute(
          'aria-current'
        );
      }
    });

  document
    .querySelectorAll('.customer-view')
    .forEach(panel => {
      panel.classList.toggle(
        'active',
        panel === targetPanel
      );
    });

  if (updateAddress) {
    history.pushState(
      {
        customerView: viewName
      },
      '',
      `#${viewName}`
    );
  }
}

function getCustomerViewFromAddress() {
  const requestedView =
    location.hash
      .replace('#', '')
      .trim();

  const allowedViews = [
    'summary',
    'orders',
    'subscriptions',
    'profile',
    'fiscal',
    'addresses',
    'security'
  ];

  return allowedViews.includes(
    requestedView
  )
    ? requestedView
    : 'summary';
}

async function loadCustomerAreaData() {
  const [
    ordersResponse,
    subscriptionsResponse,
    authenticationResponse
  ] = await Promise.all([
    api('/api/my/orders'),
    api('/api/my/subscriptions'),
    api('/api/auth/me')
  ]);

  const orders =
    Array.isArray(ordersResponse.orders)
      ? ordersResponse.orders
      : [];

  const subscriptions =
    Array.isArray(
      subscriptionsResponse.subscriptions
    )
      ? subscriptionsResponse.subscriptions
      : [];

  const customer =
    authenticationResponse.customer ||
    null;

  const summaryOrders =
    document.querySelector(
      '#summaryOrders'
    );

  const summarySubscriptions =
    document.querySelector(
      '#summarySubscriptions'
    );

  const summaryDocuments =
    document.querySelector(
      '#summaryDocuments'
    );

  const recentOrders =
    document.querySelector(
      '#customerRecentOrders'
    );

  if (summaryOrders) {
    summaryOrders.textContent =
      String(orders.length);
  }

  if (summarySubscriptions) {
    summarySubscriptions.textContent =
      String(subscriptions.length);
  }

  if (summaryDocuments) {
    summaryDocuments.textContent =
      String(
        countCustomerDocuments(orders)
      );
  }

  if (recentOrders) {
    recentOrders.innerHTML =
      orders.length
        ? orders
            .slice(0, 3)
            .map(customerOrderCard)
            .join('')
        : `
            <p>
              Ainda não existem encomendas.
            </p>
          `;
  }

  const ordersPanel =
    document.querySelector(
      '#dashboardOrders'
    );

  if (ordersPanel) {
    ordersPanel.innerHTML = `
      <div class="customer-panel-heading">
        <p>
          ${orders.length}
          ${
            orders.length === 1
              ? 'encomenda'
              : 'encomendas'
          }
        </p>

        <a
          class="customer-panel-action"
          href="/encomendas.html"
        >
          Ver tudo
        </a>
      </div>

      ${
        orders.length
          ? orders
              .map(customerOrderCard)
              .join('')
          : `
              <p>
                Ainda não existem encomendas.
              </p>
            `
      }
    `;
  }

  const subscriptionsPanel =
    document.querySelector(
      '#dashboardSubscriptions'
    );

  if (subscriptionsPanel) {
    subscriptionsPanel.innerHTML = `
      <div class="customer-panel-heading">
        <p>
          ${subscriptions.length}
          ${
            subscriptions.length === 1
              ? 'subscrição'
              : 'subscrições'
          }
        </p>

        <a
          class="customer-panel-action"
          href="/subscricoes.html"
        >
          Ver e gerir
        </a>
      </div>

      ${
        subscriptions.length
          ? subscriptions
              .map(
                customerSubscriptionCard
              )
              .join('')
          : `
              <p>
                Ainda não existem subscrições.
              </p>

              <a
                class="button solid"
                href="/produtos.html"
              >
                Criar subscrição
              </a>
            `
      }
    `;
  }

  const profilePanel =
    document.querySelector(
      '#dashboardProfile'
    );

  if (
    profilePanel &&
    customer
  ) {
    profilePanel.innerHTML = `
      <article class="customer-profile-card">
        <p>
          <strong>Nome</strong><br>
          ${escapeHtml(customer.name || '')}
        </p>

        <p>
          <strong>Nome de utilizador</strong><br>
          ${escapeHtml(
            customer.username || ''
          )}
        </p>

        <p>
          <strong>Email</strong><br>
          ${escapeHtml(customer.email || '')}
        </p>

        <a
          class="button outline"
          href="/perfil.html"
        >
          Editar perfil
        </a>
      </article>
    `;
  }
}

function initializeCustomerArea() {
  const customerPage =
    document.querySelector(
      '.customer-page'
    );

  if (!customerPage) {
    return;
  }

  document
    .querySelectorAll(
      '.customer-nav-button'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () => {
          openCustomerView(
            button.dataset.view
          );
        }
      );
    });

  window.addEventListener(
    'popstate',
    () => {
      openCustomerView(
        getCustomerViewFromAddress(),
        false
      );
    }
  );

  openCustomerView(
    getCustomerViewFromAddress(),
    false
  );

  loadCustomerAreaData()
    .catch(error => {
      console.error(
        'Erro ao carregar a área de cliente:',
        error
      );

      const recentOrders =
        document.querySelector(
          '#customerRecentOrders'
        );

      if (recentOrders) {
        recentOrders.innerHTML = `
          <p class="form-message error">
            Não foi possível carregar a informação.
          </p>
        `;
      }
    });
}

if (
  document.readyState === 'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    initializeCustomerArea,
    {
      once: true
    }
  );
} else {
  initializeCustomerArea();
}
/* =========================================================
   PERFIL
   ========================================================= */

async function loadCustomerProfile() {

  const profileForm =
    document.querySelector(
      '#customerProfileForm'
    );

  if (!profileForm) {
    return;
  }

  const response =
    await api(
      '/api/my/profile-details'
    );

  const profile =
    response.profile;

  profileForm.name.value =
    profile.name || '';

  profileForm.username.value =
    profile.username || '';

  profileForm.email.value =
    profile.email || '';

  profileForm.phone.value =
    profile.phone || '';

  profileForm.notificationsEnabled.checked =
    Boolean(profile.notificationsEnabled);

  const avatarPreview =
    document.querySelector(
      '#customerAvatarPreview'
    );

  const removeAvatar =
    document.querySelector(
      '#removeCustomerAvatar'
    );

  if (
    profile.avatarAvailable &&
    profile.avatarUrl &&
    avatarPreview
  ) {

    avatarPreview.innerHTML = `
      <img
        src="${profile.avatarUrl}"
        alt="Fotografia"
      >
    `;

    if (removeAvatar) {
      removeAvatar.hidden = false;
    }
  }

  profileForm.addEventListener(
    'submit',
    async event => {

      event.preventDefault();

      const formData =
        new FormData(profileForm);

      try {

        await api(
          '/api/my/profile-details',
          {
            method: 'PATCH',

            body: JSON.stringify({
              name:
                formData.get('name'),

              username:
                formData.get('username'),

              phone:
                formData.get('phone'),

              notificationsEnabled:
                formData.get(
                  'notificationsEnabled'
                ) === 'on'
            })
          }
        );

        document.querySelector(
          '#customerProfileMessage'
        ).textContent =
          'Perfil atualizado.';

      } catch (error) {

        document.querySelector(
          '#customerProfileMessage'
        ).textContent =
          error.message;
      }
    }
  );
}

/* =========================================================
   DADOS FISCAIS
   ========================================================= */

async function loadFiscalProfile() {

  const fiscalForm =
    document.querySelector(
      '#customerFiscalForm'
    );

  if (!fiscalForm) {
    return;
  }

  const response =
    await api(
      '/api/my/fiscal-profile'
    );

  const fiscal =
    response.fiscalProfile;

  fiscalForm.customerType.value =
    fiscal.customer_type || 'individual';

  fiscalForm.fiscalName.value =
    fiscal.fiscal_name || '';

  fiscalForm.taxNumber.value =
    fiscal.tax_number || '';

  fiscalForm.billingEmail.value =
    fiscal.billing_email || '';

  fiscalForm.fiscalCountry.value =
    fiscal.fiscal_country || 'PT';

  fiscalForm.addEventListener(
    'submit',
    async event => {

      event.preventDefault();

      const formData =
        new FormData(fiscalForm);

      try {

        await api(
          '/api/my/fiscal-profile',
          {
            method: 'PUT',

            body: JSON.stringify({
              customerType:
                formData.get(
                  'customerType'
                ),

              fiscalName:
                formData.get(
                  'fiscalName'
                ),

              taxNumber:
                formData.get(
                  'taxNumber'
                ),

              billingEmail:
                formData.get(
                  'billingEmail'
                ),

              fiscalCountry:
                formData.get(
                  'fiscalCountry'
                )
            })
          }
        );

        document.querySelector(
          '#customerFiscalMessage'
        ).textContent =
          'Dados fiscais guardados.';

      } catch (error) {

        document.querySelector(
          '#customerFiscalMessage'
        ).textContent =
          error.message;
      }
    }
  );
}

/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    loadCustomerProfile()
      .catch(console.error);

    loadFiscalProfile()
      .catch(console.error);

  }
);
