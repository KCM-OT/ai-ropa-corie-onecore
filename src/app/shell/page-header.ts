import { Component, input } from '@angular/core';

export interface PageStat {
  label: string;
  value: number | string;
}

// Title block at the top of every Data Mapping page. Projects a description,
// and either summary stats (Pending inventory) or actions ([slot=actions]).
@Component({
  selector: 'app-page-header',
  template: `
    <div class="text">
      <h1>{{ title() }}</h1>
      <ng-content />
    </div>
    @if (stats(); as stats) {
      <dl class="stats">
        @for (s of stats; track s.label) {
          <div>
            <dt>{{ s.label }}</dt>
            <dd>{{ s.value }}</dd>
          </div>
        }
      </dl>
    }
    <div class="actions"><ng-content select="[slot=actions]" /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      flex-shrink: 0;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--oc-spacing-6);
      padding: var(--oc-spacing-5) var(--oc-spacing-5) var(--oc-spacing-6);
      border-bottom: var(--oc-container-border-width) solid var(--oc-border);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: var(--oc-spacing-1);
      min-width: 0;
      font-size: var(--oc-font-size-sm);
      line-height: var(--oc-line-height-relaxed);
    }
    h1 {
      margin: 0;
      font-size: var(--oc-font-size-xl);
      font-weight: 500;
    }
    .stats {
      display: flex;
      gap: var(--oc-spacing-2);
      margin: 0;
    }
    .stats div {
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      gap: var(--oc-spacing-1);
      width: 128px;
      text-align: center;
    }
    dt {
      font-size: var(--oc-font-size-sm);
    }
    dd {
      margin: 0;
      font-size: var(--oc-font-size-2xl);
      font-weight: 500;
    }
    .actions:empty {
      display: none;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: var(--oc-spacing-2);
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly stats = input<PageStat[]>();
}
