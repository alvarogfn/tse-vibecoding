import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let importSeq = 0;

function loadClient() {
  return import(`../src/lib/election-predictor/rollout-worker-client.ts?test=${importSeq++}`);
}

class FakeWorker {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    this.posted = [];
    this.terminated = false;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  respond(data) {
    this.onmessage?.({ data });
  }

  fail(message) {
    this.onerror?.({ message });
  }
}

function payload(overrides = {}) {
  return {
    weights: [{ shape: [1, 1], data: [1] }],
    ufs: [
      {
        uf: 'AA',
        counted: 0,
        share: null,
        target: 50,
        weight: 1,
        curve: [],
        final1T: 50,
        pollAvg: 50,
        nationalShare1T: 50,
      },
    ],
    slices: 2,
    curveFallback: 50,
    ...overrides,
  };
}

function responseFor(request, overrides = {}) {
  return {
    id: request.id,
    ok: true,
    curves: [[50, 50]],
    nationalLula: [50, 50],
    nationalFlavio: [50, 50],
    ...overrides,
  };
}

function silenceWarn() {
  const original = console.warn;
  console.warn = () => {};
  return () => {
    console.warn = original;
  };
}

test('worker client: sucesso entrega curvas e preserva id', async () => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  const client = await loadClient();
  const promise = client.runRolloutInWorker(payload());
  const worker = FakeWorker.instances[0];
  assert.ok(worker);
  assert.equal(worker.posted.length, 1);
  assert.equal(worker.posted[0].id, 1);
  worker.respond(responseFor(worker.posted[0]));

  const result = await promise;
  assert.ok(result);
  assert.deepEqual(result.curves, [[50, 50]]);
  assert.equal(worker.terminated, false);
});

test('worker client: resposta com id antigo é ignorada', async () => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  const client = await loadClient();
  const promise = client.runRolloutInWorker(payload());
  const worker = FakeWorker.instances[0];
  worker.respond(responseFor(worker.posted[0], { id: 999, nationalLula: [99, 99] }));
  let settled = false;
  promise.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  worker.respond(responseFor(worker.posted[0]));
  const result = await promise;
  assert.deepEqual(result.nationalLula, [50, 50]);
});

test('worker client: ok:false liquida e desabilita o Worker', async () => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  const restoreWarn = silenceWarn();
  try {
    const client = await loadClient();
    const promise = client.runRolloutInWorker(payload());
    const worker = FakeWorker.instances[0];
    worker.respond({ id: worker.posted[0].id, ok: false, error: 'boom' });
    assert.equal(await promise, null);
    assert.equal(worker.terminated, true);
    assert.equal(client.isRolloutWorkerAvailable(), false);

    const second = await client.runRolloutInWorker(payload());
    assert.equal(second, null);
    assert.equal(FakeWorker.instances.length, 1);
  } finally {
    restoreWarn();
  }
});

test('worker client: resposta malformada cai no fallback', async () => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  const restoreWarn = silenceWarn();
  try {
    const client = await loadClient();
    const promise = client.runRolloutInWorker(payload());
    const worker = FakeWorker.instances[0];
    worker.respond({ id: worker.posted[0].id, ok: true, curves: 'bad', nationalLula: [], nationalFlavio: [] });
    assert.equal(await promise, null);
    assert.equal(client.isRolloutWorkerAvailable(), false);
  } finally {
    restoreWarn();
  }
});

test('worker client: timeout liquida e desabilita o Worker', async () => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  const restoreWarn = silenceWarn();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const client = await loadClient();
    const promise = client.runRolloutInWorker(payload());
    const worker = FakeWorker.instances[0];
    mock.timers.tick(10_000);
    assert.equal(await promise, null);
    assert.equal(worker.terminated, true);
    assert.equal(client.isRolloutWorkerAvailable(), false);
  } finally {
    mock.timers.reset();
    restoreWarn();
  }
});

test('worker client: pedido substituído cancela o anterior e usa o novo', async () => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  const restoreWarn = silenceWarn();
  try {
    const client = await loadClient();
    const first = client.runRolloutInWorker(payload());
    const worker1 = FakeWorker.instances[0];
    const second = client.runRolloutInWorker(payload({ slices: 3 }));
    const worker2 = FakeWorker.instances[1];
    assert.ok(worker1 && worker2);
    assert.equal(await first, null);
    assert.equal(worker1.terminated, true);
    assert.equal(worker1.onmessage, null);

    worker2.respond(
      responseFor(worker2.posted[0], {
        curves: [[50, 51, 52]],
        nationalLula: [50, 51, 52],
        nationalFlavio: [50, 49, 48],
      }),
    );
    const result = await second;
    assert.deepEqual(result.curves, [[50, 51, 52]]);
  } finally {
    restoreWarn();
  }
});

test('worker client: cancelamento explícito e ambiente sem Worker', async () => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker;
  const client = await loadClient();
  const promise = client.runRolloutInWorker(payload());
  const worker = FakeWorker.instances[0];
  client.cancelRolloutInWorker();
  assert.equal(await promise, null);
  assert.equal(worker.terminated, true);

  delete globalThis.Worker;
  const noWorkerClient = await loadClient();
  assert.equal(await noWorkerClient.runRolloutInWorker(payload()), null);
});
