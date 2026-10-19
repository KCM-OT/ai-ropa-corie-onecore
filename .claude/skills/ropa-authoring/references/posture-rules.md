# Posture rules: assessments and review cadence

Source: `lib/posture.ts` and `DEFAULT_POSTURE` in `lib/seed.ts`. `scripts/ropa_check.py`
implements these exactly. This file explains them so you can describe the outcome to the user.

In the prototype these rules stand in for a future integration with a separate risk/posture
product. They're configurable: pass a different `--posture` JSON to change them.

## Risk conditions
The **text corpus** is: name + description + purpose + data subject categories, lowercased.

| Condition | Label | Triggered when |
|---|---|---|
| `specialCategory` | Special-category data | A non-rejected personal-data relationship is a special category in the inventory (or its name contains one), **or** the corpus contains health, biometric, ethnic, racial or genetic |
| `internationalTransfer` | International transfer | `internationalTransfers` is non-empty and doesn't start with none / no / n/a / not applicable / domestic / within |
| `legitimateInterests` | Legitimate interests basis | `legalBasis` = Legitimate interests |
| `automatedDecisions` | Automated decisions / AI | Corpus contains: ai, artificial intelligence, machine learning, model, algorithm, automated decision(-making), profiling, scoring, predict, recommendation engine |
| `largeScale` | Large-scale processing | large-scale, large scale, nationwide, millions, all customers, all users, entire user base, across all, high volume |
| `systematicMonitoring` | Systematic monitoring | monitor, monitoring, tracking, "track ", surveillance, observ, behavioral, behaviour, geolocation tracking |
| `vulnerableSubjects` | Vulnerable data subjects | child, children, minor, student, patient, vulnerable, elderly |
| `newActivity` | New / draft activity | Status is draft, or created within the last 90 days |

Keyword matching is plain substring matching, so "ai" also matches inside words like "maintain".
That's a known prototype quirk; treat `automatedDecisions` hits as prompts to confirm with the user.

## Assessment triggers (default)
| Assessment | Required when any of |
|---|---|
| **PIA / DPIA** (Art. 35) | specialCategory, largeScale, systematicMonitoring, automatedDecisions, vulnerableSubjects |
| **LIA** — Legitimate Interests Assessment | legitimateInterests |
| **TIA** — Transfer Impact Assessment | internationalTransfer |
| **PbD** — Privacy by Design Review | newActivity, specialCategory, automatedDecisions |
| **AI Risk Assessment** | automatedDecisions |

## Review cadence (default)
Rules are evaluated in order, and the first match wins:
1. **High-risk activities**: specialCategory, automatedDecisions or systematicMonitoring → every 180 days
2. **Elevated (transfers / large-scale)**: internationalTransfer, largeScale or vulnerableSubjects → every 270 days
3. Otherwise the **default cadence** applies → 365 days (annually)

Certification is required at each review (`requireCertification: true`).

## Processor records
The same rules run for processor records, as in the prototype. The one difference is that each
required assessment is given an **owner** (see `processor-mode.md`). For example, a PIA/DPIA is the
controller's, with the processor assisting under Art. 28(3)(f).

## Joint-controller records
Evaluated exactly as controller records. The prototype's posture rules don't look at `role` either.
