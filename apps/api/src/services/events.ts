import { EventEmitter } from 'node:events';

/**
 * In-process domain event bus. v1 runs API + workers in one process; plan §11 moves this to
 * BullMQ/Redis so events survive restarts and fan out across containers. Keep the event
 * names and payloads stable so that swap is mechanical.
 */
export interface DomainEvents {
  'order.created': { tenantId: string; orderId: string; orderNo: number; branchId?: string };
  'order.status_changed': { tenantId: string; orderId: string; orderNo: number; status: string; branchId?: string };
  'tenant.created': { tenantId: string; slug: string };
  'site.published': { tenantId: string; version: number };
}

class Bus extends EventEmitter {
  emitEvent<K extends keyof DomainEvents>(name: K, payload: DomainEvents[K]) {
    setImmediate(() => this.emit(name, payload)); // never block the request on listeners
  }

  onEvent<K extends keyof DomainEvents>(name: K, fn: (p: DomainEvents[K]) => void) {
    this.on(name, fn);
    return () => {
      this.off(name, fn);
    };
  }
}

export const bus = new Bus();
bus.setMaxListeners(1000); // one per open admin order-board stream
