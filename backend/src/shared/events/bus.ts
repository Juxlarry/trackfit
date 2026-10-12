import { EventEmitter } from "node:events";

/**
 * Lightweight in-process domain-event bus (architecture.md §3).
 *
 * Modules publish typed domain events here instead of calling into each
 * other's internals directly. Event payloads are designed as if they were
 * already going over a real queue (BullMQ/SQS later), so swapping the
 * transport is a small, mechanical change rather than a rewrite — the
 * events below are the actual contract, not an implementation detail.
 */

export type DomainEvent =
  | { type: "WeightLogged"; userId: string; weightEntryId: string; weightKg: number; recordedAt: string }
  | {
      type: "WorkoutLogged";
      userId: string;
      sessionId: string;
      durationMinutes: number | null;
      shareToClubs: boolean;
      milestoneIds: string[];
    }
  | {
      type: "MilestoneAchieved";
      userId: string;
      sessionId: string;
      milestoneId: string;
      exerciseId: string;
      milestoneType: string;
      value: number;
    };

class DomainEventBus extends EventEmitter {
  publish(event: DomainEvent) {
    this.emit(event.type, event);
    this.emit("*", event);
  }

  on<T extends DomainEvent["type"]>(
    type: T,
    listener: (event: Extract<DomainEvent, { type: T }>) => void,
  ): this;
  on(type: "*", listener: (event: DomainEvent) => void): this;
  on(type: string, listener: (event: DomainEvent) => void): this {
    return super.on(type, listener as (...args: unknown[]) => void);
  }
}

export const eventBus = new DomainEventBus();

// MVP1 has no Goals/Social/Notifications modules yet to subscribe to these —
// this listener just makes the event flow visible in logs until they exist.
eventBus.on("*", (event: DomainEvent) => {
  // eslint-disable-next-line no-console
  console.log(`[event] ${event.type}`, event);
});
