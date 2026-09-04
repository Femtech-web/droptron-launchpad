use starknet::ContractAddress;
#[starknet::interface]
pub trait IMockClaimAsset<TState> {
    fn configure(ref self: TState, mode: u8, target: ContractAddress);
}
/// TEST ONLY: short transfers, false approvals and callback attacks.
#[starknet::contract]
pub mod MockClaimAsset {
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use crate::claim_series::{IClaimSeriesDispatcher, IClaimSeriesDispatcherTrait};
    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        mode: u8,
        target: ContractAddress,
    }
    #[constructor]
    fn constructor(ref self: ContractState) { self.balances.entry(111.try_into().unwrap()).write(1000000); }
    #[abi(embed_v0)]
    impl ConfigureImpl of super::IMockClaimAsset<ContractState> {
        fn configure(ref self: ContractState, mode: u8, target: ContractAddress) { self.mode.write(mode); self.target.write(target); }
    }
    #[abi(embed_v0)]
    impl TokenImpl of crate::fixed_supply_token::IDroptronFixedSupplyToken<ContractState> {
        fn name(self: @ContractState) -> ByteArray { "Adversarial fixture" }
        fn symbol(self: @ContractState) -> ByteArray { "TEST" }
        fn decimals(self: @ContractState) -> u8 { if self.mode.read() == 6 { 18 } else { 6 } }
        fn total_supply(self: @ContractState) -> u256 { 1000000 }
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 { self.balances.entry(account).read() }
        fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> u256 { self.allowances.entry((owner, spender)).read() }
        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            if self.mode.read() == 4 { return false; }
            self.allowances.entry((get_caller_address(), spender)).write(amount); true
        }
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            if self.mode.read() == 7 { return true; }
            if self.mode.read() == 5 { return false; }
            if self.mode.read() == 3 {
                IClaimSeriesDispatcher { contract_address: self.target.read() }.redeem(1, recipient);
            }
            self.move_balance(get_caller_address(), recipient, amount, self.mode.read() == 2); true
        }
        fn transfer_from(ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256) -> bool {
            let spender = get_caller_address();
            let allowed = self.allowances.entry((sender, spender)).read();
            assert(allowed >= amount, 'ALLOWANCE');
            self.allowances.entry((sender, spender)).write(allowed - amount);
            self.move_balance(sender, recipient, amount, self.mode.read() == 1); true
        }
    }
    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn move_balance(ref self: ContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256, short: bool) {
            let before = self.balances.entry(sender).read();
            assert(before >= amount, 'BALANCE');
            self.balances.entry(sender).write(before - amount);
            let received = if short { amount - 1 } else { amount };
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + received);
        }
    }
}
