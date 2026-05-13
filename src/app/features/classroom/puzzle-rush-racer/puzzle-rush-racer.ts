import { Component, inject, computed, input } from '@angular/core';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-puzzle-rush-racer',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './puzzle-rush-racer.html',
  styleUrl: './puzzle-rush-racer.scss',
})
export class PuzzleRushRacer {
  store = inject(ClassroomStore);
  readonly = input(false);

  private rawStudents = computed(() => {
    const progress = this.store.puzzleRushProgress();
    const colors = this.store.puzzleRushStudentColors();
    const allNames = new Set([
      ...Object.keys(colors),
      ...Object.keys(progress),
      ...this.store.students().map(s => s.name),
    ]);
    return [...allNames].map(name => {
      const p = progress[name];
      return {
        name,
        color: colors[name] ?? '#ff0000',
        score: p?.score ?? 0,
        wrongMoves: p?.wrongMoves ?? 0,
        currentIndex: p?.currentIndex ?? 0,
        totalPuzzles: p?.totalPuzzles ?? 1,
      };
    }).sort((a, b) => {
      const aPct = a.totalPuzzles > 0 ? a.currentIndex / a.totalPuzzles : 0;
      const bPct = b.totalPuzzles > 0 ? b.currentIndex / b.totalPuzzles : 0;
      if (aPct !== bPct) return bPct - aPct;
      return b.score - a.score;
    });
  });

  roads = computed(() => {
    const students = this.rawStudents();
    const roads: { lane1: typeof students[0] | null; lane2: typeof students[0] | null }[] = [];
    for (let i = 0; i < students.length; i += 2) {
      roads.push({
        lane1: students[i],
        lane2: students[i + 1] ?? null,
      });
    }
    return roads;
  });

  progressWidth(student: { score: number; totalPuzzles: number }): number {
    if (student.totalPuzzles <= 0 || student.score == 0) return 0;
    return (student.score / student.totalPuzzles) * 90 + 5;
  }

  endRush(): void {
    this.store.sendPuzzleRushEnd();
  }
}
