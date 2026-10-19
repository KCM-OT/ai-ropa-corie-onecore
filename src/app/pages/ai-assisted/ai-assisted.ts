import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  OcAssistantActions,
  OcAssistantAttach,
  OcAssistantAttachmentTray,
  OcAssistantComposer,
  OcAssistantInput,
  OcAssistantMessage,
  OcAssistantScrollToBottom,
  OcAssistantStep,
  OcAssistantSteps,
  OcAssistantStepTitle,
  OcAssistantStop,
  OcAssistantSubmit,
  OcAssistantSuggestion,
  OcAssistantThinking,
  OcAssistantThread,
  OcAssistantViewport,
} from '@onetrust/onecore/assistant';
import { OcAvatar } from '@onetrust/onecore/avatar';
import { OcBadge } from '@onetrust/onecore/badge';
import { OcButton } from '@onetrust/onecore/button';
import { OcStreamDirective, type ChoreoState } from '@onetrust/onecore/choreography';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcIconButton } from '@onetrust/onecore/icon-button';
import { OcInput } from '@onetrust/onecore/input';
import { OcProgress } from '@onetrust/onecore/progress';
import { OcRadioGroup, OcRadioItem } from '@onetrust/onecore/radio';
import { OcSelect, OcSelectOption } from '@onetrust/onecore/select';
import { OcStatus } from '@onetrust/onecore/status';
import { OcTag } from '@onetrust/onecore/tag';
import { OcTextarea } from '@onetrust/onecore/textarea';
import { DraftsStore } from '../../data/drafts.store';
import { initials, SIGNED_IN_USER, SUBSIDIARIES, subsidiaryName } from '../../data/org';
import { PROCESSING_ACTIVITIES } from '../../data/processing-activities';
import { runRopaChecks, type CheckRecord, type CheckSeverity, type RopaCheckReport } from '../../data/ropa-check';
import {
  extractForSkill,
  INVENTORY,
  JOINT_SAMPLE,
  parseParties,
  POSTURE,
  PROCESSOR_SAMPLE,
  splitList,
  toCheckRecord,
  type Extraction,
  type Party,
} from '../../data/skill-draft';
import {
  CONFIRM_ALL_CHIP,
  CONFIRM_CHIP,
  normaliseLegalBasis,
  planQuestions,
  REMOVE_CHIP,
  SKIP_CHIP,
  type Question,
} from '../../data/skill-questions';
import { SAMPLE_DESCRIPTION } from '../../data/extract';
import { ROLE_HELP, ROLE_LABELS, type DraftField, type FieldMeta, type ProcessingRole, type Relationship } from '../../data/types';
import { PageHeader } from '../../shell/page-header';

// AI Assisted RoPA Creation: a conversation with the OneCore AI assistant,
// with a live draft beside it, that follows the ropa-authoring skill's
// workflow (.claude/skills/ropa-authoring/SKILL.md):
//
//   1. Gather the description   → phase 'describe' (text or an attached .txt / .md)
//   2. Role and owning entity    → phase 'details': an oc-assistant-steps chain for the
//                                  name, the owning entity and the role, pre-selecting
//                                  the role the description's cues point to
//   3. Extract a draft           → skill-draft.ts: values, confidence, verbatim evidence,
//                                  relationships, in the skill's JSON shape for the role
//   4. Run the checks            → ropa-check.ts, a parity-tested port of ropa_check.py,
//                                  re-run on every change
//   5. Close the gaps            → phase 'closing': one question at a time, planned from
//                                  the check report in the skill's priority order
//                                  (skill-questions.ts); answers re-extract and re-check
//   6. Propose the record        → phase 'ready': completeness, posture and remaining gaps,
//                                  then the user sends it to Pending inventory
//
// Every reply goes through one send() (OneCore rule AST-01). No model is
// connected: the reply text is written here and streamed word by word.

type Phase = 'describe' | 'details' | 'closing' | 'ready';
type Value = string | string[] | Party[];

interface Turn {
  id: number;
  from: 'user' | 'assistant';
  /** User turns: the message text. */
  text: string;
  /** Assistant turns: what [ocStream] reveals. */
  source?: AsyncIterable<string> | string;
  meta?: string;
}

/** Everything a turn can change, so Stop and re-edit can roll it back. */
interface Snapshot {
  phase: Phase;
  description: string;
  sourceFile: string | undefined;
  extraNarrative: string[];
  extraRelationships: Relationship[];
  userValues: Record<string, Value>;
  confirmed: string[];
  notes: Record<string, string>;
  relDecisions: Record<string, 'accepted' | 'rejected'>;
  handled: string[];
  skipped: string[];
  pending: Question | null;
  name: string;
  subsidiaryId: string | null;
  role: ProcessingRole;
  roleCue: Extraction['roleCue'];
}

interface Reply {
  text: string;
  /** Runs once the reply has finished streaming (and wasn't stopped). */
  after?: () => void;
}

interface Suggestion {
  text: string;
  /** true fills the composer to edit; false sends straight away (the click handler sends it). */
  fill: boolean;
}

const SAMPLE_CHIPS: Record<string, { text: string; name: string }> = {
  'Sample: candidate screening (controller)': { text: SAMPLE_DESCRIPTION, name: 'Candidate screening' },
  'Sample: client payroll (processor)': { text: PROCESSOR_SAMPLE, name: 'Client payroll' },
  'Sample: group HR system (joint controller)': { text: JOINT_SAMPLE, name: 'Group HR information system' },
};
const STARTERS: Suggestion[] = [
  ...Object.keys(SAMPLE_CHIPS).map((text) => ({ text, fill: false })),
  {
    text: 'Our [team] collects [data] from [people] to [purpose], using [tools], and keeps it for [time].',
    fill: true,
  },
];

const THINKING_MS = 900;
const WORD_MS = 18;
const MIN_DESCRIPTION = 60;
const SEVERITY_LABEL: Record<CheckSeverity, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' };
const SEVERITY_COLOR = { critical: 'destructive', warning: 'warning', info: 'info' } as const;
const BAND_INTENT = { 'High confidence': 'success', 'Needs review': 'warning', 'Low confidence': 'error' } as const;
const RELATIONSHIP_LABEL: Record<Relationship['type'], string> = {
  vendor: 'Vendor',
  asset: 'Asset',
  personalData: 'Personal data',
};
/** Existing records, for the checker's duplicate detection. */
const EXISTING: CheckRecord[] = PROCESSING_ACTIVITIES.map((a) => ({ id: String(a.id), name: a.name, role: a.role }));

/** Resolves after `ms`, or straight away once `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

function display(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : `${(v as Party).name}${(v as Party).contact ? ` (${(v as Party).contact})` : ''}`))
      .join('; ');
  }
  return typeof value === 'string' ? value : '';
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

@Component({
  selector: 'app-ai-assisted',
  imports: [
    FormsModule,
    RouterLink,
    OcAssistantActions,
    OcAssistantAttach,
    OcAssistantAttachmentTray,
    OcAssistantComposer,
    OcAssistantInput,
    OcAssistantMessage,
    OcAssistantScrollToBottom,
    OcAssistantStep,
    OcAssistantSteps,
    OcAssistantStepTitle,
    OcAssistantStop,
    OcAssistantSubmit,
    OcAssistantSuggestion,
    OcAssistantThinking,
    OcAssistantThread,
    OcAssistantViewport,
    OcAvatar,
    OcBadge,
    OcButton,
    OcIcon,
    OcIconButton,
    OcInput,
    OcProgress,
    OcRadioGroup,
    OcRadioItem,
    OcSelect,
    OcSelectOption,
    OcStatus,
    OcStreamDirective,
    OcTag,
    OcTextarea,
    PageHeader,
  ],
  templateUrl: './ai-assisted.html',
  styleUrl: './ai-assisted.scss',
})
export class AiAssisted {
  readonly #router = inject(Router);
  readonly #drafts = inject(DraftsStore);
  readonly #injector = inject(Injector);

  private readonly promptInput = viewChild('prompt', { read: ElementRef });
  private readonly steps = viewChild(OcAssistantSteps);

  protected readonly user = SIGNED_IN_USER;
  protected readonly userInitials = initials(SIGNED_IN_USER);
  protected readonly subsidiaries = SUBSIDIARIES;
  protected readonly subsidiaryLabel = (v: unknown) => (v ? subsidiaryName(String(v)) : '');
  protected readonly roles = Object.keys(ROLE_LABELS) as ProcessingRole[];
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roleHelp = ROLE_HELP;
  protected readonly relationshipLabel = RELATIONSHIP_LABEL;
  protected readonly severityLabel = SEVERITY_LABEL;
  protected readonly severityColor = SEVERITY_COLOR;
  protected readonly bandIntent = BAND_INTENT;
  protected readonly display = display;

  // ---- Conversation ----
  protected readonly turns = signal<Turn[]>([]);
  protected readonly streamStates = signal<Record<number, ChoreoState>>({});
  protected readonly busy = signal(false);
  protected readonly files = signal<File[]>([]);
  protected readonly chainOpen = signal(false);
  protected readonly chainStep = signal(0);
  #nextId = 1;
  #abort: AbortController | null = null;
  readonly #after = new Map<number, () => void>();
  readonly #snapshots = new Map<number, Snapshot>();

  // ---- Draft state ----
  protected readonly phase = signal<Phase>('describe');
  protected readonly description = signal('');
  protected readonly sourceFile = signal<string | undefined>(undefined);
  /** Answers that describe the activity further; re-extracted with the description (SKILL.md step 5). */
  protected readonly extraNarrative = signal<string[]>([]);
  /** Systems or data categories the user named that extraction couldn't pick up. */
  protected readonly extraRelationships = signal<Relationship[]>([]);
  /** Values the user gave directly; they override extraction. */
  protected readonly userValues = signal<Record<string, Value>>({});
  /** Extracted values the user confirmed. */
  protected readonly confirmed = signal<string[]>([]);
  /** Answers recorded beside checks that can't clear (Art. 9 condition, Art. 22, Art. 28 authorisation). */
  protected readonly notes = signal<Record<string, string>>({});
  protected readonly relDecisions = signal<Record<string, 'accepted' | 'rejected'>>({});
  protected readonly handled = signal<string[]>([]);
  protected readonly skipped = signal<string[]>([]);
  protected readonly pending = signal<Question | null>(null);
  protected readonly name = signal('');
  protected readonly subsidiaryId = signal<string | null>(null);
  protected readonly role = signal<ProcessingRole>('controller');
  protected readonly roleCue = signal<Extraction['roleCue']>(undefined);

  protected readonly started = computed(() => this.description().length > 0);

  // ---- Derived: extraction → record → checks → questions ----

  protected readonly extraction = computed<Extraction | null>(() =>
    this.started() ? extractForSkill([this.description(), ...this.extraNarrative()].join('\n\n')) : null,
  );

  protected readonly values = computed<Record<string, Value>>(() => ({
    ...(this.extraction()?.values ?? {}),
    ...this.userValues(),
  }));

  protected readonly fieldMeta = computed<Record<string, FieldMeta>>(() => {
    const out: Record<string, FieldMeta> = { ...(this.extraction()?.meta ?? {}) };
    for (const key of this.confirmed()) {
      if (out[key]) out[key] = { ...out[key], provenance: 'user', confidence: 1, rationale: `${out[key].rationale} Confirmed by you.` };
    }
    for (const [key, value] of Object.entries(this.userValues())) {
      out[key] = { provenance: 'user', confidence: 1, evidence: display(value), rationale: 'Provided by you.' };
    }
    return out;
  });

  protected readonly relationships = computed<Relationship[]>(() => {
    const decisions = this.relDecisions();
    return [...(this.extraction()?.relationships ?? []), ...this.extraRelationships()].map((r) => {
      const decision = decisions[`${r.type}:${r.name}`];
      return decision ? { ...r, status: decision } : r;
    });
  });

  protected readonly record = computed<CheckRecord>(() =>
    toCheckRecord({
      role: this.role(),
      subsidiaryId: this.subsidiaryId(),
      name: this.name().trim(),
      values: this.values(),
      meta: this.fieldMeta(),
      relationships: this.relationships(),
      description: this.description(),
    }),
  );

  protected readonly report = computed<RopaCheckReport>(() =>
    runRopaChecks(this.record(), { inventory: INVENTORY, posture: POSTURE, existing: EXISTING }),
  );

  protected readonly questions = computed<Question[]>(() =>
    this.started()
      ? planQuestions({ role: this.role(), record: this.record(), report: this.report(), handled: new Set(this.handled()) })
      : [],
  );

  /** Draft panel: the checker's field list, with values and evidence. */
  protected readonly fieldRows = computed(() => {
    // Name and description sit on the record itself, not among the extracted values.
    const values: Record<string, Value> = { ...this.values(), name: this.name().trim(), description: this.description() };
    const meta = this.fieldMeta();
    const pending = this.pending()?.field;
    return this.report().fields.map((f) => ({
      ...f,
      value: display(values[f.key]),
      meta: meta[f.key] as FieldMeta | undefined,
      asking: pending === f.key,
      skipped: this.skipped().some((id) => id.endsWith(`:${f.key}`)),
    }));
  });

  protected readonly relationshipRows = computed(() => {
    const report = this.report();
    return this.relationships()
      .filter((r) => r.status !== 'rejected')
      .map((r) => {
        const checked = report.relationships.find((x) => x.type === r.type && x.name === r.name);
        return { ...r, resolved: checked?.resolved ?? false, special: checked?.special || /special-category/i.test(r.rationale) };
      });
  });

  /** Validation warnings, each with the answer recorded against it, if any. */
  protected readonly checkRows = computed(() => {
    const notes = this.notes();
    const planned = this.questions();
    return this.report().validation.map((w) => {
      const noteKey = Object.keys(notes).find((k) =>
        (w.field === 'legalBasis' && /Art\. 9/.test(w.issue) && k === 'art9Condition') ||
        (w.field === 'purpose' && k === 'automatedDecisionsNote') ||
        (w.field === 'subProcessors' && k === 'subProcessorAuthorisation') ||
        (w.field === 'processingCategories' && /special-category/i.test(w.issue) && k === 'specialInstructionsNote') ||
        (w.field === 'processingCategories' && /automated/i.test(w.issue) && k === 'automatedDecisionsNote'),
      );
      return { ...w, answer: noteKey ? notes[noteKey] : undefined, open: planned.some((q) => q.warning === w || q.warning?.issue === w.issue) };
    });
  });

  protected readonly canSubmit = computed(
    () => this.started() && Boolean(this.name().trim()) && Boolean(this.subsidiaryId()) && !this.busy() && this.phase() !== 'describe',
  );

  protected readonly suggestions = computed<Suggestion[]>(() => {
    if (this.busy()) return [];
    if (this.phase() === 'describe') return STARTERS;
    if (this.phase() === 'closing') {
      const q = this.pending();
      return [...(q?.chips ?? []).map((text) => ({ text, fill: false })), { text: SKIP_CHIP, fill: false }];
    }
    return [];
  });

  protected readonly placeholder = computed(() => {
    switch (this.phase()) {
      case 'describe':
        return 'Describe the activity: who the data is about, what you collect and why, the tools involved, how long you keep it…';
      case 'closing':
        return 'Type your answer, pick a suggestion, or skip';
      default:
        return 'Message the RoPA assistant';
    }
  });

  constructor() {
    const first = SIGNED_IN_USER.split(' ')[0];
    this.#push({
      from: 'assistant',
      text: '',
      source:
        `Hi ${first}. Describe a processing activity in your own words, or attach a document about it, ` +
        `and I'll draft its Article 30 record using the ropa-authoring skill.\n\n` +
        `Every value I fill in quotes your text, I run the skill's checks as we go, and I'll ask about ` +
        `anything that's missing or needs confirming. Watch the draft and its checks build on the right.`,
    });
  }

  // ---- Conversation ----------------------------------------------------------

  protected onSend(prompt: string): void {
    // Read attachments synchronously: the tray clears once the send succeeds (AST-09).
    const files = this.files();
    if (this.busy()) return;
    const sample = SAMPLE_CHIPS[prompt];
    const text = sample?.text ?? prompt;
    const userTurn = this.#push({
      from: 'user',
      text,
      meta: files.length ? `Attached ${files.map((f) => f.name).join(', ')}` : undefined,
    });
    this.#snapshots.set(userTurn.id, this.#snapshot());
    if (sample && !this.name().trim()) this.name.set(sample.name);
    this.#reply(text, files);
  }

  /** Re-edit of the newest user turn: drop what followed, roll back, ask again (AST-04). */
  protected onResend(turnId: number, text: string): void {
    if (this.busy()) return;
    const snapshot = this.#snapshots.get(turnId);
    if (snapshot) this.#restore(snapshot);
    this.turns.update((ts) =>
      ts
        .slice(0, ts.findIndex((t) => t.id === turnId) + 1)
        .map((t) => (t.id === turnId ? { ...t, text, meta: undefined } : t)),
    );
    this.#reply(text, []);
  }

  protected stop(): void {
    this.#abort?.abort();
  }

  protected streamState(id: number): ChoreoState | undefined {
    return this.streamStates()[id];
  }

  protected setStreamState(id: number, state: ChoreoState): void {
    this.streamStates.update((s) => ({ ...s, [id]: state }));
  }

  protected onStreamComplete(id: number): void {
    const after = this.#after.get(id);
    this.#after.delete(id);
    if (!this.#abort) return; // the greeting
    const stopped = this.#abort.signal.aborted;
    this.#abort = null;
    this.busy.set(false);
    if (stopped) {
      // Undo whatever the stopped turn changed, and drop the partial reply.
      // OneCore only offers Edit on a user turn that is the newest message,
      // so this leaves the user's message editable to resend.
      const lastUser = [...this.turns()].reverse().find((t) => t.from === 'user');
      const snapshot = lastUser && this.#snapshots.get(lastUser.id);
      if (snapshot) this.#restore(snapshot);
      this.turns.update((ts) =>
        ts.filter((t) => t.id !== id).map((t) => (t === lastUser ? { ...t, meta: 'Reply stopped' } : t)),
      );
      return;
    }
    after?.();
  }

  #reply(prompt: string, files: File[]): void {
    const controller = new AbortController();
    this.#abort = controller;
    this.busy.set(true);
    const id = this.#nextId++;
    this.#push({ id, from: 'assistant', text: '', source: this.#send(id, prompt, files, controller.signal) });
  }

  /** The one send path (AST-01): apply the turn's effects, then stream the reply. */
  async *#send(turnId: number, prompt: string, files: File[], signal: AbortSignal): AsyncIterable<string> {
    await pause(THINKING_MS, signal);
    if (signal.aborted) return;

    const docs: { name: string; text: string }[] = [];
    for (const file of files) {
      if (/\.(txt|md|csv)$/i.test(file.name) || file.type.startsWith('text/')) {
        docs.push({ name: file.name, text: await file.text() });
      }
    }
    const unreadable = files.filter((f) => !docs.some((d) => d.name === f.name)).map((f) => f.name);

    const reply = this.#respond(prompt, docs, unreadable);
    if (reply.after) this.#after.set(turnId, reply.after);

    for (const word of reply.text.match(/\S+\s*|\s+/g) ?? []) {
      if (signal.aborted) return;
      yield word;
      await pause(WORD_MS, signal);
    }
  }

  #respond(prompt: string, docs: { name: string; text: string }[], unreadable: string[]): Reply {
    const unreadableNote = unreadable.length
      ? `I can't read ${unreadable.join(', ')} in this prototype. It reads plain-text files (.txt, .md).\n\n`
      : '';

    switch (this.phase()) {
      // SKILL.md steps 1 and 3: gather the description, extract a draft.
      case 'describe': {
        const description = [prompt, ...docs.map((d) => d.text)].filter((t) => t.trim()).join('\n\n').trim();
        if (description.length < MIN_DESCRIPTION) {
          return {
            text:
              unreadableNote +
              'I need a bit more to go on. Tell me who the data is about, what you collect and why, which tools ' +
              "or vendors are involved, how long you keep it, and where it's stored.",
          };
        }
        this.description.set(description);
        this.sourceFile.set(docs[0]?.name);
        const x = this.extraction();
        const cue = x?.roleCue;
        this.roleCue.set(cue);
        if (cue) this.role.set(cue.role);
        this.phase.set('details');

        const found = Object.keys(x?.values ?? {}).length;
        const links = x?.relationships.length ?? 0;
        const from = docs.length ? `your document${prompt.trim() ? ' and message' : ''}` : 'your description';
        return {
          text:
            unreadableNote +
            (found
              ? `I've extracted ${plural(found, 'value')} from ${from}`
              : `I couldn't find any Article 30 values in ${from}, so I'll ask about each one`) +
            (links ? ` and ${plural(links, 'linked item')} (vendors, systems and data categories)` : '') +
            '. Each value quotes the text it came from.\n\n' +
            "Next I need the record's name, the group company that owns it, and its role, because the role decides " +
            'which Article 30 fields apply.',
          after: () => this.openChain(),
        };
      }

      // SKILL.md step 2 done (role and entity); step 4: run the checks.
      case 'details': {
        this.phase.set('closing');
        const r = this.report();
        const entity = r.owningEntity?.path ?? this.subsidiaryLabel(this.subsidiaryId());
        const cue = this.roleCue();
        const why =
          cue && cue.role === this.role()
            ? ` because your description says "${cue.evidence.replace(/[.]+$/, '')}"`
            : cue
              ? ` (your description pointed to ${ROLE_LABELS[cue.role].toLowerCase()}, but you chose otherwise)`
              : '';
        const article = this.role() === 'processor' ? 'Art. 30(2), scored on its seven required items' : 'Art. 30(1)';
        const counts = [
          r.gaps.length ? plural(r.gaps.length, 'gap') : '',
          r.validation.length ? plural(r.validation.length, 'check') + ' to look at' : '',
          r.needsReview.length + r.lowConfidence.length ? plural(r.needsReview.length + r.lowConfidence.length, 'value') + ' to confirm' : '',
        ].filter(Boolean);
        const lead =
          `I've recorded ${this.name().trim()} as a ${ROLE_LABELS[this.role()].toLowerCase()} record${why}, ` +
          `owned by ${entity.replace(/\.$/, '')}.\n\n` +
          `I ran the ropa-authoring checks: it's ${r.completeness}% complete under ${article}` +
          (counts.length ? `, with ${counts.join(', ')}.` : '.') +
          (this.role() === 'processor'
            ? " As the processor, the record doesn't carry a legal basis, purpose or retention period of its own; those are the controller's decisions."
            : '') +
          " Let's close the gaps one at a time.";
        return this.#askNext(lead);
      }

      // SKILL.md step 5: close the gaps.
      case 'closing': {
        const q = this.pending();
        if (!q) return this.#askNext('');
        const ack = this.#applyAnswer(q, prompt.trim());
        return this.#askNext(ack);
      }

      case 'ready':
        return {
          text:
            'The draft is ready. Check it on the right and send it to Pending inventory, where a reviewer ' +
            'approves it before it becomes a processing activity.',
        };
    }
  }

  /** Apply the user's answer to the pending question; returns the acknowledgement. */
  #applyAnswer(q: Question, answer: string): string {
    this.#markHandled(q.id);

    if (answer === SKIP_CHIP || /^skip\b/i.test(answer)) {
      this.skipped.update((s) => [...s, q.id]);
      return "No problem. I'll leave that open for the reviewer.";
    }

    const setValue = (field: string, value: Value) => this.userValues.update((v) => ({ ...v, [field]: value }));
    switch (q.mode) {
      case 'set':
        setValue(q.field, answer);
        break;
      case 'list':
        setValue(q.field, splitList(answer));
        break;
      case 'parties':
        setValue(q.field, parseParties(answer));
        break;
      case 'append': {
        const current = display(this.values()[q.field]);
        setValue(q.field, current ? `${current.replace(/[.]+$/, '')}; ${answer}` : answer);
        break;
      }
      case 'legalBasis':
        setValue('legalBasis', normaliseLegalBasis(answer));
        break;
      case 'contact': {
        const parties = ((this.values()[q.field] as Party[] | undefined) ?? []).map((p) =>
          p.name === q.party ? { ...p, contact: answer } : p,
        );
        setValue(q.field, parties);
        break;
      }
      case 'entity': {
        const match = SUBSIDIARIES.find((s) => s.name === answer) ?? SUBSIDIARIES.find((s) => s.name.toLowerCase().includes(answer.toLowerCase()));
        if (!match) return `I couldn't match "${answer}" to a group company, so I've left the owning entity as it is.`;
        this.subsidiaryId.set(match.id);
        return `Got it. ${match.name.replace(/\.$/, '')} owns this record.`;
      }
      case 'relationship': {
        const decision = answer === REMOVE_CHIP || /^(remove|no)\b/i.test(answer) ? 'rejected' : 'accepted';
        this.relDecisions.update((d) => ({ ...d, [q.party!]: decision }));
        return decision === 'rejected'
          ? `Removed ${q.label} from the record.`
          : `Kept ${q.label}. It's flagged for adding to the inventory.`;
      }
      case 'confirm': {
        if (answer === CONFIRM_ALL_CHIP) {
          const rest = this.questions().filter((x) => x.kind === 'review');
          this.confirmed.update((c) => [...c, q.field, ...rest.map((x) => x.field)]);
          rest.forEach((x) => this.#markHandled(x.id));
          return `Thanks, I've marked ${plural(rest.length + 1, 'value')} as confirmed.`;
        }
        if (answer === CONFIRM_CHIP || /^(yes|correct|right|confirmed?)\b/i.test(answer)) {
          this.confirmed.update((c) => [...c, q.field]);
          return "Thanks, that's confirmed.";
        }
        const field = q.field;
        setValue(field, field === 'dataSubjectCategories' || field === 'processingCategories' ? splitList(answer) : answer);
        return "Thanks, I've corrected it.";
      }
      case 'note':
        this.notes.update((n) => ({ ...n, [q.field]: answer }));
        return "Noted. I've recorded your answer against the check for the reviewer.";
      case 'describe': {
        // Re-extract from the full narrative (SKILL.md step 5); keep anything extraction still misses.
        const before = this.relationships().length;
        this.extraNarrative.update((n) => [...n, answer]);
        const type: Relationship['type'] = q.field === 'personalData' ? 'personalData' : 'vendor';
        const covered = this.relationships().some((r) => (type === 'personalData' ? r.type === 'personalData' : r.type !== 'personalData'));
        if (!covered || this.relationships().length === before) {
          const added = splitList(answer).map<Relationship>((n) => ({
            type,
            name: n,
            confidence: 1,
            evidence: answer,
            rationale: 'Named by you.',
            status: 'suggested',
          }));
          this.extraRelationships.update((r) => [...r, ...added]);
        }
        return "Got it. I've added that to the record.";
      }
    }

    // Some checks only clear when the value meets them; say so if this one didn't.
    const still = this.report().validation.find((w) => q.warning && w.issue === q.warning.issue);
    const gapStill = q.kind === 'gap' && this.report().gaps.includes(q.label);
    if (still) return `I've added that, but the check still flags it: ${still.issue} I'll leave it for the reviewer.`;
    if (gapStill) return "I've added that, but the check still reads it as missing. I'll leave it for the reviewer.";
    return "Got it. I've added that.";
  }

  #askNext(lead: string): Reply {
    const prefix = lead ? `${lead}\n\n` : '';
    const open = this.questions();
    const next = open[0];
    if (next) {
      this.pending.set(next);
      const left = open.length > 1 ? `(${open.length} to go) ` : '(Last one) ';
      return { text: `${prefix}${left}${next.prompt}` };
    }

    // SKILL.md step 6: propose the record.
    this.pending.set(null);
    this.phase.set('ready');
    const r = this.report();
    const assessments = r.posture.requiredAssessments;
    // Critical and warning checks the conversation didn't resolve or record an answer against.
    const answered = new Set(this.checkRows().filter((c) => c.answer).map((c) => c.issue));
    const openChecks = r.validation.filter((w) => w.severity !== 'info' && !answered.has(w.issue));
    const lines = [
      `That's everything I can check. The record is ${r.completeness}% complete` +
        (r.incomplete ? ', below the 80% the dashboard flags as incomplete.' : '.'),
      assessments.length
        ? `Required assessments: ${assessments.map((a) => `${a.name}${a.owner ? ` (owner: ${a.owner})` : ''}`).join('; ')}.`
        : 'No assessments are required.',
      openChecks.length
        ? `${plural(openChecks.length, 'check is', 'checks are')} still flagged: ${openChecks.map((w) => w.issue.split(/ — |\. /)[0]).join('; ')}.`
        : '',
      `Review it ${r.posture.reviewCadence.label.toLowerCase()} (${r.posture.reviewCadence.rule.toLowerCase()})` +
        (r.posture.requireCertification ? ', with certification at each review.' : '.'),
      this.skipped().length || r.gaps.length
        ? `Still open for the reviewer: ${[...r.gaps, ...this.skipped().map((id) => this.#labelFor(id))].filter((v, i, a) => a.indexOf(v) === i).join(', ')}.`
        : '',
      this.role() === 'processor'
        ? "As a processor record, it doesn't replace each client's own Art. 30(1) record."
        : '',
      'This is a draft for human review. Send it to Pending inventory, where a reviewer approves it.',
    ];
    return { text: `${prefix}${lines.filter(Boolean).join(' ')}` };
  }

  #labelFor(questionId: string): string {
    const key = questionId.split(':').slice(1).join(':');
    return this.report().fields.find((f) => f.key === key)?.label ?? key.replace(/^.*?:/, '');
  }

  #markHandled(id: string): void {
    this.handled.update((h) => (h.includes(id) ? h : [...h, id]));
  }

  // ---- Record details chain (SKILL.md step 2) -----------------------------------

  protected openChain(): void {
    this.chainOpen.set(true);
    // The composer (and its focused textarea) is gone, so move focus in (AST-27).
    afterNextRender(() => this.steps()?.focus(), { injector: this.#injector });
  }

  /** Close keeps the answers, so reopening resumes where the user left off (AST-25). */
  protected closeChain(): void {
    this.chainOpen.set(false);
    this.#focusPrompt();
  }

  protected finishDetails(): void {
    if (!this.name().trim() || !this.subsidiaryId()) return;
    this.chainOpen.set(false);
    this.chainStep.set(0);
    const summary =
      `Record name: ${this.name().trim()}\n` +
      `Owning entity: ${this.subsidiaryLabel(this.subsidiaryId())}\n` +
      `Role: ${ROLE_LABELS[this.role()]}`;
    this.onSend(summary);
    this.#focusPrompt();
  }

  #focusPrompt(): void {
    afterNextRender(() => this.promptInput()?.nativeElement.focus(), { injector: this.#injector });
  }

  // ---- Draft panel -------------------------------------------------------------

  protected rejectRelationship(r: Relationship): void {
    this.relDecisions.update((d) => ({ ...d, [`${r.type}:${r.name}`]: 'rejected' }));
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const values = this.values();
    const meta = this.fieldMeta();
    const fields: DraftField[] = this.report()
      .fields.filter((f) => f.filled && values[f.key] !== undefined)
      .map((f) => ({ key: f.key, label: f.label, value: display(values[f.key]), meta: meta[f.key] }));
    const saved = this.#drafts.add({
      name: this.name().trim(),
      role: this.role(),
      subsidiaryId: this.subsidiaryId() ?? '',
      description: this.description(),
      fields,
      relationships: this.relationships().filter((r) => r.status !== 'rejected'),
      completeness: this.report().completeness,
      sourceFileName: this.sourceFile(),
      submittedBy: SIGNED_IN_USER,
    });
    this.#router.navigate(['/pending-inventory'], { queryParams: { draft: saved.id } });
  }

  // ---- State helpers -------------------------------------------------------------

  #push(turn: Omit<Turn, 'id'> & { id?: number }): Turn {
    const full: Turn = { ...turn, id: turn.id ?? this.#nextId++ };
    this.turns.update((ts) => [...ts, full]);
    return full;
  }

  #snapshot(): Snapshot {
    return {
      phase: this.phase(),
      description: this.description(),
      sourceFile: this.sourceFile(),
      extraNarrative: this.extraNarrative(),
      extraRelationships: this.extraRelationships(),
      userValues: this.userValues(),
      confirmed: this.confirmed(),
      notes: this.notes(),
      relDecisions: this.relDecisions(),
      handled: this.handled(),
      skipped: this.skipped(),
      pending: this.pending(),
      name: this.name(),
      subsidiaryId: this.subsidiaryId(),
      role: this.role(),
      roleCue: this.roleCue(),
    };
  }

  #restore(s: Snapshot): void {
    this.phase.set(s.phase);
    this.description.set(s.description);
    this.sourceFile.set(s.sourceFile);
    this.extraNarrative.set(s.extraNarrative);
    this.extraRelationships.set(s.extraRelationships);
    this.userValues.set(s.userValues);
    this.confirmed.set(s.confirmed);
    this.notes.set(s.notes);
    this.relDecisions.set(s.relDecisions);
    this.handled.set(s.handled);
    this.skipped.set(s.skipped);
    this.pending.set(s.pending);
    this.name.set(s.name);
    this.subsidiaryId.set(s.subsidiaryId);
    this.role.set(s.role);
    this.roleCue.set(s.roleCue);
    this.chainOpen.set(false);
  }
}
