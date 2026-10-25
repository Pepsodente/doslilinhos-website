const menu=document.querySelector('.menu');
const nav=document.querySelector('nav');
const accountDialog=document.getElementById('account-dialog');
const stockCount=document.getElementById('stock-count');
const stockNote=document.getElementById('stock-note');
const quantityInput=document.getElementById('qty');
const orderButton=document.getElementById('order');
const PACKAGE_EGGS=[6,12,18,30];
let currentStock={availableEggs:0,availablePacks:0,available:false,unitsPerPack:6};
menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});
document.getElementById('year').textContent=new Date().getFullYear();
document.querySelectorAll('.open-account').forEach(button=>button.addEventListener('click',()=>accountDialog.showModal()));
document.querySelector('.close')?.addEventListener('click',()=>accountDialog.close());
function notice(text){const el=document.createElement('div');el.className='notice';el.textContent=text;document.body.appendChild(el);setTimeout(()=>el.remove(),5000);}
function availablePackages(){return PACKAGE_EGGS.filter(eggs=>eggs<=currentStock.availableEggs);}
function setupPackageSelector(){
  const options=availablePackages();
  let select=document.getElementById('egg-package');
  if(!select){select=document.createElement('select');select.id='egg-package';select.setAttribute('aria-label','Formato da caixa');quantityInput.replaceWith(select);}
  select.innerHTML=options.map(eggs=>`<option value="${eggs}">${eggs} ovos (${eggs/6} caixa${eggs===6?'':'s'} de 6)</option>`).join('');
  select.disabled=!options.length;
  return select;
}
function renderStock(){
  const {availableEggs,availablePacks,available,unitsPerPack}=currentStock;
  const packages=availablePackages();
  if(!available||!packages.length){
    stockCount.textContent='Temporariamente esgotado';
    stockNote.textContent=availableEggs>0?`${availableEggs} ovo${availableEggs===1?'':'s'} em stock, ainda sem completar uma caixa de ${unitsPerPack}.`:'Neste momento não existem caixas disponíveis para reserva.';
    setupPackageSelector();orderButton.disabled=true;orderButton.textContent='Sem stock disponível';return;
  }
  stockCount.textContent=`${availablePacks} caixa${availablePacks===1?'':'s'} ${availablePacks===1?'disponível':'disponíveis'}`;
  stockNote.textContent=`${availableEggs} ovos em stock. Formatos disponíveis: ${packages.join(', ')} ovos.`;
  setupPackageSelector();orderButton.disabled=false;orderButton.textContent='Reservar ovos';
}
async function loadStock(){stockCount.textContent='A consultar stock...';stockNote.textContent='A obter a disponibilidade atual.';orderButton.disabled=true;try{const response=await fetch('/api/stock',{headers:{Accept:'application/json'},cache:'no-store'});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||'Erro no stock');currentStock={availableEggs:Number(data.stock.availableEggs)||0,availablePacks:Number(data.stock.availablePacks)||0,available:Boolean(data.stock.available),unitsPerPack:Number(data.product.unitsPerPack)||6};renderStock();}catch(error){stockCount.textContent='Disponibilidade não confirmada';stockNote.textContent='Não foi possível consultar o stock. Tente novamente.';orderButton.disabled=true;}}
function ensureReservationDialog(){let dialog=document.getElementById('reservation-dialog');if(dialog)return dialog;dialog=document.createElement('dialog');dialog.id='reservation-dialog';dialog.innerHTML=`<button class="close reservation-close" type="button" aria-label="Fechar">×</button><p class="kicker">Reserva de ovos</p><h2>Confirmar reserva</h2><p id="reservation-summary"></p><form id="reservation-form"><label>Nome<input required name="name" maxlength="100" autocomplete="name"></label><label>Email<input required type="email" name="email" maxlength="160" autocomplete="email"></label><button class="btn dark full" id="reservation-submit" type="submit">Reservar</button><p class="micro">A reserva fica pendente durante 24 horas e será confirmada pelos Dos Lilinhos.</p></form>`;document.body.appendChild(dialog);dialog.querySelector('.reservation-close').addEventListener('click',()=>dialog.close());dialog.querySelector('#reservation-form').addEventListener('submit',submitReservation);return dialog;}
orderButton?.addEventListener('click',()=>{const eggs=Number(document.getElementById('egg-package')?.value);if(!PACKAGE_EGGS.includes(eggs)||eggs>currentStock.availableEggs){notice('Escolha um formato disponível.');return;}const dialog=ensureReservationDialog();dialog.dataset.eggs=String(eggs);dialog.dataset.packs=String(eggs/6);dialog.querySelector('#reservation-summary').textContent=`Caixa de ${eggs} ovos`;dialog.showModal();});
async function submitReservation(event){event.preventDefault();const form=event.currentTarget,dialog=form.closest('dialog'),submit=form.querySelector('#reservation-submit'),data=new FormData(form),packs=Number(dialog.dataset.packs),eggs=Number(dialog.dataset.eggs);submit.disabled=true;submit.textContent='A reservar...';try{const response=await fetch('/api/reservations',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({name:data.get('name'),email:data.get('email'),packs})});const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Não foi possível reservar');dialog.close();form.reset();notice(`Reserva ${result.reservation.number} criada para ${eggs} ovos.`);await loadStock();}catch(error){notice(error.message);}finally{submit.disabled=false;submit.textContent='Reservar';}}
document.getElementById('account-form')?.addEventListener('submit',event=>{event.preventDefault();notice('A criação de conta será ativada numa próxima fase.');accountDialog.close();});
loadStock();
