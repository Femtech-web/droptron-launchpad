use droptron_contracts::fixed_supply_token::{
    IDroptronFixedSupplyTokenDispatcher, IDroptronFixedSupplyTokenDispatcherTrait,
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

fn metadata(ref calldata: Array<felt252>) {
    'Acme Token'.serialize(ref calldata);
    10_u8.serialize(ref calldata);
    'DROP'.serialize(ref calldata);
    4_u8.serialize(ref calldata);
    18_u8.serialize(ref calldata);
}

fn deploy_token() -> IDroptronFixedSupplyTokenDispatcher {
    let class = declare("DroptronFixedSupplyToken").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    address(OWNER_FELT).serialize(ref calldata);
    SUPPLY.serialize(ref calldata);
    metadata(ref calldata);
    IDroptronFixedSupplyTokenDispatcher { contract_address: class.deploy(@calldata).unwrap().0 }
}

fn invalid_deployment_is_rejected(treasury: ContractAddress, supply: u256) {
    let class = declare("DroptronFixedSupplyToken").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    treasury.serialize(ref calldata);
    supply.serialize(ref calldata);
    metadata(ref calldata);
    assert(class.deploy(@calldata).is_err(), 'INVALID_DEPLOYMENT_ACCEPTED');
}

fn invalid_metadata_is_rejected(name_len: u8, symbol_len: u8, decimals: u8) {
    let class = declare("DroptronFixedSupplyToken").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    address(OWNER_FELT).serialize(ref calldata);
    SUPPLY.serialize(ref calldata);
    'Token'.serialize(ref calldata);
    name_len.serialize(ref calldata);
    'TOKEN'.serialize(ref calldata);
    symbol_len.serialize(ref calldata);
    decimals.serialize(ref calldata);
    assert(class.deploy(@calldata).is_err(), 'INVALID_METADATA_ACCEPTED');
}

#[test]
fn constructor_creates_one_fixed_supply() {
    let owner = address(OWNER_FELT);
    let token = deploy_token();

    assert(token.name() == "Acme Token", 'BAD_NAME');
    assert(token.symbol() == "DROP", 'BAD_SYMBOL');
    assert(token.decimals() == 18, 'BAD_DECIMALS');
    assert(token.total_supply() == SUPPLY, 'BAD_SUPPLY');
    assert(token.balance_of(owner) == SUPPLY, 'TREASURY_NOT_FUNDED');
    assert(token.balance_of(token.contract_address) == 0, 'TOKEN_CONTRACT_FUNDED');
}

#[test]
fn constructor_rejects_zero_treasury() {
    invalid_deployment_is_rejected(address(0), SUPPLY);
}

#[test]
fn constructor_rejects_zero_supply() {
    invalid_deployment_is_rejected(address(OWNER_FELT), 0);
}

#[test]
fn constructor_rejects_an_empty_name() {
    invalid_metadata_is_rejected(0, 5, 18);
}

#[test]
fn constructor_rejects_a_long_symbol() {
    invalid_metadata_is_rejected(5, 11, 18);
}

#[test]
fn constructor_rejects_unsupported_decimals() {
    invalid_metadata_is_rejected(5, 5, 19);
}

#[test]
fn holder_can_transfer_tokens() {
    let owner = address(OWNER_FELT);
    let recipient = address(RECIPIENT_FELT);
    let token = deploy_token();
    let amount = 25_u256;

    start_cheat_caller_address(token.contract_address, owner);
    assert(token.transfer(recipient, amount), 'TRANSFER_FAILED');
    stop_cheat_caller_address(token.contract_address);

    assert(
        token.balance_of(owner) == SUPPLY - amount,
        'BAD_OWNER_BALANCE',
    );
    assert(token.balance_of(recipient) == amount, 'BAD_RECIPIENT_BALANCE');
}

#[test]
fn approved_spender_uses_and_reduces_allowance() {
    let owner = address(OWNER_FELT);
    let recipient = address(RECIPIENT_FELT);
    let spender = address(SPENDER_FELT);
    let token = deploy_token();
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
