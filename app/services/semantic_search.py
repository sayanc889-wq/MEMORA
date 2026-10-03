"""Semantic Search and Concept Retrieval Engine for Memora.

Provides hybrid semantic search combining:
1. Domain Concept Expansion (e.g. 'compiler design' -> lexical analysis, parser, AST, grammar)
2. Token & Sub-phrase TF-IDF Vector Cosine Similarity
3. Keyword / Substring Fuzzy Matching
4. Relevance Score Ranking & Explainable Match Reasons

Zero external paid API dependency required; runs 100% locally with high performance.
"""

from collections import Counter
import math
import re
from typing import Any, Dict, List, Set, Tuple

from app.models.web_resource import WebResource
from app.schemas.web_resource import WebResourceResponse, WebResourceSearchResult

# Comprehensive concept graph for common study subjects, CS topics & life domains
CONCEPT_ONTOLOGY: Dict[str, List[str]] = {
    "compiler": [
        "compiler design", "lexical analysis", "lexer", "tokenizer", "token", "scanner",
        "parsing", "parser", "syntax analysis", "abstract syntax tree", "ast",
        "grammar", "cfg", "context free grammar", "ambiguity", "derivation",
        "ll(1)", "lr(0)", "slr", "lalr", "lr(1)", "shift reduce", "first and follow",
        "intermediate code generation", "three address code", "tac", "quadruple",
        "code optimization", "dead code", "constant folding", "loop optimization",
        "target code generation", "symbol table", "lex", "yacc", "flex", "bison",
        "dragon book", "semantic analysis", "type checking"
    ],
    "operating system": [
        "os", "kernel", "process", "thread", "multithreading", "scheduling",
        "cpu scheduling", "round robin", "fcfs", "sjf", "priority scheduling",
        "deadlock", "banker algorithm", "mutex", "semaphore", "critical section",
        "synchronization", "concurrency", "paging", "segmentation", "virtual memory",
        "page replacement", "lru", "fifo", "thrashing", "system call", "file system"
    ],
    "dsa": [
        "data structure", "algorithm", "time complexity", "big o", "space complexity",
        "array", "linked list", "stack", "queue", "binary tree", "bst", "avl tree",
        "heap", "priority queue", "graph", "bfs", "dfs", "dijkstra", "bellman ford",
        "minimum spanning tree", "kruskal", "prim", "dynamic programming", "dp",
        "recursion", "memoization", "greedy", "sorting", "merge sort", "quick sort",
        "binary search", "hashing", "hash map", "leetcode", "trie"
    ],
    "database": [
        "dbms", "database", "sql", "rdbms", "table", "schema", "query", "select",
        "join", "inner join", "outer join", "foreign key", "primary key",
        "normalization", "1nf", "2nf", "3nf", "bcnf", "acid properties",
        "transaction", "concurrency control", "indexing", "b tree", "b+ tree",
        "nosql", "mongodb", "postgresql", "sqlite"
    ],
    "computer networks": [
        "networking", "osi model", "tcp/ip", "tcp", "udp", "ip address",
        "subnetting", "cidr", "routing", "router", "switch", "gateway",
        "dns", "dhcp", "http", "https", "socket", "packet", "three way handshake",
        "flow control", "congestion control", "sliding window"
    ],
    "web development": [
        "frontend", "backend", "fullstack", "html", "css", "javascript", "js",
        "typescript", "react", "vue", "angular", "vite", "nextjs", "nodejs",
        "express", "fastapi", "rest api", "json", "endpoint", "cors", "jwt",
        "authentication", "tailwind", "responsive design"
    ],
    "machine learning": [
        "ai", "artificial intelligence", "machine learning", "ml", "deep learning",
        "neural network", "cnn", "rnn", "lstm", "transformer", "llm", "gpt",
        "regression", "classification", "supervised learning", "unsupervised learning",
        "clustering", "k means", "gradient descent", "loss function", "backpropagation",
        "pytorch", "tensorflow", "scikit learn", "pandas", "numpy"
    ],
    "mathematics": [
        "math", "calculus", "differential equations", "linear algebra", "matrix",
        "eigenvalues", "eigenvectors", "vector space", "probability", "statistics",
        "bayes theorem", "discrete mathematics", "graph theory", "combinatorics"
    ],
    "finance": [
        "money", "investment", "tax", "income tax", "itr", "stock", "mutual fund",
        "budget", "expense", "bank", "credit card", "loan", "salary", "invoice", "receipt"
    ],
    "health": [
        "medical", "doctor", "prescription", "hospital", "clinic", "lab test",
        "blood test", "medicine", "health insurance", "fitness", "diet", "checkup"
    ],
}


def _tokenize(text: str) -> List[str]:
    """Extracts cleaned words and tokens."""
    if not text:
        return []
    cleaned = re.sub(r"[^\w\s-]", " ", text.lower())
    tokens = [t.strip() for t in cleaned.split() if len(t.strip()) > 1]
    return tokens


def _expand_query_concepts(query: str) -> Tuple[Set[str], List[str]]:
    """Finds associated ontological concepts for the search query."""
    q_tokens = set(_tokenize(query))
    matched_domains: List[str] = []
    expanded_terms: Set[str] = set()

    # Match against concepts
    for domain, terms in CONCEPT_ONTOLOGY.items():
        domain_tokens = set(_tokenize(domain))
        # Direct domain match or term overlap
        if domain in query.lower() or (domain_tokens and domain_tokens.issubset(q_tokens)):
            matched_domains.append(domain)
            for t in terms:
                expanded_terms.update(_tokenize(t))
        else:
            # Check individual terms in the domain
            for t in terms:
                t_tokens = set(_tokenize(t))
                if len(t_tokens) >= 2 and t in query.lower():
                    matched_domains.append(domain)
                    for term in terms:
                        expanded_terms.update(_tokenize(term))
                    break
                elif any(tok in q_tokens for tok in t_tokens if len(tok) > 3):
                    expanded_terms.update(t_tokens)

    # Always include original query tokens
    expanded_terms.update(q_tokens)
    return expanded_terms, list(set(matched_domains))


def _compute_cosine_similarity(query_tf: Counter, doc_tf: Counter) -> float:
    """Computes cosine similarity between two term-frequency vectors."""
    common_terms = set(query_tf.keys()) & set(doc_tf.keys())
    if not common_terms:
        return 0.0

    dot_product = sum(query_tf[t] * doc_tf[t] for t in common_terms)
    mag_q = math.sqrt(sum(v * v for v in query_tf.values()))
    mag_d = math.sqrt(sum(v * v for v in doc_tf.values()))

    if mag_q == 0 or mag_d == 0:
        return 0.0
    return dot_product / (mag_q * mag_d)


def perform_semantic_search(
    query: str,
    resources: List[WebResource],
    category_filter: str | None = None,
    source_type_filter: str | None = None,
    limit: int = 20,
) -> List[WebResourceSearchResult]:
    """Ranks resources using hybrid semantic vector search, concept expansion, and fuzzy matching."""
    cleaned_query = query.strip()
    if not cleaned_query:
        # Return latest resources if query is empty
        filtered = [
            r for r in resources
            if (not category_filter or r.category == category_filter)
            and (not source_type_filter or r.source_type == source_type_filter)
        ]
        return [
            WebResourceSearchResult(
                resource=WebResourceResponse.model_validate(r),
                relevance_score=1.0,
                matched_concepts=[],
                match_reason="Recent resource",
            )
            for r in filtered[:limit]
        ]

    q_lower = cleaned_query.lower()
    q_tokens = _tokenize(q_lower)
    expanded_terms, matched_domains = _expand_query_concepts(q_lower)

    # Build query TF vector with high weights for original tokens and moderate for expansions
    query_tf = Counter()
    for tok in q_tokens:
        query_tf[tok] += 3.0
    for exp in expanded_terms:
        query_tf[exp] += 1.0

    scored_results: List[Tuple[float, WebResource, List[str], str]] = []

    for r in resources:
        # Apply filters
        if category_filter and r.category != category_filter:
            continue
        if source_type_filter and r.source_type != source_type_filter:
            continue

        # Extract document fields with weights
        title_tokens = _tokenize(r.title or "")
        tags_tokens = _tokenize(r.tags or "")
        notes_tokens = _tokenize(r.notes or "")
        summary_tokens = _tokenize(r.summary or "")
        url_tokens = _tokenize(r.url or "")
        cat_tokens = _tokenize(r.category or "")

        doc_tf = Counter()
        for tok in title_tokens:
            doc_tf[tok] += 3.0
        for tok in tags_tokens:
            doc_tf[tok] += 2.5
        for tok in notes_tokens:
            doc_tf[tok] += 2.0
        for tok in summary_tokens:
            doc_tf[tok] += 1.8
        for tok in cat_tokens:
            doc_tf[tok] += 1.5
        for tok in url_tokens:
            doc_tf[tok] += 0.8

        # 1. Cosine vector similarity
        sim_score = _compute_cosine_similarity(query_tf, doc_tf)

        # 2. Exact match boost
        exact_title_match = q_lower in (r.title or "").lower()
        exact_notes_match = q_lower in (r.notes or "").lower()
        exact_tags_match = q_lower in (r.tags or "").lower()

        boost = 0.0
        match_reasons = []

        if exact_title_match:
            boost += 0.4
            match_reasons.append("Exact match in title")
        elif any(tok in title_tokens for tok in q_tokens):
            boost += 0.25
            match_reasons.append("Keywords in title")

        if exact_tags_match:
            boost += 0.3
            match_reasons.append("Topic tags match")

        if exact_notes_match:
            boost += 0.2
            match_reasons.append("Match in notes")

        # 3. Concept expansion match
        matched_concepts_in_doc = list(set(doc_tf.keys()) & expanded_terms)
        meaningful_concepts = [c for c in matched_concepts_in_doc if len(c) > 2]

        if matched_domains and any(c in expanded_terms for c in doc_tf.keys()):
            boost += 0.15
            match_reasons.append(f"Semantic concept: {', '.join(matched_domains[:2])}")

        # 4. Pinned bonus
        if r.is_pinned:
            boost += 0.05

        total_score = min(1.0, sim_score + boost)

        # Threshold for relevance
        if total_score > 0.08 or exact_title_match or exact_notes_match or len(meaningful_concepts) >= 1:
            reason_str = " • ".join(match_reasons) if match_reasons else "Semantic topic match"
            scored_results.append((total_score, r, meaningful_concepts[:5], reason_str))

    # Sort descending by relevance score
    scored_results.sort(key=lambda x: x[0], reverse=True)

    results: List[WebResourceSearchResult] = []
    for score, r, concepts, reason in scored_results[:limit]:
        results.append(
            WebResourceSearchResult(
                resource=WebResourceResponse.model_validate(r),
                relevance_score=round(score, 3),
                matched_concepts=concepts,
                match_reason=reason,
            )
        )

    return results
