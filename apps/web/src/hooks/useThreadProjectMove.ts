import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { type EnvironmentId, ProjectId, type ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { requestMakeProject } from "../components/MakeProjectDialog";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useProjects } from "../state/entities";
import { projectEnvironment } from "../state/projects";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useScratchProject } from "./useScratchProject";

const MOVE_PREFIX = "move-to-project:";

/** The folder most of a machine's projects live in, as a default for new ones. */
export function commonParentFolder(workspaceRoots: ReadonlyArray<string>): string {
  const counts = new Map<string, number>();
  for (const root of workspaceRoots) {
    const parent = root.replace(/\/+$/, "").replace(/\/[^/]+$/, "");
    if (parent) counts.set(parent, (counts.get(parent) ?? 0) + 1);
  }
  let best = "~/projects";
  let bestCount = 0;
  for (const [parent, count] of counts) {
    if (count > bestCount) {
      best = parent;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Fork: the thread menu's "Make into project…" and "Move to project" items,
 * shared by the sidebar row and the chat header.
 */
export function useThreadProjectMove() {
  const projects = useProjects();
  const { scratchWorkspaceRootFor } = useScratchProject();
  const moveToProject = useAtomCommand(threadEnvironment.moveToProject, { reportFailure: false });
  const createFromThread = useAtomCommand(projectEnvironment.createFromThread, {
    reportFailure: false,
  });

  const realProjectsOn = useCallback(
    (environmentId: EnvironmentId) => {
      const scratchRoot = scratchWorkspaceRootFor(environmentId);
      return projects
        .filter(
          (project) =>
            project.environmentId === environmentId && !isScratchProject(project, scratchRoot),
        )
        .toSorted((a, b) => a.title.localeCompare(b.title));
    },
    [projects, scratchWorkspaceRootFor],
  );

  /** Menu state for a thread, or null when it already has a project. */
  const projectMoveFor = useCallback(
    (thread: { readonly environmentId: EnvironmentId; readonly projectId: ProjectId }) => {
      const current = projects.find(
        (project) =>
          project.environmentId === thread.environmentId && project.id === thread.projectId,
      );
      if (!current || !isScratchProject(current, scratchWorkspaceRootFor(thread.environmentId))) {
        return null;
      }
      return {
        targets: realProjectsOn(thread.environmentId).map((project) => ({
          id: project.id,
          label: project.title,
        })),
      };
    },
    [projects, realProjectsOn, scratchWorkspaceRootFor],
  );

  /** Handles the fork's menu ids; returns false for every other action. */
  const handleProjectMoveAction = useCallback(
    async (
      action: string,
      threadRef: ScopedThreadRef,
      thread: { readonly title: string },
    ): Promise<boolean> => {
      const report = (title: string, error: unknown) =>
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title,
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      if (action.startsWith(MOVE_PREFIX)) {
        const projectId = ProjectId.make(action.slice(MOVE_PREFIX.length));
        const target = projects.find(
          (project) =>
            project.environmentId === threadRef.environmentId && project.id === projectId,
        );
        const result = await moveToProject({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, projectId },
        });
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            report("Failed to move thread", squashAtomCommandFailure(result));
          }
        } else if (target) {
          toastManager.add({ type: "success", title: `Moved to ${target.title}` });
        }
        return true;
      }
      if (action === "make-project") {
        const choice = await requestMakeProject({
          title: thread.title,
          parentFolder: commonParentFolder(
            realProjectsOn(threadRef.environmentId).map((project) => project.workspaceRoot),
          ),
        });
        if (!choice) return true;
        const result = await createFromThread({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, ...choice },
        });
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            report("Failed to make project", squashAtomCommandFailure(result));
          }
        } else {
          toastManager.add({
            type: "success",
            title: `Made ${choice.title} a project`,
            description: result.value.workspaceRoot,
          });
        }
        return true;
      }
      return false;
    },
    [createFromThread, moveToProject, projects, realProjectsOn],
  );

  return { projectMoveFor, handleProjectMoveAction };
}
