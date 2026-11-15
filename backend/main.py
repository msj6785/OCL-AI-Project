import html
import json
import os
import re
from threading import Lock
from time import monotonic

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


@app.get("/api/stocks/{symbol}")
def get_stock(symbol: str = Path(pattern=r"^[0-9A-Z]{6}$")):
    try:
        quotes = get_toss_market_data("prices", {"symbols": symbol})
        if not quotes:
            raise HTTPException(status_code=404, detail="Stock not found")

        candles = get_toss_market_data(
            "candles", {"symbol": symbol, "interval": "1d", "count": 30}
        )
        return {"symbol": symbol, "quote": quotes[0], "candles": candles["candles"]}
    except requests.HTTPError as exc:
        if exc.response.status_code == 429:
            raise HTTPException(status_code=503, detail="Toss API rate limit exceeded") from exc
        raise HTTPException(status_code=502, detail="Toss API request failed") from exc
    except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Toss API request failed") from exc
