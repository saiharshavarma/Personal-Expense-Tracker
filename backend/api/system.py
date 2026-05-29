import os
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_current_user


router = APIRouter(tags=["system"])

UPDATER_URL = os.environ.get("UPDATER_URL", "http://updater:8010").rstrip("/")


async def _proxy(method: str, path: str) -> Any:
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.request(method, f"{UPDATER_URL}{path}")
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Updater service is unavailable: {exc}",
        )

    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json().get("detail", detail)
        except ValueError:
            pass
        raise HTTPException(status_code=response.status_code, detail=detail)

    return response.json()


@router.get("/update/status")
async def update_status(_user=Depends(get_current_user)):
    return await _proxy("GET", "/update/status")


@router.post("/update")
async def start_update(_user=Depends(get_current_user)):
    return await _proxy("POST", "/update")


@router.get("/update/job")
async def update_job(_user=Depends(get_current_user)):
    return await _proxy("GET", "/update/job")
