import { Injectable } from '@angular/core';

export type SoundEffect = 'move' | 'take' |'stamp'|'gasp'| 'fanfare' | 'cheering'|'bravo'|'homer';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private sounds: Record<SoundEffect, HTMLAudioElement> = {
    move: new Audio('/sounds/move.mp3'),
    take: new Audio('/sounds/take.mp3'),
    fanfare: new Audio('/sounds/fanfare.mp3'),
    stamp: new Audio('/sounds/stamp.mp3'),
    gasp: new Audio('/sounds/gasp.mp3'),
    cheering: new Audio('/sounds/cheering.mp3'),
    bravo: new Audio('/sounds/bravo.mp3'),
    homer: new Audio('/sounds/homer.mp3'),
  };

  play(sound: SoundEffect): void {
    const audio = this.sounds[sound];
    audio.currentTime = 0; // rewind in case it's still playing
    audio.play().catch(() => {}); // catch needed because browser may block autoplay
  }
  playRandomCheering():void{
    const cheering = [ 'fanfare' , 'cheering','bravo','homer'];
     const random = cheering[Math.floor(Math.random() * cheering.length)] as SoundEffect;
     this.sounds[random].play();
  }
}