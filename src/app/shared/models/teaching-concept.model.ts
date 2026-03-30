import { SoundEffect } from "../../core/services/sound.service";


export type TeachingConcept = {
  id: string;
  label: string;
  squaresNeeded: number;
  duration: number | 'persistent';
  sound?:SoundEffect;
};

export const TEACHING_CONCEPTS: TeachingConcept[] = [
  {
    id: 'jail',
    label: 'Jail',
    squaresNeeded: 1,
    duration: 'persistent',
    sound:'jailLocks'
  },
  {
  id: 'surprise',
  label: 'Surprise',
  squaresNeeded: 0,
  duration: 'persistent',
  sound: undefined,
}
];