// Faux contexte Web Audio minimal : enregistre les nœuds créés, leurs connexions et leurs appels.

export class FakeParam {
  value = 0;
  targets: number[] = [];
  setTargetAtTime(value: number): void {
    this.value = value;
    this.targets.push(value);
  }
}

export class FakeNode {
  connections: unknown[] = [];
  connect(dest: unknown): unknown {
    this.connections.push(dest);
    return dest;
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam();
}

export class FakePanner extends FakeNode {
  pan = new FakeParam();
}

export class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

export class FakeContext {
  state: 'suspended' | 'running' = 'suspended';
  destination = { name: 'destination' };
  currentTime = 0;
  gains: FakeGain[] = [];
  panners: FakePanner[] = [];
  sources: FakeSource[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  /** Si défini, `resume()` ne passe en `running` qu'après avoir résolu cette promesse. */
  resumeGate: Promise<void> | null = null;
  /** Fait échouer `resume()`. */
  resumeFails = false;

  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createStereoPanner(): FakePanner {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  async resume(): Promise<void> {
    this.resumeCalls++;
    if (this.resumeFails) throw new Error('resume refusé');
    if (this.resumeGate) await this.resumeGate;
    this.state = 'running';
  }
  async suspend(): Promise<void> {
    this.suspendCalls++;
    this.state = 'suspended';
  }
}
