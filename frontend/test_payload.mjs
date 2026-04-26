import { xdr, Address, StrKey } from "@stellar/stellar-sdk";

const token = new Address("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC");

console.log("ScAddress XDR:", token.toScAddress().toXDR().toString("hex"));
console.log("ScVal XDR:", token.toScVal().toXDR().toString("hex"));

// If Soroban `payload.append(&token.to_xdr(&env))` writes the ScAddress or ScVal?
// Usually, it's ScVal. But let's see.
