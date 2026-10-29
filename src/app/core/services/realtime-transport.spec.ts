import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';
import { BroadcastEvent, RealtimeTransport } from './realtime-transport.service';

describe('RealtimeTransport', () => {
  let transport: RealtimeTransport;
  let statusHandler: ((status: string) => void) | undefined;
  let channel: any;

  beforeEach(() => {
    channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((callback: (status: string) => void) => {
        statusHandler = callback;
        return channel;
      }),
      track: vi.fn().mockResolvedValue('ok'),
      presenceState: vi.fn(() => ({})),
      send: vi.fn().mockResolvedValue('ok'),
    };

    TestBed.configureTestingModule({
      providers: [
        RealtimeTransport,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              channel: vi.fn(() => channel),
              removeChannel: vi.fn().mockResolvedValue('ok'),
            },
          },
        },
      ],
    });
    transport = TestBed.inject(RealtimeTransport);
  });

  afterEach(async () => {
    await transport.leave();
    TestBed.resetTestingModule();
  });

  it('waits for resubscription before broadcasting after a disconnect', async () => {
    await transport.joinAsTeacher('room-1');
    await statusHandler?.('SUBSCRIBED');
    await statusHandler?.('CHANNEL_ERROR');

    const event: BroadcastEvent = { type: 'gather' };
    const sending = transport.send(event);
    await Promise.resolve();
    expect(channel.send).not.toHaveBeenCalled();

    await statusHandler?.('SUBSCRIBED');
    await sending;

    expect(channel.send).toHaveBeenCalledOnce();
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'classroom',
      payload: event,
    });
  });
});