import fetch from "node-fetch";

async function run() {
  const res = await fetch("https://soroban-testnet.stellar.org", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: { hash: "de583f8eba09c33e08785d641ef7e39890b4fb40d1164755caf3e7d6de100dec" }
    })
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
run();
