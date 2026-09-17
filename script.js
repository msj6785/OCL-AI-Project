document.addEventListener('DOMContentLoaded', () => {
  const yearElement = document.getElementById('year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  const demoButton = document.getElementById('demoButton');
  const heroHeadline = document.querySelector('.hero h1');

  if (demoButton && heroHeadline) {
    demoButton.addEventListener('click', () => {
      const messages = [
        '서비스를 시작해볼까요?',
        'AI 기반 아이디어가 준비됐습니다.',
        '지금 바로 프로토타입을 확인해보세요.'
      ];

      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      heroHeadline.textContent = randomMessage;

      setTimeout(() => {
        heroHeadline.innerHTML = '빠르게 시작하는<br />스마트한 웹 서비스';
      }, 1200);
    });
  }
});
