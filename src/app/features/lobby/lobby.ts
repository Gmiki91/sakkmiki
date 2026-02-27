import { Component, OnInit, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ExerciseService } from '../../core/services/exercise.service';

@Component({
  selector: 'app-lobby',
  imports: [MatCardModule, MatIcon, RouterLink],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
})
export class Lobby implements OnInit {
  exerciseService = inject(ExerciseService);

  ngOnInit(): void {
    this.exerciseService.loadExerciseLists();
  }

}
