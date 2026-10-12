import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { useMemo } from "react";

import { useEnvironments } from "../../state/environments";
import { useThreadShells } from "../../state/entities";
import { ProjectFavicon } from "../ProjectFavicon";
import { Button } from "../ui/button";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";
import { useSettingsProjectGroups } from "./useSettingsProjectGroups";

/**
 * Fork: the Projects page's landing view. Lists every project with its folders
 * and thread count; Manage opens the existing per-project settings.
 */
export function ProjectsOverview() {
  const { selectScope } = useSettingsScope();
  const groups = useSettingsProjectGroups();
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const rows = useMemo(() => {
    const scratchRoots = new Map(
      environments.map((entry) => [
        entry.environmentId,
        entry.serverConfig?.scratchWorkspaceRoot ?? null,
      ]),
    );
    return groups
      .filter(
        (group) =>
          !group.memberProjects.every((member) =>
            isScratchProject(member, scratchRoots.get(member.environmentId)),
          ),
      )
      .map((group) => {
        const members = new Set(
          group.memberProjectRefs.map((ref) => `${ref.environmentId}:${ref.projectId}`),
        );
        const threadCount = threads.filter(
          (thread) =>
            thread.archivedAt === null &&
            members.has(`${thread.environmentId}:${thread.projectId}`),
        ).length;
        return { group, threadCount };
      });
  }, [environments, groups, threads]);

  return (
    <SettingsPageContainer>
      <SettingsSection title="Projects">
        {rows.length === 0 ? (
          <SettingsRow title="No projects yet" description="Add a project from the sidebar." />
        ) : (
          rows.map(({ group, threadCount }) => (
            <SettingsRow
              key={group.projectKey}
              title={
                <span className="flex items-center gap-2">
                  <ProjectFavicon project={group.memberProjects[0]!} className="size-4" />
                  {group.displayName}
                </span>
              }
              description={
                <>
                  {group.memberProjects.map((member) => (
                    <span key={member.physicalProjectKey} className="block break-all">
                      {member.environmentLabel && group.memberProjects.length > 1
                        ? `${member.environmentLabel}: `
                        : ""}
                      {member.workspaceRoot}
                    </span>
                  ))}
                  <span className="block">
                    {threadCount === 1 ? "1 thread" : `${threadCount} threads`}
                  </span>
                </>
              }
              control={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => selectScope({ project: group.projectKey })}
                >
                  Manage
                </Button>
              }
            />
          ))
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
