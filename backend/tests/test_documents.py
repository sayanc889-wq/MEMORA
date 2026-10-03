import io
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_auth_token(email: str = "testuser@memora.app", password: str = "password123"):
    """Helper to register/login a test user and return JWT bearer auth headers."""
    # Attempt login first
    login_res = client.post("/auth/login", json={"email": email, "password": password})
    if login_res.status_code == 200:
        token = login_res.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    # Otherwise register
    reg_res = client.post(
        "/auth/register",
        json={"email": email, "password": password, "full_name": "Test User"},
    )
    if reg_res.status_code == 201:
        token = reg_res.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    # If demo
    demo_res = client.post("/auth/demo")
    return {"Authorization": f"Bearer {demo_res.json()['access_token']}"}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unauthenticated_access_denied():
    """Verify that unauthenticated requests to protected endpoints return 401 Unauthorized."""
    assert client.get("/documents").status_code == 401
    assert client.post("/documents/suggest-action", json={}).status_code == 401
    assert client.post("/assistant/ask", json={"query": "test"}).status_code == 401
    assert client.get("/life-events").status_code == 401
    assert client.get("/youtube-links").status_code == 401


def test_auth_register_and_login():
    """Test user registration, login, and /auth/me endpoint."""
    email = "newuser_test@memora.app"
    password = "secretpassword123"

    reg_res = client.post(
        "/auth/register",
        json={"email": email, "password": password, "full_name": "New User"},
    )
    # Could be 201 or 400 if already registered from previous run
    if reg_res.status_code == 201:
        data = reg_res.json()
        assert "access_token" in data
        assert data["user"]["email"] == email

    # Test login
    login_res = client.post("/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test /auth/me
    me_res = client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email


def test_list_documents_authenticated():
    headers = get_auth_token("doc_tester@memora.app")
    response = client.get("/documents", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_suggest_action_endpoint():
    headers = get_auth_token("suggest_tester@memora.app")
    payload = {
        "title": "Comprehensive Car Insurance Policy",
        "category": "personal",
        "file_name": "car_insurance_2026.pdf",
    }
    response = client.post("/documents/suggest-action", json=payload, headers=headers)
    assert response.status_code == 200
    res = response.json()
    assert "suggested_action" in res
    assert "renew" in res["suggested_action"].lower() or "insurance" in res["suggested_action"].lower()
    assert res["confidence"] > 0.8


def test_assistant_query():
    headers = get_auth_token("assistant_tester@memora.app")
    response = client.post(
        "/assistant/ask",
        json={"query": "What do I need to do this week?"},
        headers=headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert "matching_documents" in data


def test_create_document_and_user_isolation():
    """Verify that User A's uploaded documents are NOT visible to User B."""
    headers_user_a = get_auth_token("user_a@memora.app")
    headers_user_b = get_auth_token("user_b@memora.app")

    # User A uploads a document
    file_content = b"User A Confidential Tax Form 16"
    files = {"file": ("user_a_tax.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "title": "User A Tax Document",
        "category": "finance",
        "description": "User A secret document",
        "action": "File tax return before July 31",
        "is_important": "true",
    }
    res_a = client.post("/documents", data=data, files=files, headers=headers_user_a)
    assert res_a.status_code == 201
    doc_a = res_a.json()
    doc_a_id = doc_a["id"]

    # User A can list and find this document
    list_a = client.get("/documents", headers=headers_user_a).json()
    assert any(d["id"] == doc_a_id for d in list_a)

    # User B CANNOT see User A's document in their list
    list_b = client.get("/documents", headers=headers_user_b).json()
    assert not any(d["id"] == doc_a_id for d in list_b)

    # User B CANNOT get User A's document directly (404 Not Found)
    get_b = client.get(f"/documents/{doc_a_id}", headers=headers_user_b)
    assert get_b.status_code == 404

    # User B CANNOT update or delete User A's document
    patch_b = client.patch(
        f"/documents/{doc_a_id}/action-status",
        json={"action_status": "Completed"},
        headers=headers_user_b,
    )
    assert patch_b.status_code == 404

    # User A can update status to Completed
    patch_a = client.patch(
        f"/documents/{doc_a_id}/action-status",
        json={"action_status": "Completed"},
        headers=headers_user_a,
    )
    assert patch_a.status_code == 200
    assert patch_a.json()["action_status"] == "Completed"

    # User A deletes their document
    del_a = client.delete(f"/documents/{doc_a_id}", headers=headers_user_a)
    assert del_a.status_code == 204


def test_youtube_links_crud_and_isolation():
    """Verify YouTube links CRUD and multi-tenant isolation."""
    headers_user_a = get_auth_token("yt_user_a@memora.app")
    headers_user_b = get_auth_token("yt_user_b@memora.app")

    # User A adds a YouTube link
    yt_payload = {
        "title": "FastAPI Full Course 2026",
        "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "category": "study",
        "channel_name": "Tech Tutorials",
        "notes": "Great tutorial on building fullstack apps",
    }
    create_res = client.post("/youtube-links", json=yt_payload, headers=headers_user_a)
    assert create_res.status_code == 201
    link_id = create_res.json()["id"]

    # User A sees the link
    list_a = client.get("/youtube-links", headers=headers_user_a).json()
    assert any(l["id"] == link_id for l in list_a)

    # User B does NOT see User A's link
    list_b = client.get("/youtube-links", headers=headers_user_b).json()
    assert not any(l["id"] == link_id for l in list_b)

    # User A deletes the link
    del_res = client.delete(f"/youtube-links/{link_id}", headers=headers_user_a)
    assert del_res.status_code == 204


def test_life_events_and_graph_isolation():
    """Verify Life Events and visual Memory Graph are strictly isolated per user."""
    headers_user_a = get_auth_token("event_user_a@memora.app")
    headers_user_b = get_auth_token("event_user_b@memora.app")

    # User A creates a life event
    ev_res = client.post(
        "/life-events",
        json={
            "title": "Semester Final Exam 2026",
            "event_type": "Exam",
            "description": "User A Final Exams",
            "status": "Active",
        },
        headers=headers_user_a,
    )
    assert ev_res.status_code == 201
    event_id = ev_res.json()["id"]

    # User A sees the event in their list
    list_a = client.get("/life-events", headers=headers_user_a).json()
    assert any(e["id"] == event_id for e in list_a)

    # User B does NOT see User A's event
    list_b = client.get("/life-events", headers=headers_user_b).json()
    assert not any(e["id"] == event_id for e in list_b)

    # User A graph contains their event
    graph_a = client.get("/graph/data", headers=headers_user_a).json()
    assert any(n.get("id") == f"event_{event_id}" for n in graph_a["nodes"])

    # User B graph does NOT contain User A's event
    graph_b = client.get("/graph/data", headers=headers_user_b).json()
    assert not any(n.get("id") == f"event_{event_id}" for n in graph_b["nodes"])

    # User B cannot delete User A's event
    del_b = client.delete(f"/life-events/{event_id}", headers=headers_user_b)
    assert del_b.status_code == 404

    # User A deletes their event
    del_a = client.delete(f"/life-events/{event_id}", headers=headers_user_a)
    assert del_a.status_code == 204

