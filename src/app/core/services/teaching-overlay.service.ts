import { Injectable, inject, signal } from '@angular/core';
import { TeachingConcept, TeachingConceptListItem } from '../../shared/models/teaching-concept.model';
import { ClassroomStore } from './classroom-store.service';
import { SoundService } from './sound.service';

@Injectable({ providedIn: 'root' })
export class TeachingOverlayService {
  private classroomStore = inject(ClassroomStore);
  private soundService = inject(SoundService);

  activeConcepts = signal<TeachingConceptListItem[]>([]);
  selectedSquares = signal<string[]>([]);
  isSelectingSquares = signal<boolean>(false);
  pendingConcept = signal<TeachingConcept | null>(null);

  startConcept(concept: TeachingConcept): void {
    if(this.activeConcepts().some(c=>c.id === concept.id)){
      this.removeOne(concept.id);
      return;
    }
    if (concept.squaresNeeded === 0) {
      this.trigger(concept, []);
    } else {
      this.pendingConcept.set(concept);
      this.selectedSquares.set([]);
      this.isSelectingSquares.set(true);
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

  removeOne(conceptId: string): void {
    this.activeConcepts.update(list => list.filter(c => c.id !== conceptId));
    this.classroomStore.sendTeachingOverlay(this.activeConcepts());
  }

  cancelSquareSelection(): void {
    this.isSelectingSquares.set(false);
    this.pendingConcept.set(null);
  }

  private trigger(concept: TeachingConcept, squares: string[]): void {
    this.activeConcepts.update(list => {
      const filtered = list.filter(c => c.id !== concept.id);
      return [...filtered, { id: concept.id, squares }];
    });
    this.selectedSquares.set([]);
    this.isSelectingSquares.set(false);
    this.pendingConcept.set(null);
    if (concept.sound) this.soundService.play(concept.sound);
      this.classroomStore.sendTeachingOverlay(this.activeConcepts());
  }
}