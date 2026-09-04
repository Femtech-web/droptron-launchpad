# Mainnet evidence

Droptron was exercised on Starknet Mainnet with deliberately small values. The contracts are not independently audited; these transactions demonstrate working integration, not production security certification.

## Core deployments

| Component | Address |
| --- | --- |
| STRK20 pool | [`0x040337…fe812a`](https://voyager.online/contract/0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a) |
| Launch participation helper | [`0x05c1ae…1b995e`](https://voyager.online/contract/0x05c1ae66fb281ca0451b570bcad29c87cfa4e34b4552aec47ed8bd0a161b995e) |
| Distribution factory | [`0x06bd6c…f3a2d3`](https://voyager.online/contract/0x06bd6c7716abff65de60874e30f644c1dfede3f82ca087e2ccabc09544f3a2d3) |
| Claim redemption helper | [`0x018590…d4efe`](https://voyager.online/contract/0x018590ba519e985ff0ca35d8ef4132b1d3ac34605dd5c2c123e651eea08d4efe) |
| DROP Genesis launch | [`0x05031d…052794`](https://voyager.online/contract/0x05031da27a3def65a2ab92247fc81b840a827280625356134ae8c04e2d052794) |

## Product transactions

| Purpose | Transaction | Result |
| --- | --- | --- |
| Deploy DROP Genesis launch | [`0x1b9f6c…f4e8f`](https://voyager.online/tx/0x1b9f6c249d0bc6d675e7eb7b04784558e6237591ddd958b4ac075c0340f4e8f) | Launch contract created |
| Fund launch allocation | [`0x36582e…fa600`](https://voyager.online/tx/0x36582e6064c99eafc761244cf38deced53f94142ea258a6718cf06b4a7fa600) | 1,000 DROP funded |
| Private launch participation | [`0x00fcb6…bbd76`](https://voyager.online/tx/0x00fcb612b93683c76cc75c3db02f2aeaf4fe75cff2768e7b8c8b23c2f01bbd76) | Pool activity, public purchase, shielded output |
| Atomic private Disperse | [`0x74bf92…eac52`](https://voyager.online/tx/0x74bf92804c5729099dfdb7910f1cad1d0eca8925f06aea1a5d08444692eac52) | One private recipient batch |
| Airdrop ticket delivery | [`0x1d621e…e14ef`](https://voyager.online/tx/0x1d621e01eaa408783e7414d212ae086479b275181dd81b16f390f0e146e14ef) | Private claim tickets delivered |
| Airdrop redemption | [`0x037042…7e946`](https://voyager.online/tx/0x03704277323cacf7c2d3df3d2c710386c8dfa2df08f3633113bee2d262d7e946) | Ticket spent, shielded DROP returned |
| Vesting-ticket delivery | [`0x1a652a…d4c52`](https://voyager.online/tx/0x1a652a277121078da04388530e5637e5789bdeab41ecabe5f7ff013337d4c52) | Two tranche tickets delivered and discovered |

## What remains to demonstrate

- Redeem the first vesting tranche after its unlock.
- Redeem the second vesting tranche after its unlock.
- Exercise creator settlement after the launch closes: withdraw proceeds and recover unsold allocation.
- Publish the final hosted demo and demo-video URLs in `strk20.json`.
