from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import init_db

# Ensure tables are ready
init_db()

client = TestClient(app)


def test_create_and_get_web_resource():
    payload = {
        "title": "Lexical Analysis and Lexer Generator Tutorial",
        "url": "https://www.youtube.com/watch?v=sample123&t=215s",
        "source_type": "youtube",
        "category": "study",
        "notes": "Covers tokenization, finite automata, and regular expressions for compiler construction",
        "tags": "compiler-design,lexical-analysis,gate-cse",
        "remind_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "action": "Revise finite automata notes",
        "action_status": "Pending",
        "metadata_json": '{"youtube_timestamp": 215, "channel": "NPTEL Gate Prep"}',
    }

    res = client.post("/web-resources", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == payload["title"]
    assert data["source_type"] == "youtube"
    assert data["category"] == "study"
    assert data["action_status"] == "Pending"
    res_id = data["id"]

    # Retrieve single resource
    get_res = client.get(f"/web-resources/{res_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == res_id

    # List resources
    list_res = client.get("/web-resources?category=study")
    assert list_res.status_code == 200
    ids = [r["id"] for r in list_res.json()]
    assert res_id in ids


def test_semantic_search_for_compiler_design():
    # Insert another resource with related terminology
    resource_payload = {
        "title": "Parsing and Syntax Trees in Language Translators",
        "url": "https://ocw.mit.edu/courses/parsing-lecture",
        "source_type": "course",
        "category": "study",
        "notes": "Bottom-up LR parsing algorithms, shift-reduce conflicts, and AST creation",
        "tags": "parsing,grammar,ast",
    }
    client.post("/web-resources", json=resource_payload)

    # Search for "compiler design notes"
    # Even though "compiler design" is not in the exact title "Parsing and Syntax Trees in Language Translators",
    # the semantic concept expansion matches parsing, syntax trees, grammar to the compiler domain!
    search_payload = {
        "query": "compiler design notes",
        "category": "study",
    }
    search_res = client.post("/web-resources/search", json=search_payload)
    assert search_res.status_code == 200
    res_json = search_res.json()
    assert res_json["total_found"] >= 1

    matched_titles = [r["resource"]["title"] for r in res_json["results"]]
    # Both our compiler-related resources should be ranked prominently
    has_compiler_match = any("Lexical" in t or "Parsing" in t for t in matched_titles)
    assert has_compiler_match


def test_batch_sync_offline_resources():
    sync_payload = {
        "items": [
            {
                "title": "Operating Systems Virtual Memory and Paging",
                "url": "https://www.youtube.com/watch?v=os_paging_456",
                "source_type": "youtube",
                "category": "study",
                "notes": "Page replacement algorithms: FIFO vs LRU",
                "tags": "operating-systems,paging",
            }
        ]
    }
    res = client.post("/web-resources/sync", json=sync_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["synced_count"] >= 1
    assert len(data["created_ids"]) >= 1


def test_update_and_delete_resource():
    create_res = client.post(
        "/web-resources",
        json={
            "title": "Temporary Test Resource",
            "url": "https://example.com/test-resource",
            "category": "general",
        },
    )
    res_id = create_res.json()["id"]

    # Update
    update_res = client.put(
        f"/web-resources/{res_id}",
        json={"notes": "Updated notes for test", "action_status": "Completed"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["action_status"] == "Completed"

    # Delete
    del_res = client.delete(f"/web-resources/{res_id}")
    assert del_res.status_code == 204

    # Verify deleted
    get_res = client.get(f"/web-resources/{res_id}")
    assert get_res.status_code == 404
