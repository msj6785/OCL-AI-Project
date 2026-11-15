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
    hourCycle: 'h23'
  }).formatToParts(date);

  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}시 ${value('minute')}분`;
};

document.addEventListener('DOMContentLoaded', () => {
  const title = document.getElementById('pageTitle');
  const description = document.getElementById('pageDescription');
  const breadcrumb = document.getElementById('breadcrumbCase');
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

  const todayGrid = document.getElementById('todayNewsGrid');
  const todayTopics = ['경제', '증시', 'AI', '반도체'];
  const seoulDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', dateStyle: 'short' });
  const seoulTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  let loadedNewsDay;

  const renderTodayTopic = async (topic, day, list) => {
    try {
      const params = new URLSearchParams({ query: topic, display: '10' });
      const response = await fetch(`/api/news?${params}`);
      if (!response.ok) throw new Error('News lookup failed');
      const { items } = await response.json();
      const articles = new Set();
      list.replaceChildren();
      for (const item of items) {
        const published = new Date(item.pubDate);
        if (Number.isNaN(published.getTime()) || seoulDay.format(published) !== day) continue;
        let url;
        try {
          url = new URL(item.link || item.originallink);
        } catch {
          continue;
        }
        if (!['http:', 'https:'].includes(url.protocol) || articles.has(url.href)) continue;
        articles.add(url.href);
        const row = document.createElement('li');
        const link = document.createElement('a');
        link.textContent = item.title || '제목 없음';
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.dataset.title = link.textContent;
        link.dataset.link = url.href;
        link.dataset.publishedAt = item.pubDate;
        const time = document.createElement('time');
        time.dateTime = published.toISOString();
        time.textContent = seoulTime.format(published);
        row.append(link, time);
        list.append(row);
        if (articles.size === 2) break;
      }
      if (!list.children.length) {
        const empty = document.createElement('li');
        empty.className = 'today-news-state';
        empty.textContent = '오늘 발행된 기사가 없습니다.';
        list.append(empty);
      }
    } catch {
      const failure = document.createElement('li');
      failure.className = 'today-news-state';
      failure.textContent = '기사를 불러오지 못했습니다.';
      list.replaceChildren(failure);
    }
  };

  const loadTodayNews = async () => {
    if (location.hash === '#stockPanel') return;
    const day = seoulDay.format(new Date());
    if (loadedNewsDay === day) return;
    loadedNewsDay = day;
    todayGrid.setAttribute('aria-busy', 'true');
    todayGrid.replaceChildren();
    await Promise.all(todayTopics.map((topic) => {
      const card = document.createElement('article');
      const heading = document.createElement('h3');
      heading.textContent = topic;
      const list = document.createElement('ul');
      const loading = document.createElement('li');
      loading.className = 'today-news-state';
      loading.textContent = '기사를 불러오는 중…';
      list.append(loading);
      card.append(heading, list);
      todayGrid.append(card);
      return renderTodayTopic(topic, day, list);
    }));
    if (loadedNewsDay === day) todayGrid.setAttribute('aria-busy', 'false');
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
      showToast(`${query} ${currentPage}페이지 기사 ${items.length}건을 불러왔습니다.`);
    } catch (error) {
      console.error(error);
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
  document.addEventListener('click', (event) => {
    const articleLink = event.target.closest('#timeline .detail-button, #stockNewsList a[data-link], #todayNewsGrid a[data-link]');
    if (!articleLink) return;

    saveRecentNews({
      title: articleLink.dataset.title,
      link: articleLink.dataset.link,
      published: articleLink.dataset.publishedAt
        ? formatPublishedDate(articleLink.dataset.publishedAt)
        : articleLink.dataset.published
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
  loadTodayNews();
  window.addEventListener('hashchange', loadTodayNews);
  window.addEventListener('focus', loadTodayNews);
  if (location.hash !== "#stockPanel") searchInput.focus({ preventScroll: true });
});

document.addEventListener('DOMContentLoaded', () => {
  const byId = (id) => document.getElementById(id);
  const newsButton = byId('showNews');
  const stocksButton = byId('showStocks');
  const quote = byId('stockQuote');
  const chart = byId('stockChart');
  const canvas = byId('stockCanvas');
  const pointLabel = byId('stockPoint');
  const pagination = byId('stockPagination');
  const previousPage = byId('stockPrev');
  const nextPage = byId('stockNext');
  const newsList = byId('stockNewsList');
  const status = byId('stockStatus');
  const newsStatus = byId('stockNewsStatus');
  const periodButtons = [...byId('stockPeriods').querySelectorAll('button')];
  const searchStatus = byId('stockSearchStatus');
  const searchResults = byId('stockSearchResults');
  const number = new Intl.NumberFormat('ko-KR');
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short' });
  const dateTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short', hour12: false
  });
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const favoriteKey = 'ocl-ai-stock-favorites';
  const favoriteToggle = byId('stockFavoriteToggle');
  const favoriteList = byId('stockFavoritesList');
  const favoriteStatus = byId('stockFavoritesStatus');
  let favorites = [];
  try {
    const stored = JSON.parse(localStorage.getItem(favoriteKey));
    if (Array.isArray(stored)) {
      favorites = stored.filter((item) => item && /^[0-9A-Z]{6}$/.test(item.symbol)
        && typeof item.name === 'string' && item.name.trim());
    }
  } catch {
    // Keep the stock view usable when browser storage is unavailable.
  }
  let selectedStock = { symbol: '005930', name: '삼성전자' };
  let period = '1mo';
  let activeView;
  let priceRequest;
  let newsRequest;
  let searchRequest;
  let points = [];
  let selectedPoint = null;
  let searchQuery = '';
  let searchPage = 1;

  const loadJson = async (url, signal) => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  };

  const drawChart = () => {
    if (!points.length || chart.hidden) {
      pointLabel.hidden = true;
      return;
    }
    const context = canvas.getContext('2d');
    const width = canvas.clientWidth;
    const height = 250;
    if (!width || !context) return;
    const density = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * density);
    canvas.height = height * density;
    context.scale(density, density);

    const prices = points.map(({ price }) => price);
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const padding = Math.max(Math.ceil((high - low) * 0.08), 4);
    const bottom = Math.max(0, low - padding);
    const top = high + padding;
    const left = Math.min(76, width / 3);
    const right = width - 12;
    const plotHeight = height - 48;
    const x = (index) => points.length === 1 ? (left + right) / 2 :
      left + index * (right - left) / (points.length - 1);
    const y = (price) => 12 + (top - price) * plotHeight / (top - bottom);

    context.font = '11px sans-serif';
    context.fillStyle = '#455763';
    context.textAlign = 'right';
    for (let step = 0; step <= 4; step++) {
      const price = top - step * (top - bottom) / 4;
      const line = y(price);
      context.strokeStyle = '#e3e8e6';
      context.beginPath();
      context.moveTo(left, line);
      context.lineTo(right, line);
      context.stroke();
      context.fillText(number.format(Math.round(price)), left - 7, line + 4, left - 9);
    }

    const ticks = [...new Set([0, Math.round((points.length - 1) / 2), points.length - 1])];
    const axisFormat = period === '1d' ? time : date;
    ticks.forEach((index) => {
      context.textAlign = index === 0 ? 'left' : index === points.length - 1 ? 'right' : 'center';
      context.fillText(axisFormat.format(points[index].time), x(index), height - 12);
    });

    const movement = points.at(-1).price - points[0].price;
    const lineColor = movement > 0 ? '#d32f39' : movement < 0 ? '#2563c5' : '#63757c';
    const area = context.createLinearGradient(0, 12, 0, 12 + plotHeight);
    area.addColorStop(0, `${lineColor}35`);
    area.addColorStop(1, `${lineColor}00`);

    context.strokeStyle = lineColor;
    context.lineWidth = 2;
    context.beginPath();
    points.forEach(({ price }, index) => {
      if (index === 0) context.moveTo(x(index), y(price));
      else context.lineTo(x(index), y(price));
    });
    context.stroke();
    context.lineTo(x(points.length - 1), 12 + plotHeight);
    context.lineTo(x(0), 12 + plotHeight);
    context.closePath();
    context.fillStyle = area;
    context.fill();

    const trend = movement > 0 ? '상승' : movement < 0 ? '하락' : '보합';
    canvas.setAttribute('aria-label', `${selectedStock.name} 차트. 선택 기간 ${trend}. 가격 범위 ${number.format(low)}원에서 ${number.format(high)}원. 방향키로 날짜별 가격 확인.`);
    pointLabel.hidden = selectedPoint === null;
    if (selectedPoint === null) return;

    const point = points[selectedPoint];
    const pointX = x(selectedPoint);
    const pointY = y(point.price);
    context.strokeStyle = '#aebcc0';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(pointX, 12);
    context.lineTo(pointX, 12 + plotHeight);
    context.stroke();
    context.fillStyle = lineColor;
    context.beginPath();
    context.arc(pointX, pointY, 4, 0, Math.PI * 2);
    context.fill();

    const formatter = ['1d', '3d'].includes(period) ? dateTime : date;
    pointLabel.textContent = `${formatter.format(point.time)} · ${number.format(point.price)}원`;
    const labelWidth = pointLabel.offsetWidth;
    const labelLeft = Math.max(0, Math.min(width - labelWidth, pointX - labelWidth / 2));
    const labelTop = pointY > 44 ? pointY - pointLabel.offsetHeight - 10 : pointY + 10;
    pointLabel.style.left = `${labelLeft}px`;
    pointLabel.style.top = `${labelTop}px`;
  };

  const showChart = (candles) => {
    points = candles
      .filter((candle) => candle.closePrice != null)
      .map((candle) => ({ time: Date.parse(candle.timestamp), price: Number(candle.closePrice) }))
      .filter(({ time, price }) => Number.isFinite(time) && Number.isFinite(price))
      .sort((a, b) => a.time - b.time);
    chart.hidden = points.length === 0;
    if (chart.hidden) return;

    const label = periodButtons.find((button) => button.dataset.period === period).textContent;
    const interval = ['1d', '3d'].includes(period) ? '1분봉' : '일봉';
    byId('stockChartTitle').textContent = `${label} 주가 · ${interval}`;
    byId('stockChartRange').textContent = `${date.format(points[0].time)} ~ ${date.format(points.at(-1).time)} · 가격 단위 원`;
    selectedPoint = null;
    drawChart();
  };

  const loadPrices = async () => {
    priceRequest?.abort();
    priceRequest = new AbortController();
    const { signal } = priceRequest;
    quote.hidden = true;
    chart.hidden = true;
    status.textContent = `${selectedStock.name} 시세 조회 중…`;
    try {
      const code = selectedStock.symbol;
      const data = await loadJson(`/api/stocks/${code}?period=${period}`, signal);
      if (signal.aborted) return;
      byId('stockName').textContent = selectedStock.name;
      const price = Number(data.quote.lastPrice);
      byId('stockPrice').textContent = `${number.format(price)}원`;
      byId('stockTime').textContent = `시세 기준 ${dateTime.format(new Date(data.quote.timestamp))}`;
      const previous = Number(data.previousClose);
      const change = (price / previous - 1) * 100;
      const changeLabel = byId('stockChange');
      changeLabel.textContent = previous > 0 && Number.isFinite(change)
        ? `전 거래일 대비 ${change > 0 ? '+' : ''}${change.toFixed(2)}%` : '';
      changeLabel.dataset.direction = change > 0 ? 'up' : change < 0 ? 'down' : '';
      quote.hidden = false;
      showChart(data.candles);
      status.textContent = chart.hidden ? '선택한 기간의 차트 데이터가 없습니다.' : '';
    } catch (error) {
      if (signal.aborted) return;
      status.textContent = error.message === '404'
        ? '토스증권에서 이 종목의 시세를 찾지 못했습니다.'
        : '시세를 불러오지 못했습니다. 기간 버튼을 다시 누르면 재시도합니다.';
    }
  };

  const loadNews = async () => {
    newsRequest?.abort();
    newsRequest = new AbortController();
    const { signal } = newsRequest;
    const params = new URLSearchParams({ query: selectedStock.name, display: '5' });
    newsList.replaceChildren();
    newsStatus.textContent = '관련 뉴스 조회 중…';
    try {
      const { items } = await loadJson(`/api/news?${params}`, signal);
      if (signal.aborted) return;
      for (const item of items) {
        let url;
        try {
          url = new URL(item.originallink || item.link);
        } catch {
          continue;
        }
        if (!['https:', 'http:'].includes(url.protocol)) continue;
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.title;
        link.dataset.title = item.title || '';
        link.dataset.link = url.href;
        link.dataset.publishedAt = item.pubDate || '';

        const published = new Date(item.pubDate || '');
        const hasPublishedDate = !Number.isNaN(published.getTime());
        const dateLabel = document.createElement(hasPublishedDate ? 'time' : 'span');
        dateLabel.className = 'stock-news-published';
        if (hasPublishedDate) dateLabel.dateTime = published.toISOString();
        dateLabel.textContent = formatPublishedDate(published);
        li.append(link, dateLabel);
        newsList.append(li);
      }
      newsStatus.textContent = newsList.children.length ? '' : '관련 뉴스가 없습니다.';
    } catch {
      if (!signal.aborted) newsStatus.textContent = '관련 뉴스를 불러오지 못했습니다.';
    }
  };

  const renderFavorites = () => {
    const isFavorite = favorites.some(({ symbol }) => symbol === selectedStock.symbol);
    favoriteToggle.setAttribute('aria-pressed', String(isFavorite));
    favoriteToggle.textContent = isFavorite ? '★' : '☆';
    favoriteToggle.setAttribute('aria-label', `${selectedStock.name} 즐겨찾기`);
    favoriteToggle.title = isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가';
    byId('stockFavoritesEmpty').hidden = favorites.length > 0;
    favoriteList.replaceChildren();
    for (const stock of favorites) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = stock.name;
      if (stock.symbol === selectedStock.symbol) button.setAttribute('aria-current', 'true');
      button.addEventListener('click', () => selectStock(stock, true));
      li.append(button);
      favoriteList.append(li);
    }
  };

  const selectStock = (stock, fromFavorites = false) => {
    searchRequest?.abort();
    selectedStock = stock;
    const input = byId('stockSearch');
    input.value = stock.name;
    searchResults.replaceChildren();
    pagination.hidden = true;
    searchStatus.textContent = '';
    favoriteStatus.textContent = '';
    renderFavorites();
    if (fromFavorites) favoriteList.querySelector('[aria-current]')?.focus({ preventScroll: true });
    else input.focus({ preventScroll: true });
    if (location.hash !== '#stockPanel') {
      location.hash = 'stockPanel';
      return;
    }
    loadPrices();
    loadNews();
  };

  favoriteToggle.addEventListener('click', () => {
    const isFavorite = favorites.some(({ symbol }) => symbol === selectedStock.symbol);
    const next = isFavorite
      ? favorites.filter(({ symbol }) => symbol !== selectedStock.symbol)
      : [...favorites, { symbol: selectedStock.symbol, name: selectedStock.name }];
    try {
      localStorage.setItem(favoriteKey, JSON.stringify(next));
      favorites = next;
      favoriteStatus.textContent = '';
      renderFavorites();
    } catch {
      favoriteStatus.textContent = '브라우저에 즐겨찾기를 저장하지 못했습니다.';
    }
  });
  renderFavorites();

  const listStocks = async (query, page = 1) => {
    searchRequest?.abort();
    searchRequest = new AbortController();
    const { signal } = searchRequest;
    const input = byId('stockSearch');
    searchResults.replaceChildren();
    pagination.hidden = true;
    searchStatus.textContent = '종목 검색 중…';
    try {
      const params = new URLSearchParams({ q: query, page });
      const { items, total, pageSize } = await loadJson(`/api/stocks/search?${params}`, signal);
      if (signal.aborted) return;
      searchQuery = query;
      searchPage = page;
      for (const item of items) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.name;
        button.addEventListener('click', () => selectStock(item));
        li.append(button);
        searchResults.append(li);
      }
      if (!total) {
        searchStatus.textContent = '일치하는 종목이 없습니다.';
        return;
      }
      const pageCount = Math.ceil(total / pageSize);
      searchStatus.textContent = `${query ? '검색 결과' : '코스피·코스닥 목록'} ${number.format(total)}개`;
      byId('stockPage').textContent = `${page} / ${pageCount}`;
      previousPage.disabled = page <= 1;
      nextPage.disabled = page >= pageCount;
      pagination.hidden = pageCount <= 1;
    } catch {
      if (!signal.aborted) searchStatus.textContent = '종목 검색을 완료하지 못했습니다. 다시 시도하세요.';
    }
  };

  byId('stockForm').addEventListener('submit', (event) => {
    event.preventDefault();
    listStocks(byId('stockSearch').value.trim());
  });
  byId('browseStocks').addEventListener('click', () => {
    byId('stockSearch').value = '';
    listStocks('');
  });
  previousPage.addEventListener('click', () => listStocks(searchQuery, searchPage - 1));
  nextPage.addEventListener('click', () => listStocks(searchQuery, searchPage + 1));

  periodButtons.forEach((button) => {
    button.addEventListener('click', () => {
      period = button.dataset.period;
      periodButtons.forEach((entry) => entry.setAttribute('aria-pressed', String(entry === button)));
      loadPrices();
    });
  });
  const selectPoint = (index) => {
    if (selectedPoint === index) return;
    selectedPoint = index;
    drawChart();
  };

  const pointAtPointer = (event) => {
    if (!points.length) return;
    const { left, width } = canvas.getBoundingClientRect();
    const start = Math.min(76, width / 3);
    const plotWidth = width - start - 12;
    if (plotWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - left - start) / plotWidth));
    selectPoint(Math.round(ratio * (points.length - 1)));
  };

  window.addEventListener('resize', drawChart);
  canvas.addEventListener('pointermove', pointAtPointer);
  canvas.addEventListener('pointerdown', pointAtPointer);
  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch') selectPoint(null);
  });
  canvas.addEventListener('blur', () => selectPoint(null));
  canvas.addEventListener('keydown', (event) => {
    if (!points.length || !['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') {
      selectPoint(null);
      return;
    }
    const index = selectedPoint === null ? points.length - 1 :
      Math.max(0, Math.min(points.length - 1, selectedPoint + (event.key === 'ArrowRight' ? 1 : -1)));
    selectPoint(index);
  });

  const syncView = () => {
    const view = location.hash === '#stockPanel' ? 'stocks' : 'news';
    if (activeView === view) return;
    activeView = view;
    const showingStocks = view === 'stocks';
    const selected = showingStocks ? stocksButton : newsButton;
    const inactive = showingStocks ? newsButton : stocksButton;
    selected.setAttribute('aria-current', 'page');
    inactive.removeAttribute('aria-current');
    if (showingStocks) {
      loadPrices();
      loadNews();
    } else {
      priceRequest?.abort();
      newsRequest?.abort();
      searchRequest?.abort();
      if (!searchResults.children.length) searchStatus.textContent = '';
    }
  };

  const mobile = window.matchMedia('(max-width: 640px)');
  const placeFavorites = () => {
    const slot = byId(mobile.matches ? 'mobileStockFavorites' : 'sidebarStockFavorites');
    slot.append(byId('stockFavorites'));
  };
  mobile.addEventListener('change', placeFavorites);
  placeFavorites();

  window.addEventListener('hashchange', syncView);
  syncView();
});

document.addEventListener('DOMContentLoaded', () => {
  const byId = (id) => document.getElementById(id);
  const toggle = byId('marketChatToggle');
  const panel = byId('marketChatPanel');
  const form = byId('marketChatForm');
  const input = byId('marketChatQuery');
  const send = byId('marketChatSend');
  const log = byId('marketChatLog');
  const transcript = byId('marketChatTranscript');
  const status = byId('marketChatStatus');
  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else toggle.focus();
  };

  const renderMessage = (text, user = false) => {
    const message = document.createElement('p');
    message.className = user ? 'market-chat-message user' : 'market-chat-message';
    message.textContent = text;
    log.append(message);
    transcript.scrollTop = transcript.scrollHeight;
  };

  const renderSources = (sources) => {
    const list = document.createElement('ol');
    list.className = 'market-chat-sources';
    sources.forEach(({ url, title }, index) => {
      let parsed;
      try { parsed = new URL(url); } catch { return; }
      if (!['https:', 'http:'].includes(parsed.protocol)) return;
      const item = document.createElement('li');
      item.value = index + 1;
      const link = document.createElement('a');
      link.href = parsed.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = title;
      item.append(link);
      list.append(item);
    });
    if (list.children.length) log.append(list);
    transcript.scrollTop = transcript.scrollHeight;
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  byId('marketChatClose').addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (send.disabled) return;
    const query = input.value.trim();
    if (!query) {
      status.textContent = '질문을 입력하세요.';
      input.focus();
      return;
    }

    renderMessage(query, true);
    input.value = '';
    send.disabled = true;
    status.textContent = '뉴스와 시세 데이터를 확인하는 중…';
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const result = await response.json();
      if (!response.ok) {
        status.textContent = result.detail === 'Chat API key is missing'
          ? '챗봇 API 키 설정이 필요합니다.'
          : result.detail === 'No matching stock'
            ? '일치하는 종목이 없습니다. 종목명을 확인해 주세요.'
            : '답변을 가져오지 못했습니다. 다시 시도해 주세요.';
        return;
      }
      renderMessage(result.answer);
      renderSources(result.sources);
      status.textContent = '';
    } catch {
      status.textContent = '챗봇에 연결하지 못했습니다. 다시 시도해 주세요.';
    } finally {
      send.disabled = false;
    }
  });
});
