import { Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { OcAlert } from '@onetrust/onecore/alert';
import { OcBadge } from '@onetrust/onecore/badge';
import { OcButton } from '@onetrust/onecore/button';
import {
  OcCard,
  OcCardContent,
  OcCardDescription,
  OcCardFooter,
  OcCardHeader,
  OcCardTitle,
} from '@onetrust/onecore/card';
import { OcDescription, OcError, OcFormField, OcLabel } from '@onetrust/onecore/form-field';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcInput } from '@onetrust/onecore/input';
import { OcLoading } from '@onetrust/onecore/loading';
import { OcPath, OcPathStep } from '@onetrust/onecore/path';
import { OcRadioGroup, OcRadioItem } from '@onetrust/onecore/radio';
import { OcSelect, OcSelectOption } from '@onetrust/onecore/select';
import { OcStatus } from '@onetrust/onecore/status';
import { OcTag } from '@onetrust/onecore/tag';
import { OcTextarea } from '@onetrust/onecore/textarea';
import { DraftsStore } from '../../data/drafts.store';
import { completeness, extractDraft, FIELD_LABELS, FOLLOW_UPS, SAMPLE_DESCRIPTION } from '../../data/extract';
import { SIGNED_IN_USER, SUBSIDIARIES, subsidiaryName } from '../../data/org';
import {
  confidenceBand,
  ROLE_HELP,
  ROLE_LABELS,
  type DraftField,
  type ProcessingRole,
  type Relationship,
} from '../../data/types';
import { PageHeader } from '../../shell/page-header';

// After "Draft record", the review step shows the loader for this long before
// the draft, as the real model call would take a few seconds.
const DRAFTING_MS = 2000;

const BAND_INTENT = { high: 'success', medium: 'warning', low: 'error' } as const;

const RELATIONSHIP_LABEL: Record<Relationship['type'], string> = {
  vendor: 'Vendor',
  asset: 'Asset',
  personalData: 'Personal data',
};

@Component({
  selector: 'app-author',
  imports: [
    FormsModule,
    RouterLink,
    OcAlert,
    OcBadge,
    OcButton,
    OcCard,
    OcCardContent,
    OcCardDescription,
    OcCardFooter,
    OcCardHeader,
    OcCardTitle,
    OcDescription,
    OcError,
    OcFormField,
    OcIcon,
    OcInput,
    OcLabel,
    OcLoading,
    OcPath,
    OcPathStep,
    OcRadioGroup,
    OcRadioItem,
    OcSelect,
    OcSelectOption,
    OcStatus,
    OcTag,
    OcTextarea,
    PageHeader,
  ],
  templateUrl: './author.html',
  styleUrl: './author.scss',
})
export class Author {
  readonly #router = inject(Router);
  readonly #drafts = inject(DraftsStore);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  #draftingTimer?: number;

  protected readonly subsidiaries = SUBSIDIARIES;
  protected readonly subsidiaryLabel = (v: unknown) => subsidiaryName(String(v ?? ''));
  protected readonly roles = Object.keys(ROLE_LABELS) as ProcessingRole[];
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roleHelp = ROLE_HELP;
  protected readonly relationshipLabel = RELATIONSHIP_LABEL;

  protected readonly step = signal<'describe' | 'review'>('describe');
  protected readonly stepIndex = computed(() => (this.step() === 'describe' ? 0 : 1));

  // Step 1
  protected readonly name = signal('');
  protected readonly subsidiaryId = signal<string | null>(null);
  protected readonly role = signal<ProcessingRole>('controller');
  protected readonly description = signal('');
  protected readonly fileName = signal<string | undefined>(undefined);
  protected readonly fileError = signal<string | undefined>(undefined);
  protected readonly drafting = signal(false);

  protected readonly canDraft = computed(
    () => Boolean(this.name().trim() && this.subsidiaryId() && this.description().trim()),
  );

  // Step 2
  protected readonly fields = signal<DraftField[]>([]);
  protected readonly relationships = signal<Relationship[]>([]);
  protected readonly answers = signal<Record<string, string>>({});

  protected readonly missing = computed(() =>
    Object.keys(FOLLOW_UPS).filter((k) => !this.fields().some((f) => f.key === k)),
  );

  protected readonly questions = computed(() =>
    this.missing().map((k) => ({ key: k, label: FIELD_LABELS[k] ?? k, prompt: FOLLOW_UPS[k] })),
  );

  // Answers to follow-up questions become user-provided fields.
  protected readonly finalFields = computed<DraftField[]>(() => {
    const answers = this.answers();
    return [
      ...this.fields(),
      ...this.missing()
        .filter((k) => answers[k]?.trim())
        .map((k) => ({ key: k, label: FIELD_LABELS[k] ?? k, value: answers[k].trim() })),
    ];
  });

  protected readonly score = computed(() =>
    completeness(
      this.finalFields(),
      this.relationships(),
      Boolean(this.name().trim()),
      Boolean(this.description().trim()),
      Boolean(this.subsidiaryId()),
    ),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => window.clearTimeout(this.#draftingTimer));
  }

  protected useSample(): void {
    this.description.set(SAMPLE_DESCRIPTION);
    this.fileName.set(undefined);
    if (!this.name().trim()) this.name.set('Candidate screening');
  }

  protected chooseFile(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.fileError.set(undefined);
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name) && !file.type.startsWith('text/')) {
      this.fileError.set('The prototype reads plain-text files (.txt, .md). Paste other documents into the description.');
      return;
    }
    this.description.set(await file.text());
    this.fileName.set(file.name);
  }

  protected draft(): void {
    if (!this.canDraft()) return;
    const result = extractDraft(this.description());
    this.fields.set(result.fields);
    this.relationships.set(result.relationships);
    this.answers.set({});
    this.step.set('review');
    this.drafting.set(true);
    window.clearTimeout(this.#draftingTimer);
    this.#draftingTimer = window.setTimeout(() => this.drafting.set(false), DRAFTING_MS);
  }

  protected goToStep(index: number): void {
    if (index === 0) this.step.set('describe');
    else if (this.canDraft()) this.draft();
  }

  protected editField(key: string, value: string): void {
    this.fields.update((fs) =>
      fs.map((f) => (f.key === key ? { ...f, value, meta: f.meta && { ...f.meta, provenance: 'user' } } : f)),
    );
  }

  protected answer(key: string, value: string): void {
    this.answers.update((a) => ({ ...a, [key]: value }));
  }

  protected setRelStatus(index: number, status: Relationship['status']): void {
    this.relationships.update((rs) =>
      rs.map((r, i) => (i === index ? { ...r, status: r.status === status ? 'suggested' : status } : r)),
    );
  }

  protected confidenceIntent(c: number) {
    return BAND_INTENT[confidenceBand(c)];
  }

  protected confidenceLabel(c: number): string {
    return `${confidenceBand(c)} - ${Math.round(c * 100)}%`;
  }

  protected cancel(): void {
    this.#router.navigate(['/processing-activities']);
  }

  protected submit(): void {
    const saved = this.#drafts.add({
      name: this.name().trim(),
      role: this.role(),
      subsidiaryId: this.subsidiaryId() ?? '',
      description: this.description().trim(),
      fields: this.finalFields(),
      relationships: this.relationships().filter((r) => r.status !== 'rejected'),
      completeness: this.score(),
      sourceFileName: this.fileName(),
      submittedBy: SIGNED_IN_USER,
    });
    this.#router.navigate(['/pending-inventory'], { queryParams: { draft: saved.id } });
  }
}
