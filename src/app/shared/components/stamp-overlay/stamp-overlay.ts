import { Component, signal } from '@angular/core';
import { StampType } from '../../models/stamp.model';
import { StampSvg } from '../stamp-svg/stamp-svg';



@Component({
  selector: 'app-stamp-overlay',
  templateUrl: './stamp-overlay.html',
  styleUrl: './stamp-overlay.scss',
  imports:[StampSvg]
})
export class StampOverlay {
  visible = signal(false);
  currentStamp = signal<StampType>('star');

  private readonly stamps: StampType[] = ['star', 'trophy', 'crown', 'smiley','checkmark','bear','icecream'];

  stamp() {
    const random = this.stamps[Math.floor(Math.random() * this.stamps.length)];
    this.currentStamp.set(random);
    this.visible.set(true);
    setTimeout(() => this.visible.set(false), 2000);
  }
}