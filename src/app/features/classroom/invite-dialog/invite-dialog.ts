import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';

@Component({
  selector: 'app-invite-dialog',
  imports: [FormsModule, MatButtonModule, MatIconModule, MatInputModule, MatDialogModule,MatTooltip],
  templateUrl: './invite-dialog.html',
  styleUrl: './invite-dialog.scss',
})
export class InviteDialog {
  private dialogRef = inject(MatDialogRef<InviteDialog>);
  private data = inject<{ classroomId: string }>(MAT_DIALOG_DATA);

  studentName = signal('');
  copied = signal(false);

  link = computed(() => {
    const name = this.studentName().trim();
    if (!name) return '';
    return `${window.location.origin}/join/${this.data.classroomId}/${encodeURIComponent(name)}`;
  });

  copy(): void {
    if (!this.link()) return;
    navigator.clipboard.writeText(this.link()).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}