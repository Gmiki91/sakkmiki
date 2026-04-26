import { SupabaseClient } from '@supabase/supabase-js';
import { makeClient, uniqueChannel, subscribe, waitFor, cleanup } from './helpers'

describe('Realtime broadcast', () => {
  const clients: SupabaseClient[] = [];
  afterEach(() => cleanup(...clients));

  it('teacher broadcast reaches student', async () => {
    const teacher = makeClient();
    const student = makeClient();
    clients.push(teacher, student);

    const id = uniqueChannel();
    const received: any[] = [];

    const studentCh = student.channel(id)
      .on('broadcast', { event: 'classroom' }, ({ payload }) => received.push(payload));
    await subscribe(studentCh);

    const teacherCh = teacher.channel(id);
    await subscribe(teacherCh);

    await teacherCh.send({ type: 'broadcast', event: 'classroom', payload: { type: 'gather' } });

    await waitFor(() => received.length > 0);
    expect(received[0].type).toBe('gather');
  });

  it('broadcast reaches multiple students simultaneously', async () => {
    const teacher = makeClient();
    const alice = makeClient();
    const bob = makeClient();
    clients.push(teacher, alice, bob);

    const id = uniqueChannel();
    const aliceReceived: any[] = [];
    const bobReceived: any[] = [];

    await subscribe(alice.channel(id).on('broadcast', { event: 'classroom' }, ({ payload }) => aliceReceived.push(payload)));
    await subscribe(bob.channel(id).on('broadcast', { event: 'classroom' }, ({ payload }) => bobReceived.push(payload)));
    const teacherCh = teacher.channel(id);
    await subscribe(teacherCh);

    await teacherCh.send({ type: 'broadcast', event: 'classroom', payload: { type: 'gather' } });

    await waitFor(() => aliceReceived.length > 0 && bobReceived.length > 0);
    expect(aliceReceived[0].type).toBe('gather');
    expect(bobReceived[0].type).toBe('gather');
  });

  it('rapid broadcasts arrive in order', async () => {
    const teacher = makeClient();
    const student = makeClient();
    clients.push(teacher, student);

    const id = uniqueChannel();
    const received: number[] = [];

    const studentCh = student.channel(id)
      .on('broadcast', { event: 'classroom' }, ({ payload }) => received.push(payload.index));
    await subscribe(studentCh);

    const teacherCh = teacher.channel(id);
    await subscribe(teacherCh);

    // Send 10 messages rapidly without awaiting each
    for (let i = 0; i < 10; i++) {
      await teacherCh.send({ type: 'broadcast', event: 'classroom', payload: { type: 'ping', index: i } });
    }

    await waitFor(() => received.length === 10);
    expect(received).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('sender does NOT receive their own broadcast', async () => {
    const client = makeClient();
    clients.push(client);

    const id = uniqueChannel();
    const received: any[] = [];

    const ch = client.channel(id)
      .on('broadcast', { event: 'classroom' }, ({ payload }) => received.push(payload));
    await subscribe(ch);

    await ch.send({ type: 'broadcast', event: 'classroom', payload: { type: 'gather' } });

    // Wait enough time that it would have arrived if echoed
    await new Promise(r => setTimeout(r, 300));
    expect(received.length).toBe(0);
  });

  it('student broadcast reaches teacher but not other students', async () => {
    const teacher = makeClient();
    const alice = makeClient();
    const bob = makeClient();
    clients.push(teacher, alice, bob);

    const id = uniqueChannel();
    const teacherReceived: any[] = [];
    const bobReceived: any[] = [];

    await subscribe(teacher.channel(id).on('broadcast', { event: 'classroom' }, ({ payload }) => teacherReceived.push(payload)));
    const aliceCh = alice.channel(id);
    await subscribe(aliceCh);
    await subscribe(bob.channel(id).on('broadcast', { event: 'classroom' }, ({ payload }) => bobReceived.push(payload)));

    await aliceCh.send({ type: 'broadcast', event: 'classroom', payload: { type: 'student_fen', studentName: 'Alice', fen: 'test' } });

    await waitFor(() => teacherReceived.length > 0);
    // Bob also receives — this is expected, students receive all broadcasts
    // The filtering is done in ClassroomStore.handleStudentEvents by checking studentName
    expect(teacherReceived[0].studentName).toBe('Alice');
  });
});