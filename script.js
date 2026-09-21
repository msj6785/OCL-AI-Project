document.addEventListener('DOMContentLoaded', () => {
  const cases = {
    chip: { title: '반도체 보조금', description: '미국 반도체법 보조금 지급과 국내 기업의 투자 변화를 추적합니다.', facts: '12', articles: '148' },
    election: { title: '서울시장 선거', description: '서울시장 선거 공약과 후보자들의 주요 행보를 추적합니다.', facts: '05', articles: '92' },
    climate: { title: '북극 항로 개방', description: '북극 항로 개방 논의와 국제사회의 대응을 추적합니다.', facts: '08', articles: '117' }
  };
  const title = document.getElementById('pageTitle');
  const description = document.getElementById('pageDescription');
  const breadcrumb = document.getElementById('breadcrumbCase');
  const facts = document.getElementById('newFactsCount');
  const articles = document.getElementById('articleCount');
  const toast = document.getElementById('toast');
  let toastTimer;
  const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2800); };
  document.querySelectorAll('.case-link').forEach((button) => button.addEventListener('click', () => {
    const selected = cases[button.dataset.case];
    document.querySelector('.case-link.selected').classList.remove('selected'); button.classList.add('selected');
    title.textContent = selected.title; breadcrumb.textContent = selected.title; description.textContent = selected.description; facts.textContent = selected.facts; articles.textContent = selected.articles;
    showToast(`${selected.title} 사건을 불러왔습니다.`);
  }));
  document.getElementById('collectButton').addEventListener('click', (event) => {
    const button = event.currentTarget; button.disabled = true; button.innerHTML = '<span class="refresh-symbol">↻</span> 수집 중...'; showToast('18개 출처에서 새 기사를 확인하고 있습니다.');
    setTimeout(() => { button.disabled = false; button.innerHTML = '<span class="refresh-symbol">↻</span> 지금 수집하기'; facts.textContent = String(Number(facts.textContent) + 2).padStart(2, '0'); articles.textContent = String(Number(articles.textContent) + 6); showToast('새로운 사실 2개를 추가하고, 중복 기사 6개를 걸러냈습니다.'); }, 1200);
  });
  document.getElementById('filterButton').addEventListener('click', (event) => { const button = event.currentTarget; button.classList.toggle('active'); button.firstChild.textContent = button.classList.contains('active') ? '새 사실만 ' : '전체 보기 '; showToast(button.classList.contains('active') ? '새 사실만 표시합니다.' : '전체 타임라인을 표시합니다.'); });
  document.querySelectorAll('.detail-button').forEach((button) => button.addEventListener('click', () => showToast('기사 7건의 원문과 AI 요약을 준비 중입니다.')));
  document.getElementById('settingsButton').addEventListener('click', () => showToast('수집 주기와 키워드 설정은 곧 제공됩니다.'));
  document.getElementById('addCaseButton').addEventListener('click', () => showToast('새 사건 등록 화면을 준비 중입니다.'));
  document.querySelector('.close-button').addEventListener('click', (event) => event.currentTarget.closest('.ai-panel').remove());
});
