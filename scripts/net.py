"""Network helpers: centralize requests session with retry/backoff.

Provides get_session() and post_json() used by other scripts to make resilient HTTP calls.
"""
from typing import Any, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def get_session(retries: int = 3, backoff_factor: float = 1.0) -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=backoff_factor,
        status_forcelist=(500, 502, 503, 504),
        allowed_methods=("GET", "POST"),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def post_json(
    url: str,
    payload: Any,
    timeout: int = 120,
    session: Optional[requests.Session] = None,
) -> Any:
    """POST JSON payload and return parsed JSON. Raises on HTTP errors."""
    s = session or get_session()
    resp = s.post(url, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()
