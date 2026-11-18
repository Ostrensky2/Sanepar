import { buildCampaignMatrixWorkbook, readMatrixPackage } from "./sia-matrices";

type WorkerJob =
  | { kind: "parse"; args: Parameters<typeof readMatrixPackage> }
  | { kind: "export"; args: Parameters<typeof buildCampaignMatrixWorkbook> };
const channel = self as unknown as { postMessage(value: unknown, transfer?: Transferable[]): void; onmessage: ((event: MessageEvent<WorkerJob>) => void) | null };
channel.onmessage = async ({ data }) => {
  const progress = (message: string) => channel.postMessage({ progress: message });
  try {
    const result = data.kind === "parse"
      ? await readMatrixPackage(data.args[0], progress, data.args[2])
      : await buildCampaignMatrixWorkbook(data.args[0], data.args[1], data.args[2], progress, data.args[4], data.args[5]);
    const bytes: unknown = "bytes" in result ? result.bytes : undefined;
    const buffer = bytes instanceof ArrayBuffer ? bytes : ArrayBuffer.isView(bytes) ? bytes.buffer : undefined;
    channel.postMessage({ result }, buffer instanceof ArrayBuffer ? [buffer] : []);
  } catch (error) { channel.postMessage({ error: error instanceof Error ? error.message : "Processamento local indisponível." }); }
};
