import { afterEach, expect, it, vi } from "vitest";
import { readAuthSession, signInWithPassword, signOutAuthSession } from "../auth-ui-client";

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it.each(["logout","login"])("does not reuse a pending session request across %s",async action=>{
  let resolveOld!: (response:Response)=>void;
  const oldSession={userId:"old",name:"Synthetic",email:"old@example.invalid",role:"Admin"};
  const newSession={...oldSession,userId:"new"};
  const fresh=action==="logout"?{session:null}:{session:newSession};
  const fetchMock=vi.fn()
    .mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveOld=resolve;}))
    .mockResolvedValueOnce(Response.json(action==="login"?{session:newSession}:{}))
    .mockResolvedValueOnce(Response.json(fresh));
  vi.stubGlobal("fetch",fetchMock);
  vi.stubGlobal("window",{dispatchEvent:vi.fn()});
  const pending=readAuthSession();
  if(action==="logout") await signOutAuthSession();
  else await signInWithPassword("synthetic@example.invalid","synthetic-only");
  const next=readAuthSession();
  expect(next).not.toBe(pending);
  await expect(next).resolves.toEqual(fresh);
  resolveOld(Response.json({session:oldSession}));
  await pending;
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("retains bounded retries and unavailable without granting access",async()=>{
  vi.useFakeTimers();
  const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:503}));
  vi.stubGlobal("fetch",fetchMock);
  const pending=readAuthSession();
  await vi.runAllTimersAsync();
  await expect(pending).resolves.toEqual({session:null,canSetPassword:false,unavailable:true});
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
