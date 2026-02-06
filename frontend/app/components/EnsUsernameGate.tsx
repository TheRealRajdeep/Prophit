"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { usePlatformWallet } from "@/lib/hooks/usePlatformWallet";
import { useEnsName } from "@/lib/hooks/useEnsName";
import { fetchEnsStatusForAddress, SetUsernameModal } from "./SetUsernameModal";

/**
 * When the user connects their wallet: if they have an ENS username (on-chain or in DB),
 * we use it for display. If they don't have one, show the SetUsernameModal to prompt
 * them to create one. Uses the same address as the header (platform ?? connected wallet).
 */
export function EnsUsernameGate() {
  const { user } = usePrivy();
  const { platformAddress } = usePlatformWallet();
  const walletAddress = user?.wallet?.address as string | null | undefined;
  const addressForGate = platformAddress ?? walletAddress ?? null;
  const ensNameOnChain = useEnsName(addressForGate);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!addressForGate) {
      setLoading(false);
      return;
    }
    // If they already have an ENS name on-chain, no need to prompt
    if (ensNameOnChain) {
      setShowModal(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEnsStatusForAddress(addressForGate).then((status) => {
      // Show modal when: no user in DB (null) and no ENS on chain
      if (!cancelled && status === null) setShowModal(true);
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [addressForGate, ensNameOnChain]);

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
