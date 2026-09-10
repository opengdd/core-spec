const samePoint = (left, right) => left?.line === right?.line && left?.character === right?.character;
const sameRange = (left, right) => samePoint(left?.start, right?.start) && samePoint(left?.end, right?.end);

function sameSelection(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.kind === right.kind && left.name === right.name && left.file === right.file
    && sameRange(left.range, right.range) && sameRange(left.extent, right.extent);
}

export function createSelectionBus({ queue = queueMicrotask } = {}) {
  const listeners = new Set();
  let current = null;
  let revision = 0;
  let deliveryQueued = false;

  const deliver = () => {
    deliveryQueued = false;
    for (const listener of [...listeners]) listener(current);
  };

  const publish = (next, origin) => {
    const normalized = next ? { ...next, origin: origin ?? next.origin, revision: revision + 1 } : null;
    if (sameSelection(current, normalized)) return false;
    revision += 1;
    current = normalized ? { ...normalized, revision } : null;
    if (!deliveryQueued) {
      deliveryQueued = true;
      queue(deliver);
    }
    return true;
  };

  return {
    current: () => current,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("A selection subscriber must be a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    select(next, options = {}) {
      return publish(next, options.origin);
    },
    clear(origin) { return publish(null, origin); }
  };
}
