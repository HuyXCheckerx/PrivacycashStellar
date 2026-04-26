import asyncio
from stellar_sdk import Server, Network, Keypair, scval
from stellar_sdk.soroban_server import SorobanServer
from stellar_sdk import xdr

async def main():
    server = SorobanServer("https://soroban-testnet.stellar.org")
    stealth_addr = "GDKQ2YMZNCUGN4BWPSACMSAWRX7O4AJXQU2KMXICRZSAUCNQOUFUE"
    contract_id = "CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4"
    
    from stellar_sdk import Address
    key = xdr.ScVal.scvAddress(Address(stealth_addr).to_xdr_sc_address())
        ledger_key = xdr.LedgerKey(
            xdr.LedgerEntryType.CONTRACT_DATA,
            contract_data=xdr.LedgerKeyContractData(
                contract=scval.to_address(contract_id),
                key=key,
                durability=xdr.ContractDataDurability.PERSISTENT
            )
        )
        res = server.get_ledger_entries([ledger_key])
        print(res)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
