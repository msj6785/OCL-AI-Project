document.addEventListener('DOMContentLoaded', () => {
  const title = document.getElementById('pageTitle');
  const description = document.getElementById('pageDescription');
  const breadcrumb = document.getElementById('breadcrumbCase');
  const displayCount = document.getElementById('displayCount');
  const articleCount = document.getElementById('articleCount');
  const updateTime = document.getElementById('updateTime');
  const updateDate = document.getElementById('updateDate');
  const timeline = document.getElementById('timeline');
  const toast = document.getElementById('toast');
  const collectButton = document.getElementById('collectButton');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const recentSearches = document.getElementById('recentSearches');
  const pagination = document.getElementById('pagination');
  const prevPage = document.getElementById('prevPage');
  const nextPage = document.getElementById('nextPage');
  const pageInfo = document.getElementById('pageInfo');
  const PAGE_SIZE = 10;
  const MAX_NAVER_RESULTS = 100;
  const CLIENT_ID_KEY = 'ocl-ai-client-id';
  let currentQuery = '';
  let currentPage = 1;
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
    if (Number.isNaN(date.getTime())) return '날짜 정보 없음';

    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date);

    const value = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}시 ${value('minute')}분`;
  };

  const setUpdatedNow = () => {
    const now = new Date();
    updateTime.textContent = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    updateDate.textContent = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
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
            <div class="timeline-line"><span class="timeline-dot"></span></div>
            <div class="fact-card">
              <div class="fact-heading">
                <span class="new-badge">NEWS</span>
                <span class="published-date">${published}</span>
                <span class="fact-category">NAVER 뉴스 검색</span>
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.description)}</p>
              <div class="fact-footer">
                <span class="source-count">검색 API 결과</span>
                <a
                  class="detail-button"
                  href="${escapeHtml(link)}"
                  data-title="${escapeHtml(item.title)}"
                  data-link="${escapeHtml(link)}"
                  data-published="${escapeHtml(published)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >원문 보기 <span>→</span></a>
              </div>
            </div>
          </article>`;
      }).join('')}
    `;
  };

  const getClientId = () => {
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (clientId) return clientId;

    clientId = globalThis.crypto?.randomUUID?.()
      || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    return clientId;
  };

  const renderRecentNews = (recentNews = []) => {
    if (!recentNews.length) {
      recentSearches.innerHTML = '<span class="recent-empty">아직 본 뉴스가 없습니다.</span>';
      return;
    }

    recentSearches.innerHTML = recentNews.map((item) => `
      <a
        class="recent-news-link"
        href="${escapeHtml(item.link)}"
        data-title="${escapeHtml(item.title)}"
        data-link="${escapeHtml(item.link)}"
        data-published="${escapeHtml(item.published || '')}"
        target="_blank"
        rel="noopener noreferrer"
        title="${escapeHtml(item.title)}"
      >
        <span class="recent-news-title">${escapeHtml(item.title)}</span>
        <small>${escapeHtml(item.published || '날짜 정보 없음')}</small>
      </a>
    `).join('');
  };

  const loadRecentNews = async () => {
    try {
      const params = new URLSearchParams({ client_id: getClientId() });
      const response = await fetch(`/api/recent-news?${params.toString()}`);
      if (!response.ok) throw new Error(`최근 뉴스 조회 실패: ${response.status}`);

      const data = await response.json();
      renderRecentNews(data.items || []);
    } catch (error) {
      console.error(error);
      recentSearches.innerHTML = '<span class="recent-empty">최근 본 뉴스를 불러오지 못했습니다.</span>';
    }
  };

  const saveRecentNews = async (item) => {
    if (!item.link || item.link === '#') return;

    try {
      const response = await fetch('/api/recent-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          client_id: getClientId(),
          title: item.title || '제목 없음',
          link: item.link,
          published: item.published || ''
        })
      });

      if (!response.ok) throw new Error(`최근 뉴스 저장 실패: ${response.status}`);
      const data = await response.json();
      renderRecentNews(data.items || []);
    } catch (error) {
      console.error(error);
    }
  };

  const renderPagination = (total, start, itemCount) => {
    const availableResults = Math.min(Number(total || 0), MAX_NAVER_RESULTS);
    const totalPages = Math.max(1, Math.ceil(availableResults / PAGE_SIZE));
    currentPage = Math.floor((Number(start || 1) - 1) / PAGE_SIZE) + 1;

    if (!itemCount || availableResults <= PAGE_SIZE) {
      pagination.hidden = true;
      return;
    }

    pagination.hidden = false;
    pageInfo.textContent = `${currentPage} / ${totalPages}`;
    prevPage.disabled = currentPage <= 1;
    nextPage.disabled = currentPage >= totalPages;
  };

  const loadNews = async (query, page = 1) => {
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
      const start = ((page - 1) * PAGE_SIZE) + 1;
      const params = new URLSearchParams({
        query,
        display: String(PAGE_SIZE),
        start: String(start)
      });
      const response = await fetch(`/api/news?${params.toString()}`);
      if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
      const data = await response.json();
      const items = data.items || [];
      renderNews(items);
      renderPagination(data.total, data.start, items.length);
      displayCount.textContent = String(items.length);
      articleCount.textContent = Number(data.total || 0).toLocaleString('ko-KR');
      setUpdatedNow();
      showToast(`${query} ${currentPage}페이지 기사 ${items.length}건을 불러왔습니다.`);
    } catch (error) {
      console.error(error);
      displayCount.textContent = '-';
      articleCount.textContent = '-';
      timeline.innerHTML = '<div class="day-label"><span>뉴스를 불러오지 못했습니다.</span><i></i><small>Backend API 연결을 확인하세요.</small></div>';
      pagination.hidden = true;
      showToast('뉴스 API 연결에 실패했습니다.');
    } finally {
      collectButton.disabled = false;
      collectButton.innerHTML = '<span class="refresh-symbol">↻</span> 새로고침';
    }
  };

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    loadNews(searchInput.value, 1);
  });
  collectButton.addEventListener('click', () => currentQuery && loadNews(currentQuery, currentPage));
  prevPage.addEventListener('click', () => {
    if (currentQuery && currentPage > 1) loadNews(currentQuery, currentPage - 1);
  });
  nextPage.addEventListener('click', () => {
    if (currentQuery) loadNews(currentQuery, currentPage + 1);
  });
  timeline.addEventListener('click', (event) => {
    const articleLink = event.target.closest('.detail-button');
    if (!articleLink) return;

    saveRecentNews({
      title: articleLink.dataset.title,
      link: articleLink.dataset.link,
      published: articleLink.dataset.published
    });
  });

  recentSearches.addEventListener('click', (event) => {
    const articleLink = event.target.closest('.recent-news-link');
    if (!articleLink) return;

    saveRecentNews({
      title: articleLink.dataset.title,
      link: articleLink.dataset.link,
      published: articleLink.dataset.published
    });
  });

  loadRecentNews();
  searchInput.focus();
});
