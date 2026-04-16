import { Component, model, effect, inject, input } from '@angular/core';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-white-board',
  imports: [FormsModule],
  templateUrl: './white-board.html',
  styleUrl: './white-board.scss',
})
export class WhiteBoard {
  disabled = input(false);
  store = inject(ClassroomStore);
  text = model(this.store.whiteBoardText());

  constructor() {
    // teacher effect of sending text
    effect(() => {
      if (this.disabled()) return;
      const updatedText = this.text();
      this.store.sendUpdatedText(updatedText);
    });
    // student effect of receiving text
    effect(() => {
      if (this.disabled()) {
        const updatedText = this.store.whiteBoardText();
        this.text.set(updatedText);
      }
    });
  }
}
