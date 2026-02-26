import { Component } from '@angular/core';
import { StudentTable } from "../student-table/student-table";

@Component({
  selector: 'app-teacher-table',
  imports: [StudentTable],
  templateUrl: './teacher-table.html',
  styleUrl: './teacher-table.scss',
})
export class TeacherTable {

}
