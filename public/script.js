const menu = document.querySelector('.menu');
const nav = document.querySelector('nav');
const dialog = document.getElementById('account-dialog');
const stockCount = document.getElementById('stock-count');
const stockNote = document.getElementById('stock-note');
const quantityInput = document.getElementById('qty');
const orderButton = document.getElementById('order');

let currentStock = {
  availableEggs: 0,
  availablePacks: 0,
  available: false,
  unitsPerPack: 6
};

menu?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
});

document.getElementById('year').textContent = new Date().getFullYear();

document.querySelectorAll('.open-account').forEach((button) => {
  button.addEventListener('click', () => dialog.showModal());
});

document.querySelector('.close')?.addEventListener('click', () => dialog.close());

function notice(text) {
  const element = document.createElement('div');
  element.className = 'notice';
  element.textContent = text;
  document.body.appendChild(element);
  setTimeout(() => element.remove(), 3500);
}

function renderStock() {
  const { availableEggs, availablePacks, available, unitsPerPack } = currentStock;

  if (!available) {
    stockCount.textContent = 'Temporariamente esgotado';
    stockNote.textContent = availableEggs > 0
      ? `${availableEggs} ovo${availableEggs === 1 ? '' : 's'} disponível${availableEggs === 1 ? '' : 'eis'}, ainda sem completar uma caixa de ${unitsPerPack}.`
      : 'Neste momento não existem caixas disponíveis para reserva.';
    quantityInput.value = 0;
    quantityInput.min = 0;
    quantityInput.max = 0;
    quantityInput.disabled = true;
    orderButton.disabled = true;
    orderButton.textContent = 'Sem stock disponível';
    return;
  }

  stockCount.textContent = `${availablePacks} caixa${availablePacks === 1 ? '' : 's'} disponível${availablePacks === 1 ? '' : 'eis'}`;
  stockNote.textContent = `${availableEggs} ovos em stock, equivalentes a ${availablePacks} caixa${availablePacks === 1 ? '' : 's'} de ${unitsPerPack}.`;
  quantityInput.disabled = false;
  quantityInput.min = 1;
  quantityInput.max = availablePacks;
  quantityInput.value = 1;
  orderButton.disabled = false;
  orderButton.textContent = 'Reservar ovos';
}

async function loadStock() {
  stockCount.textContent = 'A consultar stock...';
  stockNote.textContent = 'A obter a disponibilidade atual.';
  orderButton.disabled = true;

  try {
    const response = await fetch('/api/stock', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.success || !data.stock || !data.product) {
      throw new Error('Resposta inválida da API');
    }

    currentStock = {
      availableEggs: Number(data.stock.availableEggs) || 0,
      availablePacks: Number(data.stock.availablePacks) || 0,
      available: Boolean(data.stock.available),
      unitsPerPack: Number(data.product.unitsPerPack) || 6
    };

    renderStock();
  } catch (error) {
    console.error('Erro ao consultar stock:', error);
    stockCount.textContent = 'Disponibilidade não confirmada';
    stockNote.textContent = 'Não foi possível consultar o stock. Tente novamente dentro de instantes.';
    quantityInput.disabled = true;
    orderButton.disabled = true;
    orderButton.textContent = 'Stock indisponível';
  }
}

document.getElementById('account-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  notice('Demonstração: a conta será ativada quando ligarmos a autenticação.');
  dialog.close();
});

orderButton?.addEventListener('click', () => {
  const quantity = Number(quantityInput.value);

  if (!currentStock.available) {
    notice('Neste momento não existem caixas disponíveis.');
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > currentStock.availablePacks) {
    notice(`Escolha entre 1 e ${currentStock.availablePacks} caixa${currentStock.availablePacks === 1 ? '' : 's'}.`);
    return;
  }

  notice(`Demonstração: reserva de ${quantity} caixa${quantity === 1 ? '' : 's'}.`);
});

loadStock();
