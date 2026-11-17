import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { GoogleAccount, GoogleAuth } from '@/google/auth';
import { messageOf } from '@/lib/errors';
import { useLibrary } from '@/library/library-store-provider';
import { useService } from '@/services';
import { createTransferQueue, sentItems, type TransferQueue, type TransferState } from '@/transfer/queue';

/** Google Drive folder lists are cached under this query key, followed by the account's email. */
export const DRIVE_FOLDERS_KEY = 'drive-folders';

export type SendAuth = { status: 'checking' } | { status: 'signedOut' } | { status: 'signedIn'; account: GoogleAccount };

export type SendSessionState = {
  auth: SendAuth;
  signingIn: boolean;
  error: string | null;
  /** The Drive folder the user picked for this send. */
  folderId: string | null;
  restore(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  chooseFolder(folderId: string): void;
};

function createSendSession(auth: GoogleAuth) {
  return createStore<SendSessionState>()((set) => ({
    auth: { status: 'checking' },
    signingIn: false,
    error: null,
    folderId: null,
    restore: async () => {
      try {
        const account = await auth.restore();
        set({ auth: account ? { status: 'signedIn', account } : { status: 'signedOut' } });
      } catch {
        set({ auth: { status: 'signedOut' } });
      }
    },
    signIn: async () => {
      set({ signingIn: true, error: null });
      try {
        const account = await auth.signIn();
        if (account) set({ auth: { status: 'signedIn', account } });
      } catch (error) {
        set({ error: messageOf(error, 'Couldn’t sign in to Google.') });
      } finally {
        set({ signingIn: false });
      }
    },
    signOut: async () => {
      await auth.signOut();
      set({ auth: { status: 'signedOut' }, folderId: null });
    },
    chooseFolder: (folderId) => set({ folderId }),
  }));
}

type SendSession = {
  session: ReturnType<typeof createSendSession>;
  queue: TransferQueue;
  queryClient: QueryClient;
};

const SendSessionContext = createContext<SendSession | null>(null);

/** Lives as long as the Send modal: the Google account, the chosen folder and the transfer in progress. */
export function SendSessionProvider({ children }: { children: ReactNode }) {
  const googleAuth = useService('googleAuth');
  const drive = useService('drive');
  const exporter = useService('exporter');
  const [value] = useState<SendSession>(() => ({
    session: createSendSession(googleAuth),
    queue: createTransferQueue({ drive, exporter }),
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: 1 } } }),
  }));

  const keepSelected = useLibrary((state) => state.keepSelected);
  useEffect(() => {
    void value.session.getState().restore();
    return () => {
      value.queue.stop();
      // However the modal closes (Done, swipe-down, Cancel), only items that actually reached Drive stay selected,
      // so a follow-up delete can never remove an item that wasn't copied.
      const transfer = value.queue.store.getState();
      if (transfer.items.length > 0) {
        keepSelected(sentItems(transfer).map((item) => item.id));
      }
    };
  }, [value, keepSelected]);

  return (
    <SendSessionContext.Provider value={value}>
      <QueryClientProvider client={value.queryClient}>{children}</QueryClientProvider>
    </SendSessionContext.Provider>
  );
}

function useSendContext() {
  const context = useContext(SendSessionContext);
  if (!context) throw new Error('Send screens must be inside SendSessionProvider');
  return context;
}

export function useSendSession<T>(selector: (state: SendSessionState) => T): T {
  return useStore(useSendContext().session, selector);
}

export function useTransferQueue(): TransferQueue {
  return useSendContext().queue;
}

export function useTransfer<T>(selector: (state: TransferState) => T): T {
  return useStore(useSendContext().queue.store, selector);
}
