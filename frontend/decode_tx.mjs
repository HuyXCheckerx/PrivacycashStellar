import { xdr, rpc } from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-testnet.stellar.org");
const hash = process.argv[2] || "e659355a8208d3f272345bc818cd5db73f82f5566bcd5f6c0694a95e011916f9";

const tx = await server.getTransaction(hash);
console.log("Status:", tx.status);

const meta = tx.resultMetaXdr;
const v = meta.v4 ? meta.v4() : meta.v3();
const diagEvents = v.diagnosticEvents ? v.diagnosticEvents() : v.sorobanMeta?.()?.diagnosticEvents?.() ?? [];

for (const diagEvent of diagEvents) {
  try {
    const event = diagEvent.event();
    const body = event.body().v0();
    const topics = body.topics().map(t => {
      try { return t.sym().toString(); } catch {}
      try { return t.str().toString(); } catch {}
      try { return t.error().code().name; } catch {}
      return "?";
    });
    let data = "?";
    try {
      const d = body.data();
      try { data = d.vec().map(v2 => { try { return v2.str().toString(); } catch { try { return v2.sym().toString(); } catch { return "?"; } } }).join(", "); } catch {}
    } catch {}
    console.log("EVENT:", topics.join(" | "), "->", data);
  } catch (e) {
    console.log("parse err:", e.message);
  }
}
