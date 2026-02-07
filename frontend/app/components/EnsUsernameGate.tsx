"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlatformWallet } from "@/lib/hooks/usePlatformWallet";
import { useEnsName } from "@/lib/hooks/useEnsName";
import { fetchEnsStatusForAddress, SetUsernameModal } from "./SetUsernameModal";

/**
 * When the user connects their wallet: if they have an ENS username (on-chain reverse record)
 * or registered in DB (fallback for users before reverse record was set), we use it.
 * If they have neither, show the SetUsernameModal.
 */
export function EnsUsernameGate() {
  const { embeddedWalletAddress } = usePlatformWallet();
  const addressForGate = embeddedWalletAddress ?? null;
  const { ensName, isLoading } = useEnsName(addressForGate);
  const [showModal, setShowModal] = useState(false);
  const [hasUsernameInDb, setHasUsernameInDb] = useState<boolean | null>(null);

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
    if (!addressForGate || isLoading) return;
    // Show modal only when: no ENS name on-chain AND (DB check not done yet OR no username in DB)
    const hasUsername = ensName || (hasUsernameInDb === true);
    setShowModal(!hasUsername);
  }, [addressForGate, ensName, isLoading, hasUsernameInDb]);

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
