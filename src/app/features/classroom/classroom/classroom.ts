import { Component } from '@angular/core';
import { StudentTable } from '../student-table/student-table';
import { TeacherTable } from '../teacher-table/teacher-table';

@Component({
  selector: 'app-classroom',
  imports: [StudentTable,TeacherTable],
  templateUrl: './classroom.html',
  styleUrl: './classroom.scss',
})
export class Classroom {

}
