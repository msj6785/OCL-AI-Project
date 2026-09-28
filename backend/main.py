import html
import os
import re

import requests
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="OCL-AI News API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

NAVER_NEWS_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news"


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", "", value or "")
    return html.unescape(value)


@app.get("/")
def root():
    return {"message": "OCL-AI News API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/news")
def get_news(
    query: str = Query(default="인공지능", min_length=1, max_length=100),
    display: int = Query(default=10, ge=1, le=100),
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
    params = {"query": query, "display": display, "sort": "date"}

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
