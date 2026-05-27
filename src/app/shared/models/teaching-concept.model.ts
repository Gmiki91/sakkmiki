import { SoundEffect } from '../../core/services/sound.service';
export type TeachingConceptListItem = {
  id: string;
  squares: string[];
};
export type TeachingConcept = {
  id: string;
  label: string;
  squaresNeeded: number;
  duration: number | 'persistent';
  sound?: SoundEffect;
};

export const TEACHING_CONCEPTS: TeachingConcept[] = [
  {
    id: 'jail',
    label: 'Jail',
    squaresNeeded: 1,
    duration: 'persistent',
    sound: 'jailLocks',
  },
  {
    id: 'happy',
    label: 'Happy',
    squaresNeeded: 1,
    duration: 'persistent',
  },
  {
    id: 'sad',
    label: 'Sad',
    squaresNeeded: 1,
    duration: 'persistent',
  },
  {
    id: 'checkmate',
    label: 'Mate',
    squaresNeeded: 1,
    duration: 'persistent',
  },
  {
    id: 'alarmed',
    label: 'Alarmed',
    squaresNeeded: 1,
    duration: 'persistent',
    sound: 'gasp',
  },
  {
    id: 'phew',
    label: 'Phew',
    squaresNeeded: 1,
    duration: 'persistent',
    sound: 'phew',
  },
  {
    id: 'poison',
    label: 'Poison',
    squaresNeeded: 1,
    duration: 'persistent',
    sound: 'poison',
  },
  {
    id: 'target',
    label: 'Target',
    squaresNeeded: 1,
    duration: 'persistent',
    sound: 'gunshot',
  },
  {
    id: 'tired',
    label: 'Tired',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: 'snoring',
  },
  {
    id: 'pin',
    label: 'Pin',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: 'horse1',
  },
  {
    id: 'fork',
    label: 'Fork',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: 'horse2',
  },
  {
    id: 'skewer',
    label: 'Skewer',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: undefined,
  },
  {
    id: 'surprise',
    label: 'Surprise',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: 'gasp',
  },
  {
    id: 'rook-guard',
    label: 'Rook Guard',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: undefined,
  },
  {
    id: 'rook-attack',
    label: 'Rook attack',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: undefined,
  },
  {
    id: 'queen-threat',
    label: 'Queen threat',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: undefined,
  },

  {
    id: 'castling1',
    label: 'Castling protects',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: 'shield',
  },
  {
    id: 'castling-dancing',
    label: 'Castling dance',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: undefined,
  },
  {
    id: 'spanish',
    label: 'Spanish hint',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: undefined,
  },
];
