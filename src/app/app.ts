import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ChessComponent } from "./chess/chess";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ChessComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('sakkmiki');
}
