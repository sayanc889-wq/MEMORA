"""Document Intelligence and Smart Action Suggestion Service.

Provides deterministic, rule-based suggestions for document actions,
designed with clean interfaces so local Hugging Face / ONNX models can be
seamlessly attached in the future.
"""

import re
from typing import Any, Dict


def suggest_action_for_document(
    title: str,
    category: str = "general",
    file_name: str | None = None,
    description: str | None = None,
) -> Dict[str, Any]:
    """Generates a smart action suggestion based on document metadata.

    Never generates binding or authoritative legal advice. Returns a
    suggested action that the user can review and edit before saving.
    """
    text = f"{title} {file_name or ''} {description or ''} {category}".lower()

    # 1. Passport
    if "passport" in text:
        return {
            "suggested_action": "Check passport validity and initiate renewal before expiry",
            "reason": "Passport renewals often take several weeks to process",
            "confidence": 0.95,
        }

    # 2. Insurance
    if any(k in text for k in ["insurance", "policy", "premium"]):
        if any(k in text for k in ["car", "vehicle", "bike", "motor", "auto"]):
            return {
                "suggested_action": "Renew vehicle insurance policy before expiry",
                "reason": "Vehicle insurance is required for road legality and driving coverage",
                "confidence": 0.92,
            }
        if any(k in text for k in ["health", "mediclaim"]):
            return {
                "suggested_action": "Renew health insurance policy before expiry",
                "reason": "Ensure continuous coverage without lapse in waiting periods",
                "confidence": 0.92,
            }
        return {
            "suggested_action": "Renew insurance policy and verify payment receipt",
            "reason": "Keep insurance active to avoid policy lapse or penalty",
            "confidence": 0.88,
        }

    # 3. Driving License
    if any(k in text for k in ["driving license", "driver license", "dl "]) or (
        "license" in text and "software" not in text
    ):
        return {
            "suggested_action": "Check license expiry and apply for renewal if within 1 year",
            "reason": "Driving license renewals require timely slot booking",
            "confidence": 0.90,
        }

    # 4. Scholarship
    if "scholarship" in text:
        return {
            "suggested_action": "Submit scholarship application and supporting documents before deadline",
            "reason": "Scholarship deadlines are strictly enforced with no extensions",
            "confidence": 0.93,
        }

    # 5. College / Academic / Exam
    if any(k in text for k in ["marksheet", "transcript", "grade card", "result"]):
        return {
            "suggested_action": "Keep this marksheet safely and verify all subject grades",
            "reason": "Academic records are needed for higher studies and job verifications",
            "confidence": 0.88,
        }
    if any(k in text for k in ["exam", "hall ticket", "admit card"]):
        return {
            "suggested_action": "Print admit card and check exam venue, reporting time and instructions",
            "reason": "Exam guidelines must be verified ahead of exam day",
            "confidence": 0.91,
        }
    if any(k in text for k in ["college", "semester", "university", "admission", "enrollment"]):
        return {
            "suggested_action": "Submit semester form and verify fee payment receipt",
            "reason": "Semester submissions must be cleared for academic standing",
            "confidence": 0.87,
        }

    # 6. Tax / Financial
    if any(k in text for k in ["tax", "itr", "form 16", "w-2", "1099"]):
        return {
            "suggested_action": "Review tax document and file annual returns before due date",
            "reason": "Tax filing deadlines avoid interest penalties and audits",
            "confidence": 0.92,
        }
    if any(k in text for k in ["salary", "payslip", "pay slip", "invoice", "receipt"]):
        return {
            "suggested_action": "Verify payment amounts and archive for annual financial audit",
            "reason": "Proof of income/expense records are critical for tax reconciliation",
            "confidence": 0.85,
        }

    # 7. Medical / Health
    if any(k in text for k in ["medical", "prescription", "lab report", "blood test", "diagnostic"]):
        return {
            "suggested_action": "Follow up with physician on report findings and schedule consultation",
            "reason": "Medical follow-ups ensure treatment continuity",
            "confidence": 0.89,
        }

    # 8. Bills & Utilities
    if any(k in text for k in ["bill", "electricity", "water", "internet", "broadband", "rent"]):
        return {
            "suggested_action": "Pay utility bill before due date to avoid late fee or disconnection",
            "reason": "Timely utility payments maintain active service and credit rating",
            "confidence": 0.90,
        }

    # 9. Warranty / Guarantee
    if any(k in text for k in ["warranty", "guarantee"]):
        return {
            "suggested_action": "Keep purchase invoice alongside warranty card for claims",
            "reason": "Warranty coverage requires original proof of purchase",
            "confidence": 0.86,
        }

    # 10. Category-based fallback
    category_suggestions = {
        "study": (
            "Review academic document and track submission deadlines",
            "Keep academic submissions organized and timely",
        ),
        "finance": (
            "Verify statement details and reconcile with monthly budget",
            "Monitor financial statements for accurate accounting",
        ),
        "health": (
            "Keep medical record organized for upcoming appointments",
            "Health documents are needed during medical consultations",
        ),
        "personal": (
            "Review personal document details and keep digital backup",
            "Important personal records should be regularly verified",
        ),
        "work": (
            "Review work deliverables and keep for employment portfolio",
            "Work records help during performance reviews and appraisals",
        ),
        "project": (
            "Review project milestones and verify pending deliverable dates",
            "Project documents should be tracked against delivery schedules",
        ),
    }

    if category in category_suggestions:
        action, reason = category_suggestions[category]
        return {
            "suggested_action": action,
            "reason": reason,
            "confidence": 0.70,
        }

    return {
        "suggested_action": "Review document details and set reminder if follow-up is needed",
        "reason": "General document tracking and life administration",
        "confidence": 0.60,
    }
