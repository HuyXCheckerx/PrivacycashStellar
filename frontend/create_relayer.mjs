import { Keypair } from "@stellar/stellar-sdk";
import fetch from "node-fetch";

async function run() {
  const kp = Keypair.random();
  console.log("Relayer Public:", kp.publicKey());
  console.log("Relayer Secret:", kp.secret());

  console.log("Funding via Friendbot...");
  const res = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  if (res.ok) {
    console.log("Successfully funded!");
  } else {
    console.log("Failed to fund:", await res.text());
  }
}
run().catch(console.error);
