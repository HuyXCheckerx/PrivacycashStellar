import fetch from "node-fetch";

async function run() {
  const res = await fetch("https://horizon-testnet.stellar.org/accounts/CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4");
  const json = await res.json();
  console.log("Contract native XLM balance:", json.balances ? json.balances.find(b=>b.asset_type==="native").balance : "N/A");
}
run();
