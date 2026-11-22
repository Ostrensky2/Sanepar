import { expect,it } from "vitest";
import { CaptureEffectsSummary, orderedCampaignSias } from "../capture-effects-summary";

it("troca a identidade React antes de renderizar o conteúdo da próxima campanha",()=>{
  const first=CaptureEffectsSummary({campaign:3}),next=CaptureEffectsSummary({campaign:1});
  expect(first.key).toBe("3");
  expect(next.key).toBe("1");
  expect(next.type).toBe(first.type);
  expect(next.props.campaign).toBe(1);
  // O estado de sucesso, erro e filtro pertence ao filho com essa chave, não ao pai persistente.
});

it("oferece todos os códigos fornecidos pela campanha em ordem numérica e preserva a entrada", () => {
  const codes = ["112", "11", "2", "11"];
  expect(orderedCampaignSias(codes)).toEqual(["2", "11", "112"]);
  expect(codes).toEqual(["112", "11", "2", "11"]);
  expect(orderedCampaignSias(undefined)).toEqual([]);
});
