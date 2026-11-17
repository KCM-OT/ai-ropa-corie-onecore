import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OcAvatar } from '@onetrust/onecore/avatar';
import { OcBadge } from '@onetrust/onecore/badge';
import { OcButton } from '@onetrust/onecore/button';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcSelect, OcSelectOption } from '@onetrust/onecore/select';
import { dateFormat, initials } from '../../data/org';
import type { ReviewState } from '../../data/recert-check';
import { RecertStore } from '../../data/recert.store';
import { RECERT_ACTIVITIES, recertRecord, recordReviewState, REVIEW_STATE_LABELS } from '../../data/recertification';
import { PageHeader } from '../../shell/page-header';

// Recertification: every active record by when its review is due, the entry
// point to the owner check-in (/recertification/:id) from the sidebar. Follows
// the ropa-recertification skill's review states (SKILL.md step 2): overdue
// when the next review date has passed, due soon within 30 days, else on track.

type View = 'attention' | 'all';

const STATE_COLOR: Record<ReviewState, 'destructive' | 'warning' | 'success' | 'neutral'> = {
  overdue: 'destructive',
  due_soon: 'warning',
  ok: 'success',
  none: 'neutral',
};

@Component({
  selector: 'app-recertification',
  imports: [FormsModule, RouterLink, OcAvatar, OcBadge, OcButton, OcIcon, OcSelect, OcSelectOption, PageHeader],
  templateUrl: './recertification.html',
  styleUrl: './recertification.scss',
})
export class Recertification {
  readonly #store = inject(RecertStore);

  protected readonly initials = initials;
  protected readonly stateLabel = REVIEW_STATE_LABELS;
  protected readonly stateColor = STATE_COLOR;
  protected readonly views: { key: View; label: string }[] = [
    { key: 'attention', label: 'Overdue and due soon' },
    { key: 'all', label: 'All active records' },
  ];
  protected readonly viewLabel = (v: unknown) => this.views.find((x) => x.key === v)?.label ?? '';
  protected readonly view = signal<View>('attention');

  readonly #rows = computed(() =>
    RECERT_ACTIVITIES.map((a) => {
      const rec = recertRecord(a);
      const { state, days } = recordReviewState(rec);
      const open = this.#store.openSubmission(rec.id);
      const pause = this.#store.pause(rec.id);
      const changes = this.#store.changesRequested(rec.id);
      return { a, rec, state, days, open, pause, changes };
    }).sort((x, y) => (x.days ?? Infinity) - (y.days ?? Infinity)),
  );

  protected readonly rows = computed(() =>
    this.view() === 'all' ? this.#rows() : this.#rows().filter((r) => r.state === 'overdue' || r.state === 'due_soon'),
  );

  protected readonly stats = computed(() => {
    const rows = this.#rows();
    return [
      { label: 'Overdue', value: rows.filter((r) => r.state === 'overdue').length },
      { label: 'Due soon', value: rows.filter((r) => r.state === 'due_soon').length },
      { label: 'With the analyst', value: rows.filter((r) => r.open).length },
    ];
  });

  protected date(iso: string | null | undefined): string {
    return iso ? dateFormat.format(new Date(iso)) : '—';
  }

  protected dueText(days: number | null): string {
    if (days === null) return '';
    if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
    if (days === 0) return 'Due today';
    return `In ${days} day${days === 1 ? '' : 's'}`;
  }
}
