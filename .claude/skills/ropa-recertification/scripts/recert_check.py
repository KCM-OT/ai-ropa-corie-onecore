#!/usr/bin/env python3
"""Deterministic checks for a RoPA recertification submission.

Usage:
  python3 recert_check.py SUBMISSION.json --record RECORD.json
         [--inventory INVENTORY.json] [--today YYYY-MM-DD] [--json] [--emit-record OUT.json]

What it does (mirrors lib/recert.ts, lib/ropa.ts and the follow-up fallback rules):
  1. Validates the submission shape, enums and field keys
  2. Checks `decision` is consistent with the change count
  3. Warns on stale "before" values, no-op edits, duplicate or contradictory changes
  4. Resolves added relationships against an optional inventory ("new to inventory")
  5. Previews exactly what a commit would do (applySubmission)
  6. Suggests follow-up questions (same rules as /api/recert/follow-ups fallback)
  7. Emits risk / assessment hints for the analyst

Standard library only. Exit code 1 if there are errors, else 0.
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone

FIELD_KEYS = [
    "name", "description", "purpose", "legalBasis", "managingOrganization",
    "businessProcessOwner", "dataSubjectCategories", "retentionPeriod",
    "recipients", "internationalTransfers", "securityMeasures", "jurisdiction",
]
LEGAL_BASES = [
    "Consent", "Contract", "Legal obligation", "Vital interests",
    "Public task", "Legitimate interests",
]
STATUSES = ["pending_review", "changes_requested", "approved", "committed"]
DECISIONS = ["approved_as_is", "modified"]
REL_TYPES = ["vendor", "asset", "personalData"]
REL_ACTIONS = ["added", "removed"]
CHANNELS = ["teams", "slack"]
AUDIENCES = ["business_process_owner", "application_owner", "vendor_owner"]
FU_STATUSES = ["draft", "sent", "answered"]

SPECIAL_CUES = [
    "health", "biometric", "ethnic", "racial", "genetic", "religio",
    "political", "sexual", "trade union", "criminal",
]
AI_CUES = ["ai ", " ai", "artificial intelligence", "machine learning", "scoring",
           "profiling", "automated decision", "algorithm", "predict"]
MONITOR_CUES = ["monitor", "tracking", "surveillance", "behavioural", "behavioral"]
VULNERABLE_CUES = ["child", "minor", "student", "patient", "vulnerable"]
VAGUE_VALUES = ["until no longer needed", "as long as necessary", "tbd", "n/a", "unknown"]
NO_TRANSFER_PREFIXES = ("none", "no", "n/a", "not applicable", "domestic", "within")


def field_value(rec, key):
    v = rec.get(key, "")
    if isinstance(v, list):
        return ", ".join(v)
    return v or ""


def rel_key(t, name):
    return (t, (name or "").strip().lower())


def parse_dt(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def review_state(rec, today):
    nxt = parse_dt(rec.get("nextReviewAt"))
    if not nxt:
        return "none", None
    days = (nxt.date() - today).days
    if days < 0:
        return "overdue", days
    if days <= 30:
        return "due_soon", days
    return "ok", days


def check(sub, rec, inventory, today):
    errors, warnings, notes = [], [], []

    # ---- shape ----
    for k in ["id", "recordId", "recordName", "submittedBy", "submittedRole", "submittedAt",
              "status", "decision", "ownerNote", "fieldChanges", "relationshipChanges", "followUps"]:
        if k not in sub:
            errors.append(f"Missing required property '{k}'.")
    if sub.get("status") not in STATUSES:
        errors.append(f"status '{sub.get('status')}' is not one of {STATUSES}.")
    if sub.get("decision") not in DECISIONS:
        errors.append(f"decision '{sub.get('decision')}' is not one of {DECISIONS}.")
    if sub.get("recordId") != rec.get("id"):
        errors.append(f"Submission recordId '{sub.get('recordId')}' does not match record id '{rec.get('id')}'.")
    if sub.get("recordName") and sub.get("recordName") != rec.get("name"):
        warnings.append("recordName differs from the record's current name.")
    if not (sub.get("ownerNote") or "").strip():
        warnings.append("ownerNote is empty; the analyst loses the owner's own words.")

    fcs = sub.get("fieldChanges", []) or []
    rcs = sub.get("relationshipChanges", []) or []
    count = len(fcs) + len(rcs)

    expected = "modified" if count > 0 else "approved_as_is"
    if sub.get("decision") in DECISIONS and sub["decision"] != expected:
        errors.append(
            f"decision is '{sub['decision']}' but there are {count} change(s); expected '{expected}'."
        )

    # ---- field changes ----
    seen_fields = set()
    for i, fc in enumerate(fcs):
        tag = f"fieldChanges[{i}]"
        key = fc.get("key")
        if key not in FIELD_KEYS:
            errors.append(f"{tag}: key '{key}' is not one of the 12 changeable fields.")
            continue
        if key in seen_fields:
            errors.append(f"{tag}: '{key}' is changed more than once; merge into a single change.")
        seen_fields.add(key)
        current = field_value(rec, key)
        before, after = fc.get("before", ""), fc.get("after", "")
        if before.strip() != current.strip():
            warnings.append(f"{tag}: 'before' for {key} is stale. Submitted '{before}', record now has '{current}'.")
        if after.strip() == current.strip():
            warnings.append(f"{tag}: '{key}' after equals the current value; this is a no-op.")
        if not after.strip():
            warnings.append(f"{tag}: '{key}' is being cleared. Confirm that is intended.")
        if key == "legalBasis" and after and after not in LEGAL_BASES:
            errors.append(f"{tag}: legalBasis '{after}' is not one of {LEGAL_BASES}.")
        if key == "retentionPeriod" and after.strip().lower() in VAGUE_VALUES:
            warnings.append(f"{tag}: retention '{after}' is vague; ask for a concrete period.")
        if fc.get("label") is None:
            warnings.append(f"{tag}: missing display label.")

    # ---- relationship changes ----
    existing = {rel_key(r["type"], r["name"]): r for r in rec.get("relationships", [])}
    seen_rels = {}
    for i, rc in enumerate(rcs):
        tag = f"relationshipChanges[{i}]"
        if rc.get("action") not in REL_ACTIONS:
            errors.append(f"{tag}: action '{rc.get('action')}' is not one of {REL_ACTIONS}.")
            continue
        if rc.get("type") not in REL_TYPES:
            errors.append(f"{tag}: type '{rc.get('type')}' is not one of {REL_TYPES}.")
            continue
        k = rel_key(rc["type"], rc.get("name"))
        if not k[1]:
            errors.append(f"{tag}: name is empty.")
            continue
        if k in seen_rels:
            if seen_rels[k] == rc["action"]:
                errors.append(f"{tag}: duplicate '{rc['action']}' for {rc['type']} '{rc['name']}'.")
            else:
                errors.append(f"{tag}: {rc['type']} '{rc['name']}' is both added and removed.")
        seen_rels[k] = rc["action"]
        if rc["action"] == "removed" and k not in existing:
            warnings.append(f"{tag}: removing {rc['type']} '{rc['name']}' which is not on the record.")
        if rc["action"] == "added" and k in existing:
            warnings.append(f"{tag}: adding {rc['type']} '{rc['name']}' which is already on the record.")
        if rc["action"] == "added":
            inv_id = rc.get("inventoryId")
            matched = None
            if inventory:
                pool = {"vendor": "vendors", "asset": "assets", "personalData": "personalDataCategories"}[rc["type"]]
                for item in inventory.get(pool, []):
                    if item["name"].strip().lower() == k[1]:
                        matched = item["id"]
                        break
            if inv_id is None and matched:
                warnings.append(f"{tag}: '{rc['name']}' exists in the inventory as {matched} but inventoryId is null.")
            if inv_id and inventory and matched and inv_id != matched:
                warnings.append(f"{tag}: inventoryId {inv_id} differs from the inventory match {matched}.")
            if inv_id is None and not matched:
                notes.append(f"New to inventory: {rc['type']} '{rc['name']}'. Decide whether to add it.")

    # ---- follow-ups ----
    for i, f in enumerate(sub.get("followUps", []) or []):
        tag = f"followUps[{i}]"
        if f.get("channel") not in CHANNELS:
            errors.append(f"{tag}: channel '{f.get('channel')}' is not one of {CHANNELS}.")
        if f.get("audience") not in AUDIENCES:
            errors.append(f"{tag}: audience '{f.get('audience')}' is not one of {AUDIENCES}.")
        if f.get("status") not in FU_STATUSES:
            errors.append(f"{tag}: status '{f.get('status')}' is not one of {FU_STATUSES}.")
        if f.get("status") == "answered" and not f.get("response"):
            warnings.append(f"{tag}: marked answered but has no response.")
        if f.get("status") in ("sent", "answered") and not f.get("sentAt"):
            warnings.append(f"{tag}: {f.get('status')} but sentAt is missing.")
    open_fu = [f for f in sub.get("followUps", []) or [] if f.get("status") == "sent"]
    if open_fu:
        warnings.append(f"{len(open_fu)} follow-up(s) still awaiting a reply; consider waiting before commit.")

    # ---- commit preview (applySubmission) ----
    rels = [dict(r) for r in rec.get("relationships", [])]
    for rc in rcs:
        if rc.get("type") not in REL_TYPES or rc.get("action") not in REL_ACTIONS:
            continue
        k = rel_key(rc["type"], rc.get("name"))
        if rc["action"] == "removed":
            rels = [r for r in rels if rel_key(r["type"], r["name"]) != k]
        elif not any(rel_key(r["type"], r["name"]) == k for r in rels):
            rels.append({
                "id": "rel-(new)", "type": rc["type"], "name": rc["name"],
                "inventoryId": rc.get("inventoryId"), "provenance": "manual", "status": "accepted",
            })
    patched = json.loads(json.dumps(rec))
    patched["relationships"] = rels
    meta = dict(rec.get("fieldMeta", {}) or {})
    for fc in fcs:
        key = fc.get("key")
        if key not in FIELD_KEYS:
            continue
        if key == "dataSubjectCategories":
            patched[key] = [s.strip() for s in fc.get("after", "").split(",") if s.strip()]
        else:
            patched[key] = fc.get("after", "")
        meta[key] = {"provenance": "manual"}
    patched["fieldMeta"] = meta
    cadence = rec.get("reviewCadenceDays") or 180
    now = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
    patched["lastReviewedAt"] = now.isoformat().replace("+00:00", "Z")
    patched["nextReviewAt"] = (now + timedelta(days=cadence)).isoformat().replace("+00:00", "Z")
    patched["status"] = "active"
    patched["updatedWithAI"] = True

    # ---- follow-up suggestions (mirrors /api/recert/follow-ups fallback) ----
    suggestions = []
    for rc in rcs:
        if rc.get("action") == "added" and rc.get("type") == "vendor":
            suggestions.append({
                "question": f'A new vendor "{rc["name"]}" was added. Is there a signed DPA, and where is data hosted?',
                "audience": "vendor_owner", "channel": "teams",
                "rationale": "New processors need a DPA and transfer review before the record is committed.",
            })
        if rc.get("action") == "removed" and rc.get("type") == "personalData":
            suggestions.append({
                "question": f'You removed "{rc["name"]}". Has all historical data of this type been deleted or is it still retained anywhere?',
                "audience": "business_process_owner", "channel": "slack",
                "rationale": "Removing a data element from collection does not always mean retained data is purged.",
            })
        if rc.get("action") == "added" and rc.get("type") == "personalData":
            suggestions.append({
                "question": f'You added "{rc["name"]}". What is the legal basis for collecting this, and for which data subjects?',
                "audience": "business_process_owner", "channel": "slack",
                "rationale": "New personal data can change the legal basis and required assessments.",
            })
    if not suggestions:
        suggestions.append({
            "question": "Can you confirm nothing about the systems, vendors, or data has changed since last year?",
            "audience": "business_process_owner", "channel": "teams",
            "rationale": "An approve-as-is submission still benefits from a quick confirmation.",
        })
    suggestions = suggestions[:4]

    # ---- risk hints ----
    hints = []
    for rc in rcs:
        n = (rc.get("name") or "").lower()
        if rc.get("action") == "added" and rc.get("type") == "personalData" and any(c in n for c in SPECIAL_CUES):
            hints.append(f"Added possible special-category data '{rc['name']}': consider PIA/DPIA, PbD review and the 180-day tier.")
        if rc.get("action") == "added" and rc.get("type") == "vendor":
            hints.append(f"New vendor '{rc['name']}': confirm DPA, hosting location and any international transfer (TIA).")
        if rc.get("action") == "added" and any(c in n for c in AI_CUES):
            hints.append(f"'{rc['name']}' suggests automated decisions or AI: consider PIA/DPIA, PbD and AI Risk Assessment.")
    for fc in fcs:
        key, after = fc.get("key"), (fc.get("after") or "")
        low = f" {after.lower()} "
        if key == "legalBasis" and after == "Legitimate interests":
            hints.append("Legal basis changed to Legitimate interests: a Legitimate Interests Assessment (LIA) is required.")
        if key == "internationalTransfers" and after.strip() and not after.strip().lower().startswith(NO_TRANSFER_PREFIXES):
            hints.append("International transfer now stated: a Transfer Impact Assessment (TIA) is required; 270-day tier at least.")
        if key in ("purpose", "description") and any(c in low for c in AI_CUES):
            hints.append(f"{key} now mentions AI or automated scoring: PIA/DPIA, PbD and AI Risk Assessment likely required.")
        if key in ("purpose", "description") and any(c in low for c in MONITOR_CUES):
            hints.append(f"{key} now mentions monitoring or tracking: systematic monitoring triggers PIA/DPIA and the 180-day tier.")
        if key == "dataSubjectCategories" and any(c in low for c in VULNERABLE_CUES):
            hints.append("Data subjects now include a vulnerable group: PIA/DPIA and at least the 270-day tier.")
        if key == "businessProcessOwner":
            notes.append("Ownership changed: confirm the new owner agrees and update governance contacts.")
    if not hints:
        hints.append("No new risk conditions detected from the changes. Re-run posture after commit to confirm.")

    state, days = review_state(rec, today)
    return {
        "review_state_before": state,
        "days_until_next_review": days,
        "change_count": count,
        "expected_decision": expected,
        "errors": errors,
        "warnings": warnings,
        "notes": notes,
        "open_follow_ups": len(open_fu),
        "commit_preview": {
            "changed_fields": {fc["key"]: {"before": field_value(rec, fc["key"]), "after": field_value(patched, fc["key"])}
                               for fc in fcs if fc.get("key") in FIELD_KEYS},
            "relationships_after": [f'{r["type"]}: {r["name"]}' for r in rels],
            "lastReviewedAt": patched["lastReviewedAt"],
            "nextReviewAt": patched["nextReviewAt"],
            "cadenceDaysUsed": cadence,
            "status": "active",
            "submission_status": "committed",
        },
        "suggested_follow_ups": suggestions,
        "risk_hints": hints,
        "_patched": patched,
    }


def print_report(r, sub):
    print(f"Recertification check: {sub.get('recordName')}  ({sub.get('id')})")
    print(f"  Review state before: {r['review_state_before']}"
          + (f" ({r['days_until_next_review']} days)" if r["days_until_next_review"] is not None else ""))
    print(f"  Changes: {r['change_count']}   Decision: {sub.get('decision')} (expected {r['expected_decision']})")
    print(f"  Open follow-ups: {r['open_follow_ups']}")
    for title, key in [("ERRORS", "errors"), ("WARNINGS", "warnings"), ("NOTES", "notes")]:
        items = r[key]
        print(f"\n{title}: {'none' if not items else ''}")
        for it in items:
            print(f"  - {it}")
    cp = r["commit_preview"]
    print("\nCOMMIT PREVIEW")
    for k, v in cp["changed_fields"].items():
        print(f"  {k}: '{v['before']}' -> '{v['after']}'")
    print(f"  relationships after: {', '.join(cp['relationships_after']) or 'none'}")
    print(f"  lastReviewedAt: {cp['lastReviewedAt']}")
    print(f"  nextReviewAt:   {cp['nextReviewAt']}  (cadence {cp['cadenceDaysUsed']} days)")
    print("\nSUGGESTED FOLLOW-UPS")
    for s in r["suggested_follow_ups"]:
        print(f"  - [{s['audience']} via {s['channel']}] {s['question']}")
        print(f"      why: {s['rationale']}")
    print("\nRISK / ASSESSMENT HINTS")
    for h in r["risk_hints"]:
        print(f"  - {h}")


def main():
    ap = argparse.ArgumentParser(description="Check a RoPA recertification submission.")
    ap.add_argument("submission")
    ap.add_argument("--record", required=True)
    ap.add_argument("--inventory")
    ap.add_argument("--today", help="YYYY-MM-DD (default: today, UTC)")
    ap.add_argument("--json", action="store_true", help="print JSON instead of text")
    ap.add_argument("--emit-record", help="write the post-commit record JSON to this path")
    a = ap.parse_args()

    with open(a.submission) as f:
        sub = json.load(f)
    with open(a.record) as f:
        rec = json.load(f)
    inv = None
    if a.inventory:
        with open(a.inventory) as f:
            inv = json.load(f)
    today = date.fromisoformat(a.today) if a.today else datetime.now(timezone.utc).date()

    r = check(sub, rec, inv, today)
    patched = r.pop("_patched")
    if a.emit_record:
        with open(a.emit_record, "w") as f:
            json.dump(patched, f, indent=2)
    if a.json:
        print(json.dumps(r, indent=2))
    else:
        print_report(r, sub)
    sys.exit(1 if r["errors"] else 0)


if __name__ == "__main__":
    main()
