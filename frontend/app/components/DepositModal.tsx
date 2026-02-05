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

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
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

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
}

const defaultChain = TRANSFER_CHAINS[0]; // Base Sepolia testnet
const defaultChainId = defaultChain.chain.id;

export function DepositModal({ open, onClose }: DepositModalProps) {
  const { user } = usePrivy();
  const { ensurePlatformWallet } = usePlatformWallet();
  const { usdcBalance, loading, address, refetch } = usePlatformBalance();
  const [copied, setCopied] = useState(false);
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

  if (!open) return null;

  const displayBalance = loading ? "—" : `$${usdcBalance}`;

  return (
    <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="deposit-modal-title">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative mx-auto w-full max-w-md rounded-xl border border-border-default bg-bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 id="deposit-modal-title" className="text-lg font-semibold text-white">
              Transfer Crypto
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
                <img src={selectedToken.iconUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
                        <img src={t.iconUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
                <img src={selectedChain.iconUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain" />
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
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white hover:bg-bg-elevated"
                      >
                        <img src={c.iconUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-contain" />
                        <span className="flex-1">{c.name}</span>
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
      </div>
    </div>
  );
}
