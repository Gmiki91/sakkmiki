import { Component, inject, signal, computed, effect, OnDestroy,viewChild, ChangeDetectorRef, untracked } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { SoundService } from '../../../core/services/sound.service';
import { ExerciseBoard } from '../exercise-board/exercise-board';
import { ChallengeBoard } from '../challenge-board/challenge-board';
import { SimulBoard } from '../simul-board/simul-board';
import { GatheredBoard } from '../gathered-board/gathered-board';
import { PuzzleRushBoard } from '../../../shared/components/puzzle-rush-board/puzzle-rush-board';
import { PuzzleRushRacer } from '../../../core/../features/classroom/puzzle-rush-racer/puzzle-rush-racer';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChallengePair } from '../../../shared/models/challenge-pair.model';

@Component({
  selector: 'app-student-view',
  imports: [CommonModule,MatCardModule, MatIconModule, MatButtonModule, ExerciseBoard, ChallengeBoard, SimulBoard, GatheredBoard, PuzzleRushBoard, PuzzleRushRacer],
  templateUrl: './student-view.html',
  styleUrl: './student-view.scss',
})
export class StudentView implements OnDestroy {
  exerciseBoard = viewChild(ExerciseBoard);
  private cdRef = inject(ChangeDetectorRef);
  classroomStore = inject(ClassroomStore);
  soundService = inject(SoundService);
  router = inject(Router);
  readonly emoji = signal(this.pickEmoji());

  myPair = computed(() =>
    this.classroomStore.challengePairs().find(
      p => p.white === this.classroomStore.studentName() ||
           p.black === this.classroomStore.studentName()
    ) ?? null
  );

  title = computed(() => {
    if (this.classroomStore.isPuzzleRushActive()) return 'Verseny!';
    if(this.classroomStore.isDuelActive()) return 'Párbaj a tanár ellen 😱';
    if(this.classroomStore.mode() === 'gathered')return 'Achtung!';
    if(this.classroomStore.mode()==='simul')return 'Szimultán a tanár ellen 😱'
    if (this.myPair()) return `${this.myPair()!.white} vs ${this.myPair()!.black}`;
    return `Szia ${this.classroomStore.studentName()}! ${this.emoji()}`;
  });

  private curtainInitialized = false;

  // Buffer signals — template reads these, not the store directly
displayMode = signal(this.classroomStore.mode());
displayPair = signal<ChallengePair | null>(null);
displayDuel = signal(this.classroomStore.isDuelActive())


  constructor() {
    effect(() => {
      this.classroomStore.curtainClosed();
      if (!this.curtainInitialized) { this.curtainInitialized = true; return; }
      this.soundService.play('curtain');
    });
    this.classroomStore.kick$.pipe(takeUntilDestroyed()).subscribe(() => {
      this.classroomStore.leave();
      this.router.navigate([`/bye`]);
    });
  effect(() => {
    const mode = this.classroomStore.mode();
    const pair = this.myPair();
    const duel = this.classroomStore.isDuelActive();
    const curtain = untracked(()=>this.classroomStore.curtainClosed())

    if (!document.startViewTransition || curtain) {
      this.displayMode.set(mode);
      this.displayPair.set(pair);
      this.displayDuel.set(duel);
      return;
    }

    document.startViewTransition(() => {
      this.displayMode.set(mode);
      this.displayPair.set(pair);
      this.displayDuel.set(duel);
      this.cdRef.detectChanges(); // synchronous, completes before browser snapshots new state
    });
  });
  }

  ngOnDestroy(): void {
    this.classroomStore.leave();
  }

  toggleSound(): void {
    this.soundService.isMute.update(v => !v);
  }

  onPuzzleRushProgress(ev: { score: number; wrongMoves: number; currentIndex: number; totalPuzzles: number }): void {
    this.classroomStore.sendPuzzleRushProgress(ev.score, ev.wrongMoves, ev.currentIndex, ev.totalPuzzles);
  }

  private pickEmoji(): string {
    const list = ['🐣','🐵','🐶','🐱','🦁','🐯','🐮','🐷','🐭','🐰','🐹','🐻','🐻‍❄️','🐼','🐣','🦉'];
    return list[Math.floor(Math.random() * list.length)];
  }
}
