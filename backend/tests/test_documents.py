import io
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_existing_documents():
    response = client.get("/documents")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Verify the 3 existing documents are present
    assert len(data) >= 3


def test_suggest_action_endpoint():
    payload = {
        "title": "Comprehensive Car Insurance Policy",
        "category": "personal",
        "file_name": "car_insurance_2026.pdf",
    }
    response = client.post("/documents/suggest-action", json=payload)
    assert response.status_code == 200
    res = response.json()
    assert "suggested_action" in res
    assert "renew" in res["suggested_action"].lower() or "insurance" in res["suggested_action"].lower()
    assert res["confidence"] > 0.8


def test_assistant_query():
    response = client.post("/assistant/ask", json={"query": "What do I need to do this week?"})
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert "matching_documents" in data


def test_create_document_with_action():
    # Use a dummy file upload
    file_content = b"Sample document content for test"
    files = {"file": ("test_doc.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "title": "Passport Renewal Test Doc",
        "category": "personal",
        "description": "Test description",
        "action": "Submit passport renewal application",
        "is_important": "true",
    }
    response = client.post("/documents", data=data, files=files)
    assert response.status_code == 201
    doc = response.json()
    assert doc["title"] == "Passport Renewal Test Doc"
    assert doc["action"] == "Submit passport renewal application"
    assert doc["action_status"] == "Pending"
    doc_id = doc["id"]

    # Test patch action status to Completed
    patch_res = client.patch(f"/documents/{doc_id}/action-status", json={"action_status": "Completed"})
    assert patch_res.status_code == 200
    assert patch_res.json()["action_status"] == "Completed"

    # Test search by action keyword
    search_res = client.get("/documents?q=passport")
    assert search_res.status_code == 200
    search_ids = [d["id"] for d in search_res.json()]
    assert doc_id in search_ids

    # Cleanup test doc
    del_res = client.delete(f"/documents/{doc_id}")
    assert del_res.status_code == 204
