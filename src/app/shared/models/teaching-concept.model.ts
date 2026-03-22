import { SoundEffect } from "../../core/services/sound.service";

export type ConceptCategory = 'movement' | 'tactics' | 'rules' | 'endgame';

export type TeachingConcept = {
  id: string;
  label: string;
  category: ConceptCategory;
  squaresNeeded: number;
  duration: number | 'persistent';
  sound?:SoundEffect;
};

export const TEACHING_CONCEPTS: TeachingConcept[] = [
  {
    id: 'jail',
    label: 'Jail',
    category: 'rules',
    squaresNeeded: 1,
    duration: 'persistent',
    sound:'jailLocks'
  }
];