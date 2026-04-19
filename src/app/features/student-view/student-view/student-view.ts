import { Component, inject, signal, computed, effect, viewChild, OnDestroy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { SoundService } from '../../../core/services/sound.service';
import { WhiteBoard } from '../../../shared/components/white-board/white-board';
import { ExerciseBoard } from '../exercise-board/exercise-board';
import { ChallengeBoard } from '../challenge-board/challenge-board';
import { SimulBoard } from '../simul-board/simul-board';

@Component({
  selector: 'app-student-view',
  imports: [MatCardModule, MatIconModule, MatButtonModule, WhiteBoard, ExerciseBoard, ChallengeBoard, SimulBoard],
  templateUrl: './student-view.html',
  styleUrl: './student-view.scss',
})
export class StudentView implements OnDestroy {
  private exerciseBoard = viewChild(ExerciseBoard);
  private challengeBoard = viewChild(ChallengeBoard);
  private simulBoard = viewChild(SimulBoard);

  classroomStore = inject(ClassroomStore);
  soundService = inject(SoundService);

  readonly emoji = signal(this.pickEmoji());

  myPair = computed(() =>
    this.classroomStore.challengePairs().find(
      p => p.white === this.classroomStore.studentName() ||
           p.black === this.classroomStore.studentName()
    ) ?? null
  );

  title = computed(() => {
    if (this.myPair()) return `${this.myPair()!.white} vs ${this.myPair()!.black}`;
    if (this.classroomStore.mode() === 'simul') return 'Szimultán a tanár ellen 😱';
    if (this.classroomStore.mode() === 'gathered') return '';
    return `Szia ${this.classroomStore.studentName()}! ${this.emoji()}`;
  });

  constructor() {
    // Presence sync — driven by exercise state changes
    effect(() => {
      const eb = this.exerciseBoard();
      if (!eb) return;
      const exIndex = eb.exIndex();
      const locked = eb.isLocked();
      const awaitingStamp = eb.isWaitingForStamp();
      const status = eb.status();
      const feedback = eb.feedback();
      this.classroomStore.updatePresence({ status, feedback, exIndex, locked, awaitingStamp });
    });

    // Request FEN from teacher (re-broadcast current FEN)
    effect(() => {
      if (!this.classroomStore.requestFen()) return;
      this.classroomStore.requestFen.set(false);
      if (this.classroomStore.mode() === 'gathered' || this.myPair()) return;
      const fen = this.exerciseBoard()?.exerciseFen() ?? '';
      if (fen) this.classroomStore.broadcastStudentFen(this.classroomStore.studentName(), fen);
    });
  }

  ngOnDestroy(): void {
    this.classroomStore.leave();
  }

  toggleSound(): void {
    this.soundService.isMute.update(v => !v);
  }

  private pickEmoji(): string {
    const list = ['🐣','🐵','🐶','🐱','🦁','🐯','🐮','🐷','🐭','🐰','🐹','🐻','🐻‍❄️','🐼','🐣','🦉'];
    return list[Math.floor(Math.random() * list.length)];
  }
}
