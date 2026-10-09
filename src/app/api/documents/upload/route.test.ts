import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), sign: vi.fn(), bucket: vi.fn(), info: vi.fn(), upsert: vi.fn(),
  select: vi.fn(), eq: vi.fn(), read: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/supabase-auth", () => ({ getAuthConfiguration: () => ({ secretKey: "unit-test-only-secret" }) }));
vi.mock("@/lib/supabase", () => ({ createOptionalSupabaseClient: () => ({
  storage: { getBucket: mocks.bucket, from: () => ({ createSignedUploadUrl: mocks.sign, info: mocks.info }) },
  from: () => ({ upsert: mocks.upsert, select: mocks.select }),
}) }));
import { POST } from "./route";
const input = { action: "prepare", fileName: "Original.pdf", mimeType: "application/pdf", size: 7, title: "Título original", campaign: "C2", point: "Ponto", type: "Relatórios" };
const request = (body: unknown) => new Request("http://localhost/api/documents/upload", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
async function prepare(extra = {}) { return (await POST(request({ ...input, ...extra }))).json(); }
describe("document upload: authorized ticket and item-only finalize", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ ok: true, session: { userId: "actor-a" } });
    mocks.bucket.mockResolvedValue({ data: { public: false }, error: null });
    mocks.sign.mockResolvedValue({ data: { signedUrl: "https://storage.invalid/upload" }, error: null });
    mocks.info.mockResolvedValue({ data: { size: 7, contentType: "application/pdf" }, error: null });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.read });
    mocks.read.mockImplementation(async () => ({ data: mocks.upsert.mock.calls.at(-1)?.[0], error: null }));
  });
  it.each([7, 5 * 1024 * 1024, 50 * 1024 * 1024])("prepares %i bytes without transporting binary or publishing", async (size) => {
    const ticket = await prepare({ size });
    expect(ticket.receipt).toBeTypeOf("string");
    expect(mocks.sign).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[a-f0-9]{64}\/[a-f0-9-]+\.pdf$/), { upsert: false });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it.each([[0, 400], [50 * 1024 * 1024 + 1, 413]])("rejects invalid size %i before Storage", async (size, status) => {
    expect((await POST(request({ ...input, size }))).status).toBe(status);
    expect(mocks.bucket).not.toHaveBeenCalled();
  });
  it("rejects forbidden MIME", async () => {
    expect((await POST(request({ ...input, mimeType: "text/html" }))).status).toBe(400);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("fails closed for public bucket", async () => {
    mocks.bucket.mockResolvedValue({ data: { public: true } });
    expect((await POST(request(input))).status).toBe(503);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it.each(["prepare", "finalize"])("denies %s before body or Storage", async (action) => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({ error: "denied" }, { status: 403 }) });
    expect((await POST(request({ action }))).status).toBe(403);
    expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), "documents.manage");
    expect(mocks.bucket).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects tampered receipt", async () => {
    const ticket = await prepare();
    expect((await POST(request({ action: "finalize", receipt: "x" + ticket.receipt }))).status).toBe(400);
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it("rejects another actor", async () => {
    const ticket = await prepare();
    mocks.auth.mockResolvedValue({ ok: true, session: { userId: "actor-b" } });
    expect((await POST(request({ action: "finalize", receipt: ticket.receipt }))).status).toBe(403);
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it("rejects expired receipt", async () => {
    const ticket = await prepare();
    const now = vi.spyOn(Date, "now").mockReturnValue(ticket.expires + 1);
    try { expect((await POST(request({ action: "finalize", receipt: ticket.receipt }))).status).toBe(410); }
    finally { now.mockRestore(); }
    expect(mocks.info).not.toHaveBeenCalled();
  });
  it.each([{ size: 8, contentType: "application/pdf" }, { size: 7, contentType: "text/html" }])("requires authoritative matching object %j", async (data) => {
    const ticket = await prepare();
    mocks.info.mockResolvedValue({ data });
    expect((await POST(request({ action: "finalize", receipt: ticket.receipt }))).status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("retries the same item with original metadata, never overwrites a snapshot", async () => {
    const ticket = await prepare();
    const body = { action: "finalize", receipt: ticket.receipt, title: "adulterado", storagePath: "foreign", authorId: "other" };
    const first = await POST(request(body)), second = await POST(request(body));
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect(await first.json()).toEqual(await second.json());
    const [row, options] = mocks.upsert.mock.calls[0];
    expect(row).toMatchObject({ title: input.title, campaign: "C2", original_name: "Original.pdf", size_bytes: 7, source: "storage", storage_bucket: "documents" });
    expect(row).not.toHaveProperty("authorId");
    expect(Array.isArray(row)).toBe(false);
    expect(options).toEqual({ onConflict: "id", ignoreDuplicates: true });
    expect(mocks.upsert.mock.calls[1]).toEqual(mocks.upsert.mock.calls[0]);
  });
  it("keeps object available after uncertain DB failure for same-receipt retry", async () => {
    const ticket = await prepare();
    mocks.upsert.mockResolvedValueOnce({ error: { message: "timeout" } });
    expect((await POST(request({ action: "finalize", receipt: ticket.receipt }))).status).toBe(503);
    expect((await POST(request({ action: "finalize", receipt: ticket.receipt }))).status).toBe(201);
    expect(mocks.upsert.mock.calls[0]).toEqual(mocks.upsert.mock.calls[1]);
  });
  it.each(["title", "storage_path", "size_bytes"])("rejects a conflicting persisted %s without claiming success", async (field) => {
    const ticket = await prepare();
    mocks.read.mockImplementation(async () => ({
      data: { ...mocks.upsert.mock.calls.at(-1)?.[0], [field]: "divergent" }, error: null,
    }));
    const response = await POST(request({ action: "finalize", receipt: ticket.receipt }));
    expect(response.status).toBe(409);
    expect(await response.json()).not.toHaveProperty("document");
    expect(mocks.eq).toHaveBeenCalledWith("id", mocks.upsert.mock.calls[0][0].id);
  });
  it.each([{ data: null, error: { message: "timeout" } }, { data: null, error: null }])("fails closed for uncertain read %j", async (result) => {
    const ticket = await prepare();
    mocks.read.mockResolvedValue(result);
    expect((await POST(request({ action: "finalize", receipt: ticket.receipt }))).status).toBe(503);
  });
  it("classifies thrown read failure as unconfirmed, not success", async () => {
    const ticket = await prepare();
    mocks.read.mockRejectedValue(new Error("connection lost"));
    expect((await POST(request({ action: "finalize", receipt: ticket.receipt }))).status).toBe(503);
  });
  it("confirms two simultaneous identical finalizations against the persisted row", async () => {
    const ticket = await prepare();
    let row: Record<string, unknown> | undefined;
    let release!: () => void;
    const bothInserts = new Promise<void>((resolve) => { release = resolve; });
    let count = 0;
    mocks.upsert.mockImplementation(async (candidate) => {
      row ??= { ...candidate, updated_at: candidate.updated_at.replace("Z", "+00:00") };
      if (++count === 2) release();
      await bothInserts;
      return { error: null };
    });
    mocks.read.mockImplementation(async () => ({ data: row, error: null }));
    const [first, second] = await Promise.all([1, 2].map(() => POST(request({ action: "finalize", receipt: ticket.receipt }))));
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(await first.json()).toEqual(await second.json());
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0]).toEqual(mocks.upsert.mock.calls[1]);
  });
});
