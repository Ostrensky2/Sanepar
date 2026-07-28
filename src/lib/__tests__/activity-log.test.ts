import { describe, expect, it } from "vitest";
import { mergeActivityLogs, type ActivityLogEntry } from "@/lib/activity-log";

describe("activity-log", () => {
  it("mescla logs locais e da nuvem sem duplicidade ordenando por data mais recente", () => {
    const localLogs: ActivityLogEntry[] = [
      {
        id: "log-1",
        timestamp: "2026-07-28T08:00:00.000Z",
        kind: "login",
        userId: "usr-aline",
        name: "Aline Horodesky",
        email: "aline.horo@yahoo.com.br",
        role: "ATGC",
        target: "/login",
        detail: "Login efetuado",
      },
    ];

    const cloudLogs: ActivityLogEntry[] = [
      {
        id: "log-1",
        timestamp: "2026-07-28T08:00:00.000Z",
        kind: "login",
        userId: "usr-aline",
        name: "Aline Horodesky",
        email: "aline.horo@yahoo.com.br",
        role: "ATGC",
        target: "/login",
        detail: "Login efetuado",
      },
      {
        id: "log-2",
        timestamp: "2026-07-28T09:00:00.000Z",
        kind: "page.view",
        userId: "usr-aline",
        name: "Aline Horodesky",
        email: "aline.horo@yahoo.com.br",
        role: "ATGC",
        target: "/documentos",
        detail: "Navegação",
      },
    ];

    const merged = mergeActivityLogs(cloudLogs, localLogs);

    expect(merged.length).toBe(2);
    expect(merged[0].id).toBe("log-2");
    expect(merged[1].id).toBe("log-1");
  });
});
