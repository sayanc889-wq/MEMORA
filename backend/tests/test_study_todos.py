import json
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import init_db

init_db()

client = TestClient(app)


def test_generate_oops_study_todos():
    payload = {
        "title": "Java OOPs Concepts - Ep 3: Inheritance and Polymorphism Tutorial",
        "url": "https://www.youtube.com/watch?v=oops_lec_3",
        "tags": "oops,java,inheritance",
        "notes": "Understanding dynamic dispatch and method overriding",
        "category": "study",
    }
    res = client.post("/web-resources/generate-todos", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "Object-Oriented Programming" in data["topic"]
    assert "OOPS Milestone" in data["milestone_title"]
    assert len(data["todos"]) >= 5

    todo_texts = [t["text"].lower() for t in data["todos"]]
    assert any("encapsulation" in t for t in todo_texts)
    assert any("inheritance" in t for t in todo_texts)
    assert any("polymorphism" in t for t in todo_texts)
    assert any("abstract" in t or "interface" in t for t in todo_texts)
    assert any("episode 3" in t for t in todo_texts)


def test_generate_generic_study_todos():
    payload = {
        "title": "Discrete Mathematics Graph Theory Introduction",
        "url": "https://www.youtube.com/watch?v=math_graph",
        "category": "study",
    }
    res = client.post("/web-resources/generate-todos", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["todos"]) >= 4
    assert any("practice" in t["text"].lower() or "worked example" in t["text"].lower() for t in data["todos"])


def test_create_and_update_resource_todos():
    # 1. Create with todos_json
    initial_todos = [
        {"id": "t1", "text": "Master Class basics", "completed": False, "category": "Concept"},
        {"id": "t2", "text": "Implement OOP inheritance", "completed": False, "category": "Practice"},
    ]
    create_res = client.post(
        "/web-resources",
        json={
            "title": "C++ OOPs Playlist - Lecture 1",
            "url": "https://www.youtube.com/watch?v=cpp_oops_1",
            "source_type": "youtube",
            "category": "study",
            "todos_json": json.dumps(initial_todos),
        },
    )
    assert create_res.status_code == 201
    created = create_res.json()
    res_id = created["id"]
    assert created["todos_json"] is not None
    loaded_todos = json.loads(created["todos_json"])
    assert len(loaded_todos) == 2

    # 2. Update todos via PUT /web-resources/{id}/todos
    updated_todos = [
        {"id": "t1", "text": "Master Class basics", "completed": True, "category": "Concept"},
        {"id": "t2", "text": "Implement OOP inheritance", "completed": True, "category": "Practice"},
    ]
    update_res = client.put(
        f"/web-resources/{res_id}/todos",
        json={"todos": updated_todos},
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["action_status"] == "Completed"
    stored_todos = json.loads(updated_data["todos_json"])
    assert all(t["completed"] is True for t in stored_todos)
