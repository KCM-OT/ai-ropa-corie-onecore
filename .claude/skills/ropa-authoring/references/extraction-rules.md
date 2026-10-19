# Extraction rules

Source: the system prompts in `lib/agent/extract.ts` and `app/api/scan/route.ts`, plus the
heuristics in `lib/mock-scan.ts`.

## Core rules
- Extract attributes **only** from what the user said or the document states.
- Never fabricate. If nothing supports a field, omit it — that's a follow-up question, not a guess.
- `legalBasis` must be one of the six Art. 6 bases (see `fields.md`).
- `evidence` is a short verbatim phrase copied from the source.
- `rationale` is one short sentence explaining the extraction.
- For list fields (data subject categories) use a list.
- Flag special-category (Art. 9) data clearly in the rationale.
- In **enrich** mode (updating an existing record), extract only new or changed attributes and
  relationships for that record.

## Confidence calibration
| Situation | Confidence |
|---|---|
| Value stated explicitly (e.g. under a "Purpose:" or "Retention:" label) | ≥ 0.85 |
| Strongly implied | 0.60 – 0.84 |
| Weak inference | < 0.60 |

Reference points from the prototype's rule-based extractor:
| Evidence | Confidence |
|---|---|
| Labelled "Purpose:" | 0.92 |
| Legal basis mentioned near "legal basis" | 0.90; mentioned elsewhere 0.70 |
| Labelled "Retention:" | 0.89; inferred from a retain/delete sentence 0.65 |
| Labelled "Data subjects:" | 0.88; inferred from subject nouns 0.68 |
| Named owner under "Owner:" | 0.87; team named alongside 0.82 |
| Labelled "Processing location" / "International transfers" | 0.86; inferred from an SCC / "outside the EU" sentence 0.71 |
| Labelled "Overview" / "Description" | 0.85; inferred from opening paragraph 0.58 |
| Labelled "Recipients" / "Data sharing" | 0.83 |
| Name from document title | 0.80 |
| Security controls named | 0.78 |
| Country/region named | 0.75 ("Global" 0.55) |
| Vendor named | 0.91 |
| Asset named | 0.84 (generic "mobile app" 0.72) |
| Personal-data category | 0.87 (special category 0.80) |

## Label aliases worth looking for
| Field | Labels |
|---|---|
| description | Overview, Description |
| purpose | Purpose (fallback: first sentence of Overview, 0.74) |
| businessProcessOwner / managingOrganization | Owner, Process owner, Business owner — "Name, Team" |
| dataSubjectCategories | Data subjects |
| retentionPeriod | Retention |
| recipients | Recipients, Data sharing |
| internationalTransfers | Processing location, International transfers |

## Relationships
- **vendor** — third-party companies and processors (e.g. Workday, Zendesk, AWS, a named SaaS tool)
- **asset** — internal systems, applications, data stores (e.g. HRIS, Data Warehouse, Mobile App)
- **personalData** — categories of personal data (e.g. Name, Email address, Health data)

Match each relationship against the tenant inventory if one is provided. Anything without a match
is **unresolved**. Say so, and ask whether it should be added to the inventory.

### Standard personal-data categories and cues
| Category | Cues |
|---|---|
| Name | full name, employee name, customer's name |
| Email address | email address, work email |
| Phone number | phone number |
| Postal address | postal / mailing address |
| IP address | ip address |
| Location data | location data, approximate location, geolocation |
| Device identifiers | device identifier, push token |
| Payment card data | payment card, card details |
| Government ID number | government id, passport number, national id |
| Employment records | employee id, employment record, work history, resume |
| Video interview recordings | interview recordings, recorded interviews |
| Financial account data | financial / bank account |
| **Health data** (special) | health data, mental health, counseling, medical, health assessment |
| **Biometric data** (special) | biometric |
| **Racial or ethnic origin** (special) | racial, ethnic origin, ethnicity |

### Security measure vocabulary
End-to-end encryption; encryption at rest and in transit; encryption in transit; encryption;
tokenization; pseudonymization; RBAC; SSO; MFA / multi-factor; access control; audit logging;
PCI-DSS; ISO 27001. Prefer the most specific phrase ("end-to-end encryption" over "encryption").

### Document kind
Guess the source type: Vendor contract (DPA, "processor"), DPIA ("impact assessment"),
Intake form, Project brief, Process description, or Document.
