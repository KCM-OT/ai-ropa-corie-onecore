import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { OcAlert } from '@onetrust/onecore/alert';
import { OcAvatar } from '@onetrust/onecore/avatar';
import { OcBadge, type OcBadgeColor } from '@onetrust/onecore/badge';
import { OcButton } from '@onetrust/onecore/button';
import { OcCheckbox } from '@onetrust/onecore/checkbox';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcIconButton } from '@onetrust/onecore/icon-button';
import { OcInput } from '@onetrust/onecore/input';
import { OcMenu, OcMenuItem, OcMenuSeparator, OcMenuTrigger } from '@onetrust/onecore/menu';
import { OcSelect, OcSelectOption } from '@onetrust/onecore/select';
import { DraftsStore } from '../../data/drafts.store';
import { initials, subsidiaryName } from '../../data/org';
import {
  PROCESSING_ACTIVITIES,
  reviewStatus,
  type RecordStatus,
  type ReviewStatus,
} from '../../data/processing-activities';
import { PageHeader } from '../../shell/page-header';
import { TableFooter } from '../../shell/table-footer';

// Table layout follows the live Data Mapping processing activities list
// (screenshot, 15 Oct 2026): selection, row actions, ID, Name with preview,
// Managing organization, Business process owner, Status.

const RECORD_STATUS: Record<RecordStatus, { label: string; color: OcBadgeColor }> = {
  active: { label: 'Active', color: 'success' },
  pending: { label: 'Pending', color: 'warning' },
  archived: { label: 'Archived', color: 'neutral' },
};

type View = 'default' | 'overdue' | 'due-soon';
const VIEWS: { key: View; label: string }[] = [
  { key: 'default', label: 'OneTrust default' },
  { key: 'overdue', label: 'Overdue reviews' },
  { key: 'due-soon', label: 'Due in 30 days' },
];

type SortKey = 'id' | 'name' | 'status';
interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}
const DEFAULT_SORT: Sort = { key: 'name', dir: 'asc' };

@Component({
  selector: 'app-processing-activities',
  imports: [
    FormsModule,
    RouterLink,
    OcAlert,
    OcAvatar,
    OcBadge,
    OcButton,
    OcCheckbox,
    OcIcon,
    OcIconButton,
    OcInput,
    OcMenu,
    OcMenuItem,
    OcMenuSeparator,
    OcMenuTrigger,
    OcSelect,
    OcSelectOption,
    PageHeader,
    TableFooter,
  ],
  templateUrl: './processing-activities.html',
  styleUrl: './processing-activities.scss',
})
export class ProcessingActivities {
  protected readonly router = inject(Router);
  protected readonly drafts = inject(DraftsStore).drafts;

  protected readonly views = VIEWS;
  protected readonly recordStatus = RECORD_STATUS;
  protected readonly subsidiaryName = subsidiaryName;
  protected readonly initials = initials;
  protected readonly viewLabel = (v: unknown) => VIEWS.find((x) => x.key === v)?.label ?? '';

  protected readonly query = signal('');
  protected readonly view = signal<View>('default');
  protected readonly sort = signal<Sort>(DEFAULT_SORT);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly selected = signal<ReadonlySet<number>>(new Set());

  readonly #records = PROCESSING_ACTIVITIES.map((r) => ({ ...r, review: reviewStatus(r) as ReviewStatus }));

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const view = this.view();
    const { key, dir } = this.sort();
    const filtered = this.#records.filter(
      (r) =>
        (view === 'default' || r.review === view) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          String(r.id).includes(q) ||
          subsidiaryName(r.subsidiaryId).toLowerCase().includes(q) ||
          r.owner.toLowerCase().includes(q)),
    );
    const sign = dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (key === 'id') return sign * (a.id - b.id);
      const av = key === 'name' ? a.name : RECORD_STATUS[a.status].label;
      const bv = key === 'name' ? b.name : RECORD_STATUS[b.status].label;
      return sign * av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true });
    });
  });

  protected readonly visible = computed(() =>
    this.rows().slice((this.page() - 1) * this.pageSize(), this.page() * this.pageSize()),
  );

  protected readonly viewModified = computed(
    () => this.query().trim() !== '' || this.sort().key !== DEFAULT_SORT.key || this.sort().dir !== DEFAULT_SORT.dir,
  );

  protected readonly selectedOnPage = computed(() => this.visible().filter((r) => this.selected().has(r.id)).length);
  protected readonly allChecked = computed(() => this.visible().length > 0 && this.selectedOnPage() === this.visible().length);
  protected readonly someChecked = computed(() => this.selectedOnPage() > 0 && !this.allChecked());

  protected setQuery(value: string): void {
    this.query.set(value ?? '');
    this.page.set(1);
  }

  protected setView(value: unknown): void {
    this.view.set(value as View);
    this.page.set(1);
  }

  protected onSort(key: SortKey): void {
    this.sort.update((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    this.page.set(1);
  }

  protected ariaSort(key: SortKey): string {
    const s = this.sort();
    return s.key !== key ? 'none' : s.dir === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(key: SortKey) {
    const s = this.sort();
    return s.key !== key ? 'arrows-v' : s.dir === 'asc' ? 'arrow-up' : 'arrow-down';
  }

  protected toggleAll(): void {
    const ids = this.visible().map((r) => r.id);
    const clear = this.allChecked();
    this.selected.update((s) => {
      const next = new Set(s);
      ids.forEach((id) => (clear ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  protected toggleOne(id: number): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
}
