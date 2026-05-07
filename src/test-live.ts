import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import WebSocket from 'ws';
import sharp from 'sharp';
import { StreamServerStandalone } from './stream-server-standalone.js';
import { getSocketDir } from './daemon.js';

const PORT = 15013;
const SESSION = 'ts';
const IPC = () => path.join(getSocketDir(), 'stream-server.ipc');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jpg = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 50, g: 100, b: 150 } } })
    .jpeg({ quality: 80 })
    .toBuffer();

class Ipc {
  private sock: net.Socket;
  private buf = '';
  private waiters: {
    p: (m: Record<string, unknown>) => boolean;
    r: (m: Record<string, unknown>) => void;
  }[] = [];
  constructor(s: net.Socket) {
    this.sock = s;
    s.on('data', (d) => {
      this.buf += d.toString();
      this.flush();
    });
  }
  private flush() {
    while (this.buf.includes('\n')) {
      const i = this.buf.indexOf('\n');
      const line = this.buf.substring(0, i);
      this.buf = this.buf.substring(i + 1);
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        for (let j = 0; j < this.waiters.length; j++) {
          if (this.waiters[j].p(m)) {
            this.waiters.splice(j, 1)[0].r(m);
            break;
          }
        }
      } catch {
        /* empty */
      }
    }
  }
  send(m: object) {
    this.sock.write(JSON.stringify(m) + '\n');
  }
  wait(p: (m: Record<string, unknown>) => boolean, ms = 5000) {
    return new Promise<Record<string, unknown>>((ok, f) => {
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.r !== ok);
        f(new Error('ipc timeout'));
      }, ms);
      this.waiters.push({
        p,
        r: (m) => {
          clearTimeout(t);
          ok(m);
        },
      });
    });
  }
  destroy() {
    this.sock.destroy();
  }
}

class Ws {
  private ws: WebSocket;
  private texts: Record<string, unknown>[] = [];
  private bins: Buffer[] = [];
  private tWaiters: {
    p: (m: Record<string, unknown>) => boolean;
    r: (m: Record<string, unknown>) => void;
  }[] = [];
  private bWaiters: { r: (b: Buffer) => void }[] = [];
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d: WebSocket.Data) => {
      let isBinary = false;
      let buf: Buffer;
      if (typeof d === 'string') {
        buf = Buffer.from(d, 'utf8');
      } else if (Buffer.isBuffer(d)) {
        buf = d;
        isBinary = true;
      } else if (Array.isArray(d)) {
        buf = Buffer.concat(d);
        isBinary = true;
      } else {
        buf = Buffer.from(d as ArrayBuffer);
        isBinary = true;
      }

      let parsed: Record<string, unknown> | null = null;
      if (!isBinary) {
        try {
          parsed = JSON.parse(buf.toString('utf8'));
        } catch {
          /* empty */
        }
      } else {
        try {
          parsed = JSON.parse(buf.toString('utf8'));
        } catch {
          /* empty */
        }
      }

      if (parsed) {
        for (let i = 0; i < this.tWaiters.length; i++) {
          if (this.tWaiters[i].p(parsed)) {
            this.tWaiters.splice(i, 1)[0].r(parsed);
            return;
          }
        }
        this.texts.push(parsed);
      } else {
        for (const w of this.bWaiters) {
          w.r(buf);
        }
        this.bWaiters = [];
        this.bins.push(buf);
      }
    });
  }
  open() {
    return new Promise<void>((r) => this.ws.on('open', () => r()));
  }
  text(p: (m: Record<string, unknown>) => boolean, ms = 5000) {
    for (let i = 0; i < this.texts.length; i++) {
      if (p(this.texts[i])) return Promise.resolve(this.texts.splice(i, 1)[0]);
    }
    return new Promise<Record<string, unknown>>((ok, f) => {
      const t = setTimeout(() => {
        this.tWaiters = this.tWaiters.filter((w) => w.r !== ok);
        f(new Error('text timeout'));
      }, ms);
      this.tWaiters.push({
        p,
        r: (m) => {
          clearTimeout(t);
          ok(m);
        },
      });
    });
  }
  bin(ms = 5000) {
    if (this.bins.length > 0) return Promise.resolve(this.bins.shift() as Buffer);
    return new Promise<Buffer>((ok, f) => {
      const t = setTimeout(() => {
        this.bWaiters = this.bWaiters.filter((w) => w.r !== ok);
        f(new Error('bin timeout'));
      }, ms);
      this.bWaiters.push({
        r: (b) => {
          clearTimeout(t);
          ok(b);
        },
      });
    });
  }
  close() {
    this.ws.close();
  }
  drain() {
    this.texts.length = 0;
    this.bins.length = 0;
  }
}

async function main() {
  const pid = path.join(getSocketDir(), 'stream-server.pid');
  if (fs.existsSync(pid)) fs.unlinkSync(pid);

  const server = new StreamServerStandalone(PORT);
  await server.start();

  const rawSock = await new Promise<net.Socket>((ok, f) => {
    const s = net.createConnection({ path: IPC() }, () => ok(s));
    s.on('error', f);
  });
  const ipc = new Ipc(rawSock);
  ipc.send({ type: 'register', session: SESSION, instanceId: 'i1', socketPath: '/tmp/x.sock' });
  await sleep(300);

  let P = 0,
    F = 0;

  // TEST 1: scaled frame (768x480) with viewport 1280x800
  console.log('TEST 1: scaled frame crop');
  try {
    const sel = '.t1',
      box = { x: 328, y: 205.59375, width: 624, height: 388.796875 };
    const ws = new Ws(
      `ws://localhost:${PORT}/?session=${SESSION}&selector=${encodeURIComponent(sel)}`
    );
    await ws.open();
    await ipc.wait((m) => m.type === 'request_element_box');
    ipc.send({ type: 'selector_element', session: SESSION, selector: sel, elementBox: box });
    await ws.text((m) => m.type === 'status' && !!m.element);

    const fb = await jpg(768, 480);
    ipc.send({
      type: 'frame',
      session: SESSION,
      metadata: {
        offsetTop: 0,
        pageScaleFactor: 1,
        deviceWidth: 1280,
        deviceHeight: 800,
        scrollOffsetX: 0,
        scrollOffsetY: 0,
        timestamp: Date.now() / 1000,
      },
      format: 'jpeg',
      fps: 10,
      state: 'streaming',
      data: fb.toString('base64'),
    });

    const hdr = await ws.text((m) => m.type === 'frame', 10000);
    const img = await ws.bin(10000);
    const info = await sharp(img).metadata();
    const el = (hdr.metadata as Record<string, unknown> | undefined)?.element;
    console.log(`  image: ${info.width}x${info.height}, element: ${el ? 'present' : 'MISSING'}`);
    const expW = 374,
      expH = 233;
    if (info.width === expW && info.height === expH && el) {
      console.log('  PASS');
      P++;
    } else {
      console.log('  FAIL');
      F++;
    }
    ws.close();
    await sleep(300);
  } catch (e: unknown) {
    console.log('  FAIL:', e instanceof Error ? e.message : String(e));
    F++;
  }

  // TEST 2: full size frame (1280x800)
  console.log('\nTEST 2: full size frame crop');
  try {
    const sel = '.t2',
      box = { x: 100, y: 50, width: 400, height: 300 };
    const ws = new Ws(
      `ws://localhost:${PORT}/?session=${SESSION}&selector=${encodeURIComponent(sel)}`
    );
    await ws.open();
    await ipc.wait((m) => m.type === 'request_element_box' && m.selector === sel);
    ipc.send({ type: 'selector_element', session: SESSION, selector: sel, elementBox: box });
    await ws.text((m) => m.type === 'status' && !!m.element, 10000);

    // drain cached frame header + binary from previous test's latestFrame
    await sleep(100);
    ws.drain();

    const fb = await jpg(1280, 800);
    ipc.send({
      type: 'frame',
      session: SESSION,
      metadata: {
        offsetTop: 0,
        pageScaleFactor: 1,
        deviceWidth: 1280,
        deviceHeight: 800,
        scrollOffsetX: 0,
        scrollOffsetY: 0,
        timestamp: Date.now() / 1000,
      },
      format: 'jpeg',
      fps: 10,
      state: 'streaming',
      data: fb.toString('base64'),
    });

    const img = await ws.bin(10000);
    const info = await sharp(img).metadata();
    console.log(`  image: ${info.width}x${info.height}`);
    if (info.width === 400 && info.height === 300) {
      console.log('  PASS');
      P++;
    } else {
      console.log('  FAIL');
      F++;
    }
    ws.close();
    await sleep(300);
  } catch (e: unknown) {
    console.log('  FAIL:', e instanceof Error ? e.message : String(e));
    F++;
  }

  // TEST 3: no selector → full frame
  console.log('\nTEST 3: no selector');
  try {
    const ws = new Ws(`ws://localhost:${PORT}/?session=${SESSION}`);
    await ws.open();
    await ws.text((m) => m.type === 'status');
    await sleep(200);
    ws.drain();

    const fb = await jpg(1280, 800);
    ipc.send({
      type: 'frame',
      session: SESSION,
      metadata: {
        offsetTop: 0,
        pageScaleFactor: 1,
        deviceWidth: 1280,
        deviceHeight: 800,
        scrollOffsetX: 0,
        scrollOffsetY: 0,
        timestamp: Date.now() / 1000,
      },
      format: 'jpeg',
      fps: 10,
      state: 'streaming',
      data: fb.toString('base64'),
    });

    const img = await ws.bin(10000);
    const info = await sharp(img).metadata();
    console.log(`  image: ${info.width}x${info.height}`);
    if (info.width === 1280 && info.height === 800) {
      console.log('  PASS');
      P++;
    } else {
      console.log('  FAIL');
      F++;
    }
    ws.close();
    await sleep(300);
  } catch (e: unknown) {
    console.log('  FAIL:', e instanceof Error ? e.message : String(e));
    F++;
  }

  ipc.destroy();
  await server.stop();
  console.log(`\n=== ${P} passed, ${F} failed ===`);
  process.exit(F > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
