import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { findNavLink } from '../shell/nav';
import { PageHeader } from '../shell/page-header';

// Stand-in for every nav item that doesn't have its own page yet.
@Component({
  selector: 'app-placeholder',
  imports: [PageHeader],
  template: `
    <app-page-header [title]="label" />
    <div class="empty">
      <p class="title">Not built yet</p>
      <p>This page is in the navigation but the prototype doesn't have it yet. Add a route for <code>{{ path }}</code> in <code>app.routes.ts</code> to build it.</p>
    </div>
  `,
  styles: `
    .empty {
      max-width: 28rem;
      margin: auto;
      padding: var(--oc-spacing-8);
      text-align: center;
      font-size: var(--oc-font-size-sm);
      color: var(--oc-muted-foreground);
    }
    .title {
      font-size: var(--oc-font-size-md);
      font-weight: 500;
      color: var(--oc-foreground);
    }
    code {
      padding: 0 var(--oc-spacing-1);
      border-radius: var(--oc-control-radius-sm);
      background: var(--oc-secondary);
    }
  `,
})
export class Placeholder {
  protected readonly path = inject(Router).url.split('?')[0];
  protected readonly label = findNavLink(this.path)?.label ?? 'Not found';
}
