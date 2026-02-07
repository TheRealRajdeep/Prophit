"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { usePlatformWallet } from "@/lib/hooks/usePlatformWallet";
import { useEnsName } from "@/lib/hooks/useEnsName";
import { fetchEnsStatusForAddress, SetUsernameModal } from "./SetUsernameModal";

/**
 * When the user connects their wallet: if they have an ENS username (on-chain reverse record)
 * or registered in DB (fallback), we use it. Checks both embedded wallet and connected wallet
 * (e.g. MetaMask) - embedded wallets can differ between localhost and production (different
 * Privy app IDs), so we also check the connected wallet for users who "connect the same wallet".
 */
export function EnsUsernameGate() {
  const { user } = usePrivy();
  const { embeddedWalletAddress } = usePlatformWallet();
  const connectedWalletAddress = user?.wallet?.address as string | null | undefined;
  const addressForGate = embeddedWalletAddress ?? null;
  const { ensName, isLoading } = useEnsName(addressForGate);
  const ensNameConnected = useEnsName(
    connectedWalletAddress && connectedWalletAddress.toLowerCase() !== embeddedWalletAddress?.toLowerCase()
      ? connectedWalletAddress
      : null
  );
  const [showModal, setShowModal] = useState(false);
  const [hasUsernameInDb, setHasUsernameInDb] = useState<boolean | null>(null);
  const [hasUsernameInDbConnected, setHasUsernameInDbConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!addressForGate) {
      setHasUsernameInDb(null);
      return;
    }
    let cancelled = false;
    fetchEnsStatusForAddress(addressForGate).then((status) => {
      if (!cancelled) setHasUsernameInDb(status === "registered");
    });
    return () => {
      cancelled = true;
    };
  }, [addressForGate]);

  useEffect(() => {
    if (!connectedWalletAddress || connectedWalletAddress.toLowerCase() === embeddedWalletAddress?.toLowerCase()) {
      setHasUsernameInDbConnected(null);
      return;
    }
    let cancelled = false;
    fetchEnsStatusForAddress(connectedWalletAddress).then((status) => {
      if (!cancelled) setHasUsernameInDbConnected(status === "registered");
    });
    return () => {
      cancelled = true;
    };
  }, [connectedWalletAddress, embeddedWalletAddress]);

  useEffect(() => {
    if (!addressForGate) return;
    if (isLoading || hasUsernameInDb === null) return;
    const checkingConnected =
      connectedWalletAddress &&
      connectedWalletAddress.toLowerCase() !== embeddedWalletAddress?.toLowerCase();
    if (checkingConnected && (ensNameConnected.isLoading || hasUsernameInDbConnected === null)) return;
    const hasEns = ensName || ensNameConnected.ensName;
    const hasDb = hasUsernameInDb === true || hasUsernameInDbConnected === true;
    setShowModal(!hasEns && !hasDb);
  }, [
    addressForGate,
    ensName,
    ensNameConnected.ensName,
    ensNameConnected.isLoading,
    isLoading,
    hasUsernameInDb,
    hasUsernameInDbConnected,
    connectedWalletAddress,
    embeddedWalletAddress,
  ]);

  const handleClose = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleRegistered = useCallback(() => {
    setShowModal(false);
  }, []);

  if (!showModal || !addressForGate) return null;

  return (
    <SetUsernameModal
      open={showModal}
      onClose={handleClose}
      platformAddress={addressForGate}
      onRegistered={handleRegistered}
    />
  );
}
