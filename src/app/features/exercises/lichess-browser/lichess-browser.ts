import {
  Component, inject, signal, computed, OnInit, ViewChild
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Chess } from 'chess.js';
import { Config } from '@lichess-org/chessground/config';
import { Key } from '@lichess-org/chessground/types';
import { ExerciseService } from '../../../core/services/exercise.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LichessPuzzle } from '../../../shared/models/exercise.model';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { THEME_LABELS, themeLabel } from '../../../shared/utils/theme-labels';
import { loadChess } from '../../../shared/utils/chess.utils';

const PAGE_SIZE = 20;

// Rating range presets
const PRESETS = [
  { label: 'Beginner',     min: 0,    max: 1000 },
  { label: 'Intermediate', min: 1000, max: 1800 },
  { label: 'Advanced',     min: 1800, max: 9999 },
];

@Component({
  selector: 'app-lichess-browser',
  imports: [
    FormsModule, MatButtonModule, MatInputModule, MatChipsModule,
    MatProgressSpinnerModule, MatIconModule, MatTooltipModule, ChessBoard,
  ],
  templateUrl: './lichess-browser.html',
  styleUrl: './lichess-browser.scss',
})
export class LichessBrowser implements OnInit {
  @ViewChild('previewBoard') previewBoard!: ChessBoard;

  private supabase = inject(SupabaseService);
  private exerciseService = inject(ExerciseService);
  private route = inject(ActivatedRoute);

  // --- Filter state ---
  selectedThemes = signal<string[]>([]);
  minRating = signal<number>(0);
  maxRating = signal<number>(9999);
  readonly presets = PRESETS;
  readonly allThemes = Object.keys(THEME_LABELS);
  readonly themeLabel = themeLabel;

  // --- Results ---
  results = signal<LichessPuzzle[]>([]);
  totalCount = signal(0);
  page = signal(0);
  isLoading = signal(false);
  totalPages = computed(() => Math.ceil(this.totalCount() / PAGE_SIZE));

  // --- Preview ---
  selected = signal<LichessPuzzle | null>(null);
  private previewChess = new Chess();
  solutionStep = signal(0);
  boardConfig = signal<Config | undefined>(undefined);
  isAdding = signal(false);
  isAdded = signal(false);

  solutionMoves = computed(() => this.selected()?.solutions?.[0] ?? []);
  canStepBack  = computed(() => this.solutionStep() > 0);
  canStepNext  = computed(() => this.solutionStep() < this.solutionMoves().length);

  private listId = '';

  ngOnInit(): void {
    this.listId = this.route.snapshot.paramMap.get('listId') ?? '';
    this.search();
  }

  async search(resetPage = true): Promise<void> {
    if (resetPage) this.page.set(0);
    this.isLoading.set(true);
    try {
      const { puzzles, count } = await this.supabase.searchLichessPuzzles({
        themes: this.selectedThemes().length ? this.selectedThemes() : undefined,
        minRating: this.minRating() || undefined,
        maxRating: this.maxRating() < 9999 ? this.maxRating() : undefined,
        limit: PAGE_SIZE,
        offset: this.page() * PAGE_SIZE,
      });
      this.results.set(puzzles);
      this.totalCount.set(count);
    } finally {
      this.isLoading.set(false);
    }
  }

  applyPreset(preset: typeof PRESETS[0]): void {
    this.minRating.set(preset.min);
    this.maxRating.set(preset.max === 9999 ? 9999 : preset.max);
    this.search();
  }

  toggleTheme(theme: string): void {
    this.selectedThemes.update(t =>
      t.includes(theme) ? t.filter(x => x !== theme) : [...t, theme]
    );
  }

  nextPage(): void {
    this.page.update(p => p + 1);
    this.search(false);
  }

  prevPage(): void {
    this.page.update(p => p - 1);
    this.search(false);
  }

  selectPuzzle(puzzle: LichessPuzzle): void {
    this.selected.set(puzzle);
    this.isAdded.set(false);
    this.solutionStep.set(0);
    loadChess(this.previewChess, puzzle.fen);
    if (puzzle.lastMove) {
      // position is already after lastMove (our FEN is post-setup)
    }
    this.refreshBoard(false);
  }

  stepForward(): void {
    const moves = this.solutionMoves();
    const step = this.solutionStep();
    if (step >= moves.length) return;
    this.previewChess.move(moves[step]);
    this.solutionStep.set(step + 1);
    this.refreshBoard(true);
  }

  stepBack(): void {
    const step = this.solutionStep();
    if (step <= 0) return;
    this.previewChess.undo();
    this.solutionStep.set(step - 1);
    this.refreshBoard(true);
  }

  resetPreview(): void {
    const puzzle = this.selected();
    if (!puzzle) return;
    loadChess(this.previewChess, puzzle.fen);
    this.solutionStep.set(0);
    this.refreshBoard(false);
  }

  async addToList(): Promise<void> {
    const puzzle = this.selected();
    if (!puzzle || !this.listId) return;
    this.isAdding.set(true);
    await this.exerciseService.addLichessPuzzleToList(this.listId, puzzle);
    this.isAdding.set(false);
    this.isAdded.set(true);
  }

  private refreshBoard(highlightLast: boolean): void {
    const puzzle = this.selected()!;
    const lastMoveHistory = this.previewChess.history({ verbose: true });
    const lastMove = lastMoveHistory.length > 0
      ? [lastMoveHistory.at(-1)!.from as Key, lastMoveHistory.at(-1)!.to as Key]
      : puzzle.lastMove ? [puzzle.lastMove.from as Key, puzzle.lastMove.to as Key]
      : [];

    this.boardConfig.set({
      fen: this.previewChess.fen(),
      coordinates:false,
      orientation: puzzle.lastMove?.color === 'white' ? 'black' : 'white',
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      highlight: { lastMove: highlightLast, check: true },
      lastMove: lastMove as [Key, Key],
    });
  }
}
