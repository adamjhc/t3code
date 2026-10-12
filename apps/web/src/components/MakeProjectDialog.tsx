import { useEffect, useId, useState } from "react";
import { create } from "zustand";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "./ui/dialog";

type MakeProjectChoice = { readonly title: string; readonly workspaceRoot: string };
type Request = {
  readonly title: string;
  readonly parentFolder: string;
  readonly resolve: (choice: MakeProjectChoice | null) => void;
};
const useRequest = create<{ request: Request | null }>(() => ({ request: null }));

/** Fork: asks for the name and folder of a project made from a thread. */
export function requestMakeProject(input: {
  readonly title: string;
  readonly parentFolder: string;
}): Promise<MakeProjectChoice | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { ...input, resolve } }));
}

function finish(choice: MakeProjectChoice | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(choice);
}

export function folderNameFor(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "project"
  );
}

export function MakeProjectDialogHost() {
  const request = useRequest((state) => state.request);
  useEffect(() => () => finish(null), []);
  return request ? <MakeProjectDialog request={request} /> : null;
}

function MakeProjectDialog({ request }: { request: Request }) {
  const id = useId();
  const [title, setTitle] = useState(request.title);
  const parent = request.parentFolder.replace(/\/+$/, "");
  // The folder follows the name until the user edits it.
  const [folder, setFolder] = useState<string | null>(null);
  const workspaceRoot = folder ?? `${parent}/${folderNameFor(title)}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim().length === 0 || workspaceRoot.trim().length === 0) return;
            finish({ title: title.trim(), workspaceRoot: workspaceRoot.trim() });
          }}
        >
          <DialogHeader>
            <DialogTitle>Make into project</DialogTitle>
            <DialogDescription>
              The thread's folder, with any files the agent made, moves to the new project folder.
              The thread continues there.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-title`}>Name</Label>
                <Input
                  id={`${id}-title`}
                  value={title}
                  autoFocus
                  required
                  onChange={(event) => setTitle(event.currentTarget.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-folder`}>Folder</Label>
                <Input
                  id={`${id}-folder`}
                  value={workspaceRoot}
                  required
                  spellCheck={false}
                  onChange={(event) => setFolder(event.currentTarget.value)}
                />
                <p className="text-muted-foreground text-xs">Must not exist yet.</p>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit">Make project</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
