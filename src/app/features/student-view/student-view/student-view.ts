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
import { GatheredBoard } from '../gathered-board/gathered-board';

@Component({
  selector: 'app-student-view',
  imports: [MatCardModule, MatIconModule, MatButtonModule, WhiteBoard, ExerciseBoard, ChallengeBoard, SimulBoard, GatheredBoard],
  templateUrl: './student-view.html',
  styleUrl: './student-view.scss',
})
export class StudentView implements OnDestroy {
  exerciseBoard = viewChild(ExerciseBoard);

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
    return `Szia ${this.classroomStore.studentName()}! ${this.emoji()}`;
  });

  
  private curtainInitialized = false;
  
  constructor(){
      effect(() => {
      this.classroomStore.curtainClosed();
      if (!this.curtainInitialized) { this.curtainInitialized = true; return; }
      this.soundService.play('curtain');
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
