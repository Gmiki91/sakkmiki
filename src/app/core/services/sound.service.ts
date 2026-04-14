import { Injectable } from '@angular/core';

export type SoundEffect = 'move' | 'take' |'stamp'|'gasp'|'bite'| 'fanfare' | 'cheering'|'bravo'|'shield'|
'homer'|'bite1'|'bite2'|'bite3'|'bite4'|'bite5'|'bite6'|'lost'|'won'|'wrongMove'|'success'|'error'|'jailLocks'|'snoring';

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
    bite: new Audio('/sounds/bite.mp3'),
    bite1: new Audio('/sounds/bite1.mp3'),
    bite2: new Audio('/sounds/bite2.mp3'),
    bite3: new Audio('/sounds/bite3.mp3'),
    bite4: new Audio('/sounds/bite4.mp3'),
    bite5: new Audio('/sounds/bite5.mp3'),
    bite6: new Audio('/sounds/bite6.mp3'),
    lost: new Audio('/sounds/lost.mp3'),
    won: new Audio('/sounds/won.mp3'),
    wrongMove: new Audio('/sounds/wrong-move.mp3'),
    success: new Audio('/sounds/success.mp3'),
    error: new Audio('/sounds/error.mp3'),
    jailLocks:new Audio('/sounds/jail-locks.mp3'),
    snoring:new Audio('/sounds/snoring.mp3'),
    shield:new Audio('/sounds/shield.mp3')
  };

  play(sound: SoundEffect): void {
    const audio = this.sounds[sound];
    audio.currentTime = 0; // rewind in case it's still playing
    audio.play().catch(() => {}); // catch needed because browser may block autoplay
  }
  playRandomCheering():void{
    const cheering = [ 'fanfare' , 'cheering','bravo','homer'];
    this.playRandom(cheering);
  }
    playRandomBite(){
      const bites =['bite1','bite2','bite3','bite4','bite5','bite6'];
     this.playRandom(bites);

  }
  playRandom(arr:string[]){
    const random =arr[Math.floor(Math.random() * arr.length)] as SoundEffect;
      this.sounds[random].play();
  }
}