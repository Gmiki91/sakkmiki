import { Component, inject } from '@angular/core';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { TeacherDesk } from '../teacher-desk/teacher-desk';
import { StudentRoster } from '../student-roster/student-roster';

@Component({
  selector: 'app-classroom',
  imports: [TeacherDesk, StudentRoster],
  templateUrl: './classroom.html',
  styleUrl: './classroom.scss',
})
export class Classroom {
  store = inject(ClassroomStore);

  constructor() {
    this.store.joinAsTeacher();
  }
}
