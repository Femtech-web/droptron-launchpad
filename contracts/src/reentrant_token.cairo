use starknet::ContractAddress;

#[starknet::interface]
pub trait IReentrantToken<TState> {
    fn mint(ref self: TState, recipient: ContractAddress, amount: u256);
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn configure_attack(
        ref self: TState, launch: ContractAddress, sale_amount: u256, max_payment: u256,
    );
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
}

#[starknet::contract]
pub mod ReentrantToken {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use crate::launch::{IDroptronLaunchDispatcher, IDroptronLaunchDispatcherTrait};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
        attack_launch: ContractAddress,
        attack_sale_amount: u256,
        attack_max_payment: u256,
        attacked: bool,
    }

    #[abi(embed_v0)]
    impl ReentrantTokenImpl of super::IReentrantToken<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.entry((get_caller_address(), spender)).write(amount);
            true
        }

        fn configure_attack(
            ref self: ContractState, launch: ContractAddress, sale_amount: u256, max_payment: u256,
        ) {
            self.attack_launch.write(launch);
            self.attack_sale_amount.write(sale_amount);
            self.attack_max_payment.write(max_payment);
            self.attacked.write(false);
        }

        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            self.transfer_balance(get_caller_address(), recipient, amount);
            true
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            if !self.attacked.read() && self.attack_launch.read().is_non_zero() {
                self.attacked.write(true);
                IDroptronLaunchDispatcher { contract_address: self.attack_launch.read() }
                    .buy_exact_sale(self.attack_sale_amount.read(), self.attack_max_payment.read());
            }

            let spender = get_caller_address();
            if spender != sender {
                let allowance = self.allowances.entry((sender, spender)).read();
                assert(allowance >= amount, 'INSUFFICIENT_ALLOWANCE');
                self.allowances.entry((sender, spender)).write(allowance - amount);
            }
            self.transfer_balance(sender, recipient, amount);
            true
        }

        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn transfer_balance(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) {
            let balance = self.balances.entry(sender).read();
            assert(balance >= amount, 'INSUFFICIENT_BALANCE');
            self.balances.entry(sender).write(balance - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
        }
    }
}
