const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const button = document.querySelector('.menu-btn');
const nav = document.querySelector('nav');

if (button && nav) {
  button.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    });
  });
}
