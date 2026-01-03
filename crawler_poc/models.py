from dataclasses import dataclass
from typing import Optional, Dict, Any

@dataclass
class Task:
    task_id: str
    url: str
    priority: int = 10
    fetch_tier: str = "auto"  # auto | api | http | headless
    capture_network: bool = False
    logical_target: Optional[Dict[str, Any]] = None

@dataclass
class FetchResult:
    task_id: str
    url: str
    status_code: int
    content_type: str
    body_path: str
    headers: Dict[str, Any]
    fetch_tier: str
    network_trace_path: Optional[str]
    fetched_at: str

@dataclass
class LearningObject:
    logical_id: str
    type: str  # Course|Module|Page|Quiz|Assignment|Media
    title: str
    course_id: Optional[str]
    module_id: Optional[str]
    content_refs: Optional[list]
    extracted_at: str
    version_meta: Dict[str, Any]
