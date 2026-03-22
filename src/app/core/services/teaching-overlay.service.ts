import { Injectable, inject, signal } from '@angular/core';
import { TeachingConcept } from '../../shared/models/teaching-concept.model';
import { RealtimeService } from './realtime.service';
import { SoundService } from './sound.service';

@Injectable({ providedIn: 'root' })
export class TeachingOverlayService {
  private realtimeService = inject(RealtimeService);
  private soundService = inject(SoundService);

  activeConceptId = signal<string | null>(null);
  selectedSquares = signal<string[]>([]);
  isSelectingSquares = signal<boolean>(false);
  pendingConcept = signal<TeachingConcept | null>(null);

  startConcept(concept: TeachingConcept): void {
    if (concept.squaresNeeded === 0) {
      this.trigger(concept, []);
    } else {
      this.pendingConcept.set(concept);
      this.selectedSquares.set([]);
      this.isSelectingSquares.set(true);
      this.activeConceptId.set(null);
    }
  }

  onSquareClicked(square: string): void {
    const concept = this.pendingConcept();
    if (!concept || !this.isSelectingSquares()) return;

    const current = this.selectedSquares();
    if (current.includes(square)) return;

    const updated = [...current, square];
    this.selectedSquares.set(updated);

    if (updated.length >= concept.squaresNeeded) {
      this.trigger(concept, updated);
    }
  }

  clear(): void {
    this.activeConceptId.set(null);
    this.selectedSquares.set([]);
    this.isSelectingSquares.set(false);
    this.pendingConcept.set(null);
    this.realtimeService.clearTeachingOverlay();
  }

  private trigger(concept: TeachingConcept, squares: string[]): void {
    this.activeConceptId.set(concept.id);
    this.selectedSquares.set(squares);
    this.isSelectingSquares.set(false);
    if (concept.sound) this.soundService.play(concept.sound);
    this.pendingConcept.set(null);
    this.realtimeService.sendTeachingOverlay(concept.id, squares);
  }
}