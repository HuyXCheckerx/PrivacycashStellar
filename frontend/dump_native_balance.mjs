import fetch from "node-fetch";
import { xdr } from "@stellar/stellar-sdk";

async function run() {
  const contractId = new xdr.Address("CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4").toScAddress();
  const tokenContract = new xdr.Address("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC").toScAddress();
  
  // Storage key for a token balance is usually a vector of [Symbol("Balance"), Address(user)]
  const key = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("Balance"),
    xdr.ScVal.scvAddress(contractId)
  ]);

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
            contract: tokenContract,
            key: key,
            durability: xdr.ContractDataDurability.persistent()
          })).toXDR("base64")
        ]
      ]
    })
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
run().catch(console.error);
