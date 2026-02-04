"use client";

import { usePrivy } from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTransferTokensForChain,
  type TransferTokenId,
  TRANSFER_CHAINS,
  TRANSFER_TOKENS,
} from "@/lib/constants";
import { usePlatformBalance } from "@/lib/hooks/usePlatformBalance";
import { usePlatformWallet } from "@/lib/hooks/usePlatformWallet";

type View = "main" | "transfer-crypto";

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M2 10h20" />
      <path d="M12 15a2 2 0 0 0 2-2 2 2 0 0 0-2-2" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function truncateAddress(address: string) {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
}

const defaultChain = TRANSFER_CHAINS[1]; // Base Sepolia testnet
const defaultChainId = defaultChain.chain.id;

export function DepositModal({ open, onClose }: DepositModalProps) {
  const { user, getAccessToken } = usePrivy();
  const { ensurePlatformWallet } = usePlatformWallet();
  const { usdcBalance, loading, address, refetch } = usePlatformBalance();
  const [view, setView] = useState<View>("main");
  const [copied, setCopied] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState<number>(defaultChainId);
  const [selectedTokenId, setSelectedTokenId] = useState<TransferTokenId>("eth");
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);

  const selectedChain = useMemo(
    () => TRANSFER_CHAINS.find((c) => c.chain.id === selectedChainId) ?? defaultChain,
    [selectedChainId]
  );
  const tokensForChain = useMemo(
    () => getTransferTokensForChain(selectedChainId),
    [selectedChainId]
  );
  const selectedToken = useMemo(
    () =>
      TRANSFER_TOKENS.find((t) => t.id === selectedTokenId) ??
      tokensForChain[0] ??
      TRANSFER_TOKENS[0],
    [selectedTokenId, tokensForChain]
  );
  // When chain changes, if current token isn't on the new chain, switch to first available
  useEffect(() => {
    const list = getTransferTokensForChain(selectedChainId);
    const hasCurrent = list.some((t) => t.id === selectedTokenId);
    if (!hasCurrent && list.length > 0) {
      setSelectedTokenId(list[0].id as TransferTokenId);
    }
  }, [selectedChainId, selectedTokenId, tokensForChain.length]);

  useEffect(() => {
    if (open && user) ensurePlatformWallet();
  }, [open, user, ensurePlatformWallet]);

  // Poll balance while deposit modal is open so it updates after a transfer
  useEffect(() => {
    if (!open || !address) return;
    refetch();
    const interval = setInterval(refetch, 10_000);
    return () => clearInterval(interval);
  }, [open, address, refetch]);

  const handleCopy = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [address]);

  const handleBack = useCallback(() => setView("main"), []);

  const handleDepositWithCard = useCallback(async () => {
    if (!address || !getAccessToken) return;
    setCardLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/onramp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          address,
          email: user?.email?.address,
          redirectUrl: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.open(data.url, "_blank");
        onClose();
      } else if (res.status === 501) {
        window.open("https://docs.privy.io/recipes/react/custom-fiat-onramp", "_blank");
      }
    } finally {
      setCardLoading(false);
    }
  }, [address, getAccessToken, user?.email?.address, onClose]);

  if (!open) return null;

  const displayBalance = loading ? "—" : `$${usdcBalance}`;
  const walletShort = address ? truncateAddress(address) : null;

  return (
    <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="deposit-modal-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative mx-auto w-full max-w-md rounded-xl border border-border-default bg-bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <div className="flex items-center gap-2">
            {view === "transfer-crypto" ? (
              <button
                type="button"
                onClick={handleBack}
                className="rounded p-1.5 text-zinc-400 hover:bg-bg-elevated hover:text-white transition-colors"
                aria-label="Back"
              >
                <BackIcon />
              </button>
            ) : null}
            <h2 id="deposit-modal-title" className="text-lg font-semibold text-white">
              {view === "main" ? "Deposit" : "Transfer Crypto"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-zinc-400 hover:bg-bg-elevated hover:text-white transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {view === "main" ? (
          <>
            <div className="px-4 pt-3 pb-2">
              <p className="text-sm text-text-muted">
                Prophit Balance: <span className="font-semibold text-white">{displayBalance}</span>
              </p>
              <p className="mt-0.5 text-xs text-text-subtle">
                Your platform wallet for making predictions. Transfer funds here from your main wallet or card.
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 pb-4">
              {/* Primary: Platform wallet (for predictions) */}
              {address && (
                <button
                  type="button"
                  className="mb-2 flex w-full items-center gap-3 rounded-lg border border-border-default bg-bg-elevated/50 p-3 text-left transition-colors hover:bg-bg-elevated hover:border-accent/30"
                  onClick={() => setView("transfer-crypto")}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-card text-accent-cyan">
                    <WalletIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">Prophit wallet ({walletShort})</p>
                    <p className="text-sm text-text-muted">{displayBalance} • Instant</p>
                  </div>
                  <span className="text-text-muted">→</span>
                </button>
              )}

              <p className="mb-2 mt-3 text-xs font-medium uppercase tracking-wider text-text-muted">more</p>

              {/* Transfer Crypto */}
              <button
                type="button"
                className="mb-2 flex w-full items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated/50 p-3 text-left transition-colors hover:bg-bg-elevated hover:border-border-default"
                onClick={() => setView("transfer-crypto")}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-card text-white">
                  <LightningIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">Transfer Crypto</p>
                  <p className="text-sm text-text-muted">No limit • Instant</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {TRANSFER_CHAINS.map((c) => (
                    <span key={c.id} className="rounded bg-bg-card px-1.5 py-0.5 text-[10px] text-text-muted">
                      {c.name}
                    </span>
                  ))}
                </div>
              </button>

              {/* Deposit with Card */}
              <button
                type="button"
                className="mb-2 flex w-full items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated/50 p-3 text-left transition-colors hover:bg-bg-elevated hover:border-border-default disabled:opacity-60"
                onClick={handleDepositWithCard}
                disabled={cardLoading || !address}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-card text-white">
                  <CardIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">Deposit with Card</p>
                  <p className="text-sm text-text-muted">
                    {cardLoading ? "Opening…" : "$20,000 • 5 min"}
                  </p>
                </div>
                <span className="rounded bg-bg-card px-2 py-1 text-xs text-text-muted">VISA</span>
              </button>

              {/* Connect Exchange */}
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated/50 p-3 text-left transition-colors hover:bg-bg-elevated hover:border-border-default"
                onClick={() => { }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-card text-white">
                  <LinkIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-white">Connect Exchange</p>
                  <p className="text-sm text-text-muted">No limit • 2 min</p>
                </div>
                <span className="text-xs text-text-muted">Coinbase, Binance, OKX</span>
              </button>
            </div>
          </>
        ) : (
          /* Transfer Crypto view */
          <div className="flex flex-col items-center px-4 py-4">
            <p className="mb-3 w-full text-sm text-text-muted">
              Prophit Balance: <span className="font-semibold text-white">{displayBalance}</span>
            </p>

            <div className="mb-4 w-full grid grid-cols-2 gap-2">
              <div className="relative">
                <label className="mb-1 block text-xs text-text-muted">Token</label>
                <button
                  type="button"
                  onClick={() => {
                    setChainDropdownOpen(false);
                    setTokenDropdownOpen((o) => !o);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-left"
                >
                  <span className="flex-1 text-sm font-medium text-white">{selectedToken.symbol}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted shrink-0">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {tokenDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" aria-hidden onClick={() => setTokenDropdownOpen(false)} />
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-border-default bg-bg-card py-1 shadow-xl">
                      {tokensForChain.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTokenId(t.id as TransferTokenId);
                            setTokenDropdownOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white hover:bg-bg-elevated"
                        >
                          <span className="font-semibold">{t.symbol}</span>
                          {t.id === selectedTokenId && (
                            <span className="ml-auto text-accent-cyan">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="relative">
                <label className="mb-1 block text-xs text-text-muted">Network</label>
                <button
                  type="button"
                  onClick={() => {
                    setTokenDropdownOpen(false);
                    setChainDropdownOpen((o) => !o);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-3 py-2 text-left"
                >
                  <span className="flex-1 text-sm font-medium text-white">{selectedChain.name}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted shrink-0">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {chainDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" aria-hidden onClick={() => setChainDropdownOpen(false)} />
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-border-default bg-bg-card py-1 shadow-xl">
                      {TRANSFER_CHAINS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedChainId(c.chain.id);
                            setChainDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white hover:bg-bg-elevated"
                        >
                          <span>{c.name}</span>
                          {c.chain.id === selectedChainId && (
                            <span className="text-accent-cyan">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {address ? (
              <>
                <p className="mb-2 w-full text-xs text-text-muted">
                  Send <strong className="text-white">{selectedToken.symbol}</strong> on{" "}
                  <strong className="text-white">{selectedChain.name}</strong> to this address.
                  {!selectedToken.isNative && (
                    <span className="mt-1 block text-text-subtle">
                      Only send {selectedToken.symbol} on this network; sending other assets may result in loss.
                    </span>
                  )}
                </p>
                <div className="mb-4 flex w-full justify-center rounded-lg bg-white p-4">
                  <QRCodeSVG value={address} size={200} level="M" bgColor="#ffffff" fgColor="#0c0a1d" includeMargin />
                </div>
                <div className="mb-2 w-full rounded-lg border border-border-default bg-bg-elevated px-3 py-2 font-mono text-sm text-white break-all">
                  {address}
                </div>
                <div className="mb-2 flex w-full items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border-default bg-bg-elevated py-2.5 text-sm font-medium text-white transition-colors hover:bg-bg-card"
                  >
                    <CopyIcon />
                    {copied ? "Copied!" : "Copy address"}
                  </button>
                  {selectedChain.chain.blockExplorers?.default?.url && (
                    <a
                      href={`${selectedChain.chain.blockExplorers.default.url}/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-4 py-2.5 text-sm font-medium text-accent-cyan transition-colors hover:bg-bg-card"
                    >
                      View on {selectedChain.chain.blockExplorers.default.name ?? "Explorer"}
                    </a>
                  )}
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-text-muted">Connect your wallet to see your deposit address.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
