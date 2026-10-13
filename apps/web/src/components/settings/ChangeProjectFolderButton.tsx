import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useId, useState } from "react";

import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { useSettingsScope } from "./SettingsScopeContext";

/**
 * Fork: points a project at another folder, for example after it was moved
 * or renamed on disk. Its threads continue from the new folder on their next
 * turn.
 */
export function ChangeProjectFolderButton({
  member,
}: {
  member: {
    readonly environmentId: EnvironmentId;
    readonly id: ProjectId;
    readonly workspaceRoot: string;
  };
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState(member.workspaceRoot);
  const [saving, setSaving] = useState(false);
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const { selectScope } = useSettingsScope();

  const save = async () => {
    const workspaceRoot = folder.trim();
    if (!workspaceRoot || workspaceRoot === member.workspaceRoot) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const result = await updateProject({
      environmentId: member.environmentId,
      input: { projectId: member.id, workspaceRoot },
    });
    setSaving(false);
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to change the project folder",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
      return;
    }
    toastManager.add({
      type: "success",
      title: "Project folder changed",
      description: workspaceRoot,
    });
    setOpen(false);
    // A project without a Git remote is keyed by its path, so the page's
    // selection no longer matches it. The list shows it under the new folder.
    selectScope({});
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setFolder(member.workspaceRoot);
          setOpen(true);
        }}
        aria-label={`Change folder for ${member.workspaceRoot}`}
      >
        Change folder…
      </Button>
      {open ? (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogPopup className="sm:max-w-md">
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <DialogHeader>
                <DialogTitle>Change project folder</DialogTitle>
                <DialogDescription>
                  Use this after moving or renaming the folder on disk. Nothing is moved for you,
                  and the new folder must already exist.
                </DialogDescription>
              </DialogHeader>
              <DialogPanel>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-folder`}>Folder</Label>
                  <Input
                    id={`${id}-folder`}
                    value={folder}
                    autoFocus
                    required
                    spellCheck={false}
                    onChange={(event) => setFolder(event.currentTarget.value)}
                  />
                </div>
              </DialogPanel>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>
      ) : null}
    </>
  );
}
