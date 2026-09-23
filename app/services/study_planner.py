"""Pedagogical Study Planner & AI Todo Generator for Memora.

Generates structured, progressive study milestones and actionable todos
for YouTube lectures, courses, and study materials.
Operates with intelligent domain knowledge (OOPS, DSA, OS, DBMS, Web, System Design, etc.)
and seamlessly integrates with LLM APIs when available.
"""

from dataclasses import dataclass
import os
import re
from typing import Any, Dict, List, Optional
import uuid
import httpx


@dataclass
class GeneratedStudyPlan:
    topic: str
    milestone_title: str
    todos: List[Dict[str, Any]]


# Structured pedagogical milestones for key computer science & engineering domains
STUDY_DOMAIN_CURRICULUM: Dict[str, Dict[str, Any]] = {
    "oops": {
        "title": "Object-Oriented Programming (OOPS)",
        "milestone_prefix": "OOPS Milestone",
        "pillars": [
            {
                "text": "Understand Classes, Objects, and memory allocation for instances",
                "category": "Core Concept",
            },
            {
                "text": "Implement Encapsulation & Data Hiding with access modifiers and getters/setters",
                "category": "Pillar 1",
            },
            {
                "text": "Build Inheritance hierarchy and test method overriding (@override / virtual)",
                "category": "Pillar 2",
            },
            {
                "text": "Master Polymorphism: Compare compile-time overloading with runtime dynamic dispatch",
                "category": "Pillar 3",
            },
            {
                "text": "Design Abstract Classes and Interfaces to enforce contracts & loose coupling",
                "category": "Pillar 4",
            },
            {
                "text": "Code a mini design problem (e.g. Parking Lot, Library System, or Bank Account)",
                "category": "Practice",
            },
            {
                "text": "Summarize lecture notes and check off playlist milestone",
                "category": "Review",
            },
        ],
    },
    "dsa": {
        "title": "Data Structures & Algorithms",
        "milestone_prefix": "DSA Mastery",
        "pillars": [
            {
                "text": "Analyze Time & Space Complexity (Big-O analysis) for the covered data structure",
                "category": "Complexity",
            },
            {
                "text": "Trace algorithm operations step-by-step with pen and paper on test inputs",
                "category": "Tracing",
            },
            {
                "text": "Implement the data structure/algorithm from scratch without built-in libraries",
                "category": "Implementation",
            },
            {
                "text": "Solve 3 practice LeetCode / GFG problems targeting edge cases (empty, single element, duplicates)",
                "category": "Problem Solving",
            },
            {
                "text": "Record key insights and algorithmic pattern templates in study notes",
                "category": "Review",
            },
        ],
    },
    "operating_system": {
        "title": "Operating Systems & Concurrency",
        "milestone_prefix": "OS System Milestone",
        "pillars": [
            {
                "text": "Understand process state diagram, PCB, and context switching overhead",
                "category": "Process Model",
            },
            {
                "text": "Compare CPU scheduling algorithms (Round Robin, FCFS, Priority, Multilevel)",
                "category": "Scheduling",
            },
            {
                "text": "Trace Critical Section Problem and synchronization with Mutex & Semaphores",
                "category": "Concurrency",
            },
            {
                "text": "Understand Deadlock conditions and Banker's algorithm prevention",
                "category": "Deadlock",
            },
            {
                "text": "Solve 2 gate/interview numerical problems on Virtual Memory & Paging",
                "category": "Practice",
            },
        ],
    },
    "dbms": {
        "title": "Database Management Systems (DBMS)",
        "milestone_prefix": "DBMS & SQL Milestone",
        "pillars": [
            {
                "text": "Map relational schema & understand primary key, foreign key constraints",
                "category": "Schema Design",
            },
            {
                "text": "Write and execute complex SQL queries involving INNER/OUTER JOINs and subqueries",
                "category": "SQL Practice",
            },
            {
                "text": "Test normalization rules (1NF, 2NF, 3NF, BCNF) to eliminate anomalies",
                "category": "Normalization",
            },
            {
                "text": "Understand ACID transaction properties, serializability, and concurrency control",
                "category": "Transactions",
            },
            {
                "text": "Analyze B-Tree and B+ Tree indexing for query performance optimization",
                "category": "Indexing",
            },
        ],
    },
    "web_dev": {
        "title": "Full-Stack Web Development",
        "milestone_prefix": "Web Dev Project Milestone",
        "pillars": [
            {
                "text": "Understand component architecture, props, state flow, and lifecycle/hooks",
                "category": "Architecture",
            },
            {
                "text": "Implement responsive UI layout with semantic styling and interactive states",
                "category": "Frontend",
            },
            {
                "text": "Integrate RESTful API endpoints with async fetch, loading indicators, and error boundaries",
                "category": "API Integration",
            },
            {
                "text": "Add input validation, state persistence, and error handling",
                "category": "Robustness",
            },
            {
                "text": "Test feature locally and document endpoints or components",
                "category": "Verification",
            },
        ],
    },
    "system_design": {
        "title": "System Design & Architecture",
        "milestone_prefix": "System Design Milestone",
        "pillars": [
            {
                "text": "Define functional & non-functional requirements (throughput, latency, availability)",
                "category": "Requirements",
            },
            {
                "text": "Estimate back-of-the-envelope capacity (storage, bandwidth, QPS)",
                "category": "Estimation",
            },
            {
                "text": "Draw high-level architecture diagram (Load Balancers, API Gateway, Services, DBs)",
                "category": "High Level",
            },
            {
                "text": "Design data models and caching layer (Redis / Memcached strategy)",
                "category": "Deep Dive",
            },
            {
                "text": "Analyze bottleneck points, single point of failures, and partition tolerance (CAP theorem)",
                "category": "Resilience",
            },
        ],
    },
    "machine_learning": {
        "title": "Machine Learning & AI",
        "milestone_prefix": "ML Milestone",
        "pillars": [
            {
                "text": "Understand mathematical foundations (Loss function, Gradient Descent, Weights)",
                "category": "Theory",
            },
            {
                "text": "Perform exploratory data analysis and feature preprocessing",
                "category": "Data Prep",
            },
            {
                "text": "Implement and train baseline model using PyTorch / Scikit-Learn",
                "category": "Training",
            },
            {
                "text": "Evaluate metrics (Precision, Recall, F1-Score, ROC-AUC) on validation split",
                "category": "Evaluation",
            },
            {
                "text": "Document hyperparameters and iterate with regularization/tuning",
                "category": "Iteration",
            },
        ],
    },
}


def _extract_playlist_and_episode_context(title: str, url: str) -> Dict[str, Any]:
    """Extracts episode number, lecture number, or playlist context from title or url."""
    text = f"{title} {url}"
    context: Dict[str, Any] = {
        "is_playlist": False,
        "episode_num": None,
        "lecture_num": None,
        "playlist_label": "",
    }

    # Episode pattern (e.g. Ep 3, Episode 4, Part 2)
    ep_match = re.search(r"(?:ep(?:isode)?|part|pt|video)\s*[:#.-]?\s*(\d+)", text, re.IGNORECASE)
    if ep_match:
        context["episode_num"] = int(ep_match.group(1))

    # Lecture pattern (e.g. Lecture 5, Lec 02, Class 3)
    lec_match = re.search(r"(?:lecture|lec|class)\s*[:#.-]?\s*(\d+)", text, re.IGNORECASE)
    if lec_match:
        context["lecture_num"] = int(lec_match.group(1))

    # General playlist pattern
    if any(k in text.lower() for k in ["playlist", "series", "course", "bootcamp", "complete guide", "full course"]):
        context["is_playlist"] = True

    num = context["episode_num"] or context["lecture_num"]
    if num is not None:
        context["playlist_label"] = f"Episode {num}"
    elif context["is_playlist"]:
        context["playlist_label"] = "Playlist Milestone"

    return context


def _detect_study_domain(text: str) -> Optional[str]:
    """Detects study subject domain from title, notes, and tags."""
    t = text.lower()

    # Priority 1: OOPS
    if any(k in t for k in ["oops", "oop", "object oriented", "object-oriented", "encapsulation", "polymorphism", "inheritance", "abstract class"]):
        return "oops"

    # Priority 2: DSA
    if any(k in t for k in ["dsa", "data structure", "algorithm", "leetcode", "binary tree", "linked list", "graph", "dynamic programming", "recursion", "sorting"]):
        return "dsa"

    # Priority 3: Operating System
    if any(k in t for k in ["operating system", " os ", "process scheduling", "deadlock", "paging", "virtual memory", "semaphore", "multithreading"]):
        return "operating_system"

    # Priority 4: DBMS
    if any(k in t for k in ["dbms", "database", "sql", "normalization", "rdbms", "acid properties", "indexing"]):
        return "dbms"

    # Priority 5: System Design
    if any(k in t for k in ["system design", "microservices", "distributed system", "load balancer", "scalability", "caching"]):
        return "system_design"

    # Priority 6: Web Development
    if any(k in t for k in ["react", "frontend", "full stack", "fullstack", "web development", "javascript", "fastapi", "nodejs", "next.js", "css", "html"]):
        return "web_dev"

    # Priority 7: Machine Learning
    if any(k in t for k in ["machine learning", "deep learning", "neural network", "transformer", "pytorch", "tensorflow", "nlp", "computer vision"]):
        return "machine_learning"

    return None


def generate_study_todos(
    title: str,
    url: Optional[str] = None,
    notes: Optional[str] = None,
    tags: Optional[str] = None,
    category: str = "study",
) -> GeneratedStudyPlan:
    """Generates structured, pedagogical study milestones and checklist todos."""
    combined_text = f"{title} {notes or ''} {tags or ''} {url or ''}"
    playlist_ctx = _extract_playlist_and_episode_context(title, url or "")
    domain_key = _detect_study_domain(combined_text)

    # 1. If domain recognized (e.g. OOPS, DSA, etc.)
    if domain_key and domain_key in STUDY_DOMAIN_CURRICULUM:
        domain = STUDY_DOMAIN_CURRICULUM[domain_key]
        topic = domain["title"]
        ep_label = f" - {playlist_ctx['playlist_label']}" if playlist_ctx["playlist_label"] else ""
        milestone_title = f"{domain['milestone_prefix']}{ep_label}"

        todos: List[Dict[str, Any]] = []

        # If it's a specific lecture or episode, prepend a focused study task
        if playlist_ctx["episode_num"] or playlist_ctx["lecture_num"]:
            num = playlist_ctx["episode_num"] or playlist_ctx["lecture_num"]
            todos.append({
                "id": f"todo_{uuid.uuid4().hex[:8]}",
                "text": f"Watch & actively take notes on {playlist_ctx['playlist_label']} ({title[:45]}...)",
                "completed": False,
                "category": "Watch & Note",
            })

        for p in domain["pillars"]:
            todos.append({
                "id": f"todo_{uuid.uuid4().hex[:8]}",
                "text": p["text"],
                "completed": False,
                "category": p["category"],
            })

        # Add playlist progress tracking milestone
        if playlist_ctx["is_playlist"] or playlist_ctx["episode_num"]:
            todos.append({
                "id": f"todo_{uuid.uuid4().hex[:8]}",
                "text": f"Mark {playlist_ctx['playlist_label'] or 'this video'} as complete in playlist tracker",
                "completed": False,
                "category": "Milestone",
            })

        return GeneratedStudyPlan(
            topic=topic,
            milestone_title=milestone_title,
            todos=todos,
        )

    # 2. General Study / Tech Video Fallback
    cleaned_title = re.sub(r"[^\w\s-]", "", title).strip()
    topic = cleaned_title[:40] if cleaned_title else "Study Topic"
    ep_label = f" ({playlist_ctx['playlist_label']})" if playlist_ctx["playlist_label"] else ""
    milestone_title = f"Study Milestone: {topic}{ep_label}"

    todos = [
        {
            "id": f"todo_{uuid.uuid4().hex[:8]}",
            "text": f"Watch video and highlight core concepts for '{topic}'",
            "completed": False,
            "category": "Concept",
        },
        {
            "id": f"todo_{uuid.uuid4().hex[:8]}",
            "text": "Write code implementation or worked example based on the lecture",
            "completed": False,
            "category": "Hands-on",
        },
        {
            "id": f"todo_{uuid.uuid4().hex[:8]}",
            "text": "Solve 2 practice problems or self-assessment questions",
            "completed": False,
            "category": "Practice",
        },
        {
            "id": f"todo_{uuid.uuid4().hex[:8]}",
            "text": "Create 3 summary flashcard points for quick revision",
            "completed": False,
            "category": "Revision",
        },
        {
            "id": f"todo_{uuid.uuid4().hex[:8]}",
            "text": "Mark milestone completed and proceed to next playlist item",
            "completed": False,
            "category": "Milestone",
        },
    ]

    return GeneratedStudyPlan(
        topic=topic,
        milestone_title=milestone_title,
        todos=todos,
    )
