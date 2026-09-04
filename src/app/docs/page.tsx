import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "Docs — Droptron",
  description: "How Droptron uses STRK20 for private Starknet launches, distributions, airdrops, and vesting.",
};

const contracts = [
  ["STRK20 pool", "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a", "Shielded balances, private transfers, and privacy_invoke"],
  ["Launch participation", "0x05c1ae66fb281ca0451b570bcad29c87cfa4e34b4552aec47ed8bd0a161b995e", "Pool-pinned private purchase route"],
  ["Distribution factory", "0x06bd6c7716abff65de60874e30f644c1dfede3f82ca087e2ccabc09544f3a2d3", "Creates immutable claim-ticket series"],
  ["Claim redemption", "0x018590ba519e985ff0ca35d8ef4132b1d3ac34605dd5c2c123e651eea08d4efe", "Pool-pinned ticket redemption route"],
] as const;

const evidence = [
  ["Private launch participation", "0x00fcb612b93683c76cc75c3db02f2aeaf4fe75cff2768e7b8c8b23c2f01bbd76"],
  ["Atomic private distribution", "0x74bf92804c5729099dfdb7910f1cad1d0eca8925f06aea1a5d08444692eac52"],
  ["Private airdrop redemption", "0x03704277323cacf7c2d3df3d2c710386c8dfa2df08f3633113bee2d262d7e946"],
  ["Two-tranche vesting delivery", "0x1a652a277121078da04388530e5637e5789bdeab41ecabe5f7ff013337d4c52"],
] as const;

function Mark() {
  return <Image src="/brand/droptron-mark.svg" alt="" width={22} height={22} priority />;
}

function Address({ value }: { value: string }) {
  return <a className={styles.address} href={`https://voyager.online/contract/${value}`} target="_blank" rel="noreferrer"><code>{value}</code><span aria-hidden="true">↗</span></a>;
}

export default function DocsPage() {
  return <div className={styles.page}>
    <a className={styles.skip} href="#docs-content">Skip to documentation</a>
    <header className={styles.topbar}>
      <nav aria-label="Documentation navigation">
        <Link className={styles.brand} href="/"><Mark /><span>droptron</span><small>/ docs</small></Link>
        <div className={styles.toplinks}><a href="#workflows">Workflows</a><a href="#privacy">Privacy</a><a href="#contracts">Contracts</a><a href="https://github.com/Femtech-web/droptron-launchpad" target="_blank" rel="noreferrer">GitHub ↗</a></div>
        <Link className={styles.appLink} href="/app">Open app <span>→</span></Link>
      </nav>
    </header>

    <main id="docs-content" className={styles.shell} tabIndex={-1}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Droptron documentation</p>
        <h1>Private launch infrastructure, explained plainly.</h1>
        <p>Droptron combines public Starknet launch contracts with STRK20 shielded balances, private transfers, private claim tickets, and wallet-owned proof generation.</p>
        <div className={styles.status}><span><i />Mainnet product</span><span>Ready wallet</span><span>MIT licensed</span></div>
      </section>

      <div className={styles.docsLayout}>
        <aside className={styles.sidebar} aria-label="On this page">
          <p>On this page</p><a href="#start">Start here</a><a href="#workflows">Product workflows</a><a href="#privacy">Privacy model</a><a href="#strk20">STRK20 integration</a><a href="#architecture">Architecture</a><a href="#security">Security controls</a><a href="#contracts">Contracts</a><a href="#mainnet">Mainnet evidence</a><a href="#local">Run locally</a><a href="#operations">Operational notes</a>
        </aside>

        <article className={styles.content}>
          <section id="start">
            <p className={styles.kicker}>Start here</p><h2>What Droptron does</h2>
            <p>Droptron is a launch and distribution desk for Starknet. Teams can create a token, run a public sale, deliver private allocations, publish private airdrops, and schedule vesting. Participants can join a launch and receive or claim tokens without publishing the wallet-to-allocation link.</p>
            <div className={styles.audienceGrid}><div><span>For participants</span><h3>Discover, participate, claim.</h3><p>Browse launches publicly. Connect a privacy-capable wallet only when an action needs it.</p></div><div><span>For creators</span><h3>Launch, fund, distribute.</h3><p>Use a signed wallet workspace to manage contracts and private recipient delivery.</p></div></div>
          </section>

          <section id="workflows">
            <p className={styles.kicker}>Product workflows</p><h2>Four paths, one private ownership layer</h2>
            <div className={styles.workflowList}>
              <div><b aria-hidden="true" /><span><strong>Private launch participation</strong><p>A public launch exposes price, schedule, and aggregate activity. Payment enters through STRK20 and the purchased allocation returns as a shielded note.</p></span></div>
              <div><b aria-hidden="true" /><span><strong>Private Disperse</strong><p>A creator sends one atomic private batch to registered recipients. No public recipient manifest is placed onchain.</p></span></div>
              <div><b aria-hidden="true" /><span><strong>Private airdrop claims</strong><p>Recipients receive private bearer tickets, discover them through their wallet, and redeem them into shielded token balances.</p></span></div>
              <div><b aria-hidden="true" /><span><strong>Private vesting</strong><p>One campaign contains multiple immutable unlock series. Claims groups them as one schedule while each tranche remains independently redeemable.</p></span></div>
            </div>
          </section>

          <section id="privacy">
            <p className={styles.kicker}>Privacy model</p><h2>Private ownership. Honest public boundaries.</h2>
            <p>Droptron does not describe a public sale as fully confidential. It protects the ownership route while leaving the market and contract state inspectable.</p>
            <div className={styles.boundary}><div><span>Private</span><ul><li>Parties, token, and amount inside private transfers</li><li>Shielded balances and private note ownership</li><li>Airdrop and vesting ticket ownership</li><li>The link between a buyer and their allocation</li></ul></div><div><span>Public</span><ul><li>Launch price, schedule, and aggregate activity</li><li>Contract configuration and deployed addresses</li><li>Shield and unshield address, token, amount, and timing</li><li>Vesting schedule and claim-series terms</li></ul></div></div>
            <aside className={styles.note}><strong>The key boundary</strong><p>Ready owns viewing keys, note discovery, proof generation, and private wallet state. Droptron never receives a viewing key, seed phrase, proof secret, or decrypted note registry.</p></aside>
          </section>

          <section id="strk20">
            <p className={styles.kicker}>STRK20 integration</p><h2>Integrated beyond a private transfer button</h2>
            <p>The product uses the Wallet API for capability detection, shielded balance reads, shielding, unshielding, private transfers, atomic action batches, and <code>privacy_invoke</code> routes into Droptron contracts.</p>
            <ol className={styles.stack}>
              <li><span aria-hidden="true" /><div><strong>Wallet-held privacy state</strong><p>Ready discovers notes and builds proofs through its private wallet environment.</p></div></li>
              <li><span aria-hidden="true" /><div><strong>Live preflight</strong><p>Droptron reads pool fees, checks private balances and recipient registration, and opens a prefilled Shield flow when required.</p></div></li>
              <li><span aria-hidden="true" /><div><strong>Atomic private action</strong><p>The STRK20 pool verifies the action and calls a pool-pinned Droptron helper when public contract execution is needed.</p></div></li>
              <li><span aria-hidden="true" /><div><strong>Shielded output</strong><p>Purchased or redeemed tokens return to the wallet as private notes instead of a public recipient transfer.</p></div></li>
            </ol>
          </section>

          <section id="architecture">
            <p className={styles.kicker}>Architecture</p><h2>Funds stay on Starknet; product context stays offchain</h2>
            <div className={styles.architecture} aria-label="Droptron architecture"><div><small>Browser</small><strong>Droptron interface</strong><p>Terms, preflights, signed creator workspace</p></div><i>→</i><div><small>Wallet</small><strong>Ready + STRK20</strong><p>Keys, notes, proofs, private actions</p></div><i>→</i><div><small>Starknet</small><strong>Pool + Droptron contracts</strong><p>Verification, launches, tickets, redemption</p></div></div>
            <p>Supabase indexes public discovery data and resumable creator drafts. Recipient manifests are removed from ordinary JSON and encrypted server-side with AES-256-GCM. Onchain contracts and wallet state remain authoritative for funds and claims.</p>
          </section>

          <section id="security">
            <p className={styles.kicker}>Security controls</p><h2>Every signature and fund movement has a narrow purpose</h2>
            <p>Creator access starts with a single-use, five-minute Starknet typed-data challenge bound to the site origin, chain, and wallet. Its resulting session cannot move tokens; approvals, shielding, delivery, claims, and settlement remain separate wallet-reviewed transactions.</p>
            <ul className={styles.operations}>
              <li><strong>Wallet-owned custody</strong><span>Ready retains account keys, viewing keys, private notes, and proof generation. Droptron never receives them.</span></li>
              <li><strong>Scoped authorization</strong><span>Creator APIs verify the signed wallet session and recheck deployed ownership and funded state on Starknet before publication.</span></li>
              <li><strong>Limited token authority</strong><span>Approvals use exact amounts and configured spenders. Pool-only helpers, factory allowlists, and allowance cleanup constrain private routes.</span></li>
              <li><strong>Contract accounting</strong><span>Reentrancy locks, checked math, exact balance deltas, caps, collateral reserves, ticket burns, and atomic rollback defend value paths.</span></li>
            </ul>
            <aside className={styles.note}><strong>Review status</strong><p>Seven production Cairo modules received targeted AI-assisted review and 69 tests pass. This is not an independent audit or a guarantee against loss; meaningful-value use still requires external review.</p></aside>
          </section>

          <section id="contracts">
            <p className={styles.kicker}>Mainnet contracts</p><h2>Small, composable contract surface</h2>
            <div className={styles.contracts}>{contracts.map(([name, address, role]) => <div key={address}><span><strong>{name}</strong><small>{role}</small></span><Address value={address} /></div>)}</div>
            <p className={styles.caption}>Droptron also ships fixed-supply token, fixed/linear launch, and funded claim-series classes. Contract code and tests live in <a href="https://github.com/Femtech-web/droptron-launchpad/tree/main/contracts" target="_blank" rel="noreferrer">contracts/ ↗</a>.</p>
          </section>

          <section id="mainnet">
            <p className={styles.kicker}>Mainnet evidence</p><h2>Real flows, deliberately small value</h2>
            <p>These transactions exercise the product’s STRK20 paths on Starknet Mainnet. Each link opens the public transaction record; private note ownership is not revealed by the application.</p>
            <div className={styles.evidence}>{evidence.map(([label, hash]) => <a key={hash} href={`https://voyager.online/tx/${hash}`} target="_blank" rel="noreferrer"><span><i />{label}</span><code>{hash.slice(0, 10)}…{hash.slice(-8)}</code><b>↗</b></a>)}</div>
          </section>

          <section id="local">
            <p className={styles.kicker}>Developer quickstart</p><h2>Run Droptron locally</h2><p>Use Node.js 20+, npm, Scarb 2.20.1, and Starknet Foundry 0.63.0.</p>
            <pre><code>{`git clone https://github.com/Femtech-web/droptron-launchpad.git
cd droptron-launchpad
npm ci
cp .env.example .env.local
npm run dev`}</code></pre>
            <p>For the Cairo package:</p><pre><code>{`cd contracts
scarb build
snforge test`}</code></pre>
            <p>Public chain addresses may use <code>NEXT_PUBLIC_</code> variables. Account private keys, the Supabase secret, and the recipient-manifest encryption key must remain server-only.</p>
          </section>

          <section id="operations">
            <p className={styles.kicker}>Operational notes</p><h2>What users and integrators should know</h2>
            <ul className={styles.operations}>
              <li><strong>Private actions pay the live STRK20 pool fee.</strong><span>Droptron reads it before opening the wallet and calculates token amounts using each ERC-20’s decimals.</span></li>
              <li><strong>New private notes need time to mature.</strong><span>Wait roughly 10 blocks before the next private spend or refresh.</span></li>
              <li><strong>Wallet approval warnings deserve review.</strong><span>Claim-ticket approvals are exact and tranche-scoped; verify the spender and amount rather than accepting blindly.</span></li>
              <li><strong>Reject an identical prompt after success.</strong><span>Ready has sometimes redisplayed a completed private request. Droptron guards against resubmission, but cannot dismiss a request already owned by the wallet window.</span></li>
              <li><strong>Small-value Mainnet only.</strong><span>The contracts have strong local coverage and targeted review, but no independent production audit. Do not use meaningful funds yet.</span></li>
            </ul>
          </section>

          <footer className={styles.docsFooter}><p>Need implementation detail?</p><div><a href="https://github.com/Femtech-web/droptron-launchpad/blob/main/docs/architecture.md" target="_blank" rel="noreferrer">Architecture ↗</a><a href="https://github.com/Femtech-web/droptron-launchpad/blob/main/docs/privacy-model.md" target="_blank" rel="noreferrer">Privacy model ↗</a><a href="https://github.com/Femtech-web/droptron-launchpad/blob/main/docs/security-controls.md" target="_blank" rel="noreferrer">Security controls ↗</a><a href="https://github.com/Femtech-web/droptron-launchpad/blob/main/docs/mainnet-evidence.md" target="_blank" rel="noreferrer">Mainnet evidence ↗</a></div></footer>
        </article>
      </div>
    </main>
  </div>;
}
