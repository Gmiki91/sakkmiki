import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';

@Component({
  selector: 'app-student-timer',
  template: `{{ seconds() }}`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudentTimer {
  name = input.required<string>();
  seconds = signal(0);
  private interval?: ReturnType<typeof setInterval>;

  start() {
    this.interval = setInterval(() => this.seconds.update((n) => n + 1), 1000);
  }

  stop() {
    clearInterval(this.interval);
  }

  reset() {
    this.stop();
    this.seconds.set(0);
    this.start();
  }

  ngOnDestroy() {
    this.stop();
  }
}
