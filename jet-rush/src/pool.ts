export class ObjectPool<T> {
  private pool: T[] = [];

  constructor(
    private factory: () => T,
    private reset: (obj: T) => void,
    prealloc: number = 0,
  ) {
    for (let i = 0; i < prealloc; i++) this.pool.push(factory());
  }

  acquire(): T {
    return this.pool.length > 0 ? this.pool.pop()! : this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }

  get size(): number {
    return this.pool.length;
  }
}
