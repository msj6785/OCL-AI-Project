document.addEventListener('DOMContentLoaded', () => {
  const title = document.getElementById('pageTitle');
  const description = document.getElementById('pageDescription');
  const breadcrumb = document.getElementById('breadcrumbCase');
  const displayCount = document.getElementById('displayCount');
  const articleCount = document.getElementById('articleCount');
  const updateTime = document.getElementById('updateTime');
  const updateDate = document.getElementById('updateDate');
  const lastSync = document.getElementById('lastSync');
  const timeline = document.getElementById('timeline');
  const toast = document.getElementById('toast');
  const collectButton = document.getElementById('collectButton');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const recentSearches = document.getElementById('recentSearches');
  let currentQuery = '';
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

  const formatPublishedDate = (pubDate) => {
    const date = new Date(pubDate);
    if (Number.isNaN(date.getTime())) return { time: '--:--', date: '날짜 정보 없음' };
    return {
      time: date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
      date: date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    };
  };

  const setUpdatedNow = () => {
    const now = new Date();
    updateTime.textContent = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    updateDate.textContent = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    lastSync.innerHTML = '<i></i> API 연결 정상 · 방금 조회';
  };

  const renderNews = (items) => {
    if (!items.length) {
      timeline.innerHTML = '<div class="day-label"><span>검색 결과 없음</span><i></i><small>다른 키워드로 확인해 보세요.</small></div>';
      return;
    }
    timeline.innerHTML = `
      <div class="day-label"><span>최신순</span><i></i><small>${items.length}개 기사 표시</small></div>
      ${items.map((item) => {
        const published = formatPublishedDate(item.pubDate);
        const link = item.link || item.originallink || '#';
        return `
          <article class="timeline-item fresh">
            <div class="time-column"><strong>${published.time}</strong><span>${published.date}</span></div>
            <div class="timeline-line"><span class="timeline-dot"></span></div>
            <div class="fact-card">
              <div class="fact-heading"><span class="new-badge">NEWS</span><span class="fact-category">NAVER 뉴스 검색</span></div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.description)}</p>
              <div class="fact-footer">
                <span class="source-count">검색 API 결과</span>
                <a class="detail-button" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">원문 보기 <span>→</span></a>
              </div>
            </div>
          </article>`;
      }).join('')}
    `;
  };

  const renderRecentPlaceholder = () => {
    recentSearches.innerHTML = '<span class="recent-empty">Redis 연동 후 최근 검색어가 여기에 표시됩니다.</span>';
  };

  const loadNews = async (query) => {
    query = query.trim();
    if (!query) return showToast('검색어를 입력하세요.');
    currentQuery = query;
    searchInput.value = query;
    title.textContent = query;
    breadcrumb.textContent = query;
    description.textContent = `${query} 관련 최신 뉴스를 NAVER에서 조회합니다.`;
    collectButton.disabled = true;
    collectButton.innerHTML = '<span class="refresh-symbol">↻</span> 조회 중...';

    try {
      const params = new URLSearchParams({ query, display: '10' });
      const response = await fetch(`/api/news?${params.toString()}`);
      if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
      const data = await response.json();
      const items = data.items || [];
      renderNews(items);
      displayCount.textContent = String(items.length);
      articleCount.textContent = Number(data.total || 0).toLocaleString('ko-KR');
      setUpdatedNow();
      showToast(`${query} 최신 기사 ${items.length}건을 불러왔습니다.`);
    } catch (error) {
      console.error(error);
      displayCount.textContent = '-';
      articleCount.textContent = '-';
      lastSync.innerHTML = '<i class="error-dot"></i> API 연결 실패';
      timeline.innerHTML = '<div class="day-label"><span>뉴스를 불러오지 못했습니다.</span><i></i><small>Backend API 연결을 확인하세요.</small></div>';
      showToast('뉴스 API 연결에 실패했습니다.');
    } finally {
      collectButton.disabled = false;
      collectButton.innerHTML = '<span class="refresh-symbol">↻</span> 새로고침';
    }
  };

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadNews(searchInput.value);
  });
  collectButton.addEventListener('click', () => currentQuery && loadNews(currentQuery));
  recentSearches.addEventListener('click', (event) => {
    const button = event.target.closest('[data-query]');
    if (button) loadNews(button.dataset.query);
  });
  renderRecentPlaceholder();
  searchInput.focus();
});
