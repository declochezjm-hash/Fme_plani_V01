import { Injectable, signal } from '@angular/core';

const EDITOR_DARK_KEY = 'gisforge.editorDark';

@Injectable({ providedIn: 'root' })
export class EditorThemeService {
  private readonly _dark = signal(this.readPreference());

  readonly dark = this._dark.asReadonly();

  toggle(): void {
    this.setDark(!this._dark());
  }

  setDark(value: boolean): void {
    this._dark.set(value);
    try {
      localStorage.setItem(EDITOR_DARK_KEY, String(value));
    } catch {
      // ignore
    }
  }

  private readPreference(): boolean {
    try {
      return localStorage.getItem(EDITOR_DARK_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
