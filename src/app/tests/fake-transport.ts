import { Subject } from 'rxjs';
import { BroadcastEvent, RealtimeTransport } from '../core/services/realtime-transport.service';
import { Injectable } from '@angular/core';
import {  TestBed } from "@angular/core/testing";
import { ClassroomStore } from '../core/services/classroom-store.service';
import { SupabaseService } from '../core/services/supabase.service';


@Injectable()
export class FakeRealtimeTransport {
  events$ = new Subject<BroadcastEvent>();
  presenceSync$ = new Subject<any[]>();
  spectatorSync$ = new Subject<any[]>();
  sent: BroadcastEvent[] = [];

  send(event: BroadcastEvent) {
    this.sent.push(event);
    return Promise.resolve();
  }

  sentOfType<T extends BroadcastEvent['type']>(type: T) {
    return this.sent.filter(e => e.type === type);
  }

  lastSent() { return this.sent.at(-1); }
  clear() { this.sent = []; }

  joinAsTeacher() {}
  joinAsStudent(_id: string, _name: string, onJoined: () => void) { onJoined(); }
  joinAsSpectator() {}
  leave() { return Promise.resolve(); }
  ngOnDestroy() {}
}

export function wireTransports(a: FakeRealtimeTransport, b: FakeRealtimeTransport) {
  const sendA = a.send.bind(a);
  const sendB = b.send.bind(b);
  a.send = (e) => { sendA(e); b.events$.next(e); return Promise.resolve(); };
  b.send = (e) => { sendB(e); a.events$.next(e); return Promise.resolve(); };
}

export function makeStore(transport: FakeRealtimeTransport) {
  TestBed.configureTestingModule({
    providers: [
      ClassroomStore,
      { provide: RealtimeTransport, useValue: transport },
      { provide: SupabaseService, useValue: { touchClassroom: () => Promise.resolve(), createLobbyChannel: () => ({ subscribe: () => {}, track: () => Promise.resolve() }) } },
    ]
  });
  return TestBed.inject(ClassroomStore);
}
export function fakeSupabase() {
  return {
    touchClassroom: () => Promise.resolve(),
    createLobbyChannel: () => ({ subscribe: () => {}, track: () => Promise.resolve() }),
    realtimeClient: { removeChannel: () => Promise.resolve() }
  };
}