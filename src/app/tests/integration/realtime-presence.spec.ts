import { describe, it, expect, afterEach } from 'vitest';
import { SupabaseClient } from '@supabase/supabase-js';
import { makeClient, uniqueChannel, subscribe, waitFor, cleanup } from './helpers';

describe('Realtime presence', () => {
  const clients: SupabaseClient[] = [];
  afterEach(() => cleanup(...clients));

  it('teacher sees student after they join', async () => {
    const teacher = makeClient();
    const student = makeClient();
    clients.push(teacher, student);

    const id = uniqueChannel();
    const presenceState: any[] = [];

    const teacherCh = teacher.channel(id)
      .on('presence', { event: 'sync' }, () => {
        presenceState.splice(0, presenceState.length, ...Object.values(teacherCh.presenceState()).flat());
      });
    await subscribe(teacherCh);
    await teacherCh.track({ role: 'teacher' });

    const studentCh = student.channel(id);
    await subscribe(studentCh);
    await studentCh.track({ role: 'student', name: 'Alice' });

    await waitFor(() => presenceState.some((p: any) => p.name === 'Alice'));
    expect(presenceState.find((p: any) => p.name === 'Alice')).toBeTruthy();
  });

  it('teacher sees student disappear after disconnect', async () => {
    const teacher = makeClient();
    const student = makeClient();
    clients.push(teacher, student);

    const id = uniqueChannel();
    let currentPresence: any[] = [];

    const teacherCh = teacher.channel(id)
      .on('presence', { event: 'sync' }, () => {
        currentPresence = Object.values(teacherCh.presenceState()).flat();
      });
    await subscribe(teacherCh);

    const studentCh = student.channel(id);
    await subscribe(studentCh);
    await studentCh.track({ role: 'student', name: 'Alice' });

    await waitFor(() => currentPresence.some((p: any) => p.name === 'Alice'));

    // Student disconnects
    await student.realtime.disconnect();

    await waitFor(() => !currentPresence.some((p: any) => p.name === 'Alice'), 8000);
    expect(currentPresence.some((p: any) => p.name === 'Alice')).toBe(false);
  });

  it('late-joining client gets current presence state immediately', async () => {
    const teacher = makeClient();
    const alice = makeClient();
    const bob = makeClient(); // joins late
    clients.push(teacher, alice, bob);

    const id = uniqueChannel();

    const teacherCh = teacher.channel(id);
    await subscribe(teacherCh);

    const aliceCh = alice.channel(id);
    await subscribe(aliceCh);
    await aliceCh.track({ role: 'student', name: 'Alice' });

    // Wait for Alice to be tracked
    await new Promise(r => setTimeout(r, 200));

    // Bob joins and should immediately see Alice in presence
    let bobPresence: any[] = [];
    const bobCh = bob.channel(id)
      .on('presence', { event: 'sync' }, () => {
        bobPresence = Object.values(bobCh.presenceState()).flat();
      });
    await subscribe(bobCh);

    await waitFor(() => bobPresence.some((p: any) => p.name === 'Alice'));
    expect(bobPresence.some((p: any) => p.name === 'Alice')).toBe(true);
  });

  it('presence and broadcast arrive independently without blocking each other', async () => {
    const teacher = makeClient();
    const student = makeClient();
    clients.push(teacher, student);

    const id = uniqueChannel();
    const broadcastReceived: any[] = [];
    let presenceSynced = false;

    const teacherCh = teacher.channel(id)
      .on('broadcast', { event: 'classroom' }, ({ payload }) => broadcastReceived.push(payload))
      .on('presence', { event: 'sync' }, () => { presenceSynced = true; });
    await subscribe(teacherCh);

    const studentCh = student.channel(id);
    await subscribe(studentCh);
    await studentCh.track({ role: 'student', name: 'Alice' });
    await studentCh.send({ type: 'broadcast', event: 'classroom', payload: { type: 'student_fen', fen: 'test' } });

    await waitFor(() => broadcastReceived.length > 0 && presenceSynced);
    expect(broadcastReceived.length).toBeGreaterThan(0);
    expect(presenceSynced).toBe(true);
  });
});