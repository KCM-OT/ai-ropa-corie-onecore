import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  aiSparkles,
  arrowDown,
  arrowDownToBracket,
  arrowUp,
  arrowsRotate,
  arrowsV,
  bell,
  buildings,
  caretDown,
  check,
  chevronDown,
  chevronLeft,
  circleCheck,
  columns3,
  ellipsis,
  fileMagnifyingGlass,
  gear,
  grid,
  magnifyingGlass,
  paperclip,
  plus,
  provideOcIcons,
  questionCircle,
  sidebarLeft,
  sidebarRight,
  xmark,
} from '@onetrust/onecore/icon';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // OneCore icons are tree-shaken: register every icon a screen renders.
    // An unregistered name renders nothing (with a dev-mode console error).
    provideOcIcons([
      aiSparkles,
      arrowDown,
      arrowDownToBracket,
      arrowUp,
      arrowsRotate,
      arrowsV,
      bell,
      buildings,
      caretDown,
      check,
      chevronDown,
      chevronLeft,
      circleCheck,
      columns3,
      ellipsis,
      fileMagnifyingGlass,
      gear,
      grid,
      magnifyingGlass,
      paperclip,
      plus,
      questionCircle,
      sidebarLeft,
      sidebarRight,
      xmark,
    ]),
  ],
};
