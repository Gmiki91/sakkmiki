import { Component, inject } from '@angular/core';
import { StudentTable } from '../student-table/student-table';
import { TeacherTable } from '../teacher-table/teacher-table';
import { Exercise } from '../../../shared/models/exercise.model';
import { ExerciseList as List } from '../../../shared/models/exercise-list.model';
import { ExerciseList } from '../../../shared/components/exercise-list/exercise-list';
import { ExerciseService } from '../../../core/services/exercise.service';
import { ClassroomService } from '../classroom.service';

@Component({
  selector: 'app-classroom',
  imports: [StudentTable, TeacherTable, ExerciseList],
  templateUrl: './classroom.html',
  styleUrl: './classroom.scss',
})
export class Classroom {
  exerciseService = inject(ExerciseService);
  classroomService = inject(ClassroomService);
  loadExerciseToDemo(ex: Exercise) {this.classroomService.loadedExercise.set(ex)}
  loadListToAll(list: List) {this.classroomService.loadedList.set(list.exercises)}
}
