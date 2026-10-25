import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { db } from "./lib/db";
beforeEach(async () => {
  await db.items.clear();
  await db.images.clear();
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
