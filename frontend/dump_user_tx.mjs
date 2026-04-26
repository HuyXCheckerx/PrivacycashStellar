import { Horizon, xdr, scValToNative } from "@stellar/stellar-sdk";

async function run() {
  const h = new Horizon.Server("https://horizon-testnet.stellar.org");
  const ops = await h.operations().forTransaction("9a90f2f2600b0f2250bf5c715d0a91c2da901ac1e40a2bb517b0f1cc3898896").call();
  console.log("Operations:", ops.records.length);
  
  if(ops.records.length > 0) {
    const op = ops.records[0];
    // We can't easily parse XDR without the envelope, let's get the transaction
    const tx = await h.transactions().transaction("9a90f2f2600b0f2250bf5c715d0a91c2da901ac1e40a2bb517b0f1cc3898896").call();
    const env = xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, "base64");
    const opXdr = env.v1().tx().operations()[0].body().invokeHostFunctionOp();
    
    const funcName = opXdr.hostFunction().invokeContract().functionName().toString();
    console.log("Function:", funcName);
    
    const args = opXdr.hostFunction().invokeContract().args();
    console.log("Arg 1 (from):", scValToNative(args[0]));
    console.log("Arg 2 (stealth_address):", scValToNative(args[1]));
    
    // Now let's fetch the ledger entry for that stealth address!
    const keyScVal = args[1];
    
    const res = await fetch("https://soroban-testnet.stellar.org", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLedgerEntries",
        params: [
          [
            xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({
              contract: new xdr.Address('CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4').toScAddress(),
              key: keyScVal,
              durability: xdr.ContractDataDurability.persistent()
            })).toXDR("base64")
          ]
        ]
      })
    });
    const resJson = await res.json();
    console.log(JSON.stringify(resJson, null, 2));
  }
}
run().catch(console.error);
