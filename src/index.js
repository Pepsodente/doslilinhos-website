import {
  PDFDocument,
  StandardFonts,
  rgb
} from 'pdf-lib';
const RESEND_API='https://api.resend.com/emails';
const e = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]
  );
const euros=c=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format((Number(c)||0)/100);
/* =========================================================
   CÁLCULOS FISCAIS E UTILITÁRIOS DOS RECIBOS
   ========================================================= */

function assertIntegerCents(value, fieldName = 'Valor') {
  const number = Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${fieldName} inválido.`);
  }

  return number;
}

function assertVatRate(rateBps) {
  const rate = Number(rateBps);

  if (
    !Number.isInteger(rate) ||
    ![0, 600, 1300, 2300].includes(rate)
  ) {
    throw new Error('Taxa de IVA inválida.');
  }

  return rate;
}

function applyPercentageDiscount(
  grossCents,
  discountBps = 0
) {
  const gross = assertIntegerCents(
    grossCents,
    'Preço com IVA'
  );

  const discount = Number(discountBps || 0);

  if (
    !Number.isInteger(discount) ||
    discount < 0 ||
    discount > 10000
  ) {
    throw new Error('Desconto percentual inválido.');
  }

  return Math.round(
    gross * (10000 - discount) / 10000
  );
}

function splitVatFromGross(
  grossCents,
  vatRateBps
) {
  const gross = assertIntegerCents(
    grossCents,
    'Total com IVA'
  );

  const rate = assertVatRate(vatRateBps);

  if (rate === 0) {
    return {
      netCents: gross,
      vatCents: 0,
      grossCents: gross,
      vatRateBps: 0
    };
  }

  const net = Math.round(
    gross * 10000 / (10000 + rate)
  );

  return {
    netCents: net,
    vatCents: gross - net,
    grossCents: gross,
    vatRateBps: rate
  };
}

function calculateFiscalLine({
  unitGrossCents,
  quantity = 1,
  discountBps = 0,
  vatRateBps
}) {
  const unitGross = assertIntegerCents(
    unitGrossCents,
    'Preço unitário'
  );

  const qty = Number(quantity);

  if (
    !Number.isInteger(qty) ||
    qty < 1
  ) {
    throw new Error('Quantidade inválida.');
  }

  const grossBeforeDiscount =
    unitGross * qty;

  const grossAfterDiscount =
    applyPercentageDiscount(
      grossBeforeDiscount,
      discountBps
    );

  const discountGrossCents =
    grossBeforeDiscount - grossAfterDiscount;

  const tax = splitVatFromGross(
    grossAfterDiscount,
    vatRateBps
  );

  return {
    quantity: qty,
    unitGrossCents: unitGross,
    discountBps: Number(discountBps || 0),
    grossBeforeDiscountCents:
      grossBeforeDiscount,
    discountGrossCents,
    lineNetCents: tax.netCents,
    lineVatCents: tax.vatCents,
    lineGrossCents: tax.grossCents,
    vatRateBps: tax.vatRateBps
  };
}

function buildVatBreakdown(lines = []) {
  const grouped = new Map();

  for (const line of lines) {
    const rate = assertVatRate(
      line.vatRateBps
    );

    const current = grouped.get(rate) || {
      vatRateBps: rate,
      netCents: 0,
      vatCents: 0,
      grossCents: 0
    };

    current.netCents +=
      assertIntegerCents(
        line.lineNetCents,
        'Base tributável'
      );

    current.vatCents +=
      assertIntegerCents(
        line.lineVatCents,
        'IVA'
      );

    current.grossCents +=
      assertIntegerCents(
        line.lineGrossCents,
        'Total'
      );

    grouped.set(rate, current);
  }

  return [...grouped.values()]
    .sort(
      (a, b) =>
        a.vatRateBps - b.vatRateBps
    );
}

function calculateFiscalTotals(lines = []) {
  const breakdown = buildVatBreakdown(lines);

  return {
    netTotalCents: breakdown.reduce(
      (total, item) =>
        total + item.netCents,
      0
    ),

    vatTotalCents: breakdown.reduce(
      (total, item) =>
        total + item.vatCents,
      0
    ),

    grossTotalCents: breakdown.reduce(
      (total, item) =>
        total + item.grossCents,
      0
    ),

    vatBreakdown: breakdown
  };
}

function vatRateLabel(rateBps) {
  const rate = Number(rateBps || 0);

  return `${new Intl.NumberFormat(
    'pt-PT',
    {
      maximumFractionDigits: 2
    }
  ).format(rate / 100)}%`;
}

function formatReceiptNumber(
  year,
  sequence
) {
  return [
    'DL-RC',
    String(year),
    String(sequence).padStart(6, '0')
  ].join('-');
}

function safePdfText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function abbreviatedPaymentReference(value) {
  const reference = String(value || '').trim();

  if (reference.length <= 14) {
    return reference;
  }

  return `${reference.slice(0, 6)}…${reference.slice(-4)}`;
}

function bytesToBase64(bytes) {
  let binary = '';

  const chunkSize = 8192;

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    const chunk = bytes.subarray(
      offset,
      offset + chunkSize
    );

    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}
const dt=v=>v?new Intl.DateTimeFormat('pt-PT',{dateStyle:'long',timeStyle:'short'}).format(new Date(v)):'a definir';
const first=n=>String(n||'').trim().split(/\s+/)[0]||'Olá';
const icon=n=>/ovo/i.test(n)?'🥚':/frango/i.test(n)?'🌿':/cabaz|regional|alheira|chouri/i.test(n)?'🧺':'📦';
const list=items=>`<div style="margin:18px 0;padding:16px;background:#f6f6f4;border-radius:9px">${(items||[]).map(x=>`<div style="padding:7px 0">${icon(x.name)} <strong>${e(x.name)}</strong>${x.quantity?` · ${e(x.quantity)}`:''}</div>`).join('')}</div>`;
function shell(title,body,label,url){return `<!doctype html><html><body style="margin:0;background:#f3f3ef;font-family:Arial,sans-serif;color:#343434"><table width="100%" role="presentation"><tr><td align="center" style="padding:28px 12px"><table width="100%" role="presentation" style="max-width:640px;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="height:10px;background:#7fc36d"></td></tr><tr><td style="padding:30px 34px 8px"><div style="font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#315f37;font-weight:800">Dos Lilinhos</div><h1 style="font-size:30px;line-height:1.15;margin:12px 0">${e(title)}</h1></td></tr><tr><td style="padding:8px 34px 30px;font-size:16px;line-height:1.65">${body}${label&&url?`<p style="margin-top:27px"><a href="${e(url)}" style="display:inline-block;padding:14px 21px;background:#ed4d5a;color:#fff;text-decoration:none;border-radius:6px;font-weight:800">${e(label)}</a></p>`:''}</td></tr><tr><td style="padding:20px 34px;background:#252525;color:#ddd;font-size:12px">Email necessário para acompanhar pedidos e subscrições.Responde para encomendas@doslilinhos.pt</td></tr></table></td></tr></table></body></html>`}
const T={
order_received:d=>({s:`O teu pedido já chegou até nós 📦 · ${d.number}`,h:shell('Pedido recebido 📦',`<p>Olá, <strong>${e(first(d.name))}</strong> 👋</p><p>Recebemos o pedido <strong>${e(d.number)}</strong> e já estamos a verificar a disponibilidade.</p>${list(d.items)}<p>Por enquanto está <strong>a aguardar aprovação</strong>. Enviamos os próximos passos assim que estiver confirmado.</p>`,'Acompanhar pedido',d.url)}),
order_admin:d=>({s:`Novo pedido para aprovar 📦 · ${d.number}`,h:shell('Novo pedido para aprovar',`<p><strong>${e(d.name)}</strong> enviou um pedido.</p>${list(d.items)}<p><strong>Email:</strong> ${e(d.email)}<strong>Nota:</strong> ${e(d.note||'Sem observações')}</p>`,'Abrir painel',d.adminUrl)}),
order_approved:d=>({s:`Está confirmado ✨ · ${d.number}`,h:shell('Está confirmado ✨',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>O pedido <strong>${e(d.number)}</strong> foi aprovado.</p>${list(d.items)}<p><strong>Total:</strong> ${euros(d.totalCents)}<strong>Data:</strong> ${e(dt(d.pickupAt))}<strong>Local:</strong> ${e(d.location||'a definir')}</p>`,'Ver pedido',d.url)}),
order_rejected:d=>({s:`Atualização sobre o pedido ${d.number}`,h:shell('Desta vez não conseguimos confirmar',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>O pedido <strong>${e(d.number)}</strong> não foi aprovado.</p><p style="padding:15px;background:#f6f6f4"><strong>Motivo:</strong>${e(d.note||'Indisponibilidade temporária.')}</p><p>Não foi efetuada qualquer cobrança.</p>`,'Ver produtos',d.productsUrl)}),
order_preparing:d=>({s:`Já estamos a preparar tudo 🌿 · ${d.number}`,h:shell('Em preparação 🌿',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>O pedido <strong>${e(d.number)}</strong> já está em preparação.</p>`,'Ver pedido',d.url)}),
order_ready:d=>({s:`Está pronto para ti 📍 · ${d.number}`,h:shell('Pronto para recolha 📍',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p>${list(d.items)}<p><strong>Local:</strong> ${e(d.location||'a definir')}<strong>Data:</strong> ${e(dt(d.pickupAt))}</p>`,'Ver detalhes',d.url)}),
order_completed:d=>({s:`Pedido concluído 🌱 · ${d.number}`,h:shell('Obrigado 🌱',`<p>O pedido <strong>${e(d.number)}</strong> ficou concluído.</p><p>Esperamos voltar a preparar algo para ti em breve.</p>`,'Ver produtos',d.productsUrl)}),
subscription_received:d=>({s:'Recebemos o teu pedido de subscrição 🔁',h:shell('Pedido de subscrição recebido 🔁',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>Recebemos o pedido e vamos verificar se conseguimos garantir a regularidade.</p><div style="padding:16px;background:#f6f6f4"><strong>${e(d.product)}</strong>${e(d.quantity)} · ${e(d.frequency)}Em caso de falta: ${e(d.shortage)}</div><p>A subscrição ainda não está ativa e não houve cobrança.</p>`,'Acompanhar pedido',d.url)}),
subscription_approved:d=>({s:'A tua subscrição está ativa 🌱',h:shell('Subscrição ativa 🌱',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>A subscrição foi aprovada.</p><div style="padding:16px;background:#f6f6f4"><strong>${e(d.product)}</strong>${e(d.quantity)} · ${e(d.frequency)}Primeira entrega: ${e(dt(d.firstDelivery))}Valor: ${euros(d.priceCents)}</div>`,'Gerir subscrição',d.url)}),
payment_available:d=>({s:`Pagamento disponível 💳 · ${d.number}`,h:shell('Já podes concluir o pagamento 💳',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>O pedido <strong>${e(d.number)}</strong> foi aprovado e está reservado.</p>${list(d.items)}<p><strong>Total:</strong> ${euros(d.totalCents)}<strong>Recolha prevista:</strong> ${e(dt(d.pickupAt))}<strong>Local:</strong> ${e(d.location||'a definir')}</p><p>Conclui o pagamento para avançarmos com a preparação. No checkout serão apresentados os métodos disponíveis, incluindo cartão e MB WAY quando elegível.</p>`,'Pagar agora',d.paymentUrl)}),
payment_received:d=>({s:`Pagamento recebido ✅ · ${d.number}`,h:shell('Pagamento recebido ✅',`<p>Tudo certo, <strong>${e(first(d.name))}</strong>.</p><p>Recebemos <strong>${euros(d.totalCents)}</strong> para o pedido <strong>${e(d.number)}</strong>.</p><p>O pedido está agora pronto para entrar em preparação. Enviamos outro aviso quando avançar para a fase seguinte.</p>`,'Acompanhar pedido',d.url)}),
payment_expired:d=>({s:`O pagamento expirou ⏳ · ${d.number}`,h:shell('O prazo de pagamento terminou',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>O endereço de pagamento do pedido <strong>${e(d.number)}</strong> expirou.</p><p>Se ainda quiseres avançar, responde a este email para verificarmos novamente a disponibilidade.</p>`,'Ver pedido',d.url)}),
issue_reported:d=>({s:`Precisamos de falar sobre o teu pedido · ${d.number}`,h:shell('Algo não correu como previsto',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>Algo não correu como previsto com o pedido <strong>${e(d.number)}</strong>.</p><p>Para não avançarmos sem esclarecer a situação, suspendemos a encomenda.</p><p><strong>Estado atual:</strong> ${e(d.stateLabel||'Problema em análise')}</p><p>Se já tiver sido efetuado um pagamento, o eventual reembolso será enviado para o método de pagamento original.</p><p>Vamos contactar-te em breve para explicar o sucedido e acompanhar os próximos passos. Não precisas de fazer nada neste momento.</p><p>Se quiseres falar connosco antes disso, responde diretamente a este email.</p>`,'Ver pedido',d.url)}),
refund_completed:d=>({s:`Reembolso confirmado · ${d.number}`,h:shell('Reembolso confirmado',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>O reembolso de <strong>${euros(d.refundAmount)}</strong> relativo ao pedido <strong>${e(d.number)}</strong> foi confirmado.</p><p>O valor segue para o método de pagamento original. O tempo até aparecer depende da entidade financeira.</p>`,'Ver pedido',d.url)}),
refund_failed:d=>({s:`Atualização sobre o reembolso · ${d.number}`,h:shell('Estamos a acompanhar o reembolso',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>O reembolso do pedido <strong>${e(d.number)}</strong> precisa de verificação adicional.</p><p>Vamos contactar-te em breve. Não precisas de fazer nada neste momento.</p>`,'Ver pedido',d.url)}),
invoice_registered:d=>({s:`Documento fiscal disponível · ${d.number}`,h:shell('Documento fiscal disponível',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>O documento fiscal do pedido <strong>${e(d.number)}</strong> está registado.</p><p><strong>Documento:</strong> ${e(d.documentTypeLabel)} ${e(d.documentNumber)}<strong>Data:</strong> ${e(d.documentDate)}<strong>Total:</strong> ${euros(d.totalCents)}</p><p>Podes consultar os detalhes na tua área de cliente.</p>`,'Ver pedido',d.url)}),
credit_note_registered:d=>({s:`Devolução regularizada · ${d.number}`,h:shell('Devolução regularizada',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>A regularização do pedido <strong>${e(d.number)}</strong> ficou registada.</p><p><strong>Nota de crédito:</strong> ${e(d.documentNumber)}<strong>Data:</strong> ${e(d.documentDate)}<strong>Valor:</strong> ${euros(d.totalCents)}</p><p>O reembolso, quando aplicável, segue para o método de pagamento original.</p>`,'Ver pedido',d.url)}),
access_recovery:d=>({s:'Recuperar acesso à tua conta',h:shell('Recuperar acesso',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>Recebemos um pedido para recuperar o acesso à tua conta.</p><p><strong>Nome de utilizador:</strong> ${e(d.username||'não definido')}</p><p>Utiliza o botão abaixo para definires uma nova palavra-passe. A ligação é válida durante 30 minutos e só pode ser usada uma vez.</p><p>Se não fizeste este pedido, ignora este email. A conta não foi alterada.</p>`,'Definir nova palavra-passe',d.resetUrl)}),
password_changed:d=>({s:'A tua palavra-passe foi alterada',h:shell('Palavra-passe alterada',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>A palavra-passe da tua conta foi alterada e todas as sessões anteriores foram terminadas.</p><p>Se não reconheces esta alteração, responde imediatamente para encomendas@doslilinhos.pt.</p>`,'Entrar',d.loginUrl)}),
subscription_rejected:d=>({s:'Atualização sobre a tua subscrição',h:shell('Não conseguimos ativar desta vez',`<p>Olá, <strong>${e(first(d.name))}</strong>.</p><p>Neste momento não conseguimos garantir regularmente o pedido.</p><p style="padding:15px;background:#f6f6f4">${e(d.note||'Capacidade temporariamente indisponível.')}</p><p>Não houve cobrança.</p>`,'Ver produtos',d.productsUrl)})};
async function sendEmail(env,db,{type,to,data,customerId=null,orderId=null,subscriptionId=null}){const make=T[type];if(!make)return;const x=make(data),q=await db.prepare(`INSERT INTO email_messages(customer_id,order_id,subscription_id,message_type,recipient,subject,status) VALUES(?,?,?,?,?,?,'queued')`).bind(customerId,orderId,subscriptionId,type,to,x.s).run();try{const r=await fetch(RESEND_API,{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM||'Dos Lilinhos <encomendas@doslilinhos.pt>',to:[to],reply_to:env.EMAIL_REPLY_TO||'encomendas@doslilinhos.pt',subject:x.s,html:x.h})}),z=await r.json();if(!r.ok)throw Error(z.message||'Falha no envio');await db.prepare(`UPDATE email_messages SET status='sent',attempts=attempts+1,provider_message_id=?,sent_at=CURRENT_TIMESTAMP WHERE id=?`).bind(z.id,q.meta.last_row_id).run();return z;}catch(err){await db.prepare(`UPDATE email_messages SET status='failed',attempts=attempts+1,last_error=? WHERE id=?`).bind(String(err.message||err),q.meta.last_row_id).run();console.error(err);}}

const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store'},E=new TextEncoder(),out=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{...H,...h}}),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''),b64=b=>btoa(String.fromCharCode(...b)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const cookie=(r,n)=>{const x=(r.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='));return x?decodeURIComponent(x.slice(n.length+1)):''};async function sha(v){return hex(await crypto.subtle.digest('SHA-256',E.encode(v)))}async function derive(p,s){const k=await crypto.subtle.importKey('raw',E.encode(p),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(s),iterations:100000,hash:'SHA-256'},k,256))}async function hashPass(p){const s=b64(crypto.getRandomValues(new Uint8Array(16)));return `${s}:${await derive(p,s)}`}async function verifyPass(p,v){const [s,h]=String(v||'').split(':');return !!s&&!!h&&await derive(p,s)===h}async function customer(r,e){const t=cookie(r,'dl_session');if(!t)return null;return e.DB.prepare(`SELECT c.id,c.name,c.username,c.email,c.notifications_enabled FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND c.active=1`).bind(await sha(t)).first()}async function makeSession(id,e){const t=b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g,'');await e.DB.prepare(`INSERT INTO customer_sessions(customer_id,token_hash,expires_at) VALUES(?,?,datetime('now','+30 days'))`).bind(id,await sha(t)).run();return t}const setcookie=t=>`dl_session=${encodeURIComponent(t)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;async function product(e){return e.DB.prepare(`SELECT * FROM products WHERE active=1 ORDER BY id LIMIT 1`).first()}async function stock(e,id){const x=await e.DB.prepare(`SELECT COALESCE(SUM(quantity_eggs),0) eggs FROM inventory_movements WHERE product_id=?`).bind(id).first(),n=Math.max(0,+x.eggs);return{availableEggs:n,availablePacks:Math.floor(n/6),available:n>=6}}async function stripePost(env,path,params){if(!env.STRIPE_SECRET_KEY)throw Error('STRIPE_SECRET_KEY não configurada');const r=await fetch(`https://api.stripe.com/v1/${path}`,{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params)}),d=await r.json();if(!r.ok)throw Error(d.error?.message||'Erro Stripe');return d}
function stripeSignature(header){const values={};for(const part of String(header||'').split(',')){const [k,v]=part.split('=');if(k&&v)(values[k]??=[]).push(v)}return values}
async function verifyStripe(raw,header,secret){const p=stripeSignature(header),timestamp=p.t?.[0],signatures=p.v1||[];if(!timestamp||!signatures.length||!secret)return false;if(Math.abs(Date.now()/1000-Number(timestamp))>300)return false;const key=await crypto.subtle.importKey('raw',E.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),sig=await crypto.subtle.sign('HMAC',key,E.encode(`${timestamp}.${raw}`)),expected=hex(sig);return signatures.some(x=>x.length===expected.length&&x===expected)}
async function stripeGet(env,path){const r=await fetch(`https://api.stripe.com/v1/${path}`,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}}),d=await r.json();if(!r.ok)throw Error(d.error?.message||'Erro Stripe');return d}
async function audit(db,{entityType,entityId,reference=null,action,fromStatus=null,toStatus=null,actor,result='success',amountCents=null,reason=null,providerReference=null,webhookEventId=null,ipHash=null,details=null}){await db.prepare(`INSERT INTO audit_log(entity_type,entity_id,reference,action,from_status,to_status,actor,result,amount_cents,reason,provider_reference,webhook_event_id,ip_hash,details) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(entityType,entityId,reference,action,fromStatus,toStatus,actor,result,amountCents,reason,providerReference,webhookEventId,ipHash,details?JSON.stringify(details):null).run()}
async function requestHash(r){const ip=r.headers.get('cf-connecting-ip')||'';return ip?await sha(`audit:${ip}`):null}
const adminOK=(r,e)=>!!e.ADMIN_TOKEN&&r.headers.get('authorization')===`Bearer ${e.ADMIN_TOKEN}`;
async function orderDetails(e,id){const o=await e.DB.prepare(`SELECT o.*,c.name,c.email FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?`).bind(id).first();if(!o)return null;const q=await e.DB.prepare(`SELECT p.name,i.quantity_eggs quantity FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=?`).bind(id).all();o.items=q.results.map(x=>({name:x.name,quantity:`${x.quantity} unidades`}));return o;}
/* =========================================================
   CATÁLOGO FISCAL E LINHAS DA ENCOMENDA
   ========================================================= */

function eggProductCode(unitsPerPack) {
  const units = Number(unitsPerPack);

  const codes = {
    6: 'EGG-06',
    12: 'EGG-12',
    18: 'EGG-18',
    30: 'EGG-30'
  };

  const code = codes[units];

  if (!code) {
    throw new Error(
      `Não existe configuração fiscal para caixa de ${units} ovos.`
    );
  }

  return code;
}

async function getTaxProfile(
  env,
  productCode,
  date = new Date()
) {
  const dateText = date
    .toISOString()
    .slice(0, 10);

  const profile = await env.DB.prepare(`
    SELECT
      id,
      product_code,
      product_name,
      tax_country,
      tax_region,
      vat_rate_bps,
      vat_category,
      prices_include_vat,
      tax_treatment,
      tax_status,
      accounting_notes,
      valid_from,
      valid_until
    FROM product_tax_profiles
    WHERE product_code = ?
      AND tax_region = 'CONTINENT'
      AND tax_status = 'confirmed'
      AND valid_from <= ?
      AND (
        valid_until IS NULL
        OR valid_until >= ?
      )
    ORDER BY valid_from DESC
    LIMIT 1
  `)
    .bind(
      productCode,
      dateText,
      dateText
    )
    .first();

  if (!profile) {
    throw new Error(
      `Configuração fiscal em falta para ${productCode}.`
    );
  }

  if (
    profile.tax_treatment === 'direct' &&
    profile.vat_rate_bps === null
  ) {
    throw new Error(
      `A taxa de IVA de ${productCode} não está definida.`
    );
  }

  return profile;
}

async function getOrderFiscalItems(
  env,
  orderId
) {
  const result = await env.DB.prepare(`
    SELECT
      i.id,
      i.order_id,
      i.product_id,
      i.packs,
      i.units_per_pack,
      i.quantity_eggs,
      i.unit_price_cents,

      i.product_code,
      i.product_name_snapshot,
      i.vat_rate_bps,
      i.vat_category_snapshot,
      i.unit_gross_cents,
      i.discount_bps,
      i.line_net_cents,
      i.line_vat_cents,
      i.line_gross_cents,

      p.name AS current_product_name

    FROM order_items i

    JOIN products p
      ON p.id = i.product_id

    WHERE i.order_id = ?

    ORDER BY i.id
  `)
    .bind(orderId)
    .all();

  return result.results || [];
}

async function getOrderShipping(
  env,
  orderId
) {
  const order = await env.DB.prepare(`
    SELECT
      id,
      shipping_service_code,
      shipping_carrier,
      shipping_service_name,
      shipping_net_cents,
      shipping_vat_cents,
      shipping_gross_cents,
      shipping_vat_rate_bps
    FROM orders
    WHERE id = ?
  `)
    .bind(orderId)
    .first();

  if (!order) {
    throw new Error(
      'Encomenda não encontrada.'
    );
  }

  return order;
}

function validateDiscountBps(value) {
  const discount = Number(value || 0);

  if (
    !Number.isInteger(discount) ||
    discount < 0 ||
    discount > 10000
  ) {
    throw new Error(
      'O desconto percentual é inválido.'
    );
  }

  return discount;
}

function resolveLineDiscountBps(
  itemDiscountBps,
  orderDiscountBps
) {
  const orderDiscount =
    validateDiscountBps(orderDiscountBps);

  const itemDiscount =
    validateDiscountBps(itemDiscountBps);

  /*
   * Se a linha já tiver um desconto específico,
   * prevalece sobre o desconto geral.
   *
   * Como a base de dados atribui zero por omissão,
   * um valor superior a zero é tratado como
   * desconto específico da linha.
   */

  return itemDiscount > 0
    ? itemDiscount
    : orderDiscount;
}
/* =========================================================
   CONGELAR A FOTOGRAFIA FISCAL DA ENCOMENDA
   ========================================================= */

async function freezeOrderFiscalSnapshot(
  env,
  orderId,
  options = {}
) {
  const items = await getOrderFiscalItems(
    env,
    orderId
  );

  if (!items.length) {
    throw new Error(
      'A encomenda não contém produtos.'
    );
  }

  const orderDiscountBps =
    validateDiscountBps(
      options.discountBps || 0
    );

  const frozenLines = [];
  const updateStatements = [];

  for (const item of items) {
    const unitsPerPack = Number(
      item.units_per_pack
    );

    const productCode =
      item.product_code ||
      eggProductCode(unitsPerPack);

    const taxProfile =
      await getTaxProfile(
        env,
        productCode
      );

    if (
      taxProfile.tax_treatment !== 'direct'
    ) {
      throw new Error(
        `O produto ${productCode} exige uma composição fiscal própria.`
      );
    }

    const quantity = Number(item.packs);

    if (
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error(
        'A quantidade da linha é inválida.'
      );
    }

    const unitGrossCents = Number(
      item.unit_gross_cents ??
      item.unit_price_cents
    );

    const discountBps =
      resolveLineDiscountBps(
        item.discount_bps,
        orderDiscountBps
      );

    const line = calculateFiscalLine({
      unitGrossCents,
      quantity,
      discountBps,
      vatRateBps: Number(
        taxProfile.vat_rate_bps
      )
    });

    const productName =
      item.product_name_snapshot ||
      (
        unitsPerPack
          ? `${item.current_product_name} · Caixa de ${unitsPerPack}`
          : item.current_product_name
      );

    const frozenLine = {
      type: 'product',
      orderItemId: Number(item.id),

      productCode,
      productName,

      vatCategory:
        taxProfile.vat_category,

      quantity,

      unitsPerPack:
        unitsPerPack || null,

      quantityEggs:
        Number(item.quantity_eggs || 0),

      unitGrossCents:
        line.unitGrossCents,

      discountBps:
        line.discountBps,

      grossBeforeDiscountCents:
        line.grossBeforeDiscountCents,

      discountGrossCents:
        line.discountGrossCents,

      lineNetCents:
        line.lineNetCents,

      lineVatCents:
        line.lineVatCents,

      lineGrossCents:
        line.lineGrossCents,

      vatRateBps:
        line.vatRateBps
    };

    frozenLines.push(frozenLine);

    updateStatements.push(
      env.DB.prepare(`
        UPDATE order_items
        SET
          product_code = ?,
          product_name_snapshot = ?,
          vat_rate_bps = ?,
          vat_category_snapshot = ?,
          unit_gross_cents = ?,
          discount_bps = ?,
          line_net_cents = ?,
          line_vat_cents = ?,
          line_gross_cents = ?
        WHERE id = ?
          AND order_id = ?
      `).bind(
        frozenLine.productCode,
        frozenLine.productName,
        frozenLine.vatRateBps,
        frozenLine.vatCategory,
        frozenLine.unitGrossCents,
        frozenLine.discountBps,
        frozenLine.lineNetCents,
        frozenLine.lineVatCents,
        frozenLine.lineGrossCents,
        frozenLine.orderItemId,
        orderId
      )
    );
  }

  const order = await getOrderShipping(
    env,
    orderId
  );

  const shippingGrossCents = Number(
    order.shipping_gross_cents || 0
  );

  if (
    !Number.isInteger(shippingGrossCents) ||
    shippingGrossCents < 0
  ) {
    throw new Error(
      'O valor da entrega é inválido.'
    );
  }

  if (shippingGrossCents > 0) {
    const shippingCode =
      order.shipping_service_code ||
      'DELIVERY-INDEPENDENT';

    const shippingProfile =
      await getTaxProfile(
        env,
        shippingCode
      );

    if (
      shippingProfile.tax_treatment !==
      'direct'
    ) {
      throw new Error(
        'O serviço de entrega não tem tratamento fiscal direto.'
      );
    }

    const shippingTax =
      splitVatFromGross(
        shippingGrossCents,
        Number(
          shippingProfile.vat_rate_bps
        )
      );

    const shippingLine = {
      type: 'shipping',

      productCode:
        shippingCode,

      productName:
        order.shipping_service_name ||
        'Serviço autónomo de entrega',

      carrier:
        order.shipping_carrier || null,

      vatCategory:
        shippingProfile.vat_category,

      quantity: 1,

      unitGrossCents:
        shippingGrossCents,

      discountBps: 0,

      grossBeforeDiscountCents:
        shippingGrossCents,

      discountGrossCents: 0,

      lineNetCents:
        shippingTax.netCents,

      lineVatCents:
        shippingTax.vatCents,

      lineGrossCents:
        shippingTax.grossCents,

      vatRateBps:
        shippingTax.vatRateBps
    };

    frozenLines.push(shippingLine);

    updateStatements.push(
      env.DB.prepare(`
        UPDATE orders
        SET
          shipping_service_code = ?,
          shipping_net_cents = ?,
          shipping_vat_cents = ?,
          shipping_gross_cents = ?,
          shipping_vat_rate_bps = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        shippingLine.productCode,
        shippingLine.lineNetCents,
        shippingLine.lineVatCents,
        shippingLine.lineGrossCents,
        shippingLine.vatRateBps,
        orderId
      )
    );
  }

  const totals =
    calculateFiscalTotals(
      frozenLines
    );

  if (
    totals.grossTotalCents < 1
  ) {
    throw new Error(
      'O total fiscal da encomenda é inválido.'
    );
  }

  /*
   * A fotografia fiscal e o total da encomenda são
   * atualizados no mesmo batch.
   */

  updateStatements.push(
    env.DB.prepare(`
      UPDATE orders
      SET
        total_cents = ?,
        receipt_status = CASE
          WHEN receipt_status = 'not_required'
          THEN 'pending'
          ELSE receipt_status
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      totals.grossTotalCents,
      orderId
    )
  );

  await env.DB.batch(
    updateStatements
  );

  return {
    orderId: Number(orderId),
    lines: frozenLines,

    netTotalCents:
      totals.netTotalCents,

    vatTotalCents:
      totals.vatTotalCents,

    grossTotalCents:
      totals.grossTotalCents,

    vatBreakdown:
      totals.vatBreakdown
  };
}
/* =========================================================
   CARREGAR FOTOGRAFIA FISCAL
   ========================================================= */

async function loadFrozenFiscalSnapshot(
  env,
  orderId
) {
  const items = await getOrderFiscalItems(
    env,
    orderId
  );

  if (!items.length) {
    throw new Error(
      'A encomenda não contém linhas.'
    );
  }

  const lines = items.map(item => {
    if (
      !item.product_code ||
      !item.product_name_snapshot ||
      item.vat_rate_bps === null ||
      item.line_net_cents === null ||
      item.line_vat_cents === null ||
      item.line_gross_cents === null
    ) {
      throw new Error(
        'A fotografia fiscal da encomenda está incompleta.'
      );
    }

    return {
      type: 'product',

      productCode:
        item.product_code,

      productName:
        item.product_name_snapshot,

      vatCategory:
        item.vat_category_snapshot,

      quantity:
        Number(item.packs),

      unitsPerPack:
        Number(item.units_per_pack),

      quantityEggs:
        Number(item.quantity_eggs || 0),

      unitGrossCents:
        Number(item.unit_gross_cents),

      discountBps:
        Number(item.discount_bps || 0),

      lineNetCents:
        Number(item.line_net_cents),

      lineVatCents:
        Number(item.line_vat_cents),

      lineGrossCents:
        Number(item.line_gross_cents),

      vatRateBps:
        Number(item.vat_rate_bps)
    };
  });

  const shipping = await getOrderShipping(
    env,
    orderId
  );

  if (
    Number(
      shipping.shipping_gross_cents || 0
    ) > 0
  ) {
    if (
      shipping.shipping_net_cents === null ||
      shipping.shipping_vat_cents === null ||
      shipping.shipping_vat_rate_bps === null
    ) {
      throw new Error(
        'A fotografia fiscal da entrega está incompleta.'
      );
    }

    lines.push({
      type: 'shipping',

      productCode:
        shipping.shipping_service_code ||
        'DELIVERY-INDEPENDENT',

      productName:
        shipping.shipping_service_name ||
        'Serviço autónomo de entrega',

      carrier:
        shipping.shipping_carrier || null,

      vatCategory:
        'independent_transport',

      quantity: 1,

      unitGrossCents:
        Number(
          shipping.shipping_gross_cents
        ),

      discountBps: 0,

      lineNetCents:
        Number(
          shipping.shipping_net_cents
        ),

      lineVatCents:
        Number(
          shipping.shipping_vat_cents
        ),

      lineGrossCents:
        Number(
          shipping.shipping_gross_cents
        ),

      vatRateBps:
        Number(
          shipping.shipping_vat_rate_bps
        )
    });
  }

  const totals =
    calculateFiscalTotals(lines);

  return {
    lines,
    ...totals
  };
}


/* =========================================================
   UTILITÁRIOS VISUAIS DO PDF
   ========================================================= */

function pdfColor(hex) {
  const clean = String(hex)
    .replace('#', '');

  const value = Number.parseInt(
    clean,
    16
  );

  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  );
}

function pdfMoney(cents) {
  return `${(
    Number(cents || 0) / 100
  ).toFixed(2).replace('.', ',')} EUR`;
}

function pdfDate(value) {
  if (!value) {
    return 'A definir';
  }

  const date = new Date(
    String(value).includes('T')
      ? value
      : `${value.replace(' ', 'T')}Z`
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return safePdfText(value);
  }

  return new Intl.DateTimeFormat(
    'pt-PT',
    {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Lisbon'
    }
  ).format(date);
}

function truncatePdfText(
  value,
  maximumLength = 52
) {
  const text = safePdfText(value);

  if (
    text.length <= maximumLength
  ) {
    return text;
  }

  return `${text.slice(
    0,
    maximumLength - 3
  )}...`;
}

function drawPdfText(
  page,
  text,
  options = {}
) {
  page.drawText(
    safePdfText(text),
    {
      x: options.x || 0,
      y: options.y || 0,
      size: options.size || 10,
      font: options.font,
      color:
        options.color ||
        pdfColor('#343434'),
      maxWidth:
        options.maxWidth
    }
  );
}

function drawPdfRightText(
  page,
  text,
  options = {}
) {
  const font = options.font;
  const size = options.size || 10;
  const value = safePdfText(text);

  const width =
    font.widthOfTextAtSize(
      value,
      size
    );

  drawPdfText(
    page,
    value,
    {
      ...options,
      x:
        Number(options.right || 0) -
        width
    }
  );
}
/* =========================================================
   GERAR PDF DO RECIBO
   ========================================================= */

async function generateReceiptPdf({
  env,
  order,
  fiscalSnapshot,
  receiptNumber,
  paymentDetails = null,
  preview = false
}) {
  const pdfDocument = await PDFDocument.create();
  /*
   * O emblema é carregado através do binding ASSETS,
   * a partir da pasta public.
   *
   * Confirma que este caminho corresponde ao nome real
   * do ficheiro existente no repositório.
   */
  let logoImage;

  try {
    /*
     * O hostname é apenas uma base sintética.
     * O binding ASSETS utiliza o caminho pedido:
     * /logo-dos-lilinhos.png
     */
    const logoRequest = new Request(
      'https://assets.local/logo-dos-lilinhos.png',
      {
        method: 'GET',
        headers: {
          Accept: 'image/png,image/jpeg'
        }
      }
    );

    const logoResponse =
      await env.ASSETS.fetch(logoRequest);

    if (!logoResponse.ok) {
      throw new Error(
        `Ficheiro public/logo-dos-lilinhos.png não encontrado. HTTP ${logoResponse.status}.`
      );
    }

    const logoBytes = new Uint8Array(
      await logoResponse.arrayBuffer()
    );

    if (logoBytes.length < 8) {
      throw new Error(
        `O ficheiro do símbolo está vazio ou incompleto: ${logoBytes.length} bytes.`
      );
    }

    const isPng =
      logoBytes[0] === 137 &&
      logoBytes[1] === 80 &&
      logoBytes[2] === 78 &&
      logoBytes[3] === 71 &&
      logoBytes[4] === 13 &&
      logoBytes[5] === 10 &&
      logoBytes[6] === 26 &&
      logoBytes[7] === 10;

    const isJpeg =
      logoBytes[0] === 255 &&
      logoBytes[1] === 216 &&
      logoBytes[2] === 255;

    if (isPng) {
      logoImage =
        await pdfDocument.embedPng(
          logoBytes
        );
    } else if (isJpeg) {
      logoImage =
        await pdfDocument.embedJpg(
          logoBytes
        );
    } else {
      const contentType =
        logoResponse.headers.get(
          'content-type'
        ) || 'desconhecido';

      throw new Error(
        `O recurso não contém uma imagem PNG ou JPEG válida. Content-Type: ${contentType}.`
      );
    }
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      'Erro ao incorporar o símbolo no recibo:',
      reason
    );

    throw new Error(
      `Não foi possível incorporar o símbolo Dos Lilinhos no PDF: ${reason}`
    );
  }

  pdfDocument.setTitle(
    `Recibo ${receiptNumber}`
  );

  pdfDocument.setAuthor(
    'Dos Lilinhos'
  );

  pdfDocument.setSubject(
    preview
      ? 'Pré-visualização de recibo'
      : 'Comprovativo de pagamento'
  );

  const regular = await pdfDocument.embedFont(
    StandardFonts.Helvetica
  );

  const bold = await pdfDocument.embedFont(
    StandardFonts.HelveticaBold
  );

  const page = pdfDocument.addPage([
    595.28,
    841.89
  ]);

  const pageWidth = page.getWidth();
  const margin = 46;

  const green = pdfColor('#315F37');
  const coral = pdfColor('#ED4D5A');
  const soft = pdfColor('#F6F6F4');
  const lineColor = pdfColor('#DCE2DA');
  const text = pdfColor('#343434');
  const muted = pdfColor('#68736B');
  const white = pdfColor('#FFFFFF');

  let y = 790;

  const logoDimensions =
    logoImage.scaleToFit(
      205,
      92
    );

  page.drawImage(
    logoImage,
    {
      x: margin,
      y:
        y -
        logoDimensions.height +
        24,

      width:
        logoDimensions.width,

      height:
        logoDimensions.height
    }
  );
  drawPdfRightText(
    page,
    preview
      ? 'MAQUETE DE RECIBO'
      : 'RECIBO',
    {
      right: pageWidth - margin,
      y,
      size: 16,
      font: bold,
      color: green
    }
  );

  y -= 72;

  drawPdfText(
    page,
    'Produção familiar, sazonal e transparente',
    {
      x: margin,
      y,
      size: 10.5,
      font: bold,
      color: green
    }
  );

  page.drawRectangle({
    x: margin,
    y: y - 17,
    width: pageWidth - margin * 2,
    height: 4,
    color: green
  });

  y -= 50;

  page.drawRectangle({
    x: margin,
    y: y - 42,
    width: 5,
    height: 48,
    color: coral
  });

  drawPdfText(
    page,
    preview
      ? 'PRÉ-VISUALIZAÇÃO TÉCNICA'
      : 'DOCUMENTO NÃO FISCAL',
    {
      x: margin + 15,
      y: y - 9,
      size: 9,
      font: bold,
      color: text
    }
  );

  drawPdfText(
    page,
    preview
      ? 'Documento criado apenas para validar o desenho e os cálculos.'
      : 'Comprovativo de pagamento. A fatura fiscal será emitida separadamente.',
    {
      x: margin + 15,
      y: y - 27,
      size: 8,
      font: regular,
      color: muted
    }
  );

  y -= 72;

  drawPdfText(
    page,
    `Documento: ${receiptNumber}`,
    {
      x: margin,
      y,
      size: 10,
      font: bold,
      color: text
    }
  );

  drawPdfText(
    page,
    `Encomenda: ${order.order_number}`,
    {
      x: margin,
      y: y - 18,
      size: 9,
      font: regular,
      color: text
    }
  );

  drawPdfText(
    page,
    `Data: ${pdfDate(
      order.paid_at ||
      order.created_at ||
      new Date().toISOString()
    )}`,
    {
      x: margin,
      y: y - 35,
      size: 9,
      font: regular,
      color: text
    }
  );

  drawPdfRightText(
    page,
    preview
      ? 'Estado: pré-visualização'
      : 'Estado: pagamento confirmado',
    {
      right: pageWidth - margin,
      y: y - 18,
      size: 9,
      font: bold,
      color: green
    }
  );

  y -= 70;

  drawPdfText(
    page,
    'DADOS DO CLIENTE',
    {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: green
    }
  );

  y -= 15;

  page.drawRectangle({
    x: margin,
    y: y - 43,
    width: pageWidth - margin * 2,
    height: 48,
    color: soft,
    borderColor: lineColor,
    borderWidth: 1
  });

  drawPdfText(
    page,
    order.name || 'Cliente',
    {
      x: margin + 12,
      y: y - 13,
      size: 10,
      font: bold,
      color: text
    }
  );

  drawPdfText(
    page,
    order.email || '',
    {
      x: margin + 12,
      y: y - 29,
      size: 8,
      font: regular,
      color: muted
    }
  );

  y -= 72;

  drawPdfText(
    page,
    'PRODUTOS E SERVIÇOS',
    {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: green
    }
  );

  y -= 16;

  page.drawRectangle({
    x: margin,
    y: y - 23,
    width: pageWidth - margin * 2,
    height: 25,
    color: green
  });

  drawPdfText(
    page,
    'Produto',
    {
      x: margin + 10,
      y: y - 14,
      size: 7.5,
      font: bold,
      color: white
    }
  );

  drawPdfText(
    page,
    'Qtd.',
    {
      x: 345,
      y: y - 14,
      size: 7.5,
      font: bold,
      color: white
    }
  );

  drawPdfText(
    page,
    'IVA',
    {
      x: 395,
      y: y - 14,
      size: 7.5,
      font: bold,
      color: white
    }
  );

  drawPdfRightText(
    page,
    'Total',
    {
      right: pageWidth - margin - 10,
      y: y - 14,
      size: 7.5,
      font: bold,
      color: white
    }
  );

  y -= 28;

  for (const line of fiscalSnapshot.lines) {
    page.drawLine({
      start: {
        x: margin,
        y: y - 23
      },
      end: {
        x: pageWidth - margin,
        y: y - 23
      },
      thickness: 0.5,
      color: lineColor
    });

    drawPdfText(
      page,
      truncatePdfText(
        line.productName,
        48
      ),
      {
        x: margin + 10,
        y: y - 12,
        size: 8.5,
        font: bold,
        color: text
      }
    );

    drawPdfText(
      page,
      String(line.quantity),
      {
        x: 350,
        y: y - 12,
        size: 8.5,
        font: regular,
        color: text
      }
    );

    drawPdfText(
      page,
      vatRateLabel(line.vatRateBps),
      {
        x: 392,
        y: y - 12,
        size: 8.5,
        font: regular,
        color: text
      }
    );

    drawPdfRightText(
      page,
      pdfMoney(line.lineGrossCents),
      {
        right: pageWidth - margin - 10,
        y: y - 12,
        size: 8.5,
        font: bold,
        color: text
      }
    );

    y -= 30;
  }

  y -= 15;

  const totalsX = 325;
  const totalsRight = pageWidth - margin;

  drawPdfText(
    page,
    'Subtotal sem IVA',
    {
      x: totalsX,
      y,
      size: 8.5,
      font: regular,
      color: muted
    }
  );

  drawPdfRightText(
    page,
    pdfMoney(
      fiscalSnapshot.netTotalCents
    ),
    {
      right: totalsRight,
      y,
      size: 8.5,
      font: bold,
      color: text
    }
  );

  y -= 17;

  for (
    const item of fiscalSnapshot.vatBreakdown
  ) {
    drawPdfText(
      page,
      `IVA a ${vatRateLabel(
        item.vatRateBps
      )}`,
      {
        x: totalsX,
        y,
        size: 8.5,
        font: regular,
        color: muted
      }
    );

    drawPdfRightText(
      page,
      pdfMoney(item.vatCents),
      {
        right: totalsRight,
        y,
        size: 8.5,
        font: bold,
        color: text
      }
    );

    y -= 17;
  }

  page.drawRectangle({
    x: totalsX - 10,
    y: y - 28,
    width: totalsRight - totalsX + 10,
    height: 35,
    color: green
  });

  drawPdfText(
    page,
    'TOTAL',
    {
      x: totalsX,
      y: y - 16,
      size: 9,
      font: bold,
      color: white
    }
  );

  drawPdfRightText(
    page,
    pdfMoney(
      fiscalSnapshot.grossTotalCents
    ),
    {
      right: totalsRight - 10,
      y: y - 18,
      size: 13,
      font: bold,
      color: white
    }
  );
    /*
   * SECÇÃO DO PAGAMENTO
   */

  y -= 55;

  drawPdfText(
    page,
    'PAGAMENTO',
    {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: green
    }
  );

  y -= 15;

  page.drawRectangle({
    x: margin,
    y: y - 62,
    width: pageWidth - margin * 2,
    height: 67,
    color: soft,
    borderColor: lineColor,
    borderWidth: 1
  });

  const paymentMethod =
    preview
      ? 'Simulação técnica, sem pagamento'
      : (
          paymentDetails?.methodLabel ||
          order.payment_method ||
          'Pagamento online'
        );

  const paymentProvider =
    preview
      ? 'Não aplicável'
      : (
          paymentDetails?.provider ||
          order.payment_provider ||
          'Stripe'
        );

  const paymentDate =
    preview
      ? 'Sem pagamento real'
      : pdfDate(
          paymentDetails?.paidAt ||
          order.paid_at
        );

  const paymentReference =
    preview
      ? 'Sem referência de pagamento'
      : abbreviatedPaymentReference(
          paymentDetails?.reference ||
          order.payment_reference ||
          ''
        );

  drawPdfText(
    page,
    'FORMA DE PAGAMENTO',
    {
      x: margin + 12,
      y: y - 13,
      size: 6.8,
      font: bold,
      color: green
    }
  );

  drawPdfText(
    page,
    paymentMethod,
    {
      x: margin + 12,
      y: y - 27,
      size: 9,
      font: bold,
      color: text
    }
  );

  drawPdfText(
    page,
    'DATA E HORA DO PAGAMENTO',
    {
      x: 310,
      y: y - 13,
      size: 6.8,
      font: bold,
      color: green
    }
  );

  drawPdfText(
    page,
    paymentDate,
    {
      x: 310,
      y: y - 27,
      size: 9,
      font: bold,
      color: text
    }
  );

  drawPdfText(
    page,
    `Prestador: ${paymentProvider}`,
    {
      x: margin + 12,
      y: y - 48,
      size: 7.7,
      font: regular,
      color: muted
    }
  );

  drawPdfText(
    page,
    `Referência: ${paymentReference}`,
    {
      x: 310,
      y: y - 48,
      size: 7.7,
      font: regular,
      color: muted
    }
  );
  const footerY = 48;

  page.drawLine({
    start: {
      x: margin,
      y: footerY + 23
    },
    end: {
      x: pageWidth - margin,
      y: footerY + 23
    },
    thickness: 2,
    color: green
  });

  drawPdfText(
    page,
    'Dos Lilinhos',
    {
      x: margin,
      y: footerY + 7,
      size: 8,
      font: bold,
      color: green
    }
  );

  drawPdfText(
    page,
    'encomendas@doslilinhos.pt | +351 964 086 053 | doslilinhos.pt',
    {
      x: margin,
      y: footerY - 7,
      size: 7,
      font: regular,
      color: muted
    }
  );

  return pdfDocument.save();
}
/* =========================================================
   NUMERAÇÃO E REGISTO DOS RECIBOS
   ========================================================= */

async function nextReceiptNumber(
  env,
  paidAt = new Date()
) {
  const date =
    paidAt instanceof Date
      ? paidAt
      : new Date(paidAt);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      'Data do pagamento inválida.'
    );
  }

  const year = date.getUTCFullYear();

  const sequence = await env.DB.prepare(`
    INSERT INTO receipt_sequences (
      receipt_year,
      last_number,
      updated_at
    )
    VALUES (
      ?,
      1,
      CURRENT_TIMESTAMP
    )

    ON CONFLICT(receipt_year)
    DO UPDATE SET
      last_number =
        receipt_sequences.last_number + 1,
      updated_at =
        CURRENT_TIMESTAMP

    RETURNING last_number
  `)
    .bind(year)
    .first();

  const number = Number(
    sequence?.last_number
  );

  if (
    !Number.isInteger(number) ||
    number < 1
  ) {
    throw new Error(
      'Não foi possível atribuir o número do recibo.'
    );
  }

  return formatReceiptNumber(
    year,
    number
  );
}

async function getExistingReceipt(
  env,
  orderId
) {
  return env.DB.prepare(`
    SELECT *
    FROM payment_receipts
    WHERE order_id = ?
    LIMIT 1
  `)
    .bind(orderId)
    .first();
}

async function createPaymentReceipt({
  env,
  order,
  fiscalSnapshot,
  paymentReference,
  paymentMethod = 'online',
  paymentBrand = null,
  paymentLast4 = null,
  paidAt = new Date()
}) {
  /*
   * Idempotência:
   * se o webhook for repetido, reutiliza o recibo existente.
   */
  const existingReceipt =
    await getExistingReceipt(
      env,
      order.id
    );

  if (existingReceipt) {
    return existingReceipt;
  }

  const paymentReferenceText =
    String(paymentReference || '').trim();

  if (!paymentReferenceText) {
    throw new Error(
      'A referência do pagamento é obrigatória.'
    );
  }

  const paidDate =
    paidAt instanceof Date
      ? paidAt
      : new Date(paidAt);

  if (Number.isNaN(paidDate.getTime())) {
    throw new Error(
      'Data do pagamento inválida.'
    );
  }

  const receiptNumber =
    await nextReceiptNumber(
      env,
      paidDate
    );

  const customerSnapshot = {
    id: Number(order.customer_id),
    name: String(order.name || ''),
    email: String(order.email || '')
  };

  const orderSnapshot = {
    id: Number(order.id),
    orderNumber:
      String(order.order_number),

    lines:
      fiscalSnapshot.lines,

    netTotalCents:
      fiscalSnapshot.netTotalCents,

    vatTotalCents:
      fiscalSnapshot.vatTotalCents,

    grossTotalCents:
      fiscalSnapshot.grossTotalCents,

    vatBreakdown:
      fiscalSnapshot.vatBreakdown,

    shipping: {
      serviceCode:
        order.shipping_service_code ||
        null,

      carrier:
        order.shipping_carrier ||
        null,

      serviceName:
        order.shipping_service_name ||
        null,

      netCents:
        Number(
          order.shipping_net_cents ||
          0
        ),

      vatCents:
        Number(
          order.shipping_vat_cents ||
          0
        ),

      grossCents:
        Number(
          order.shipping_gross_cents ||
          0
        ),

      vatRateBps:
        order.shipping_vat_rate_bps === null
          ? null
          : Number(
              order.shipping_vat_rate_bps
            )
    }
  };

  const result = await env.DB.prepare(`
    INSERT INTO payment_receipts (
      order_id,
      customer_id,
      receipt_number,
      payment_reference,
      payment_method,
      payment_brand,
      payment_last4,
      paid_at,
      net_total_cents,
      vat_total_cents,
      gross_total_cents,
      vat_breakdown_json,
      customer_snapshot_json,
      order_snapshot_json,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  `)
    .bind(
      order.id,
      order.customer_id,
      receiptNumber,
      paymentReferenceText,
      paymentMethod,
      paymentBrand,
      paymentLast4,
      paidDate.toISOString(),
      fiscalSnapshot.netTotalCents,
      fiscalSnapshot.vatTotalCents,
      fiscalSnapshot.grossTotalCents,
      JSON.stringify(
        fiscalSnapshot.vatBreakdown
      ),
      JSON.stringify(
        customerSnapshot
      ),
      JSON.stringify(
        orderSnapshot
      )
    )
    .run();

  const receiptId = Number(
    result.meta.last_row_id
  );

  await env.DB.prepare(`
    UPDATE orders
    SET
      receipt_id = ?,
      receipt_status = 'issued',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)
    .bind(
      receiptId,
      order.id
    )
    .run();

  const receipt =
    await env.DB.prepare(`
      SELECT *
      FROM payment_receipts
      WHERE id = ?
    `)
      .bind(receiptId)
      .first();

  if (!receipt) {
    throw new Error(
      'O recibo foi criado, mas não pôde ser recuperado.'
    );
  }

  return receipt;
}

function receiptPaymentLabel(
  receipt
) {
  const method = String(
    receipt.payment_method || ''
  ).toLowerCase();

  const brand = String(
    receipt.payment_brand || ''
  ).trim();

  const last4 = String(
    receipt.payment_last4 || ''
  ).trim();

  if (
    method === 'card' &&
    brand &&
    last4
  ) {
    const brandLabels = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express'
    };

    const brandLabel =
      brandLabels[
        brand.toLowerCase()
      ] || brand;

    return `${brandLabel} •••• ${last4}`;
  }

  if (
    method === 'mb_way' ||
    method === 'mbway'
  ) {
    return 'MB WAY';
  }

  if (method === 'multibanco') {
    return 'Multibanco';
  }

  if (method === 'card') {
    return 'Cartão';
  }

  return 'Pagamento online';
}

const flowUrls=(e,id)=>({url:`${e.SITE_URL}/encomendas.html#pedido-${id}`,productsUrl:`${e.SITE_URL}/produtos.html`,adminUrl:`${e.SITE_URL}/admin.html`});
/* =========================================================
   DADOS DO PAGAMENTO STRIPE
   ========================================================= */

async function getStripePaymentDetails(
  env,
  checkoutSession
) {
  const details = {
    method: 'online',
    brand: null,
    last4: null,
    methodLabel: 'Pagamento online',
    provider: 'Stripe',
    reference:
      checkoutSession.payment_intent ||
      checkoutSession.id ||
      null
  };

  const paymentIntentId =
    checkoutSession.payment_intent;

  if (!paymentIntentId) {
    return details;
  }

  try {
    const paymentIntent =
      await stripeGet(
        env,
        `payment_intents/${encodeURIComponent(
          paymentIntentId
        )}?expand[]=payment_method`
      );

    let paymentMethod =
      paymentIntent.payment_method;

    /*
     * Se a Stripe devolver apenas o identificador,
     * consulta o PaymentMethod separadamente.
     */
    if (
      typeof paymentMethod === 'string' &&
      paymentMethod
    ) {
      paymentMethod =
        await stripeGet(
          env,
          `payment_methods/${encodeURIComponent(
            paymentMethod
          )}`
        );
    }

    if (
      !paymentMethod ||
      typeof paymentMethod !== 'object'
    ) {
      return details;
    }

    const methodType =
      String(
        paymentMethod.type || 'online'
      ).toLowerCase();

    details.method = methodType;

    if (
      methodType === 'card' &&
      paymentMethod.card
    ) {
      details.brand =
        paymentMethod.card.brand || null;

      details.last4 =
        paymentMethod.card.last4 || null;

      const brandLabels = {
        visa: 'Visa',
        mastercard: 'Mastercard',
        amex: 'American Express',
        discover: 'Discover',
        diners: 'Diners Club',
        jcb: 'JCB',
        unionpay: 'UnionPay'
      };

      const brandLabel =
        brandLabels[
          String(
            details.brand || ''
          ).toLowerCase()
        ] ||
        details.brand ||
        'Cartão';

      details.methodLabel =
        details.last4
          ? `${brandLabel} •••• ${details.last4}`
          : brandLabel;
    } else if (
      methodType === 'mb_way' ||
      methodType === 'mbway'
    ) {
      details.method = 'mb_way';
      details.methodLabel = 'MB WAY';
    } else if (
      methodType === 'multibanco'
    ) {
      details.methodLabel = 'Multibanco';
    } else if (
      methodType === 'sepa_debit'
    ) {
      details.methodLabel =
        'Débito direto SEPA';
    } else {
      details.methodLabel =
        paymentMethod.type
          ? String(paymentMethod.type)
          : 'Pagamento online';
    }

    return details;
  } catch (error) {
    /*
     * A confirmação do pagamento não deve falhar
     * apenas por não conseguirmos identificar
     * a marca ou os últimos quatro dígitos.
     */
    console.error(
      'Não foi possível obter os detalhes do pagamento Stripe:',
      error
    );

    return details;
  }
}

function parseReceiptSnapshot(
  receipt
) {
  if (!receipt) {
    throw new Error(
      'Recibo não encontrado.'
    );
  }

  try {
    return {
      customerSnapshot:
        JSON.parse(
          receipt.customer_snapshot_json ||
          '{}'
        ),

      orderSnapshot:
        JSON.parse(
          receipt.order_snapshot_json ||
          '{}'
        ),

      vatBreakdown:
        JSON.parse(
          receipt.vat_breakdown_json ||
          '[]'
        )
    };
  } catch (error) {
    throw new Error(
      'Os dados guardados do recibo são inválidos.'
    );
  }
}

function receiptToFiscalSnapshot(
  receipt
) {
  const snapshots =
    parseReceiptSnapshot(receipt);

  const orderSnapshot =
    snapshots.orderSnapshot;

  return {
    lines:
      Array.isArray(
        orderSnapshot.lines
      )
        ? orderSnapshot.lines
        : [],

    netTotalCents:
      Number(
        receipt.net_total_cents
      ),

    vatTotalCents:
      Number(
        receipt.vat_total_cents
      ),

    grossTotalCents:
      Number(
        receipt.gross_total_cents
      ),

    vatBreakdown:
      Array.isArray(
        snapshots.vatBreakdown
      )
        ? snapshots.vatBreakdown
        : []
  };
}
async function route(r,e){const u=new URL(r.url),p=u.pathname,m=r.method;
if(p==='/api/payments/webhook'&&m==='POST'){const raw=await r.text();if(!await verifyStripe(raw,r.headers.get('stripe-signature'),e.STRIPE_WEBHOOK_SECRET))return out({error:'Assinatura inválida.'},400);const event=JSON.parse(raw);if(await e.DB.prepare('SELECT id FROM payment_events WHERE provider_event_id=?').bind(event.id).first())return out({received:true});await e.DB.prepare('INSERT INTO payment_events(provider_event_id,event_type,payload) VALUES(?,?,?)').bind(event.id,event.type,raw).run();const session=event.data?.object,orderId=Number(session?.metadata?.order_id||session?.client_reference_id||0);if (
  orderId &&
  [
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded'
  ].includes(event.type) &&
  session.payment_status === 'paid'
) {
  const order =
    await orderDetails(
      e,
      orderId
    );

  if (order) {
    /*
     * O webhook da Stripe pode ser repetido.
     * A atualização do pagamento e a criação do recibo
     * têm de ser idempotentes.
     */

    if (order.payment_status !== 'paid') {
      await e.DB.batch([
        e.DB.prepare(`
          UPDATE orders
          SET
            payment_status = 'paid',
            approval_status = 'paid',
            invoice_status = 'pending',
            receipt_status = 'pending',
            paid_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(orderId),

        e.DB.prepare(`
          UPDATE payments
          SET
            status = 'paid',
            provider_payment_intent = ?,
            paid_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE provider_session_id = ?
        `).bind(
          session.payment_intent || null,
          session.id
        ),

        e.DB.prepare(`
          INSERT INTO workflow_events (
            entity_type,
            entity_id,
            event_type,
            from_status,
            to_status,
            note,
            actor
          )
          VALUES (
            'order',
            ?,
            'payment_received',
            ?,
            'paid',
            ?,
            'stripe'
          )
        `).bind(
          orderId,
          order.payment_status || 'pending',
          session.payment_intent || session.id
        )
      ]);
    }

    /*
     * Recuperar novamente a encomenda para obter
     * paid_at e o estado atualizado.
     */
    const paidOrder =
      await orderDetails(
        e,
        orderId
      );

    if (!paidOrder) {
      throw new Error(
        'A encomenda paga não pôde ser recuperada.'
      );
    }

    /*
     * A fotografia fiscal já foi congelada
     * antes de criar a sessão Stripe.
     */
    const fiscalSnapshot =
      await loadFrozenFiscalSnapshot(
        e,
        orderId
      );

    const paidAmount = Number(
      session.amount_total ||
      paidOrder.total_cents ||
      0
    );

    if (
      paidAmount !==
      fiscalSnapshot.grossTotalCents
    ) {
      await audit(
        e.DB,
        {
          entityType: 'payment',
          entityId: orderId,
          reference:
            paidOrder.order_number,
          action:
            'payment_fiscal_mismatch',
          fromStatus:
            paidOrder.payment_status,
          toStatus:
            'manual_review',
          actor: 'stripe',
          result: 'failed',
          amountCents:
            paidAmount,
          providerReference:
            session.payment_intent ||
            session.id,
          webhookEventId:
            event.id,
          details: {
            stripeAmountCents:
              paidAmount,
            fiscalAmountCents:
              fiscalSnapshot.grossTotalCents
          }
        }
      );

      throw new Error(
        'O valor pago não coincide com a fotografia fiscal da encomenda.'
      );
    }

    /*
     * Obter o método de pagamento.
     * Se a consulta complementar à Stripe falhar,
     * usa "Pagamento online" sem impedir o recibo.
     */
    const paymentDetails =
      await getStripePaymentDetails(
        e,
        session
      );

    const paymentReference =
      session.payment_intent ||
      session.id;

    const paidAt =
      paidOrder.paid_at
        ? new Date(
            String(
              paidOrder.paid_at
            ).includes('T')
              ? paidOrder.paid_at
              : `${paidOrder.paid_at.replace(
                  ' ',
                  'T'
                )}Z`
          )
        : new Date();

    /*
     * createPaymentReceipt() verifica primeiro
     * se já existe um recibo para esta encomenda.
     * Um webhook repetido não cria outro número.
     */
    const receipt =
      await createPaymentReceipt({
        env: e,
        order: paidOrder,
        fiscalSnapshot,
        paymentReference,
        paymentMethod:
          paymentDetails.method,
        paymentBrand:
          paymentDetails.brand,
        paymentLast4:
          paymentDetails.last4,
        paidAt
      });

    await audit(
      e.DB,
      {
        entityType: 'payment_receipt',
        entityId: receipt.id,
        reference:
          receipt.receipt_number,
        action:
          'payment_receipt_created',
        fromStatus:
          'pending',
        toStatus:
          'issued',
        actor: 'stripe',
        amountCents:
          receipt.gross_total_cents,
        providerReference:
          paymentReference,
        webhookEventId:
          event.id,
        details: {
          orderId,
          orderNumber:
            paidOrder.order_number,
          paymentMethod:
            receipt.payment_method,
          paymentBrand:
            receipt.payment_brand,
          paymentLast4:
            receipt.payment_last4,
          netTotalCents:
            receipt.net_total_cents,
          vatTotalCents:
            receipt.vat_total_cents,
          grossTotalCents:
            receipt.gross_total_cents
        }
      }
    );

    const emailData = {
      ...paidOrder,
      ...flowUrls(
        e,
        orderId
      ),

      totalCents:
        receipt.gross_total_cents,

      netTotalCents:
        receipt.net_total_cents,

      vatTotalCents:
        receipt.vat_total_cents,

      receiptNumber:
        receipt.receipt_number,

      receiptUrl:
        `${e.SITE_URL}/api/my/orders/${orderId}/receipt.pdf`,

      paymentMethod:
        receiptPaymentLabel(
          receipt
        ),

      paidAt:
        receipt.paid_at
    };

    /*
     * Enviar os emails apenas na primeira passagem.
     * Um webhook repetido pode reutilizar o recibo,
     * mas não deve repetir todos os emails.
     */
    if (
      order.payment_status !== 'paid'
    ) {
      await Promise.allSettled([
        sendEmail(
          e,
          e.DB,
          {
            type: 'payment_received',
            to: paidOrder.email,
            data: emailData,
            customerId:
              paidOrder.customer_id,
            orderId
          }
        ),

        sendEmail(
          e,
          e.DB,
          {
            type: 'payment_received',
            to: e.ADMIN_EMAIL,
            data: {
              ...emailData,
              name: 'Administração'
            },
            customerId:
              paidOrder.customer_id,
            orderId
          }
        )
      ]);
    }

    await audit(
      e.DB,
      {
        entityType: 'payment',
        entityId: orderId,
        reference:
          paidOrder.order_number,
        action:
          'payment_received',
        fromStatus:
          order.payment_status ||
          'pending',
        toStatus:
          'paid',
        actor: 'stripe',
        amountCents:
          receipt.gross_total_cents,
        providerReference:
          paymentReference,
        webhookEventId:
          event.id,
        details: {
          receiptId:
            receipt.id,
          receiptNumber:
            receipt.receipt_number
        }
      }
    );
  }
}
else if(orderId&&event.type==='checkout.session.expired'){const o=await orderDetails(e,orderId);if(o&&o.payment_status==='pending'){await e.DB.batch([e.DB.prepare(`UPDATE orders SET payment_status='expired',approval_status='payment_expired',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId),e.DB.prepare(`UPDATE payments SET status='expired',updated_at=CURRENT_TIMESTAMP WHERE provider_session_id=?`).bind(session.id)]);await sendEmail(e,e.DB,{type:'payment_expired',to:o.email,data:{...o,...flowUrls(e,orderId)},customerId:o.customer_id,orderId})}}else if(orderId&&['refund.created','refund.updated','refund.failed'].includes(event.type)){const refund=session,status=event.type==='refund.failed'?'failed':refund.status==='succeeded'?'succeeded':'pending',o=await orderDetails(e,orderId);if(o){await e.DB.prepare(`UPDATE orders SET refund_status=?,payment_status=?,refund_reference=?,refunded_at=CASE WHEN ?='succeeded' THEN CURRENT_TIMESTAMP ELSE refunded_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,status==='succeeded'?'refunded':status==='failed'?'refund_failed':'refund_pending',refund.id,status,orderId).run();await audit(e.DB,{entityType:'refund',entityId:orderId,reference:o.order_number,action:`refund_${status}`,fromStatus:o.refund_status,toStatus:status,actor:'stripe',amountCents:refund.amount,providerReference:refund.id,webhookEventId:event.id,result:status==='failed'?'failed':'success'});await sendEmail(e,e.DB,{type:status==='succeeded'?'refund_completed':status==='failed'?'refund_failed':'issue_reported',to:o.email,customerId:o.customer_id,orderId,data:{...o,...flowUrls(e,orderId),refundAmount:refund.amount,stateLabel:status==='succeeded'?'Reembolsada':'Reembolso em processamento'}})}}return out({received:true})}
if(p==='/api/admin/audit'&&m==='GET'){if(!adminOK(r,e))return out({error:'Não autorizado.'},401);const entity=u.searchParams.get('entity')||'',result=u.searchParams.get('result')||'',where=[],bind=[];if(entity){where.push('entity_type=?');bind.push(entity)}if(result){where.push('result=?');bind.push(result)}const q=await e.DB.prepare(`SELECT * FROM audit_log ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 500`).bind(...bind).all();return out({events:q.results})}

if(p==='/api/admin/workflow'&&m==='GET'){if(!adminOK(r,e))return out({error:'Não autorizado.'},401);const a=await e.DB.prepare(`SELECT o.id,o.order_number,o.status,o.approval_status,o.total_cents,o.payment_status,o.payment_url,o.payment_expires_at,o.incident_status,o.refund_status,o.refund_amount_cents,o.refund_reference,o.invoice_status,o.invoice_document_id,o.credit_note_status,o.credit_note_document_id,o.created_at,c.name,c.email FROM orders o JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC`).all(),b=await e.DB.prepare(`SELECT s.*,c.name,c.email,p.name product FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN products p ON p.id=s.product_id ORDER BY s.created_at DESC`).all();return out({orders:a.results,subscriptions:b.results})}
let fiscal=p.match(/^\/api\/admin\/orders\/(\d+)\/(invoice|credit-note)$/);if(fiscal&&m==='POST'){if(!adminOK(r,e))return out({error:'Não autorizado.'},401);const id=+fiscal[1],kind=fiscal[2],b=await r.json(),o=await orderDetails(e,id);if(!o)return out({error:'Pedido não encontrado.'},404);const number=String(b.documentNumber||'').trim(),date=String(b.documentDate||'').trim(),total=Number(b.totalCents);if(!number||!date||!Number.isInteger(total)||total<0)return out({error:'Confirma número, data e total do documento.'},400);if(kind==='invoice'&&o.payment_status!=='paid')return out({error:'A fatura só pode ser registada após pagamento confirmado.'},409);if(kind==='invoice'&&o.invoice_status==='issued')return out({error:'A encomenda já tem documento fiscal registado.'},409);if(kind==='credit-note'&&o.invoice_status!=='issued')return out({error:'Não existe fatura registada para associar à nota de crédito.'},409);if(kind==='credit-note'&&!o.incident_status)return out({error:'Regista primeiro o problema ou devolução.'},409);const type=kind==='invoice'?(b.documentType==='invoice'?'invoice':'invoice_receipt'):'credit_note',original=kind==='credit-note'?o.invoice_document_id:null;const q=await e.DB.prepare(`INSERT INTO fiscal_documents(order_id,document_type,document_number,document_date,total_cents,original_document_id,document_url,notes) VALUES(?,?,?,?,?,?,?,?)`).bind(id,type,number,date,total,original,b.documentUrl||null,b.notes||null).run();if(kind==='invoice')await e.DB.prepare(`UPDATE orders SET invoice_status='issued',invoice_document_id=?,approval_status='invoiced',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(q.meta.last_row_id,id).run();else await e.DB.prepare(`UPDATE orders SET credit_note_status='issued',credit_note_document_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(q.meta.last_row_id,id).run();const action=kind==='invoice'?'invoice_registered':'credit_note_registered';await audit(e.DB,{entityType:'fiscal_document',entityId:id,reference:o.order_number,action,fromStatus:kind==='invoice'?o.invoice_status:o.credit_note_status,toStatus:'issued',actor:'admin',amountCents:total,reason:b.notes||null,providerReference:number,ipHash:await requestHash(r),details:{documentType:type,documentDate:date,originalDocumentId:original}});await sendEmail(e,e.DB,{type:action,to:o.email,customerId:o.customer_id,orderId:id,data:{...o,...flowUrls(e,id),documentTypeLabel:type==='invoice'?'Fatura':type==='invoice_receipt'?'Fatura-recibo':'Nota de crédito',documentNumber:number,documentDate:date,totalCents:total}});return out({success:true,documentId:q.meta.last_row_id,status:'issued'})}
if(p==='/api/admin/fiscal-documents'&&m==='GET'){if(!adminOK(r,e))return out({error:'Não autorizado.'},401);const q=await e.DB.prepare(`SELECT f.*,o.order_number,c.name,c.email FROM fiscal_documents f JOIN orders o ON o.id=f.order_id JOIN customers c ON c.id=o.customer_id ORDER BY f.created_at DESC LIMIT 500`).all();return out({documents:q.results})}
let incident=p.match(/^\/api\/admin\/orders\/(\d+)\/incident$/);if(incident&&m==='POST'){if(!adminOK(r,e))return out({error:'Não autorizado.'},401);const id=+incident[1],b=await r.json(),o=await orderDetails(e,id);if(!o)return out({error:'Pedido não encontrado.'},404);if(String(b.confirmation||'')!=='ANULAR')return out({error:'Escreve ANULAR para confirmar.'},400);if(o.incident_status)return out({error:'Já existe um incidente registado nesta encomenda.'},409);const reason=String(b.reason||'').trim();if(reason.length<5)return out({error:'Indica o motivo interno.'},400);const paid=o.payment_status==='paid',mode=paid?(b.refundMode||'full'):'none';let refund=null,refundAmount=0;await e.DB.prepare(`UPDATE orders SET incident_status='reported',incident_reason=?,incident_customer_note=?,incident_reported_at=CURRENT_TIMESTAMP,approval_status='issue_reported',status='cancelled',credit_note_status=CASE WHEN invoice_status='issued' THEN 'pending' ELSE credit_note_status END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(reason,b.customerNote||null,id).run();await audit(e.DB,{entityType:'order',entityId:id,reference:o.order_number,action:'issue_reported',fromStatus:o.approval_status||o.status,toStatus:'issue_reported',actor:'admin',reason,ipHash:await requestHash(r),details:{customerNote:b.customerNote||null,refundMode:mode}});if(paid&&mode!=='none'){const payment=await e.DB.prepare(`SELECT * FROM payments WHERE order_id=? AND status='paid' ORDER BY id DESC LIMIT 1`).bind(id).first();if(!payment)throw Error('Pagamento confirmado não encontrado.');let pi=payment.provider_payment_intent;if(!pi&&payment.provider_session_id){const session=await stripeGet(e,`checkout/sessions/${payment.provider_session_id}`);pi=session.payment_intent;await e.DB.prepare(`UPDATE payments SET provider_payment_intent=? WHERE id=?`).bind(pi,payment.id).run()}if(!pi)throw Error('Referência de pagamento Stripe não encontrada.');refundAmount=mode==='partial'?Number(b.amountCents):Number(payment.amount_cents);if(!Number.isInteger(refundAmount)||refundAmount<1||refundAmount>Number(payment.amount_cents))throw Error('Valor de reembolso inválido.');refund=await stripePost(e,'refunds',{'payment_intent':pi,'amount':String(refundAmount),'metadata[order_id]':String(id),'metadata[order_number]':o.order_number,'reason':'requested_by_customer'});await e.DB.prepare(`UPDATE orders SET refund_status='pending',refund_amount_cents=?,refund_reference=?,payment_status='refund_pending',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(refundAmount,refund.id,id).run();await audit(e.DB,{entityType:'refund',entityId:id,reference:o.order_number,action:'refund_requested',fromStatus:'paid',toStatus:'pending',actor:'admin',amountCents:refundAmount,reason,providerReference:refund.id,ipHash:await requestHash(r)})}const stateLabel=paid&&mode!=='none'?'Reembolso em processamento':'Pedido anulado';await sendEmail(e,e.DB,{type:'issue_reported',to:o.email,customerId:o.customer_id,orderId:id,data:{...o,...flowUrls(e,id),stateLabel}});await sendEmail(e,e.DB,{type:'issue_reported',to:e.ADMIN_EMAIL,customerId:o.customer_id,orderId:id,data:{...o,...flowUrls(e,id),name:'Administração',stateLabel:`${stateLabel} · ${reason}`}});return out({success:true,incident:'reported',refundStatus:refund?'pending':'not_required'})}
let wm=p.match(/^\/api\/admin\/orders\/(\d+)\/(approve|reject|preparing|ready|complete)$/);if(wm&&m==='POST'){if(!adminOK(r,e))return out({error:'Não autorizado.'},401);const id=+wm[1],action=wm[2],b=await r.json(),o=await orderDetails(e,id);if(!o)return out({error:'Pedido não encontrado.'},404);if(action==='preparing'&&o.payment_status!=='paid'&&o.payment_status!=='not_required')return out({error:'O pagamento ainda não foi confirmado.'},409);if(action==='preparing'&&o.payment_status==='paid'&&o.invoice_status!=='issued')return out({error:'Regista primeiro o documento fiscal emitido na ATGo.'},409);if (action === 'approve') {
  /*
   * O desconto é recebido em pontos-base:
   *
   * 0    = 0%
   * 500  = 5%
   * 1000 = 10%
   * 1500 = 15%
   */
  const discountBps =
    validateDiscountBps(
      b.discountBps || 0
    );

  /*
   * Se o administrador indicar uma entrega,
   * a informação é guardada antes de congelar
   * a fotografia fiscal.
   *
   * Todos os valores monetários estão em cêntimos.
   */
  const shippingGrossCents = Number(
    b.shippingGrossCents || 0
  );

  if (
    !Number.isInteger(shippingGrossCents) ||
    shippingGrossCents < 0
  ) {
    return out(
      {
        error:
          'O valor da entrega é inválido.'
      },
      400
    );
  }

  if (shippingGrossCents > 0) {
    await e.DB.prepare(`
      UPDATE orders
      SET
        shipping_service_code =
          'DELIVERY-INDEPENDENT',

        shipping_carrier = ?,

        shipping_service_name = ?,

        shipping_gross_cents = ?,

        shipping_vat_rate_bps = 2300,

        updated_at = CURRENT_TIMESTAMP

      WHERE id = ?
    `)
      .bind(
        String(
          b.shippingCarrier || ''
        ).trim() || null,

        String(
          b.shippingServiceName ||
          'Serviço autónomo de entrega'
        ).trim(),

        shippingGrossCents,

        id
      )
      .run();
  } else {
    /*
     * Se não houver entrega, limpa qualquer
     * configuração logística eventualmente
     * guardada numa tentativa anterior.
     */
    await e.DB.prepare(`
      UPDATE orders
      SET
        shipping_service_code = NULL,
        shipping_carrier = NULL,
        shipping_service_name = NULL,
        shipping_net_cents = 0,
        shipping_vat_cents = 0,
        shipping_gross_cents = 0,
        shipping_vat_rate_bps = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(id)
      .run();
  }

  /*
   * Congela as linhas da encomenda:
   *
   * - produto e designação;
   * - preço unitário com IVA;
   * - desconto;
   * - taxa de IVA;
   * - base tributável;
   * - IVA;
   * - total com IVA;
   * - entrega autónoma a 23%.
   */
  const fiscalSnapshot =
    await freezeOrderFiscalSnapshot(
      e,
      id,
      {
        discountBps
      }
    );

  const total =
    fiscalSnapshot.grossTotalCents;

  if (
    !Number.isInteger(total) ||
    total < 50
  ) {
    return out(
      {
        error:
          'O total fiscal deve ser de pelo menos 0,50 €.'
      },
      400
    );
  }

  /*
   * Se o painel administrativo ainda enviar
   * totalCents, usamos esse valor apenas como
   * controlo. O valor cobrado será sempre o
   * total calculado a partir das linhas fiscais.
   */
  if (
    b.totalCents !== undefined &&
    b.totalCents !== null &&
    b.totalCents !== ''
  ) {
    const submittedTotal =
      Number(b.totalCents);

    if (
      !Number.isInteger(submittedTotal) ||
      submittedTotal < 0
    ) {
      return out(
        {
          error:
            'O total indicado pelo administrador é inválido.'
        },
        400
      );
    }

    if (submittedTotal !== total) {
      return out(
        {
          error:
            'O total indicado não coincide com o total fiscal calculado.',

          submittedTotalCents:
            submittedTotal,

          calculatedTotalCents:
            total,

          calculatedTotal:
            euros(total),

          netTotalCents:
            fiscalSnapshot.netTotalCents,

          vatTotalCents:
            fiscalSnapshot.vatTotalCents,

          vatBreakdown:
            fiscalSnapshot.vatBreakdown
        },
        409
      );
    }
  }

  const paymentHours = Number(
    b.paymentHours || 24
  );

  if (
    !Number.isInteger(paymentHours) ||
    paymentHours < 1 ||
    paymentHours > 168
  ) {
    return out(
      {
        error:
          'O prazo de pagamento deve estar entre 1 e 168 horas.'
      },
      400
    );
  }

  const expiry =
    Math.floor(Date.now() / 1000) +
    paymentHours * 3600;

  /*
   * A Stripe recebe o total final já com IVA.
   * A discriminação fiscal completa permanece
   * congelada na D1 e será usada no recibo.
   */
  const session = await stripePost(
    e,
    'checkout/sessions',
    {
      mode: 'payment',

      success_url:
        `${e.SITE_URL}/pagamento-sucesso.html` +
        '?session_id={CHECKOUT_SESSION_ID}',

      cancel_url:
        `${e.SITE_URL}/encomendas.html`,

      customer_email:
        o.email,

      client_reference_id:
        String(id),

      'metadata[order_id]':
        String(id),

      'metadata[order_number]':
        String(o.order_number),

      'metadata[net_total_cents]':
        String(
          fiscalSnapshot.netTotalCents
        ),

      'metadata[vat_total_cents]':
        String(
          fiscalSnapshot.vatTotalCents
        ),

      'metadata[gross_total_cents]':
        String(total),

      'metadata[discount_bps]':
        String(discountBps),

      'metadata[shipping_gross_cents]':
        String(shippingGrossCents),

      'line_items[0][price_data][currency]':
        'eur',

      'line_items[0][price_data][product_data][name]':
        `Pedido ${o.order_number}`,

      'line_items[0][price_data][product_data][description]':
        'Encomenda Dos Lilinhos, IVA incluído',

      'line_items[0][price_data][unit_amount]':
        String(total),

      'line_items[0][quantity]':
        '1',

      expires_at:
        String(expiry)
    }
  );

  await e.DB.batch([
    e.DB.prepare(`
      UPDATE orders
      SET
        status = 'confirmed',
        approval_status = 'awaiting_payment',
        payment_status = 'pending',
        payment_provider = 'stripe',
        payment_reference = ?,
        payment_url = ?,
        payment_expires_at =
          datetime(?, 'unixepoch'),
        approval_note = ?,
        pickup_location = ?,
        pickup_at = ?,
        total_cents = ?,
        receipt_status = 'pending',
        confirmed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      session.id,
      session.url,
      expiry,
      b.note || null,
      b.location || null,
      b.pickupAt || null,
      total,
      id
    ),

    e.DB.prepare(`
      INSERT INTO payments (
        order_id,
        provider,
        provider_session_id,
        status,
        amount_cents,
        currency,
        payment_url,
        expires_at
      )
      VALUES (
        ?,
        'stripe',
        ?,
        'pending',
        ?,
        'eur',
        ?,
        datetime(?, 'unixepoch')
      )
    `).bind(
      id,
      session.id,
      total,
      session.url,
      expiry
    ),

    e.DB.prepare(`
      INSERT INTO workflow_events (
        entity_type,
        entity_id,
        event_type,
        from_status,
        to_status,
        note,
        actor
      )
      VALUES (
        'order',
        ?,
        'payment_requested',
        ?,
        'awaiting_payment',
        ?,
        'admin'
      )
    `).bind(
      id,
      o.status,
      b.note || null
    )
  ]);

  await audit(
    e.DB,
    {
      entityType: 'order',
      entityId: id,
      reference: o.order_number,
      action: 'payment_requested',
      fromStatus:
        o.approval_status ||
        o.status,
      toStatus:
        'awaiting_payment',
      actor: 'admin',
      amountCents: total,
      ipHash:
        await requestHash(r),
      details: {
        discountBps,

        shippingGrossCents,

        netTotalCents:
          fiscalSnapshot.netTotalCents,

        vatTotalCents:
          fiscalSnapshot.vatTotalCents,

        grossTotalCents:
          fiscalSnapshot.grossTotalCents,

        vatBreakdown:
          fiscalSnapshot.vatBreakdown,

        stripeSessionId:
          session.id,

        paymentExpiresAt:
          expiry
      }
    }
  );

  await sendEmail(
    e,
    e.DB,
    {
      type: 'payment_available',
      to: o.email,
      customerId: o.customer_id,
      orderId: id,

      data: {
        ...o,
        ...flowUrls(e, id),

        items:
          fiscalSnapshot.lines.map(
            line => ({
              name: line.productName,

              quantity:
                line.type === 'shipping'
                  ? '1 serviço'
                  : `${line.quantity} unidade(s)`
            })
          ),

        totalCents: total,

        netTotalCents:
          fiscalSnapshot.netTotalCents,

        vatTotalCents:
          fiscalSnapshot.vatTotalCents,

        vatBreakdown:
          fiscalSnapshot.vatBreakdown,

        pickupAt:
          b.pickupAt,

        location:
          b.location,

        paymentUrl:
          session.url
      }
    }
  );

 return out({
    success: true,
    status: 'awaiting_payment',
    paymentUrl: session.url,
    paymentExpiresAt: expiry,

    fiscalSummary: {
      discountBps,

      netTotalCents:
        fiscalSnapshot.netTotalCents,

      vatTotalCents:
        fiscalSnapshot.vatTotalCents,

      grossTotalCents:
        fiscalSnapshot.grossTotalCents,

      vatBreakdown:
        fiscalSnapshot.vatBreakdown,

      shippingGrossCents
    }
  });
}

const next = {
  reject: 'cancelled',
  preparing: 'confirmed',
  ready: 'ready',
  complete: 'completed'
}[action];

const approvalState = {
  reject: 'rejected',
  preparing: 'preparing',
  ready: 'ready',
  complete: 'completed'
}[action];

await e.DB.prepare(`
  UPDATE orders
  SET
    status = ?,
    approval_status = ?,
    approval_note = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`)
  .bind(
    next,
    approvalState,
    b.note || null,
    id
  )
  .run();

await e.DB.prepare(`
  INSERT INTO workflow_events (
    entity_type,
    entity_id,
    event_type,
    from_status,
    to_status,
    note,
    actor
  )
  VALUES (
    'order',
    ?,
    ?,
    ?,
    ?,
    ?,
    'admin'
  )
`)
  .bind(
    id,
    action,
    o.status,
    next,
    b.note || null
  )
  .run();

await audit(
  e.DB,
  {
    entityType: 'order',
    entityId: id,
    reference: o.order_number,
    action,

    fromStatus:
      o.approval_status || o.status,

    toStatus:
      approvalState,

    actor: 'admin',

    reason:
      b.note || null,

    ipHash:
      await requestHash(r)
  }
);

await sendEmail(
  e,
  e.DB,
  {
    type: {
      reject: 'order_rejected',
      preparing: 'order_preparing',
      ready: 'order_ready',
      complete: 'order_completed'
    }[action],

    to: o.email,
    customerId: o.customer_id,
    orderId: id,

    data: {
      ...o,
      ...flowUrls(e, id),
      note: b.note
    }
  }
);

return out({
  success: true,
  status: next
});
}
wm=p.match(/^\/api\/admin\/subscriptions\/(\d+)\/(approve|reject)$/);if(wm&&m==='POST'){if(!adminOK(r,e))return out({error:'Não autorizado.'},401);const id=+wm[1],action=wm[2],b=await r.json(),x=await e.DB.prepare(`SELECT s.*,c.name,c.email,p.name product FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN products p ON p.id=s.product_id WHERE s.id=?`).bind(id).first();if(!x)return out({error:'Subscrição não encontrada.'},404);const next=action==='approve'?'active':'rejected';await e.DB.prepare(`UPDATE subscriptions SET status=?,approval_note=?,price_cents=COALESCE(?,price_cents),first_delivery_on=COALESCE(?,first_delivery_on),pickup_location=COALESCE(?,pickup_location),approved_at=CASE WHEN ?='active' THEN CURRENT_TIMESTAMP ELSE approved_at END,rejected_at=CASE WHEN ?='rejected' THEN CURRENT_TIMESTAMP ELSE rejected_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(next,b.note||null,b.priceCents||null,b.firstDelivery||null,b.location||null,next,next,id).run();await sendEmail(e,e.DB,{type:action==='approve'?'subscription_approved':'subscription_rejected',to:x.email,customerId:x.customer_id,subscriptionId:id,data:{...x,note:b.note,quantity:`${x.eggs_per_delivery} unidades`,frequency:{weekly:'Semanal',biweekly:'Quinzenal',monthly:'Mensal'}[x.frequency]||x.frequency,priceCents:b.priceCents||0,firstDelivery:b.firstDelivery,url:`${e.SITE_URL}/subscricoes.html`,productsUrl:`${e.SITE_URL}/produtos.html`}});return out({success:true,status:next})}
/* =========================================================
   PRÉ-VISUALIZAÇÃO DO RECIBO
   Não cria recibo, não marca pagamento e não envia email.
   ========================================================= */

const receiptPreviewMatch =
  p.match(
    /^\/api\/my\/orders\/(\d+)\/receipt-preview\.pdf$/
  );

if (
  receiptPreviewMatch &&
  m === 'GET'
) {
  const currentCustomer =
    await customer(r, e);

  if (!currentCustomer) {
    return out(
      {
        error: 'Inicia sessão.'
      },
      401
    );
  }

  const orderId = Number(
    receiptPreviewMatch[1]
  );

  const order =
    await e.DB.prepare(`
      SELECT
        o.*,
        c.name,
        c.email
      FROM orders o
      JOIN customers c
        ON c.id = o.customer_id
      WHERE o.id = ?
        AND o.customer_id = ?
    `)
      .bind(
        orderId,
        currentCustomer.id
      )
      .first();

  if (!order) {
    return out(
      {
        error:
          'Encomenda não encontrada.'
      },
      404
    );
  }

  /*
   * Por segurança, a pré-visualização sem pagamento
   * fica limitada às encomendas técnicas.
   */
  const technicalOrder =
    String(
      order.internal_notes || ''
    ).startsWith('TESTE TÉCNICO');

  if (
    order.payment_status !== 'paid' &&
    !technicalOrder
  ) {
    return out(
      {
        error:
          'O recibo só fica disponível após o pagamento.'
      },
      409
    );
  }

  const fiscalSnapshot =
    await loadFrozenFiscalSnapshot(
      e,
      orderId
    );

  const previewNumber =
    technicalOrder
      ? 'MAQUETE-DL-RC-2026-000001'
      : (
          order.receipt_id
            ? `RECIBO-${order.receipt_id}`
            : 'RECIBO-PENDENTE'
        );

  const pdfBytes =
    await generateReceiptPdf({
      env: e,
      order,
      fiscalSnapshot,

      receiptNumber:
        previewNumber,

      paymentDetails:
        technicalOrder
          ? {
              methodLabel:
                'Simulação técnica, sem pagamento',
              provider:
                'Não aplicável',
              paidAt:
                null,
              reference:
                null
            }
          : {
              methodLabel:
                order.payment_method ||
                'Pagamento online',
              provider:
                order.payment_provider ||
                'Stripe',
              paidAt:
                order.paid_at,
              reference:
                order.payment_reference
            },

      preview:
        technicalOrder
    });
  return new Response(
    pdfBytes,
    {
      status: 200,

      headers: {
        'content-type':
          'application/pdf',

        'content-disposition':
          `inline; filename="Dos-Lilinhos_Recibo_${previewNumber}.pdf"`,

        'cache-control':
          'private, no-store, max-age=0',

        'x-content-type-options':
          'nosniff'
      }
    }
  );
}
if(p==='/api/stock'){const pr=await product(e);return out({success:true,stock:await stock(e,pr.id),product:pr})}if(p==='/api/auth/me'){const c=await customer(r,e);return out({success:true,authenticated:!!c,customer:c})}if(p==='/api/auth/register'&&m==='POST'){const b=await r.json(),name=String(b.name||'').trim(),username=String(b.username||'').trim().toLowerCase(),email=String(b.email||'').trim().toLowerCase(),pw=String(b.password||'');if(!/^[a-z0-9._-]{3,30}$/.test(username)||pw.length<8||pw!==b.passwordConfirmation||!b.privacyAccepted)return out({success:false,error:'Confirma todos os dados e as palavras-passe.'},400);if(await e.DB.prepare('SELECT id FROM customers WHERE email=? OR username=?').bind(email,username).first())return out({success:false,error:'Email ou nome de utilizador já existente.'},409);const q=await e.DB.prepare(`INSERT INTO customers(name,username,email,password_hash,notifications_enabled,privacy_accepted_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(name,username,email,await hashPass(pw),b.notificationsEnabled?1:0).run();return out({success:true},201,{'set-cookie':setcookie(await makeSession(q.meta.last_row_id,e))})}if(p==='/api/auth/recover'&&m==='POST'){const b=await r.json(),identifier=String(b.identifier||'').trim().toLowerCase(),generic={success:true,message:'Se encontrarmos uma conta correspondente, enviaremos um email com as instruções.'};if(!identifier)return out(generic);const ih=await sha(`recover:${identifier}`),recent=await e.DB.prepare(`SELECT COUNT(*) n FROM password_reset_rate_limits WHERE identifier_hash=? AND requested_at>datetime('now','-15 minutes')`).bind(ih).first();if(Number(recent?.n||0)>=3)return out(generic);await e.DB.prepare('INSERT INTO password_reset_rate_limits(identifier_hash) VALUES(?)').bind(ih).run();const c=await e.DB.prepare(`SELECT id,name,username,email FROM customers WHERE active=1 AND (lower(email)=? OR lower(username)=?)`).bind(identifier,identifier).first();if(c){await e.DB.prepare(`UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE customer_id=? AND used_at IS NULL`).bind(c.id).run();const raw=b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g,''),th=await sha(raw),ip=r.headers.get('cf-connecting-ip')||'',iph=ip?await sha(`reset-ip:${ip}`):null;await e.DB.prepare(`INSERT INTO password_reset_tokens(customer_id,token_hash,expires_at,requested_ip_hash) VALUES(?,?,datetime('now','+30 minutes'),?)`).bind(c.id,th,iph).run();await sendEmail(e,e.DB,{type:'access_recovery',to:c.email,customerId:c.id,data:{name:c.name,username:c.username,resetUrl:`${e.SITE_URL}/repor-password.html?token=${encodeURIComponent(raw)}`}})}return out(generic)}
if(p==='/api/auth/reset/validate'&&m==='GET'){const raw=u.searchParams.get('token')||'';if(!raw)return out({valid:false});const x=await e.DB.prepare(`SELECT id FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now')`).bind(await sha(raw)).first();return out({valid:!!x})}
if(p==='/api/auth/reset'&&m==='POST'){const b=await r.json(),raw=String(b.token||''),pw=String(b.password||''),confirm=String(b.passwordConfirmation||'');if(pw.length<8||pw!==confirm)return out({error:'As palavras-passe devem coincidir e ter pelo menos 8 caracteres.'},400);const x=await e.DB.prepare(`SELECT t.id,t.customer_id,c.name,c.email FROM password_reset_tokens t JOIN customers c ON c.id=t.customer_id WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>datetime('now')`).bind(await sha(raw)).first();if(!x)return out({error:'A ligação é inválida ou expirou.'},400);await e.DB.batch([e.DB.prepare('UPDATE customers SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(await hashPass(pw),x.customer_id),e.DB.prepare('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?').bind(x.id),e.DB.prepare('DELETE FROM customer_sessions WHERE customer_id=?').bind(x.customer_id)]);await sendEmail(e,e.DB,{type:'password_changed',to:x.email,customerId:x.customer_id,data:{name:x.name,loginUrl:`${e.SITE_URL}/?login=1`}});return out({success:true})}
if(p==='/api/auth/login'&&m==='POST'){const b=await r.json(),identifier=String(b.identifier||b.email||'').trim().toLowerCase(),c=await e.DB.prepare('SELECT * FROM customers WHERE active=1 AND (lower(email)=? OR lower(username)=?)').bind(identifier,identifier).first();if(!c||!await verifyPass(b.password,c.password_hash))return out({success:false,error:'Email ou palavra-passe incorretos.'},401);return out({success:true},200,{'set-cookie':setcookie(await makeSession(c.id,e))})}if(p==='/api/auth/logout'&&m==='POST'){const t=cookie(r,'dl_session');if(t)await e.DB.prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await sha(t)).run();return out({success:true},200,{'set-cookie':'dl_session=; Path=/; Max-Age=0'})}if(p==='/api/my/profile'&&m==='PATCH'){const c=await customer(r,e),b=await r.json(),un=String(b.username||'').trim().toLowerCase();if(!c)return out({error:'Inicia sessão.'},401);if(!/^[a-z0-9._-]{3,30}$/.test(un))return out({error:'Nome de utilizador inválido.'},400);if(await e.DB.prepare('SELECT id FROM customers WHERE username=? AND id<>?').bind(un,c.id).first())return out({error:'Nome de utilizador ocupado.'},409);await e.DB.prepare('UPDATE customers SET name=?,username=?,notifications_enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.name,un,b.notificationsEnabled?1:0,c.id).run();return out({success:true})}if(p==='/api/my/password'&&m==='PATCH'){const c=await customer(r,e),b=await r.json();if(!c)return out({error:'Inicia sessão.'},401);if(b.newPassword.length<8||b.newPassword!==b.newPasswordConfirmation)return out({error:'As novas palavras-passe não coincidem.'},400);const x=await e.DB.prepare('SELECT password_hash FROM customers WHERE id=?').bind(c.id).first();if(!await verifyPass(b.currentPassword,x.password_hash))return out({error:'Palavra-passe atual incorreta.'},401);await e.DB.prepare('UPDATE customers SET password_hash=? WHERE id=?').bind(await hashPass(b.newPassword),c.id).run();return out({success:true})}if(p==='/api/my/account'&&m==='DELETE'){const c=await customer(r,e),b=await r.json();if(!c)return out({error:'Inicia sessão.'},401);if(b.confirmation!=='ELIMINAR')return out({error:'Escreve ELIMINAR para confirmar.'},400);const anon=`conta-eliminada-${c.id}-${Date.now()}@anon.invalid`;await e.DB.batch([e.DB.prepare(`UPDATE reservations SET customer_name='Conta eliminada',customer_email=? WHERE reservation_number IN(SELECT order_number FROM orders WHERE customer_id=?)`).bind(anon,c.id),e.DB.prepare(`UPDATE subscriptions SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE customer_id=? AND status IN('requested','active','paused')`).bind(c.id),e.DB.prepare('DELETE FROM customer_sessions WHERE customer_id=?').bind(c.id),e.DB.prepare(`UPDATE customers SET name='Conta eliminada',username=NULL,email=?,password_hash=?,notifications_enabled=0,active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(anon,await hashPass(crypto.randomUUID()),c.id)]);return out({success:true},200,{'set-cookie':'dl_session=; Path=/; Max-Age=0'})}if(p==='/api/reservations'&&m==='POST'){const c=await customer(r,e),b=await r.json(),pr=await product(e),packs=+b.packs;if(!c)return out({error:'Inicia sessão.'},401);const eggs=packs*pr.units_per_pack,no=`DL-${Date.now().toString(36).toUpperCase()}`,q=await e.DB.prepare(`INSERT INTO orders(customer_id,order_number,status,total_cents,reserved_until,customer_notes,terms_version,terms_accepted_at,payment_status) VALUES(?,?,'pending',?,datetime('now','+24 hours'),?,'2026-10-28',CURRENT_TIMESTAMP,'not_required')`).bind(c.id,no,(pr.price_cents||0)*packs,b.notes||'').run();await e.DB.prepare(`INSERT INTO order_items(order_id,product_id,packs,units_per_pack,quantity_eggs,unit_price_cents) VALUES(?,?,?,?,?,?)`).bind(q.meta.last_row_id,pr.id,packs,pr.units_per_pack,eggs,pr.price_cents).run();const z=await e.DB.prepare(`INSERT INTO reservations(reservation_number,product_id,customer_name,customer_email,packs,quantity_eggs,status,reserved_until) VALUES(?,?,?,?,?,?,'pending',datetime('now','+24 hours'))`).bind(no,pr.id,c.name,c.email,packs,eggs).run();await e.DB.prepare(`INSERT INTO inventory_movements(product_id,movement_type,quantity_eggs,reference_type,reference_id,notes) VALUES(?,'reservation',?,'reservation',?,'Pedido online')`).bind(pr.id,-eggs,z.meta.last_row_id).run();const mailData={name:c.name,email:c.email,number:no,items:[{name:pr.name,quantity:`${eggs} unidades`}],note:b.notes||'',url:`${e.SITE_URL}/encomendas.html`,adminUrl:`${e.SITE_URL}/admin.html`};await Promise.allSettled([sendEmail(e,e.DB,{type:'order_received',to:c.email,data:mailData,customerId:c.id,orderId:q.meta.last_row_id}),sendEmail(e,e.DB,{type:'order_admin',to:e.ADMIN_EMAIL,data:mailData,customerId:c.id,orderId:q.meta.last_row_id})]);return out({success:true},201)}if(p==='/api/my/orders'){const c=await customer(r,e);if(!c)return out({error:'Inicia sessão.'},401);const q=await e.DB.prepare(`SELECT o.*,COALESCE(SUM(i.quantity_eggs),0) quantity_eggs FROM orders o LEFT JOIN order_items i ON i.order_id=o.id WHERE o.customer_id=? GROUP BY o.id ORDER BY o.created_at DESC`).bind(c.id).all();return out({success:true,orders:q.results})}if(p==='/api/subscriptions'&&m==='POST'){const c=await customer(r,e),b=await r.json(),pr=await product(e);if(!c)return out({error:'Inicia sessão.'},401);const sub=await e.DB.prepare(`INSERT INTO subscriptions(customer_id,product_id,eggs_per_delivery,frequency,shortage_preference,status,terms_version) VALUES(?,?,?,?,?,'requested','2026-10-28')`).bind(c.id,pr.id,b.eggs,b.frequency,b.shortagePreference).run();await sendEmail(e,e.DB,{type:'subscription_received',to:c.email,customerId:c.id,subscriptionId:sub.meta.last_row_id,data:{name:c.name,product:pr.name,quantity:`${b.eggs} unidades`,frequency:{weekly:'Semanal',biweekly:'Quinzenal',monthly:'Mensal'}[b.frequency]||b.frequency,shortage:{wait:'Aguardar produção',lower:'Aceitar quantidade inferior',skip:'Saltar entrega'}[b.shortagePreference]||b.shortagePreference,url:`${e.SITE_URL}/subscricoes.html`}});return out({success:true},201)}if(p==='/api/my/subscriptions'){const c=await customer(r,e);if(!c)return out({error:'Inicia sessão.'},401);const q=await e.DB.prepare('SELECT * FROM subscriptions WHERE customer_id=? ORDER BY created_at DESC').bind(c.id).all();return out({success:true,subscriptions:q.results})}return null}export default{async fetch(r,e){try{return await route(r,e)||e.ASSETS.fetch(r)}catch(x){console.error(x);return out({success:false,error:x.message||'Erro interno.'},500)}}}
