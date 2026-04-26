import fetch from "node-fetch";
import { xdr, Address } from "@stellar/stellar-sdk";

async function run() {
  const res = await fetch("https://soroban-testnet.stellar.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getEvents",
      params: [{
        startLedger: 2220000,
        filters: [
          {
            type: "contract",
            contractIds: ["CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4"]
          }
        ]
      }]
    })
  });
  const json = await res.json();
  
  if (json.result && json.result.events) {
    for (let event of json.result.events) {
      if (event.type !== "contract") continue;
      
      const parsedTopic = xdr.ScVal.fromXDR(event.topic[0], "base64");
      if (parsedTopic.sym().toString() === "stealth") {
        const val = xdr.ScVal.fromXDR(event.value, "base64");
        const map = val.map();
        
        let stealthAddress, ephemeralPubHex, encryptedSeedHex;
        
        for (let entry of map) {
          const key = entry.key().sym().toString();
          if (key === "stealth_address") {
            // Need to correctly parse the address
            stealthAddress = Address.fromScAddress(entry.val().address()).toString();
          }
          if (key === "ephemeral_key") {
            ephemeralPubHex = entry.val().bytes().toString("hex");
          }
          if (key === "encrypted_seed") {
            encryptedSeedHex = entry.val().bytes().toString("hex");
          }
        }
        
        if (stealthAddress === "GAJU6YHY3JM3IRRGYP7TOTNNKW5OJ6LG2WR6PBKGIBFN4V4ZIBXQZ345") {
          console.log("FOUND USER EVENT!");
          console.log("Ephemeral Pub:", ephemeralPubHex);
          console.log("Encrypted Seed:", encryptedSeedHex);
        }
      }
    }
  } else {
    console.log("No events found or error:", json);
  }
}

run().catch(console.error);
