import { Injectable, signal } from '@angular/core';

export type UxMode = 'novice' | 'expert';

const UX_MODE_KEY = 'gisforge.uxMode';

@Injectable({ providedIn: 'root' })
export class UxModeService {
  private readonly _mode = signal<UxMode>(this.readPreference());

  readonly mode = this._mode.asReadonly();
  readonly isNovice = () => this._mode() === 'novice';
  readonly isExpert = () => this._mode() === 'expert';

  setMode(mode: UxMode): void {
    this._mode.set(mode);
    try {
      localStorage.setItem(UX_MODE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }

  toggle(): void {
    this.setMode(this._mode() === 'novice' ? 'expert' : 'novice');
  }

  private readPreference(): UxMode {
    try {
      const stored = localStorage.getItem(UX_MODE_KEY);
      return stored === 'expert' ? 'expert' : 'novice';
    } catch {
      return 'novice';
    }
  }
}
