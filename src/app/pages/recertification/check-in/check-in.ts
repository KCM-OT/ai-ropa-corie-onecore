import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  OcAssistantActions,
  OcAssistantComposer,
  OcAssistantInput,
  OcAssistantMessage,
  OcAssistantScrollToBottom,
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
import { OcProgress } from '@onetrust/onecore/progress';
import { OcTextarea } from '@onetrust/onecore/textarea';
import { dateFormat, initials, SIGNED_IN_USER } from '../../../data/org';
import { fieldValue, runRecertChecks, type ChangeSubmission, type FieldKey, type RelType } from '../../../data/recert-check';
import { RecertStore } from '../../../data/recert.store';
import {
  buildSubmission,
  CONFIRMED_PHRASE,
  exampleAnswer,
  FIELD_LABELS,
  listText,
  newOwnerIn,
  nextReviewIfApproved,
  proposalLabel,
  readChange,
  RECERT_INVENTORY,
  recertRecordById,
  recordReviewState,
  REL_GROUP_LABELS,
  REL_OWNER_LABELS,
  REVIEW_STATE_LABELS,
  TODAY,
  topicQuestion,
  TOPICS,
  verdict,
  WHAT_CHANGED,
  type Proposal,
  type TopicKey,
} from '../../../data/recertification';
import {
  keepReceivedRecord,
  readRecertHandoff,
  RECERT_HANDOFF_PARAM,
  receivedRecord,
  type ReceivedRecord,
} from '../../../data/recert-handoff';
import { PageHeader } from '../../../shell/page-header';

// Owner check-in for one record (/recertification/:id): the
// ropa-recertification skill's owner chat (SKILL.md steps 3–7,
// references/owner-chat-agent.md) beside the record under review.
//
//   3. Open warmly         → one sentence on the record, last recertified, not the final approver
//   4. Seven topics        → one yes/no question each, in fixed order; a "No" gets exactly
//                            "Please tell us what has changed"
//   5. Before/after cards  → one card per change; Yes, apply / Edit / No, skip
//   6. Ownership hand-off  → a named new owner gets the exact pause question
//   7. Submit              → recap (templates/recertification-submission.md), optional note,
//                            Send to privacy analyst; the submission is checked with
//                            recert-check.ts (the parity-tested port of recert_check.py)
//
// Every reply goes through one send() and streams with [ocStream]. No model is
// connected: replies are written here and answers are read with rules
// (data/recertification.ts). Nothing reaches the record until an analyst approves.

type Mode =
  | 'confirm' // waiting for a yes/no on the current topic
  | 'change' // asked "Please tell us what has changed"
  | 'handoff' // asked whether to pause for the new owner
  | 'cards' // change cards waiting for a decision
  | 'note' // recap shown, asking for a note to the analyst
  | 'ready' // ready to send
  | 'submitted'
  | 'paused'
  | 'closed'; // opened on a record already sent or paused

type Outcome = 'confirmed' | 'changed' | 'paused';

interface Turn {
  id: number;
  from: 'user' | 'assistant';
  text: string;
  source?: AsyncIterable<string> | string;
  meta?: string;
  /** Change cards shown under this assistant turn. */
  cards?: number[];
}

/** What a user turn can change, so Stop and re-edit can roll it back (AST-04). */
interface Snapshot {
  topic: number;
  mode: Mode;
  proposals: Proposal[];
  outcomes: Partial<Record<TopicKey, Outcome>>;
  newOwner: string;
  ownerNote: string;
}

interface Reply {
  text: string;
  /** Runs once the reply has finished streaming (and wasn't stopped). */
  after?: () => void;
}

type Action = { type: 'user'; text: string } | { type: 'cards-done' } | { type: 'open' };

const THINKING_MS = 700;
const WORD_MS = 16;
const YES_CHIP = 'Yes';
const NO_CHIP = 'No';
const PAUSE_YES = 'Yes, pause it';
const PAUSE_NO = 'No, carry on';
const NO_NOTE = 'No extra note';

const PANEL_FIELDS: FieldKey[] = [
  'purpose',
  'legalBasis',
  'businessProcessOwner',
  'managingOrganization',
  'dataSubjectCategories',
  'retentionPeriod',
  'recipients',
  'internationalTransfers',
  'securityMeasures',
  'jurisdiction',
];
const LIST_FIELDS = new Set<FieldKey>(['dataSubjectCategories', 'recipients', 'jurisdiction']);
const STATE_COLOR = { overdue: 'destructive', due_soon: 'warning', ok: 'success', none: 'neutral' } as const;

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });
}

/** "{name}'s team", without a doubled s ("People Operations' team"). */
function teamOf(name: string): string {
  return /s$/i.test(name) ? `${name}' team` : `${name}'s team`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function cadenceLabel(days: number | null | undefined): string {
  if (!days) return 'Every 180 days';
  if (days % 365 === 0) return days === 365 ? 'Annually' : `Every ${days / 365} years`;
  if (days % 30 === 0) return `Every ${days / 30} months`;
  return `Every ${days} days`;
}

@Component({
  selector: 'app-recert-check-in',
  imports: [
    FormsModule,
    RouterLink,
    OcAssistantActions,
    OcAssistantComposer,
    OcAssistantInput,
    OcAssistantMessage,
    OcAssistantScrollToBottom,
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
    OcProgress,
    OcStreamDirective,
    OcTextarea,
    PageHeader,
  ],
  templateUrl: './check-in.html',
  styleUrl: './check-in.scss',
})
export class RecertCheckIn {
  readonly #store = inject(RecertStore);

  /** Route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  /** A record sent from Data Mapping for this ID (data/recert-handoff.ts), used instead of this app's copy. */
  protected readonly received = signal<ReceivedRecord | undefined>(undefined);
  protected readonly receiveError = signal('');
  protected readonly record = computed(() => this.received()?.record ?? recertRecordById(Number(this.id())));
  protected readonly review = computed(() => {
    const r = this.record();
    return r ? recordReviewState(r) : { state: 'none' as const, days: null };
  });

  protected readonly user = SIGNED_IN_USER;
  protected readonly userInitials = initials(SIGNED_IN_USER);
  protected readonly topics = TOPICS;
  protected readonly fieldLabels = FIELD_LABELS;
  protected readonly panelFields = PANEL_FIELDS;
  protected readonly listFields = LIST_FIELDS;
  protected readonly relGroups: RelType[] = ['vendor', 'asset', 'personalData'];
  protected readonly relGroupLabels = REL_GROUP_LABELS;
  protected readonly relOwnerLabels = REL_OWNER_LABELS;
  protected readonly stateLabel = REVIEW_STATE_LABELS;
  protected readonly stateColor = STATE_COLOR;
  protected readonly proposalLabel = proposalLabel;
  protected readonly fieldValue = fieldValue;
  protected readonly cadenceLabel = cadenceLabel;

  // ---- Conversation ----
  protected readonly turns = signal<Turn[]>([]);
  protected readonly streamStates = signal<Record<number, ChoreoState>>({});
  protected readonly busy = signal(false);
  #nextId = 1;
  #abort: AbortController | null = null;
  #replyId: number | null = null;
  readonly #after = new Map<number, () => void>();
  readonly #snapshots = new Map<number, Snapshot>();

  // ---- Check-in state ----
  protected readonly topic = signal(0);
  protected readonly mode = signal<Mode>('confirm');
  protected readonly proposals = signal<Proposal[]>([]);
  protected readonly outcomes = signal<Partial<Record<TopicKey, Outcome>>>({});
  protected readonly newOwner = signal('');
  protected readonly ownerNote = signal('');
  protected readonly submitted = signal<ChangeSubmission | null>(null);
  protected readonly submitError = signal<string[]>([]);
  /** Card being edited, and its draft value. */
  protected readonly editing = signal<number | null>(null);
  protected readonly editValue = signal('');
  #nextProposal = 1;

  protected readonly currentTopic = computed(() => TOPICS[this.topic()]);
  protected readonly checked = computed(() => Object.keys(this.outcomes()).length);
  protected readonly applied = computed(() => this.proposals().filter((p) => p.status === 'applied'));
  protected readonly skipped = computed(() => this.proposals().filter((p) => p.status === 'skipped'));
  protected readonly pendingCards = computed(() => this.proposals().filter((p) => p.status === 'pending'));
  protected readonly existing = computed(() => {
    const r = this.record();
    return r ? { open: this.#store.openSubmission(r.id), pause: this.#store.pause(r.id) } : {};
  });

  /** Quick replies for the current step (the owner can always type instead). */
  protected readonly suggestions = computed<string[]>(() => {
    const r = this.record();
    if (!r || this.busy()) return [];
    switch (this.mode()) {
      case 'confirm':
        return [YES_CHIP, NO_CHIP, exampleAnswer(this.currentTopic().key, r)];
      case 'change':
        return [exampleAnswer(this.currentTopic().key, r).replace(/^No,\s*/i, '')];
      case 'handoff':
        return [PAUSE_YES, PAUSE_NO];
      case 'note':
        return [NO_NOTE];
      default:
        return [];
    }
  });

  protected readonly composerOpen = computed(() => ['confirm', 'change', 'handoff', 'note'].includes(this.mode()));

  protected readonly placeholder = computed(() => {
    switch (this.mode()) {
      case 'change':
        return 'Tell us what has changed';
      case 'note':
        return 'Anything the privacy analyst should know (optional)';
      case 'handoff':
        return 'Yes or no';
      default:
        return 'Yes, no, or tell us what changed';
    }
  });

  /** Panel: each field's applied or proposed change. */
  protected readonly fieldChanges = computed(() => {
    const out: Partial<Record<FieldKey, Proposal>> = {};
    for (const p of this.proposals()) {
      if (p.kind === 'field' && p.status !== 'skipped') out[p.field!.key] = p;
    }
    return out;
  });

  /** Panel: relationships with this check-in's adds and removes marked. */
  protected readonly relRows = computed(() => {
    const r = this.record();
    if (!r) return {} as Record<RelType, { name: string; change?: 'added' | 'removed'; pending: boolean }[]>;
    const changes = this.proposals().filter((p) => p.kind === 'relationship' && p.status !== 'skipped');
    const rows = {} as Record<RelType, { name: string; change?: 'added' | 'removed'; pending: boolean }[]>;
    for (const type of this.relGroups) {
      const list = r.relationships
        .filter((x) => x.type === type)
        .map((x) => {
          const c = changes.find((p) => p.relationship!.type === type && p.relationship!.name.toLowerCase() === x.name.toLowerCase());
          return { name: x.name, change: c?.relationship!.action, pending: c?.status === 'pending' };
        });
      for (const c of changes.filter((p) => p.relationship!.type === type && p.relationship!.action === 'added')) {
        list.push({ name: c.relationship!.name, change: 'added', pending: c.status === 'pending' });
      }
      rows[type] = list;
    }
    return rows;
  });

  constructor() {
    // Open (or reopen) the conversation for the record in the URL.
    effect(() => {
      const id = this.id();
      untracked(() => {
        this.#receive(id);
        this.#start(this.record() !== undefined);
      });
    });
  }

  /** Takes a record sent in the URL fragment (#recert-record=…), or one received earlier for this ID. */
  #receive(id: string): void {
    this.receiveError.set('');
    let received: ReceivedRecord | undefined;
    try {
      const fresh = readRecertHandoff(location.hash, id);
      if (fresh) {
        keepReceivedRecord(id, fresh);
        received = fresh;
      }
    } catch (e) {
      this.receiveError.set(e instanceof Error ? e.message : "The record sent from Data Mapping couldn't be read.");
    }
    // Drop the package from the address bar so a reload or shared link doesn't carry it.
    if (location.hash.includes(RECERT_HANDOFF_PARAM)) history.replaceState(history.state, '', location.pathname + location.search);
    this.received.set(received ?? receivedRecord(id));
  }

  // ---- Template helpers ----

  protected date(iso: string | null | undefined): string {
    return iso ? dateFormat.format(new Date(iso)) : '—';
  }

  protected topicState(i: number): Outcome | 'current' | 'upcoming' {
    const o = this.outcomes()[TOPICS[i].key];
    if (o) return o;
    return i === this.topic() && !['note', 'ready', 'submitted', 'closed'].includes(this.mode()) ? 'current' : 'upcoming';
  }

  protected cardsFor(t: Turn): Proposal[] {
    if (!t.cards?.length) return [];
    return this.proposals().filter((p) => t.cards!.includes(p.id));
  }

  protected streamState(id: number): ChoreoState | undefined {
    return this.streamStates()[id];
  }

  protected setStreamState(id: number, state: ChoreoState): void {
    this.streamStates.update((s) => ({ ...s, [id]: state }));
  }

  // ---- Cards (SKILL.md step 5) ----

  protected apply(p: Proposal): void {
    this.#decide(p.id, 'applied');
  }

  protected skip(p: Proposal): void {
    this.#decide(p.id, 'skipped');
  }

  protected startEdit(p: Proposal): void {
    this.editing.set(p.id);
    this.editValue.set(p.field!.after);
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  protected saveEdit(p: Proposal): void {
    const after = this.editValue().trim();
    if (!after) return;
    const value = LIST_FIELDS.has(p.field!.key)
      ? after
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .join(', ')
      : after;
    this.proposals.update((ps) => ps.map((x) => (x.id === p.id ? { ...x, field: { ...x.field!, after: value } } : x)));
    this.editing.set(null);
    this.#decide(p.id, 'applied');
  }

  #decide(id: number, status: 'applied' | 'skipped'): void {
    if (this.busy()) return;
    this.proposals.update((ps) => ps.map((p) => (p.id === id ? { ...p, status } : p)));
    if (this.editing() === id) this.editing.set(null);
    if (this.mode() === 'cards' && !this.pendingCards().length) this.#reply({ type: 'cards-done' });
  }

  // ---- Conversation ----

  protected onSend(text: string): void {
    const prompt = text.trim();
    if (!prompt || this.busy() || !this.composerOpen()) return;
    const id = this.#nextId++;
    this.#snapshots.set(id, this.#snapshot());
    this.turns.update((ts) => [...ts, { id, from: 'user', text: prompt }]);
    this.#reply({ type: 'user', text: prompt });
  }

  /** Re-edit of the newest user turn: drop what followed, roll back, ask again (AST-04). */
  protected onResend(turnId: number, text: string): void {
    if (this.busy()) return;
    const snapshot = this.#snapshots.get(turnId);
    if (snapshot) this.#restore(snapshot);
    this.turns.update((ts) =>
      ts.slice(0, ts.findIndex((t) => t.id === turnId) + 1).map((t) => (t.id === turnId ? { ...t, text, meta: undefined } : t)),
    );
    this.#reply({ type: 'user', text });
  }

  protected stop(): void {
    this.#abort?.abort();
  }

  protected onStreamComplete(id: number): void {
    const after = this.#after.get(id);
    this.#after.delete(id);
    if (!this.#abort || id !== this.#replyId) return;
    const stopped = this.#abort.signal.aborted;
    this.#abort = null;
    this.busy.set(false);
    if (stopped) {
      const lastUser = [...this.turns()].reverse().find((t) => t.from === 'user');
      const snapshot = lastUser && this.#snapshots.get(lastUser.id);
      if (snapshot) this.#restore(snapshot);
      this.turns.update((ts) => ts.filter((t) => t.id !== id).map((t) => (t === lastUser ? { ...t, meta: 'Reply stopped' } : t)));
      return;
    }
    after?.();
  }

  /** Send to privacy analyst (SKILL.md step 7). */
  protected sendToAnalyst(): void {
    const r = this.record();
    if (!r || this.mode() !== 'ready' || this.busy()) return;
    const submission = buildSubmission(r, this.applied(), this.ownerNote(), new Date().toISOString());
    const { _patched, ...check } = runRecertChecks(submission, r, RECERT_INVENTORY, TODAY);
    if (check.errors.length) {
      this.submitError.set(check.errors);
      return;
    }
    this.#store.submit({ submission, check });
    this.submitted.set(submission);
    this.mode.set('submitted');
    this.#reply({ type: 'open' });
  }

  /** Prototype reset: forget this record's submission or pause and start again. */
  protected startAgain(): void {
    const r = this.record();
    if (!r) return;
    this.#store.clear(r.id);
    this.#start(true);
  }

  #start(found: boolean): void {
    this.#abort?.abort();
    this.#abort = null;
    this.busy.set(false);
    this.turns.set([]);
    this.streamStates.set({});
    this.#snapshots.clear();
    this.#after.clear();
    this.topic.set(0);
    this.proposals.set([]);
    this.outcomes.set({});
    this.newOwner.set('');
    this.ownerNote.set('');
    this.submitted.set(null);
    this.submitError.set([]);
    this.editing.set(null);
    this.#decidedBefore.clear();
    if (!found) return;
    const { open, pause } = this.existing();
    this.mode.set(open || pause ? 'closed' : 'confirm');
    this.#reply({ type: 'open' });
  }

  #snapshot(): Snapshot {
    return {
      topic: this.topic(),
      mode: this.mode(),
      proposals: this.proposals(),
      outcomes: this.outcomes(),
      newOwner: this.newOwner(),
      ownerNote: this.ownerNote(),
    };
  }

  #restore(s: Snapshot): void {
    this.topic.set(s.topic);
    this.mode.set(s.mode);
    this.proposals.set(s.proposals);
    this.outcomes.set(s.outcomes);
    this.newOwner.set(s.newOwner);
    this.ownerNote.set(s.ownerNote);
    this.turns.update((ts) => ts.map((t) => (t.cards ? { ...t, cards: t.cards.filter((c) => s.proposals.some((p) => p.id === c)) } : t)));
  }

  #reply(action: Action): void {
    const controller = new AbortController();
    this.#abort = controller;
    this.busy.set(true);
    const id = this.#nextId++;
    this.#replyId = id;
    this.turns.update((ts) => [...ts, { id, from: 'assistant', text: '', source: this.#send(id, action, controller.signal) }]);
  }

  /** The one send path (AST-01): work out the reply, then stream it. */
  async *#send(turnId: number, action: Action, signal: AbortSignal): AsyncIterable<string> {
    await pause(THINKING_MS, signal);
    if (signal.aborted) return;
    const reply = this.#respond(turnId, action);
    if (reply.after) this.#after.set(turnId, reply.after);
    for (const word of reply.text.match(/\S+\s*|\s+/g) ?? []) {
      if (signal.aborted) return;
      yield word;
      await pause(WORD_MS, signal);
    }
  }

  #respond(turnId: number, action: Action): Reply {
    const r = this.record()!;
    const topic = this.currentTopic();

    if (action.type === 'open') return this.#openingOrClosing();
    if (action.type === 'cards-done') return this.#afterCards();

    const text = action.text;
    const v = verdict(text);
    switch (this.mode()) {
      case 'confirm': {
        if (v === 'unsure') {
          return { text: "That's fine. If you're not sure, answer Yes to keep it as it is, or tell us what you know has changed." };
        }
        if (topic.key === 'ownership') {
          const named = v !== 'yes' ? newOwnerIn(text, false) : undefined;
          if (named) return this.#askHandoff(named);
          if (v === 'yes') return this.#next(`Got it: ${CONFIRMED_PHRASE.ownership.toLowerCase()}.`, 'confirmed');
          if (v === 'no') return this.#askWhatChanged();
          return { text: `Sorry, I didn't catch that. ${topicQuestion('ownership', r)} Yes or No.` };
        }
        const reading = readChange(topic.key, text, r, false);
        const explicitExtra = /\b(?:but|also|except|apart from)\b/i.test(text);
        if (v === 'yes' && !(explicitExtra && reading.proposals.length)) {
          return this.#next(`Got it: ${CONFIRMED_PHRASE[topic.key].toLowerCase()}.`, 'confirmed');
        }
        if (reading.proposals.length) return this.#showCards(turnId, reading.proposals);
        if (v === 'no') return this.#askWhatChanged();
        return { text: `Sorry, I didn't catch that. ${topicQuestion(topic.key, r)} Yes or No.` };
      }

      case 'change': {
        if (topic.key === 'ownership') {
          const named = newOwnerIn(text, true);
          if (named) return this.#askHandoff(named);
          return { text: 'Which team runs this process now?' };
        }
        const reading = readChange(topic.key, text, r, true);
        if (reading.proposals.length) return this.#showCards(turnId, reading.proposals);
        if (verdict(text) === 'yes') return this.#next(`Got it: ${CONFIRMED_PHRASE[topic.key].toLowerCase()}.`, 'confirmed');
        return {
          text:
            topic.key === 'tools'
              ? "I couldn't tell which tool or system changed. Could you name it, and say whether you started using it or stopped?"
              : "I couldn't tell what changed there. Could you name the type of information, and say whether you started or stopped collecting it?",
        };
      }

      case 'handoff': {
        const owner = this.newOwner();
        if (v === 'yes' || text === PAUSE_YES) {
          this.mode.set('paused');
          this.outcomes.update((o) => ({ ...o, ownership: 'paused' }));
          return {
            text:
              `I've paused this recertification and will reach out to ${teamOf(owner)}. Nothing has been sent to the analyst.\n\n` +
              "In this prototype nobody is contacted, so let them know yourself. You'll find the record marked Paused on the Recertification page.",
            after: () => this.#store.addPause({ recordId: r.id, newOwner: owner, pausedAt: new Date().toISOString() }),
          };
        }
        if (v === 'no' || text === PAUSE_NO) {
          const p = this.#addProposals(turnId, [
            {
              kind: 'field',
              field: { key: 'businessProcessOwner', label: FIELD_LABELS.businessProcessOwner, before: fieldValue(r, 'businessProcessOwner'), after: owner },
              reason: `${teamOf(owner)} runs this process now.`,
            },
          ]);
          this.mode.set('cards');
          return { text: `Okay, I'll carry on with you. Here's the change to the owner. Apply it if it's right.`, after: p };
        }
        return { text: `Would you like to pause this recertification and have me reach out to ${teamOf(owner)}? Yes or No.` };
      }

      case 'note': {
        const note = text === NO_NOTE || /^(?:no|nope|nothing|none)\b[.!]?$/i.test(text.trim()) ? '' : text.trim();
        this.ownerNote.set(note);
        this.mode.set('ready');
        return {
          text:
            (note ? "Thanks, I've added that for the analyst. " : 'No problem. ') +
            "When you're ready, send this to the privacy analyst. They'll review it, and nothing changes in the official record until they approve it.",
        };
      }

      default:
        return { text: '' };
    }
  }

  #openingOrClosing(): Reply {
    const r = this.record()!;
    const sub = this.submitted();
    if (sub) {
      const changes = sub.fieldChanges.length + sub.relationshipChanges.length;
      return {
        text:
          `Sent to the privacy analyst${changes ? ` with ${plural(changes, 'change')}` : ', confirming the record is still accurate'}.\n\n` +
          'A privacy analyst will look at it and may message you with a question. Nothing changes in the official record until they approve it. ' +
          `Once they do, your next check-in is set for ${this.date(nextReviewIfApproved(r))}.`,
      };
    }
    const { open, pause } = this.existing();
    if (open) {
      const s = open.submission;
      const changes = s.fieldChanges.length + s.relationshipChanges.length;
      return {
        text:
          `This check-in was sent to the privacy analyst on ${this.date(s.submittedAt)}` +
          `${changes ? ` with ${plural(changes, 'change')}` : ', confirming the record is still accurate'}. ` +
          "It's waiting for their review, and nothing has changed in the official record yet.",
      };
    }
    if (pause) {
      return {
        text: `This check-in was paused on ${this.date(pause.pausedAt)} so ${teamOf(pause.newOwner)} can pick it up. Nothing has been sent to the analyst.`,
      };
    }

    const { state, days } = this.review();
    const first = SIGNED_IN_USER.split(' ')[0];
    const when = r.lastReviewedAt ? `last recertified on ${this.date(r.lastReviewedAt)}` : 'never recertified';
    const due =
      state === 'overdue'
        ? `, and it's ${plural(-(days ?? 0), 'day')} overdue`
        : state === 'due_soon'
          ? `, and it's due in ${plural(days ?? 0, 'day')}`
          : ". It isn't due yet, but you can check in early";
    return {
      text:
        `Hi ${first}. This is the check-in for "${r.name}": you use it to ${r.purpose ? r.purpose.charAt(0).toLowerCase() + r.purpose.slice(1) : 'run this process'}, ` +
        `and it's owned by ${r.businessProcessOwner}. It was ${when}${due}.\n\n` +
        "I'll ask seven quick questions, one at a time. I'm not the final approver: a privacy analyst reviews everything before the record changes.\n\n" +
        topicQuestion('ownership', r),
    };
  }

  #askWhatChanged(): Reply {
    this.mode.set('change');
    return { text: WHAT_CHANGED };
  }

  #askHandoff(owner: string): Reply {
    this.newOwner.set(owner);
    this.mode.set('handoff');
    return { text: `Would you like to pause this recertification and have me reach out to ${teamOf(owner)}?` };
  }

  #showCards(turnId: number, drafts: Omit<Proposal, 'id' | 'status'>[]): Reply {
    const after = this.#addProposals(turnId, drafts);
    this.mode.set('cards');
    const n = drafts.length;
    return {
      text: n === 1 ? "Here's the change I heard. Apply it if it's right, edit it, or skip it." : `I heard ${n} changes. Apply, edit or skip each one.`,
      after,
    };
  }

  /** Adds the cards now (so the panel shows them as proposed); they render under the turn once it's streamed. */
  #addProposals(turnId: number, drafts: Omit<Proposal, 'id' | 'status'>[]): () => void {
    const ids: number[] = [];
    const added = drafts.map((d) => {
      const id = this.#nextProposal++;
      ids.push(id);
      return { ...d, id, status: 'pending' as const };
    });
    this.proposals.update((ps) => [...ps, ...added]);
    return () => this.turns.update((ts) => ts.map((t) => (t.id === turnId ? { ...t, cards: ids } : t)));
  }

  #afterCards(): Reply {
    const key = this.currentTopic().key;
    const thisTopic = this.proposals().filter((p) => p.status !== 'pending' && !this.#decidedBefore.has(p.id));
    for (const p of thisTopic) this.#decidedBefore.add(p.id);
    const appliedNow = thisTopic.filter((p) => p.status === 'applied').length;
    const lead = appliedNow
      ? `Thanks, I've noted ${appliedNow === 1 ? 'that change' : `those ${appliedNow} changes`}.`
      : "Okay, I've left that as it is.";
    return this.#next(lead, appliedNow ? 'changed' : 'confirmed', key);
  }

  readonly #decidedBefore = new Set<number>();

  /** Records the topic's outcome and asks the next topic's question, or wraps up. */
  #next(lead: string, outcome: Outcome, key: TopicKey = this.currentTopic().key): Reply {
    const r = this.record()!;
    this.outcomes.update((o) => ({ ...o, [key]: outcome }));
    const nextIndex = this.topic() + 1;
    if (nextIndex < TOPICS.length) {
      this.topic.set(nextIndex);
      this.mode.set('confirm');
      return { text: `${lead}\n\n${topicQuestion(TOPICS[nextIndex].key, r)}` };
    }
    this.mode.set('note');
    return { text: `${lead}\n\n${this.#recap()}\n\nAnything you want the analyst to know?` };
  }

  /** Owner-facing recap (templates/recertification-submission.md). */
  #recap(): string {
    const r = this.record()!;
    const first = SIGNED_IN_USER.split(' ')[0];
    const applied = this.applied();
    const confirmed = TOPICS.filter((t) => this.outcomes()[t.key] === 'confirmed').map((t) => `• ${t.label}: ${CONFIRMED_PHRASE[t.key]}`);
    const changed = applied.map((p) =>
      p.kind === 'field'
        ? `• ${p.field!.label}: ${p.field!.before || 'not set'} → ${p.field!.after}`
        : `• ${p.relationship!.action === 'added' ? 'Add' : 'Remove'}: ${p.relationship!.name}`,
    );
    const skipped = this.skipped().map((p) => proposalLabel(p));
    const parts = [`Thanks, ${first}. Here's what we covered for "${r.name}".`];
    if (confirmed.length) parts.push(`What you confirmed is still right:\n${confirmed.join('\n')}`);
    parts.push(changed.length ? `What you told us has changed:\n${changed.join('\n')}` : 'You confirmed everything is still accurate, so there are no changes to review.');
    if (skipped.length) parts.push(`Skipped: ${listText(skipped)}.`);
    return parts.join('\n\n');
  }
}
