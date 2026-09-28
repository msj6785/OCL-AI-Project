document.addEventListener('DOMContentLoaded', () => {
  const cases = {
    chip: {
      title: '반도체 보조금',
      query: '반도체 보조금',
      description: '반도체 보조금 관련 최신 뉴스를 NAVER에서 조회합니다.'
    },
    election: {
      title: '서울시장 선거',
      query: '서울시장 선거',
      description: '서울시장 선거 관련 최신 뉴스를 NAVER에서 조회합니다.'
    },
    climate: {
      title: '북극 항로 개방',
      query: '북극 항로 개방',
      description: '북극 항로 관련 최신 뉴스를 NAVER에서 조회합니다.'
    }
  };

  const title = document.getElementById('pageTitle');
  const description = document.getElementById('pageDescription');
  const breadcrumb = document.getElementById('breadcrumbCase');
  const facts = document.getElementById('newFactsCount');
  const articles = document.getElementById('articleCount');
  const timeline = document.getElementById('timeline');
  const toast = document.getElementById('toast');
  const collectButton = document.getElementById('collectButton');
  let currentCase = 'chip';
  let toastTimer;

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  };

  const escapeHtml = (value = '') => {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  };

  const formatDate = (pubDate) => {
    const date = new Date(pubDate);
    if (Number.isNaN(date.getTime())) return { time: '--:--', date: '날짜 정보 없음' };
    return {
      time: date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      date: date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    };
  };

  const renderNews = (items) => {
    if (!items.length) {
      timeline.innerHTML = '<div class="day-label"><span>검색 결과 없음</span><i></i><small>0개 기사</small></div>';
      return;
    }

    timeline.innerHTML = `
      <div class="day-label">
        <span>실시간 NAVER 뉴스</span>
        <i></i>
        <small>${items.length}개 기사</small>
      </div>
      ${items.map((item) => {
        const published = formatDate(item.pubDate);
        const link = item.link || item.originallink || '#';
        return `
          <article class="timeline-item fresh">
            <div class="time-column">
              <strong>${published.time}</strong>
              <span>${published.date}</span>
            </div>
            <div class="timeline-line"><span class="timeline-dot"></span></div>
            <div class="fact-card">
              <div class="fact-heading">
                <span class="new-badge">NEWS</span>
                <span class="fact-category">NAVER 뉴스 검색</span>
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.description)}</p>
              <div class="fact-footer">
                <span class="source-count">◌ <strong>실시간 기사</strong></span>
                <a class="detail-button" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
                  원문 보기 <span>→</span>
                </a>
              </div>
            </div>
          </article>
        `;
      }).join('')}
    `;
  };

  const loadNews = async (caseKey = currentCase) => {
    const selected = cases[caseKey];
    currentCase = caseKey;

    collectButton.disabled = true;
    collectButton.innerHTML = '<span class="refresh-symbol">↻</span> 수집 중...';

    try {
      const params = new URLSearchParams({ query: selected.query, display: '10' });
      const response = await fetch(`/api/news?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`API 요청 실패: ${response.status}`);
      }

      const data = await response.json();
      renderNews(data.items || []);
      articles.textContent = String(data.total || 0);
      facts.textContent = String((data.items || []).length).padStart(2, '0');
      showToast(`${selected.title} 최신 기사 ${(data.items || []).length}건을 불러왔습니다.`);
    } catch (error) {
      console.error(error);
      timeline.innerHTML = `
        <div class="day-label">
          <span>뉴스를 불러오지 못했습니다.</span>
          <i></i>
          <small>Backend API 연결을 확인하세요.</small>
        </div>
      `;
      showToast('뉴스 API 연결에 실패했습니다.');
    } finally {
      collectButton.disabled = false;
      collectButton.innerHTML = '<span class="refresh-symbol">↻</span> 지금 수집하기';
    }
  };

  document.querySelectorAll('.case-link').forEach((button) => {
    button.addEventListener('click', async () => {
      const selected = cases[button.dataset.case];
      document.querySelector('.case-link.selected')?.classList.remove('selected');
      button.classList.add('selected');

      title.textContent = selected.title;
      breadcrumb.textContent = selected.title;
      description.textContent = selected.description;

      await loadNews(button.dataset.case);
    });
  });

  collectButton.addEventListener('click', () => loadNews(currentCase));

  document.getElementById('filterButton').addEventListener('click', (event) => {
    const button = event.currentTarget;
    button.classList.toggle('active');
    button.firstChild.textContent = button.classList.contains('active') ? '최신 기사 ' : '전체 보기 ';
    showToast('현재 NAVER 뉴스 검색 결과를 표시합니다.');
  });

  document.getElementById('settingsButton').addEventListener('click', () =>
    showToast('검색 키워드 설정 기능은 다음 단계에서 추가할 수 있습니다.')
  );

  document.getElementById('addCaseButton').addEventListener('click', () =>
    showToast('새 검색 키워드 등록 기능은 다음 단계에서 추가할 수 있습니다.')
  );

  document.querySelector('.close-button')?.addEventListener('click', (event) =>
    event.currentTarget.closest('.ai-panel')?.remove()
  );

  loadNews(currentCase);
});
