import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import {
  OcAssistantActions,
  OcAssistantAttach,
  OcAssistantAttachmentTray,
  OcAssistantComposer,
  OcAssistantInput,
  OcAssistantSubmit,
  OcAssistantSuggestion,
  OcAssistantThread,
} from '@onetrust/onecore/assistant';
import { OcBadge } from '@onetrust/onecore/badge';
import { OcButton } from '@onetrust/onecore/button';
import { OcCard } from '@onetrust/onecore/card';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcIconButton } from '@onetrust/onecore/icon-button';
import { OcTextarea } from '@onetrust/onecore/textarea';
import { daysUntil, type AuthoringSession } from '../../../data/authoring-history';
import { pickVariant, SCENARIOS } from '../../../data/demo-samples';
import {
  attachPrompt,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_SIZE,
  isAttachPrompt,
} from '../../../data/document-text';

/** What the start screen hands to the conversation. */
export interface StartRequest {
  /** The user's description, possibly a sample's text they picked and edited. */
  text: string;
  files: File[];
  /** The record name a sample suggests, when the text came from one. */
  name?: string;
  /** Set when the user opened a pending session. */
  session?: AuthoringSession;
}

/** Pending cards shown before "Show more". */
const FIRST_PENDING = 2;
/** Due within this many days reads as a warning. */
const DUE_SOON_DAYS = 7;

/**
 * AI Assisted RoPA Creation's first screen (Figma: "overall", node 2241:5516),
 * built from OneCore parts: the assistant composer and suggestion chips inside
 * an assistant thread, and the Pending list of earlier sessions as cards.
 * Nothing leaves this screen until the user sends from the composer; a sample
 * chip only fills it.
 */
@Component({
  selector: 'app-ai-start',
  imports: [
    OcAssistantActions,
    OcAssistantAttach,
    OcAssistantAttachmentTray,
    OcAssistantComposer,
    OcAssistantInput,
    OcAssistantSubmit,
    OcAssistantSuggestion,
    OcAssistantThread,
    OcBadge,
    OcButton,
    OcCard,
    OcIcon,
    OcIconButton,
    OcTextarea,
  ],
  templateUrl: './ai-start.html',
  styleUrl: './ai-start.scss',
})
export class AiStart {
  /** Pending sessions, soonest due first. */
  readonly sessions = input.required<AuthoringSession[]>();
  readonly begin = output<StartRequest>();

  private readonly textarea = viewChild.required('prompt', { read: ElementRef<HTMLTextAreaElement> });

  protected readonly samples = SCENARIOS.map((s) => s.chip);
  protected readonly files = signal<File[]>([]);
  protected readonly documentAccept = DOCUMENT_ACCEPT;
  protected readonly documentMaxSize = DOCUMENT_MAX_SIZE;
  /** The record name of the sample in the composer, if the text came from one. */
  readonly #sampleName = signal<string | undefined>(undefined);

  protected readonly showAll = signal(false);
  protected readonly visible = computed(() =>
    this.showAll() ? this.sessions() : this.sessions().slice(0, FIRST_PENDING),
  );

  /** The composer's send: Enter or the Send button, with any attached file. */
  protected send(text: string): void {
    this.begin.emit({ text, files: this.files(), name: this.#sampleName() });
  }

  /**
   * Attaching a document to an empty composer fills in a prompt for it, so
   * Send is ready (the composer only sends with some text). Removing the
   * document takes that prompt away again; anything the user typed stays.
   */
  protected onFiles(files: File[]): void {
    const before = this.files();
    this.files.set(files);
    const el = this.textarea().nativeElement;
    const current = el.value.trim();
    let next: string | undefined;
    if (files.length && (!current || isAttachPrompt(current, before.map((f) => f.name)))) {
      next = attachPrompt(files[0].name);
    } else if (!files.length && isAttachPrompt(current, before.map((f) => f.name))) {
      next = '';
    }
    if (next === undefined) return;
    el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    this.#sampleName.set(undefined);
    el.focus();
    el.setSelectionRange(next.length, next.length);
  }

  protected onInput(): void {
    if (!this.textarea().nativeElement.value.trim()) this.#sampleName.set(undefined);
  }

  /**
   * Put one of the scenario's variants (picked at random) in the composer,
   * ready to edit or send. The chip's own fill-on-click would insert its label,
   * so this sets the field and raises `input`, which the composer listens to.
   */
  protected useSample(chip: string): void {
    const scenario = SCENARIOS.find((s) => s.chip === chip);
    if (!scenario) return;
    const sample = pickVariant(scenario);
    const el = this.textarea().nativeElement;
    el.value = sample.text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    this.#sampleName.set(sample.name);
    el.focus();
    el.setSelectionRange(sample.text.length, sample.text.length);
  }

  protected open(session: AuthoringSession): void {
    this.begin.emit({ text: session.text, files: [], session });
  }

  // ---- Pending cards ----

  protected questionsLabel(n: number): string {
    if (n === 0) return 'Ready to send';
    return n === 1 ? '1 question needs attention' : `${n} questions need attention`;
  }

  protected due(session: AuthoringSession): { label: string; color: 'destructive' | 'warning' | 'neutral' } {
    const days = daysUntil(session.dueAt);
    if (days < 0) {
      const late = -days;
      return { label: `${late} ${late === 1 ? 'day' : 'days'} overdue`, color: 'destructive' };
    }
    if (days === 0) return { label: 'Due today', color: 'warning' };
    if (days <= DUE_SOON_DAYS) return { label: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, color: 'warning' };
    const [y, m, d] = session.dueAt.split('-');
    return { label: `Due ${m}/${d}/${y.slice(2)}`, color: 'neutral' };
  }
}
