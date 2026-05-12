import { Component, input, output, inject, signal, computed } from '@angular/core';
import { ExerciseList } from '../../models/exercise-list.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { ExerciseType } from '../../models/exercise.model';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';

export type ExerciseListPickerData = {
  multiSelect: boolean;
  alreadySelected: ExerciseList[];
  puzzleRush?: boolean;
};

@Component({
  selector: 'app-exercise-list-picker',
  imports: [MatButtonModule, MatInputModule, MatIconModule, MatDialogModule, MatChipsModule, FormsModule],
  templateUrl: './exercise-list-picker.html',
  styleUrl: './exercise-list-picker.scss',
})
export class ExerciseListPicker {
  // for graying out list(s) that are already loaded (1 for puzzle rush, 1+ for classroom)
  alreadySelected = input<ExerciseList[]>([]);
  select = output<ExerciseList[]>();

  exerciseService = inject(ExerciseService);

  // Optional — only present when opened as a dialog
  private dialogRef = inject(MatDialogRef<ExerciseListPicker>, { optional: true });
  private dialogData = inject<ExerciseListPickerData>(MAT_DIALOG_DATA, { optional: true });

  isPuzzleRush = computed(() => this.dialogData?.puzzleRush);
  // select one list and close (puzzle rush) or multiple lists are selectable (classroom)
  isMultiSelect = computed(() => this.dialogData?.multiSelect);
  // dialogData values from modal use (classroom, puzzlerush), input values for inline use (exercises)
  computedAlreadySelected = computed(() => this.dialogData?.alreadySelected ?? this.alreadySelected());

  pendingSelection = signal<ExerciseList[]>([]);

  // Search, filter
  searchQuery = signal(''); 
  filterType = signal<ExerciseType | ''>('');

  readonly types: ExerciseType[] = ['puzzle', 'mushroom', 'challenge', 'demo'];

  filteredLists = computed(() => {
    let lists = this.exerciseService.exerciseLists();

    // Filter by type
    if (this.filterType()) {
      lists = lists.filter((l) => l.type === this.filterType());
    }

    // Search by title
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      lists = lists.filter((l) => l.title.toLowerCase().includes(query));
    }

    return lists;
  });

  setFilterType(type: ExerciseType | ''): void {
    this.filterType.set(type === this.filterType() ? '' : type);
  }

  isAlreadySelected(list: ExerciseList): boolean {
    return this.computedAlreadySelected().some((l) => l.id === list.id);
  }

  isPending(list: ExerciseList): boolean {
    return this.pendingSelection().some((l) => l.id === list.id);
  }

  toggleList(list: ExerciseList): void {
    if (this.isAlreadySelected(list)) return;

    if (!this.isMultiSelect()) {
      // Single select: emit and close immediately
      this.emit([list]);
      return;
    }

    // Multi select: toggle pending
    if (this.isPending(list)) {
      this.pendingSelection.update((prev) => prev.filter((l) => l.id !== list.id));
    } else {
      this.pendingSelection.update((prev) => [...prev, list]);
    }
  }

  confirm(): void {
    this.emit(this.pendingSelection());
  }

  cancel(): void {
    if (this.dialogRef) {
      this.dialogRef.close(null);
    } else {
      this.pendingSelection.set([]);
    }
  }

  private emit(lists: ExerciseList[]): void {
    if (this.dialogRef) {
      this.dialogRef.close(lists);
    } else {
      this.select.emit(lists);
      this.pendingSelection.set([]);
    }
  }
}