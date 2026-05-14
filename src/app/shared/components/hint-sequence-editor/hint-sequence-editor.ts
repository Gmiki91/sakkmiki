import { Component, input, output, signal, computed } from '@angular/core';
import { DrawShape } from '@lichess-org/chessground/draw';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Exercise, HintStep, MoveHint } from '../../models/exercise.model';
import { TEACHING_CONCEPTS } from '../../models/teaching-concept.model';

type Phase = 'idle' | 'type-select' | 'arrow-pending' | 'overlay-config' | 'text-config';

@Component({
  selector: 'app-hint-sequence-editor',
  imports: [
    FormsModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatInputModule, MatFormFieldModule, MatTooltipModule,
  ],
  templateUrl: './hint-sequence-editor.html',
  styleUrl: './hint-sequence-editor.scss',
})
export class HintSequenceEditor {
  lastMove = input<string | null>(null);
  exercise = input.required<Exercise>();

  hintSaved = output<MoveHint>();
  hintDeleted = output<string>();           // emits move SAN
  captureArrowsRequested = output<void>();  // parent reads board shapes → calls receiveArrows()
  enterSquareSelectMode = output<void>();   // parent shows board interceptor
  exitSpecialMode = output<void>();         // parent hides interceptor

  readonly concepts = TEACHING_CONCEPTS;

  phase = signal<Phase>('idle');
  pendingSteps = signal<HintStep[]>([]);

  pendingConceptId = signal<string>(TEACHING_CONCEPTS[0].id);
  pendingText = signal<string>('');
  pendingDelay = signal<number>(2000);
  selectedSquare = signal<string>('');
  awaitingSquare = signal<boolean>(false);

  existingHintForMove = computed(() => {
    const move = this.lastMove();
    if (!move) return null;
    return this.exercise().moveHints?.find(h => h.move === move) ?? null;
  });

  selectedConcept = computed(() =>
    TEACHING_CONCEPTS.find(c => c.id === this.pendingConceptId()) ?? TEACHING_CONCEPTS[0]
  );

  canAddOverlayStep = computed(() =>
    this.selectedConcept().squaresNeeded === 0 || this.selectedSquare() !== ''
  );

  // ── Called by parent ─────────────────────────────────────────────

  receiveArrows(shapes: DrawShape[]): void {
    this.pendingSteps.update(s => [...s, {
      type: 'arrow',
      arrows: [...shapes],
      delayAfter: this.pendingDelay(),
    }]);
    this.phase.set('type-select');
  }

  receiveSquare(square: string): void {
    this.selectedSquare.set(square);
    this.awaitingSquare.set(false);
    // don't emit exitSpecialMode — parent already handled it in the click handler
  }

  // ── User actions ─────────────────────────────────────────────────

  startBuilding(): void {
    this.pendingSteps.set([...(this.existingHintForMove()?.steps ?? [])]);
    this.phase.set('type-select');
  }

  selectStepType(type: HintStep['type']): void {
    this.pendingDelay.set(2000);
    if (type === 'arrow') {
      this.phase.set('arrow-pending');
    } else if (type === 'overlay') {
      this.pendingConceptId.set(TEACHING_CONCEPTS[0].id);
      this.selectedSquare.set('');
      this.awaitingSquare.set(false);
      this.phase.set('overlay-config');
    } else {
      this.pendingText.set('');
      this.phase.set('text-config');
    }
  }

  captureArrows(): void {
    this.captureArrowsRequested.emit();
  }

  onConceptChange(): void {
    this.selectedSquare.set('');
    this.awaitingSquare.set(false);
    this.exitSpecialMode.emit();
  }

  requestSquare(): void {
    this.awaitingSquare.set(true);
    this.enterSquareSelectMode.emit();
  }

  cancelSquareSelect(): void {
    this.awaitingSquare.set(false);
    this.exitSpecialMode.emit();
  }

  addOverlayStep(): void {
    const concept = this.selectedConcept();
    this.pendingSteps.update(s => [...s, {
      type: 'overlay',
      conceptId: concept.id,
      square: concept.squaresNeeded > 0 ? this.selectedSquare() : undefined,
      delayAfter: this.pendingDelay(),
    }]);
    this.selectedSquare.set('');
    this.awaitingSquare.set(false);
    this.phase.set('type-select');
  }

  addTextStep(): void {
    this.pendingSteps.update(s => [...s, {
      type: 'text',
      text: this.pendingText(),
      delayAfter: this.pendingDelay(),
    }]);
    this.phase.set('type-select');
  }

  cancelStep(): void {
    this.awaitingSquare.set(false);
    this.selectedSquare.set('');
    this.exitSpecialMode.emit();
    this.phase.set('type-select');
  }

  removeStep(i: number): void {
    this.pendingSteps.update(s => s.filter((_, idx) => idx !== i));
  }

  saveHint(): void {
    const move = this.lastMove();
    if (!move || this.pendingSteps().length === 0) return;
    this.hintSaved.emit({ move, steps: this.pendingSteps() });
    this.reset();
  }

  cancel(): void {
    this.reset();
    this.exitSpecialMode.emit();
  }

  deleteHint(move: string): void {
    this.hintDeleted.emit(move);
  }

  stepLabel(step: HintStep): string {
    if (step.type === 'arrow') return `↗ Arrow · ${step.delayAfter}ms`;
    if (step.type === 'text') return `💬 "${step.text}" · ${step.delayAfter}ms`;
    const concept = TEACHING_CONCEPTS.find(c => c.id === step.conceptId);
    const sq = step.square ? ` on ${step.square}` : '';
    return `🎭 ${concept?.label ?? step.conceptId}${sq} · ${step.delayAfter}ms`;
  }

  private reset(): void {
    this.phase.set('idle');
    this.pendingSteps.set([]);
    this.awaitingSquare.set(false);
    this.selectedSquare.set('');
    this.pendingText.set('');
  }
}
