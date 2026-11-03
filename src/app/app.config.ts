import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  aiSparkles,
  anglesUpDown,
  arrowDown,
  arrowDownToBracket,
  arrowsRotate,
  arrowsV,
  arrowUp,
  arrowUpRightFromSquare,
  check,
  chevronDown,
  chevronLeft,
  chevronUp,
  circleStop,
  codeBranch,
  columns3,
  comments,
  ellipsis,
  fileHalfDashed,
  fileMagnifyingGlass,
  folderOpen,
  inbox,
  magnifyingGlass,
  paperclip,
  paperPlane,
  plus,
  quoteRight,
  sidebarRight,
  sparkles,
  triangleExclamation,
  xmark,
  provideOcIcons,
} from '@onetrust/onecore/icon';

import { provideChoreography } from '@onetrust/onecore/choreography';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Motion settings for [ocStream], which streams the AI assistant's replies.
    provideChoreography({ reducedMotion: 'auto' }),
    // OneCore icons are tree-shaken: register every icon a screen renders.
    // An unregistered name renders nothing (with a dev-mode console error).
    provideOcIcons([
      aiSparkles,
      anglesUpDown,
      arrowDown,
      arrowDownToBracket,
      arrowsRotate,
      arrowsV,
      arrowUp,
      arrowUpRightFromSquare,
      check,
      chevronDown,
      chevronLeft,
      chevronUp,
      circleStop,
      codeBranch,
      columns3,
      comments,
      ellipsis,
      fileHalfDashed,
      fileMagnifyingGlass,
      folderOpen,
      inbox,
      magnifyingGlass,
      paperclip,
      paperPlane,
      plus,
      quoteRight,
      sidebarRight,
      sparkles,
      triangleExclamation,
      xmark,
    ]),
  ],
};
