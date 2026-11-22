import http from 'http';

interface StressTestOptions {
  baseUrl: string;
  mode: 'naive' | 'optimized';
  concurrency: number;
  totalTickets: number;
}

async function request(
  url: string,
  method: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const postData = body ? JSON.stringify(body) : '';

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...headers,
        },
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, data: resBody ? JSON.parse(resBody) : {} });
          } catch {
            resolve({ status: res.statusCode || 500, data: resBody });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runBenchmark(opts: StressTestOptions) {
  console.log(`\n===============================================================`);
  console.log(`⚡ RUNNING CONCURRENCY STRESS BENCHMARK`);
  console.log(`Mode:           ${opts.mode.toUpperCase()}`);
  console.log(`Concurrent Users: ${opts.concurrency}`);
  console.log(`Initial Tickets:  ${opts.totalTickets}`);
  console.log(`Target URL:       ${opts.baseUrl}`);
  console.log(`===============================================================\n`);

  // 1. Login as Customer to obtain JWT
  console.log('🔑 Authenticating test customer...');
  const loginRes = await request(`${opts.baseUrl}/api/v1/auth/login`, 'POST', {
    email: 'customer@gmail.com',
    password: 'Password123!',
  });

  if (loginRes.status !== 200 || !loginRes.data.data?.token) {
    throw new Error(`Authentication failed: ${JSON.stringify(loginRes.data)}`);
  }
  const token = loginRes.data.data.token;

  // 2. Fetch available events to target
  const eventsRes = await request(`${opts.baseUrl}/api/v1/events?search=Global+Tech`, 'GET');
  const targetEvent = eventsRes.data.data?.[0];
  if (!targetEvent) {
    throw new Error('Test event not found. Did you run prisma:seed?');
  }

  // 3. Reset event inventory for clean benchmark
  console.log(`🔄 Resetting event inventory for "${targetEvent.title}" to ${opts.totalTickets} tickets...`);
  await request(`${opts.baseUrl}/api/v1/benchmark/reset-event`, 'POST', {
    eventId: targetEvent.id,
    totalTickets: opts.totalTickets,
  });

  console.log(`🚀 Launching ${opts.concurrency} SIMULTANEOUS ticket booking requests...\n`);

  const startTime = Date.now();
  let successfulBookings = 0;
  let soldOutCount = 0;
  let errorCount = 0;

  // Fire all concurrent requests at the exact same millisecond
  const promises = Array.from({ length: opts.concurrency }, async (_, idx) => {
    try {
      const res = await request(
        `${opts.baseUrl}/api/v1/events/${targetEvent.id}/book?mode=${opts.mode}`,
        'POST',
        { quantity: 1 },
        {
          Authorization: `Bearer ${token}`,
          'x-idempotency-key': `bench-${opts.mode}-${Date.now()}-${idx}`,
        }
      );

      if (res.status === 201) {
        successfulBookings++;
      } else if (res.status === 409) {
        soldOutCount++;
      } else {
        errorCount++;
      }
    } catch {
      errorCount++;
    }
  });

  await Promise.all(promises);
  const durationMs = Date.now() - startTime;

  // 4. Inspect final inventory from database
  const finalEventRes = await request(`${opts.baseUrl}/api/v1/events/${targetEvent.id}`, 'GET');
  const finalEvent = finalEventRes.data.data;

  const totalSold = opts.totalTickets - finalEvent.availableTickets;
  const oversoldTickets = Math.max(0, successfulBookings - opts.totalTickets);

  console.log(`\n📊 ---------------- BENCHMARK RESULTS ----------------`);
  console.log(`Execution Time:          ${durationMs} ms (${(opts.concurrency / (durationMs / 1000)).toFixed(1)} req/sec)`);
  console.log(`Total Requests Sent:     ${opts.concurrency}`);
  console.log(`Successful 201 Bookings: ${successfulBookings}`);
  console.log(`Graceful 409 Sold Out:   ${soldOutCount}`);
  console.log(`Failed / Dropped Errors: ${errorCount}`);
  console.log(`Database Available Left: ${finalEvent.availableTickets}`);
  console.log(`Tickets Expected Sold:   ${opts.totalTickets}`);
  console.log(`Tickets Actually Booked: ${successfulBookings}`);
  console.log(`⚠️ OVERSOLD TICKETS:      ${oversoldTickets} ${oversoldTickets > 0 ? '❌ (RACE CONDITION DETECTED!)' : '✅ (100% DATA INTEGRITY)'}`);
  console.log(`------------------------------------------------------\n`);

  return {
    mode: opts.mode,
    concurrency: opts.concurrency,
    durationMs,
    successfulBookings,
    soldOutCount,
    errorCount,
    oversoldTickets,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const modeArg = args.find((a, i) => args[i - 1] === '--mode') || 'both';
  const concurrencyArg = Number(args.find((a, i) => args[i - 1] === '--concurrency')) || 100;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  if (modeArg === 'naive') {
    await runBenchmark({ baseUrl, mode: 'naive', concurrency: concurrencyArg, totalTickets: 50 });
  } else if (modeArg === 'optimized') {
    await runBenchmark({ baseUrl, mode: 'optimized', concurrency: concurrencyArg, totalTickets: 50 });
  } else {
    // Run both sequentially to show direct side-by-side comparison
    console.log('🏁 Running Comparative Benchmark: Naive vs Optimized...\n');
    const naiveRes = await runBenchmark({ baseUrl, mode: 'naive', concurrency: 100, totalTickets: 50 });
    await new Promise((r) => setTimeout(r, 1000));
    const optRes = await runBenchmark({ baseUrl, mode: 'optimized', concurrency: 500, totalTickets: 50 });

    console.log(`\n================== SUMMARY COMPARISON TABLE ==================`);
    console.table([
      {
        Architecture: 'Naive (Initial LLM)',
        Concurrency: naiveRes.concurrency,
        DurationMs: naiveRes.durationMs,
        Booked: naiveRes.successfulBookings,
        Oversold: naiveRes.oversoldTickets,
        Result: naiveRes.oversoldTickets > 0 ? 'FAIL: Data Corruption (Oversold)' : 'Pass',
      },
      {
        Architecture: 'Optimized (Enterprise)',
        Concurrency: optRes.concurrency,
        DurationMs: optRes.durationMs,
        Booked: optRes.successfulBookings,
        Oversold: optRes.oversoldTickets,
        Result: optRes.oversoldTickets === 0 ? 'PASS: Zero Overselling (Rock Solid)' : 'Fail',
      },
    ]);
    console.log(`==============================================================\n`);
  }
}

main().catch((err) => {
  console.error('Benchmark execution error:', err);
  process.exit(1);
});
