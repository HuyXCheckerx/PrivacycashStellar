import time
import hashlib
import binascii
from nacl.public import PrivateKey, PublicKey
from stellar_sdk.soroban_server import SorobanServer
from stellar_sdk import Server, Keypair, Network, TransactionBuilder, scval

# --- CONFIGURATION ---
CONTRACT_ID = "CAA4CDKB4WDNMP5W7ACCFTNEUMRPISJO2MZ6RBB5Q3F6GNEGSR2C4LJ4"
NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
NETWORK_PASSPHRASE = Network.TESTNET_NETWORK_PASSPHRASE
RPC_URL = "https://soroban-testnet.stellar.org"
HORIZON_URL = "https://horizon-testnet.stellar.org"

server = SorobanServer(RPC_URL)
horizon = Server(HORIZON_URL)

def xor_bytes(a: bytes, b: bytes) -> bytes:
    return bytes(x ^ y for x, y in zip(a, b))

def main():
    print("=== SOROBAN STEALTH PROTOCOL MANUAL TEST ===")
    
    # 1. BOB CREATES META-KEY
    bob_priv = PrivateKey.generate()
    bob_pub_hex = bob_priv.public_key.encode().hex()
    print(f"\n[Bob] Generated Public Meta-Key: {bob_pub_hex}")
    
    # 2. ALICE SETS UP SENDER WALLET
    alice_keypair = Keypair.random()
    print(f"\n[Alice] Created sender wallet: {alice_keypair.public_key}")
    print("[Alice] Funding from Friendbot...")
    import requests
    requests.get(f"https://friendbot.stellar.org/?addr={alice_keypair.public_key}")
    time.sleep(3)
    alice_account = horizon.load_account(alice_keypair.public_key)
    
    # 3. ALICE PERFORMS STEALTH MATH
    print("\n[Alice] Performing Stealth Math...")
    ephemeral_priv = PrivateKey.generate()
    ephemeral_pub = ephemeral_priv.public_key
    
    # ECDH
    bob_nacl_pub = PublicKey(bytes.fromhex(bob_pub_hex))
    # PyNaCl Box/ECDH uses curve25519 scalar multiplication under the hood
    # However, to do pure scalar mult, we can use the private key's exchange method
    from nacl.bindings import crypto_scalarmult
    shared_secret_point = crypto_scalarmult(ephemeral_priv.encode(), bob_nacl_pub.encode())
    
    shared_secret_hash = hashlib.sha256(shared_secret_point).digest()
    
    stealth_keypair = Keypair.random()
    stealth_seed = stealth_keypair.raw_secret_key()
    
    encrypted_seed = xor_bytes(stealth_seed, shared_secret_hash)
    
    print(f"   -> Stealth Address: {stealth_keypair.public_key}")
    print(f"   -> Ephemeral Pub: {ephemeral_pub.encode().hex()}")
    print(f"   -> Encrypted Seed: {encrypted_seed.hex()}")
    
    # 4. ALICE BUILDS SOROBAN DEPOSIT
    amount_stroops = 10 * 10000000 # 10 XLM
    
    print("\n[Alice] Building Soroban Transaction...")
    tx = (
        TransactionBuilder(
            source_account=alice_account,
            network_passphrase=NETWORK_PASSPHRASE,
            base_fee=100
        )
        .append_invoke_contract_function_op(
            contract_id=CONTRACT_ID,
            function_name="deposit",
            parameters=[
                scval.to_address(alice_keypair.public_key),
                scval.to_address(stealth_keypair.public_key),
                scval.to_bytes(ephemeral_pub.encode()),
                scval.to_bytes(encrypted_seed),
                scval.to_address(NATIVE_TOKEN),
                scval.to_int128(amount_stroops)
            ]
        )
        .set_timeout(300)
        .build()
    )
    
    # Simulate
    print("[Alice] Simulating transaction...")
    sim_resp = server.simulate_transaction(tx)
    if sim_resp.error:
        print(f"Simulation failed: {sim_resp.error}")
        return
        
    print("[Alice] Simulation successful. Assembling & Submitting...")
    tx = server.prepare_transaction(tx)
    tx.sign(alice_keypair)
    
    send_resp = server.send_transaction(tx)
    if send_resp.status == "ERROR":
        print(f"Submit failed: {send_resp.errorResultXdr}")
        return
        
    print(f"Transaction pending: {send_resp.hash}")
    
    # Wait for confirmation
    status = "PENDING"
    while status == "PENDING":
        time.sleep(2)
        get_resp = server.get_transaction(send_resp.hash)
        status = get_resp.status
        
    print(f"\n[SUCCESS] Deposit Complete! Transaction Status: {status}")
    print("Bob can now scan the blockchain and claim his XLM!")

if __name__ == "__main__":
    main()
