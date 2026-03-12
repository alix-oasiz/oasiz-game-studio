1) Prove if the server process is restarting

If the Colyseus backend “hits a snag and resets”, you’ll see it in logs and uptime.

If you run with PM2
pm2 status
pm2 logs --lines 200
pm2 describe <your-app-name>

Look for: restarts count increasing, “exited”, “killed”, OOM, or uncaught exceptions.

If you run with Docker
docker ps
docker logs -n 200 <container>
docker inspect <container> --format='{{.State.RestartCount}}'
If it’s just Node directly

Run it with timestamps and crash visibility:

node --trace-uncaught --unhandled-rejections=strict build/index.js

If you see any restart, fix that first. Load testing a crashing process is pointless.

2) Capture why clients disconnect (client-side + server-side)

A “disconnect” alone is useless. You need the code + reason + timing.

In your load test client, log close codes and reasons

If you’re using Colyseus JS client:

client.onError((err) => console.log("ERR", err));
room.onLeave((code) => console.log("LEAVE code=", code));

But also hook the raw WebSocket close if you can (depends how you created it). The goal is to capture:

close code (1000, 1001, 1006, 1011, 1009, etc.)

whether it’s consistent at “N clients”, or “after T seconds”

If you keep seeing 1006, it’s almost always “connection dropped without a clean close” (server crash, proxy drop, network, or event loop stall). Not proof, but strong signal.

3) Add 3 server hooks that tell you what’s happening

In each Room, add logging for:

onCreate

onJoin

onLeave (with client + code)

onDispose

and a periodic heartbeat log so you know the room isn’t freezing

Example (TypeScript-ish):

onCreate() {
  console.log(`[${this.roomId}] create`);
  this.setSimulationInterval((dt) => {
    // your sim
  }, 1000 / 60);

  setInterval(() => {
    console.log(`[${this.roomId}] clients=${this.clients.length} mem=${Math.round(process.memoryUsage().rss/1024/1024)}MB`);
  }, 5000);
}

onJoin(client) {
  console.log(`[${this.roomId}] join ${client.sessionId} clients=${this.clients.length}`);
}

onLeave(client, consented) {
  console.log(`[${this.roomId}] leave ${client.sessionId} consented=${consented} clients=${this.clients.length}`);
}

onDispose() {
  console.log(`[${this.roomId}] dispose`);
}

This tells you immediately which bucket you’re in:

Server restarted: all rooms vanish + process restarts

Rooms disposing: you’ll see dispose without a process restart

Client churn: you’ll see leave spikes with no dispose and no restart

Freeze / event loop stall: heartbeat logs stop or become very delayed

4) Measure event loop lag (this catches “physics sim stalls”)

Matter.js at 60hz under load can stall Node’s event loop. When the loop stalls, sockets starve and you get disconnects.

Add this once in your server:

import { monitorEventLoopDelay } from "perf_hooks";

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
  const mean = Math.round(h.mean / 1e6);
  const p99 = Math.round(h.percentile(99) / 1e6);
  console.log(`[looplag] mean=${mean}ms p99=${p99}ms`);
  h.reset();
}, 5000);

If p99 starts going into hundreds of ms when you scale rooms, that’s your “snag”. Not Colyseus. Your server is just too busy to keep connections healthy.

5) Check the common disconnect causes (fast triage)

Once you have the logs above, you’ll usually land in one of these:

A) Process restarts: OOM or crash

Symptoms:

PM2 restart count increases / Docker restart count increases

last logs show exception or “JavaScript heap out of memory”

Fix:

raise memory (--max-old-space-size)

find memory leak (state growth, arrays not cleared, physics bodies never removed)

reduce per-room sim cost

B) Event loop stall

Symptoms:

loop lag p99 spikes

disconnects start “after some load” rather than at a specific client count
Fix:

lower tick rate (server 30hz) or decouple physics from broadcast rate

reduce per-tick work

stop spamming state at 60hz if it’s huge

move heavy work off main thread (worker threads) if truly needed

C) Message too big / too frequent (1009 or random drops)

Symptoms:

spikes in bandwidth, some proxies drop
Fix:

shrink state

don’t patch massive arrays every tick

throttle sends, delta-compress, only send what changed

D) Idle/ping timeouts or proxy timeouts

Symptoms:

disconnect after a consistent time (like ~30s, 60s, 2 mins)
Fix:

ensure heartbeat/ping is enabled (Colyseus usually handles it)

if behind nginx/cloudflare, verify websocket timeouts

6) One quick controlled test that tells you a lot

Run two load tests:

No physics (keep rooms, clients, state minimal)

Full physics (your real sim)

If #1 survives but #2 dies, it’s not “Colyseus resetting”. It’s your sim, state size, or event loop.