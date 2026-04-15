import {
  Component,
  ViewChild,
  inject,
  computed,
  linkedSignal,
  WritableSignal,
  effect,
  AfterViewInit,
  signal,
  OnDestroy,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import {
  getKingSquare,
  getPlayerOrientation,
  getValidMoves,
  loadChess,
  STARTING_FEN,
} from '../../../shared/utils/chess.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Config } from '@lichess-org/chessground/config';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { ChallengePair } from '../../../shared/models/challenge-pair.model';
import { PieceOverlay } from '../../../shared/components/piece-overlay/piece-overlay';
import { SoundService } from '../../../core/services/sound.service';
import { StampOverlay } from '../../../shared/components/stamp-overlay/stamp-overlay';
import { Exercise } from '../../../shared/models/exercise.model';
import { StampSvg } from '../../../shared/components/stamp-svg/stamp-svg';
import { StampType } from '../../../shared/models/stamp.model';
import { DrawingService } from '../../../core/services/drawing.service';
import { DrawingCanvas } from '../../../shared/components/drawing-canvas/drawing-canvas';
import { StampIcon, DrawingTool, Point } from '../../../shared/models/drawing.model';
import { DEFAULT_BRUSH_COLOR } from '../../../shared/utils/brushes';
import { TeachingOverlay } from '../../../shared/components/teaching-overlay/teaching-overlay';
import { TEACHING_CONCEPTS } from '../../../shared/models/teaching-concept.model';
import { DrawingToolbar } from '../../../shared/components/drawing-toolbar/drawing-toolbar';

type SimulPeerBoard = {
  name: string;
  config: Config;
}
@Component({
  selector: 'app-student-view',
  templateUrl: './student-view.html',
  styleUrls: ['./student-view.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    ChessBoard,
    DrawingToolbar,
    PieceOverlay,
    StampOverlay,
    StampSvg,
    DrawingCanvas,
    TeachingOverlay 
  ],
})
export class StudentView implements AfterViewInit, OnDestroy {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  @ViewChild('pieceOverlay') pieceOverlay!: PieceOverlay;
  @ViewChild('stampOverlay') stampOverlay!: StampOverlay;
  classroomStore = inject(ClassroomStore);
  soundService = inject(SoundService);
  drawingService = inject(DrawingService);

  stampCollection = signal<StampType[]>([]);
  mushroomCollection = signal<Record<string, number>>({'🍄': 0,'🍫': 0,'🍬': 0,'🍦': 0,'🍔': 0,'🥤': 0,'🍩': 0,'🎃': 0,'♥️': 0,'🎁': 0,'🎈': 0,'⭐': 0});
  mushroomCollectionValues = computed(()=>Object.values(this.mushroomCollection()).some(c => c > 0))
  mushroomCollectionKeys =  computed(()=>Object.keys(this.mushroomCollection()));
  loadedList = computed(() =>
    this.classroomStore.assignedExercises().length
      ? this.classroomStore.assignedExercises()
      : this.classroomStore.loadedExercises()
  );

  exIndex = linkedSignal({
    source: () => this.loadedList(),
    computation: () => 0, // reset to 0 when a new list is loaded.
  });

  // droppedExercise takes precedence
  currentExercise = computed(
    () => this.classroomStore.droppedExercise() ?? this.loadedList()[this.exIndex()] ?? null,
  );

  mushroomType = computed(() => {
    if (this.classroomStore.mode() === 'gathered') {
      return this.classroomStore.mushroomType() || '🍄';
    }
    return this.currentExercise()?.mushroomType || '🍄';
  });

  isMushroomMode = computed(() => {
    if (this.myPair() || this.classroomStore.mode() === 'simul') return false;
    if (this.classroomStore.mode() === 'gathered') return !!this.classroomStore.mushroomType();
    return this.currentExercise()?.exerciseType === 'mushroom';
  });

  moveHistory: WritableSignal<string[]> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => [],
  });

  status: WritableSignal<string> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => (this.exerciseChess.turn() === 'w' ? 'White to move' : 'Black to move'),
  });

  feedback: WritableSignal<string> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => '',
  });

   isLocked: WritableSignal<boolean> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => false,
  });

  private isWaitingForStamp: WritableSignal<boolean> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => false,
  });

  exerciseFen = signal<string>(STARTING_FEN);
  challengeFen = signal<string>(STARTING_FEN);
  exerciseLastMove = signal<[Key, Key] | undefined>(undefined);
  challengeLastMove = signal<[Key, Key] | undefined>(undefined);

  //drawing
  selectedColor = signal(DEFAULT_BRUSH_COLOR);
  activeTool = signal<DrawingTool>('pen');
  activeStampIcon = signal<StampIcon>('star');
  
  // Simul state
  private simulChess = new Chess();
  simulFen = signal<string>(STARTING_FEN);
  simulLastMove = signal<[Key, Key] | undefined>(undefined);
 
  //Live miniboards for classmates during simul
  simulPeerBoards = signal<SimulPeerBoard[]>([]);

  // track teachingoverlay concepts length to detect additions
  teachingConceptSize = 0;

  // Gather/disperse: snapshot of exercise state 
  private isGathered = false;
  private frozenFen: string | null = null;
  private frozenMoveHistory: string[] | null = null;

  //  Challenge props
  myPair = computed(
    () =>
      this.classroomStore
        .challengePairs()
        .find(
          (p) =>
            p.white === this.classroomStore.studentName() ||
            p.black === this.classroomStore.studentName(),
        ) ?? null,
  );

  myColor = computed(() =>
    this.myPair()?.white === this.classroomStore.studentName() ? 'white' : 'black',
  );

  boardOrientation = computed<'white' | 'black'>(() => {
    if (this.classroomStore.mode() === 'gathered') return 'white';
    if (this.classroomStore.mode()==='simul') return 'black';
    if (this.myPair()) return this.myColor();
    const ex = this.currentExercise();
    if (!ex) return 'white';
    return getPlayerOrientation(ex);
  });

  pendingPromotion = signal<{ orig: Key; dest: Key; pair: ChallengePair } | null>(null);
  private challengeChess = new Chess();
  private exerciseChess = new Chess();
  
  // Board config 

  private gatheredConfig = computed<Config>(() => ({
    fen: this.classroomStore.teacherFen(),
    orientation: 'white',
    movable: { free: false, color: undefined },
    draggable: { enabled: false },
    highlight: { lastMove: true, check: false },
    drawable: {
      enabled: true,
      visible: true,
    },
  }));
  private challengeConfig = computed<Config>(() => ({
      fen: this.challengeFen(),
      orientation: this.myColor(),
      turnColor: this.challengeChess.turn() === 'w' ? 'white' : 'black',
      movable: {
        free: false,
        color: this.myColor(),
        dests: getValidMoves(this.challengeChess),
        events: { after: (orig, dest) => this.handleChallengeMove(orig, dest) },
        showDests:true
      },
      check: this.challengeChess.isCheck(),
      draggable: { enabled: true, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.challengeLastMove(),
      drawable: { enabled: true, visible: true},
    }));

     private exerciseConfig = computed<Config>(() => ({
    fen: this.exerciseFen(),
    orientation: getPlayerOrientation(this.currentExercise()),
    turnColor: this.exerciseChess.turn() === 'w' ? 'white' : 'black',
    movable: {
      free: false,
      color: this.isLocked() ? undefined : (this.exerciseChess.turn() === 'w' ? 'white' : 'black'),
      dests: getValidMoves(this.exerciseChess),
      showDests:this.currentExercise().exerciseType==='puzzle', // dont show for mushroom game (challenge is another config)
      events: { after: (orig, dest) => this.handleMove(orig, dest) },
    },
    check: this.exerciseChess.isCheck(),
    draggable: { enabled: true, showGhost: true },
    highlight: { lastMove: true, check: true },
    lastMove: this.exerciseLastMove(),
    drawable: { enabled: true, visible: true },
  }));

  private simulConfig = computed<Config>(() => {
    const isBlackTurn = this.simulChess.turn() === 'b';
    return {
      fen: this.simulFen(),
      orientation: 'black',
      turnColor: this.simulChess.turn() === 'w' ? 'white' : 'black',
      movable: {
        free: false,
        color: isBlackTurn ? 'black' : undefined,
        dests: isBlackTurn ? getValidMoves(this.simulChess) : new Map(),
        events: { after: (orig: Key, dest: Key) => this.handleSimulMove(orig, dest) },
        showDests: true,
      },
      check: this.simulChess.isCheck(),
      draggable: { enabled: isBlackTurn, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.simulLastMove(),
      drawable: { enabled: true, visible: true },
    };
  });

  boardConfig = computed<Config | null>(() => {
    if (this.classroomStore.mode() === 'gathered') return this.gatheredConfig();
    if (this.myPair()) return this.challengeConfig();
    if (this.classroomStore.mode()==='simul') return this.simulConfig();
    return this.currentExercise() ? this.exerciseConfig() : null;
  });

   readonly emoji = signal(this.pickEmoji());


  constructor() {
    this.setupStateEffects();
    this.setupEventHandlers();

  }
  ngOnDestroy(): void {
    this.classroomStore.leave();
  }

  ngAfterViewInit(): void {
    const el = this.chessBoard.boardElement.nativeElement as HTMLElement;
    // left mouse click would remove all arrows, not allowed for students
    el.addEventListener(
      'pointerdown',
      (e: MouseEvent) => {
        if (e.button === 0 && this.classroomStore.mode() === 'gathered') {
          e.preventDefault();
        }
      },
      true,
    );

    // arrows
    el.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return; // middle mouse do what?
      setTimeout(() => {
        const shapes = this.chessBoard.api?.state.drawable.shapes ?? [];
        if (this.classroomStore.mode() === 'gathered') {
          if (e.button !== 0) this.classroomStore.sendSharedArrows(shapes);
        } else {
          this.classroomStore.sendMiniboardArrows(shapes);
        }
      }, 0);
    });
  }
  // --- Move handling ---
  handleChallengeMove(orig: Key, dest: Key) {
    const pair = this.myPair();
    if (!pair) return;
    if (this.isPawnPromotion(orig, dest)) {
      if (this.backrankpawnWins(dest)) {
        this.classroomStore.sendChallengeMove(pair.white,pair.black,this.challengeChess.fen(),orig,dest,true);
        this.youWin();
      } else {
        this.pendingPromotion.set({ orig, dest, pair });
      }
    } else {
      this.executeMove(orig, dest, pair);
    }
  }

   handleSimulMove(orig: Key, dest: Key): void {
    if (this.simulChess.turn() !== 'b') return;
    try {
      const move = this.simulChess.move({ from: orig, to: dest });
      if (!move) return;
      this.simulFen.set(this.simulChess.fen());
      this.simulLastMove.set([orig, dest]);
      this.playSound(move);
      this.classroomStore.sendSimulStudentMove(this.simulChess.fen(), orig, dest);
    } catch {
      this.simulFen.set(this.simulChess.fen());
    }
  }

  isPawnPromotion(orig: Key, dest: Key) {
    const piece = this.challengeChess.get(orig as any);
    return (
      piece?.type === 'p' &&
      ((piece.color === 'w' && dest[1] === '8') || (piece.color === 'b' && dest[1] === '1'))
    );
  }
  completePromotion(role: 'q' | 'r' | 'n' | 'b') {
    const p = this.pendingPromotion();
    if (!p) return;
    this.pendingPromotion.set(null);
    this.executeMove(p.orig, p.dest, p.pair, role);
  }
  handleMove(orig: Key, dest: Key) {
    try {
      const move = this.exerciseChess.move({ from: orig, to: dest });
      if (move) {
        this.exerciseFen.set(this.exerciseChess.fen());
        this.pieceOverlay.hide();
        this.analyze(move);
      }
    } catch (e) {
      this.chessBoard.api?.set({ fen: this.exerciseChess.fen() });
    }
  }

  executeMove(orig: Key, dest: Key, pair: ChallengePair, promotion?: 'q' | 'r' | 'n' | 'b') {
    try {
      const move = this.challengeChess.move({ from: orig, to: dest, promotion });
      if (move) {
        this.challengeFen.set(this.challengeChess.fen());
        this.challengeLastMove.set([orig, dest]);
        this.playSound(move);
        const win = this.checkWinConditions(move);
        this.classroomStore.sendChallengeMove(pair.white,pair.black,this.challengeChess.fen(),orig,dest,win);
        if (win) this.youWin();
        if (promotion) this.chessBoard.api?.set({ fen: this.challengeChess.fen() });
      }
    } catch (e) {
      this.chessBoard.api?.set({ fen: this.challengeChess.fen() });
    }
  }

  // --- Exercise analysis ---
  analyze(move: Move) {
    const ex = this.currentExercise();
    if (!ex) return;
    const newHistory = [...this.moveHistory(), move.san];
    const solution = ex.solutions?.find((line) => newHistory.every((m, i) => line[i] === m));
    if (solution) {
      this.isLocked.set(false);
      if(ex.exerciseType==='mushroom'){
        this.soundService.play('success');
        const type = ex.mushroomType as string;
        this.mushroomCollection.update(current => ({
          ...current,[type]: (current[type] ?? 0) + 1
        }));
      }else{
        this.playSound(move);
      }
      this.updateStatus();
      
      this.moveHistory.set(newHistory);
      const isSolved = solution.length === newHistory.length;
      if (isSolved) {
        if (this.classroomStore.autoProgress()) this.progressAuto();
        else {
          this.isWaitingForStamp.set(true);
          this.isLocked.set(true);
        }
      } else {
        this.feedback.set('Jó lépés! 🥳');
        //gombaszedés, same color always
        if (ex.exerciseType === 'mushroom') {
          this.exerciseChess.setTurn('w');
          this.exerciseFen.set(this.exerciseChess.fen());
          // this.updateBoard();
        } else {
          const nextIndex = newHistory.length;
          // computer thinking
          setTimeout(() => {
            const computerMove = this.exerciseChess.move(solution[nextIndex]);
            this.playSound(computerMove);
            this.exerciseFen.set(this.exerciseChess.fen());
            // this.updateBoard([computerMove.from as Key, computerMove.to as Key]);
            this.exerciseLastMove.set([computerMove.from as Key, computerMove.to as Key]);
            this.moveHistory.set([...newHistory, solution[nextIndex]]);
            this.pieceOverlay.hide();
          }, 250);
        }
      }
    } else {
      this.soundService.play('error');
      if(this.classroomStore.autoRedo()){
        const mistake = ex.commonMistakes?.find((m) => m.move === move.san);
        if (mistake) {
          this.feedback.set(mistake.hint);
        } else {
          this.feedback.set(ex.defaultHint ?? 'Rossz lépés :(');
        }
        setTimeout(()=>{
          this.handleMistake(ex);
          this.feedback.set('');
        },10000);
      }
      else
      this.isLocked.set(true);
    }
  }

  updateStatus() {
    if (this.exerciseChess.isCheckmate()) {
      this.status.set(
        'Checkmate! ' + (this.exerciseChess.turn() === 'w' ? 'Black' : 'White') + ' wins!',
      );
      this.pieceOverlay.show('checkmate', getKingSquare(this.exerciseChess)!);
    } else if (this.exerciseChess.isDraw()) {
      this.status.set('Draw!');
    } else if (this.exerciseChess.isCheck()) {
      // this.soundService.play('gasp');
      this.status.set(
        'Check! ' + (this.exerciseChess.turn() === 'w' ? 'White' : 'Black') + ' to move',
      );
      this.pieceOverlay.show('alarmed', getKingSquare(this.exerciseChess)!);
    } else {
      this.status.set((this.exerciseChess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    }
  }

  nextExercise() {
    this.pieceOverlay.hide();
    this.exerciseLastMove.set(undefined);
    const size = this.loadedList().length - 1;
    if (this.exIndex() < size) {
      this.exIndex.update((n) => n + 1);
    } else {
      this.status.set('All done!');
      this.isWaitingForStamp.set(true);
    }
  }

  // --- Drawing ---
  onPointAdded(event: { strokeId: string; point: Point }): void {
    this.drawingService.addLocalPoint(event.strokeId, event.point, this.selectedColor());
  }

  onStrokeCommitted(strokeId: string): void {
    this.drawingService.commitLocalStroke(strokeId);
  }

  onColorSelected(color: string): void {
    this.selectedColor.set(color);
    this.drawingService.broadcastColor(color);
  }

  onBoardClick(event: MouseEvent): void {
    if (this.classroomStore.mode() !== 'gathered') return;
    if (this.activeTool() !== 'stamp') return;
    const wrapper = (event.currentTarget as HTMLElement);
    const rect = wrapper.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.drawingService.addLocalAnnotation(
      this.activeStampIcon(),
      x,
      y,
      this.selectedColor(),
    );
  }

  // --- Effect groups ---

  private setupStateEffects(): void {
    // Reset chess position when exercise changes
    effect(() => {
      const exercise = this.currentExercise();
      if (!exercise) return;
      this.pieceOverlay.hide();
      this.exerciseLastMove.set(undefined);
      if (exercise.exerciseType === 'challenge') {
        loadChess(this.challengeChess, exercise.fen);
        this.challengeFen.set(this.challengeChess.fen());
      } else {
        loadChess(this.exerciseChess, exercise.fen);
        this.exerciseFen.set(this.exerciseChess.fen());
        if(exercise.lastMove){
            const { from, to } = exercise.lastMove!;
            this.exerciseChess.move({ from, to });
            this.exerciseFen.set(this.exerciseChess.fen())
            this.exerciseLastMove.set([from as Key, to as Key]);
            setTimeout(() => {
              // purely visual
              this.chessBoard.api?.set({ fen: exercise.fen });
              this.chessBoard.api?.move(from, to);
            }, 250);
        }
      }
      this.updateStatus();
      this.chessBoard?.api?.set({ lastMove: [] });
    });

        // Simul: start/stop
    effect(() => {
      this.boardOrientation
      if (this.classroomStore.mode()==='simul') {
        this.simulChess.reset();
        this.simulFen.set(this.simulChess.fen());
        this.simulLastMove.set(undefined);
        this.simulPeerBoards.set([]);
      }
    });
 
    // Simul: receive teacher's move
    effect(() => {
      const move = this.classroomStore.incomingSimulTeacherMove();
      if (!move) return;
      this.classroomStore.incomingSimulTeacherMove.set(null);
      const myName = this.classroomStore.studentName();
      if (move.studentName !== myName){
        this.updatePeerBoard(move.studentName,move.fen,move.from,move.to);
        return;
      }
      
      
      try {
        loadChess(this.simulChess, move.fen);
        this.simulFen.set(this.simulChess.fen());
        this.simulLastMove.set([move.from as Key, move.to as Key]);
        this.soundService.play('move');
      } catch { /* ignore */ }
  });
 
    // Simul: receive a peer student's move to update sidebar
    effect(() => {
      const move = this.classroomStore.incomingSimulStudentMove();
      if (!move) return;
      this.classroomStore.incomingSimulStudentMove.set(null);
      const myName = this.classroomStore.studentName();
      if (move.studentName === myName) return; // that's my own board
      this.updatePeerBoard(move.studentName, move.fen, move.from, move.to);
    });

    // Presence sync — fires whenever any relevant state changes
    effect(() => {
      const exercise = this.currentExercise();
      if (!exercise) return;
       // Only these three drive the presence update
      const exIndex = this.exIndex();
      const locked = this.isLocked();
      const awaitingStamp = this.isWaitingForStamp();
      // Everything else is just snapshotted at the time of the meaningful event
      const fen = untracked(() =>exercise.exerciseType === 'challenge' ? this.challengeFen() : this.exerciseFen());
      const status = untracked(() => this.status());
      const feedback = untracked(() => this.feedback());
      this.classroomStore.updatePresence({ fen, status, feedback, exIndex, locked, awaitingStamp });

    });

    // Student fen broadcast
    effect(() => {
     const fen = this.exerciseFen();
     if (this.classroomStore.mode() === 'gathered') return;
     if (this.myPair()) return; // challenge has its own flow
     this.classroomStore.broadcastStudentFen(
       this.classroomStore.studentName(),
       fen
     );
    });

    // Gather/disperse
    effect(() => {
      const mode = this.classroomStore.mode();
      if (mode === 'gathered') this.onGather();
      else this.onDisperse();
    });

    // Reset challenge board when a pair is assigned/rematch is set
    effect(() => {
      const pair = this.myPair();
      if (!pair) return;
      this.pieceOverlay.hide();
      const ex = this.currentExercise();
      if (ex?.fen) {
        loadChess(this.challengeChess, ex.fen);
      } else {
        this.challengeChess = new Chess();
      }
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set(undefined);
      this.chessBoard?.api?.set({ lastMove: [] });
    });

    // arrows
    effect(() => {
      const arrows = this.classroomStore.sharedArrows()?.arrows;
      const name = this.classroomStore.sharedArrows()?.name;
      if(name===this.classroomStore.studentName() )
      this.chessBoard?.api?.set({ drawable: { shapes: arrows ??[] }  });
    });
  }

  private setupEventHandlers(): void {
    // Teacher resume: undo last move, let student retry
    effect(() => {
      const resume = this.classroomStore.resume();
      if (!resume) return;
      this.classroomStore.resume.set(null);
      this.handleMistake(this.currentExercise());
    });

    // Teacher stamp: award stamp and advance
    effect(() => {
      const stamp = this.classroomStore.stamp();
      if (!stamp) return;
      this.classroomStore.stamp.set(null);
      this.progressWithStamp();
    });

    // Teacher locks board
    effect(() => {
      const lock = this.classroomStore.lock();
      if (!lock) return;
      this.classroomStore.lock.set(null);
      this.isLocked.set(true);
    });

      // Teacher unlocks board
    effect(() => {
      const unlock = this.classroomStore.unlock();
      if (!unlock) return;
      this.classroomStore.unlock.set(null);
      this.isLocked.set(false);
    });


    // Incoming challenge move from opponent
    effect(() => {
      const move = this.classroomStore.challengeMove();
      if (!move) return;
      const pair = this.myPair();
      if (!pair || move.white !== pair.white || move.black !== pair.black) return;
      if (move.over) {
        this.challengeChess.move({ ...move, promotion: 'q' });
        this.soundService.play('lost');
      } else {
        loadChess(this.challengeChess, move.fen);
      }
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set([move.from as Key, move.to as Key]);
    });

    // Sound effect from incoming teaching overlay
    effect(()=>{
    const concepts = this.classroomStore.incomingTeachingOverlay();
     if (!concepts?.length){
      this.teachingConceptSize = 0;
      return; 
    } 
    if(concepts.length>this.teachingConceptSize){ //only play sound if something was added, not when something was removed
        const latest = concepts.at(-1)!;
        const concept = TEACHING_CONCEPTS.find(c => c.id === latest.id);
        if (concept?.sound) this.soundService.play(concept.sound);
      }
      this.teachingConceptSize = concepts.length
    })
  }


  private onGather() {
    this.pieceOverlay.hide();
    this.isGathered = true;
    this.frozenFen = this.exerciseChess.fen();
    this.isLocked.set(false)
    this.frozenMoveHistory = [...this.moveHistory()];
    this.chessBoard?.api?.set({ lastMove: [], drawable: { shapes: [] } });
  }

  private onDisperse() {
    // Restore frozen state if we were gathered
    if (!this.isGathered) return;
    this.isGathered = false;
    this.drawingService.clearLocal();
    loadChess(this.exerciseChess, this.frozenFen!);
    this.moveHistory.set(this.frozenMoveHistory ?? []);
    this.frozenFen = null;
    this.frozenMoveHistory = null;
    setTimeout(() => {
      this.chessBoard?.api?.set({
        fen: this.exerciseChess.fen(),
        lastMove: [],
        drawable: { enabled: true, shapes: [] },
      });
    }, 0);
  }
    private updatePeerBoard(name: string, fen: string, from: string, to: string): void {
    const chess = new Chess();
    try { loadChess(chess, fen); } catch { return; }
    const config: Config = {
      fen,
      orientation: 'black',
      coordinates: false,
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      lastMove: [from as Key, to as Key],
      highlight: { lastMove: true, check: chess.isCheck() },
    };
    this.simulPeerBoards.update(boards => {
      const existing = boards.find(b => b.name === name);
      const entry: SimulPeerBoard = { name, config};
      if (existing) return boards.map(b => b.name === name ? entry : b);
      return [...boards, entry];
    });
  }


  // --- Private helpers ---
  private checkWinConditions(move: Move): boolean {
    // pair: ChallengePair, orig: Key, dest: Key,
    const ex = this.currentExercise();
    const normalizedSan = move.san
      .replace('x', '')
      .replace('+', '')
      .replace('#', '')
      .replace(/=[QRBN]/, '');
    const conditions = this.myColor() === 'white' ? ex?.whiteWinConditions : ex?.blackWinConditions;
    const captureAllWin =
      conditions?.includes('capture_all') &&
      this.challengeChess
        .board()
        .flat()
        .filter(Boolean)
        .every((p) => p!.color === (this.myColor() === 'white' ? 'w' : 'b'));
    const reachSquareWin = conditions?.includes(normalizedSan);
    return !!(captureAllWin || reachSquareWin);
   
  }
  private backrankpawnWins(dest: Key) {
    const ex = this.currentExercise();
    const conditions = this.myColor() === 'white' ? ex?.whiteWinConditions : ex?.blackWinConditions;
    return conditions?.includes(dest);
  }

  private youWin() {
    this.soundService.playRandomCheering();
  }
  private playSound(move: Move) {
    if (move.captured) this.soundService.play('take');
    else this.soundService.play('move');
  }

  private handleMistake(ex: Exercise) {
    this.exerciseChess.undo();
    if (ex.exerciseType === 'mushroom') {
      this.exerciseChess.setTurn('w');
    }
    this.exerciseFen.set(this.exerciseChess.fen());
    this.exerciseLastMove.set(undefined);
    this.isLocked.set(false);
  }

  private progressWithStamp() {
    this.feedback.set('Jó lépés! 🥳');
    this.soundService.play('stamp');
    this.soundService.playRandomCheering();
    this.stampOverlay.stamp();
    const stamp = this.stampOverlay.currentStamp();
    this.isWaitingForStamp.set(false);
    this.isLocked.set(false);
    setTimeout(() => {
      //leave droppedExercise set so currentExercise doesn't recompute and defaults to the loadedListExercise
      this.stampCollection.update((arr) => [...arr, stamp as StampType]);
      if (!this.classroomStore.droppedExercise()) this.nextExercise();
    }, 3000);
  }

  private progressAuto(){
    this.feedback.set('Jó lépés! 🥳');
    // this.soundService.play('won');
    setTimeout(() => {
      //leave droppedExercise set so currentExercise doesn't recompute and defaults to the loadedListExercise
      if (!this.classroomStore.droppedExercise()) this.nextExercise();
    }, 2000);
  }

  private pickEmoji(): string {
    const list = ['🐣','🐵','🐶','🐱','🦁','🐯','🐮','🐷','🐭','🐰','🐹','🐻','🐻‍❄️','🐼','🐣','🦉'];
    return list[Math.floor(Math.random() * list.length)];
  }
}
