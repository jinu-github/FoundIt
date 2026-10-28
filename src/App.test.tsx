import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db } from "./lib/db";
import { LibrarySearch, type SearchQuery } from "./lib/search";
import type { LibraryItem } from "./lib/types";
import { saveItem } from "./lib/items";
vi.mock("./hooks/use-ocr", () => ({ useOcr: () => "" }));
class SearchWorkerMock {
  index = new LibrarySearch();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null;
  terminated = false;
  postMessage(message: {
    version: number;
    items?: LibraryItem[];
    query: SearchQuery;
  }) {
    if (message.items) this.index.sync(message.items);
    queueMicrotask(() => {
      if (!this.terminated)
        this.onmessage?.({
          data: {
            version: message.version,
            hits: this.index.search(message.query),
          },
        });
    });
  }
  terminate() {
    this.terminated = true;
  }
}
beforeEach(async () => {
  vi.stubGlobal("Worker", SearchWorkerMock);
  await db.items.clear();
  await db.images.clear();
});
it("keeps an unsaved draft when OCR completes and searches the saved result", async () => {
  const item = await saveItem(
    {
      type: "image",
      title: "Image",
      textContent: "Original",
      tags: [],
      url: "",
    },
    new Blob(["x"], { type: "image/png" }),
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => {},
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: /OCR: pending Image Original/i }),
  );
  await user.click(screen.getByRole("button", { name: "Edit item" }));
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "My unsaved title");
  await db.items.update(item.id, {
    ocr: { ...item.ocr!, status: "completed", text: "quartz lighthouse" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Title")).toHaveValue("My unsaved title"),
  );
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("button", { name: "Edit item" });
  expect((await db.items.get(item.id))?.ocr?.text).toBe("quartz lighthouse");
  await user.type(screen.getByRole("searchbox"), "lighthouse");
  expect(
    await screen.findByRole("button", {
      name: /My unsaved title quartz lighthouse/,
    }),
  ).toBeInTheDocument();
});
it("creates, edits, reloads, and deletes a note through the UI", async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  await screen.findByText("A home for your good finds");
  await user.click(screen.getByRole("button", { name: /Add item/ }));
  await user.click(screen.getByRole("button", { name: "note" }));
  await user.type(screen.getByLabelText("Title"), "Reading notes");
  await user.type(screen.getByLabelText("Note"), "Remember chapter three");
  await user.type(screen.getByLabelText(/^Tags/), "books, ideas");
  await user.click(screen.getByRole("button", { name: "Save to library" }));
  await screen.findByRole("button", { name: "Edit item" });
  await user.click(screen.getByRole("button", { name: "Edit item" }));
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Updated reading notes");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("button", { name: "Edit item" });
  view.unmount();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: /Updated reading notes/ }),
  );
  expect(
    within(screen.getByRole("region", { name: "Item details" })).getByText(
      "Remember chapter three",
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await user.click(screen.getByRole("button", { name: "Delete permanently" }));
  await screen.findByText("A home for your good finds");
  expect(await db.items.count()).toBe(0);
});
it("shows storage read failures and lets the user retry", async () => {
  const original = db.items.orderBy.bind(db.items);
  const spy = vi
    .spyOn(db.items, "orderBy")
    .mockImplementationOnce(() => {
      throw new Error("Unavailable");
    })
    .mockImplementation(original);
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to read local storage",
  );
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  spy.mockRestore();
});

it("preserves an unsaved editor draft while a restore adds searchable items", async () => {
  const backup = await import("./lib/backup");
  const added = { total: 1, added: 1, skipped: [] };
  const close = vi.fn(async () => {});
  const spy = vi.spyOn(backup, "openRestore").mockResolvedValue({
    validate: async () => added,
    commit: async () => {
      await saveItem({
        type: "note",
        title: "Restored quartz",
        textContent: "Restored content",
        tags: [],
        url: "",
      });
      return added;
    },
    close,
  });
  await saveItem({
    type: "note",
    title: "Existing note",
    textContent: "Saved content",
    tags: [],
    url: "",
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(
    await screen.findByRole("button", { name: /Existing note Saved content/ }),
  );
  await user.click(screen.getByRole("button", { name: "Edit item" }));
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Unsaved draft");
  await user.click(screen.getByText("Backup and restore"));
  await user.upload(
    screen.getByLabelText("Choose backup to validate"),
    new File(["zip"], "backup.zip", { type: "application/zip" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Restore validated backup" }),
  );
  await screen.findByText(/Restore committed/);
  expect(screen.getByLabelText("Title")).toHaveValue("Unsaved draft");
  await user.type(screen.getByRole("searchbox"), "quartz");
  expect(
    await screen.findByRole("button", { name: /Restored quartz/ }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Title")).toHaveValue("Unsaved draft");
  spy.mockRestore();
});
