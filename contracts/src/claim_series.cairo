use starknet::ContractAddress;

#[derive(Serde, Copy, Drop, Debug, PartialEq)]
pub struct ClaimTerms {
    pub owner: ContractAddress,
    pub underlying: ContractAddress,
    pub decimals: u8,
    pub allocation: u128,
    pub unlock_at: u64,
    // Zero means no expiry (the normal vesting policy).
    pub expires_at: u64,
}

#[starknet::interface]
pub trait IClaimSeries<TState> {
    fn terms(self: @TState) -> ClaimTerms;
    fn is_funded(self: @TState) -> bool;
    fn is_paused(self: @TState) -> bool;
    fn remaining_reserve(self: @TState) -> u256;
    fn fund(ref self: TState);
    fn set_paused(ref self: TState, paused: bool);
    fn redeem(ref self: TState, amount: u128, recipient: ContractAddress);
    fn recover_expired(ref self: TState);
}

/// Unaudited, fully collateralized bearer claim tickets. One raw ticket unit
/// redeems for one raw underlying unit. No upgrades, additional mint or repricing.
/// Private ownership lives in STRK20; public transfers/claims are also possible.
#[starknet::contract]
pub mod DroptronClaimSeries {
    use core::num::traits::Zero;
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use crate::fixed_supply_token::{IDroptronFixedSupplyTokenDispatcher, IDroptronFixedSupplyTokenDispatcherTrait};
    use super::ClaimTerms;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        underlying: ContractAddress,
        decimals: u8,
        allocation: u128,
        unlock_at: u64,
        expires_at: u64,
        funded: bool,
        paused: bool,
        entered: bool,
        reserve: u256,
        supply: u256,
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Transfer: Transfer,
        Approval: Approval,
        Funded: Funded,
        Redeemed: Redeemed,
        PauseChanged: PauseChanged,
        ExpiredRecovered: ExpiredRecovered,
    }
    #[derive(Drop, starknet::Event)]
    struct Transfer { #[key] from: ContractAddress, #[key] to: ContractAddress, value: u256 }
    #[derive(Drop, starknet::Event)]
    struct Approval { #[key] owner: ContractAddress, #[key] spender: ContractAddress, value: u256 }
    #[derive(Drop, starknet::Event)]
    struct Funded { amount: u256 }
    #[derive(Drop, starknet::Event)]
    struct Redeemed { #[key] executor: ContractAddress, recipient: ContractAddress, amount: u128 }
    #[derive(Drop, starknet::Event)]
    struct PauseChanged { paused: bool }
    #[derive(Drop, starknet::Event)]
    struct ExpiredRecovered { amount: u256 }

    #[constructor]
    fn constructor(ref self: ContractState, terms: ClaimTerms) {
        assert(terms.owner.is_non_zero(), 'INVALID_OWNER');
        assert(terms.owner != get_contract_address(), 'INVALID_OWNER');
        assert(terms.underlying.is_non_zero(), 'INVALID_TOKEN');
        assert(terms.underlying != get_contract_address(), 'INVALID_TOKEN');
        assert(terms.allocation > 0, 'ZERO_ALLOCATION');
        assert(terms.decimals <= 18, 'INVALID_DECIMALS');
        assert(terms.expires_at == 0 || terms.expires_at > terms.unlock_at, 'INVALID_WINDOW');
        assert(terms.expires_at == 0 || terms.expires_at > get_block_timestamp(), 'ALREADY_EXPIRED');
        self.owner.write(terms.owner);
        self.underlying.write(terms.underlying);
        self.decimals.write(terms.decimals);
        self.allocation.write(terms.allocation);
        self.unlock_at.write(terms.unlock_at);
        self.expires_at.write(terms.expires_at);
    }

    #[abi(embed_v0)]
    impl ClaimsImpl of super::IClaimSeries<ContractState> {
        fn terms(self: @ContractState) -> ClaimTerms {
            ClaimTerms { owner: self.owner.read(), underlying: self.underlying.read(),
                decimals: self.decimals.read(), allocation: self.allocation.read(),
                unlock_at: self.unlock_at.read(), expires_at: self.expires_at.read() }
        }
        fn is_funded(self: @ContractState) -> bool { self.funded.read() }
        fn is_paused(self: @ContractState) -> bool { self.paused.read() }
        fn remaining_reserve(self: @ContractState) -> u256 { self.reserve.read() }

        fn fund(ref self: ContractState) {
            self.owner_only();
            self.lock();
            assert(!self.funded.read(), 'ALREADY_FUNDED');
            self.not_expired();
            let token = self.token();
            assert(token.decimals() == self.decimals.read(), 'DECIMALS_MISMATCH');
            let here = get_contract_address();
            let before = token.balance_of(here);
            let amount: u256 = self.allocation.read().into();
            assert(token.transfer_from(self.owner.read(), here, amount), 'TRANSFER_FAILED');
            assert(token.balance_of(here) == before + amount, 'FUNDING_MISMATCH');
            self.funded.write(true);
            self.reserve.write(amount);
            self.supply.write(amount);
            self.balances.entry(self.owner.read()).write(amount);
            self.emit(Transfer { from: 0.try_into().unwrap(), to: self.owner.read(), value: amount });
            self.emit(Funded { amount });
            self.entered.write(false);
        }

        fn set_paused(ref self: ContractState, paused: bool) {
            self.owner_only();
            self.lock();
            self.paused.write(paused);
            self.emit(PauseChanged { paused });
            self.entered.write(false);
        }

        fn redeem(ref self: ContractState, amount: u128, recipient: ContractAddress) {
            self.lock();
            assert(self.funded.read(), 'NOT_FUNDED');
            assert(!self.paused.read(), 'CLAIMS_PAUSED');
            assert(get_block_timestamp() >= self.unlock_at.read(), 'TRANCHE_LOCKED');
            self.not_expired();
            assert(amount > 0, 'ZERO_AMOUNT');
            assert(recipient.is_non_zero() && recipient != get_contract_address(), 'INVALID_RECIPIENT');
            let caller = get_caller_address();
            let value: u256 = amount.into();
            let balance = self.balances.entry(caller).read();
            assert(balance >= value, 'INSUFFICIENT_TICKETS');
            assert(self.reserve.read() >= value, 'INSUFFICIENT_RESERVE');
            self.balances.entry(caller).write(balance - value);
            self.supply.write(self.supply.read() - value);
            self.reserve.write(self.reserve.read() - value);
            self.emit(Transfer { from: caller, to: 0.try_into().unwrap(), value });
            self.pay_exact(recipient, value);
            self.emit(Redeemed { executor: caller, recipient, amount });
            self.entered.write(false);
        }

        fn recover_expired(ref self: ContractState) {
            self.owner_only();
            self.lock();
            let expiry = self.expires_at.read();
            assert(expiry != 0 && get_block_timestamp() >= expiry, 'NOT_EXPIRED');
            let amount = self.reserve.read();
            assert(amount > 0, 'NOTHING_TO_RECOVER');
            self.reserve.write(0);
            self.pay_exact(self.owner.read(), amount);
            self.emit(ExpiredRecovered { amount });
            self.entered.write(false);
        }
    }

    #[abi(embed_v0)]
    impl TicketImpl of crate::fixed_supply_token::IDroptronFixedSupplyToken<ContractState> {
        fn name(self: @ContractState) -> ByteArray { "Droptron Claim Ticket" }
        fn symbol(self: @ContractState) -> ByteArray { "DCLAIM" }
        fn decimals(self: @ContractState) -> u8 { self.decimals.read() }
        fn total_supply(self: @ContractState) -> u256 { self.supply.read() }
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 { self.balances.entry(account).read() }
        fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            assert(!self.entered.read(), 'REENTRANCY');
            let owner = get_caller_address();
            self.allowances.entry((owner, spender)).write(amount);
            self.emit(Approval { owner, spender, value: amount });
            true
        }
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            self.move_tickets(get_caller_address(), recipient, amount);
            true
        }
        fn transfer_from(ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256) -> bool {
            assert(!self.entered.read(), 'REENTRANCY');
            let spender = get_caller_address();
            let allowance = self.allowances.entry((sender, spender)).read();
            assert(allowance >= amount, 'INSUFFICIENT_ALLOWANCE');
            self.allowances.entry((sender, spender)).write(allowance - amount);
            self.emit(Approval { owner: sender, spender, value: allowance - amount });
            self.move_tickets(sender, recipient, amount);
            true
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn owner_only(self: @ContractState) { assert(get_caller_address() == self.owner.read(), 'OWNER_ONLY'); }
        fn lock(ref self: ContractState) { assert(!self.entered.read(), 'REENTRANCY'); self.entered.write(true); }
        fn not_expired(self: @ContractState) {
            let expiry = self.expires_at.read();
            assert(expiry == 0 || get_block_timestamp() < expiry, 'CLAIM_EXPIRED');
        }
        fn token(self: @ContractState) -> IDroptronFixedSupplyTokenDispatcher {
            IDroptronFixedSupplyTokenDispatcher { contract_address: self.underlying.read() }
        }
        fn pay_exact(self: @ContractState, recipient: ContractAddress, value: u256) {
            let token = self.token();
            let here = get_contract_address();
            let before = token.balance_of(here);
            let recipient_before = token.balance_of(recipient);
            assert(token.transfer(recipient, value), 'TRANSFER_FAILED');
            assert(token.balance_of(here) + value == before, 'PAYOUT_MISMATCH');
            assert(token.balance_of(recipient) == recipient_before + value, 'PAYOUT_MISMATCH');
            assert(token.balance_of(here) >= self.reserve.read(), 'RESERVE_MISMATCH');
        }
        fn move_tickets(ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256) {
            assert(!self.entered.read(), 'REENTRANCY');
            assert(recipient.is_non_zero() && recipient != get_contract_address(), 'INVALID_RECIPIENT');
            let balance = self.balances.entry(sender).read();
            assert(balance >= amount, 'INSUFFICIENT_TICKETS');
            self.balances.entry(sender).write(balance - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            self.emit(Transfer { from: sender, to: recipient, value: amount });
        }
    }
}
