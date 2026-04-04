import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { TeacherDesk } from '../teacher-desk/teacher-desk';
import { StudentRoster } from '../student-roster/student-roster';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-classroom',
  imports: [TeacherDesk, StudentRoster, MatProgressSpinnerModule],
  templateUrl: './classroom.html',
  styleUrl: './classroom.scss',
})
export class Classroom implements OnInit, OnDestroy {
  store = inject(ClassroomStore);
  private exerciseService = inject(ExerciseService);
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isOwner = signal(false);
  isLoading = signal(true);

  async ngOnInit() {
    this.exerciseService.loadExerciseLists();
    const classroomId = this.route.snapshot.paramMap.get('classroomId')!;
    const classroom = await this.supabase.getClassroomById(classroomId);
    const user = this.auth.currentUser();
    if (!classroom) {
      this.router.navigate(['/']);
      return;
    }

    if (user?.id === classroom.teacherId) {
      this.isOwner.set(true);
      this.store.joinAsTeacher(classroomId);
    } else if (user) {
      this.isOwner.set(false);
      this.store.joinAsSpectator(classroomId, user.email ?? user.id);
    }

    this.isLoading.set(false);
  }

  ngOnDestroy(): void {
    this.store.leave();
  }
}