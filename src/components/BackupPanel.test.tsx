import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BackupPanel from "./BackupPanel";
import { exportBackup, openRestore } from "../lib/backup";
vi.mock("../lib/backup", () => ({
  exportBackup: vi.fn(),
  openRestore: vi.fn(),
}));
const validate = vi.fn();
const commit = vi.fn();
const close = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  close.mockResolvedValue(undefined);
  vi.mocked(openRestore).mockResolvedValue({ validate, commit, close });
  validate.mockResolvedValue({ total: 2, added: 1, skipped: ["existing-id"] });
  commit.mockResolvedValue({ total: 2, added: 1, skipped: ["existing-id"] });
});
async function choose() {
  const user = userEvent.setup();
  render(<BackupPanel />);
  await user.click(screen.getByText("Backup and restore"));
  await user.upload(
    screen.getByLabelText("Choose backup to validate"),
    new File(["zip"], "backup.zip", { type: "application/zip" }),
  );
  return user;
}
it("shows validation preview and explicit skipped IDs before commit and in the final result", async () => {
  const user = await choose();
  await screen.findByText(/Archive fully validated/);
  expect(commit).not.toHaveBeenCalled();
  expect(screen.getByText(/will be skipped in Merge/)).toBeInTheDocument();
  await user.click(screen.getByText(/Conflicting IDs/));
  expect(screen.getByText("existing-id")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Restore validated backup" }),
  );
  await screen.findByText(/Restore committed/);
  expect(commit).toHaveBeenCalledWith("merge");
  expect(close).toHaveBeenCalledOnce();
  expect(
    screen.getByText("2 archived items. 1 added. 1 existing IDs skipped."),
  ).toBeInTheDocument();
});
it("invalid archives never expose a restore action", async () => {
  validate.mockRejectedValue(new Error("Backup checksum mismatch."));
  await choose();
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("button", { name: "Restore validated backup" }),
  ).not.toBeInTheDocument();
  expect(commit).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
it("keeps a failed commit available for retry and reports storage failure", async () => {
  commit.mockRejectedValueOnce(new DOMException("full", "QuotaExceededError"));
  const user = await choose();
  await screen.findByText(/Archive fully validated/);
  await user.click(
    screen.getByRole("button", { name: "Restore validated backup" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "existing library items are unchanged",
  );
  expect(close).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Restore validated backup" }),
  );
  await screen.findByText(/Restore committed/);
});
it("canceling the preview releases the session without committing", async () => {
  const user = await choose();
  await screen.findByText(/Archive fully validated/);
  await user.click(screen.getByRole("button", { name: "Cancel restore" }));
  await screen.findByText(/Restore canceled/);
  expect(commit).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});
it("shows the unencrypted warning and does not claim failed exports succeeded", async () => {
  vi.mocked(exportBackup).mockRejectedValue(new Error("Export failed"));
  const user = userEvent.setup();
  render(<BackupPanel />);
  await user.click(screen.getByText("Backup and restore"));
  expect(screen.getByText("unencrypted")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Export backup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Export failed");
  expect(screen.queryByText(/Backup file saved/)).not.toBeInTheDocument();
});
