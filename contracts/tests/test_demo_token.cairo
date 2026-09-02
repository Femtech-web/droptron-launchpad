use droptron_contracts::demo_token::{
    IDroptronDemoTokenDispatcher, IDroptronDemoTokenDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
    stop_cheat_caller_address,
};
use starknet::ContractAddress;

const OWNER_FELT: felt252 = 0x111;
const RECIPIENT_FELT: felt252 = 0x222;
const SPENDER_FELT: felt252 = 0x333;
const SUPPLY: u256 = 1000000000000000000000000;

fn address(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn deploy_token(owner: ContractAddress) -> IDroptronDemoTokenDispatcher {
    let class = declare("DroptronDemoToken").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    owner.serialize(ref calldata);
    SUPPLY.serialize(ref calldata);
    IDroptronDemoTokenDispatcher { contract_address: class.deploy(@calldata).unwrap().0 }
}

#[test]
fn constructor_creates_one_fixed_supply() {
    let owner = address(OWNER_FELT);
    let token = deploy_token(owner);

    assert(token.name() == "Droptron Demo Token", 'BAD_NAME');
    assert(token.symbol() == "DROP", 'BAD_SYMBOL');
    assert(token.decimals() == 18, 'BAD_DECIMALS');
    assert(token.total_supply() == SUPPLY, 'BAD_SUPPLY');
    assert(token.balance_of(owner) == SUPPLY, 'OWNER_NOT_FUNDED');
}

#[test]
fn holder_can_transfer_tokens() {
    let owner = address(OWNER_FELT);
    let recipient = address(RECIPIENT_FELT);
    let token = deploy_token(owner);
    let amount = 25_u256;

    start_cheat_caller_address(token.contract_address, owner);
    assert(token.transfer(recipient, amount), 'TRANSFER_FAILED');
    stop_cheat_caller_address(token.contract_address);

    assert(token.balance_of(owner) == SUPPLY - amount, 'BAD_OWNER_BALANCE');
    assert(token.balance_of(recipient) == amount, 'BAD_RECIPIENT_BALANCE');
}

#[test]
fn approved_spender_uses_and_reduces_allowance() {
    let owner = address(OWNER_FELT);
    let recipient = address(RECIPIENT_FELT);
    let spender = address(SPENDER_FELT);
    let token = deploy_token(owner);
    let approved = 40_u256;
    let spent = 15_u256;

    start_cheat_caller_address(token.contract_address, owner);
    assert(token.approve(spender, approved), 'APPROVE_FAILED');
    stop_cheat_caller_address(token.contract_address);

    start_cheat_caller_address(token.contract_address, spender);
    assert(token.transfer_from(owner, recipient, spent), 'TRANSFER_FROM_FAILED');
    stop_cheat_caller_address(token.contract_address);

    assert(token.allowance(owner, spender) == approved - spent, 'BAD_ALLOWANCE');
    assert(token.balance_of(recipient) == spent, 'BAD_RECIPIENT_BALANCE');
}
