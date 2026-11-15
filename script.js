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
  const clearRecentNews = document.getElementById('clearRecentNews');
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
    clearRecentNews.hidden = recentNews.length === 0;

    if (!recentNews.length) {
      recentSearches.innerHTML = '<span class="recent-empty">아직 본 뉴스가 없습니다.</span>';
      return;
    }

    recentSearches.innerHTML = recentNews.map((item) => `
      <div class="recent-news-item">
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
        <button
          class="recent-news-delete"
          type="button"
          data-link="${escapeHtml(item.link)}"
          aria-label="최근 본 뉴스에서 삭제"
          title="삭제"
        >×</button>
      </div>
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

  const deleteRecentNews = async (link = '') => {
    try {
      const params = new URLSearchParams({ client_id: getClientId() });
      if (link) params.set('link', link);

      const response = await fetch(`/api/recent-news?${params.toString()}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error(`최근 뉴스 삭제 실패: ${response.status}`);
      const data = await response.json();
      renderRecentNews(data.items || []);
      showToast(link ? '최근 본 뉴스에서 삭제했습니다.' : '최근 본 뉴스를 모두 삭제했습니다.');
    } catch (error) {
      console.error(error);
      showToast('최근 본 뉴스 삭제에 실패했습니다.');
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
    const deleteButton = event.target.closest('.recent-news-delete');
    if (deleteButton) {
      event.preventDefault();
      deleteRecentNews(deleteButton.dataset.link);
      return;
    }

    const articleLink = event.target.closest('.recent-news-link');
    if (!articleLink) return;

    saveRecentNews({
      title: articleLink.dataset.title,
      link: articleLink.dataset.link,
      published: articleLink.dataset.published
    });
  });

  clearRecentNews.addEventListener('click', () => deleteRecentNews());

  loadRecentNews();
  if (location.hash !== "#stockPanel") searchInput.focus({ preventScroll: true });
});

document.addEventListener('DOMContentLoaded', () => {
  const byId = (id) => document.getElementById(id);
  const newsButton = byId('showNews');
  const stocksButton = byId('showStocks');
  const symbol = byId('stockSymbol');
  const quote = byId('stockQuote');
  const chart = byId('stockChart');
  const newsList = byId('stockNewsList');
  const status = byId('stockStatus');
  const newsStatus = byId('stockNewsStatus');
  const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' });
  const date = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'short'
  });
  const dateTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short'
  });
  let pending;

  const loadJson = async (url, signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('API request failed');
    return response.json();
  };

  const drawChart = (candles) => {
    const points = candles
      .filter((candle) => candle.closePrice != null)
      .map((candle) => ({ time: Date.parse(candle.timestamp), price: Number(candle.closePrice) }))
      .filter(({ time, price }) => Number.isFinite(time) && Number.isFinite(price))
      .sort((a, b) => a.time - b.time);

    if (!points.length) return false;

    const canvas = byId('stockCanvas');
    const context = canvas.getContext('2d');
    const prices = points.map(({ price }) => price);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = '#e3e8e6';
    context.lineWidth = 1;
    context.beginPath();
    for (const y of [12, height / 2, height - 12]) {
      context.moveTo(12, y);
      context.lineTo(width - 12, y);
    }
    context.stroke();
    context.strokeStyle = '#315e65';
    context.lineWidth = 3;
    context.beginPath();
    points.forEach(({ price }, index) => {
      const x = points.length === 1 ? width / 2 : 12 + index * (width - 24) / (points.length - 1);
      const y = high === low ? height / 2 : height - 12 - (price - low) * (height - 24) / (high - low);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
      if (points.length === 1) context.lineTo(x + 1, y);
    });
    context.stroke();
    const range = `${date.format(points[0].time)} ~ ${date.format(points.at(-1).time)} · ${won.format(low)} ~ ${won.format(high)}`;
    canvas.setAttribute('aria-label', `종가 차트, ${range}`);
    byId('stockChartRange').textContent = range;
    return true;
  };

  const loadStock = () => {
    pending?.abort();
    pending = new AbortController();
    const { signal } = pending;
    const code = symbol.value;
    const name = symbol.selectedOptions[0].textContent.split(' (')[0];
    quote.hidden = true;
    chart.hidden = true;
    newsList.replaceChildren();
    status.textContent = '시세 조회 중…';
    newsStatus.textContent = '관련 뉴스 조회 중…';

    loadJson(`/api/stocks/${code}`, signal).then((data) => {
      if (signal.aborted) return;
      byId('stockName').textContent = name;
      byId('stockCode').textContent = code;
      byId('stockPrice').textContent = won.format(Number(data.quote.lastPrice));
      byId('stockTime').textContent = `시세 기준 ${dateTime.format(new Date(data.quote.timestamp))}`;
      const quoteDay = date.format(new Date(data.quote.timestamp));
      const previous = data.candles.find((candle) => {
        const candleTime = Date.parse(candle.timestamp);
        return candleTime < Date.parse(data.quote.timestamp) && date.format(candleTime) !== quoteDay;
      });
      const previousClose = Number(previous?.closePrice);
      const change = (Number(data.quote.lastPrice) / previousClose - 1) * 100;
      byId('stockChange').textContent = previousClose > 0 && Number.isFinite(change)
        ? `전일 대비 ${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '';
      byId('stockChange').dataset.direction = change > 0 ? 'up' : change < 0 ? 'down' : '';
      quote.hidden = false;
      chart.hidden = !drawChart(data.candles);
      status.textContent = chart.hidden ? '표시할 일봉 데이터가 없습니다.' : '';
    }).catch(() => {
      if (!signal.aborted) status.textContent = '토스증권 시세를 불러오지 못했습니다.';
    });

    const params = new URLSearchParams({ query: name, display: '5' });
    loadJson(`/api/news?${params}`, signal).then(({ items }) => {
      if (signal.aborted) return;
      for (const item of items) {
        let url;
        try {
          url = new URL(item.originallink || item.link);
        } catch {
          continue;
        }
        if (!url || !['https:', 'http:'].includes(url.protocol)) continue;
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.title;
        li.append(link);
        newsList.append(li);
      }
      newsStatus.textContent = newsList.children.length ? '' : '관련 뉴스가 없습니다.';
    }).catch(() => {
      if (!signal.aborted) newsStatus.textContent = '관련 뉴스를 불러오지 못했습니다.';
    });
  };

  let activeView;

  const syncView = () => {
    const view = location.hash === '#stockPanel' ? 'stocks' : 'news';
    if (activeView === view) return;
    activeView = view;
    const showingStocks = view === 'stocks';
    const selected = showingStocks ? stocksButton : newsButton;
    const inactive = showingStocks ? newsButton : stocksButton;
    selected.setAttribute('aria-current', 'page');
    inactive.removeAttribute('aria-current');
    if (showingStocks) loadStock();
    else pending?.abort();
  };

  window.addEventListener('hashchange', syncView);
  syncView();
  symbol.addEventListener('change', loadStock);
  byId('stockForm').addEventListener('submit', (event) => {
    event.preventDefault();
    loadStock();
  });
});
