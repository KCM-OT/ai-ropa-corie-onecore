import { Component, inject } from '@angular/core';
import { OcSelect, OcSelectOption } from '@onetrust/onecore/select';
import { OcToggleButtonGroup, OcToggleButtonGroupItem } from '@onetrust/onecore/toggle-button-group';
import { LANGUAGES, Preferences, type Theme } from '../../data/preferences';
import { PageHeader } from '../../shell/page-header';

// Settings (Figma node 2260:1275), opened from the User Menu.
@Component({
  selector: 'app-settings',
  imports: [PageHeader, OcSelect, OcSelectOption, OcToggleButtonGroup, OcToggleButtonGroupItem],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly #prefs = inject(Preferences);

  protected readonly languages = LANGUAGES;
  protected readonly language = this.#prefs.language;
  protected readonly theme = this.#prefs.theme;
  protected readonly languageLabel = (value: unknown) =>
    LANGUAGES.find((l) => l.value === value)?.label ?? '';

  protected setLanguage(value: unknown): void {
    if (typeof value === 'string') this.language.set(value);
  }

  protected setTheme(value: string[] | undefined): void {
    // A segmented control always keeps one choice, so ignore a click that clears it.
    const next = value?.[0] as Theme | undefined;
    if (next) this.theme.set(next);
  }
}
