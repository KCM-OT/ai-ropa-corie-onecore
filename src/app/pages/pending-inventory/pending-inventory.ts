import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { OcAlert } from '@onetrust/onecore/alert';
import { OcAvatar } from '@onetrust/onecore/avatar';
import { OcBadge } from '@onetrust/onecore/badge';
import { OcButton } from '@onetrust/onecore/button';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcIconButton } from '@onetrust/onecore/icon-button';
import { OcInput } from '@onetrust/onecore/input';
import { OcMenu, OcMenuItem, OcMenuTrigger } from '@onetrust/onecore/menu';
import { DraftsStore } from '../../data/drafts.store';
import { dateFormat, initials } from '../../data/org';
import { PENDING_RECORDS, PENDING_SUMMARY, type PendingRecord } from '../../data/pending-inventory';
import type { RopaDraft } from '../../data/types';
import { PageHeader, type PageStat } from '../../shell/page-header';
import { TableFooter } from '../../shell/table-footer';

type SortKey = 'name' | 'lastUpdated';
interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

function toPending(d: RopaDraft): PendingRecord {
  return {
    id: d.id,
    name: d.name,
    reviewType: 'New record',
    inventoryType: 'Processing activities',
    sourceType: 'AI authoring',
    owner: d.submittedBy,
    lastUpdated: d.submittedAt.slice(0, 10),
    aiDraft: { completeness: d.completeness },
  };
}

// Pending inventory plus any records drafted with Author with AI, which wait
// here as "New record" until a reviewer approves them.
@Component({
  selector: 'app-pending-inventory',
  imports: [
    FormsModule,
    RouterLink,
    OcAlert,
    OcAvatar,
    OcBadge,
    OcButton,
    OcIcon,
    OcIconButton,
    OcInput,
    OcMenu,
    OcMenuItem,
    OcMenuTrigger,
    PageHeader,
    TableFooter,
  ],
  templateUrl: './pending-inventory.html',
  styleUrl: './pending-inventory.scss',
})
export class PendingInventory {
  /** ?draft=<id> highlights a just-submitted AI draft. */
  readonly draft = input<string>();

  readonly #router = inject(Router);
  readonly #store = inject(DraftsStore);

  protected readonly initials = initials;
  protected readonly formatDate = (iso: string) => dateFormat.format(new Date(iso));

  protected readonly query = signal('');
  protected readonly sort = signal<Sort>({ key: 'lastUpdated', dir: 'desc' });
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);

  protected readonly justSent = computed(() => this.#store.drafts().find((d) => String(d.id) === this.draft()));

  protected readonly stats = computed<PageStat[]>(() => {
    const n = this.#store.drafts().length;
    return [
      { label: 'Total pending', value: PENDING_SUMMARY.total + n },
      { label: 'New records', value: PENDING_SUMMARY.newRecords + n },
      { label: 'Updated records', value: PENDING_SUMMARY.updatedRecords },
      { label: 'Similar records', value: PENDING_SUMMARY.similarRecords },
    ];
  });

  protected readonly rows = computed(() => {
    const all = [...this.#store.drafts().map(toPending), ...PENDING_RECORDS];
    const q = this.query().trim().toLowerCase();
    const filtered = q ? all.filter((r) => r.name.toLowerCase().includes(q) || String(r.id).includes(q)) : all;
    const { key, dir } = this.sort();
    const sign = dir === 'asc' ? 1 : -1;
    // Array.prototype.sort is stable, so ties keep the source order (drafts first).
    return [...filtered].sort(
      (a, b) => sign * a[key].localeCompare(b[key], undefined, { sensitivity: 'base', numeric: true }),
    );
  });

  protected readonly visible = computed(() =>
    this.rows().slice((this.page() - 1) * this.pageSize(), this.page() * this.pageSize()),
  );

  protected setQuery(value: string): void {
    this.query.set(value ?? '');
    this.page.set(1);
  }

  protected onSort(key: SortKey): void {
    this.sort.update((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
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

  protected withdraw(id: number): void {
    this.#store.remove(id);
    if (this.justSent()?.id === id || String(id) === this.draft()) {
      this.#router.navigate(['/pending-inventory']);
    }
  }
}
