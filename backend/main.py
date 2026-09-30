import html
import json
import os
import re

import redis
import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="OCL-AI News API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
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
