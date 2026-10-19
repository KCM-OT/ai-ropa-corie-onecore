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
import {
  completeness,
  extractDraft,
  FIELD_LABELS,
  FOLLOW_UPS,
  SAMPLE_DESCRIPTION,
} from '../../data/extract';
import { initials, SIGNED_IN_USER, SUBSIDIARIES, subsidiaryName } from '../../data/org';
import {
  confidenceBand,
  ROLE_HELP,
  ROLE_LABELS,
  type DraftField,
  type ProcessingRole,
  type Relationship,
} from '../../data/types';
import { PageHeader } from '../../shell/page-header';

// AI Assisted RoPA Creation: the record is drafted through a conversation with
// the OneCore AI assistant, while a draft panel beside it fills in live.
//
// The conversation runs in phases:
//   describe  → the user describes the activity (or attaches a document) and
//               the rule-based extractor drafts what it can, quoting evidence
//   details   → an oc-assistant-steps chain asks the three things a
//               description can't settle: name, owning entity and role
//   followups → the assistant asks about each field still missing, one at a time
//   ready     → nothing left to ask; the user sends the draft for approval
//
// Every reply goes through one send() (OneCore rule AST-01). It applies the
// turn's effects to the draft, then streams the reply text. No model is
// connected: replies are written here and streamed word by word.

type Phase = 'describe' | 'details' | 'followups' | 'ready';

interface Turn {
  id: number;
  from: 'user' | 'assistant';
  /** User turns: the message text. */
  text: string;
  /** Assistant turns: what [ocStream] reveals. */
  source?: AsyncIterable<string> | string;
  meta?: string;
}

interface Snapshot {
  phase: Phase;
  description: string;
  sourceFile: string | undefined;
  fields: DraftField[];
  relationships: Relationship[];
  answers: Record<string, string>;
  skipped: string[];
  pending: string | null;
  name: string;
  subsidiaryId: string | null;
  role: ProcessingRole;
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

const SAMPLE_CHIP = 'Use a sample description';
const SKIP_CHIP = 'Skip this question';
const STARTERS: Suggestion[] = [
  { text: SAMPLE_CHIP, fill: false },
  {
    text: 'Our [team] collects [data] from [people] to [purpose], using [tools], and keeps it for [time].',
    fill: true,
  },
  {
    text: 'We process [data] for [client] on their instructions, using [sub-processors], stored in [location].',
    fill: true,
  },
];

const THINKING_MS = 900;
const WORD_MS = 22;
const MIN_DESCRIPTION = 60;
const FIELD_KEYS = Object.keys(FOLLOW_UPS);
const BAND_INTENT = { high: 'success', medium: 'warning', low: 'error' } as const;
const RELATIONSHIP_LABEL: Record<Relationship['type'], string> = {
  vendor: 'Vendor',
  asset: 'Asset',
  personalData: 'Personal data',
};

/** Resolves after `ms`, or straight away once `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
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

  // Conversation
  protected readonly turns = signal<Turn[]>([]);
  protected readonly streamStates = signal<Record<number, ChoreoState>>({});
  protected readonly busy = signal(false);
  protected readonly files = signal<File[]>([]);
  protected readonly chainOpen = signal(false);
  protected readonly chainStep = signal(0);
  #nextId = 1;
  #abort: AbortController | null = null;
  readonly #after = new Map<number, () => void>();
  /** Draft state before each user turn, so Stop and re-edit can roll back. */
  readonly #snapshots = new Map<number, Snapshot>();

  // Draft
  protected readonly phase = signal<Phase>('describe');
  protected readonly description = signal('');
  protected readonly sourceFile = signal<string | undefined>(undefined);
  protected readonly fields = signal<DraftField[]>([]);
  protected readonly relationships = signal<Relationship[]>([]);
  protected readonly answers = signal<Record<string, string>>({});
  protected readonly skipped = signal<string[]>([]);
  protected readonly pending = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly subsidiaryId = signal<string | null>(null);
  protected readonly role = signal<ProcessingRole>('controller');

  protected readonly started = computed(() => this.description().length > 0);

  protected readonly finalFields = computed<DraftField[]>(() => {
    const answers = this.answers();
    return [
      ...this.fields(),
      ...Object.entries(answers).map(([key, value]) => ({ key, label: FIELD_LABELS[key] ?? key, value })),
    ];
  });

  protected readonly activeRelationships = computed(() =>
    this.relationships().filter((r) => r.status !== 'rejected'),
  );

  protected readonly score = computed(() =>
    this.started()
      ? completeness(
          this.finalFields(),
          this.activeRelationships(),
          Boolean(this.name().trim()),
          true,
          Boolean(this.subsidiaryId()),
        )
      : 0,
  );

  /** One row per RoPA field, in a fixed order, for the draft panel. */
  protected readonly rows = computed(() =>
    FIELD_KEYS.map((key) => ({
      key,
      label: FIELD_LABELS[key] ?? key,
      field: this.fields().find((f) => f.key === key),
      answer: this.answers()[key],
      skipped: this.skipped().includes(key),
      asking: this.pending() === key,
    })),
  );

  protected readonly canSubmit = computed(
    () => this.started() && Boolean(this.name().trim()) && Boolean(this.subsidiaryId()) && !this.busy(),
  );

  protected readonly suggestions = computed<Suggestion[]>(() => {
    if (this.busy()) return [];
    if (this.phase() === 'describe') return STARTERS;
    if (this.phase() === 'followups') return [{ text: SKIP_CHIP, fill: false }];
    return [];
  });

  protected readonly placeholder = computed(() => {
    switch (this.phase()) {
      case 'describe':
        return 'Describe the activity: who the data is about, what you collect and why, the tools involved, how long you keep it…';
      case 'followups':
        return 'Type your answer, or skip this question';
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
        `and I'll draft its RoPA record.\n\nI quote your text as evidence for every value I fill in, ` +
        `and I'll ask about anything that's missing. You can watch the draft build on the right.`,
    });
  }

  // ---- Conversation -------------------------------------------------------

  protected onSend(prompt: string): void {
    // Read attachments synchronously: the tray clears once the send succeeds (AST-09).
    const files = this.files();
    if (this.busy()) return;
    const text = prompt === SAMPLE_CHIP ? SAMPLE_DESCRIPTION : prompt;
    const userTurn = this.#push({
      from: 'user',
      text,
      meta: files.length ? `Attached ${files.map((f) => f.name).join(', ')}` : undefined,
    });
    this.#snapshots.set(userTurn.id, this.#snapshot());
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
    if (!this.#abort || this.#abort.signal !== this.#currentSignal) return;
    const stopped = this.#abort.signal.aborted;
    this.#abort = null;
    this.busy.set(false);
    if (stopped) {
      // Undo whatever the stopped turn changed in the draft, and drop the
      // partial reply. OneCore only offers Edit on a user turn that is the
      // newest message, so this leaves the user's message editable to resend.
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

  #currentSignal: AbortSignal | null = null;

  #reply(prompt: string, files: File[]): void {
    const controller = new AbortController();
    this.#abort = controller;
    this.#currentSignal = controller.signal;
    this.busy.set(true);
    const id = this.#nextId++;
    this.#push({ id, from: 'assistant', text: '', source: this.#send(id, prompt, files, controller.signal) });
  }

  /** The one send path: apply the turn's effects, then stream the reply. */
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
      case 'describe': {
        const description = [prompt, ...docs.map((d) => d.text)].filter((t) => t.trim()).join('\n\n').trim();
        if (description.length < MIN_DESCRIPTION) {
          return {
            text:
              unreadableNote +
              "I need a bit more to go on. Tell me who the data is about, what you collect and why, which tools " +
              "or vendors are involved, how long you keep it, and where it's stored.",
          };
        }
        const { fields, relationships } = extractDraft(description);
        this.description.set(description);
        this.sourceFile.set(docs[0]?.name);
        this.fields.set(fields);
        this.relationships.set(relationships);
        if (description === SAMPLE_DESCRIPTION && !this.name().trim()) this.name.set('Candidate screening');
        this.phase.set('details');

        const from = docs.length ? `your document${prompt.trim() ? ' and message' : ''}` : 'your description';
        const found = fields.length
          ? `I've drafted ${fields.length} field${fields.length === 1 ? '' : 's'} from ${from}`
          : `I couldn't find any RoPA fields in ${from}, so I'll ask about each one`;
        const links = relationships.length
          ? ` and matched ${relationships.length} item${relationships.length === 1 ? '' : 's'} from your inventory`
          : '';
        return {
          text:
            unreadableNote +
            `${found}${links}. Each value quotes the text it came from, so you can check it in the draft on the right.` +
            `\n\nBefore I go further, I need three details a description can't settle.`,
          after: () => this.openChain(),
        };
      }

      case 'details': {
        this.phase.set('followups');
        return this.#askNext(
          `Thanks. ${this.name().trim()} is recorded as a ${ROLE_LABELS[this.role()].toLowerCase()} activity ` +
            // Some company names already end in a full stop ("Solera UK Ltd.").
          `owned by ${this.subsidiaryLabel(this.subsidiaryId()).replace(/\.$/, '')}.`,
        );
      }

      case 'followups': {
        const key = this.pending();
        if (!key) return this.#askNext('');
        const label = (FIELD_LABELS[key] ?? key).toLowerCase();
        if (prompt === SKIP_CHIP || /^skip\b/i.test(prompt.trim())) {
          this.skipped.update((s) => [...s, key]);
          return this.#askNext(`No problem. I'll leave the ${label} for the reviewer.`);
        }
        this.answers.update((a) => ({ ...a, [key]: prompt.trim() }));
        return this.#askNext(`Got it. I've added that as the ${label}.`);
      }

      case 'ready':
        return {
          text:
            "The draft is ready. Check it on the right and send it to Pending inventory, where a reviewer " +
            'approves it before it becomes a processing activity.',
        };
    }
  }

  #askNext(lead: string): Reply {
    const open = FIELD_KEYS.filter(
      (k) => !this.fields().some((f) => f.key === k) && !this.answers()[k] && !this.skipped().includes(k),
    );
    const next = open[0];
    const prefix = lead ? `${lead}\n\n` : '';
    if (next) {
      this.pending.set(next);
      const left = open.length === 1 ? 'One thing is still missing.' : `${open.length} things are still missing.`;
      return { text: `${prefix}${left} ${FOLLOW_UPS[next]}` };
    }
    this.pending.set(null);
    this.phase.set('ready');
    return {
      text:
        `${prefix}That's everything I need. The record is ${this.score()}% complete. ` +
        `Check the draft on the right, then send it to Pending inventory, where a reviewer approves it.`,
    };
  }

  // ---- Record details chain ------------------------------------------------

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
      `Activity name: ${this.name().trim()}\n` +
      `Owning entity: ${this.subsidiaryLabel(this.subsidiaryId())}\n` +
      `My role: ${ROLE_LABELS[this.role()]}`;
    this.onSend(summary);
    this.#focusPrompt();
  }

  #focusPrompt(): void {
    afterNextRender(() => this.promptInput()?.nativeElement.focus(), { injector: this.#injector });
  }

  // ---- Draft panel ---------------------------------------------------------

  protected confidenceIntent(c: number) {
    return BAND_INTENT[confidenceBand(c)];
  }

  protected confidenceLabel(c: number): string {
    return `${confidenceBand(c)} - ${Math.round(c * 100)}%`;
  }

  protected rejectRelationship(r: Relationship): void {
    this.relationships.update((rs) => rs.map((x) => (x === r ? { ...x, status: 'rejected' } : x)));
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const saved = this.#drafts.add({
      name: this.name().trim(),
      role: this.role(),
      subsidiaryId: this.subsidiaryId() ?? '',
      description: this.description(),
      fields: this.finalFields(),
      relationships: this.activeRelationships(),
      completeness: this.score(),
      sourceFileName: this.sourceFile(),
      submittedBy: SIGNED_IN_USER,
    });
    this.#router.navigate(['/pending-inventory'], { queryParams: { draft: saved.id } });
  }

  // ---- State helpers -------------------------------------------------------

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
      fields: this.fields(),
      relationships: this.relationships(),
      answers: this.answers(),
      skipped: this.skipped(),
      pending: this.pending(),
      name: this.name(),
      subsidiaryId: this.subsidiaryId(),
      role: this.role(),
    };
  }

  #restore(s: Snapshot): void {
    this.phase.set(s.phase);
    this.description.set(s.description);
    this.sourceFile.set(s.sourceFile);
    this.fields.set(s.fields);
    this.relationships.set(s.relationships);
    this.answers.set(s.answers);
    this.skipped.set(s.skipped);
    this.pending.set(s.pending);
    this.name.set(s.name);
    this.subsidiaryId.set(s.subsidiaryId);
    this.role.set(s.role);
    this.chainOpen.set(false);
  }
}
