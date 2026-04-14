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
    id: 'tired',
    label: 'Tired',
    squaresNeeded: 0,
    duration: 'persistent',
    sound: 'snoring',
  },
  {
    id: 'surprise',
    label: 'Surprise',
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
];
