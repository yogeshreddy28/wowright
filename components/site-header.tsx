'use client';
import Link from 'next/link';
import { Menu, ShoppingBag, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { useStore } from './store-provider';
import { BrandLogo } from './brand-logo';
export function SiteHeader() {
  const { items } = useStore();
  const [open, setOpen] = useState(false);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <header className="site-header">
      <BrandLogo />
      <nav aria-label="Primary navigation">
        <Link href="/shop">Shop</Link>
        <Link href="/custom-print">Custom</Link>
        <Link href="/#how-it-works">How It Works</Link>
        <Link href="/about">About</Link>
      </nav>
      <div className="header-actions">
        <button
          className="menu-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X /> : <Menu />}
        </button>
        <Link
          className="header-account"
          href="/account"
          aria-label="My account"
        >
          <UserRound size={19} />
          <span>Account</span>
        </Link>
        <Link
          className="header-cart"
          href="/cart"
          aria-label={`Cart${count ? `, ${count} items` : ''}`}
        >
          <ShoppingBag size={19} />
          <span>Cart</span>
          {count > 0 && <b>{count}</b>}
        </Link>
      </div>
      <nav
        className={`mobile-menu${open ? ' open' : ''}`}
        aria-label="Mobile navigation"
      >
        <Link onClick={() => setOpen(false)} href="/shop">
          Shop
        </Link>
        <Link onClick={() => setOpen(false)} href="/custom-print">
          Create Something Custom
        </Link>
        <Link onClick={() => setOpen(false)} href="/#how-it-works">
          How It Works
        </Link>
        <Link onClick={() => setOpen(false)} href="/account">
          My Account & Orders
        </Link>
        <Link onClick={() => setOpen(false)} href="/about">
          About
        </Link>
        <Link onClick={() => setOpen(false)} href="/contact">
          Contact
        </Link>
      </nav>
    </header>
  );
}
