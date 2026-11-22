import { expect,it } from "vitest";
import { captureIndexRows,captureIndexView } from "./index";

it("transcreve cada componente e ficha de alerta sem preencher lacunas nem tocar nas notas",()=>{
  let alerts=0,withoutCard=0,scores=0;
  const rows=captureIndexRows();
  expect(rows).toHaveLength(225);
  for(const raw of rows){
    const view=captureIndexView(raw);
    expect(view.alerts).toHaveLength(raw.alerts.length);
    raw.alerts.forEach((a,i)=>{
      expect(view.alerts[i]).toMatchObject({componentCode:a.componente,domainCode:a.dominio,
        lowSupport:a.motivo==="baixo suporte",ficha:a.ficha});
      alerts++; if(!a.ficha)withoutCard++;
    });
    expect(view.exact.general).toBe(raw.general); scores++;
    for(const d of view.domains){expect(view.exact.domains[d.key]).toBe(raw.scores[d.key]?.score??null);scores++;}
  }
  expect([alerts,withoutCard,scores]).toEqual([411,81,900]);
});
