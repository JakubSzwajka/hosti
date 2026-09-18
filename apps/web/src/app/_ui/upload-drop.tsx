"use client";

import { ARCHIVE_EXTENSIONS, isArchiveName, slugFromFileName } from "@hosti/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatBytes } from "@/app/_ui/format";

/**
 * Putting a bundle in from the browser: drop a `.zip` or a `.tar.gz` anywhere
 * on the catalog, or pick one with `add a bundle`.
 *
 * At rest this is one control beside the collection chips. The form only
 * exists once there is a file to talk about, and the label opens the file
 * picker with no script, so the way in for someone who does not drag is a
 * plain `<label for>` rather than a click handler.
 *
 * It posts to `/upload` with XHR rather than submitting the form, for two
 * reasons the owner can see. A big archive takes a while, and XHR is the only
 * thing that reports how far the bytes have got. And when the server refuses,
 * its own sentence appears here, instead of a redirect that would swallow it.
 */

type Stage =
  | { name: "idle" }
  | { name: "sending"; percent: number }
  | { name: "failed"; message: string }
  | { name: "done"; slug: string; revision: number };

const ACCEPT = ARCHIVE_EXTENSIONS.join(",");

export function UploadDrop({
  token,
  slugs,
  defaultCollection,
}: {
  token: string;
  /** Slugs already in the catalog, so the owner is told before a revision lands. */
  slugs: string[];
  /** The collection this page lists, prefilled so a drop stays where it landed. */
  defaultCollection?: string;
}) {
  const router = useRouter();
  const fieldId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [collection, setCollection] = useState(defaultCollection ?? "");
  const [overWindow, setOverWindow] = useState(false);
  const [stage, setStage] = useState<Stage>({ name: "idle" });

  // Stable, so the window listeners below are registered once: everything it
  // touches is a setter React keeps for the life of the component.
  const take = useCallback((picked: File): void => {
    if (!isArchiveName(picked.name)) {
      setStage({
        name: "failed",
        message: `${picked.name} is not one of ${ARCHIVE_EXTENSIONS.join(", ")}`,
      });
      return;
    }
    setFile(picked);
    setSlug(slugFromFileName(picked.name));
    setTitle("");
    setStage({ name: "idle" });
  }, []);

  // A file dropped anywhere on the page counts. Without these the browser
  // would leave the catalog and open the archive instead.
  useEffect(() => {
    let depth = 0;
    const carriesFile = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const enter = (event: DragEvent) => {
      if (!carriesFile(event)) return;
      depth += 1;
      setOverWindow(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOverWindow(false);
    };
    const over = (event: DragEvent) => {
      if (carriesFile(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      depth = 0;
      setOverWindow(false);
      if (!carriesFile(event)) return;
      event.preventDefault();
      const dropped = event.dataTransfer?.files?.[0];
      if (dropped) take(dropped);
    };

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [take]);

  function clearFile(): void {
    setFile(null);
    setSlug("");
    if (input.current) input.current.value = "";
  }

  function reset(): void {
    clearFile();
    setStage({ name: "idle" });
  }

  function send(event: React.FormEvent): void {
    event.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.set("token", token);
    body.set("slug", slug);
    body.set("title", title);
    body.set("collection", collection);
    body.set("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", "/upload");
    request.upload.addEventListener("progress", (event) => {
      const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : 0;
      setStage({ name: "sending", percent });
    });
    request.addEventListener("error", () =>
      setStage({ name: "failed", message: "The upload never reached the server" }),
    );
    request.addEventListener("load", () => {
      const answer = parse(request.responseText);
      if (request.status === 201 && "revision" in answer) {
        clearFile();
        setStage({ name: "done", slug: answer.bundle, revision: answer.revision });
        // The card and its live preview are drawn on the server, so the grid
        // has to come back from there before the new bundle shows up.
        router.refresh();
        return;
      }
      setStage({
        name: "failed",
        message: "message" in answer ? answer.message : `The server answered ${request.status}`,
      });
    });
    setStage({ name: "sending", percent: 0 });
    request.send(body);
  }

  const existing = slug !== "" && slugs.includes(slug);
  const sending = stage.name === "sending";
  const showPanel = Boolean(file) || overWindow || stage.name !== "idle";

  return (
    <>
      <input
        ref={input}
        className="file-in"
        id={fieldId}
        type="file"
        accept={ACCEPT}
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) take(picked);
        }}
      />
      <label className="btn" htmlFor={fieldId}>
        add a bundle
      </label>
      {showPanel ? (
        <section className="drop" data-over={overWindow ? "" : undefined} aria-label="Add a bundle">
          {overWindow ? <p className="drop-say">let go anywhere on this page</p> : null}
          {file ? (
            <form className="drop-form" onSubmit={send}>
              <p className="drop-file">
                <strong>{file.name}</strong> <span>{formatBytes(file.size)}</span>
              </p>
              <label>
                slug
                <input
                  name="slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  maxLength={64}
                  autoComplete="off"
                  aria-label="bundle slug"
                  required
                />
              </label>
              <label>
                title
                <input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="optional"
                  autoComplete="off"
                  aria-label="bundle title"
                />
              </label>
              <label>
                collection
                <input
                  name="collection"
                  value={collection}
                  onChange={(event) => setCollection(event.target.value)}
                  placeholder="optional"
                  maxLength={64}
                  autoComplete="off"
                  aria-label="bundle collection"
                />
              </label>
              <span className="drop-acts">
                <button className="btn" type="submit" disabled={sending || slug === ""}>
                  {sending ? "uploading" : existing ? "add a revision" : "create bundle"}
                </button>
                <button className="btn" type="button" onClick={reset} disabled={sending}>
                  cancel
                </button>
              </span>
              <p className="drop-verdict" data-existing={existing ? "" : undefined}>
                {existing
                  ? `${slug} is already here, so this lands as its next revision and becomes the one people see.`
                  : `Nothing is called ${slug || "…"} yet, so this creates it, private.`}
              </p>
            </form>
          ) : null}

          {sending ? (
            <p className="drop-progress">
              <progress value={stage.percent} max={100} />
              <span>{stage.percent}% sent</span>
            </p>
          ) : null}
          {stage.name === "failed" ? <p className="error">{stage.message}</p> : null}
          {stage.name === "done" ? (
            <p className="drop-done">
              {stage.slug} is in, at revision {stage.revision}.
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

type Answer = { bundle: string; revision: number } | { message: string } | Record<string, never>;

function parse(text: string): Answer {
  try {
    return JSON.parse(text) as Answer;
  } catch {
    return {};
  }
}
