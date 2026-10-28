const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const dialog = $('#auth-dialog');
let mode = 'login';
let me = null;
let currentStock = { availableEggs: 0 };
const formats = [6, 12, 18, 30];

function notice(text) {
  const element = document.createElement('div');
  element.className = 'notice';
  element.textContent = text;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 5000);
}

$('.mobile-menu')?.addEventListener('click', event => {
  const open = $('#sidebar')?.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', String(Boolean(open)));
});

const year = $('#year');
if (year) year.textContent = new Date().getFullYear();

function openAuth(nextMode) {
  mode = nextMode;
  updateAuth();
  dialog?.showModal();
}

function updateAuth() {
  const registering = mode === 'register';
  $('#auth-title').textContent = registering ? 'Criar conta' : 'Entrar';
  $$('.register-field').forEach(element => {
    element.hidden = !registering;
  });
  $('#auth-submit').textContent = registering ? 'Criar conta' : 'Entrar';
  $('#auth-switch').textContent = registering
    ? 'Já tem conta? Entrar'
    : 'Ainda não tem conta? Criar conta';
}

$$('[data-auth]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.auth === 'account') {
      notice(`${me?.name || ''} · ${me?.email || ''}`);
      return;
    }
    openAuth(button.dataset.auth);
  });
});

$('.close')?.addEventListener('click', () => dialog?.close());

$('#auth-switch')?.addEventListener('click', () => {
  mode = mode === 'login' ? 'register' : 'login';
  updateAuth();
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Erro ${response.status} no pedido.`);
  }
  return data;
}

async function session() {
  try {
    const data = await api('/api/auth/me');
    me = data.customer;
    document.body.classList.toggle('authenticated', data.authenticated);
    if (data.authenticated) await loadOrders();
  } catch (error) {
    me = null;
    document.body.classList.remove('authenticated');
    console.error(error);
  }
}

session();

$('#auth-form')?.addEventListener('submit', async event => {
  event.preventDefault();

  // Guardar a referência antes do primeiro await evita currentTarget = null.
  const form = event.currentTarget;
  const submitButton = $('#auth-submit');
  const formData = new FormData(form);
  const originalButtonText = submitButton.textContent;

  const body = {
    email: formData.get('email'),
    password: formData.get('password')
  };

  if (mode === 'register') {
    body.name = formData.get('name');
    body.notificationsEnabled = Boolean(formData.get('notificationsEnabled'));
    body.privacyAccepted = Boolean(formData.get('privacyAccepted'));
  }

  submitButton.disabled = true;
  submitButton.textContent = mode === 'register' ? 'A criar conta...' : 'A entrar...';

  try {
    await api(`/api/auth/${mode}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const successMessage = mode === 'register'
      ? 'Conta criada com sucesso.'
      : 'Sessão iniciada.';

    form.reset();
    dialog?.close();
    notice(successMessage);
    await session();
  } catch (error) {
    notice(error.message);
    console.error(error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;
  }
});

$('#logout')?.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    me = null;
    document.body.classList.remove('authenticated');
    notice('Sessão terminada.');
  } catch (error) {
    notice(error.message);
  }
});

function renderFormats() {
  const options = formats.filter(eggs => eggs <= currentStock.availableEggs);
  const box = $('#egg-package-chooser');
  if (!box) return;

  box.innerHTML = options.length
    ? options.map((eggs, index) => `
        <button type="button"
          class="egg-package-option ${index === 0 ? 'active' : ''}"
          data-eggs="${eggs}">
          <strong>${eggs} ovos</strong>
          <span>${eggs / 6} caixa${eggs === 6 ? '' : 's'} de 6</span>
        </button>`).join('')
    : '<p>Sem formatos disponíveis.</p>';

  $$('[data-eggs]', box).forEach(button => {
    button.addEventListener('click', () => {
      $$('[data-eggs]', box).forEach(item => {
        item.classList.toggle('active', item === button);
      });
    });
  });
}

async function loadStock() {
  try {
    const data = await api('/api/stock');
    currentStock = data.stock;
    $('#stock-count').textContent = data.stock.available
      ? `${data.stock.availablePacks} caixas disponíveis`
      : 'Temporariamente esgotado';
    $('#stock-note').textContent = `${data.stock.availableEggs} ovos em stock.`;
    renderFormats();
    $('#order').disabled = !data.stock.available;
  } catch (error) {
    $('#stock-count').textContent = 'Disponibilidade não confirmada';
    console.error(error);
  }
}

loadStock();

$('#order')?.addEventListener('click', async () => {
  const eggs = Number($('.egg-package-option.active')?.dataset.eggs);
  if (!eggs) return;

  if (!me) {
    openAuth('login');
    notice('Inicia sessão ou cria conta antes de reservar.');
    return;
  }

  try {
    const data = await api('/api/reservations', {
      method: 'POST',
      body: JSON.stringify({ packs: eggs / 6 })
    });
    notice(`Reserva ${data.reservation.number} criada.`);
    await Promise.all([loadStock(), loadOrders()]);
  } catch (error) {
    notice(error.message);
  }
});

async function loadOrders() {
  if (!me) return;
  const list = $('#orders-list');
  if (!list) return;

  try {
    const data = await api('/api/my/reservations');
    list.innerHTML = data.reservations.length
      ? data.reservations.map(reservation => `
          <article class="order-card">
            <div>
              <strong>${reservation.reservation_number}</strong>
              <div>${new Date(`${reservation.created_at}Z`).toLocaleString('pt-PT')}</div>
            </div>
            <div>
              <strong>${reservation.quantity_eggs} ovos</strong>
              <div>${reservation.status}</div>
            </div>
          </article>`).join('')
      : '<p>Ainda não existem encomendas associadas à conta.</p>';
  } catch (error) {
    list.textContent = error.message;
  }
}
