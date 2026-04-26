import fetch from "node-fetch";

async function run() {
  const res = await fetch("https://soroban-testnet.stellar.org", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
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
  console.log("Total events:", json.result ? json.result.events.length : 0);
  if(json.result && json.result.events.length > 0) {
     console.log(json.result.events[0]);
  }
}
run();
