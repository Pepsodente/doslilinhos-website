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
  sessionStorage.getItem(
    'dl_admin_token'
  ) || '';

let data = {
  orders: [],
  subscriptions: []
};

let view = 'orders';
let summary = 'all';
let auditEvents = [];
let fiscalDocs = [];
let busy = new Set();

const PORTAL_AT_URL =
  'https://irs.portaldasfinancas.gov.pt/recibos/portal/emitir/emitirDocumentos';

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
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers['Content-Type'] =
      'application/json';
  }

  const response = await fetch(
    path,
    {
      ...options,
      headers
    }
  );

  const result =
    await response.json();

  if (!response.ok) {
    throw new Error(
      result.error ||
      'Erro no pedido'
    );
  }

  return result;
}

const money = cents =>
  new Intl.NumberFormat(
    'pt-PT',
    {
      style: 'currency',
      currency: 'EUR'
    }
  ).format(
    (Number(cents) || 0) / 100
  );

const date = value => {
  if (!value) {
    return '—';
  }

  const normalized =
    String(value).includes('T')
      ? String(value)
      : `${String(value).replace(' ', 'T')}Z`;

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return esc
