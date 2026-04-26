#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, xdr::ToXdr};

#[contract]
pub struct TestContract;

#[contractimpl]
impl TestContract {
    pub fn test(env: Env, addr: Address) -> Bytes {
        addr.to_xdr(&env)
    }
}
