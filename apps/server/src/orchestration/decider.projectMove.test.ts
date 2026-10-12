import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationProject,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { projectEvent } from "./projector.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function project(id: string, deletedAt: string | null = null): OrchestrationProject {
  return {
    id: ProjectId.make(id),
    title: id,
    workspaceRoot: `/work/${id}`,
    defaultModelSelection: null,
    scripts: [],
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt,
  };
}

function makeReadModel(input: {
  readonly targetDeletedAt?: string | null;
  readonly activeTurnId?: string | null;
}): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [project("scratch"), project("target", input.targetDeletedAt ?? null)],
    threads: [
      {
        id: ThreadId.make("thread-1"),
        projectId: ProjectId.make("scratch"),
        title: "Thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "scratch-branch",
        worktreePath: "/data/scratch/2026-01-01-thread",
        pullRequests: [],
        latestTurn: null,
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        snoozedUntil: null,
        snoozedAt: null,
        pinnedAt: null,
        pinOrderKey: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session:
          input.activeTurnId === undefined
            ? null
            : {
                threadId: ThreadId.make("thread-1"),
                status: input.activeTurnId === null ? "ready" : "running",
                providerName: "codex",
                runtimeMode: "full-access",
                activeTurnId: input.activeTurnId === null ? null : TurnId.make(input.activeTurnId),
                lastError: null,
                updatedAt: NOW,
              },
      },
    ],
    updatedAt: NOW,
  };
}

const moveCommand = {
  type: "thread.project.move",
  commandId: CommandId.make("cmd-move"),
  threadId: ThreadId.make("thread-1"),
  projectId: ProjectId.make("target"),
} as const;

it.layer(NodeServices.layer)("thread.project.move decider", (it) => {
  it.effect("moves the thread to the project root", () =>
    Effect.gen(function* () {
      const readModel = makeReadModel({ activeTurnId: null });
      const decided = yield* decideOrchestrationCommand({ command: moveCommand, readModel });
      const events = Array.isArray(decided) ? decided : [decided];
      expect(events).toHaveLength(1);
      const event = events[0]!;
      expect(event.type).toBe("thread.meta-updated");

      const next = yield* projectEvent(readModel, { ...event, sequence: 1 });
      const thread = next.threads.find((entry) => entry.id === moveCommand.threadId);
      expect(thread?.projectId).toBe(moveCommand.projectId);
      expect(thread?.worktreePath).toBeNull();
      expect(thread?.branch).toBeNull();
    }),
  );

  it.effect("rejects a removed project", () =>
    Effect.gen(function* () {
      const error = yield* decideOrchestrationCommand({
        command: moveCommand,
        readModel: makeReadModel({ targetDeletedAt: NOW }),
      }).pipe(Effect.flip);
      expect(error.message).toContain("has been removed");
    }),
  );

  it.effect("rejects a thread with a running turn", () =>
    Effect.gen(function* () {
      const error = yield* decideOrchestrationCommand({
        command: moveCommand,
        readModel: makeReadModel({ activeTurnId: "turn-1" }),
      }).pipe(Effect.flip);
      expect(error.message).toContain("Stop the running turn");
    }),
  );
});
