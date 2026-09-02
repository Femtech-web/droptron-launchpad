import Image from "next/image";
import Link from "next/link";

import styles from "@/app/page.module.css";

function Mark() { return <Image className={styles.mark} src="/brand/zamops-icon.svg" alt="" width={22} height={22} priority />; }
function Arrow() { return <span className={styles.arrow} aria-hidden="true">→</span>; }

export function LandingPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <div className={styles.blurField} aria-hidden="true"><span className={styles.blurOne} /><span className={styles.blurTwo} /><span className={styles.blurThree} /><span className={styles.blurFour} /><span className={styles.blurFive} /></div>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a className={styles.brand} href="#top"><Mark /> droptron</a>
          <div className={styles.navLinks}><a href="#product">Product</a><a href="#privacy">Privacy</a><a href="#teams">For teams</a></div>
          <Link className={styles.navAction} href="/app">Launch app <Arrow /></Link>
        </nav>
      </header>
      <main id="main-content">
        <section className={styles.hero} id="top">
          <p className={styles.eyebrow}>Private token launches on Starknet</p>
          <h1>Launch in public.<br /><span>Participate in private.</span></h1>
          <p>Droptron is the private operating layer for token launches: shielded allocations, confidential distribution, private airdrop claims, and scheduled vesting on STRK20.</p>
          <div><Link className={styles.primary} href="/app">Launch app <Arrow /></Link><a className={styles.secondary} href="#privacy">Understand the privacy model <span>↓</span></a></div>
        </section>
        <section className={styles.statement} id="product">
          <div className={styles.statementVisual} aria-hidden="true"><div className={styles.launchAura} /><div className={styles.launchCard}><span>Public launch</span><strong>Open to the market</strong><i /></div><div className={styles.routeCard}><span>Private allocation route</span><strong>Shielded from entry to claim</strong><div><b /> <i /> <b /> <i /> <b /></div></div></div>
          <div className={styles.statementDetail}><p className={styles.eyebrow}>A private distribution lifecycle</p><h2>A private route for every allocation.</h2><p>Keep the market open while the ownership path stays discreet. Droptron follows a participant from entry through allocation and on to a shielded claim.</p><a href="#privacy">See what stays private <Arrow /></a></div>
        </section>
        <section className={styles.surfaces} aria-labelledby="surfaces-heading">
          <header><p className={styles.eyebrow}>Built around real launch operations</p><h2 id="surfaces-heading">The private layer for a token’s full lifecycle.</h2></header>
          <div className={styles.surfaceGrid}>
            <article><span className={styles.surfaceIcon}>↗</span><h3>Launch participation</h3><p>Let users join a public launch without placing their wallet address beside the allocation they receive.</p><a href="#privacy">Private route <Arrow /></a></article>
            <article><span className={styles.surfaceIcon}>↓</span><h3>Token distribution</h3><p>Deliver team allocations and airdrop entitlements as private notes instead of publishing a recipient list.</p><a href="#privacy">Private delivery <Arrow /></a></article>
            <article><span className={styles.surfaceIcon}>◌</span><h3>Vesting and claims</h3><p>Give holders a simple way to redeem unlocked tranches into shielded balances over time.</p><a href="#privacy">Private claims <Arrow /></a></article>
          </div>
        </section>
        <section className={styles.claims}>
          <div className={styles.claimsVisual} aria-hidden="true"><span /><i /><b /></div>
          <div><p className={styles.eyebrow}>Private entitlement infrastructure</p><h2>Claims that keep the spotlight off the claimant.</h2><p>Droptron turns eligibility into a private entitlement note, not a public wallet-address claim. Once it is unlocked, a holder redeems it through the private route and receives a shielded balance.</p></div>
        </section>
        <section className={styles.production}>
          <header><p className={styles.eyebrow}>Built for real launch operations</p><h2>Privacy belongs in the product,<br />not in the fine print.</h2><p>Droptron is designed around the boundaries users and launch teams need to understand.</p></header>
          <div><article><span>Wallet-held privacy</span><h3>The app never holds a user’s viewing key.</h3><p>Users act through their privacy-enabled wallet. Keys, private notes, and proof generation remain where they belong.</p></article><article><span>Honest transaction surface</span><h3>Public market data stays public.</h3><p>Price, launch activity, and contract configuration remain visible; the participant’s ownership path is what becomes private.</p></article></div>
        </section>
        <section className={styles.privacy} id="privacy">
          <div className={styles.privacyIntro}><p className={styles.eyebrow}>Clear by design</p><h2>Know the boundary before you cross it.</h2><p>Droptron makes the public market surface and the private ownership route legible before a user signs anything.</p><a href="#faq">Read the privacy model <Arrow /></a></div>
          <div className={styles.privacyVisual}><div className={styles.privacyGlow} /><div className={styles.privacyPanel}><header><span>Droptron privacy model</span><i>01</i></header><section><p><b>Private</b><span>Participant identity, entitlement ownership, and shielded balances.</span></p><p><b>Public</b><span>Launch price, market activity, and contract configuration.</span></p></section><footer>Private does not mean invisible. It removes the public link between a participant and their allocation route.</footer></div></div>
        </section>
        <section className={styles.faq} aria-labelledby="faq-heading">
          <header><p className={styles.eyebrow}>Questions, answered plainly</p><h2 id="faq-heading">Privacy should be easy to understand.</h2></header>
          <div className={styles.faqList}>
            <details><summary>Is Droptron a private exchange?<span>+</span></summary><p>No. Launch price and market activity remain public. Droptron makes the participant’s route to an allocation or claim private.</p></details>
            <details><summary>What becomes private?<span>+</span></summary><p>Private actions, entitlement ownership, and shielded balances are not publicly linked to a participant’s wallet address.</p></details>
            <details><summary>Can a launch team use this for vesting and airdrops?<span>+</span></summary><p>Yes. Entitlements can be issued privately and redeemed into shielded balances as an airdrop unlocks or a vesting tranche becomes available.</p></details>
            <details><summary>Who controls the privacy keys?<span>+</span></summary><p>The user does. Droptron is designed for a privacy-enabled wallet, so private notes and viewing keys remain under the user’s control.</p></details>
          </div>
        </section>
        <section className={styles.teams} id="teams"><div><p className={styles.eyebrow}>For launch teams</p><h2>Build a better<br />distribution moment.</h2><p>Bring participation, allocations, airdrops, and vesting into one private launch surface.</p></div><a href="mailto:hello@droptron.app">Talk to Droptron <Arrow /></a></section>
      </main>
      <footer className={styles.footer}><a className={styles.brand} href="#top"><Mark /> droptron</a><p>Private launch infrastructure on Starknet.</p><a href="https://strk20-by-example.org/what-is-strk20" target="_blank" rel="noreferrer">Built with STRK20 ↗</a></footer>
    </div>
  );
}
