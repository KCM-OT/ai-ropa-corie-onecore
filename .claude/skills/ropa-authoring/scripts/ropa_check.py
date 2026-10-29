#!/usr/bin/env python3
"""Deterministic checks for a draft Article 30 RoPA record.

Controller records (Art. 30(1)) are ported from the AI RoPA Studio prototype
(lib/ropa.ts, lib/authoring.ts, lib/similarity.ts, lib/posture.ts) so scores and
rule outcomes match it exactly. Validation warnings are drawn from the prototype's
review prompt (app/api/review).

Records carry the prototype's `role` field: "controller", "joint_controller" or
"processor" (lib/types.ts ProcessingRole). The older `recordType` key is still
accepted. Processor records (Art. 30(2)) get their own required fields and checks;
see references/processor-mode.md.

Usage:
  python3 ropa_check.py draft.json [--inventory inv.json] [--posture posture.json]
                                   [--existing records.json]

Prints a JSON report to stdout. Standard library only.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone

# ---- controller (Art. 30(1)) fields ----

FIELD_LABELS = {
    "name": "Record name",
    "description": "Description",
    "purpose": "Purpose of processing",
    "legalBasis": "Legal basis (Art. 6)",
    "managingOrganization": "Managing organization",
    "businessProcessOwner": "Business process owner",
    "dataSubjectCategories": "Data subject categories",
    "retentionPeriod": "Retention period",
    "recipients": "Recipients",
    "internationalTransfers": "International transfers",
    "securityMeasures": "Security measures",
    "jurisdiction": "Jurisdiction",
}

FIELD_ORDER = [
    "name", "description", "purpose", "legalBasis", "dataSubjectCategories",
    "retentionPeriod", "recipients", "internationalTransfers", "securityMeasures",
    "managingOrganization", "businessProcessOwner", "jurisdiction",
]

CORE_FIELDS = [
    "name", "description", "purpose", "legalBasis", "managingOrganization",
    "businessProcessOwner", "retentionPeriod", "recipients",
    "internationalTransfers", "securityMeasures",
]

# Fields reported but never listed as gaps.
OPTIONAL_FIELDS = {"jurisdiction"}

# ---- processor (Art. 30(2)) fields ----

PROCESSOR_FIELD_LABELS = {
    "name": "Record name",
    "description": "Description of the service",
    "processorDetails": "Processor name & contact details (Art. 30(2)(a))",
    "controllers": "Controllers acted for (Art. 30(2)(a))",
    "processingCategories": "Categories of processing (Art. 30(2)(b))",
    "internationalTransfers": "International transfers (Art. 30(2)(c))",
    "securityMeasures": "Security measures (Art. 30(2)(d))",
    "dataSubjectCategories": "Data subject categories",
    "dpaReference": "DPA / contract reference (Art. 28(3))",
    "managingOrganization": "Managing organization",
    "businessProcessOwner": "Business process owner",
    "jurisdiction": "Jurisdiction",
}

PROCESSOR_FIELD_ORDER = [
    "name", "description", "processorDetails", "controllers", "processingCategories",
    "internationalTransfers", "securityMeasures", "dataSubjectCategories",
    "dpaReference", "managingOrganization", "businessProcessOwner", "jurisdiction",
]

# The seven items that make an Art. 30(2) record complete.
PROCESSOR_CORE = [
    "name", "description", "processorDetails", "controllers",
    "processingCategories", "internationalTransfers", "securityMeasures",
]

PROCESSOR_OPTIONAL = {
    "dataSubjectCategories", "dpaReference", "managingOrganization",
    "businessProcessOwner", "jurisdiction",
}

# Assessment ownership when the organisation acts as processor
# (same wording as PROCESSOR_ASSESSMENT_OWNER in lib/posture.ts).
PROCESSOR_ASSESSMENT_OWNER = {
    "PIA": "Controller — processor assists (Art. 28(3)(f))",
    "LIA": "Controller",
    "TIA": "Processor — for its own onward transfers to sub-processors",
    "PbD": "Processor — internal review of the service",
    "AIRisk": "Processor — internal review of the service",
}

LEGAL_BASES = [
    "Consent", "Contract", "Legal obligation", "Vital interests",
    "Public task", "Legitimate interests",
]

CONDITION_ORDER = [
    "specialCategory", "internationalTransfer", "legitimateInterests",
    "automatedDecisions", "largeScale", "systematicMonitoring",
    "vulnerableSubjects", "newActivity",
]

CONDITION_LABEL = {
    "specialCategory": "Special-category data",
    "internationalTransfer": "International transfer",
    "legitimateInterests": "Legitimate interests basis",
    "automatedDecisions": "Automated decisions / AI",
    "largeScale": "Large-scale processing",
    "systematicMonitoring": "Systematic monitoring",
    "vulnerableSubjects": "Vulnerable data subjects",
    "newActivity": "New / draft activity",
}

ASSESSMENT_NAME = {
    "PIA": "Privacy Impact Assessment",
    "LIA": "Legitimate Interests Assessment",
    "TIA": "Transfer Impact Assessment",
    "PbD": "Privacy by Design Review",
    "AIRisk": "AI Risk Assessment",
}

AI_KEYWORDS = [
    "ai", "artificial intelligence", "machine learning", "model", "algorithm",
    "automated decision", "automated decision-making", "profiling", "scoring",
    "predict", "recommendation engine",
]
LARGE_SCALE_KEYWORDS = [
    "large-scale", "large scale", "nationwide", "millions", "all customers",
    "all users", "entire user base", "across all", "high volume",
]
MONITORING_KEYWORDS = [
    "monitor", "monitoring", "tracking", "track ", "surveillance", "observ",
    "behavioral", "behaviour", "geolocation tracking",
]
VULNERABLE_KEYWORDS = [
    "child", "children", "minor", "student", "patient", "vulnerable", "elderly",
]
SPECIAL_TEXT_KEYWORDS = ["health", "biometric", "ethnic", "racial", "genetic"]

TRANSFER_SAFEGUARD = re.compile(
    r"\bsccs?\b|standard contractual|adequacy|\bbcrs?\b|binding corporate|"
    r"data privacy framework|\bdpf\b|\bidta\b|derogation|art(icle)?\.?\s*49",
    re.I,
)
# Common third-country destinations; a heuristic for "is a destination named?".
TRANSFER_DESTINATION = re.compile(
    r"\b(united states|u\.?s\.?a?|america|canada|mexico|brazil|argentina|chile|colombia|"
    r"india|china|hong kong|japan|south korea|korea|singapore|philippines|malaysia|vietnam|"
    r"indonesia|thailand|taiwan|australia|new zealand|israel|turkey|uae|united arab emirates|"
    r"saudi arabia|egypt|south africa|nigeria|kenya|morocco|russia|ukraine|serbia|"
    r"switzerland|norway|iceland|united kingdom|uk|great britain|third countr(y|ies)|"
    r"international organi[sz]ation|worldwide|global)\b",
    re.I,
)
# A fixed period, or a defined trigger event ("duration of employment", "until consent
# withdrawn"). Vague wording like "until no longer needed" deliberately doesn't match.
CONCRETE_PERIOD = re.compile(
    r"\d|\b(day|week|month|year)s?\b|duration of|\bafter\b|end of|termination|closure|"
    r"statutory|withdraw|contract end|deleted or returned",
    re.I,
)
JOINT_ARRANGEMENT = re.compile(
    r"art(icle)?\.?\s*26|joint[- ]controller (arrangement|agreement)|arrangement|data sharing agreement", re.I
)
DEFERS_TO_CONTROLLER = re.compile(r"\bclient|\bcustomer|controller|\bdpa\b|instruction|on behalf", re.I)

STOP = {
    "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "by",
    "data", "processing", "activity", "personal", "customer", "customers", "new",
    "process", "management", "service", "services", "user", "users",
}
DUPLICATE_THRESHOLD = 0.16


# ---- helpers ----

def text(v):
    return v.strip() if isinstance(v, str) else ""


ROLES = ("controller", "joint_controller", "processor")
ROLE_LABEL = {"controller": "Controller", "joint_controller": "Joint controller", "processor": "Processor"}


def role_of(pa):
    raw = text(pa.get("role")) or text(pa.get("recordType")) or "controller"
    raw = raw.lower().replace("-", "_").replace(" ", "_")
    return raw if raw in ROLES else "controller"


def is_processor(pa):
    return role_of(pa) == "processor"


def is_joint(pa):
    return role_of(pa) == "joint_controller"


def joint_controllers_of(pa):
    return [c for c in (pa.get("jointControllers") or []) if isinstance(c, dict) and text(c.get("name"))]


def controllers_of(pa):
    return [c for c in (pa.get("controllers") or []) if isinstance(c, dict) and text(c.get("name"))]


def is_filled(pa, key):
    if key == "controllers":
        return bool(controllers_of(pa))
    if key == "processingCategories" and is_processor(pa):
        # Satisfied by a shared list, or by every controller having its own.
        per_controller = controllers_of(pa)
        return bool(pa.get("processingCategories")) or (
            bool(per_controller) and all(c.get("processingCategories") for c in per_controller)
        )
    value = pa.get(key)
    if isinstance(value, list):
        return bool(value)
    return bool(text(value))


def confidence_band(c):
    if c >= 0.85:
        return "high"
    if c >= 0.6:
        return "medium"
    return "low"


BAND_LABEL = {"high": "High confidence", "medium": "Needs review", "low": "Low confidence"}


def completeness(pa):
    # Matches lib/ropa.ts completeness(): processors are scored on the seven
    # Art. 30(2) items (processorCompleteness), every other role on the formula below.
    if is_processor(pa):
        filled = sum(1 for f in PROCESSOR_CORE if is_filled(pa, f))
        return round(filled / len(PROCESSOR_CORE) * 100)
    filled = sum(1 for f in CORE_FIELDS if text(pa.get(f)))
    total = len(CORE_FIELDS) + 3
    rels = pa.get("relationships", [])
    if pa.get("dataSubjectCategories"):
        filled += 1
    if any(r.get("type") in ("vendor", "asset") for r in rels):
        filled += 1
    if any(r.get("type") == "personalData" for r in rels):
        filled += 1
    return round(filled / total * 100)


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def resolve_inventory(rel_type, name, inventory):
    n = norm(name)
    if len(n) < 2:
        return None
    pool = {
        "vendor": inventory.get("vendors", []),
        "asset": inventory.get("assets", []),
        "personalData": inventory.get("personalDataCategories", []),
    }.get(rel_type, [])
    for item in pool:
        inm = norm(item["name"])
        if inm == n or inm in n or n in inm:
            return item["id"]
    return None


def tokens(s):
    cleaned = re.sub(r"[^a-z0-9\s]", " ", s.lower())
    return {t for t in cleaned.split() if len(t) > 2 and t not in STOP}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter)


def summary_text(rec):
    categories = " ".join(rec.get("processingCategories") or [])
    return f"{text(rec.get('name'))} {text(rec.get('purpose'))} {text(rec.get('description'))} {categories}"


def find_duplicate(pa, existing):
    # Compare processor records with processor records, and controller / joint
    # controller records (both Art. 30(1)) with each other.
    group = is_processor(pa)
    cand = tokens(summary_text(pa))
    best = None
    for rec in existing:
        if is_processor(rec) != group:
            continue
        score = jaccard(cand, tokens(summary_text(rec)))
        if best is None or score > best[1]:
            best = (rec, score)
    if best and best[1] >= DUPLICATE_THRESHOLD:
        return {"id": best[0].get("id"), "name": best[0].get("name"), "score": round(best[1], 3)}
    return None


# ---- posture ----

def corpus(pa):
    # Same text as lib/posture.ts corpus().
    subjects = " ".join(pa.get("dataSubjectCategories") or [])
    return f"{text(pa.get('name'))} {text(pa.get('description'))} {text(pa.get('purpose'))} {subjects}".lower()


def has_any(haystack, needles):
    return any(n in haystack for n in needles)


def is_transferring(value):
    v = text(value).lower()
    if not v:
        return False
    return not re.match(r"^(none|no\b|n/a|not applicable|domestic|within)", v)


def days_since(iso):
    if not iso:
        return None
    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - d).days


def evaluate_condition(pa, key, pdcs):
    corp = corpus(pa)
    rels = pa.get("relationships", [])
    if key == "specialCategory":
        special_ids = {p["id"] for p in pdcs if p.get("sensitivity") == "special"}
        special_names = [p["name"].lower() for p in pdcs if p.get("sensitivity") == "special"]
        via_rel = any(
            r.get("type") == "personalData"
            and r.get("status") != "rejected"
            and (
                (r.get("inventoryId") and r["inventoryId"] in special_ids)
                or any(n in r.get("name", "").lower() for n in special_names)
            )
            for r in rels
        )
        return via_rel or has_any(corp, SPECIAL_TEXT_KEYWORDS)
    if key == "internationalTransfer":
        return is_transferring(pa.get("internationalTransfers"))
    if key == "legitimateInterests":
        # A processor has no lawful basis of its own: the Art. 6(1)(f) balancing
        # test is the controller's (Art. 30(2) has no legal basis field).
        return not is_processor(pa) and pa.get("legalBasis") == "Legitimate interests"
    if key == "automatedDecisions":
        return has_any(corp, AI_KEYWORDS)
    if key == "largeScale":
        return has_any(corp, LARGE_SCALE_KEYWORDS)
    if key == "systematicMonitoring":
        return has_any(corp, MONITORING_KEYWORDS)
    if key == "vulnerableSubjects":
        return has_any(corp, VULNERABLE_KEYWORDS)
    if key == "newActivity":
        if pa.get("status", "draft") == "draft":
            return True
        age = days_since(pa.get("createdAt"))
        return age is not None and age < 90
    return False


def matches_rule(logic, conditions, active):
    if not conditions:
        return False
    if logic == "all":
        return all(c in active for c in conditions)
    return any(c in active for c in conditions)


def cadence_label(days):
    if days % 365 == 0:
        y = days // 365
        return "Annually" if y == 1 else f"Every {y} years"
    if days % 30 == 0:
        m = days // 30
        return "Monthly" if m == 1 else f"Every {m} months"
    return f"Every {days} days"


def resolve_cadence(active, posture):
    for rule in posture.get("cadenceRules", []):
        if rule.get("enabled") and matches_rule(rule.get("logic", "any"), rule.get("conditions", []), active):
            d = rule["cadenceDays"]
            return {"cadenceDays": d, "label": cadence_label(d), "rule": rule["label"], "isDefault": False}
    d = posture.get("defaultCadenceDays", 365)
    return {"cadenceDays": d, "label": cadence_label(d), "rule": "Default cadence", "isDefault": True}


def required_assessments(active, posture, processor=False):
    out = []
    for rule in posture.get("assessmentRules", []):
        if rule.get("enabled") and matches_rule(rule.get("logic", "any"), rule.get("conditions", []), active):
            item = {
                "type": rule["type"],
                "name": ASSESSMENT_NAME.get(rule["type"], rule["type"]),
                "triggeredBy": [CONDITION_LABEL[c] for c in rule["conditions"] if c in active],
                "note": rule.get("note"),
            }
            if processor:
                item["owner"] = PROCESSOR_ASSESSMENT_OWNER.get(rule["type"], "Processor")
            out.append(item)
    return out


# ---- validation ----

def validate(pa, active):
    warnings = []

    def warn(field, severity, issue):
        warnings.append({"field": field, "severity": severity, "issue": issue})

    transfers = pa.get("internationalTransfers")
    if is_transferring(transfers):
        if not TRANSFER_SAFEGUARD.search(text(transfers)):
            warn("internationalTransfers", "warning",
                 "A transfer is described but no safeguard is named (SCCs, adequacy decision, BCRs, DPF, Art. 49 derogation).")
        if not TRANSFER_DESTINATION.search(text(transfers)):
            warn("internationalTransfers", "warning",
                 "Name the destination third country or international organisation (Art. 30(1)(e) / 30(2)(c)).")

    if is_processor(pa):
        return warnings + validate_processor(pa, active)

    lb = text(pa.get("legalBasis"))
    if lb and lb not in LEGAL_BASES:
        warn("legalBasis", "critical", f'"{lb}" is not a recognised Art. 6 basis. Use one of: {", ".join(LEGAL_BASES)}.')

    retention = text(pa.get("retentionPeriod"))
    if retention and not CONCRETE_PERIOD.search(retention):
        warn("retentionPeriod", "warning", "Retention is described but has no concrete period or trigger.")

    if "specialCategory" in active:
        issue = "Special-category (Art. 9) data is present — document the Art. 9(2) condition relied on."
        if lb == "Legitimate interests":
            issue += " Legitimate interests alone is not sufficient for special-category data."
            warn("legalBasis", "critical", issue)
        else:
            warn("legalBasis", "warning", issue)

    if "automatedDecisions" in active:
        warn("purpose", "info",
             "AI / automated-decision keywords detected — confirm whether decisions with legal or similarly significant effects are made (Art. 22).")

    if not text(pa.get("controllerDetails")):
        warn("controllerDetails", "info",
             "Controller (and DPO / representative) name and contact details are required by Art. 30(1)(a).")

    if is_joint(pa):
        joint = joint_controllers_of(pa)
        for c in joint:
            if not text(c.get("contact")):
                warn("jointControllers", "warning",
                     f'Joint controller "{c["name"]}" has no contact details (Art. 30(1)(a)).')
        arrangement = " ".join([text(pa.get("jointArrangement")), text(pa.get("roleDetail")),
                                text(pa.get("description")), text(pa.get("securityMeasures"))])
        if not JOINT_ARRANGEMENT.search(arrangement):
            warn("jointArrangement", "warning",
                 "No joint-controller arrangement is referenced — Art. 26 requires one setting out each party's "
                 "responsibilities, with its essence made available to data subjects.")

    return warnings


def validate_processor(pa, active):
    warnings = []

    def warn(field, severity, issue):
        warnings.append({"field": field, "severity": severity, "issue": issue})

    for c in controllers_of(pa):
        if not text(c.get("contact")):
            warn("controllers", "warning",
                 f'Controller "{c["name"]}" has no contact details (Art. 30(2)(a)).')

    if len(controllers_of(pa)) > 1 and not pa.get("processingCategories"):
        if not all(c.get("processingCategories") for c in controllers_of(pa)):
            warn("processingCategories", "warning",
                 "Several controllers are listed — record the categories of processing carried out for each (Art. 30(2)(b)).")

    for key, label in (("legalBasis", "legal basis"), ("purpose", "purpose"), ("retentionPeriod", "retention period")):
        value = text(pa.get(key))
        # Values that already defer to the controller (e.g. "Per client DPA") are fine.
        if value and not DEFERS_TO_CONTROLLER.search(value):
            warn(key, "info",
                 f"A {label} is set, but in a processor record the controller decides this. "
                 "Keep it as a reference to the controller's instructions, or remove it.")

    if not text(pa.get("dpaReference")):
        warn("dpaReference", "info",
             "No data processing agreement is referenced — processing must be governed by a contract under Art. 28(3).")

    sub_processors = [r.get("name") for r in pa.get("relationships", [])
                      if r.get("type") == "vendor" and r.get("status") != "rejected"]
    if sub_processors:
        warn("subProcessors", "info",
             f"Sub-processors engaged ({', '.join(sub_processors)}) — confirm the controller's prior written "
             "authorisation and flow-down terms (Art. 28(2) and 28(4)).")

    if "specialCategory" in active:
        warn("processingCategories", "warning",
             "Special-category (Art. 9) data is processed — confirm the controller's instructions cover it "
             "and that security measures reflect the higher risk (Art. 32).")

    if "automatedDecisions" in active:
        warn("processingCategories", "info",
             "AI / automated-decision keywords detected — confirm whether the service makes or supports decisions "
             "about individuals, so the controller can meet Art. 22.")

    return warnings


def check_entity(pa, subsidiaries):
    """Resolve the owning legal entity (prototype: subsidiaryId -> Subsidiary)."""
    warnings = []
    sid = text(pa.get("subsidiaryId"))
    if not sid:
        return None, warnings
    by_id = {s["id"]: s for s in subsidiaries}
    entity = by_id.get(sid)
    if subsidiaries and not entity:
        warnings.append({"field": "subsidiaryId", "severity": "warning",
                         "issue": f'"{sid}" is not a known subsidiary in the organisation structure.'})
        return {"id": sid, "resolved": False}, warnings
    if not entity:
        return {"id": sid, "resolved": False}, warnings

    chain, current = [], entity
    while current:
        chain.insert(0, current["name"])
        current = by_id.get(current.get("parentId"))

    if entity.get("kind") == "regional":
        warnings.append({"field": "subsidiaryId", "severity": "info",
                         "issue": f'"{entity["name"]}" is a regional grouping. Controllers and processors are legal '
                                  "entities, so confirm which entity owns this record."})
    if not text(pa.get("jurisdiction")) and entity.get("jurisdiction"):
        warnings.append({"field": "jurisdiction", "severity": "info",
                         "issue": f'Jurisdiction is blank — the owning entity is in {entity["jurisdiction"]}.'})
    return {"id": sid, "resolved": True, "name": entity["name"], "kind": entity.get("kind"),
            "jurisdiction": entity.get("jurisdiction"), "path": " › ".join(chain)}, warnings


# ---- main ----

def load(path, default):
    if not path:
        return default
    with open(path) as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("record", help="Draft record JSON")
    ap.add_argument("--inventory", help="Inventory JSON (vendors, assets, personalDataCategories)")
    ap.add_argument("--posture", help="Posture config JSON")
    ap.add_argument("--existing", help="JSON list of existing records, for duplicate detection")
    args = ap.parse_args()

    pa = load(args.record, None)
    inventory = load(args.inventory, {})
    posture = load(args.posture, {"defaultCadenceDays": 365, "cadenceRules": [], "assessmentRules": []})
    existing = load(args.existing, [])
    pdcs = inventory.get("personalDataCategories", [])
    processor = is_processor(pa)

    if processor:
        labels, order, optional = PROCESSOR_FIELD_LABELS, PROCESSOR_FIELD_ORDER, PROCESSOR_OPTIONAL
    else:
        labels, order, optional = FIELD_LABELS, FIELD_ORDER, OPTIONAL_FIELDS

    # Resolve relationships against the inventory (mutates a copy used for posture).
    rel_report = []
    for r in pa.get("relationships", []):
        if inventory and not r.get("inventoryId"):
            r["inventoryId"] = resolve_inventory(r.get("type"), r.get("name", ""), inventory)
        pdc = next((p for p in pdcs if p["id"] == r.get("inventoryId")), None)
        rel_report.append({
            "type": r.get("type"),
            "relationshipRole": "sub-processor" if processor and r.get("type") == "vendor" else None,
            "name": r.get("name"),
            "inventoryId": r.get("inventoryId"),
            "resolved": bool(r.get("inventoryId")),
            "special": bool(pdc and pdc.get("sensitivity") == "special"),
            "confidence": r.get("confidence"),
            "band": BAND_LABEL[confidence_band(r["confidence"])] if isinstance(r.get("confidence"), (int, float)) else None,
        })
    if not processor:
        for item in rel_report:
            del item["relationshipRole"]

    meta = pa.get("fieldMeta", {})
    fields = []
    gaps = []
    for key in order:
        filled = is_filled(pa, key)
        c = meta.get(key, {}).get("confidence")
        fields.append({
            "key": key,
            "label": labels[key],
            "filled": filled,
            "confidence": c,
            "band": BAND_LABEL[confidence_band(c)] if isinstance(c, (int, float)) and filled else None,
        })
        if not filled and key not in optional:
            gaps.append(labels[key])

    if not processor:
        rels = pa.get("relationships", [])
        if not any(r.get("type") in ("vendor", "asset") for r in rels):
            gaps.append("At least one vendor or application/asset")
        if not any(r.get("type") == "personalData" for r in rels):
            gaps.append("At least one personal data category")
    if is_joint(pa) and not joint_controllers_of(pa):
        gaps.append("Joint controllers (Art. 26 / 30(1)(a))")

    entity, entity_warnings = check_entity(pa, inventory.get("subsidiaries", []))
    if not entity:
        gaps.append("Owning legal entity (subsidiary)")

    active = [k for k in CONDITION_ORDER if evaluate_condition(pa, k, pdcs)]
    active_set = set(active)

    role = role_of(pa)
    report = {
        "role": role,
        "roleLabel": ROLE_LABEL[role],
        "roleDetail": text(pa.get("roleDetail")) or None,
        "owningEntity": entity,
        "completeness": completeness(pa),
        "incomplete": completeness(pa) < 80,
        "gaps": gaps,
        "lowConfidence": [f["label"] for f in fields if f["band"] == "Low confidence"],
        "needsReview": [f["label"] for f in fields if f["band"] == "Needs review"],
        "fields": fields,
        "relationships": rel_report,
        "unresolvedRelationships": [f'{r["type"]}: {r["name"]}' for r in rel_report if inventory and not r["resolved"]],
        "validation": validate(pa, active_set) + entity_warnings,
        "possibleDuplicate": find_duplicate(pa, existing) if existing else None,
        "posture": {
            "activeConditions": [CONDITION_LABEL[k] for k in active],
            "requiredAssessments": required_assessments(active_set, posture, processor),
            "reviewCadence": resolve_cadence(active_set, posture),
            "requireCertification": posture.get("requireCertification", False),
        },
    }
    if processor:
        report["controllers"] = [
            {"name": c["name"], "hasContact": bool(text(c.get("contact"))),
             "processingCategories": c.get("processingCategories") or pa.get("processingCategories") or []}
            for c in controllers_of(pa)
        ]
    if is_joint(pa):
        report["jointControllers"] = [
            {"name": c["name"], "hasContact": bool(text(c.get("contact")))} for c in joint_controllers_of(pa)
        ]
    json.dump(report, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
