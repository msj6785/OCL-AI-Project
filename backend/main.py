import html
import json
import os
import re
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from threading import Lock
from time import monotonic
from typing import Literal
from zipfile import BadZipFile, ZipFile

import redis
import requests
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="OCL-AI News API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

NAVER_NEWS_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news"
REDIS_HOST = os.getenv("REDIS_HOST", "redis-service")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
MAX_RECENT_NEWS = 5

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    decode_responses=True,
    socket_connect_timeout=2,
    socket_timeout=2,
)


class RecentNewsRequest(BaseModel):
    client_id: str
    title: str
    link: str
    published: str = ""


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value or "")
    return html.unescape(value)


def recent_news_key(client_id: str) -> str:
    client_id = client_id.strip()
    if not client_id or len(client_id) > 100:
        raise HTTPException(status_code=400, detail="Invalid client_id")
    return f"recent_news:{client_id}"


def load_recent_news(key: str) -> list[dict]:
    try:
        rows = redis_client.lrange(key, 0, MAX_RECENT_NEWS - 1)
        items = []
        for row in rows:
            try:
                items.append(json.loads(row))
            except json.JSONDecodeError:
                continue
        return items
    except redis.RedisError as exc:
        raise HTTPException(status_code=503, detail="Redis is unavailable") from exc


@app.get("/")
def root():
    return {"message": "OCL-AI News API is running"}


@app.get("/health")
def health():
    redis_status = "ok"
    try:
        redis_client.ping()
    except redis.RedisError:
        redis_status = "unavailable"
    return {"status": "ok", "redis": redis_status}


@app.get("/api/news")
def get_news(
    query: str = Query(default="인공지능", min_length=1, max_length=100),
    display: int = Query(default=10, ge=1, le=100),
    start: int = Query(default=1, ge=1, le=1000),
):
    client_id = os.getenv("NAVER_CLIENT_ID")
    client_secret = os.getenv("NAVER_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=500,
            detail="NAVER_CLIENT_ID or NAVER_CLIENT_SECRET is not configured",
        )

    headers = {
        "X-NCP-APIGW-API-KEY-ID": client_id,
        "X-NCP-APIGW-API-KEY": client_secret,
    }
    params = {"query": query, "display": display, "start": start, "sort": "date"}

    try:
        response = requests.get(
            NAVER_NEWS_URL,
            headers=headers,
            params=params,
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch news from NAVER API",
        ) from exc

    data = response.json()
    items = [
        {
            "title": clean_text(item.get("title", "")),
            "description": clean_text(item.get("description", "")),
            "link": item.get("link", ""),
            "originallink": item.get("originallink", ""),
            "pubDate": item.get("pubDate", ""),
        }
        for item in data.get("items", [])
    ]

    return {
        "query": query,
        "total": data.get("total", 0),
        "start": data.get("start", 1),
        "display": len(items),
        "items": items,
    }


@app.get("/api/recent-news")
def get_recent_news(
    client_id: str = Query(min_length=1, max_length=100),
):
    key = recent_news_key(client_id)
    return {"items": load_recent_news(key)}


@app.post("/api/recent-news")
def save_recent_news(payload: RecentNewsRequest):
    key = recent_news_key(payload.client_id)

    if not payload.link or payload.link == "#":
        raise HTTPException(status_code=400, detail="Invalid news link")

    item = {
        "title": payload.title or "제목 없음",
        "link": payload.link,
        "published": payload.published,
    }

    try:
        current = load_recent_news(key)
        updated = [item] + [
            saved for saved in current
            if saved.get("link") != payload.link
        ]
        updated = updated[:MAX_RECENT_NEWS]

        pipe = redis_client.pipeline()
        pipe.delete(key)
        if updated:
            pipe.rpush(key, *[json.dumps(news, ensure_ascii=False) for news in updated])
        pipe.execute()
    except redis.RedisError as exc:
        raise HTTPException(status_code=503, detail="Redis is unavailable") from exc

    return {"items": updated}


@app.delete("/api/recent-news")
def delete_recent_news(
    client_id: str = Query(min_length=1, max_length=100),
    link: str | None = Query(default=None),
):
    key = recent_news_key(client_id)

    try:
        if not link:
            redis_client.delete(key)
            return {"items": []}

        current = load_recent_news(key)
        updated = [
            saved for saved in current
            if saved.get("link") != link
        ]

        pipe = redis_client.pipeline()
        pipe.delete(key)
        if updated:
            pipe.rpush(
                key,
                *[json.dumps(news, ensure_ascii=False) for news in updated],
            )
        pipe.execute()
    except redis.RedisError as exc:
        raise HTTPException(status_code=503, detail="Redis is unavailable") from exc

    return {"items": updated}


TOSS_API_URL = "https://openapi.tossinvest.com"
toss_token_lock = Lock()
toss_token = None
toss_token_expiry = 0.0


def get_toss_token(rejected_token: str | None = None) -> str:
    global toss_token, toss_token_expiry

    with toss_token_lock:
        if toss_token and toss_token != rejected_token and monotonic() < toss_token_expiry:
            return toss_token

        client_id = os.getenv("TOSS_CLIENT_ID")
        client_secret = os.getenv("TOSS_CLIENT_SECRET")
        if not client_id or not client_secret:
            raise HTTPException(status_code=503, detail="Toss API credentials are missing")

        requested_at = monotonic()
        response = requests.post(
            f"{TOSS_API_URL}/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
            },
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        toss_token_expiry = requested_at + max(0, int(data["expires_in"]) - 30)
        toss_token = data["access_token"]
        return toss_token


def get_toss_market_data(path: str, params: dict):
    token = get_toss_token()
    url = f"{TOSS_API_URL}/api/v1/{path}"
    response = requests.get(
        url, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=10
    )
    if response.status_code == 401:
        token = get_toss_token(rejected_token=token)
        response = requests.get(
            url, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=10
        )
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Stock not found")
    response.raise_for_status()
    return response.json()["result"]


STOCK_MASTERS = {"KOSPI": 228, "KOSDAQ": 222}
STOCK_MASTER_URL = "https://new.real.download.dws.co.kr/common/master"
stock_catalog_lock = Lock()
stock_catalog = []
stock_catalog_expires = 0.0
SEOUL = timezone(timedelta(hours=9))
INTRADAY_TRADING_DAYS = {"1d": 1, "3d": 3}
DAILY_RANGE_MONTHS = {"1mo": 1, "1y": 12, "3y": 36}


def load_stock_catalog() -> list[dict]:
    global stock_catalog, stock_catalog_expires

    with stock_catalog_lock:
        if monotonic() < stock_catalog_expires:
            return stock_catalog

        items = []
        try:
            for market, tail_length in STOCK_MASTERS.items():
                filename = f"{market.lower()}_code.mst"
                response = requests.get(f"{STOCK_MASTER_URL}/{filename}.zip", timeout=8)
                response.raise_for_status()
                with ZipFile(BytesIO(response.content)) as archive:
                    lines = archive.read(filename).decode("cp949").splitlines()
                for line in lines:
                    code = line[:9].strip()
                    name = line[21:-tail_length].strip()
                    if re.fullmatch(r"[0-9A-Z]{6}", code) and name:
                        items.append({"symbol": code, "name": name, "market": market})
                if not any(item["market"] == market for item in items):
                    raise ValueError(f"Empty {market} master file")
        except (requests.RequestException, BadZipFile, KeyError, ValueError) as exc:
            if stock_catalog:
                stock_catalog_expires = monotonic() + 300
                return stock_catalog
            raise HTTPException(status_code=503, detail="Stock catalog is unavailable") from exc

        stock_catalog = items
        stock_catalog_expires = monotonic() + 86400
        return stock_catalog


@app.get("/api/stocks/search")
def search_stocks(q: str = Query(min_length=1, max_length=40)):
    query = "".join(q.casefold().split())
    if not query:
        return {"items": []}

    matches = []
    for item in load_stock_catalog():
        name = "".join(item["name"].casefold().split())
        symbol = item["symbol"].casefold()
        if query in (name, symbol):
            matches.append((0, item))
        elif name.startswith(query) or symbol.startswith(query):
            matches.append((1, item))
        elif query in name:
            matches.append((2, item))

    matches.sort(key=lambda match: (match[0], len(match[1]["name"]), match[1]["name"]))
    return {"items": [item for _, item in matches[:20]]}


def candle_day(candle: dict) -> date:
    return datetime.fromisoformat(candle["timestamp"]).astimezone(SEOUL).date()


def daily_cutoff(latest: date, period: str) -> date:
    if period == "1w":
        return latest - timedelta(days=6)

    months = latest.year * 12 + latest.month - 1 - DAILY_RANGE_MONTHS[period]
    year, month_index = divmod(months, 12)
    month = month_index + 1
    return date(year, month, min(latest.day, monthrange(year, month)[1]))


def load_stock_candles(symbol: str, period: str | None) -> list[dict]:
    if period is None:
        result = get_toss_market_data("candles", {"symbol": symbol, "interval": "1d", "count": 30})
        return result["candles"]

    intraday_days = INTRADAY_TRADING_DAYS.get(period)
    interval = "1m" if intraday_days else "1d"
    max_pages = (intraday_days * 1440 + 198) // 199 + 1 if intraday_days else 6
    count = {"1w": 10, "1mo": 40}.get(period, 200)
    params = {"symbol": symbol, "interval": interval, "count": count}
    points = {}
    days = set()
    cutoff = None
    seen_cursors = set()

    for _ in range(max_pages):
        result = get_toss_market_data("candles", params)
        for candle in result["candles"]:
            day = candle_day(candle)
            if intraday_days:
                if day not in days and len(days) == intraday_days:
                    return list(points.values())
                days.add(day)
            else:
                if cutoff is None:
                    cutoff = daily_cutoff(day, period)
                if day < cutoff:
                    return list(points.values())
            points.setdefault(candle["timestamp"], candle)

        cursor = result.get("nextBefore")
        if not result["candles"] or not cursor or cursor in seen_cursors:
            break
        seen_cursors.add(cursor)
        params["before"] = cursor

    return list(points.values())


@app.get("/api/stocks/{symbol}")
def get_stock(
    symbol: str = Path(pattern=r"^[0-9A-Z]{6}$"),
    period: Literal["1d", "3d", "1w", "1mo", "1y", "3y"] | None = None,
):
    try:
        quotes = get_toss_market_data("prices", {"symbols": symbol})
        if not quotes:
            raise HTTPException(status_code=404, detail="Stock not found")

        candles = load_stock_candles(symbol, period)
        quote = quotes[0]
        previous_close = None
        if period is not None:
            daily = candles
            if period in INTRADAY_TRADING_DAYS:
                daily = get_toss_market_data(
                    "candles", {"symbol": symbol, "interval": "1d", "count": 3}
                )["candles"]
            quote_day = candle_day(quote)
            previous_close = next(
                (candle["closePrice"] for candle in daily if candle_day(candle) < quote_day),
                None,
            )
        data = {"symbol": symbol, "quote": quote, "candles": candles}
        if period is not None:
            data["previousClose"] = previous_close
        return data
    except requests.HTTPError as exc:
        if exc.response.status_code == 429:
            raise HTTPException(status_code=503, detail="Toss API rate limit exceeded") from exc
        raise HTTPException(status_code=502, detail="Toss API request failed") from exc
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Toss API request failed") from exc
