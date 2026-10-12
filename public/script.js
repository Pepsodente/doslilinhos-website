document.getElementById('year').textContent=new Date().getFullYear();
const b=document.querySelector('.menu-btn'),n=document.querySelector('nav');
b.addEventListener('click',()=>{const open=n.classList.toggle('open');b.setAttribute('aria-expanded',String(open));});
n.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{n.classList.remove('open');b.setAttribute('aria-expanded','false');}));