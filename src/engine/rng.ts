const UINT32_RANGE = 0x1_0000_0000;

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`seed must be finite; received ${String(seed)}`);
  }
  return Math.trunc(seed) >>> 0;
}

export class SeededRng {
  private state: number;
  private spareNormal: number | null;

  constructor(seed: number) {
    this.state = normalizeSeed(seed);
    this.spareNormal = null;
  }

  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  next(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  uniform(min = 0, max = 1): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new RangeError(`uniform bounds must be finite and max >= min; received [${min}, ${max}]`);
    }
    return min + ((max - min) * this.next());
  }

  integer(minInclusive: number, maxInclusive: number): number {
    if (
      !Number.isInteger(minInclusive)
      || !Number.isInteger(maxInclusive)
      || maxInclusive < minInclusive
    ) {
      throw new RangeError(
        `integer bounds must be integers with max >= min; received [${minInclusive}, ${maxInclusive}]`,
      );
    }
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.next() * span);
  }

  normal(mean = 0, standardDeviation = 1): number {
    if (!Number.isFinite(mean) || !Number.isFinite(standardDeviation) || standardDeviation < 0) {
      throw new RangeError(
        `normal parameters must be finite with standardDeviation >= 0; received mean=${mean}, standardDeviation=${standardDeviation}`,
      );
    }
    if (standardDeviation === 0) {
      return mean;
    }
    if (this.spareNormal !== null) {
      const value = this.spareNormal;
      this.spareNormal = null;
      return mean + (standardDeviation * value);
    }

    let u = 0;
    while (u <= Number.EPSILON) {
      u = this.next();
    }
    const v = this.next();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    this.spareNormal = magnitude * Math.sin(angle);
    return mean + (standardDeviation * magnitude * Math.cos(angle));
  }

  clone(): SeededRng {
    const copy = new SeededRng(0);
    copy.state = this.state;
    copy.spareNormal = this.spareNormal;
    return copy;
  }
}

export function createSeededRng(seed: number): SeededRng {
  return new SeededRng(seed);
}
