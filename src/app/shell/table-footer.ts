import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OcPagination } from '@onetrust/onecore/pagination';
import { OcSelectNative } from '@onetrust/onecore/select-native';

// List-page footer from the live Data Mapping module: oc-pagination, a
// "Showing x–y of z" readout, and an optional page-size picker. oc-pagination
// has no page-size input by design (PAG-03), so that lives here.
@Component({
  selector: 'app-table-footer',
  imports: [FormsModule, OcPagination, OcSelectNative],
  template: `
    <oc-pagination [label]="label()" [page]="page()" [pageCount]="pageCount()" (pageChange)="page.set(+$event)" />
    <div class="meta">
      <span>Showing {{ first() }}–{{ last() }} of {{ total() }}</span>
      @if (pageSizes(); as sizes) {
        <oc-select-native
          size="sm"
          ariaLabel="Rows per page"
          [options]="sizes"
          [displayWith]="sizeLabel"
          [ngModel]="pageSize()"
          (ngModelChange)="onPageSize($event)"
        />
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      flex-shrink: 0;
      align-items: center;
      justify-content: space-between;
      gap: var(--oc-spacing-4);
      padding: var(--oc-spacing-3) var(--oc-spacing-5);
      border-top: var(--oc-container-border-width) solid var(--oc-border);
      font-size: var(--oc-font-size-sm);
    }
    .meta {
      display: flex;
      white-space: nowrap;
      align-items: center;
      gap: var(--oc-spacing-3);
    }
  `,
})
export class TableFooter {
  readonly label = input('Pagination');
  readonly total = input.required<number>();
  readonly page = model(1);
  readonly pageSize = model(20);
  readonly pageSizes = input<number[]>();

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly first = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  protected readonly last = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  protected readonly sizeLabel = (v: unknown) => `${v}/page`;

  protected onPageSize(size: number): void {
    this.pageSize.set(Number(size));
    this.page.set(1);
  }
}
