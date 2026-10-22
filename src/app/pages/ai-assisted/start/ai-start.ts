import { Component, computed, ElementRef, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { OcAvatar } from '@onetrust/onecore/avatar';
import { OcBadge } from '@onetrust/onecore/badge';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcTag } from '@onetrust/onecore/tag';
import type { AuthoringSession } from '../../../data/authoring-history';
import { SCENARIOS } from '../../../data/demo-samples';
import { initials } from '../../../data/org';

/** What the start screen hands to the conversation. */
export interface StartRequest {
  /** The user's description, or a sample chip's label (the page picks a variant). */
  text: string;
  files: File[];
  /** Set when the user opened a session from History. */
  session?: AuthoringSession;
}

export const TEMPLATE_PROMPT =
  'Our [team] collects [data] from [people] to [purpose], using [tools], and keeps it for [time].';

const ACCEPT = /\.(txt|md|csv)$/i;
const MAX_SIZE = 1_000_000;

// The browser's speech recognition, where it exists (Chrome, Edge, Safari).
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
const SpeechRecognitionImpl: (new () => Recognition) | undefined =
  typeof window === 'undefined'
    ? undefined
    : ((window as unknown as Record<string, unknown>)['SpeechRecognition'] ??
        (window as unknown as Record<string, unknown>)['webkitSpeechRecognition']) as (new () => Recognition) | undefined;

/**
 * AI Assisted RoPA Creation's first screen (Figma: Main-AI-Prompt): title,
 * the AI input, sample prompts, and the history of earlier sessions.
 * Sending anything here opens the conversation beside the live draft.
 */
@Component({
  selector: 'app-ai-start',
  imports: [OcAvatar, OcBadge, OcIcon, OcTag],
  templateUrl: './ai-start.html',
  styleUrl: './ai-start.scss',
})
export class AiStart implements OnDestroy {
  readonly sessions = input.required<AuthoringSession[]>();
  readonly begin = output<StartRequest>();

  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('prompt');
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('file');

  protected readonly samples = SCENARIOS.map((s) => s.chip);
  protected readonly template = TEMPLATE_PROMPT;
  protected readonly text = signal('');
  protected readonly files = signal<File[]>([]);
  protected readonly fileError = signal('');
  protected readonly focused = signal(false);
  protected readonly listening = signal(false);
  protected readonly voiceSupported = Boolean(SpeechRecognitionImpl);
  protected readonly canSend = computed(() => this.text().trim().length > 0 || this.files().length > 0);
  protected readonly initials = initials;
  #recognition: Recognition | null = null;

  protected onInput(value: string): void {
    this.text.set(value);
    this.#autosize();
  }

  protected onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.send();
    } else if (e.key === 'Tab' && !e.shiftKey && !this.text()) {
      // Tab on an empty input fills in the template, ready to edit, with its first blank selected.
      e.preventDefault();
      this.useTemplate();
    }
  }

  protected useTemplate(): void {
    const el = this.textarea().nativeElement;
    this.onInput(TEMPLATE_PROMPT);
    el.value = TEMPLATE_PROMPT;
    el.focus();
    const start = TEMPLATE_PROMPT.indexOf('[');
    el.setSelectionRange(start, TEMPLATE_PROMPT.indexOf(']') + 1);
  }

  protected send(): void {
    if (!this.canSend()) return;
    this.#stopListening();
    this.begin.emit({ text: this.text().trim(), files: this.files() });
  }

  protected sendSample(chip: string): void {
    this.begin.emit({ text: chip, files: [] });
  }

  protected open(session: AuthoringSession): void {
    this.begin.emit({ text: session.text, files: [], session });
  }

  // ---- Attachments ----

  protected pickFile(): void {
    this.fileInput().nativeElement.click();
  }

  protected onFile(list: FileList | null): void {
    const file = list?.[0];
    this.fileInput().nativeElement.value = '';
    if (!file) return;
    if (!ACCEPT.test(file.name) && !file.type.startsWith('text/')) {
      this.fileError.set(`${file.name} isn't a text file. Attach a .txt, .md or .csv file.`);
      return;
    }
    if (file.size > MAX_SIZE) {
      this.fileError.set(`${file.name} is over 1 MB.`);
      return;
    }
    this.fileError.set('');
    this.files.set([file]);
  }

  protected removeFile(): void {
    this.files.set([]);
    this.textarea().nativeElement.focus();
  }

  // ---- Voice input ----

  protected toggleVoice(): void {
    if (this.listening()) return this.#stopListening();
    if (!SpeechRecognitionImpl) return;
    const rec = new SpeechRecognitionImpl();
    rec.lang = 'en-GB';
    rec.interimResults = true;
    rec.continuous = true;
    const before = this.text() ? `${this.text().trimEnd()} ` : '';
    rec.onresult = (e) => {
      const heard = Array.from(e.results, (r) => r[0].transcript).join('');
      this.onInput(before + heard);
      this.textarea().nativeElement.value = before + heard;
    };
    rec.onend = () => this.listening.set(false);
    rec.onerror = (e) => {
      this.listening.set(false);
      if (e.error === 'not-allowed') this.fileError.set('Allow microphone access to dictate.');
    };
    this.#recognition = rec;
    this.fileError.set('');
    this.listening.set(true);
    rec.start();
  }

  #stopListening(): void {
    this.#recognition?.stop();
    this.#recognition = null;
    this.listening.set(false);
  }

  ngOnDestroy(): void {
    this.#stopListening();
  }

  #autosize(): void {
    const el = this.textarea().nativeElement;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // ---- History ----

  protected completenessColor(n: number): 'success' | 'warning' | 'destructive' {
    return n >= 80 ? 'success' : n >= 50 ? 'warning' : 'destructive';
  }

  /** MM/DD/YY, as in the design. */
  protected shortDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${m}/${d}/${y.slice(2)}`;
  }
}
